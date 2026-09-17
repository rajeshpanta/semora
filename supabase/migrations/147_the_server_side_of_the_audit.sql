-- ============================================================
-- SEMORA (147): THE SERVER SIDE OF THE AUDIT (2026-09-16)
-- ============================================================
-- 140-146 are live. Every function below is redefined from its live text with
-- one bounded change each; nothing else about it moves. Idempotent: every
-- statement is CREATE OR REPLACE or a cron upsert by name.
--
--  1. lecture_audio_object_part accepts part numbers up to 999, the same bound
--     as 142's insert trigger (server-and-ops-13). It matched seg_[0-9]{3} < 200,
--     so an object seg_205.m4a whose row never landed was neither adopted by the
--     arrival job nor protected from lecture_orphaned_audio.
--  2. lecture_recordings_client_columns: a recording's declared segment_count
--     and duration_seconds can only grow (code-gaps-8). A re-sent Stop with a
--     smaller number used to shrink the declared count and hide missing parts.
--  3. lecture_audio_awaiting_deletion collects a 'done' part whatever its
--     lecture's status (server-and-ops-6): its transcript is on the row, so
--     the audio has done its job. The 15-minute "still arriving" guard stays.
--     alert_lecture_audio_retained counts the same way.
--  4. lecture_take_over_arrived_audio has a circuit breaker (server-and-ops-3):
--     when the provider has failed at least half of the last 10 minutes'
--     requests (5 or more), one probe part is dispatched per run instead of a
--     batch, so an outage is not amplified into 60 requests a minute.
--  5. sweep_stalled_lectures (server-and-ops-1, student-journeys-4):
--     a part waiting on the provider counts as in flight only for 12 hours
--     from first_provider_failure_at (PROVIDER_GIVE_UP_MS); after that the
--     lecture is finished from its done parts with parts_missing > 0, and the
--     arrival job keeps retrying the part — a late success folds in through
--     lecture_rebuild_transcript. And a 'recording' lecture with no parts whose
--     phone has not reported in for 30 minutes fails as NO_AUDIO, refunded and
--     released, instead of blocking a free account for two hours.
--     request_pending_lecture_notes uses the same 12-hour rule, or the partial
--     notes the sweep just made possible would wait on the same part.
--  6. lecture_health_check orders every jsonb_agg by id (server-and-ops-5), so
--     the alert fingerprint of the same set of lectures is the same every hour.
--  7. semora-finish-lecture-notes runs every 2 minutes (server-and-ops-8), same
--     command as 115: the 1-minute settle in 143 was still bounded by a
--     10-minute cron, and sectioned notes advanced one step per tick.
-- ============================================================

