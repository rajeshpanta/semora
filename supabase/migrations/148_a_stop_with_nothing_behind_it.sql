-- ============================================================
-- SEMORA (148): A STOP WITH NOTHING BEHIND IT, AND NO PAGE FOR A WAIT (2026-09-16)
-- ============================================================
-- 140-147 are live. Both functions are redefined from their 147 text with the
-- bounded changes below; nothing else about them moves. Idempotent: CREATE OR
-- REPLACE only, which keeps each function's grants, revokes and comment.
--
--  1. sweep_stalled_lectures section 2b (server-money-privacy-1, M5): a lecture
--     left 'uploading' (the phone's Stop) with no part on the server was never
--     swept — section 1 needs a part row, sections 2b and 3 only looked at
--     'recording'. It blocked a free student from recording (TOO_MANY_IN_FLIGHT)
--     and paged the owner every 6 hours for 3 days. 2b now covers 'recording'
--     and 'uploading' with a heartbeat and no parts:
--       declared 0 → NO_AUDIO after 30 silent minutes following a Stop
--                    ('uploading' or capture_state 'stopped', the 147 rule), or
--                    after greatest(90, limit, reserved minutes) + 30 silent
--                    minutes for a phone that never said Stop;
--       declared N → STALLED after 7 silent days (an offline phone may still
--                    upload the parts).
--     Both refund and release the reservation, as 147's 2b did.
--  2. lecture_health_check section 4 (server-money-privacy-3): 'lecture_stuck'
--     no longer pages for what the sweep deliberately waits on — a paused phone
--     heard from within 12 hours, a recording phone within its limit + 30
--     minutes, a part inside its 12-hour provider window — nor for an 'uploading'
--     lecture with a heartbeat, nothing declared and nothing arrived (2b's). The alert
--     carries a fingerprint of its id-ordered set, so the same lectures are not
--     paged again for 3 days.
-- ============================================================

-- ── 1. the sweep (server-money-privacy-1) ───────────────────────
CREATE OR REPLACE FUNCTION public.sweep_stalled_lectures(p_max_recording_minutes integer DEFAULT 90)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  swept   integer := 0;
  rec     record;
  seg     record;
  n       integer;
  unrecoverable jsonb := '[]'::jsonb;
begin
  -- ─── 1. Abandoned mid-upload (082; 138: never while still recording) ──
  for rec in
    select r.id, r.user_id
    from public.lecture_recordings r
    where r.updated_at < now() - interval '15 minutes'
      and (
        -- Versions without a heartbeat: exactly the 138 rules.
        (
          r.last_heartbeat_at is null
          and r.status in ('uploading', 'transcribing')
          and (
            coalesce(r.segment_count, 0) > 0
            or (
              r.updated_at < now() - interval '3 hours'
              and not exists (
                select 1 from public.lecture_segments s
                where s.lecture_id = r.id
                  and s.created_at > now() - interval '3 hours'
              )
            )
          )
        )
        or
        -- 143: the phone says whether it is still recording.
        (
          r.last_heartbeat_at is not null
          and r.status in ('recording', 'uploading', 'transcribing')
          and exists (select 1 from public.lecture_segments s where s.lecture_id = r.id)
          and (
            r.capture_state = 'stopped'
            or (r.capture_state = 'recording'
                -- The lecture's own reserved length (the server's limit when it
                -- started), so a raised LECTURE_MAX_SECONDS needs no cron edit.
                and r.last_heartbeat_at < now() - make_interval(
                  mins => greatest(90, p_max_recording_minutes, coalesce(r.reserved_seconds, 0) / 60) + 30))
            or (r.capture_state = 'paused'    and r.last_heartbeat_at < now() - interval '12 hours')
          )
          -- Nothing that reached the server is still waiting on the provider.
          and not exists (
            select 1 from public.lecture_segments s
            where s.lecture_id = r.id
              and s.status in ('pending', 'uploaded', 'transcribing')
              and s.storage_path is not null
              and s.provider_failures < 6
              -- audit: a part recovery has given up on is not "in flight"
              and s.recovery_attempts < 3
              -- 147: a part waiting on the provider (a 429 raises no
              -- provider_failures) is in flight for 12 hours from its first
              -- refusal — PROVIDER_GIVE_UP_MS, the same bound maybeFinalize
              -- uses. Past that the lecture is finished from its done parts
              -- with parts_missing > 0; the arrival job keeps retrying the
              -- part, and a late success is folded in by
              -- lecture_rebuild_transcript. A spent daily quota used to hold a
              -- lecture open, unfinished, for as long as it stayed spent.
              and (s.first_provider_failure_at is null
                   or s.first_provider_failure_at > now() - interval '12 hours')
          )
        )
      )
    for update skip locked
  loop
    select a.transcript as text, a.text_parts as done_count, a.total_seconds
      into seg
    from public.lecture_assemble_transcript(rec.id) a;

    if seg.done_count > 0 then
      update public.lecture_recordings
      set transcript       = seg.text,
          segment_count    = greatest(coalesce(segment_count, 0), seg.done_count),
          duration_seconds = seg.total_seconds,
          -- 143: a transcript too short to write notes from is shown as it is.
          status           = case when length(public.lecture_transcript_words(seg.text)) < 200 then 'ready' else 'transcribed' end,
          error_code       = case when length(public.lecture_transcript_words(seg.text)) < 200 then 'TOO_SHORT_FOR_NOTES' end,
          updated_at       = now()
      where id = rec.id;
      perform public.lecture_set_parts_missing(rec.id);
    elsif exists (
      select 1 from public.lecture_segments s
      where s.lecture_id = rec.id and s.status in ('pending', 'uploaded', 'transcribing')
        and s.storage_path is not null and s.provider_failures < 6 and s.recovery_attempts < 3
        -- 147: same 12-hour bound as above
        and (s.first_provider_failure_at is null or s.first_provider_failure_at > now() - interval '12 hours')
    ) and exists (
      select 1 from public.lecture_recordings r2 where r2.id = rec.id and r2.last_heartbeat_at is not null
    ) then
      -- 143: parts are still on their way (a provider retry, a slow upload).
      -- Nothing is failed while there is still audio to transcribe.
      continue;
    else
      -- Nothing usable was delivered: the free allowance goes back (audit).
      -- lecture_refund_usage refuses on its own if any done part holds text.
      update public.lecture_recordings
      set status     = 'failed',
          error_code = case
            when exists (select 1 from public.lecture_segments s where s.lecture_id = rec.id and s.status = 'done')
              then 'NO_SPEECH' else 'STALLED' end,
          updated_at = now()
      where id = rec.id;
      perform public.lecture_refund_usage(rec.user_id, rec.id, 'STALLED');
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

  -- ─── 2b. Reached the server, never sent a part, phone gone (147, 148) ───
  -- A lecture whose phone reported Stop, holds no parts, and has been silent
  -- for 30 minutes: Stop landed before any audio was closed (a tap within the
  -- first seconds). Nothing is on its way. Left 'recording' it blocked
  -- a free account from recording again (start refuses while one is in
  -- flight) for the two hours the rule below waits. Failed as NO_AUDIO, its
  -- charge refunded (there is nothing to refund unless a part was transcribed
  -- and then deleted, and lecture_refund_usage refuses if any text exists) and
  -- its reservation released. A part that arrives later still moves the
  -- lecture back to 'transcribing' (handleSegment) and is charged again.
  --
  -- 148 (server-money-privacy-1): the same lecture left 'uploading' was never
  -- swept at all. finishLecture sets 'uploading' with the declared count, so
  -- 'uploading' IS the phone's Stop; section 1 needs a part row and section 3
  -- only looks at 'recording', so a Stop with no part on the server blocked a
  -- free account (TOO_MANY_IN_FLIGHT) and paged the owner for three days.
  --   declared 0 parts → NO_AUDIO once the phone has been silent 30 minutes
  --     after saying Stop ('uploading', or capture_state 'stopped'), or once a
  --     'recording' phone has been silent past its whole recording limit plus
  --     30 minutes. A phone recording offline inside its limit is never failed
  --     here.
  --   declared parts, none arrived → STALLED after 7 days of silence: an
  --     offline phone may still upload them (the same 7 days section 4 gives a
  --     missing part).
  for rec in
    select r.id, r.user_id, coalesce(r.segment_count, 0) as declared
    from public.lecture_recordings r
    where r.status in ('recording', 'uploading')
      and r.source = 'recording'
      and r.last_heartbeat_at is not null
      and not exists (select 1 from public.lecture_segments s where s.lecture_id = r.id)
      and (
        (
          coalesce(r.segment_count, 0) = 0
          and (
            -- the phone SAID it stopped
            ((r.capture_state = 'stopped' or r.status = 'uploading')
              and r.last_heartbeat_at < now() - interval '30 minutes')
            -- or it has been silent longer than it could still be recording
            -- (section 1's bound, so a raised limit needs no cron edit)
            or r.last_heartbeat_at < now() - make_interval(
                 mins => greatest(90, p_max_recording_minutes, coalesce(r.reserved_seconds, 0) / 60) + 30)
          )
        )
        or (
          coalesce(r.segment_count, 0) > 0
          and r.last_heartbeat_at < now() - interval '7 days'
        )
      )
    for update skip locked
  loop
    update public.lecture_recordings
       set status     = 'failed',
           error_code = case when rec.declared = 0 then 'NO_AUDIO' else 'STALLED' end,
           updated_at = now()
     where id = rec.id;
    perform public.lecture_refund_usage(rec.user_id, rec.id, case when rec.declared = 0 then 'NO_AUDIO' else 'STALLED' end);
    perform public.release_lecture_reservation(rec.id);
    swept := swept + 1;
  end loop;

  -- ─── 3. Never left the starting line (110, corrected in 138) ───
  for rec in
    select r.id, r.user_id
    from public.lecture_recordings r
    where r.status = 'recording'
      and (
        (
          not exists (select 1 from public.lecture_segments s where s.lecture_id = r.id)
          and r.created_at < now() - interval '2 hours'
          -- 143: a phone still reporting in is recording offline; wait for it.
          and (r.last_heartbeat_at is null or r.last_heartbeat_at < now() - interval '2 hours')
        )
        or
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
    select a.transcript as text, a.text_parts as done_count, a.total_seconds
      into seg
    from public.lecture_assemble_transcript(rec.id) a;

    if seg.done_count > 0 then
      update public.lecture_recordings
      set transcript       = seg.text,
          segment_count    = greatest(coalesce(segment_count, 0), seg.done_count),
          duration_seconds = seg.total_seconds,
          status           = case when length(public.lecture_transcript_words(seg.text)) < 200 then 'ready' else 'transcribed' end,
          error_code       = case when length(public.lecture_transcript_words(seg.text)) < 200 then 'TOO_SHORT_FOR_NOTES' end,
          updated_at       = now()
      where id = rec.id;
      perform public.lecture_set_parts_missing(rec.id);
    else
      -- Nothing usable was delivered: the free allowance goes back (audit).
      -- lecture_refund_usage refuses on its own if any done part holds text.
      update public.lecture_recordings
      set status     = 'failed',
          error_code = case
            when exists (select 1 from public.lecture_segments s where s.lecture_id = rec.id and s.status = 'done')
              then 'NO_SPEECH' else 'STALLED' end,
          updated_at = now()
      where id = rec.id;
      perform public.lecture_refund_usage(rec.user_id, rec.id, 'STALLED');
    end if;

    swept := swept + 1;
  end loop;

  -- ─── 4. Parts that never arrived within 7 days (138, unchanged) ─────────
  for rec in
    select r.id, r.user_id, r.parts_missing
    from public.lecture_recordings r
    where r.parts_missing > 0
      and r.parts_unrecoverable_at is null
      and r.parts_missing_since < now() - interval '7 days'
      and r.status in ('transcribed', 'generating', 'ready', 'failed')
    for update skip locked
  loop
    update public.lecture_recordings
       set parts_unrecoverable_at = now()
     where id = rec.id;
    unrecoverable := unrecoverable || jsonb_build_object('lecture_id', rec.id, 'parts_missing', rec.parts_missing);
    swept := swept + 1;
  end loop;
  -- One alert per run (audit): a bad week used to send one push and one email
  -- per lecture.
  if jsonb_array_length(unrecoverable) > 0 then
    insert into public.ops_alerts (kind, detail, delivered)
    values (
      'lecture_parts_unrecoverable',
      jsonb_build_object(
        'lectures', unrecoverable,
        'count', jsonb_array_length(unrecoverable),
        'summary', jsonb_array_length(unrecoverable) || ' lecture(s) have parts that never reached the server within 7 days.',
        'meaning', 'parts of these recordings never reached the server within 7 days',
        'student_sees', 'the lecture is labelled as missing these parts'
      ),
      false
    );
  end if;

  -- ─── 5. A quiz claim whose isolate died (143) ─────────────────
  update public.lecture_recordings
     set quiz_generating = false,
         quiz_started_at = null
   where quiz_generating
     and coalesce(quiz_started_at, updated_at) < now() - interval '5 minutes';
  get diagnostics n = row_count;
  swept := swept + n;

  return swept;
end;
$function$;

-- ── 2. the health check (server-money-privacy-3) ────────────────
create or replace function public.lecture_health_check(
  p_hour_cap_seconds integer default 7200,
  p_day_cap_seconds  integer default 28800
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  raised integer := 0;
  n      integer;
  ids    jsonb;
  used   integer;
begin
  -- 148: section 4 skips what the sweep is deliberately waiting on, and
  -- fingerprints its (id-ordered) set.
  -- 147: every lecture list is ordered by id, inside the LIMIT and inside the
  -- aggregate, so the fingerprint of the same set of lectures is the same on
  -- every run. Heap order changed between hourly runs, the md5 differed, the
  -- 3-day dedupe missed, and the same lectures were alerted on again.

  -- 1. Finished in the last two hours with parts missing.
  select count(*), jsonb_agg(left(id::text, 8) order by id)
    into n, ids
  from (
    select id from public.lecture_recordings
    where source = 'recording'
      and status in ('transcribed', 'generating', 'ready')
      and parts_missing > 0
      and updated_at > now() - interval '2 hours'
      and created_at > now() - interval '2 days'
    order by id
    limit 20
  ) x;
  if n > 0 and public.lecture_raise_alert('lecture_parts_missing',
       n || ' recent lecture(s) finished with parts missing.',
       jsonb_build_object('lectures', ids, 'fingerprint', ids::text, 'check',
         'select id, segment_count, parts_missing, capture_state, app_build from lecture_recordings where parts_missing > 0 order by updated_at desc limit 20')) then
    raised := raised + 1;
  end if;

  -- 2. The phone captured noticeably less audio than the session lasted.
  --    capture_wall_seconds is the time the session spent RECORDING (the app
  --    excludes pauses), so a student who paused is not a gap.
  select count(*), jsonb_agg(left(id::text, 8) order by id)
    into n, ids
  from (
    select id from public.lecture_recordings
    where capture_state = 'stopped'
      and capture_wall_seconds >= 600
      and captured_seconds is not null
      and captured_seconds < capture_wall_seconds * 0.95
      and last_heartbeat_at > now() - interval '2 hours'
    order by id
    limit 20
  ) x;
  if n > 0 and public.lecture_raise_alert('lecture_capture_gap',
       n || ' recording(s) captured less than 95% of the session.',
       jsonb_build_object('lectures', ids, 'check',
         'select id, capture_wall_seconds, captured_seconds, app_build from lecture_recordings where capture_state = ''stopped'' order by last_heartbeat_at desc limit 20')) then
    raised := raised + 1;
  end if;

  -- 3. Sessions that ran far past any recording limit (3.5 hours of wall time),
  --    by the phone's report or by the spread of its parts.
  select count(*), jsonb_agg(left(id::text, 8) order by id)
    into n, ids
  from (
    -- Reported by the phone itself (1.15+). The spread of part arrival times is
    -- NOT used: a phone that uploads a backlog days later would look like one.
    select r.id
    from public.lecture_recordings r
    where r.source = 'recording'
      and r.last_heartbeat_at > now() - interval '2 hours'
      and coalesce(r.capture_wall_seconds, 0) > 12600
    order by id
    limit 20
  ) x;
  if n > 0 and public.lecture_raise_alert('lecture_runaway_session',
       n || ' recording session(s) ran for more than 3.5 hours of wall time.',
       jsonb_build_object('lectures', ids)) then
    raised := raised + 1;
  end if;

  -- 4. Stuck in a working state.
  select count(*), jsonb_agg(left(id::text, 8) order by id)
    into n, ids
  from (
    select id from public.lecture_recordings r
    where created_at > now() - interval '3 days'
      and (
        (status in ('uploading', 'transcribing')
          and updated_at < now() - interval '1 hour'
          and (last_heartbeat_at is null or last_heartbeat_at < now() - interval '1 hour')
          -- an older app's undeclared lecture legitimately waits up to 3 hours
          and (segment_count > 0 or last_heartbeat_at is not null or updated_at < now() - interval '3 hours')
          -- 148 (server-money-privacy-1): a Stop with nothing declared and
          -- nothing arrived, from a phone that reports in, is the sweep's to
          -- fail (section 2b), not a stuck lecture. Scoped to exactly 2b's
          -- rows: an older app's (no heartbeat) or a 'transcribing' one is
          -- only failed by rules that may not fire, so it still pages.
          and not (status = 'uploading'
                   and last_heartbeat_at is not null
                   and coalesce(segment_count, 0) = 0
                   and not exists (select 1 from public.lecture_segments s where s.lecture_id = r.id))
          -- 148 (server-money-privacy-3): what the sweep deliberately waits on
          -- is not stuck. A paused phone gets 12 hours ...
          -- (coalesce: an older app has no capture_state or heartbeat, and a
          -- NULL here would silently drop it from the page)
          and not coalesce(capture_state = 'paused' and last_heartbeat_at > now() - interval '12 hours', false)
          -- ... a recording phone its whole recording limit plus 30 minutes ...
          and not coalesce(capture_state = 'recording'
                   and last_heartbeat_at > now() - make_interval(
                         mins => greatest(90, coalesce(reserved_seconds, 0) / 60) + 30), false)
          -- ... and a part the provider refused, 12 hours from its first refusal.
          and not exists (
            select 1 from public.lecture_segments s
            where s.lecture_id = r.id
              and s.status in ('pending', 'uploaded', 'transcribing')
              and s.provider_failures < 6
              and s.recovery_attempts < 3
              and s.first_provider_failure_at > now() - interval '12 hours'
          ))
        or (status = 'generating' and coalesce(notes_started_at, updated_at) < now() - interval '10 minutes')
        or (status = 'transcribed' and notes_md is null and notes_auto_attempts >= 3)
      )
    order by id
    limit 20
  ) x;
  if n > 0 and public.lecture_raise_alert('lecture_stuck',
       n || ' lecture(s) stuck in a working state for over an hour.',
       -- 148: the same stuck set is not paged again for 3 days
       jsonb_build_object('lectures', ids, 'fingerprint', ids::text)) then
    raised := raised + 1;
  end if;

  -- 5. Notes cut at the model's output limit.
  select count(*) into n from public.lecture_recordings
  where notes_truncated and updated_at > now() - interval '2 hours';
  if n > 0 and public.lecture_raise_alert('lecture_notes_truncated',
       n || ' lecture(s) had notes cut at the model output limit.', '{}'::jsonb) then
    raised := raised + 1;
  end if;

  -- 6. Parts that are long but hold almost no speech: a dead or muffled mic.
  select count(*) into n from public.lecture_segments
  where status = 'done'
    and seconds >= 120
    and speech_seconds is not null
    and speech_seconds < 3
    and created_at > now() - interval '2 hours';
  if n >= 5 and public.lecture_raise_alert('lecture_silent_parts',
       n || ' parts in 2 hours were silent end to end (possible dead microphones).', '{}'::jsonb) then
    raised := raised + 1;
  end if;

  -- 7. Transcription failures in the last hour.
  select coalesce(sum(failures), 0) into n from public.lecture_transcription_usage
  where hour >= date_trunc('hour', now()) - interval '1 hour';
  if n >= 5 and public.lecture_raise_alert('lecture_provider_failing',
       n || ' transcription requests failed in the last hour. Parts are kept and retried.', '{}'::jsonb) then
    raised := raised + 1;
  end if;

  -- 8. Provider usage near its organisation-wide caps.
  select coalesce(sum(audio_seconds), 0) into used from public.lecture_transcription_usage
  where hour = date_trunc('hour', now());
  if used > p_hour_cap_seconds * 0.8 and public.lecture_raise_alert('lecture_usage_hour_high',
       used || ' of ' || p_hour_cap_seconds || ' audio-seconds used this hour.', '{}'::jsonb) then
    raised := raised + 1;
  end if;
  select coalesce(sum(audio_seconds), 0) into used from public.lecture_transcription_usage
  where hour >= date_trunc('day', now());
  if used > p_day_cap_seconds * 0.8 and public.lecture_raise_alert('lecture_usage_day_high',
       used || ' of ' || p_day_cap_seconds || ' audio-seconds used today (UTC).', '{}'::jsonb) then
    raised := raised + 1;
  end if;

  perform public.lecture_deliver_ops_alerts();
  return raised;
end;
$$;
