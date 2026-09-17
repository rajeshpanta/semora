-- ============================================================
-- A PART IS NEVER LOST TO A BUSY PROVIDER, AND A TRANSCRIPT SAYS WHERE ITS HOLES ARE
-- ============================================================
-- Part of the Record Lecture completion plan (docs/audits/
-- record-lecture-report-and-plan-2026-09-16.md, Phase 1: steps 1.2, 1.4, 1.6,
-- 1.7, 1.9, 1.13). Server only; every app version benefits. Deploy
-- lecture-transcribe and lecture-study-kit right after this migration: they read
-- the columns and call the functions created here.
--
-- 1. A PROVIDER OUTAGE NO LONGER DESTROYS AUDIO (S1, G4). A Groq 5xx, a network
--    error or a timeout used to mark the part 'failed'. The every-minute
--    arrival job then spent all three recovery attempts in half an hour and
--    retention deleted the only copy. lecture-transcribe now returns those parts
--    to 'uploaded' and counts the failure on the part (provider_failures);
--    only a part that has failed for six hours is given up on. A claim now
--    goes stale after 5 minutes instead of 10: an edge function cannot live
--    longer than 150 seconds, so anything older has nobody behind it.
--
-- 2. ONE TRANSCRIPT ASSEMBLER (S4, S6). Three places joined parts with a single
--    space and no markers (the stall sweep, the rebuild, and a separate copy in
--    lecture-transcribe), so the notes model wrote straight across twenty
--    missing minutes. lecture_assemble_transcript is now the only assembler: it
--    walks every expected part, marks each run of missing parts once and each
--    resumed-after-interruption point, in the student's language. The markers
--    are the exact strings lecture_transcript_words already ignores, so no
--    finished lecture is rewritten because of this change.
--
-- 3. LANGUAGE BELONGS TO THE LECTURE (S5). lecture_recordings.language is set
--    by lecture-transcribe once real speech has been heard ('en', 'es', or
--    'mixed' when parts disagree). The app's UI language is only a fallback.
--
-- 4. CHARGES ARE REFUNDED, NOT DELETED (1.7). A lecture that produced nothing
--    usable used to delete its usage row. The row now becomes 'refunded', which
--    free_action_used() already ignores, and lecture_charge_usage turns it back
--    into 'success' if real speech arrives later — so a late part can never be
--    a free lecture.
--
-- 5. A PRO LECTURE FINISHES EVEN IF PRO LAPSES MID-LECTURE (S2). `start` stamps
--    authorized_pro_at, a column no client can write. Only a stamped lecture is
--    exempt from the free-allowance re-check; an unstamped one is not.
--
-- 6. A PART'S PATH MUST NAME ITS OWN OWNER AND LECTURE (U5). cancel and
--    retention delete whatever storage_path says. 0 of 380 rows violate this on
--    2026-09-16; it is added NOT VALID and then validated.
--
-- 7. REAL USAGE IS COUNTED (S7). lecture_transcription_usage records the audio
--    seconds and requests actually sent to the provider, per UTC hour, so the
--    health check (144) can see a busy day before the provider refuses it.
--
-- Additive: new columns have defaults, no data is rewritten except the
-- constraint validation. Old app versions write nothing new.
-- ============================================================

