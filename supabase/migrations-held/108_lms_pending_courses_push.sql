-- ============================================================
-- SEMORA 108 — "Canvas has classes waiting" push
-- ============================================================
-- STATUS: NOT YET APPLIED to usglgeosqhtxbyxsugre.
--
-- It lives in supabase/migrations-held/ rather than supabase/migrations/ so
-- that `supabase db push` cannot see it. Between 09-01 and 09-02, eight
-- migrations were pushed to production and every one of them would have taken
-- this along — db push applies everything pending, and this was the only thing
-- pending. It survived because someone remembered to lift it out first, eight
-- times. Moving it here replaces that memory with a fact about the filesystem.
--
-- To apply: git mv it into supabase/migrations/, confirm with
-- `supabase migration list --linked` that it is the ONLY thing pending, then
-- push. See supabase/migrations-held/README.md.
--
-- THE STATE THIS EXISTS FOR. A connection can be syncing perfectly and still be
-- withholding a semester. When the term turns over, the feed fills with classes
-- that are not linked to anything, and every dated item inside them is
-- discarded — while the sync reports success every three hours, because nothing
-- it was asked to do failed. On 2026-09-02 that was 13 connections holding 23
-- courses containing 511 deadlines, the oldest found on 24 August.
--
-- WHY THIS IS ONLY THE SECOND HALF. Today now carries a banner for exactly this
-- state, and for a student who opens the app that is the better surface: it
-- reaches everyone, needs no permission, cannot arrive at 3am, and is answered
-- rather than dismissed. This job exists for the remainder — 3 of the 13 had
-- not opened Semora in over a week, and a banner cannot reach someone who is
-- not there.
--
-- That is why the selection EXCLUDES anyone active in the last 3 days. A push
-- to a student who is opening the app anyway is a notification telling them
-- something their screen is already telling them, which is how a channel gets
-- turned off. The banner and this job deliberately do not overlap.
--
-- ── Schedule ───────────────────────────────────────────────
-- Hourly at :07, and each user is only selected when it is 09:00 where THEY
-- are. supabase/cron/flashcards_due_push.sql chose a single fixed UTC hour and
-- wrote down why: doing it properly needs an hourly job filtering on
-- profiles.timezone, "not worth it until there are users outside those
-- windows". That is now the case — 36 distinct zones, and every one of the 13
-- users this targets has a timezone recorded. It matters more here than for
-- flashcards, too: this is an unprompted nag to a student who has already
-- drifted away, and landing it in the middle of their night is the difference
-- between a reminder and an uninstall.
--
-- :07 keeps it clear of the LMS worker (:02,:17,:32,:47) and the jobs on the
-- hour and :40.
--
-- ── Who is EXCLUDED, and by what ───────────────────────────
--   1. Opted out                → p.lms_pending_push_enabled
--   2. Never granted the OS prompt, or no device registered
--                               → no public.push_tokens row. send-push would
--                                 no-op anyway, but filtering here keeps the
--                                 throttle honest: we must never record a
--                                 "sent" for someone who could not receive it.
--   3. Told in the last 7 days  → p.lms_pending_push_last_sent_at
--   4. Opened the app recently  → the Today banner has them (see above)
--   5. Nothing actually waiting → pending_courses_count = 0
--
-- Note there is no count in the copy. send-push takes one body for the whole
-- batch, and a per-user number would mean one request per student; the count
-- is what the banner and the destination screen are for.
-- ============================================================

-- ─── 1. Preference and throttle ─────────────────────────────
-- Mirrors flashcards_due_push_* (migration 048). Default ON: this reports work
-- the student is currently losing, which is the kind of notification an
-- account would want by default — and every path out of it is one tap.
alter table public.profiles
  add column if not exists lms_pending_push_enabled boolean not null default true;

alter table public.profiles
  add column if not exists lms_pending_push_last_sent_at timestamptz;

comment on column public.profiles.lms_pending_push_enabled is
  'SEMORA (108): send the "Canvas has classes waiting" push. Settings → Notifications.';
comment on column public.profiles.lms_pending_push_last_sent_at is
  'SEMORA (108): throttle stamp for the above. Written before the send resolves, so a failed POST costs one cycle rather than risking a repeat.';

-- ─── 2. A local hour that cannot break the job ──────────────
-- `now() at time zone <text>` RAISES on an unrecognised zone name, and
-- profiles.timezone is whatever the device reported. One bad string would abort
-- the whole DO block and silently stop every student's notification, which is a
-- far worse failure than one student being notified on UTC.
create or replace function public.semora_local_hour(p_tz text)
returns integer
language plpgsql
stable
as $$
begin
  return extract(hour from (now() at time zone coalesce(nullif(p_tz, ''), 'UTC')))::int;
exception when others then
  return extract(hour from (now() at time zone 'UTC'))::int;
end;
$$;

revoke all on function public.semora_local_hour(text) from public, anon, authenticated;

comment on function public.semora_local_hour(text) is
  'SEMORA (108): the current hour in the given IANA zone, falling back to UTC for a null, empty or unrecognised name. Exists so one malformed profiles.timezone cannot abort a cron batch.';

-- ─── 3. The job ─────────────────────────────────────────────
select cron.unschedule('semora-lms-pending-courses')
where exists (select 1 from cron.job where jobname = 'semora-lms-pending-courses');

select cron.schedule(
  'semora-lms-pending-courses',
  '7 * * * *',
  $job$
  do $inner$
  declare
    target_ids uuid[];
  begin
    select coalesce(array_agg(distinct c.user_id), '{}')
      into target_ids
    from public.lms_connections c
    join public.profiles p on p.id = c.user_id
    where c.pending_courses_count > 0
      and p.lms_pending_push_enabled
      and (
        p.lms_pending_push_last_sent_at is null
        or p.lms_pending_push_last_sent_at < now() - interval '7 days'
      )
      -- 09:00 where the student is, not where the server is.
      and public.semora_local_hour(p.timezone) = 9
      and exists (
        select 1 from public.push_tokens t where t.user_id = c.user_id
      )
      -- The Today banner already reaches anyone who is opening the app.
      and not exists (
        select 1
        from public.analytics_events e
        where e.user_id = c.user_id
          and e.app_name like 'semora%'
          and e.created_at > now() - interval '3 days'
      );

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
          'title', 'Canvas has classes waiting',
          'body',  'New courses were found in your Canvas. Their deadlines are not in Semora until you add them.',
          'translations', jsonb_build_object(
            'es', jsonb_build_object(
              'title', 'Canvas tiene materias esperando',
              'body', 'Se encontraron cursos nuevos en tu Canvas. Sus entregas no estarán en Semora hasta que los agregues.'
            )
          ),
          -- app/_layout.tsx routes on data.type; opens /settings/lms/new-courses.
          'data',  jsonb_build_object('type', 'lms_new_courses')
        )
      );

      -- Stamped BEFORE the async pg_net request resolves, deliberately. If the
      -- POST fails we skip one cycle rather than risk re-sending on the next
      -- run; under-notifying is the safe direction for a nag.
      update public.profiles
         set lms_pending_push_last_sent_at = now()
       where id = any(target_ids);
    end if;
  end
  $inner$;
  $job$
);