-- ── 1. part numbers 0-999 (server-and-ops-13) ───────────────────
CREATE OR REPLACE FUNCTION public.lecture_audio_object_part(p_name text)
 RETURNS TABLE(lecture_id uuid, user_id uuid, seq integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select r.id, r.user_id, m[3]::integer
  from (
    select regexp_match(
      p_name,
      -- 147: 3-4 digits, at most 999 — the bound 142's insert trigger and the
      -- transcript assembler use (lpad(seq, greatest(3, length(seq)))). It was
      -- seg_[0-9]{3} and < 200, so parts 200-999 were invisible here.
      '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/seg_([0-9]{3,4})\.m4a$'
    ) as m
  ) parsed
  join public.lecture_recordings r
    on r.id = m[2]::uuid
   and r.user_id = m[1]::uuid
   and r.source = 'recording'
  where m is not null
    and m[3]::integer <= 999;
$function$;

-- ── 2. a declared count only grows (code-gaps-8) ────────────────
create or replace function public.lecture_recordings_client_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- The only row the app creates is a document note (own_document_notes_insert
    -- already requires source 'document'): title, course, file name, extracted
    -- text, and 'transcribed' so notes can be written from it.
    return jsonb_populate_record(
      null::public.lecture_recordings,
      jsonb_build_object(
        'id',              coalesce(new.id, gen_random_uuid()),
        'user_id',         new.user_id,
        'course_id',       new.course_id,
        'title',           new.title,
        'transcript',      new.transcript,
        'source',          new.source,
        'source_filename', new.source_filename,
        'status',          'transcribed',
        'duration_seconds', 0,
        'segment_count',   0,
        'quiz_generating', false,
        'reserved_seconds', 0,
        'notes_auto_attempts', 0,
        'parts_missing',   0,
        'notes_stale',     false,
        'transcript_rev',  0,
        -- 142: the row is built from nothing, so column defaults do not apply;
        -- every NOT NULL column must be named or a document note cannot be made.
        'notes_rewrite_requested', false,
        'notes_truncated', false,
        'quiz_stale',      false,
        'created_at',      now(),
        'updated_at',      now()
      )
    );
  end if;

  -- UPDATE. The app renames nothing here, files a lecture under a course or a
  -- flashcard deck, and reports Stop (finishLecture: count, duration, 'uploading').
  return jsonb_populate_record(
    old,
    jsonb_build_object(
      'title',     new.title,
      'course_id', new.course_id,
      'deck_id',   new.deck_id,
      -- 147: a recording's declared count and duration only ever grow. A Stop
      -- re-sent with a smaller number (a journal write that failed, an older
      -- build declaring again) used to shrink segment_count and hide the parts
      -- that never arrived. A document's stay as they were.
      'segment_count',
        case when old.source = 'recording'
             then greatest(coalesce(old.segment_count, 0), coalesce(new.segment_count, 0))
             else old.segment_count end,
      'duration_seconds',
        case when old.source = 'recording'
             then greatest(coalesce(old.duration_seconds, 0), coalesce(new.duration_seconds, 0))
             else old.duration_seconds end,
      'status',
        case
          when old.source = 'recording'
           and new.status = 'uploading'
           and old.status in ('recording', 'uploading', 'transcribing', 'failed')
            then 'uploading'
          else old.status
        end
    )
  );
end;
$$;

-- ── 3. transcribed audio is finished with (server-and-ops-6) ────
create or replace function public.lecture_audio_awaiting_deletion(p_limit integer default 25)
returns table(lecture_id uuid, paths text[])
language sql
stable security definer
set search_path to 'public'
as $function$
  select s.lecture_id,
         array_agg(s.storage_path order by s.seq) as paths
  from public.lecture_segments s
  join public.lecture_recordings r on r.id = s.lecture_id
  where s.storage_path is not null
    and (
      s.status = 'done'
      or (s.status = 'failed' and s.recovery_attempts >= 3)
      -- 142
      or (s.status = 'transcribing' and s.recovery_attempts >= 3
          and s.claimed_at < now() - interval '1 hour')
      -- Audit: a part the recovery job has given up on (a free allowance
      -- refused it, say) is as finished as a failed one.
      or (s.status in ('pending', 'uploaded') and s.recovery_attempts >= 3)
      -- Audit: past the 7-day arrival window nothing acts on a part again, so
      -- its audio would otherwise stay forever, past the privacy promise.
      or (s.status <> 'done' and s.created_at < now() - interval '8 days')
    )
    -- 147: a 'done' part is finished with whatever its lecture is doing — its
    -- transcript is on the row, and the assembler and rebuild read only that.
    -- Requiring the lecture to be over kept eleven transcribed parts of a
    -- forgotten paused lecture in the bucket for the 12 hours the sweep gives
    -- it. The 15-minute guard below still keeps a live lecture's audio while
    -- parts are landing.
    and (s.status = 'done'
         or r.status in ('ready', 'transcribed', 'generating', 'failed')
         or (s.status <> 'done' and s.created_at < now() - interval '8 days'))
    and not exists (
      select 1 from public.lecture_segments s2
      where s2.lecture_id = s.lecture_id
        and s2.created_at > now() - interval '15 minutes'
    )
  group by s.lecture_id
  order by s.lecture_id
  limit greatest(1, p_limit);
$function$;

create or replace function public.alert_lecture_audio_retained()
returns integer
language plpgsql
security definer
set search_path to 'public', 'storage', 'pg_temp'
as $function$
declare
  stale    integer;
  orphaned integer;
begin
  select count(*) into stale
  from public.lecture_segments s
  join public.lecture_recordings r on r.id = s.lecture_id
  where s.storage_path is not null
    and (
      -- 147: same rule as lecture_audio_awaiting_deletion — a transcribed
      -- part's audio is due for deletion whatever its lecture's status.
      (s.status = 'done'
       and nullif(btrim(coalesce(s.transcript, '')), '') is not null
       and s.created_at < now() - interval '24 hours')
      -- 146: audio nothing will ever act on again (the 7-day arrival window
      -- has passed) that retention has not collected within a day.
      or (s.status <> 'done' and s.created_at < now() - interval '9 days')
    );

  select count(*) into orphaned
  from storage.objects o
  where o.bucket_id = 'lectures'
    and not exists (select 1 from public.lecture_segments s where s.storage_path = o.name)
    -- 139: same rule as lecture_orphaned_audio.
    and not public.lecture_audio_is_actionable(o.name, o.created_at)
    -- 48h, not 24: one full day past the point the janitor first becomes
    -- eligible to collect it, so a single missed tick is not an alert.
    and o.created_at < now() - interval '48 hours';

  if stale + orphaned = 0 then
    return 0;
  end if;

  if exists (
    select 1 from public.ops_alerts
    where kind = 'lecture_audio_retained'
      and created_at > now() - interval '12 hours'
  ) then
    return 0;
  end if;

  insert into public.ops_alerts (kind, detail, delivered)
  values (
    'lecture_audio_retained',
    jsonb_build_object(
      'transcribed_but_retained', stale,
      'orphaned_no_row', orphaned,
      'meaning', 'lecture audio that should have been deleted is still in the bucket',
      'likely_cause', 'lecture-retention deployed without --no-verify-jwt, or storage refusing the delete',
      'check', 'select status_code, left(content,120) from net._http_response order by id desc limit 5'
    ),
    false
  );

  return stale + orphaned;
end;
$function$;

-- ── 4. the arrival job backs off a failing provider (server-and-ops-3) ──
create or replace function public.lecture_take_over_arrived_audio(p_limit integer default 5)
returns integer
language plpgsql
security definer
set search_path = public, storage, vault, pg_temp
as $$
declare
  secret     text;
  obj        record;
  part       record;
  seg        record;
  dispatched integer := 0;
  reqs       integer;
  fails      integer;
  batch      integer;
begin
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'semora_lecture_cron_secret';

  if secret is null then
    return 0;
  end if;

  -- 147: CIRCUIT BREAKER. When the provider has refused at least half of the
  -- recent requests (5 or more of them), one probe part per run is enough to
  -- notice it is back; a full batch every minute against an outage or a spent
  -- daily quota was up to 60 provider requests a minute from recovery alone.
  -- Usage is counted per UTC hour (lecture_count_transcription), so "recent"
  -- is the hour buckets touching the last 10 minutes.
  select coalesce(sum(u.requests), 0), coalesce(sum(u.failures), 0)
    into reqs, fails
  from public.lecture_transcription_usage u
  where u.hour >= date_trunc('hour', now() - interval '10 minutes');
  batch := case when reqs >= 5 and fails * 2 >= reqs then 1 else greatest(1, p_limit) end;

  -- 1-3. Give every recent object a row that points at it (139, unchanged).
  for obj in
    select o.name, o.created_at
    from storage.objects o
    where o.bucket_id = 'lectures'
      and o.created_at < now() - interval '1 minute'
      and o.created_at > now() - interval '7 days'
      and not exists (
        select 1 from public.lecture_segments s where s.storage_path = o.name
      )
      and public.lecture_audio_is_actionable(o.name, o.created_at)
    order by o.created_at
    limit 50
  loop
    select * into part from public.lecture_audio_object_part(obj.name);
    if not found then
      continue;
    end if;

    select id, status, storage_path into seg
    from public.lecture_segments
    where lecture_id = part.lecture_id and seq = part.seq
    for update;

    if not found then
      insert into public.lecture_segments (lecture_id, user_id, seq, storage_path, status)
      values (part.lecture_id, part.user_id, part.seq, obj.name, 'uploaded')
      on conflict (lecture_id, seq) do nothing;
    elsif seg.storage_path is null and seg.status in ('pending', 'uploaded', 'failed') then
      update public.lecture_segments
         set storage_path      = obj.name,
             status            = 'uploaded',
             claimed_at        = null,
             recovery_attempts = 0
       where id = seg.id;
    end if;
  end loop;

  -- 4. Hand parts with audio to lecture-transcribe, oldest first, at most four
  -- per student per run (audit: two drained a provider outage's backlog at 300
  -- parts an hour for the whole app).
  for seg in
    select c.id
    from (
      select s.id,
             o.created_at,
             row_number() over (partition by s.user_id order by o.created_at) as nth
      from public.lecture_segments s
      join storage.objects o
        on o.bucket_id = 'lectures' and o.name = s.storage_path
      where o.created_at < now() - interval '1 minute'
        and o.created_at > now() - interval '7 days'
        and s.status in ('pending', 'uploaded', 'failed', 'transcribing')
        -- 142: 5 minutes. An edge invocation cannot outlive 150 seconds, so a
        -- claim older than this has nobody behind it (STALE_CLAIM_MS).
        and not (s.status = 'transcribing' and s.claimed_at > now() - interval '5 minutes')
        and s.recovery_attempts < 3
        and (s.dispatched_at is null or s.dispatched_at < now() - interval '10 minutes')
    ) c
    where c.nth <= 4
    order by c.created_at
    limit batch
  loop
    update public.lecture_segments
       set dispatched_at = now()
     where id = seg.id
       and (dispatched_at is null or dispatched_at < now() - interval '10 minutes');
    if not found then
      continue;
    end if;

    perform net.http_post(
      url     := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/lecture-transcribe',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-semora-lecture-cron-secret', secret
      ),
      body := jsonb_build_object(
        'action', 'recover',
        'segmentId', seg.id
      ),
      timeout_milliseconds := 150000
    );

    dispatched := dispatched + 1;
  end loop;

  return dispatched;
