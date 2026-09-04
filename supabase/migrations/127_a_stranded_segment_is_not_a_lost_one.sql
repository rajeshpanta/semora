-- ============================================================
-- SEMORA: A STRANDED SEGMENT IS NOT A LOST ONE
-- ============================================================
-- uploadSegment (lib/lectures.ts) does three things in this order:
--
--   1. upsert the row with status 'pending' and its storage_path   (:315)
--   2. upload the audio to that path                               (:350)
--   3. update the row to status 'uploaded'                         (:364)
--
-- If the app dies, is backgrounded, or loses the network between 2 and 3, the
-- audio is in the bucket and the row still says 'pending'. Nothing ever moves
-- it again. handleSegment's claim matches only `uploaded`, or a `transcribing`
-- claim gone stale — never `pending` — and maybeFinalize's 30-minute write-off
-- runs only when ANOTHER segment call arrives, which for a lecture that has
-- already finished never happens.
--
-- Measured 2026-09-04, all from 09-02:
--
--   0d841775 seq 2   audio present, 1,117 kB   lecture 'ready' WITH notes
--   364c3afd seq 2   no object behind the path lecture 'transcribed'
--   364c3afd seq 3   no object behind the path lecture 'transcribed'
--   78beaa43 seq 0   no object behind the path lecture 'failed'
--
-- Two genuinely different situations wearing the same status, which is why
-- nothing could act on either:
--
--   THE UPLOAD LANDED AND THE FLIP DID NOT. Five minutes of a class sitting in
--   the bucket, transcribable right now, missing from the transcript the
--   student reads. 0d841775's notes were written from two segments out of
--   three and nothing anywhere says a third exists.
--
--   THE UPLOAD NEVER LANDED. storage_path points at nothing. There is no audio
--   and there never was; the row is a phantom. It cannot be recovered, and
--   while it sits non-terminal it also blocks audio_deleted_at from ever being
--   stamped on its lecture (lecture-retention refuses to stamp while any
--   storage_path survives), so it quietly keeps a lecture looking unclean.
--
-- The fix is to ask the only question that separates them — IS THERE ACTUALLY
-- AN OBJECT AT THAT PATH? — and act differently on each answer. That question
-- is answerable in SQL, so it is answered here rather than trusted to a caller.
--
-- ─── WHY `failed` IS ALSO A CANDIDATE ──────────────────────
-- maybeFinalize writes off a non-terminal segment after 30 minutes. That was
-- the right call when nothing could retry, but it means the write-off can beat
-- a recovery pass to a segment whose audio is fine, and `failed` was terminal
-- forever. It is no longer: a failed segment whose object still exists is
-- exactly the case worth rescuing, and it is bounded by recovery_attempts.
-- Today zero failed segments still have audio, which is luck, not design.
--
-- ─── THE ATTEMPT COUNTER IS NOT OPTIONAL ───────────────────
-- Without it, a segment the provider will always refuse (corrupt m4a, a path
-- that fails the ownership prefix check) is retried every twenty minutes for
-- the rest of the app's life, against a shared daily quota that five lectures
-- exhaust. Incremented BEFORE the attempt, for the same reason 109 stamps
-- notes_auto_attempts before the POST: a crash mid-attempt must still cost one.
--
-- ─── AND THE AUDIO STILL GOES AWAY ─────────────────────────
-- The retention promise is not suspended by this. A segment's audio now
-- survives exactly as long as there is a live chance of transcribing it —
-- three attempts, twenty minutes apart, so about an hour past the point it
-- would previously have been deleted, and permanently rather than never (which
-- is what 0d841775 has been doing for two days). See the companion change to
-- deleteLectureAudio, which until now deleted a pending segment's audio
-- whenever it happened to be in the snapshot, contradicting 117's rule.
-- ============================================================

-- ─── The counter ────────────────────────────────────────────
alter table public.lecture_segments
  add column if not exists recovery_attempts integer not null default 0;

comment on column public.lecture_segments.recovery_attempts is
  'How many times the unattended recovery pass has tried to transcribe this '
  'segment (127). Incremented before each attempt so a crash still costs one. '
  'At the cap the segment is written off and its audio becomes eligible for '
  'deletion — a segment nothing will ever transcribe is pure liability.';

