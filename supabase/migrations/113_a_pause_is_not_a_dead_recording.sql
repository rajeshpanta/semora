-- ============================================================
-- SEMORA: A PAUSED RECORDING IS NOT AN ABANDONED ONE
-- ============================================================
-- 110 added a third sweep branch for lectures stuck in 'recording'. Its guard
-- was "older than two hours", reasoned from MAX_RECORDING_SECONDS: the client
-- stops itself at 90 minutes, so nothing healthy can still be recording at 120.
--
-- That reasoning is wrong, and the data says so.
--
-- The 90-minute cap counts RECORDED seconds. The recorder has a pause button
-- (lib/lectureRecorder.ts:402), and pausing rotates the current segment and
-- then goes completely silent — the timer effect returns early on any phase
-- that is not 'recording', so no segments rotate and nothing touches the
-- lecture row. Elapsed wall-clock time and recorded time are therefore not the
-- same quantity, and only one of them is capped.
--
-- Already in the wild, before this branch ever existed:
--
--   fe460dd8   25.0 minutes of audio spread over 97.9 minutes of wall clock,
--              with a single 72.9-minute gap in the middle. A student paused,
--              left, and came back. It cleared 110's two-hour line by 22
--              minutes. Paused half an hour later and 110 would have ended
--              their lecture while they were still in the room.
--
--   78beaa43   81 minutes old, one segment, silent for 76 minutes at the time
--              this was written — 39 minutes from being finalised by 110 and
--              indistinguishable, from the outside, from that same pause.
--
-- ─── THE SIGNAL THAT ACTUALLY SEPARATES THEM ───
-- Time cannot tell a pause from a death, because a pause has no upper bound.
-- Segment count can.
--
-- The row this branch was written for, aa3832f5, has ZERO segments. It is the
-- shape of an app that died between creating the lecture and capturing
-- anything: consent at 09:05:45, recording started at 09:05:47, and never
-- another word from that device.
--
-- Zero segments is unambiguous:
--   - a live recording uploads its first segment at SEGMENT_SECONDS = 300s,
--   - and pausing rotates one immediately, whenever it happens.
-- So a lecture with no segments at all has never captured a thing, and after
-- two hours — past the 90-minute cap by half an hour — never will.
--
-- A lecture WITH segments is a different animal. It captured audio, so it may
-- be paused rather than dead, and there is no honest short horizon for that.
-- Twelve hours is the horizon here: not because a pause cannot exceed it, but
-- because the phone cannot. iOS reclaims a suspended recorder long before
-- twelve hours, so a lecture silent that long has no device left behind it —
-- and unlike the two-hour rule, being wrong costs a student nothing they still
-- had.
--
-- ─── WHAT STAYS THE SAME ───
-- Salvage is unchanged: whatever segments arrived are reassembled and the row
-- lands on 'transcribed', which is where notes generation picks it up. A
-- lecture with nothing behind it becomes 'failed'/'STALLED' — an honest message
-- instead of a spinner that never resolves.
-- ============================================================

create or replace function public.sweep_stalled_lectures()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  swept   integer := 0;
  rec     record;
  seg     record;
begin
  -- ─── 1. Abandoned mid-upload (082, unchanged) ───────────────
  for rec in
    select id, user_id
    from public.lecture_recordings
    where status in ('uploading', 'transcribing')
      and updated_at < now() - interval '15 minutes'
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

    if seg.done_count > 0 then
      update public.lecture_recordings
      set transcript       = seg.text,
          segment_count    = seg.done_count,
          duration_seconds = seg.total_seconds,
          status           = 'transcribed',
          error_code       = null,
          updated_at       = now()
      where id = rec.id;
    else
      update public.lecture_recordings
      set status     = 'failed',
          error_code = 'STALLED',
          updated_at = now()
      where id = rec.id;
    end if;

    swept := swept + 1;
  end loop;

  -- ─── 2. Note generation whose isolate died (107, unchanged) ──
  for rec in
    select id,
           user_id,
           nullif(btrim(coalesce(transcript, '')), '') is not null as has_transcript
    from public.lecture_recordings
    where status = 'generating'
      and coalesce(notes_started_at, updated_at) < now() - interval '4 minutes'
    for update skip locked
  loop
    if rec.has_transcript then
      update public.lecture_recordings
      set status           = 'transcribed',
          error_code       = 'NOTES_FAILED',
          notes_started_at = null,
          updated_at       = now()
      where id = rec.id;
    else
      update public.lecture_recordings
      set status           = 'failed',
          error_code       = 'STALLED',
          notes_started_at = null,
          updated_at       = now()
      where id = rec.id;
    end if;

    swept := swept + 1;
  end loop;

  -- ─── 3. Never left the starting line (110, corrected here) ───
  for rec in
    select r.id, r.user_id
    from public.lecture_recordings r
    where r.status = 'recording'
      and (
        -- Never captured anything. Two hours is past the 90-minute cap, and a
        -- device that was going to send a segment would have sent one at five
        -- minutes — or the instant the student pressed pause.
        (
          not exists (select 1 from public.lecture_segments s where s.lecture_id = r.id)
          and r.created_at < now() - interval '2 hours'
        )
        or
        -- Captured something, then went quiet. This one MIGHT be paused, so the
        -- horizon is the life of the process rather than the length of a break:
        -- no phone holds a suspended recorder for twelve hours.
        (
          exists (select 1 from public.lecture_segments s where s.lecture_id = r.id)
          and not exists (
            select 1 from public.lecture_segments s
            where s.lecture_id = r.id
              and s.created_at > now() - interval '12 hours'
          )
        )
      )
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

    if seg.done_count > 0 then
      update public.lecture_recordings
      set transcript       = seg.text,
          segment_count    = seg.done_count,
          duration_seconds = seg.total_seconds,
          status           = 'transcribed',
          error_code       = null,
          updated_at       = now()
      where id = rec.id;
    else
      update public.lecture_recordings
      set status     = 'failed',
          error_code = 'STALLED',
          updated_at = now()
      where id = rec.id;
    end if;

    swept := swept + 1;
  end loop;

  return swept;
end;
$$;

comment on function public.sweep_stalled_lectures() is
  'Rescues lectures the client abandoned: mid-upload (082), mid-note-generation '
  '(107), and never-started (110, corrected in 113). Branch 3 separates a '
  'recording that never captured anything (no segments, 2h) from one that went '
  'quiet after capturing something (12h) — the second may be PAUSED, and a '
  'pause has no upper bound in wall-clock time.';
