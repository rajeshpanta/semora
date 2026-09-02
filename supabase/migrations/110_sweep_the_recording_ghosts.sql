-- ============================================================
-- SEMORA: THE SWEEP LEARNS ABOUT 'recording'
-- ============================================================
-- 082 covers 'uploading' and 'transcribing'. 107 added 'generating'. The state
-- a lecture STARTS in has never been covered, and it is the one state the app
-- can leave behind without uploading a single byte.
--
--   aa3832f5  2026-09-01 09:05:46 PT
--             Consent accepted 09:05:45, recording started 09:05:47, and then
--             the device never spoke again — no segments, no save, no further
--             analytics of any kind. The row has said 'recording' ever since.
--             The student has one lecture that worked that morning (09:03, two
--             segments, notes generated 09:04) and this, which has been
--             sitting in their list saying "Uploading" for over a day.
--
-- Nothing reaches it. 082 does not look at 'recording'. 107 does not look at
-- 'recording'. reclaim_stale_lecture_reservations DOES — it released this
-- row's capacity at 12:11 the same day — but releasing the reservation only
-- takes the capacity back. It does not touch the status, so the row is left
-- holding nothing and still claiming to be busy. Permanently.
--
-- ─── THE THRESHOLD IS THE WHOLE DESIGN ───
-- 082 was explicit that sweeping too early is worse than not sweeping:
--
--   "if the server swept sooner, it would finalise a recording the student's
--    screen still shows as working."
--
-- That risk is sharpest here, because 'recording' is the one status a HEALTHY
-- lecture occupies for a long time. A student recording a full class sits in
-- it for up to MAX_RECORDING_SECONDS — 90 minutes (lib/lectureRecordingOptions
-- .ts:74) — and `updated_at` is no help: segments are rows in a different
-- table, so a perfectly healthy 60-minute recording can have an `updated_at`
-- that has not moved since it started. Reusing the 15 minutes 082 uses would
-- cut live lectures off at the knees.
--
-- Two hours, therefore, and measured from creation. 90 minutes is the hard
-- ceiling the client enforces from inside its own timer, so at 120 minutes a
-- row in 'recording' is not a slow lecture — there is no such thing as a
-- 2-hour lecture in this system. The extra 30 minutes is pure margin against
-- a clock skew or a stopped-but-not-yet-saved tail.
--
-- The segment check is the second belt. If audio is still arriving, something
-- is alive on the other end no matter what the clock says, and this leaves it
-- alone. Neither condition alone would be enough; together they cannot fire on
-- a recording that is genuinely still running.
--
-- ─── SALVAGE, NOT DELETION ───
-- Identical handling to 082's first branch, deliberately: whatever segments
-- made it through are reassembled into a transcript and the row lands on
-- 'transcribed', which is exactly the state 109 then picks up to write the
-- notes. A ghost with nothing behind it becomes 'failed'/'STALLED' — an honest
-- message the student can act on instead of a spinner that never resolves.
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
      -- Same 15 minutes the app uses to decide a recording has stalled
      -- (lib/lectures.LECTURE_STALLED_MS). Deliberately identical: if the
      -- server swept sooner, it would finalise a recording the student's
      -- screen still shows as working.
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

  -- ─── 3. Never left the starting line (110) ──────────────────
  for rec in
    select r.id, r.user_id
    from public.lecture_recordings r
    where r.status = 'recording'
      -- Past any possible live recording. See the header: 90 minutes is the
      -- client's hard ceiling, so nothing healthy is still here at 120.
      and r.created_at < now() - interval '2 hours'
      -- ...and nothing has arrived recently. Audio still landing means a
      -- device is alive on the other end whatever the clock says.
      and not exists (
        select 1 from public.lecture_segments s
        where s.lecture_id = r.id
          and s.created_at > now() - interval '15 minutes'
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
      -- Something was captured before the app died. Same landing state as
      -- branch 1, which is also what 109 watches for to write the notes.
      update public.lecture_recordings
      set transcript       = seg.text,
          segment_count    = seg.done_count,
          duration_seconds = seg.total_seconds,
          status           = 'transcribed',
          error_code       = null,
          updated_at       = now()
      where id = rec.id;
    else
      -- The aa3832f5 case: opened the recorder, never sent anything. STALLED
      -- is the true story and it renders as a real message instead of a
      -- permanent "Uploading" the student cannot clear.
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
  '(107), and never-started (110). Each branch lands the row on a state the app '
  'already knows how to render, and 109 picks up any row that reaches '
  '"transcribed" to write the notes unattended.';
