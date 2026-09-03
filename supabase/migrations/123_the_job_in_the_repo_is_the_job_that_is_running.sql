-- ============================================================
-- SEMORA (123): THE JOB IN THE REPO IS THE JOB THAT IS RUNNING
-- ============================================================
-- Two definitions of semora-lms-background-sync exist, and the wrong one is
-- the one a fresh environment would get.
--
--   supabase/migrations/063  ->  limit 20, no wake step, plain http_post
--   supabase/cron/lms_background_sync.sql  ->  limit 60, wake step first
--
-- Production is running the second. It was applied by hand, out of band, and
-- nothing in the migration history records that it happened — so replaying
-- migrations into a new project produces a worker with a THIRD of the intended
-- capacity that never reactivates a returning student's connection, and no
-- diff anywhere would show it. The same is true of any restore-from-migrations
-- recovery of this project.
--
-- This migration makes the tracked history match production. cron.schedule()
-- upserts by name, so on THIS project it rewrites the job with a definition
-- that is byte-for-byte what is already there (verified by md5 before writing
-- this file: ae48bd78754929911e6222f6137022e0, 710 bytes). Nothing about the
-- running system changes. On a fresh project it is the difference between a
-- correct worker and a quietly crippled one.
--
-- The body below is copied verbatim from supabase/cron/lms_background_sync.sql
-- rather than retyped, because "almost identical" would defeat the point. That
-- file keeps its explanation of WHY the numbers are what they are; this is the
-- part that has to be executable and tracked.
-- ============================================================

select cron.schedule(
  'semora-lms-background-sync',
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

-- Retention, for the same reason: also scheduled out of band, also absent from
-- the migration history. Its behaviour is defined in 106.
select cron.schedule(
  'semora-purge-lms-sync-runs',
  '40 3 * * *',
  $$select public.purge_lms_sync_runs()$$
);