end;
$$;

-- ── 5. the sweep (server-and-ops-1, student-journeys-4) ─────────
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

  -- ─── 2b. Reached the server, never sent a part, phone gone (147) ───
  -- A lecture whose phone reported Stop, holds no parts, and has been silent
  -- for 30 minutes: Stop landed before any audio was closed (a tap within the
  -- first seconds). Nothing is on its way. Left 'recording' it blocked
  -- a free account from recording again (start refuses while one is in
  -- flight) for the two hours the rule below waits. Failed as NO_AUDIO, its
  -- charge refunded (there is nothing to refund unless a part was transcribed
  -- and then deleted, and lecture_refund_usage refuses if any text exists) and
  -- its reservation released. A part that arrives later still moves the
  -- lecture back to 'transcribing' (handleSegment) and is charged again.
  for rec in
    select r.id, r.user_id
    from public.lecture_recordings r
    where r.status = 'recording'
      and r.source = 'recording'
      -- Only when the phone SAID it stopped: a phone recording offline sends
      -- no heartbeats and (on the app-store engine) closes no parts while
      -- locked, so silence alone must not fail a lecture — section 3's
      -- two-hour rule keeps that case.
      and r.capture_state = 'stopped'
      and r.last_heartbeat_at is not null
      and r.last_heartbeat_at < now() - interval '30 minutes'
      and not exists (select 1 from public.lecture_segments s where s.lecture_id = r.id)
    for update skip locked
  loop
    update public.lecture_recordings
       set status     = 'failed',
           error_code = 'NO_AUDIO',
           updated_at = now()
     where id = rec.id;
    perform public.lecture_refund_usage(rec.user_id, rec.id, 'NO_AUDIO');
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

