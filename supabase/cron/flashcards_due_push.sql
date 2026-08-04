-- ============================================================
-- SEMORA FLASHCARDS DUE PUSH — spaced-repetition review reminder (pg_cron)
-- ============================================================
-- STATUS: DEPLOYED to project usglgeosqhtxbyxsugre.
--   • 2026-08-03 — migration 048 applied, job first scheduled
--   • 2026-08-04 — REPLACED with this version (migration 050): added the
--     per-user throttle and the has-a-push-token filter. The first version
--     would have pushed the same user daily forever; see migration 050.
--
-- Mirrors supabase/cron/reengagement_push.sql — same vault secret, same
-- send-push endpoint. Read that file first; the shared prerequisites (pg_cron,
-- pg_net, the 'push_send_secret' vault secret, an APNs key in EAS) are already
-- satisfied.
--
-- ── Schedule ───────────────────────────────────────────────
-- '0 16 * * *' is interpreted in cron.timezone, which is GMT on this project
-- (server TimeZone = UTC), so this is 16:00 UTC daily — late morning in the
-- Americas, early evening in Europe. A single fixed hour rather than
-- per-timezone fan-out; doing that properly needs one job per offset or an
-- hourly job filtering on profiles.timezone, which is not worth it until there
-- are users outside those windows.
--
-- ── Who is EXCLUDED, and by what ───────────────────────────
--   1. Opted out in Settings → Notifications
--        → p.flashcards_due_push_enabled (migration 048)
--   2. Never granted OS notification permission
--        → no public.push_tokens row, caught by the `exists` filter below.
--          send-push would also no-op on an empty token set, but filtering
--          here keeps the throttle timestamp honest — we must not record a
--          "sent" for someone who could never receive it.
--   3. Revoked permission after granting
--        → their token starts returning DeviceNotRegistered and send-push
--          deletes it (step 5 of that function), which drops them into case 2.
--   4. Notified within the last 3 days
--        → p.flashcards_due_push_last_sent_at (migration 050)
--   5. Fewer than 5 cards due
--        → the `having` clause. One straggler is not worth a notification.
--
-- ── Duplicate protection ───────────────────────────────────
-- Due cards stay due until reviewed, so membership in this audience is sticky.
-- The throttle is what keeps that from becoming a daily identical push: at most
-- one send per user per 3 days, and the timestamp is written in the same
-- transaction as the dispatch, so a re-run or a double-fire in the same window
-- selects nobody the second time.
--
-- Manage:  select * from cron.job;   select cron.unschedule('semora-flashcards-due');
--          select * from cron.job_run_details order by start_time desc limit 20;
--
-- Dry-run the audience (safe, sends nothing and writes nothing):
--   select count(*) from (
--     select c.user_id from public.cards c
--     join public.profiles p on p.id = c.user_id
--     where c.due_at <= now() and p.flashcards_due_push_enabled
--       and (p.flashcards_due_push_last_sent_at is null
--            or p.flashcards_due_push_last_sent_at < now() - interval '3 days')
--       and exists (select 1 from public.push_tokens t where t.user_id = c.user_id)
--     group by c.user_id having count(*) >= 5) s;
-- ============================================================

select cron.unschedule('semora-flashcards-due');

select cron.schedule(
  'semora-flashcards-due',
  '0 16 * * *',
  $job$
  do $inner$
  declare
    target_ids uuid[];
  begin
    select coalesce(array_agg(user_id), '{}')
      into target_ids
    from (
      -- cards.user_id is denormalized (migration 024) and RLS-scoped to the
      -- owner, so no join through decks is needed to establish ownership.
      select c.user_id
      from public.cards c
      join public.profiles p on p.id = c.user_id
      where c.due_at <= now()
        and p.flashcards_due_push_enabled
        and (
          p.flashcards_due_push_last_sent_at is null
          or p.flashcards_due_push_last_sent_at < now() - interval '3 days'
        )
        and exists (
          select 1 from public.push_tokens t where t.user_id = c.user_id
        )
      group by c.user_id
      having count(*) >= 5
    ) s;

    if coalesce(array_length(target_ids, 1), 0) > 0 then
      perform net.http_post(
        url     := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret from vault.decrypted_secrets where name = 'push_send_secret'
          )
        ),
        body := jsonb_build_object(
          'user_ids', to_jsonb(target_ids),
          'title', 'Cards are ready to review',
          'body',  'Your flashcards are due — a few minutes now is worth an hour before the exam.',
          -- app/_layout.tsx routes on data.type; 'flashcards_due' opens /flashcards.
          'data',  jsonb_build_object('type', 'flashcards_due')
        )
      );

      -- Stamp BEFORE the async pg_net request resolves, deliberately. If the
      -- POST fails we skip one cycle rather than risk re-sending on the next
      -- run; under-notifying is the safe direction for a nag.
      update public.profiles
         set flashcards_due_push_last_sent_at = now()
       where id = any(target_ids);
    end if;
  end
  $inner$;
  $job$
);