-- ─── The picker ─────────────────────────────────────────────
-- Returns segments that have stopped moving, each labelled with the ONE fact
-- that decides what to do with it. The storage.objects join is the whole
-- point: `storage_path is not null` says a path was written, not that anything
-- is there, and every one of the three unrecoverable rows above passes it.
create or replace function public.lecture_stranded_segments(
  p_limit integer default 20,
  p_min_age_minutes integer default 20,
  p_max_attempts integer default 3
)
returns table (
  segment_id   uuid,
  lecture_id   uuid,
  user_id      uuid,
  seq          integer,
  seg_status   text,
  audio_exists boolean
)
language sql
stable
security definer
set search_path = public, storage
as $$
  select s.id, s.lecture_id, s.user_id, s.seq, s.status,
         (o.name is not null) as audio_exists
  from public.lecture_segments s
  left join storage.objects o
    on o.bucket_id = 'lectures' and o.name = s.storage_path
  where s.status <> 'done'
    -- Well past any upload that is genuinely still in flight (a segment is
    -- ~1.2 MB), and deliberately UNDER maybeFinalize's 30-minute write-off so
    -- a first recovery attempt normally happens before the segment is failed.
    and s.created_at < now() - make_interval(mins => greatest(1, p_min_age_minutes))
    and s.recovery_attempts < greatest(1, p_max_attempts)
    -- A failed segment with no path and no object is already resolved
    -- correctly; picking it up again would spin forever on nothing.
    and (o.name is not null or s.storage_path is not null)
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
$$;

comment on function public.lecture_stranded_segments(integer, integer, integer) is
  'Segments that stopped moving before reaching done (127), each labelled with '
  'whether an object actually exists at its storage_path. That flag is the '
  'whole decision: audio present means transcribe it, audio absent means the '
  'upload never landed and the row is a phantom to write off. Answered here '
  'rather than in the caller because storage.objects is the only authority.';

