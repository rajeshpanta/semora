-- ============================================================
-- A LECTURE IS NOT FINISHED UNTIL ITS PARTS ARE
-- ============================================================
-- In the week to 2026-09-13, 3 of the 10 lectures that recorded audio lost
-- parts: 6, 2 and 2 five-minute parts, each student told the recording saved.
-- The trigger is an upload that fails mid-class (a locked phone that cannot read
-- its session, or a brief failure), and three things on the server turned that
-- into permanent, silent loss. This fixes the server's half; the phone's half
-- (a durable upload queue) ships separately.
--
-- 1. FINISHED WHILE STILL RECORDING. sweep_stalled_lectures finished any
--    'transcribing' lecture quiet for 15 minutes, from whatever parts had
--    arrived, without asking whether the phone had stopped recording. Lecture
--    423eda59 was finished from its first 40 minutes, given notes and a push,
--    while the student recorded for another two and a half hours. Now a lecture
--    the phone has not declared finished waits for 3 hours of silence.
--
-- 2. THE GAP ERASED ITSELF. The sweep and lecture_rebuild_transcript wrote
--    segment_count = the parts that arrived, overwriting the count the phone
--    declared, so a lecture missing six parts looked whole. The declared count
--    is kept, and the gap is recorded in parts_missing (lecture_set_parts_missing).
--
-- 3. NOTES NEVER CAUGHT UP. A late part is folded into the transcript
--    (lecture_rebuild_transcript, and Stop's unguarded status reset), but notes
--    written from the shorter transcript stayed as they were; the rebuild only
--    raised an ops alert asking a human to decide. The owner decided on
--    2026-09-13: refresh them. notes_stale asks the notes job to rewrite them,
--    the old notes stay on screen until the new ones land, and the student is
--    told the notes now cover the whole lecture.
--
-- With late parts folded in by the rebuild, Stop no longer needs to drag a
-- finished lecture back to 'uploading' to get its transcript assembled, and
-- doing so could no longer be allowed: a trigger now keeps a finished lecture
-- finished. lecture-transcribe calls the rebuild whenever a part lands on a
-- finished lecture, and brings a 'failed' lecture back to 'transcribing' when a
-- part of it turns out to be alive. Deploy lecture-transcribe and
-- lecture-study-kit immediately after this migration: they call functions and
-- read columns created here, and the rebuild they call must already compare
-- words rather than bytes (lecture_transcript_words).
--
-- The rebuild now compares by words, so it is safe to call on any lecture, and
-- resync_lecture_transcripts (116) uses it: its old test, "more parts than
-- segment_count", can no longer see a late part now that the count is kept.
-- transcript_rev lets a notes rewrite tell whether the transcript grew under it.
--
-- 4. SEVEN DAYS. The phone keeps an undelivered part for 7 days. After that the
--    lecture is labelled as missing those parts for good (parts_unrecoverable_at)
--    and ops hears about it once per lecture. Nothing is deleted.
--
-- 5. ONLY THE SERVER WRITES THE SERVER'S COLUMNS. Signed-in students could write
--    every column of their own lecture rows through the API, which would have
--    let anyone undo all of the above (and zero a reservation, re-trigger notes,
--    or pass off made-up text as a transcribed part). Two triggers now keep the
--    app to what it has ever written: title, course, deck, Stop, and a part's
--    upload. Verified in a rolled-back run: those four tampering writes succeed
--    on the 2026-09-13 database and are neutralised here, while the app's own
--    writes behave exactly as before.
--
-- Every function below is its live definition from 2026-09-13 with only the
-- changes marked "138". Nothing here changes free-allowance or billing rules.
-- ============================================================

-- ── columns ─────────────────────────────────────────────────────
alter table public.lecture_recordings
  add column if not exists parts_missing          integer     not null default 0,
  add column if not exists parts_missing_since    timestamptz,
  add column if not exists parts_unrecoverable_at timestamptz,
  add column if not exists notes_stale            boolean     not null default false,
  add column if not exists notes_refreshed_at     timestamptz,
  add column if not exists transcript_rev         integer     not null default 0;

comment on column public.lecture_recordings.parts_missing is
  'SEMORA (138): parts of the recording not transcribed: the larger of the declared segment_count and the highest seq seen, minus done parts.';
comment on column public.lecture_recordings.parts_unrecoverable_at is
  'SEMORA (138): set when parts were still missing 7 days after first found missing. The lecture is shown as permanently missing them.';
comment on column public.lecture_recordings.notes_stale is
  'SEMORA (138): notes were written from a transcript that has since grown; the notes job rewrites them and clears this.';

comment on column public.lecture_recordings.transcript_rev is
  'SEMORA (138): bumped by lecture_rebuild_transcript when the transcript gains content; notes clear notes_stale only if it did not move while they were written.';

-- ── what a transcript says, ignoring how it is laid out ─────────
create or replace function public.lecture_transcript_words(p_text text)
returns text
language sql
immutable
parallel safe
as $$
  select btrim(regexp_replace(
    regexp_replace(
      coalesce(p_text, ''),
      '\[(Part of this recording could not be transcribed|Falta una parte de la grabación|Recording resumed after an interruption|La grabación se reanudó tras una interrupción)\.\]',
      ' ', 'g'),
    '\s+', ' ', 'g'));
$$;

-- ── how many parts are missing ──────────────────────────────────
create or replace function public.lecture_set_parts_missing(p_lecture_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  declared integer;
  done     integer;
  highest  integer;
  missing  integer;
begin
  select coalesce(segment_count, 0) into declared
  from public.lecture_recordings
  where id = p_lecture_id;
  if not found then
    return 0;
  end if;

  -- The highest seq seen covers a lecture whose phone never declared a count
  -- (it died or lost its session before Stop). A part whose upload never even
  -- created a row cannot be counted; the declared count is the only thing that
  -- sees those, which is why the sweep no longer overwrites it.
  select count(*) filter (where s.status = 'done'),
         coalesce(max(s.seq) + 1, 0)
    into done, highest
  from public.lecture_segments s
  where s.lecture_id = p_lecture_id;

  missing := greatest(0, greatest(declared, highest) - done);

  update public.lecture_recordings
     set parts_missing          = missing,
         parts_missing_since    = case when missing > 0 then coalesce(parts_missing_since, now()) end,
         parts_unrecoverable_at = case when missing > 0 then parts_unrecoverable_at end
   where id = p_lecture_id
     and (parts_missing is distinct from missing
          or (missing = 0 and (parts_missing_since is not null or parts_unrecoverable_at is not null)));

  return missing;
end;
$$;

revoke all on function public.lecture_set_parts_missing(uuid) from public, anon, authenticated;
grant execute on function public.lecture_set_parts_missing(uuid) to service_role;

-- ── what the app may write, and nothing else ────────────────────
-- Until 138 a signed-in student could write every column of their own lecture
-- rows through the API, because the tables grant UPDATE to 'authenticated' and
-- the policies only check ownership. The app itself never writes more than a
-- handful of columns (checked across its whole git history, so every version in
-- use is covered), but anyone holding their own session could:
--   * zero reserved_seconds on a recording in progress, and start more than the
--     two concurrent recordings each account is allowed;
--   * clear notes_md or reset notes_auto_attempts, and have notes written again
--     and again at our cost;
--   * mark a part 'done' with text of their choosing, which is assembled into the
--     transcript without ever being transcribed or charged;
--   * and, from 138, set notes_stale or the parts-missing labels.
-- These triggers keep server-owned columns server-owned. They act only for the
-- API roles; edge functions (service_role) and database functions are
-- untouched. Anything not on the list is kept as it was, rather than refused,
-- so an app build that sends an extra field keeps working.

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

drop trigger if exists lecture_recordings_client_columns_trigger on public.lecture_recordings;
create trigger lecture_recordings_client_columns_trigger
  before insert or update on public.lecture_recordings
  for each row
  execute function public.lecture_recordings_client_columns();

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

drop trigger if exists lecture_segments_client_columns_trigger on public.lecture_segments;
create trigger lecture_segments_client_columns_trigger
  before insert or update on public.lecture_segments
  for each row
  execute function public.lecture_segments_client_columns();

-- ── a finished lecture stays finished ───────────────────────────
create or replace function public.lecture_recordings_no_status_regression()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- finishLecture (the phone's Stop) writes status 'uploading' with no guard.
  -- On a lecture the sweep had already finished, that reset it so the finalizer
  -- would re-assemble the transcript. The rebuild does that job now, so the
  -- status is kept; segment_count and duration_seconds still update.
  if old.status in ('transcribed', 'generating', 'ready')
     and new.status in ('recording', 'uploading', 'transcribing') then
    new.status := old.status;
  end if;
  return new;
end;
$$;

drop trigger if exists lecture_recordings_no_status_regression_trigger on public.lecture_recordings;
create trigger lecture_recordings_no_status_regression_trigger
  before update of status on public.lecture_recordings
  for each row
  execute function public.lecture_recordings_no_status_regression();

-- Stop can land after the sweep already finished the lecture from the parts it
-- had. The status stays (above), but the count Stop brings is the first true
-- total, so the gap is recounted from it.
create or replace function public.lecture_recordings_recount_parts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.lecture_set_parts_missing(new.id);
  return null;
end;
$$;

drop trigger if exists lecture_recordings_recount_parts_trigger on public.lecture_recordings;
create trigger lecture_recordings_recount_parts_trigger
  after update of segment_count on public.lecture_recordings
  for each row
  when (old.segment_count is distinct from new.segment_count
        and new.status in ('transcribed', 'generating', 'ready', 'failed'))
  execute function public.lecture_recordings_recount_parts();

-- ── functions (live definitions + 138 changes) ──────────────────
CREATE OR REPLACE FUNCTION public.lecture_rebuild_transcript(p_lecture_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  rec      record;
  seg      record;
  had_notes boolean;
begin
  select id, transcript, segment_count, notes_md, status
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

  -- 138: compared by words, not bytes. lecture-transcribe assembles the same
  -- parts with paragraph breaks and "[Part of this recording…]" markers, so a
  -- byte comparison called every finished lecture changed, and now that this is
  -- called whenever a part lands on a finished lecture, that would rewrite
  -- correct notes for nothing.
  if seg.done_count = 0
     or public.lecture_transcript_words(seg.text) = public.lecture_transcript_words(rec.transcript) then
    return false;
  end if;

  -- 138: a lecture mid-generation is about to have notes from the old text.
  had_notes := rec.notes_md is not null or rec.status = 'generating';

  update public.lecture_recordings
     set transcript       = seg.text,
         -- 138: never shrink the phone's declared count (see sweep_stalled_lectures).
         segment_count    = greatest(coalesce(segment_count, 0), seg.done_count),
         duration_seconds = seg.total_seconds,
         -- 138: lets the notes job tell whether the transcript grew while it
         -- was writing (see lecture-study-kit handleNotes).
         transcript_rev   = transcript_rev + 1,
         updated_at       = now()
   where id = p_lecture_id;

  perform public.lecture_set_parts_missing(p_lecture_id);

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

CREATE OR REPLACE FUNCTION public.sweep_stalled_lectures()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  swept   integer := 0;
  rec     record;
  seg     record;
begin
  -- ─── 1. Abandoned mid-upload (082; 138: never while still recording) ──
  --
  -- 138. A 'transcribing' lecture whose parts stopped arriving was finished here
  -- after 15 quiet minutes, whether or not the phone had said it was done
  -- recording. On 2026-09-09 a phone lost its session mid-class, six parts in a
  -- row failed to upload, and this finished the lecture from the first forty
  -- minutes, wrote notes and sent the push while the student was still
  -- recording. segment_count is the phone's "I have stopped" (finishLecture), so:
  --   declared   → finish after 15 quiet minutes, as before
  --   undeclared → the phone may still be recording; wait until nothing has
  --                arrived for 3 hours (a lecture is capped at 90 minutes)
  for rec in
    select r.id, r.user_id
    from public.lecture_recordings r
    where r.status in ('uploading', 'transcribing')
      and r.updated_at < now() - interval '15 minutes'
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
      -- 138: segment_count keeps the phone's declared count. Overwriting it with
      -- the parts that happened to arrive is what made a lecture with six
      -- missing parts look complete. The gap is recorded in parts_missing.
      update public.lecture_recordings
      set transcript       = seg.text,
          segment_count    = greatest(coalesce(segment_count, 0), seg.done_count),
          duration_seconds = seg.total_seconds,
          status           = 'transcribed',
          error_code       = null,
          updated_at       = now()
      where id = rec.id;
      perform public.lecture_set_parts_missing(rec.id);
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
          -- 138: same as section 1.
          segment_count    = greatest(coalesce(segment_count, 0), seg.done_count),
          duration_seconds = seg.total_seconds,
          status           = 'transcribed',
          error_code       = null,
          updated_at       = now()
      where id = rec.id;
      perform public.lecture_set_parts_missing(rec.id);
    else
      update public.lecture_recordings
      set status     = 'failed',
          error_code = 'STALLED',
          updated_at = now()
      where id = rec.id;
    end if;

    swept := swept + 1;
  end loop;

  -- ─── 4. Parts that never arrived within 7 days (138) ─────────
  -- Late parts are folded in for a week (the phone keeps them that long). After
  -- that the lecture is labelled as missing them for good, and ops hears about it
  -- once per lecture. Nothing is deleted here.
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
    insert into public.ops_alerts (kind, detail, delivered)
    values (
      'lecture_parts_unrecoverable',
      jsonb_build_object(
        'lecture_id', rec.id,
        'parts_missing', rec.parts_missing,
        'meaning', 'parts of this recording never reached the server within 7 days',
        'student_sees', 'the lecture is labelled as missing these parts'
      ),
      false
    );
    swept := swept + 1;
  end loop;

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
            or (r.status in ('transcribed', 'ready') and r.notes_stale)
          )
      and length(btrim(coalesce(r.transcript, ''))) >= 200
      and r.updated_at < now() - interval '10 minutes'
      and r.notes_auto_attempts < 3
      -- The audio itself, asked directly. A lecture still receiving segments is
      -- still being recorded, whatever its status column says, and its
      -- transcript is still growing. Writing notes now would describe a
      -- fraction of the class and could never be undone.
      and not exists (
        select 1 from public.lecture_segments s
        where s.lecture_id = r.id
          and s.created_at > now() - interval '15 minutes'
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

CREATE OR REPLACE FUNCTION public.notify_lecture_notes_ready()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'pg_temp'
AS $function$
declare
  rec      record;
  secret   text;
  notified integer := 0;
begin
  select decrypted_secret into secret
  from vault.decrypted_secrets where name = 'push_send_secret';

  -- No secret means every push would be refused at the door. Stamping the rows
  -- anyway would burn the one notification each lecture ever gets.
  if secret is null then
    return 0;
  end if;

  for rec in
    select r.id, r.user_id, r.title
    from public.lecture_recordings r
    join public.profiles p on p.id = r.user_id
    where r.status = 'ready'
      and r.notes_md is not null
      and r.notes_auto_attempts > 0
      and r.notes_ready_notified_at is null
      -- 138: notes the student already had, since rewritten, get the second
      -- message below instead of "ready" as if they were new.
      and r.notes_refreshed_at is null
      -- Nothing older than a day. A push about a lecture from last week reads
      -- as a bug, not a rescue.
      and r.updated_at > now() - interval '24 hours'
      and exists (select 1 from public.push_tokens t where t.user_id = r.user_id)
      and extract(
            hour from (
              now() at time zone (
                case when exists (
                  select 1 from pg_timezone_names z where z.name = nullif(p.timezone, '')
                ) then p.timezone else 'UTC' end
              )
            )
          ) between 8 and 20
    order by r.updated_at
    limit 20
    for update of r skip locked
  loop
    update public.lecture_recordings
       set notes_ready_notified_at = now()
     where id = rec.id;

    perform net.http_post(
      url     := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || secret
      ),
      body := jsonb_build_object(
        'user_ids', jsonb_build_array(rec.user_id),
        'title', 'Your lecture notes are ready',
        'body',
          case
            when nullif(btrim(coalesce(rec.title, '')), '') is not null
              then 'We finished the notes for “' || left(btrim(rec.title), 60) || '”.'
            else 'We finished writing up the lecture you recorded.'
          end,
        'translations', jsonb_build_object(
          'es', jsonb_build_object(
            'title', 'Tus apuntes de la clase están listos',
            'body',
              case
                when nullif(btrim(coalesce(rec.title, '')), '') is not null
                  then 'Terminamos los apuntes de «' || left(btrim(rec.title), 60) || '».'
                else 'Terminamos de redactar la clase que grabaste.'
              end
          )
        ),
        'data', jsonb_build_object(
          'type', 'lecture_notes_ready',
          'lectureId', rec.id
        )
      ),
      timeout_milliseconds := 60000
    );

    notified := notified + 1;
  end loop;

  -- 138: notes rewritten after missing parts arrived. A different sentence on
  -- purpose — "your notes are ready" a second time reads like a glitch, and
  -- the student should know the notes changed and why.
  for rec in
    select r.id, r.user_id, r.title
    from public.lecture_recordings r
    join public.profiles p on p.id = r.user_id
    where r.status = 'ready'
      and r.notes_md is not null
      and r.notes_refreshed_at is not null
      and r.notes_refreshed_at > coalesce(r.notes_ready_notified_at, '-infinity'::timestamptz)
      and r.notes_refreshed_at > now() - interval '24 hours'
      -- Parts can land a few minutes apart, each one rewriting the notes. One
      -- message an hour is plenty; a later rewrite is announced once the hour
      -- has passed.
      and coalesce(r.notes_ready_notified_at, '-infinity'::timestamptz) < now() - interval '1 hour'
      and exists (select 1 from public.push_tokens t where t.user_id = r.user_id)
      and extract(
            hour from (
              now() at time zone (
                case when exists (
                  select 1 from pg_timezone_names z where z.name = nullif(p.timezone, '')
                ) then p.timezone else 'UTC' end
              )
            )
          ) between 8 and 20
    order by r.notes_refreshed_at
    limit 20
    for update of r skip locked
  loop
    update public.lecture_recordings
       set notes_ready_notified_at = now()
     where id = rec.id;

    perform net.http_post(
      url     := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || secret
      ),
      body := jsonb_build_object(
        'user_ids', jsonb_build_array(rec.user_id),
        'title', 'Your notes now cover the whole lecture',
        'body',
          case
            when nullif(btrim(coalesce(rec.title, '')), '') is not null
              then 'The rest of “' || left(btrim(rec.title), 60) || '” arrived, and the notes are updated.'
            else 'The rest of your recording arrived, and the notes are updated.'
          end,
        'translations', jsonb_build_object(
          'es', jsonb_build_object(
            'title', 'Tus apuntes ya cubren toda la clase',
            'body',
              case
                when nullif(btrim(coalesce(rec.title, '')), '') is not null
                  then 'Llegó el resto de «' || left(btrim(rec.title), 60) || '» y los apuntes están actualizados.'
                else 'Llegó el resto de tu grabación y los apuntes están actualizados.'
              end
          )
        ),
        'data', jsonb_build_object(
          'type', 'lecture_notes_ready',
          'lectureId', rec.id
        )
      ),
      timeout_milliseconds := 60000
    );

    notified := notified + 1;
  end loop;

  return notified;
end;
$function$;

-- resync_lecture_transcripts (116) found a transcript that fell behind its parts
-- by "more text-bearing parts than segment_count". segment_count now keeps the
-- phone's declared count, so a late part on a lecture that declared 15 and
-- received 9 would never trip that test. It asks lecture_rebuild_transcript
-- instead, which compares the words themselves and is a no-op when nothing grew.
-- Same rows (finished, no notes yet), same cap, same schedule.
CREATE OR REPLACE FUNCTION public.resync_lecture_transcripts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec   record;
  fixed integer := 0;
begin
  for rec in
    select r.id
    from public.lecture_recordings r
    where r.status = 'transcribed'
      and r.notes_md is null
      and exists (
        select 1 from public.lecture_segments s
        where s.lecture_id = r.id
          and s.status = 'done'
      )
    order by r.updated_at
    limit 50
  loop
    if public.lecture_rebuild_transcript(rec.id) then
      fixed := fixed + 1;
    end if;
  end loop;

  return fixed;
end;
$function$;

CREATE OR REPLACE FUNCTION public.alert_lecture_notes_stuck()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  stuck integer;
begin
  select count(*) into stuck
  from public.lecture_recordings
  where (
          (status = 'transcribed' and notes_md is null)
          -- 138: a notes rewrite after late parts that keeps failing. The student
          -- still has the earlier notes, so nothing on screen shows it.
          or (status in ('transcribed', 'ready') and notes_stale)
        )
    and notes_auto_attempts >= 3
    and updated_at > now() - interval '24 hours';

  -- Two, not one, for the same reason 095 chose two: a single lecture can fail
  -- on its own merits (a transcript that is 200 characters of coughing), and an
  -- alert that cries wolf over one row is an alert that gets ignored. A broken
  -- hop fails EVERY lecture, so it clears this bar the moment there is traffic.
  if stuck < 2 then
    return 0;
  end if;

  -- One alert per six hours. Nothing here is fixed in minutes.
  if exists (
    select 1 from public.ops_alerts
    where kind = 'lecture_notes_stuck'
      and created_at > now() - interval '6 hours'
  ) then
    return 0;
  end if;

  insert into public.ops_alerts (kind, detail, delivered)
  values (
    'lecture_notes_stuck',
    jsonb_build_object(
      'stuck_lectures', stuck,
      'likely_cause', 'lecture-study-kit deployed without --no-verify-jwt, or the model is failing',
      'check', 'select status_code, left(content,120) from net._http_response order by id desc limit 5'
    ),
    false
  );

  return stuck;
end;
$function$;

-- ── backfill: lectures that already have gaps ───────────────────
select public.lecture_set_parts_missing(r.id)
from public.lecture_recordings r
where r.source = 'recording'
  and r.status in ('transcribed', 'generating', 'ready', 'failed');

-- A lecture recorded in the last 7 days gets its 7 days from today, so a part
-- still on a student's phone can arrive once the app's upload queue ships (on
-- 2026-09-13 that includes c199acd0, whose phone is still in use). Older ones
-- were already past the window before this existed: they are labelled now,
-- without an ops alert each, because nobody learns anything from a dozen alerts
-- about August. The label lifts itself if the parts ever do arrive.
update public.lecture_recordings
   set parts_unrecoverable_at = now()
 where parts_missing > 0
   and parts_unrecoverable_at is null
   and created_at < now() - interval '7 days';
