-- ============================================================
-- SEMORA: A TRANSCRIPT THAT FORGOT SEGMENTS IT ALREADY HAS
-- ============================================================
-- A lecture's transcript is assembled once, at the moment something decides the
-- recording is over. Nothing ever assembles it a second time. That is fine when
-- the decision is right, and it is not always right:
--
--   88f98c65   2026-09-02. Finalised by the sweep at 10:30 while the student
--              was still recording, on the 5 segments that existed then.
--              Segments 6, 7 and 8 arrived at 10:52, 11:00 and after — all
--              transcribed, all `done`, and none of them in the transcript.
--              The row says 20,902 characters and segment_count 5; the audio
--              on disk says 8.
--
-- It usually heals itself, which is why it has never been noticed: finishLecture
-- writes the final state with NO status guard, so a student who presses stop
-- drags the row back to 'uploading' and the normal finalize rebuilds everything.
-- The healing depends entirely on the student pressing stop. An app that dies
-- instead leaves the transcript permanently short, with the missing audio
-- sitting right there, already transcribed, already paid for.
--
-- ─── WHY THIS MATTERS MORE THAN IT USED TO ───
-- A short transcript was survivable while the only thing reading it was a
-- student scrolling. 109 changed that: notes are written FROM the transcript,
-- once, and nothing regenerates them. A transcript missing its last three
-- segments becomes notes missing the last third of the lecture, permanently.
--
-- 114 stops notes being written while audio is still arriving, which closes the
-- common case. It cannot close this one — once the audio stops for good, the
-- lecture is quiet, eligible, and still short.
--
-- ─── THE INVARIANT ───
-- The segments are the record. If more of them are `done` than the transcript
-- was built from, the transcript is stale by definition and can be rebuilt
-- from the audio at any time, with no guesswork. So rather than trying to make
-- every finalize decision correct, this states the invariant and repairs any
-- row that violates it: A TRANSCRIPT MUST CONTAIN EVERY SEGMENT THAT HAS ONE.
--
-- ─── SCOPED TO ROWS THAT STILL NEED NOTES ───
-- `notes_md is null` on purpose. Rebuilding the transcript under notes that
-- have already been written would leave the two disagreeing — a complete
-- transcript beside notes that describe part of it — which is worse than
-- either problem alone, because it looks correct. A 'ready' lecture whose
-- transcript is short needs its NOTES regenerated too, and that is a deliberate
-- act on a student's content, not something a janitor should do on a timer.
--
-- ─── ORDER MATTERS ───
-- Called first in the notes job, before request_pending_lecture_notes, so a
-- transcript is repaired in the same statement that decides whether to
-- summarise it — never one tick later, by which time the notes would already
-- be wrong. Also called from the sweep so the STUDENT sees the full transcript
-- on their screen at the next ten-minute tick, whether or not notes are due.
--
-- Bumping updated_at is deliberate: it restarts 109's ten-minute quiet window,
-- so a lecture that is still growing keeps deferring its own notes for as long
-- as it keeps growing. Together with 114's audio check that means notes are
-- written once, against a transcript that has stopped changing.
-- ============================================================

create or replace function public.resync_lecture_transcripts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rec   record;
  seg   record;
  fixed integer := 0;
begin
  for rec in
    select r.id
    from public.lecture_recordings r
    where r.status = 'transcribed'
      and r.notes_md is null
      and (
        select count(*) from public.lecture_segments s
        where s.lecture_id = r.id and s.status = 'done'
      ) > coalesce(r.segment_count, 0)
    order by r.updated_at
    limit 50
    for update skip locked
  loop
    select
      coalesce(string_agg(nullif(btrim(s.transcript), ''), ' ' order by s.seq), '') as text,
      count(*) filter (where nullif(btrim(s.transcript), '') is not null)           as done_count,
      coalesce(sum(s.seconds), 0)                                                   as total_seconds
    into seg
    from public.lecture_segments s
    where s.lecture_id = rec.id
      and s.status = 'done';

    -- done_count counts segments carrying actual text, which is what the
    -- transcript is made of. A segment marked done with an empty transcript
    -- contributes nothing and must not inflate the count, or the next run
    -- would see a mismatch that can never be resolved and rebuild forever.
    if seg.done_count > 0 then
      update public.lecture_recordings
      set transcript       = seg.text,
          segment_count    = seg.done_count,
          duration_seconds = seg.total_seconds,
          updated_at       = now()
      where id = rec.id;
      fixed := fixed + 1;
    end if;
  end loop;

  return fixed;
end;
$$;

comment on function public.resync_lecture_transcripts() is
  'Rebuilds a transcript that is missing segments already transcribed (115). '
  'A lecture finalised early — by the sweep mid-recording, or by any decision '
  'that turns out to have been premature — keeps whatever segments existed at '
  'that moment and never picks up the rest unless the student presses stop. '
  'Only touches rows with no notes yet: a complete transcript under partial '
  'notes reads as correct and is worse than either problem alone.';

revoke all on function public.resync_lecture_transcripts() from public, anon, authenticated;
grant execute on function public.resync_lecture_transcripts() to service_role;

-- ─── Wired ahead of the requester, in the same statement ────
select cron.unschedule('semora-finish-lecture-notes')
where exists (select 1 from cron.job where jobname = 'semora-finish-lecture-notes');

select cron.schedule(
  'semora-finish-lecture-notes',
  '5,15,25,35,45,55 * * * *',
  $cron$
  do $inner$
  begin
    perform public.resync_lecture_transcripts();
    perform public.request_pending_lecture_notes(5);
    perform public.notify_lecture_notes_ready();
    perform public.alert_lecture_notes_stuck();
  end
  $inner$;
  $cron$
);

-- ─── And on the sweep, for the student's own screen ─────────
select cron.unschedule('semora-sweep-stalled-lectures')
where exists (select 1 from cron.job where jobname = 'semora-sweep-stalled-lectures');

select cron.schedule(
  'semora-sweep-stalled-lectures',
  '*/10 * * * *',
  $cron$
  do $inner$
  begin
    perform public.sweep_stalled_lectures();
    perform public.resync_lecture_transcripts();
    perform public.release_finished_lecture_reservations();
  end
  $inner$;
  $cron$
);
