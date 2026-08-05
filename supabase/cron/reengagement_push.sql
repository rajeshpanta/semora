-- ============================================================
-- SEMORA RE-ENGAGEMENT PUSH — weekly deadline digest (pg_cron)
-- ============================================================
-- STATUS: DEPLOYED (2026-07-23) to project usglgeosqhtxbyxsugre.
--   • pg_cron + pg_net enabled
--   • Vault secret 'push_send_secret' created (holds PUSH_SEND_SECRET)
--   • job 'semora-weekly-deadline-digest' scheduled + active (Sun 17:00 UTC)
-- This file is the committed source-of-truth copy of what's live. It was
-- applied directly (supabase db query) rather than as a numbered migration so
-- the secret value never lands in git.
--
-- STILL REQUIRED for delivery: an APNs push key in EAS/Expo
--   (eas credentials → iOS → Push Notifications → set up a new key) and users
--   on a build that registered a push token. Until then this job runs but Expo
--   can't hand off to APNs.
--
-- To reproduce on a fresh project, run in the SQL editor:
--   1. create extension if not exists pg_cron;  create extension if not exists pg_net;
--   2. select vault.create_secret('<PUSH_SEND_SECRET>', 'push_send_secret');
--   3. the cron.schedule below.
-- Manage:  select * from cron.job;   select cron.unschedule('semora-weekly-deadline-digest');
--          select * from cron.job_run_details order by start_time desc limit 20;
-- ============================================================

select cron.schedule(
  'semora-weekly-deadline-digest',
  '0 17 * * 0',
  $job$
  do $inner$
  declare ids jsonb;
  begin
    select coalesce(jsonb_agg(user_id), '[]'::jsonb) into ids
    from (
      select t.user_id
      from public.tasks t
      where t.is_completed = false
        and t.due_date >= current_date
        and t.due_date < current_date + interval '7 days'
      group by t.user_id
    ) s;
    -- Only fire when someone actually has upcoming work — avoids a weekly
    -- no-audience 400 from send-push.
    if jsonb_array_length(ids) > 0 then
      perform net.http_post(
        url     := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret from vault.decrypted_secrets where name = 'push_send_secret'
          )
        ),
        body := jsonb_build_object(
          'user_ids', ids,
          'title', 'Your week ahead',
          'body',  'You have deadlines coming up this week — open Semora to plan them.',
          'translations', jsonb_build_object(
            'es', jsonb_build_object(
              'title', 'Tu próxima semana',
              'body', 'Tienes próximas entregas esta semana. Abre Semora para organizarlas.'
            )
          ),
          'data',  jsonb_build_object('type', 'weekly_digest')
        )
      );
    end if;
  end
  $inner$;
  $job$
);