CREATE OR REPLACE FUNCTION public.request_pending_lecture_notes(p_limit integer DEFAULT 5)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'pg_temp'
AS $function$
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
    where (
            (r.status = 'transcribed' and r.notes_md is null)
            -- 138: notes written from a transcript that has since grown.
            -- 143: or a quiet rewrite was asked for.
            or (r.status in ('transcribed', 'ready') and (r.notes_stale or r.notes_rewrite_requested))
          )
      and length(btrim(coalesce(r.transcript, ''))) >= 200
      and r.notes_auto_attempts < 3
      and (
        -- 143: the recording is known to be over — the phone said Stop, or the
        -- server finished a heartbeat lecture whose phone went quiet. A short
        -- settle is enough.
        (
          (r.capture_state = 'stopped'
           or (r.last_heartbeat_at is not null and r.last_heartbeat_at < now() - interval '2 hours'))
          and r.updated_at < now() - interval '1 minute'
          and not exists (
            select 1 from public.lecture_segments s
            where s.lecture_id = r.id
              and (
                s.created_at > now() - interval '2 minutes'
                -- a part that reached the server and is still being transcribed
                -- (147: for at most 12 hours from its first provider refusal,
                -- the sweep's bound, or the partial notes the sweep just made
                -- possible would wait on the same part)
                or (s.status in ('pending', 'uploaded', 'transcribing')
                    and s.storage_path is not null and s.provider_failures < 6
                    and s.recovery_attempts < 3
                    and (s.first_provider_failure_at is null
                         or s.first_provider_failure_at > now() - interval '12 hours'))
              )
          )
        )
        or
        -- A long lecture's FIRST notes, part-way through their sections: carry
        -- on promptly rather than waiting the full 10 minutes between steps.
        -- Only while no notes exist yet and no audio is arriving (review
        -- finding): section rows outlive the notes, and without these guards
        -- every late part of a long lecture set off a paid rewrite a minute
        -- later, over a lecture still receiving audio.
        (
          r.status = 'transcribed' and r.notes_md is null
          and r.updated_at < now() - interval '1 minute'
          and exists (select 1 from public.lecture_note_sections n where n.lecture_id = r.id)
          and not exists (
            select 1 from public.lecture_segments s
            where s.lecture_id = r.id
              and (
                s.created_at > now() - interval '15 minutes'
                or (s.status in ('pending', 'uploaded', 'transcribing')
                    and s.storage_path is not null and s.provider_failures < 6
                    and s.recovery_attempts < 3
                    -- 147: same 12-hour bound
                    and (s.first_provider_failure_at is null
                         or s.first_provider_failure_at > now() - interval '12 hours'))
              )
          )
        )
        or
        -- Everything else: the 138 wait. A lecture still receiving segments is
        -- still being recorded, whatever its status column says.
        (
          r.updated_at < now() - interval '10 minutes'
          and not exists (
            select 1 from public.lecture_segments s
            where s.lecture_id = r.id
              and s.created_at > now() - interval '15 minutes'
          )
        )
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
$function$;

-- ── 6. deterministic alert fingerprints (server-and-ops-5) ──────
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
    select id from public.lecture_recordings
    where created_at > now() - interval '3 days'
      and (
        (status in ('uploading', 'transcribing')
          and updated_at < now() - interval '1 hour'
          and (last_heartbeat_at is null or last_heartbeat_at < now() - interval '1 hour')
          -- an older app's undeclared lecture legitimately waits up to 3 hours
          and (segment_count > 0 or last_heartbeat_at is not null or updated_at < now() - interval '3 hours'))
        or (status = 'generating' and coalesce(notes_started_at, updated_at) < now() - interval '10 minutes')
        or (status = 'transcribed' and notes_md is null and notes_auto_attempts >= 3)
      )
    order by id
    limit 20
  ) x;
  if n > 0 and public.lecture_raise_alert('lecture_stuck',
       n || ' lecture(s) stuck in a working state for over an hour.',
       jsonb_build_object('lectures', ids)) then
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

-- ── 7. notes every 2 minutes (server-and-ops-8) ────────────────
-- Same command as 115 (resync, request, notify, alert). cron.schedule upserts
-- by name. The sweep stays on */10; the two no longer avoid each other by
-- offset, and do not need to: request_pending_lecture_notes takes its rows
-- FOR UPDATE SKIP LOCKED and the sweep's writes are guarded by status.
select cron.schedule(
  'semora-finish-lecture-notes',
  '*/2 * * * *',
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