revoke all on function public.lecture_stranded_segments(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.lecture_stranded_segments(integer, integer, integer) to service_role;

-- ─── Charging an attempt ────────────────────────────────────
create or replace function public.lecture_note_recovery_attempt(p_segment_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.lecture_segments
     set recovery_attempts = recovery_attempts + 1
   where id = p_segment_id
  returning recovery_attempts;
$$;

comment on function public.lecture_note_recovery_attempt(uuid) is
  'Charges one recovery attempt against a segment (127). Called BEFORE the '
  'transcription is attempted, so an invocation that dies partway still spends '
  'one and cannot retry forever.';

revoke all on function public.lecture_note_recovery_attempt(uuid) from public, anon, authenticated;
grant execute on function public.lecture_note_recovery_attempt(uuid) to service_role;

-- ─── Writing off a phantom ──────────────────────────────────
-- The absence check is repeated here rather than trusted from the picker. The
-- two calls are seconds apart but they are separate transactions, and the
-- thing in between them is a storage delete; a function whose whole job is to
-- null a storage_path must confirm for itself that nothing is behind it.
create or replace function public.lecture_write_off_segment(p_segment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  seg record;
begin
  select id, lecture_id, seq, status, storage_path
    into seg
  from public.lecture_segments
  where id = p_segment_id
  for update;

  if not found then
    return false;
  end if;

  -- Refuse if there IS audio. Nulling the path would strand the object with
  -- nothing pointing at it — the exact failure 118 exists to clean up after.
  if seg.storage_path is not null and exists (
    select 1 from storage.objects
    where bucket_id = 'lectures' and name = seg.storage_path
  ) then
    return false;
  end if;

  update public.lecture_segments
     set status       = 'failed',
         storage_path = null,
         claimed_at   = null
   where id = p_segment_id;

  return true;
end;
$$;

comment on function public.lecture_write_off_segment(uuid) is
  'Marks a segment failed and drops its phantom storage_path (127), only after '
  'confirming for itself that no object exists at that path. Clearing the '
  'pointer is what lets lecture-retention finally stamp audio_deleted_at on '
  'the lecture, which a non-terminal row with a dead path blocks forever.';

revoke all on function public.lecture_write_off_segment(uuid) from public, anon, authenticated;
grant execute on function public.lecture_write_off_segment(uuid) to service_role;

-- ─── Folding recovered text back into the lecture ───────────
-- maybeFinalize cannot do this. Its terminal write is guarded
-- `.in(status, [recording, uploading, transcribing, failed])` — correctly, so a
-- late finalizer cannot drag a finished lecture backwards — which means a
-- lecture already 'ready' or 'transcribed' will never take the recovered text.
-- 0d841775 is exactly that case: 'ready', with notes, permanently missing its
-- last five minutes unless something writes them in.
--
-- Deliberately does NOT touch `status`. Recovering a segment changes what a
-- lecture SAYS, never where it is in its lifecycle; status transitions stay
-- with maybeFinalize, which is the only thing that understands them.
create or replace function public.lecture_rebuild_transcript(p_lecture_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rec      record;
  seg      record;
  had_notes boolean;
begin
  select id, transcript, segment_count, notes_md
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

  if seg.done_count = 0 or seg.text = coalesce(rec.transcript, '') then
    return false;
  end if;

  had_notes := rec.notes_md is not null;

  update public.lecture_recordings
     set transcript       = seg.text,
         segment_count    = seg.done_count,
         duration_seconds = seg.total_seconds,
         updated_at       = now()
   where id = p_lecture_id;

  -- Notes are NOT regenerated here, on purpose. A lecture whose notes_md is
  -- null picks them up on its own through request_pending_lecture_notes now
  -- that the transcript is longer; one that already has notes would have them
  -- silently replaced, and re-notified, for a student who may have read them
  -- days ago. That is a judgement call about someone's content, so it surfaces
  -- as an alert instead of happening quietly.
  if had_notes then
    insert into public.ops_alerts (kind, detail, delivered)
    values (
      'lecture_notes_stale_after_recovery',
      jsonb_build_object(
        'lecture_id', p_lecture_id,
        'meaning', 'a stranded segment was recovered into a lecture that already had notes',
        'consequence', 'the notes were written from a shorter transcript and are now incomplete',
        'action', 'decide whether to clear notes_md so they regenerate from the full transcript'
      ),
      false
    );
  end if;

  return true;
end;
$$;

comment on function public.lecture_rebuild_transcript(uuid) is
  'Folds a recovered segment back into its lecture transcript (127), at any '
  'lecture status — maybeFinalize will not, because its terminal write is '
  'guarded against regressing a finished lecture. Never changes status. Raises '
  'lecture_notes_stale_after_recovery rather than silently replacing notes a '
  'student may already have read.';

revoke all on function public.lecture_rebuild_transcript(uuid) from public, anon, authenticated;
grant execute on function public.lecture_rebuild_transcript(uuid) to service_role;

-- ─── The alarm ──────────────────────────────────────────────
-- The backlog is the alarm, for the same reason it is in 117: pg_cron reports
-- a queued http_post as succeeded whatever comes back, so a recovery pass that
-- silently stopped running looks exactly like one with nothing to do.
create or replace function public.alert_lecture_segments_stranded()
returns integer
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  exhausted   integer;
  unattempted integer;
begin
  -- Gave up with audio still there: content we could have had and did not get.
  select count(*) into exhausted
  from public.lecture_segments s
  join storage.objects o
    on o.bucket_id = 'lectures' and o.name = s.storage_path
  where s.status <> 'done'
    and s.recovery_attempts >= 3;

  -- Old, stranded, and never even looked at: the pass itself is not running.
  select count(*) into unattempted
  from public.lecture_segments s
  where s.status <> 'done'
    and s.recovery_attempts = 0
    and s.storage_path is not null
    and s.created_at < now() - interval '6 hours';

  if exhausted + unattempted = 0 then
    return 0;
  end if;

  if exists (
    select 1 from public.ops_alerts
    where kind = 'lecture_segments_stranded'
      and created_at > now() - interval '12 hours'
  ) then
    return 0;
  end if;

  insert into public.ops_alerts (kind, detail, delivered)
  values (
    'lecture_segments_stranded',
    jsonb_build_object(
      'exhausted_with_audio', exhausted,
      'never_attempted', unattempted,
      'meaning', 'lecture segments that stopped short of done and recovery did not save',
      'likely_cause', 'lecture-transcribe rejecting the recover action, or lecture-retention not reaching it',
      'check', 'select status_code, left(content,120) from net._http_response order by id desc limit 5'
    ),
    false
  );

  return exhausted + unattempted;
end;
$$;

comment on function public.alert_lecture_segments_stranded() is
  'Raises an ops_alerts row when segment recovery is not working (127): audio '
  'still present after the attempt cap, or stranded rows six hours old that '
  'nothing has even tried. The second half is the one that catches a recovery '
  'pass which stopped running, since that is indistinguishable from an idle one.';

revoke all on function public.alert_lecture_segments_stranded() from public, anon, authenticated;
grant execute on function public.alert_lecture_segments_stranded() to service_role;

-- ─── Schedule ──────────────────────────────────────────────
-- The retention job already runs the edge function that does this work, so
-- there is no new job — only the new alarm added to its DO block. Re-scheduled
-- in full rather than edited in place, so the migration history describes the
-- job that is actually running (the mistake 123 had to go back and fix).
select cron.unschedule('semora-lecture-audio-retention')
where exists (select 1 from cron.job where jobname = 'semora-lecture-audio-retention');

select cron.schedule(
  'semora-lecture-audio-retention',
  '8,28,48 * * * *',
  $cron$
  do $inner$
  declare
    secret text;
  begin
    select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'semora_lecture_cron_secret';

    if secret is not null then
      perform net.http_post(
        url     := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/lecture-retention',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-semora-lecture-cron-secret', secret
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
    end if;

    perform public.alert_lecture_audio_retained();
    perform public.alert_lecture_segments_stranded();
  end
  $inner$;
  $cron$
);
