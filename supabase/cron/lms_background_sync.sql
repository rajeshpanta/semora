-- ============================================================
-- SEMORA LMS BACKGROUND SYNC + RETENTION (pg_cron)
-- ============================================================
-- STATUS: the sync job ALREADY EXISTS in production as
--   'semora-lms-background-sync' (every 15 minutes, limit 20). This file
--   re-schedules it with the Phase 0 settings and adds the retention job.
--   cron.schedule() upserts by name, so re-running this is idempotent and does
--   not create a duplicate job.
--
-- Nothing here changes what a sync DOES. It changes how many run at once, how
-- often a connection re-arms, and how long the run log is kept.
--
-- ─── Why the numbers changed ────────────────────────────────
-- The worker is a fixed-rate cron: 96 runs/day, `limit` connections per run.
-- Capacity is therefore 96 x limit connection-syncs/day, and each connection's
-- demand is 24 / interval_hours. Before Phase 0:
--
--   96 x 20 = 1,920/day capacity, 24/day demand  ->  saturates at ~80 connections
--
-- Production sat at 29 and the LMS activation work is meant to increase that
-- deliberately. Past saturation nothing errors — the due queue drains slower
-- than it fills and every student's deadlines quietly go stale.
--
-- Three changes, each measured rather than guessed:
--
--   1. limit 20 -> 60.  Only safe because the worker's loop is now bounded-
--      concurrent (6 at a time) instead of sequential. Production sync
--      durations are p50 1.9s / p95 5.3s, so a sequential batch of 20 already
--      ran ~106s against this job's 120s timeout — the old limit was pinned by
--      wall-clock, not by database load. At 6-way concurrency a p95 batch of
--      60 takes ~53s.
--   2. Calendar-feed interval 1h -> 3h (in the edge function). What this sync
--      catches is an instructor moving a due date, which happens over days.
--   3. Dormant connections (no app activity in 21 days) drop to 24h, and
--      lms_wake_returning_connections() pulls them back the moment the student
--      reopens Semora.
--
--   96 x 60 = 5,760/day capacity, 8/day demand  ->  ~720 active connections
--
-- That is ~9x the previous ceiling, from one config change and one loop. It is
-- deliberately not more: sizing for 100k connections today would mean building
-- a queue this product does not need yet.
--
-- ─── The wake step ──────────────────────────────────────────
-- Runs BEFORE the worker, in the same job, so a returning student's connection
-- is already due by the time the batch is selected — they get fresh deadlines
-- on the first run after they come back rather than up to a day later.
--
-- It has to be server-side: components/LmsSyncBridge.tsx only foreground-syncs
-- connections holding a device-local credential, and calendar-feed connections
-- delete theirs when background sync is enabled. All 29 production connections
-- are calendar feeds, so none of them are reachable from the app.
-- ============================================================

select cron.schedule(
  'semora-lms-background-sync',
  -- Unchanged: every 15 minutes, offset off the hour so it never contends with
  -- the on-the-hour jobs.
  '2,17,32,47 * * * *',
  $$
  do $inner$
  begin
    -- Bring back anyone who has just returned. Only ever moves a sync earlier;
    -- never disables one, never touches a connection that is already due.
    perform public.lms_wake_returning_connections();

    perform net.http_post(
      url := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/lms-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-semora-lms-cron-secret', (
          select decrypted_secret from vault.decrypted_secrets where name = 'semora_lms_cron_secret'
        )
      ),
      body := jsonb_build_object('action', 'background', 'limit', 60),
      timeout_milliseconds := 120000
    );
  end
  $inner$;
  $$
);

-- ─── Retention ──────────────────────────────────────────────
-- lms_sync_runs gains a row per connection per sync and had never been pruned.
-- Daily, off-peak. See migration 106 for exactly what is and is not deleted:
-- the latest 20 runs per connection are kept regardless of age, unfinished runs
-- are never touched, and failures are kept four times longer than successes.
select cron.schedule(
  'semora-purge-lms-sync-runs',
  -- 03:40 daily, in cron.timezone (GMT on this project). Clear of the 03:20
  -- support-request sweep so the two never overlap.
  '40 3 * * *',
  $$select public.purge_lms_sync_runs()$$
);
