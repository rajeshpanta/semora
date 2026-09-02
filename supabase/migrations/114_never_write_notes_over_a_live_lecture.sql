-- ============================================================
-- SEMORA: NEVER WRITE NOTES FOR A LECTURE THAT IS STILL RUNNING
-- ============================================================
-- 109 waits ten minutes of quiet before writing notes unattended, so that a
-- student who is watching always wins the race. The quiet was measured with
-- `updated_at`, and `updated_at` was frozen.
--
-- lecture-transcribe marked a lecture 'transcribing' behind a status guard that
-- matched nothing after the first segment, so the column stopped moving while
-- audio kept arriving for another hour. Two things then compounded:
--
--   1. sweep_stalled_lectures (082) finalised the lecture mid-recording, on a
--      partial transcript, because 15 minutes of frozen clock looks exactly
--      like a dead phone.
--   2. Ten minutes later this function saw a settled 'transcribed' row and
--      wrote the notes.
--
-- On 2026-09-02, lecture a4a6aff3: 10 segments, 37,323 characters of final
-- transcript, and 11,110 characters of notes generated at 09:45 from roughly
-- the first third of it. The student pressed stop at 09:49, the full transcript
-- was rebuilt, and the notes stayed as they were — this function skips any row
-- with notes_md set, and so does the client, so nothing would ever have fixed
-- them. That is the first live lecture this feature ever handled on its own.
--
-- The frozen clock is fixed at source in lecture-transcribe: the row's
-- updated_at is now touched on every segment, so the ten-minute rule measures
-- what it always claimed to. That alone closes this.
--
-- ─── SO WHY THIS AS WELL ───
-- Because the ten-minute rule now depends on a write in a different system,
-- and the failure it protects against is silent and unrecoverable. If that
-- statement is ever guarded again, or the segment path changes shape, the clock
-- goes quiet and nothing announces it — the notes just start being wrong again,
-- permanently, one lecture at a time.
--
-- The segments themselves cannot go quiet the same way. They are the audio: a
-- running recording produces one every SEGMENT_SECONDS = 300s without fail, and
-- pressing pause rotates one immediately. Asking them directly does not depend
-- on anyone remembering to keep a column fresh.
--
-- Fifteen minutes rather than five: three missed segments, not one, so an
-- upload retrying on bad campus wifi is never mistaken for a finished lecture.
--
-- ─── THIS ALSO COVERS THE PAUSE ───
-- The clock fix does not, on its own. A paused recording touches nothing —
-- no segments, no row writes — so its updated_at legitimately goes stale while
-- the student is still in the room with more to record. 082 finalises it at 15
-- minutes and this function would have taken it 10 minutes later.
--
-- fe460dd8 is the proof that matters: 25 minutes of audio over 97.9 minutes of
-- wall clock, one 72.9-minute gap in the middle. Under the old rule that
-- student would have come back from their break to notes covering the half of
-- the lecture they had already sat through.
--
-- A segment gap of 72.9 minutes still trips a 15-minute audio check, so this
-- does not fix the pause on its own either. What it does is keep the notes
-- from being written during the gap — the lecture stays eligible, silent and
-- intact, until the student comes back and finishes it, and the notes are then
-- written once against the whole thing.
-- ============================================================

create or replace function public.request_pending_lecture_notes(p_limit integer default 5)
returns integer
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  rec       record;
  secret    text;
  requested integer := 0;
begin
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'semora_lecture_cron_secret';

  if secret is null then
    return 0;
  end if;

  for rec in
    select r.id, r.user_id
    from public.lecture_recordings r
    where r.status = 'transcribed'
      and r.notes_md is null
      and length(btrim(coalesce(r.transcript, ''))) >= 200
      and r.updated_at < now() - interval '10 minutes'
      and r.notes_auto_attempts < 3
      -- The audio itself, asked directly. A lecture still receiving segments is
      -- still being recorded, whatever its status column says, and its
      -- transcript is still growing. Writing notes now would describe a
      -- fraction of the class and could never be undone.
      and not exists (
        select 1 from public.lecture_segments s
        where s.lecture_id = r.id
          and s.created_at > now() - interval '15 minutes'
      )
    order by r.updated_at
    limit greatest(1, p_limit)
    for update skip locked
  loop
    update public.lecture_recordings
       set notes_auto_attempts = notes_auto_attempts + 1
     where id = rec.id;

    perform net.http_post(
      url     := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/lecture-study-kit',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-semora-lecture-cron-secret', secret
      ),
      body := jsonb_build_object(
        'lectureId', rec.id,
        'mode', 'notes'
      ),
      timeout_milliseconds := 240000
    );

    requested := requested + 1;
  end loop;

  return requested;
end;
$$;

comment on function public.request_pending_lecture_notes(integer) is
  'Asks lecture-study-kit to write notes for lectures the app abandoned after '
  '082/107/110 rescued their transcript (109, hardened in 114). Refuses any '
  'lecture that has received audio in the last 15 minutes — a growing '
  'transcript must never be summarised, because notes are written once and '
  'nothing regenerates them. REQUIRES lecture-study-kit deployed with '
  '--no-verify-jwt. See DEPLOY_CHECKLIST.md.';
