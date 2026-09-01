-- ============================================================
-- SEMORA (106): LMS SYNC CAPACITY, DORMANCY AND RETENTION
-- ============================================================
-- Phase 0 of the LMS activation work. NOTHING here is user-facing, and nothing
-- here touches entitlements, app_promos, paywalls or a single row of student
-- data. It exists so that deliberately increasing LMS adoption cannot quietly
-- make active students' deadlines stale.
--
-- ─── The problem, measured ──────────────────────────────────
-- The background worker is a fixed-rate cron (every 15 minutes, 96 runs/day)
-- that processes at most `limit` connections per run. Calendar-feed
-- connections re-arm themselves one hour after a successful sync, so each one
-- wants 24 syncs/day.
--
--   capacity   = 96 runs/day x 20 per run = 1,920 connection-syncs/day
--   demand     = 24/day per calendar-feed connection
--   saturation = 1,920 / 24 = ~80 connections
--
-- Production is at 29. Nothing fails at saturation — the due queue simply
-- drains slower than it fills, every connection's effective interval stretches,
-- and the only symptom is a deadline that updates late. That is the worst
-- shape a capacity problem can take, because no alert fires.
--
-- ─── Why the batch limit alone could not fix it ─────────────
-- Measured over the last 7 days of production sync runs:
--
--   p50 1,912ms   p95 5,325ms   max 20,071ms
--
-- The worker's loop is sequential, and the cron's http_post timeout is 120s.
-- At the current limit of 20 a p95 batch already takes ~106s. Raising the limit
-- without changing the loop would not add capacity; it would add timeouts, and
-- a timed-out batch leaves connections marked 'syncing' until the next run.
-- The concurrency change that makes a larger batch safe lives in the edge
-- function; this migration supplies the two pieces that belong in the database.
--
-- ─── What this migration adds ───────────────────────────────
--   1. lms_wake_returning_connections() — brings a dormant connection's next
--      sync forward the moment its student comes back.
--   2. purge_lms_sync_runs() — bounded retention for operational history.
--
-- Both are SECURITY DEFINER, service-role/cron only, and neither can touch
-- courses, tasks, links, credentials, semesters, grades or entitlements.
-- ============================================================

-- ─── 1. Reactivation ────────────────────────────────────────
--
-- Dormant connections are scheduled far out by the worker (see the edge
-- function). Left alone, a student who returns after a month would keep that
-- long interval until it next elapsed, which would make coming back feel
-- broken — exactly the outcome dormancy handling must not cause.
--
-- The obvious place to fix this is the app's own foreground sync. It cannot be:
-- components/LmsSyncBridge.tsx skips any connection without a DEVICE-LOCAL
-- credential, and calendar-feed connections delete that credential the moment
-- background sync is enabled (lib/lms.ts). Every calendar-feed connection in
-- production — all 29 — is therefore invisible to the foreground path and
-- depends entirely on this worker. Reactivation has to be server-side.
--
-- The signal is the student's own analytics activity, which is written on every
-- app open and carries a user_id stamped by the database from the JWT. This
-- deliberately only ever moves a sync EARLIER. It cannot delay one, cannot
-- disable one, and cannot touch a connection that is already due.
create or replace function public.lms_wake_returning_connections()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  woken integer;
begin
  -- NO auth.role() check, deliberately. These run from pg_cron, where there is
  -- no PostgREST request and auth.role() is NULL — the in-body guard that
  -- apply_lms_assignment_sync_service uses would make this function raise on
  -- every scheduled run. The guard is the ACL below (revoke from public/anon/
  -- authenticated, grant to service_role), which is exactly how the other
  -- cron-called function on this project, purge_old_support_requests (064),
  -- is protected.
  with returning_users as (
    -- Active in the last 30 minutes: comfortably wider than the 15-minute cron
    -- so a return is never missed between runs, narrow enough that this stays a
    -- small indexed scan.
    select distinct user_id
    from public.analytics_events
    where app_name like 'semora%'
      and user_id is not null
      and created_at > now() - interval '30 minutes'
  )
  update public.lms_connections c
     set next_background_sync_at = now()
    from returning_users r
   where c.user_id = r.user_id
     and c.sync_enabled
     and c.background_sync_enabled
     -- Only a connection parked further out than a normal cadence. A healthy,
     -- soon-due connection is left exactly as the worker scheduled it.
     and c.next_background_sync_at > now() + interval '4 hours';

  get diagnostics woken = row_count;
  return woken;
end;
$$;

revoke all on function public.lms_wake_returning_connections() from public, anon, authenticated;
grant execute on function public.lms_wake_returning_connections() to service_role;

