-- ============================================================
-- SEMORA (126): FRESHER FOR THE STUDENTS ACTUALLY IN A TERM
-- ============================================================
-- Calendar feeds re-arm every three hours for everyone who is not dormant.
-- That number was chosen when the worker's capacity was the binding
-- constraint: a fixed-rate cron of 96 runs/day could only hold an hourly
-- interval up to ~80 connections, and past that everyone silently degraded.
--
-- Measured now, after the batch limit went to 60:
--
--   capacity     96 runs/day x 60 per run = 5,760 connection-syncs/day
--   actual       284 syncs in the last 24 hours
--   utilisation  4.9%
--
-- The constraint that justified three hours is not currently binding, by a
-- factor of twenty. And the students it costs are the ones using Semora right
-- now, inside a term that is running: for them "your instructor moved this
-- deadline" is worth knowing in an hour rather than three.
--
-- ─── WHO GETS THE FASTER CADENCE ────────────────────────────
-- Deliberately narrow. Both conditions must hold:
--
--   1. the student opened Semora in the last 24 hours, and
--   2. they have a semester whose dates contain today.
--
-- Neither alone is enough. Someone active in July with no running term does
-- not need hourly Canvas polling, and someone with a live term who has not
-- opened the app in a fortnight is not waiting on anything. Together they
-- describe exactly one person: a student in the middle of their semester, using
-- the app.
--
-- Today that is at most 16 of 37 connections, so the worst case is
-- 16 x 24 = 384 syncs/day where they currently make 128 — a rise from 4.9% to
-- roughly 9% of capacity. The 3-hour and 24-hour tiers are untouched, so
-- nobody's cadence gets worse and the headroom that made three hours necessary
-- in the first place is still there if adoption grows.
--
-- ─── ONE QUERY FOR THE WHOLE BATCH ──────────────────────────
-- Same shape as lms_active_user_ids (106), and for the same reason: this runs
-- in the worker's hot path, so asking per connection would add a round trip to
-- every sync to answer a question that changes once a day. Returns only ids
-- that were passed in, so it cannot enumerate the user base.
-- ============================================================

create or replace function public.lms_fresh_sync_user_ids(
  p_user_ids uuid[],
  p_hours integer default 24
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
    and e.created_at > now() - make_interval(hours => greatest(p_hours, 1))
    and exists (
      select 1 from public.semesters s
      where s.user_id = e.user_id
        and s.start_date is not null
        and s.end_date is not null
        and current_date between s.start_date and s.end_date
    );
$$;

revoke all on function public.lms_fresh_sync_user_ids(uuid[], integer) from public, anon, authenticated;
grant execute on function public.lms_fresh_sync_user_ids(uuid[], integer) to service_role;

comment on function public.lms_fresh_sync_user_ids(uuid[], integer) is
  'SEMORA (126): of the given users, which are BOTH recently active AND inside a '
  'running semester — the cohort that gets the faster Canvas cadence. Both '
  'conditions are required: activity without a live term does not need hourly '
  'polling, and a live term without activity is nobody waiting. Batched like '
  'lms_active_user_ids so the worker asks once per run, not once per connection.';
