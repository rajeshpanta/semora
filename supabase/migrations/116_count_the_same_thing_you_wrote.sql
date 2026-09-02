-- ============================================================
-- SEMORA: THE RESYNC MUST COUNT WHAT IT WRITES
-- ============================================================
-- 115 rebuilds a transcript that is missing segments it already has. It decides
-- there is work to do by comparing two numbers, and it got them from two
-- different places:
--
--   the test    count(*) where status = 'done'                    -- ALL of them
--   the write   segment_count := count(*) filter (transcript <> '') -- only ones with text
--
-- Those agree only while every finished segment carries text. The moment one
-- does not, the test can never be satisfied by the write: segment_count settles
-- at 9, the test keeps seeing 10, and the row is rebuilt on every tick forever.
--
-- The damage is not the wasted work. Each rebuild sets updated_at = now(), and
-- request_pending_lecture_notes (109) will only look at a row untouched for ten
-- minutes. A lecture caught in this loop is refreshed every ten, so that
-- condition never becomes true and THE STUDENT NEVER GETS NOTES — silently,
-- with a complete transcript sitting right there, and no error anywhere.
--
-- ─── AND IT IS NOT A HYPOTHETICAL SEGMENT ───
-- lecture-transcribe:733 is explicit that this is normal:
--
--   "An empty transcript is a VALID outcome, not a failure — five minutes of a
--    professor writing silently on a whiteboard genuinely contains no speech.
--    Storing '' keeps the segment 'done' so the lecture can finalize."
--
-- So a silent five minutes anywhere in a lecture is enough. It has not happened
-- yet — 0 of 179 done segments are empty at the time of writing, which is the
-- only reason 115 has not already stranded someone — but it is a matter of one
-- quiet whiteboard.
--
-- ─── THE FIX IS TO ASK ONE QUESTION, NOT TWO ───
-- Both sides now count segments that actually contribute text, which is what
-- the transcript is made of and what segment_count is set to. The comparison
-- becomes self-consistent, so a rebuild always settles it:
--
--   rebuild -> segment_count = N -> test sees N > N = false -> done.
--
-- A later segment WITH text raises N, is rebuilt once, and settles again. A
-- later segment WITHOUT text does not raise N and needs no rebuild, which is
-- correct: it contributes nothing to the transcript by definition.
--
-- duration_seconds still sums every done segment, filtered or not. Silence
-- still took time, and the recording was that long whether anyone spoke or not.
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
        -- Must match the SET below exactly. Counting all 'done' segments here
        -- while writing only the text-bearing count is what 115 did, and it
        -- makes the mismatch permanent instead of resolving it.
        select count(*) from public.lecture_segments s
        where s.lecture_id = r.id
          and s.status = 'done'
          and nullif(btrim(coalesce(s.transcript, '')), '') is not null
      ) > coalesce(r.segment_count, 0)
    order by r.updated_at
    limit 50
    for update skip locked
  loop
    select
      coalesce(string_agg(nullif(btrim(s.transcript), ''), ' ' order by s.seq), '') as text,
      count(*) filter (where nullif(btrim(s.transcript), '') is not null)           as done_count,
      -- Unfiltered on purpose: a silent segment still occupied its five minutes.
      coalesce(sum(s.seconds), 0)                                                   as total_seconds
    into seg
    from public.lecture_segments s
    where s.lecture_id = rec.id
      and s.status = 'done';

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
  'Rebuilds a transcript that is missing segments already transcribed (115, '
  'corrected in 116). Both the test and the write count segments carrying '
  'text, so a rebuild always settles the comparison. Counting all "done" '
  'segments on one side and only text-bearing ones on the other left any '
  'lecture containing a silent segment rebuilding every tick, which kept '
  'updated_at fresh and starved it of notes forever.';
