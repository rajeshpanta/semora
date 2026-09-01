-- ============================================================
-- SEMORA: THE SWEEP LEARNS ABOUT 'generating'
-- ============================================================
-- 082 finalises recordings abandoned mid-upload. It watches 'uploading' and
-- 'transcribing' and nothing else, so the one state where the SERVER is the
-- thing that died has never been covered.
--
-- lecture-study-kit stamps the claim before it calls the model:
--
--   supabase/functions/lecture-study-kit/index.ts:318
--     update lecture_recordings set status='generating',
--            notes_started_at=now() where id=? and status='transcribed'
--
-- and only moves the row again once the model returns — to 'ready' with the
-- notes, or back to 'transcribed' with error_code='NOTES_FAILED'. If the
-- isolate is killed in between, neither write ever happens and the row is
-- 'generating' forever. Nothing retries it, and 082 does not look at it.
--
-- It is not hypothetical: 96575255 (GEOL3005Class-1.pdf) claimed at
-- 2026-08-31 17:51:44 and has not been touched since — twelve hours by the
-- time it was found, with a 16,027-character transcript sitting intact behind
-- it. There is no ai_call_log row for that lecture, which is the proof of how
-- it died: logAiCall runs only AFTER the model call returns, so an isolate
-- killed mid-call leaves the claim stamped and no other trace.
--
-- ─── WHAT THE STUDENT SEES TODAY, AND WHY THIS IS STILL WORTH FIXING ───
-- The client already refuses to spin forever. app/lecture/[id].tsx:399 treats
-- a 'generating' claim older than STALE_GENERATION_MS as dead, which drops the
-- screen onto the transcript and a "Try again" button. So this is NOT a
-- student staring at a spinner — 082's original emergency.
--
-- What it is: a row that only ever recovers if the student happens to come
-- back and open that lecture. Nothing pulls it forward on its own, `status`
-- lies indefinitely for anything counting by it, and the student who does not
-- return simply never learns their notes are one tap away. The transcript was
-- already paid for out of their free action; leaving it parked behind a stale
-- claim spends that for nothing.
--
-- ─── MUST MATCH THE CLIENT ───
-- 4 minutes is STALE_GENERATION_MS (app/lecture/[id].tsx:133), NOT the 15
-- minutes 082 uses. The two thresholds are different on purpose: 15 is
-- LECTURE_STALLED_MS, which measures a device that stopped uploading, and note
-- generation is a single server call with a much shorter honest lifetime.
-- 082's rule still governs the choice — never sweep sooner than the client
-- gives up, or the server finalises something the student's screen still shows
-- as working. Here the client has ALREADY given up at four minutes, so the
-- sweep is following it rather than racing it.
--
-- Deliberately one notch more conservative than the client in one place: the
-- client treats a NULL notes_started_at as instantly stale, this falls back to
-- updated_at. A stamp that failed to write is not evidence that the model call
-- behind it also died.
--
-- ─── SAFE IF THE INVOCATION IS SOMEHOW STILL ALIVE ───
-- The success path (index.ts:377) writes notes with `.eq('id', ...)` and no
-- status guard, clearing error_code and notes_started_at as it goes. So a slow
-- invocation that returns after this sweep has reset the row still lands its
-- notes and still ends at 'ready'. The worst case is a student who saw "Try
-- again" for a moment and then got their notes anyway — which is the same
-- thing the client's own four-minute rule already produces.
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
    -- What actually made it through, in order. A segment only carries a
    -- transcript once the provider returned one, so this is exactly the
    -- material finishLecture() would have assembled.
    select
      coalesce(string_agg(nullif(btrim(s.transcript), ''), ' ' order by s.seq), '') as text,
      count(*) filter (where nullif(btrim(s.transcript), '') is not null)           as done_count,
      coalesce(sum(s.seconds), 0)                                                   as total_seconds
    into seg
    from public.lecture_segments s
    where s.lecture_id = rec.id
      and s.status = 'done';

    if seg.done_count > 0 then
      -- Salvage. 'transcribed' rather than 'ready' because notes have not been
      -- written yet — that is the state the app already knows how to act on,
      -- so the student's next visit asks for notes exactly as a healthy
      -- recording would.
      update public.lecture_recordings
      set transcript       = seg.text,
          segment_count    = seg.done_count,
          duration_seconds = seg.total_seconds,
          status           = 'transcribed',
          error_code       = null,
          updated_at       = now()
      where id = rec.id;
    else
      -- Nothing survived. Mark it failed so the student sees a real message
      -- instead of a spinner. STALLED, not a generic failure: it says the
      -- recording stopped reaching us, which is the true story and the one
      -- the support inbox needs.
      update public.lecture_recordings
      set status     = 'failed',
          error_code = 'STALLED',
          updated_at = now()
      where id = rec.id;
    end if;

    swept := swept + 1;
  end loop;

  -- ─── 2. Note generation whose isolate died (107) ────────────
  -- A separate loop rather than another branch above, because the recovery is
  -- not the same shape: there are no segments to reassemble here. The
  -- transcript is already on the row and already correct — the only thing lost
  -- is the claim, so the only thing to undo is the claim.
  -- `has_transcript` rather than the transcript itself: the only question here
  -- is whether there is something to retry against, and a transcript is tens of
  -- kilobytes that would otherwise be copied into this loop's memory for every
  -- stale row to answer a boolean.
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
      -- Exactly the state lecture-study-kit writes when the model itself fails
      -- (index.ts:365), chosen so this adds no state the client has to learn:
      -- 'transcribed' + NOTES_FAILED is already what app/lecture/[id].tsx
      -- renders as the transcript plus a "Try again" button.
      update public.lecture_recordings
      set status           = 'transcribed',
          error_code       = 'NOTES_FAILED',
          notes_started_at = null,
          updated_at       = now()
      where id = rec.id;
    else
      -- Unreachable through the app: the claim is written with
      -- `.eq('status','transcribed')`, and a row only reaches 'transcribed'
      -- with a transcript on it. Handled anyway, because sending a student to
      -- a "Try again" button over an empty transcript would retry forever
      -- against nothing. Same STALLED code as above — the honest story is
      -- still that the material never arrived.
      update public.lecture_recordings
      set status           = 'failed',
          error_code       = 'STALLED',
          notes_started_at = null,
          updated_at       = now()
      where id = rec.id;
    end if;

    swept := swept + 1;
  end loop;

  return swept;
end;
$$;

revoke all on function public.sweep_stalled_lectures() from public, anon, authenticated;
grant execute on function public.sweep_stalled_lectures() to service_role;

comment on function public.sweep_stalled_lectures() is
  'SEMORA (082, extended 107): finalises or fails recordings abandoned mid-upload, and releases note-generation claims whose Edge invocation died. Salvages any transcribed material rather than discarding it — the student was already charged for that audio.';

-- The cron job is untouched on purpose. 'semora-sweep-stalled-lectures' already
-- runs `select public.sweep_stalled_lectures();` every 10 minutes, and this is
-- a create-or-replace of that same function, so the new branch starts running
-- on the next tick with no schedule change to get wrong. Worst-case latency for
-- a dead claim is 4 minutes of staleness plus up to 10 minutes of tick.
