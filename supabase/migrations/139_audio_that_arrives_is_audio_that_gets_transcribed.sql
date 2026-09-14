-- ============================================================
-- AUDIO THAT ARRIVES IS AUDIO THAT GETS TRANSCRIBED
-- ============================================================
-- Until now a part of a lecture was transcribed only if the PHONE asked for it.
-- uploadSegment writes the part's row, uploads the audio, flips the row to
-- 'uploaded' and calls lecture-transcribe, and every one of those steps needs
-- the app awake and signed in. A phone that locks, suspends or loses its session
-- in between leaves audio sitting in storage that nothing acts on quickly:
--
--   * row 'pending' or 'uploaded', audio present → 127's recovery pass, but only
--     20+ minutes later, never while the lecture is still receiving audio, and
--     from a job that runs three times an hour;
--   * audio present, NO row (the app lost its session before writing it, or the
--     upload finished in the background with the app suspended) → nothing
--     transcribed it at all, and lecture_orphaned_audio (118) DELETED it after
--     24 hours as audio "nothing points at". 118 was right when it was written,
--     because the row was always written first. That stops being true the
--     moment the phone can upload while the app is not running, which is the
--     next step of this fix.
--
-- From here the server takes over as soon as the audio lands, whatever the phone
-- is doing. Every minute lecture_take_over_arrived_audio:
--
--   1. finds audio in the 'lectures' bucket that is at least a minute old (the
--      phone's own call normally arrives within seconds) and at most 7 days old
--      (how long a phone keeps an undelivered part);
--   2. accepts it only if its path names a recording lecture owned by the user
--      whose folder it is in, as seg_NNN.m4a with NNN under 200;
--   3. gives it a row if it has none, or points a written-off row back at it;
--   4. hands up to 5 parts a minute to lecture-transcribe's `recover` action.
--
-- EXACTLY ONCE. The phone and this job can both ask for the same part. The claim
-- in handleSegment (one conditional update) already decides who transcribes it;
-- this job additionally never asks about a part that is mid-transcription, and
-- asks about any one part at most once every 10 minutes (dispatched_at), so a
-- slow provider call is never mistaken for a stuck one and no recovery attempt
-- is spent on a part someone else is already transcribing. Charging stays where
-- it was: once per lecture, at the first transcribed part, with the free
-- allowance checked on every part.
--
-- ONE OWNER. The 127 pass stops dispatching audio (this job does it every minute
-- instead of three times an hour) and keeps its other job: writing off rows
-- whose audio never arrived. A write-off is no longer final: if the audio lands
-- later, step 3 above points the row back at it.
--
-- NOTHING KEPT LONGER THAN PROMISED. Retention now also deletes the audio of
-- parts that held no speech and of parts recovery gave up on, once their
-- lecture is over; before, those outlived any lecture the sweep finished.
-- Audio this job may still act on is not an orphan. Audio it will never act on
-- — no such lecture, someone else's lecture, a malformed name, a duplicate of a
-- part already transcribed, or older than 7 days — is collected by the
-- retention job exactly as before.
--
-- FAIR. Only usable audio is looked at, so files nothing can use (which stay
-- up to 24 hours before retention collects them) never crowd out real parts,
-- and no student gets more than 2 of the 5 parts handed over each minute.
-- ============================================================

alter table public.lecture_segments
  add column if not exists dispatched_at timestamptz;

comment on column public.lecture_segments.dispatched_at is
  'SEMORA (139): when lecture_take_over_arrived_audio last handed this part to lecture-transcribe. Spaces its requests 10 minutes apart.';

-- ── which lecture a stored object belongs to ────────────────────
-- Object names are chosen by the phone: `${userId}/${lectureId}/seg_NNN.m4a`.
-- The storage policy only guarantees the first folder is the uploader's own
-- id, so the lecture is looked up and its owner must be that same user.
create or replace function public.lecture_audio_object_part(p_name text)
returns table (lecture_id uuid, user_id uuid, seq integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.user_id, m[3]::integer
  from (
    select regexp_match(
      p_name,
      '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/seg_([0-9]{3})\.m4a$'
    ) as m
  ) parsed
  join public.lecture_recordings r
    on r.id = m[2]::uuid
   and r.user_id = m[1]::uuid
   and r.source = 'recording'
  where m is not null
    and m[3]::integer < 200;
$$;

revoke all on function public.lecture_audio_object_part(text) from public, anon, authenticated;
grant execute on function public.lecture_audio_object_part(text) to service_role;

-- ── could the server still turn this object into text? ──────────
-- True while the object is inside the 7-day window, belongs to a real part of
-- a real lecture, and that part is not already transcribed (or being).
create or replace function public.lecture_audio_is_actionable(p_name text, p_created_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_created_at > now() - interval '7 days'
     and exists (
       select 1
       from public.lecture_audio_object_part(p_name) part
       left join public.lecture_segments s
         on s.lecture_id = part.lecture_id and s.seq = part.seq
       where s.id is null
          or s.storage_path = p_name
          or (s.storage_path is null and s.status in ('pending', 'uploaded', 'failed'))
     );
$$;

revoke all on function public.lecture_audio_is_actionable(text, timestamptz) from public, anon, authenticated;
grant execute on function public.lecture_audio_is_actionable(text, timestamptz) to service_role;

-- ── the every-minute take-over ──────────────────────────────────
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

  -- Without the secret every request would be refused; stamping dispatched_at
  -- anyway would only delay the real attempt.
  if secret is null then
    return 0;
  end if;

  -- 1-3. Give every recent object a row that points at it.
  for obj in
    select o.name, o.created_at
    from storage.objects o
    where o.bucket_id = 'lectures'
      and o.created_at < now() - interval '1 minute'
      and o.created_at > now() - interval '7 days'
      and not exists (
        select 1 from public.lecture_segments s where s.storage_path = o.name
      )
      -- Only audio a lecture can use. Anything else waits for retention and must
      -- not take a place in this batch while it does.
      and public.lecture_audio_is_actionable(o.name, o.created_at)
    order by o.created_at
    limit 50
  loop
    select * into part from public.lecture_audio_object_part(obj.name);
    if not found then
      continue;  -- not a part of any lecture this user owns; retention collects it
    end if;

    select id, status, storage_path into seg
    from public.lecture_segments
    where lecture_id = part.lecture_id and seq = part.seq
    for update;

    if not found then
      -- The phone never wrote the row. What it would have written, minus what
      -- only it knew: the length (the provider reports it on transcription) and
      -- whether the recording resumed after an interruption.
      insert into public.lecture_segments (lecture_id, user_id, seq, storage_path, status)
      values (part.lecture_id, part.user_id, part.seq, obj.name, 'uploaded')
      on conflict (lecture_id, seq) do nothing;
    elsif seg.storage_path is null and seg.status in ('pending', 'uploaded', 'failed') then
      -- Written off before its audio landed (lecture_write_off_segment, 127).
      -- The audio is here now. Its earlier attempts were spent on nothing, so
      -- they are not held against it.
      update public.lecture_segments
         set storage_path      = obj.name,
             status            = 'uploaded',
             claimed_at        = null,
             recovery_attempts = 0
       where id = seg.id;
    end if;
    -- Otherwise the part is already transcribed or being transcribed from
    -- another copy; this object is a duplicate and retention collects it.
  end loop;

  -- 4. Hand parts with audio to lecture-transcribe, oldest first, at most two
  -- per student per run.
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
        -- Mid-transcription is someone else's; a claim older than
        -- STALE_CLAIM_MS (10 minutes) is dead and may be taken over.
        and not (s.status = 'transcribing' and s.claimed_at > now() - interval '10 minutes')
        and s.recovery_attempts < 3
        and (s.dispatched_at is null or s.dispatched_at < now() - interval '10 minutes')
    ) c
    where c.nth <= 2
    order by c.created_at
    limit greatest(1, p_limit)
  loop
    -- The stamp is the claim: if another run got here first, it matched nothing.
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

revoke all on function public.lecture_take_over_arrived_audio(integer) from public, anon, authenticated;
grant execute on function public.lecture_take_over_arrived_audio(integer) to service_role;

-- ── orphans: only what nothing will ever act on (118, corrected) ─
CREATE OR REPLACE FUNCTION public.lecture_orphaned_audio(p_limit integer DEFAULT 100)
 RETURNS TABLE(path text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'storage'
AS $function$
  select o.name
  from storage.objects o
  where o.bucket_id = 'lectures'
    -- Nothing references it. Not "no transcript" — no ROW, anywhere.
    and not exists (
      select 1 from public.lecture_segments s where s.storage_path = o.name
    )
    -- 139: and nothing ever will. Audio whose row was simply never written —
    -- a phone that lost its session, an upload that finished while the app was
    -- suspended — belongs to a live lecture, and lecture_take_over_arrived_audio
    -- gives it a row within minutes. Deleting it here after 24 hours is how a
    -- recovered part would have been destroyed instead.
    and not public.lecture_audio_is_actionable(o.name, o.created_at)
    and o.created_at < now() - interval '24 hours'
  order by o.created_at
  limit greatest(1, p_limit);
$function$;

-- ── 127 keeps the write-offs; the take-over owns audio ──────────
CREATE OR REPLACE FUNCTION public.lecture_stranded_segments(p_limit integer DEFAULT 20, p_min_age_minutes integer DEFAULT 20, p_max_attempts integer DEFAULT 3)
 RETURNS TABLE(segment_id uuid, lecture_id uuid, user_id uuid, seq integer, seg_status text, audio_exists boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'storage'
AS $function$
  select s.id, s.lecture_id, s.user_id, s.seq, s.status,
         (o.name is not null) as audio_exists
  from public.lecture_segments s
  left join storage.objects o
    on o.bucket_id = 'lectures' and o.name = s.storage_path
  where s.status <> 'done'
    -- 139: a part WITH audio is lecture_take_over_arrived_audio's, every minute.
    -- Dispatching it from here too, on a 20-minute timer, only raced it.
    and o.name is null
    -- Well past any upload that is genuinely still in flight (a segment is
    -- ~1.2 MB), and deliberately UNDER maybeFinalize's 30-minute write-off so
    -- a first recovery attempt normally happens before the segment is failed.
    and s.created_at < now() - make_interval(mins => greatest(1, p_min_age_minutes))
    and s.recovery_attempts < greatest(1, p_max_attempts)
    -- A failed segment with no path and no object is already resolved
    -- correctly; picking it up again would spin forever on nothing.
    and s.storage_path is not null
    -- Never touch a lecture that is still receiving audio. Same 15-minute rule
    -- as 114 and 117: whatever the status column says, a recording that is
    -- still arriving is still a recording.
    and not exists (
      select 1 from public.lecture_segments s2
      where s2.lecture_id = s.lecture_id
        and s2.created_at > now() - interval '15 minutes'
    )
  order by s.created_at
  limit greatest(1, p_limit);
$function$;

-- ── the alert counts orphans the same way ───────────────────────
CREATE OR REPLACE FUNCTION public.alert_lecture_audio_retained()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'storage', 'pg_temp'
AS $function$
declare
  stale    integer;
  orphaned integer;
begin
  select count(*) into stale
  from public.lecture_segments s
  join public.lecture_recordings r on r.id = s.lecture_id
  where s.storage_path is not null
    and s.status = 'done'
    and nullif(btrim(coalesce(s.transcript, '')), '') is not null
    and r.status in ('ready', 'transcribed', 'generating', 'failed')
    and s.created_at < now() - interval '24 hours';

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

-- ── retention: every part the server is finished with (117, widened) ──
-- 117 collected only parts that produced text. Two kinds of part are just as
-- finished and were kept forever once their lecture ended by any path other
-- than lecture-transcribe's own finalize (the stall sweep never touches storage):
--   * a part that was transcribed and held no speech — done, empty text;
--   * a part recovery gave up on after its attempts — deleteLectureAudio
--     already deletes these ("once recovery has given up the audio goes"); this
--     makes the timer agree with it.
-- With every recovered or late part now turning into a lecture that finishes
-- through the sweep, those two would otherwise be the audio that outlives the
-- privacy promise. Nothing still claimable is added: a failed part with attempts
-- left is still the only copy and stays.
CREATE OR REPLACE FUNCTION public.lecture_audio_awaiting_deletion(p_limit integer DEFAULT 25)
 RETURNS TABLE(lecture_id uuid, paths text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.lecture_id,
         array_agg(s.storage_path order by s.seq) as paths
  from public.lecture_segments s
  join public.lecture_recordings r on r.id = s.lecture_id
  where s.storage_path is not null
    -- Finished with: transcribed (with or without speech in it), or given up on.
    and (
      s.status = 'done'
      or (s.status = 'failed' and s.recovery_attempts >= 3)
    )
    -- The recording is over. 'generating' counts as over: notes are being
    -- written FROM the transcript, so the audio has already done its job.
    and r.status in ('ready', 'transcribed', 'generating', 'failed')
    -- ...but not if audio is still landing. Same rule as 114.
    and not exists (
      select 1 from public.lecture_segments s2
      where s2.lecture_id = s.lecture_id
        and s2.created_at > now() - interval '15 minutes'
    )
  group by s.lecture_id
  order by s.lecture_id
  limit greatest(1, p_limit);
$function$;

comment on function public.lecture_audio_awaiting_deletion(integer) is
  'Lecture audio the server is finished with and must delete (117, widened in 139): parts transcribed '
  '(with or without speech) or given up on after 3 recovery attempts, of lectures no longer receiving audio. '
  'A part that can still be transcribed is never returned. The Edge Function does the removal.';

-- ── a phone cannot schedule its own parts ───────────────────────
-- 138's guard, plus dispatched_at: on insert it starts empty, and on update it
-- is kept (jsonb_populate_record(old, ...) already keeps every unlisted column).
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
    new.status            := 'pending';
    new.transcript        := null;
    new.claimed_at        := null;
    new.recovery_attempts := 0;
    new.dispatched_at     := null;
    return new;
  end if;

  -- Once the server has claimed or finished a part it is the server's. A retry
  -- that upserts the same part again succeeds and changes nothing.
  if old.status in ('transcribing', 'done') then
    return old;
  end if;

  -- Otherwise the phone may (re)describe the upload and move it between
  -- 'pending' and 'uploaded' — including a failed part it is retrying.
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

-- ── schedule ────────────────────────────────────────────────────
select cron.schedule(
  'semora-lecture-arrivals',
  '* * * * *',
  $job$select public.lecture_take_over_arrived_audio(5);$job$
);
