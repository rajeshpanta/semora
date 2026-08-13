-- ============================================================
-- SEMORA SUPPORT REQUEST RETENTION (pg_cron)
-- ============================================================
-- STATUS: NOT YET SCHEDULED. Run this once against the project to turn the
--   retention window in migration 064 into something that actually happens.
--
-- public.support_requests holds third-party personal data — a stranger's name,
-- their email address, and whatever they typed, which in practice includes
-- course names, university details and the occasional screenshot described in
-- prose. Correspondence, not analytics. Nothing here needs to live for years.
--
-- WHAT IT DELETES: only requests whose `handled_at` is set and older than 180
-- days. An unanswered request is never touched by this job, however old it is
-- — the failure mode of a retention sweep must never be "your inbox got
-- emptied for you".
--
-- Weekly is deliberate. The volume is tiny and a daily job would be pure noise
-- in the cron history for a table that gains a handful of rows a week.
--
-- Prerequisite: `create extension if not exists pg_cron;` (already enabled on
-- this project for the push jobs — see reengagement_push.sql).
-- ============================================================

select cron.schedule(
  'purge-support-requests',
  -- 03:20 on Sundays, in cron.timezone (GMT on this project).
  '20 3 * * 0',
  $$select public.purge_old_support_requests()$$
);

-- ── Verify ──────────────────────────────────────────────────
-- select jobid, jobname, schedule, active from cron.job
--   where jobname = 'purge-support-requests';
--
-- Run it by hand once to confirm it is wired up (returns the row count, which
-- will be 0 until there is answered history older than the window):
-- select public.purge_old_support_requests();
--
-- ── Unschedule ──────────────────────────────────────────────
-- select cron.unschedule('purge-support-requests');