-- ── columns ─────────────────────────────────────────────────────
alter table public.lecture_recordings
  add column if not exists language                text,
  add column if not exists authorized_pro_at       timestamptz,
  add column if not exists last_heartbeat_at       timestamptz,
  add column if not exists capture_state           text,
  add column if not exists capture_wall_seconds    integer,
  add column if not exists captured_seconds        integer,
  add column if not exists notes_rewrite_requested boolean not null default false,
  add column if not exists notes_truncated         boolean not null default false,
  add column if not exists quiz_stale              boolean not null default false,
  add column if not exists app_build               text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'lecture_recordings_language_check') then
    alter table public.lecture_recordings
      add constraint lecture_recordings_language_check
      check (language is null or language in ('en', 'es', 'mixed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lecture_recordings_capture_state_check') then
    alter table public.lecture_recordings
      add constraint lecture_recordings_capture_state_check
      check (capture_state is null or capture_state in ('recording', 'paused', 'stopped'));
  end if;
end $$;

comment on column public.lecture_recordings.language is
  'SEMORA (142): the language spoken in the lecture, detected by lecture-transcribe from real speech. en, es, or mixed. Null until known.';
comment on column public.lecture_recordings.authorized_pro_at is
  'SEMORA (142): set by lecture-transcribe start when the student was Pro. Lets a lecture authorized under Pro finish if Pro lapses mid-lecture. Server-owned.';
comment on column public.lecture_recordings.last_heartbeat_at is
  'SEMORA (142/143): last lecture_heartbeat from the recording phone. Null for app versions that do not send one.';
comment on column public.lecture_recordings.capture_state is
  'SEMORA (142/143): recording | paused | stopped, as last reported by lecture_heartbeat.';
comment on column public.lecture_recordings.notes_rewrite_requested is
  'SEMORA (142/143): regenerate the notes without announcing it (no push). Used for maintenance rewrites.';
comment on column public.lecture_recordings.notes_truncated is
  'SEMORA (142): the notes model stopped at its output limit. Monitored by lecture_health_check.';
comment on column public.lecture_recordings.quiz_stale is
  'SEMORA (142/143): the notes were rewritten after the quiz was built from them.';

alter table public.lecture_segments
  add column if not exists speech_seconds            integer,
  add column if not exists dropped_segments          integer,
  add column if not exists provider_failures         integer not null default 0,
  add column if not exists first_provider_failure_at timestamptz,
  add column if not exists detected_language         text;

comment on column public.lecture_segments.speech_seconds is
  'SEMORA (142): seconds of this part the transcription kept as real speech (silence and hallucinated segments removed). seconds is the file length.';
comment on column public.lecture_segments.provider_failures is
  'SEMORA (142): retryable provider failures (5xx, timeout, network). The part stays reclaimable until these have lasted 6 hours.';

-- ── charges: refunded is a status, not a delete ─────────────────
alter table public.lecture_usage_log drop constraint if exists lecture_usage_log_status_check;
alter table public.lecture_usage_log
  add constraint lecture_usage_log_status_check
  check (status = any (array['success', 'failed', 'refunded']));

create or replace function public.lecture_charge_usage(p_user_id uuid, p_lecture_id uuid, p_seconds integer)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  -- The first transcribed part charges the lecture, exactly once (the partial
  -- unique index). A lecture that was refunded because it held no speech is
  -- charged again the moment speech arrives: a refund must never become a way
  -- to get a lecture for free.
  insert into public.lecture_usage_log (user_id, lecture_id, audio_seconds, status)
  values (p_user_id, p_lecture_id, greatest(0, coalesce(p_seconds, 0)), 'success')
  on conflict (user_id, lecture_id) where lecture_id is not null
  do update set status = 'success', error_code = null
   where public.lecture_usage_log.status = 'refunded';
$$;

create or replace function public.lecture_refund_usage(p_user_id uuid, p_lecture_id uuid, p_code text)
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  -- Never while any part of the lecture was transcribed with words in it,
  -- whatever the caller concluded: that text is readable by the student, so a
  -- refund for it would be a free lecture (review finding: a part numbered
  -- outside the assembler's range carried text the finalizer did not count).
  with refunded as (
    update public.lecture_usage_log
       set status = 'refunded', error_code = p_code
     where user_id = p_user_id and lecture_id = p_lecture_id and status = 'success'
       and not exists (
         select 1 from public.lecture_segments s
         where s.lecture_id = p_lecture_id and s.status = 'done'
           and btrim(coalesce(s.transcript, '')) <> ''
       )
    returning 1
  )
  select count(*)::integer from refunded;
$$;

revoke all on function public.lecture_charge_usage(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.lecture_refund_usage(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.lecture_charge_usage(uuid, uuid, integer) to service_role;
grant execute on function public.lecture_refund_usage(uuid, uuid, text) to service_role;

-- ── a document note can still be created (live 138 guard + 142 columns) ──
-- The INSERT branch builds the row with jsonb_populate_record(null, ...), which
-- ignores column defaults. Without naming the three NOT NULL columns above,
-- every "notes from a document" insert would fail.
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
      'segment_count',
        case when old.source = 'recording' then new.segment_count else old.segment_count end,
      'duration_seconds',
        case when old.source = 'recording' then new.duration_seconds else old.duration_seconds end,
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

-- ── a part's number is a real part number ───────────────────────
-- seq is written by the phone. 0..999 is exactly the range the transcript
-- assembler walks, so no part can hold text the finalizer does not see (the
-- review's free-lecture refund loophole), with room for any number of pauses.
-- A trigger on INSERT, not a CHECK: a CHECK would also reject every later
-- UPDATE of an existing out-of-range row, so such a row could never again be
-- marked done, failed or written off. The phone cannot change seq afterwards
-- (lecture_segments_client_columns does not let it).
create or replace function public.lecture_segments_seq_in_range()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.seq is null or new.seq < 0 or new.seq > 999 then
    raise exception 'lecture part number % is out of range', new.seq using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists lecture_segments_seq_in_range_trigger on public.lecture_segments;
create trigger lecture_segments_seq_in_range_trigger
  before insert on public.lecture_segments
  for each row execute function public.lecture_segments_seq_in_range();

-- ── a part's path names its own owner and lecture ───────────────
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'lecture_segments_storage_path_owner') then
    alter table public.lecture_segments
      add constraint lecture_segments_storage_path_owner
      check (
        storage_path is null
        or storage_path = user_id::text || '/' || lecture_id::text || '/seg_' || lpad(seq::text, greatest(3, length(seq::text)), '0') || '.m4a'
      ) not valid;
  end if;
end $$;
alter table public.lecture_segments validate constraint lecture_segments_storage_path_owner;

-- ── what the phone may write on a part (139's guard + 142 columns) ──
create or replace function public.lecture_segments_client_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- uploadSegment: a part the phone is about to upload.
    new.status                    := 'pending';
    new.transcript                := null;
    new.claimed_at                := null;
    new.recovery_attempts         := 0;
    new.dispatched_at             := null;
    -- 142: server-measured facts start empty.
    new.speech_seconds            := null;
    new.dropped_segments          := null;
    new.provider_failures         := 0;
    new.first_provider_failure_at := null;
    new.detected_language         := null;
    return new;
  end if;

  -- Once the server has claimed or finished a part it is the server's. A retry
  -- that upserts the same part again succeeds and changes nothing.
  if old.status in ('transcribing', 'done') then
    return old;
  end if;

  -- Otherwise the phone may (re)describe the upload and move it between
  -- 'pending' and 'uploaded' — including a failed part it is retrying.
  -- jsonb_populate_record(old, ...) keeps every column not listed here.
  return jsonb_populate_record(
    old,
    jsonb_build_object(
      'seconds',      new.seconds,
      'storage_path', new.storage_path,
      'has_gap',      new.has_gap,
      'status',
        case when new.status in ('pending', 'uploaded') then new.status else old.status end
    )
  );
end;
$$;

-- ── the one transcript assembler ────────────────────────────────
create or replace function public.lecture_assemble_transcript(
  p_lecture_id uuid,
  out transcript    text,
  out text_parts    integer,
  out total_seconds integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  declared    integer;
  highest     integer;
  last_seq    integer;
  spanish     boolean;
  seg         record;
  missing_run boolean := false;
  pieces      text[] := '{}';
  m_missing   text;
  m_gap       text;
begin
  transcript := '';
  text_parts := 0;
  total_seconds := 0;

  select coalesce(r.segment_count, 0),
         coalesce(nullif(r.language, 'mixed'), p.preferred_language, 'en') = 'es'
    into declared, spanish
  from public.lecture_recordings r
  left join public.profiles p on p.id = r.user_id
  where r.id = p_lecture_id;
  if not found then
    return;
  end if;

  -- Exactly the strings lecture_transcript_words (138) strips, so comparing a
  -- marked transcript with an unmarked one of the same words says "unchanged".
  m_missing := case when spanish then '[Falta una parte de la grabación.]'
                    else '[Part of this recording could not be transcribed.]' end;
  m_gap     := case when spanish then '[La grabación se reanudó tras una interrupción.]'
                    else '[Recording resumed after an interruption.]' end;

  select coalesce(max(s.seq), -1) into highest
  from public.lecture_segments s
  where s.lecture_id = p_lecture_id;

  -- Every part the phone declared, and every part that arrived beyond that.
  -- Capped: segment_count and seq are written by the phone, and an absurd
  -- value must not make a shared scheduler job walk billions of numbers while
  -- holding a row lock. No real lecture comes near 1000 parts.
  last_seq := least(greatest(declared - 1, highest), 999);

  for seg in
    select gs.seq, s.status, s.transcript as text, s.seconds, s.has_gap
    from generate_series(0, last_seq) as gs(seq)
    left join public.lecture_segments s
      on s.lecture_id = p_lecture_id and s.seq = gs.seq
    order by gs.seq
  loop
    if seg.status = 'done' then
      missing_run := false;
      total_seconds := total_seconds + coalesce(seg.seconds, 0);
      if seg.has_gap and seg.seq > 0 then
        pieces := pieces || m_gap;
      end if;
      if nullif(btrim(seg.text), '') is not null then
        pieces := pieces || btrim(seg.text);
        text_parts := text_parts + 1;
      end if;
    elsif not missing_run then
      -- One marker per run of missing parts: "[missing] [missing] [missing]"
      -- tells the reader nothing the first one did not.
      pieces := pieces || m_missing;
      missing_run := true;
    end if;
  end loop;

  -- A lecture with no real text is not given a transcript made only of markers.
  if text_parts = 0 then
    transcript := '';
  else
    transcript := array_to_string(pieces, E'\n\n');
  end if;
end;
$$;

revoke all on function public.lecture_assemble_transcript(uuid) from public, anon, authenticated;
grant execute on function public.lecture_assemble_transcript(uuid) to service_role;

-- ── rebuild: 140's ordering + the one assembler ─────────────────
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

  -- 142: the one assembler, so the rebuilt transcript carries the same gap
  -- markers every other path writes. done_count keeps 116's meaning: parts
  -- that carry text.
  select a.transcript as text, a.text_parts as done_count, a.total_seconds
    into seg
  from public.lecture_assemble_transcript(p_lecture_id) a;

  -- 140: completeness, count and duration come from the rows, before the
  -- words comparison below, so a silent part that arrives still counts.
  perform public.lecture_set_parts_missing(p_lecture_id);

  update public.lecture_recordings
     set segment_count    = greatest(coalesce(segment_count, 0), seg.done_count),
         duration_seconds = seg.total_seconds,
         updated_at       = now()
   where id = p_lecture_id
     and (coalesce(segment_count, 0) < seg.done_count
          or coalesce(duration_seconds, 0) is distinct from seg.total_seconds);

  -- 138: compared by words, not layout or markers.
  if seg.done_count = 0
     or public.lecture_transcript_words(seg.text) = public.lecture_transcript_words(rec.transcript) then
    return false;
  end if;

  had_notes := rec.notes_md is not null or rec.status = 'generating';

  update public.lecture_recordings
     set transcript       = seg.text,
         segment_count    = greatest(coalesce(segment_count, 0), seg.done_count),
         duration_seconds = seg.total_seconds,
         transcript_rev   = transcript_rev + 1,
         updated_at       = now()
   where id = p_lecture_id;

  -- Notes written from a shorter transcript are now incomplete (138).
  if had_notes then
    update public.lecture_recordings
       set notes_stale         = true,
           notes_auto_attempts = 0
     where id = p_lecture_id;
  end if;

  -- 142/143: a lecture shown as too short for notes that has since grown
  -- enough is sent for notes after all. Measured in words, not in the gap
  -- markers the transcript also carries.
  if rec.status = 'ready'
     and rec.notes_md is null
     and length(public.lecture_transcript_words(seg.text)) >= 200 then
    update public.lecture_recordings
       set status              = 'transcribed',
           error_code          = null,
           notes_auto_attempts = 0
     where id = p_lecture_id
       and error_code = 'TOO_SHORT_FOR_NOTES';
  end if;

  return true;
end;
$function$;

comment on function public.lecture_rebuild_transcript(uuid) is
  'SEMORA (115-116, 138, 140, 142): reassembles a lecture transcript from its parts through lecture_assemble_transcript (gap markers included). '
  'Completeness, count and duration are recalculated before the words-unchanged early return.';

-- ── the arrival job: a dead claim is 5 minutes old, not 10 ──────
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
begin
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'semora_lecture_cron_secret';

  if secret is null then
    return 0;
  end if;

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
    limit greatest(1, p_limit)
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

-- ── retention: a claim that died with its attempts spent is finished with ──
-- 139 deleted 'failed' parts whose attempts were spent. A part whose last
-- attempt was killed mid-transcription stays 'transcribing' with its attempts
-- spent and was never returned by anything, so its audio was kept forever —
-- past the privacy promise. It is as finished as a failed one once its claim is
-- an hour dead.
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
    and (r.status in ('ready', 'transcribed', 'generating', 'failed')
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

-- ── real usage, per hour ────────────────────────────────────────
create table if not exists public.lecture_transcription_usage (
  hour          timestamptz primary key,
  audio_seconds integer not null default 0,
  requests      integer not null default 0,
  failures      integer not null default 0
);

comment on table public.lecture_transcription_usage is
  'SEMORA (142): audio seconds and requests actually sent to the transcription provider, per UTC hour. The provider limits the whole organization per hour and per day.';

alter table public.lecture_transcription_usage enable row level security;
revoke all on public.lecture_transcription_usage from anon, authenticated;

create or replace function public.lecture_count_transcription(p_seconds integer, p_failed boolean default false)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.lecture_transcription_usage (hour, audio_seconds, requests, failures)
  values (date_trunc('hour', now()), greatest(0, coalesce(p_seconds, 0)), 1, case when p_failed then 1 else 0 end)
  on conflict (hour) do update
     set audio_seconds = public.lecture_transcription_usage.audio_seconds + excluded.audio_seconds,
         requests      = public.lecture_transcription_usage.requests + 1,
         failures      = public.lecture_transcription_usage.failures + excluded.failures;
$$;

revoke all on function public.lecture_count_transcription(integer, boolean) from public, anon, authenticated;
grant execute on function public.lecture_count_transcription(integer, boolean) to service_role;