comment on function public.lms_wake_returning_connections() is
  'SEMORA (106): pulls a dormant LMS connection''s next background sync forward when its student reopens the app. Calendar-feed connections hold no device credential, so the in-app foreground sync (LmsSyncBridge) never covers them — this is their only reactivation path. Only ever moves a sync earlier.';

-- ─── 1b. Who is still using Semora ──────────────────────────
--
-- The worker needs one bit per connection: has this student opened Semora
-- lately. Asking PostgREST for it directly would mean selecting every matching
-- analytics row and de-duplicating in the edge function — for a batch of 60
-- students over a 21-day window that is tens of thousands of rows crossing the
-- wire to compute a set of at most 60 booleans. DISTINCT belongs in the
-- database.
--
-- Returns only ids that were passed in, so it cannot be used to enumerate the
-- user base, and it exposes nothing about a user beyond "was active".
create or replace function public.lms_active_user_ids(
  p_user_ids uuid[],
  p_days integer default 21
)
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select distinct e.user_id
  from public.analytics_events e
  where e.user_id = any(p_user_ids)
    and e.app_name like 'semora%'
    and e.created_at > now() - make_interval(days => greatest(p_days, 1));
$$;

revoke all on function public.lms_active_user_ids(uuid[], integer) from public, anon, authenticated;
grant execute on function public.lms_active_user_ids(uuid[], integer) to service_role;

comment on function public.lms_active_user_ids(uuid[], integer) is
  'SEMORA (106): of the given users, which have opened Semora within p_days. Used by the LMS background worker to decide sync cadence. Server-side DISTINCT so a batch costs one small indexed scan instead of shipping every analytics row to the edge function.';

-- ─── 2. Retention ───────────────────────────────────────────
--
-- lms_sync_runs grows by one row per connection per sync — roughly 24/day each
-- today, and it has never been pruned. It is operational history, not state:
-- everything a sync needs to know about itself lives on lms_connections
-- (last_sync_status, last_successful_sync_at, consecutive_sync_failures,
-- next_background_sync_at). Nothing reads an old run for correctness.
--
-- The one consumer is lib/lms.ts listLmsSyncRuns(), which reads the latest 12
-- for a connection. So the floor here is per-connection, not global: keep the
-- most recent 20 runs for every connection NO MATTER HOW OLD, and additionally
-- keep anything inside the retention window. A connection that synced twice in
-- March still shows its history; a connection syncing hourly stops accumulating
-- a year of noise.
--
-- Failures are kept longer than successes on purpose. A success older than the
-- window explains nothing; a failure is the thing someone will want to read in
-- a fortnight when a student reports that their deadlines stopped moving.
create or replace function public.purge_lms_sync_runs(
  p_success_days integer default 14,
  p_failure_days integer default 60,
  p_keep_per_connection integer default 20
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  -- See lms_wake_returning_connections above: cron has no auth.role(), so the
  -- ACL is the guard.
  with ranked as (
    select id, status, started_at,
           row_number() over (partition by connection_id order by started_at desc) as recency
    from public.lms_sync_runs
  )
  delete from public.lms_sync_runs r
   using ranked
   where r.id = ranked.id
     -- Never touch a connection's most recent runs, whatever their age.
     and ranked.recency > greatest(p_keep_per_connection, 1)
     -- Never touch a run that has not finished: an in-flight or stuck run is
     -- exactly what a diagnostic query needs to find.
     and r.finished_at is not null
     and case
           when r.status in ('success', 'partial')
             then r.started_at < now() - make_interval(days => greatest(p_success_days, 1))
           else r.started_at < now() - make_interval(days => greatest(p_failure_days, 1))
         end;

  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.purge_lms_sync_runs(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.purge_lms_sync_runs(integer, integer, integer) to service_role;

comment on function public.purge_lms_sync_runs(integer, integer, integer) is
  'SEMORA (106): bounded retention for lms_sync_runs. Always keeps the latest N runs per connection regardless of age (the settings screen reads 12), keeps failures longer than successes, and never deletes an unfinished run. Operational history only — no connection state lives here.';

-- ─── 3. Index support ───────────────────────────────────────
-- The wake query filters on (user_id, created_at) over a table that also
-- carries the Citizen app's rows. The existing analytics indexes lead with
-- app_name or event_name, so neither serves this shape.
create index if not exists analytics_events_user_recent_idx
  on public.analytics_events (user_id, created_at desc)
  where user_id is not null;

-- The purge ranks by (connection_id, started_at desc), which
-- lms_sync_runs_connection_started_idx (053) already serves. No new index.
