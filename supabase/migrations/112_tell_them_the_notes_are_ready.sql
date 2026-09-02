-- ============================================================
-- SEMORA: TELL THE STUDENT THEIR NOTES ARRIVED
-- ============================================================
-- 109 finishes the work the app abandoned. It does it silently, which for the
-- student is nearly indistinguishable from it not happening at all.
--
-- The three lectures it rescued on 2026-09-02 make the point. 6706e2b9 is a
-- 40-minute class recorded on 2026-08-31; its student watched a spinner, gave
-- up, and left. The transcript was rebuilt 23 minutes later and the notes were
-- written two days after that. Nothing in that sequence involved them, and
-- nothing at the end of it told them. They have no reason to open that lecture
-- again — the last time they looked, it was broken.
--
-- A rescue nobody hears about buys nothing. This is the other half of 109.
--
-- ─── ONLY THE UNATTENDED ONES ───
-- notes_auto_attempts > 0 is the whole filter. A student who opened the
-- lecture and watched the notes appear does not need to be told about notes
-- they are already reading; the app generated those on the screen in front of
-- them. This fires only where the SERVER did work the student never saw.
--
-- ─── NOT AT THREE IN THE MORNING ───
-- The other two server pushes run on fixed daily schedules — 16:00 and 17:00
-- UTC — so the hour takes care of itself. This one rides the ten-minute notes
-- tick and would happily fire at 3am, so it has to check the clock itself.
--
-- 08:00-21:00 in the student's own timezone, from profiles.timezone. A bad or
-- missing timezone falls back to UTC rather than skipping the student: the
-- worst case is one notification at an odd local hour, and silently never
-- notifying someone because their timezone string is malformed is the more
-- expensive failure. This is intentionally NOT profiles.quiet_hours_* — those
-- are the student's setting for their own deadline reminders, and quietly
-- reusing them for a different kind of message would mean a student who
-- narrowed their reminder window also stopped hearing about their notes.
--
-- ─── STAMPED, SO IT CANNOT REPEAT ───
-- notes_ready_notified_at is written in the same statement that selects the
-- row. A push that fails to send is not retried: under-notifying is the safe
-- direction for something that arrives on a lock screen, and it is the rule
-- 006's flashcards job already follows for the same reason.
--
-- ─── DEEP LINK IS DELIBERATELY NOT WIRED YET ───
-- data.type is 'lecture_notes_ready' and data.lectureId carries the row, so a
-- future build can land the student on the lecture itself. No shipped version
-- routes that type today: app/_layout.tsx falls through to a replace() onto
-- the tabs root, which opens the app to home. That is a worse landing than it
-- could be and a much better one than silence, and it needs no app release to
-- start working. Wiring the route is an app change and is not part of this.
-- ============================================================

alter table public.lecture_recordings
  add column if not exists notes_ready_notified_at timestamptz;

comment on column public.lecture_recordings.notes_ready_notified_at is
  'When the student was told, unprompted, that notes the SERVER generated for '
  'this lecture are ready (112). Null for every lecture whose notes the student '
  'watched being made. Stamped before the push is queued, so a failed send is '
  'skipped rather than retried.';

create or replace function public.notify_lecture_notes_ready()
returns integer
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  rec      record;
  secret   text;
  notified integer := 0;
begin
  select decrypted_secret into secret
  from vault.decrypted_secrets where name = 'push_send_secret';

  -- No secret means every push would be refused at the door. Stamping the rows
  -- anyway would burn the one notification each lecture ever gets.
  if secret is null then
    return 0;
  end if;

  for rec in
    select r.id, r.user_id, r.title
    from public.lecture_recordings r
    join public.profiles p on p.id = r.user_id
    where r.status = 'ready'
      and r.notes_md is not null
      and r.notes_auto_attempts > 0
      and r.notes_ready_notified_at is null
      -- Nothing older than a day. A push about a lecture from last week reads
      -- as a bug, not a rescue.
      and r.updated_at > now() - interval '24 hours'
      and exists (select 1 from public.push_tokens t where t.user_id = r.user_id)
      and extract(
            hour from (
              now() at time zone (
                case when exists (
                  select 1 from pg_timezone_names z where z.name = nullif(p.timezone, '')
                ) then p.timezone else 'UTC' end
              )
            )
          ) between 8 and 20
    order by r.updated_at
    limit 20
    for update of r skip locked
  loop
    update public.lecture_recordings
       set notes_ready_notified_at = now()
     where id = rec.id;

    perform net.http_post(
      url     := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || secret
      ),
      body := jsonb_build_object(
        'user_ids', jsonb_build_array(rec.user_id),
        'title', 'Your lecture notes are ready',
        'body',
          case
            when nullif(btrim(coalesce(rec.title, '')), '') is not null
              then 'We finished the notes for “' || left(btrim(rec.title), 60) || '”.'
            else 'We finished writing up the lecture you recorded.'
          end,
        'translations', jsonb_build_object(
          'es', jsonb_build_object(
            'title', 'Tus apuntes de la clase están listos',
            'body',
              case
                when nullif(btrim(coalesce(rec.title, '')), '') is not null
                  then 'Terminamos los apuntes de «' || left(btrim(rec.title), 60) || '».'
                else 'Terminamos de redactar la clase que grabaste.'
              end
          )
        ),
        'data', jsonb_build_object(
          'type', 'lecture_notes_ready',
          'lectureId', rec.id
        )
      )
    );

    notified := notified + 1;
  end loop;

  return notified;
end;
$$;

comment on function public.notify_lecture_notes_ready() is
  'Tells a student that notes 109 generated without them are ready (112). Only '
  'fires for notes_auto_attempts > 0 — a student who watched the notes appear '
  'is not told about them — and only between 08:00 and 21:00 in their own '
  'timezone. One notification per lecture, ever.';

revoke all on function public.notify_lecture_notes_ready() from public, anon, authenticated;
grant execute on function public.notify_lecture_notes_ready() to service_role;

-- Same tick as the requester, immediately after it. A lecture that finishes
-- generating during this run is not notified until the next one, ten minutes
-- later, because the notes write happens in the Edge function long after
-- request_pending_lecture_notes has returned.
select cron.unschedule('semora-finish-lecture-notes')
where exists (select 1 from cron.job where jobname = 'semora-finish-lecture-notes');

select cron.schedule(
  'semora-finish-lecture-notes',
  '5,15,25,35,45,55 * * * *',
  $cron$
  do $inner$
  begin
    perform public.request_pending_lecture_notes(5);
    perform public.notify_lecture_notes_ready();
    perform public.alert_lecture_notes_stuck();
  end
  $inner$;
  $cron$
);
