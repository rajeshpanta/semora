-- ============================================================
-- SEMORA RE-ENGAGEMENT PUSH — weekly deadline digest (pg_cron)
-- ============================================================
-- This is the server-side re-engagement channel: a scheduled job that pushes a
-- "you have deadlines this week" nudge to users with upcoming work, even if
-- they never open the app (local reminders can't reach a closed app).
--
-- PREREQUISITE — DO THIS FIRST (only Apple interactive auth can):
--   Push will NOT deliver until an APNs key is attached in EAS/Expo:
--     eas credentials   (iOS → Push Notifications → set up a new key)
--   and the app is built with aps-environment=production. Until then this job
--   runs harmlessly but delivers nothing.
--
-- RUN THIS FILE ONCE, in the Supabase SQL editor (needs elevated privileges to
-- enable extensions + create a Vault secret). It is intentionally NOT a
-- numbered migration, so `supabase db push` never auto-runs it.
-- ============================================================

-- 1. Extensions (Dashboard → Database → Extensions also works)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Store the shared secret the send-push function expects, in Vault, so it
--    never sits in the cron job body as plaintext. REPLACE the placeholder
--    with the PUSH_SEND_SECRET value (the one set via `supabase secrets set`).
--    Run once:
--
--    select vault.create_secret('REPLACE_WITH_PUSH_SEND_SECRET', 'push_send_secret');

-- 3. Schedule the weekly digest — Sundays 17:00 UTC.
--    Sends one bulk push to every user who has >=1 incomplete task due in the
--    next 7 days. (send-push takes one shared title/body for the whole batch,
--    so the copy is generic; personalization would require per-user calls.)
select cron.schedule(
  'semora-weekly-deadline-digest',
  '0 17 * * 0',
  $job$
  select net.http_post(
    url     := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'push_send_secret'
      )
    ),
    body := jsonb_build_object(
      'user_ids', (
        select coalesce(jsonb_agg(user_id), '[]'::jsonb)
        from (
          select t.user_id
          from public.tasks t
          where t.is_completed = false
            and t.due_date >= current_date
            and t.due_date < current_date + interval '7 days'
          group by t.user_id
        ) s
      ),
      'title', 'Your week ahead',
      'body',  'You have deadlines coming up this week — open Semora to plan them.',
      'data',  jsonb_build_object('type', 'weekly_digest')
    )
  );
  $job$
);

-- To remove later:  select cron.unschedule('semora-weekly-deadline-digest');
-- To see runs:      select * from cron.job_run_details order by start_time desc limit 20;
