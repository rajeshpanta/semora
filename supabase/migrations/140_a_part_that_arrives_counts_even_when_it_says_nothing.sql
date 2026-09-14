-- A part that arrives counts, even when it says nothing
--
-- 138 gave every lecture an honest `parts_missing`, and made
-- lecture_rebuild_transcript the thing that recalculates it whenever a part
-- lands late. It calls lecture_set_parts_missing at the very end:
--
--     if seg.done_count = 0
--        or lecture_transcript_words(seg.text) = lecture_transcript_words(rec.transcript) then
--       return false;                       -- <- here
--     end if;
--     ...
--     perform public.lecture_set_parts_missing(p_lecture_id);   -- <- and here
--
-- So the recalculation only happens when the WORDS GREW. A recovered part that
-- is five minutes of a quiet lecture hall, or a room where the microphone was
-- muffled, is transcribed to nothing, takes the early return, and the lecture
-- goes on claiming a part is missing that is sitting right there, done. The
-- duration and the count do not move either, so the lecture also keeps saying
-- it is shorter than it was.
--
-- Completeness is not a fact about the text. It is a fact about which rows
-- exist and which of them are done, and that is true whether or not anybody
-- spoke. So it is recalculated before the comparison now, along with the
-- count and the duration, which come from the rows too.
--
-- The comparison itself is kept exactly as it was, and still guards the
-- expensive half: writing the transcript, bumping transcript_rev, and marking
-- notes stale so they are regenerated. Silence must not trigger any of that —
-- 116's lesson was a lecture rebuilt on every tick forever, starved of notes,
-- and this keeps that door shut.
--
-- Additive and idempotent. No column changes, no data rewrite, no new schedule.

create or replace function public.lecture_rebuild_transcript(p_lecture_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  rec       record;
  seg       record;
  had_notes boolean;
begin
  select id, transcript, segment_count, notes_md, status, duration_seconds
    into rec
  from public.lecture_recordings
  where id = p_lecture_id
  for update;

  if not found then
    return false;
  end if;

  -- Both the text and the count come from the SAME filter, which is the whole
  -- lesson of 116: counting all `done` segments on one side while writing only
  -- the text-bearing count on the other made the comparison unsatisfiable and
  -- rebuilt the row on every tick forever, starving it of notes.
  select
    coalesce(string_agg(nullif(btrim(s.transcript), ''), ' ' order by s.seq), '') as text,
    count(*) filter (where nullif(btrim(s.transcript), '') is not null)           as done_count,
    -- Unfiltered: a silent segment still occupied its five minutes.
    coalesce(sum(s.seconds), 0)                                                   as total_seconds
  into seg
  from public.lecture_segments s
  where s.lecture_id = p_lecture_id
    and s.status = 'done';

  -- 140: BEFORE the comparison below, not after it.
  --
  -- How many parts are missing depends on the rows, not on whether the words
  -- changed. A silent part that arrives is one fewer part missing, and the
  -- student should stop being told their notes are incomplete because of it.
  perform public.lecture_set_parts_missing(p_lecture_id);

  -- 140: the same argument for the two other row-derived facts. Cheap, and
  -- deliberately without touching transcript_rev or notes_stale, so a silent
  -- part corrects the lecture's shape without asking for new notes.
  --
  -- segment_count still never shrinks: it is the phone's declaration of how
  -- many parts it captured, and rows that never arrived are exactly what it
  -- exists to remember (see sweep_stalled_lectures, 138).
  update public.lecture_recordings
     set segment_count    = greatest(coalesce(segment_count, 0), seg.done_count),
         duration_seconds = seg.total_seconds,
         updated_at       = now()
   where id = p_lecture_id
     and (coalesce(segment_count, 0) < seg.done_count
          or coalesce(duration_seconds, 0) is distinct from seg.total_seconds);

  -- 138: compared by words, not bytes. lecture-transcribe assembles the same
  -- parts with paragraph breaks and "[Part of this recording…]" markers, so a
  -- byte comparison called every finished lecture changed, and now that this is
  -- called whenever a part lands on a finished lecture, that would rewrite
  -- correct notes for nothing.
  --
  -- 140: this guards the transcript and the notes only. Everything above it has
  -- already happened.
  if seg.done_count = 0
     or public.lecture_transcript_words(seg.text) = public.lecture_transcript_words(rec.transcript) then
    return false;
  end if;

  -- 138: a lecture mid-generation is about to have notes from the old text.
  had_notes := rec.notes_md is not null or rec.status = 'generating';

  update public.lecture_recordings
     set transcript       = seg.text,
         segment_count    = greatest(coalesce(segment_count, 0), seg.done_count),
         duration_seconds = seg.total_seconds,
         -- 138: lets the notes job tell whether the transcript grew while it
         -- was writing (see lecture-study-kit handleNotes).
         transcript_rev   = transcript_rev + 1,
         updated_at       = now()
   where id = p_lecture_id;

  -- Notes written from a shorter transcript are now incomplete.
  --
  -- Until 138 this raised an ops alert asking a human whether to clear them,
  -- because replacing notes a student may have read felt like a judgement call.
  -- The owner made that call on 2026-09-13: refresh them. They are not replaced
  -- blindly — notes_stale asks request_pending_lecture_notes to write new ones,
  -- the old notes stay on screen until the new ones land, and the student gets a
  -- push saying the notes now cover the whole lecture (notify_lecture_notes_ready).
  -- Students cannot edit notes_md, so nothing of theirs is overwritten.
  if had_notes then
    update public.lecture_recordings
       set notes_stale         = true,
           notes_auto_attempts = 0
     where id = p_lecture_id;
  end if;

  return true;
end;
$function$;

comment on function public.lecture_rebuild_transcript(uuid) is
  'SEMORA (115-116, 138, 140): reassembles a lecture transcript from its done parts. '
  '140 moved completeness, count and duration ahead of the words-unchanged early return, '
  'so a recovered SILENT part still reduces parts_missing and corrects the duration '
  'without bumping transcript_rev or asking for new notes.';
