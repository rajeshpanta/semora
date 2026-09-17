-- ============================================================
-- LECTURE TEST HARNESS — a THROWAWAY database only, never production.
--
-- Rebuilds the production shape of everything the lecture pipeline touches:
-- the tables (generated read-only from production on 2026-09-16), their
-- constraints, indexes and triggers, and the LIVE definition of every lecture
-- function (pg_get_functiondef, verified identical to migrations 065-139).
-- Supabase-only pieces (auth.uid, vault, pg_net, pg_cron, storage.foldername,
-- is_pro) are stubbed so their effects can be asserted.
--
--   createdb semora_lecture_test
--   psql -v ON_ERROR_STOP=1 -d semora_lecture_test -f supabase/tests/lecture/harness.sql
--   psql -v ON_ERROR_STOP=1 -d semora_lecture_test -f supabase/tests/lecture/<test>.sql
-- ============================================================
set client_min_messages = warning;
set check_function_bodies = off;
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists vault;
create schema if not exists net;
create schema if not exists cron;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table if not exists vault.decrypted_secrets (name text primary key, decrypted_secret text);
create table if not exists net.calls (id bigserial primary key, url text, headers jsonb, body jsonb, timeout_milliseconds int, at timestamptz default now());
create or replace function net.http_post(url text, headers jsonb default '{}'::jsonb, body jsonb default '{}'::jsonb, timeout_milliseconds int default 5000)
returns bigint language sql as $$ insert into net.calls (url, headers, body, timeout_milliseconds) values ($1,$2,$3,$4) returning id $$;
create table if not exists cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text);
create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
  insert into cron.job (jobname, schedule, command) values ($1,$2,$3)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $$;
create or replace function cron.unschedule(job_name text) returns boolean language sql as $$
  with d as (delete from cron.job where jobname = $1 returning 1) select exists(select 1 from d) $$;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
create table if not exists public.test_pro (user_id uuid primary key);

-- ── tables (production columns) ──
create table if not exists public.ai_call_log (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  task text not null,
  provider text not null,
  model text not null,
  status text not null,
  error_code text,
  duration_ms integer,
  attempts integer,
  prompt_tokens integer,
  output_tokens integer,
  created_at timestamp with time zone default now() not null,
  error_detail text,
  cached_tokens integer,
  reasoning_tokens integer
);

create table if not exists public.course_notes (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  course_id uuid not null,
  storage_path text,
  filename text not null,
  mime_type text,
  extracted_text text,
  created_at timestamp with time zone default now() not null,
  source text default 'upload'::text not null,
  source_recording_id uuid,
  extracted boolean
);

create table if not exists public.courses (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  semester_id uuid not null,
  name text not null,
  instructor text,
  color text default '#6366f1'::text,
  icon text default 'book'::text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  grade_scale jsonb,
  credit_hours numeric default 3 not null,
  extra_credit_policy text default 'bonus'::text not null,
  source text default 'manual'::text not null
);

create table if not exists public.decks (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  course_id uuid,
  title text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  source_shared_deck_id uuid,
  source_content_hash text
);

create table if not exists public.lecture_quota_day (
  day date not null,
  seconds_reserved integer default 0 not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.lecture_recordings (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  course_id uuid,
  title text not null,
  duration_seconds integer default 0 not null,
  segment_count integer default 0 not null,
  status text default 'recording'::text not null,
  error_code text,
  transcript text,
  notes_md text,
  quiz jsonb,
  quiz_generating boolean default false not null,
  audio_deleted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  reserved_seconds integer default 0 not null,
  reserved_day date,
  notes_started_at timestamp with time zone,
  quiz_started_at timestamp with time zone,
  deck_id uuid,
  source text default 'recording'::text not null,
  source_filename text,
  notes_auto_attempts smallint default 0 not null,
  notes_ready_notified_at timestamp with time zone,
  parts_missing integer default 0 not null,
  parts_missing_since timestamp with time zone,
  parts_unrecoverable_at timestamp with time zone,
  notes_stale boolean default false not null,
  notes_refreshed_at timestamp with time zone,
  transcript_rev integer default 0 not null
);

create table if not exists public.lecture_segments (
  id uuid default gen_random_uuid() not null,
  lecture_id uuid not null,
  user_id uuid not null,
  seq integer not null,
  storage_path text,
  seconds integer default 0 not null,
  status text default 'pending'::text not null,
  claimed_at timestamp with time zone,
  transcript text,
  has_gap boolean default false not null,
  created_at timestamp with time zone default now() not null,
  recovery_attempts integer default 0 not null,
  dispatched_at timestamp with time zone
);

create table if not exists public.lecture_usage_log (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  lecture_id uuid,
  audio_seconds integer default 0 not null,
  status text not null,
  error_code text,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.ops_alert_recipients (
  user_id uuid not null,
  note text,
  added_at timestamp with time zone default now() not null
);

create table if not exists public.ops_alerts (
  id bigint generated by default as identity not null,
  kind text not null,
  detail jsonb,
  delivered boolean default false not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.profiles (
  id uuid not null,
  email text,
  display_name text,
  timezone text,
  reminder_same_day boolean default true,
  reminder_1day boolean default true,
  reminder_3day boolean default true,
  onboarded boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  study_daily_minutes smallint default 90 not null,
  study_session_minutes smallint default 45 not null,
  study_weekday_start time without time zone default '17:00:00'::time without time zone not null,
  study_weekend_start time without time zone default '10:00:00'::time without time zone not null,
  study_include_weekends boolean default true not null,
  gpa_scale jsonb default '[{"letter": "A+", "points": 4}, {"letter": "A", "points": 4}, {"letter": "A-", "points": 3.7}, {"letter": "B+", "points": 3.3}, {"letter": "B", "points": 3}, {"letter": "B-", "points": 2.7}, {"letter": "C+", "points": 2.3}, {"letter": "C", "points": 2}, {"letter": "C-", "points": 1.7}, {"letter": "D+", "points": 1.3}, {"letter": "D", "points": 1}, {"letter": "D-", "points": 0.7}, {"letter": "F", "points": 0}]'::jsonb not null,
  quiet_hours_enabled boolean default false not null,
  quiet_hours_start time without time zone default '22:00:00'::time without time zone not null,
  quiet_hours_end time without time zone default '08:00:00'::time without time zone not null,
  study_auto_reschedule boolean default true not null,
  study_avoid_calendar_conflicts boolean default true not null,
  flashcards_due_push_enabled boolean default true not null,
  flashcards_due_push_last_sent_at timestamp with time zone,
  preferred_language text default 'en'::text not null,
  class_reminder_minutes smallint,
  lms_pending_push_enabled boolean default true not null,
  lms_pending_push_last_sent_at timestamp with time zone
);

create table if not exists public.push_tokens (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  token text not null,
  platform text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  preferred_language text default 'en'::text not null
);

create table if not exists public.scan_usage_log (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  upload_id uuid,
  status text not null,
  error_code text,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.syllabus_uploads (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  course_id uuid not null,
  storage_path text not null,
  file_name text not null,
  file_size_bytes integer,
  status text default 'pending'::text,
  created_at timestamp with time zone default now(),
  counts_toward_free_action boolean default true not null
);


create table if not exists storage.objects (
  id uuid default gen_random_uuid() not null,
  bucket_id text,
  name text,
  owner uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  last_accessed_at timestamp with time zone default now(),
  metadata jsonb,
  path_tokens text[],
  version text,
  owner_id text,
  user_metadata jsonb,
  archived_at timestamp with time zone,
  is_delete_marker boolean default false not null,
  is_versioned boolean default false not null
);



-- ── constraints and indexes (production) ──
alter table public.lecture_recordings add primary key (id);
alter table public.lecture_recordings add constraint lecture_recordings_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.lecture_recordings add constraint lecture_recordings_source_check check (source = any (array['recording','document']));
alter table public.lecture_recordings add constraint lecture_recordings_status_check check (status = any (array['recording','uploading','transcribing','transcribed','generating','ready','failed']));
alter table public.lecture_segments add primary key (id);
alter table public.lecture_segments add constraint lecture_segments_lecture_id_fkey foreign key (lecture_id) references public.lecture_recordings(id) on delete cascade;
alter table public.lecture_segments add constraint lecture_segments_lecture_id_seq_key unique (lecture_id, seq);
alter table public.lecture_segments add constraint lecture_segments_status_check check (status = any (array['pending','uploaded','transcribing','done','failed']));
alter table public.lecture_usage_log add primary key (id);
alter table public.lecture_usage_log add constraint lecture_usage_log_status_check check (status = any (array['success','failed']));
create unique index lecture_usage_log_user_lecture_uniq on public.lecture_usage_log (user_id, lecture_id) where lecture_id is not null;
alter table public.lecture_quota_day add primary key (day);
alter table public.ops_alerts add primary key (id);
alter table public.profiles add primary key (id);
alter table public.scan_usage_log add constraint scan_usage_log_status_check check (status = any (array['success','failed','zero_dated']));
alter table public.course_notes add primary key (id);
alter table public.course_notes add constraint course_notes_source_recording_id_fkey foreign key (source_recording_id) references public.lecture_recordings(id) on delete cascade;

-- ── live functions ──
-- helper used by the parent-owner triggers (production definition)
CREATE OR REPLACE FUNCTION public.parent_row_user_id(parent_table regclass, parent_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  result uuid;
begin
  if parent_id is null then
    return null;
  end if;
  execute format('select user_id from %s where id = $1', parent_table)
    into result
    using parent_id;
  return result;
end;
$function$;

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

CREATE OR REPLACE FUNCTION public.alert_lecture_segments_stranded()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'storage', 'pg_temp'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.free_action_used(uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.lecture_usage_log
    where user_id = uid and status = 'success'
  ) or exists (
    -- 'zero_dated' rows are deliberately NOT counted: that is the courtesy.
    select 1 from public.scan_usage_log
    where user_id = uid and status = 'success'
  ) or exists (
    -- Unchanged in purpose (see 071): this clause keeps the answer the user is
    -- shown identical to the answer the trigger enforces, including when the
    -- ledger insert failed and was swallowed. It now skips the one upload
    -- attached to the courtesy, exactly as enforce_free_scan_limit() does.
    select 1 from public.syllabus_uploads
    where user_id = uid and counts_toward_free_action
  );
$function$;

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

CREATE OR REPLACE FUNCTION public.lecture_audio_is_actionable(p_name text, p_created_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

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
      '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/seg_([0-9]{3})\.m4a$'
    ) as m
  ) parsed
  join public.lecture_recordings r
    on r.id = m[2]::uuid
   and r.user_id = m[1]::uuid
   and r.source = 'recording'
  where m is not null
    and m[3]::integer < 200;
$function$;

CREATE OR REPLACE FUNCTION public.lecture_note_recovery_attempt(p_segment_id uuid)
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.lecture_segments
     set recovery_attempts = recovery_attempts + 1
   where id = p_segment_id
  returning recovery_attempts;
$function$;

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

CREATE OR REPLACE FUNCTION public.lecture_recordings_assert_parent_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  parent_user uuid;
begin
  if new.course_id is null then
    return new;
  end if;
  parent_user := public.parent_row_user_id('public.courses'::regclass, new.course_id);
  if parent_user is null then
    raise exception 'Referenced course does not exist'
      using errcode = '23503';
  end if;
  if parent_user <> new.user_id then
    raise exception 'Cross-tenant write blocked: lecture cannot reference a course owned by another user'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.lecture_recordings_client_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.lecture_recordings_no_status_regression()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.lecture_recordings_recount_parts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform public.lecture_set_parts_missing(new.id);
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.lecture_recordings_release_on_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if coalesce(old.reserved_seconds, 0) > 0 then
    update public.lecture_quota_day
       set seconds_reserved = greatest(0, seconds_reserved - old.reserved_seconds),
           updated_at = now()
     where day = coalesce(old.reserved_day, (now() at time zone 'utc')::date);
  end if;
  return old;
end;
$function$;

CREATE OR REPLACE FUNCTION public.lecture_recordings_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.lecture_refund_recovery_attempt(p_segment_id uuid)
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.lecture_segments
     set recovery_attempts = greatest(0, recovery_attempts - 1)
   where id = p_segment_id
  returning recovery_attempts;
$function$;

CREATE OR REPLACE FUNCTION public.lecture_segments_assert_parent_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  parent_user uuid;
begin
  parent_user := public.parent_row_user_id('public.lecture_recordings'::regclass, new.lecture_id);
  if parent_user is null then
    raise exception 'Referenced lecture does not exist'
      using errcode = '23503';
  end if;
  if parent_user <> new.user_id then
    raise exception 'Cross-tenant write blocked: segment cannot reference a lecture owned by another user'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.lecture_segments_client_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.lecture_set_parts_missing(p_lecture_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

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

CREATE OR REPLACE FUNCTION public.lecture_take_over_arrived_audio(p_limit integer DEFAULT 5)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'storage', 'vault', 'pg_temp'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.lecture_transcript_words(p_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  select btrim(regexp_replace(
    regexp_replace(
      coalesce(p_text, ''),
      '\[(Part of this recording could not be transcribed|Falta una parte de la grabación|Recording resumed after an interruption|La grabación se reanudó tras una interrupción)\.\]',
      ' ', 'g'),
    '\s+', ' ', 'g'));
$function$;

CREATE OR REPLACE FUNCTION public.lecture_write_off_segment(p_segment_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'storage', 'pg_temp'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.my_free_action_used()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.free_action_used(auth.uid());
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

CREATE OR REPLACE FUNCTION public.read_lecture_cron_secret()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'vault', 'pg_temp'
AS $function$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  return (
    select decrypted_secret
    from vault.decrypted_secrets
    where name = 'semora_lecture_cron_secret'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.reclaim_stale_lecture_reservations(p_older_than_minutes integer DEFAULT 180)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r         record;
  reclaimed integer := 0;
begin
  for r in
    select id
      from public.lecture_recordings
     where reserved_seconds > 0
       and status in ('recording', 'uploading')
       and updated_at < now() - make_interval(mins => greatest(1, p_older_than_minutes))
     limit 50
  loop
    reclaimed := reclaimed + public.release_lecture_reservation(r.id);
  end loop;
  return reclaimed;
end;
$function$;

CREATE OR REPLACE FUNCTION public.release_finished_lecture_reservations()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r        record;
  released integer := 0;
begin
  for r in
    select id
      from public.lecture_recordings
     where reserved_seconds > 0
       -- The complement of "still capturing". Written as NOT IN so a status
       -- added later is treated as finished and released, rather than silently
       -- inheriting the leak by not being on an allow-list.
       and status not in ('recording', 'uploading', 'transcribing')
     order by reserved_day
     limit 200
     for update skip locked
  loop
    released := released + public.release_lecture_reservation(r.id);
  end loop;

  return released;
end;
$function$;

CREATE OR REPLACE FUNCTION public.release_lecture_reservation(p_lecture_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_seconds integer;
  v_day     date;
begin
  select reserved_seconds, reserved_day
    into v_seconds, v_day
    from public.lecture_recordings
   where id = p_lecture_id
   for update;

  if v_seconds is null or v_seconds <= 0 then
    return 0;
  end if;

  update public.lecture_recordings
     set reserved_seconds = 0
   where id = p_lecture_id;

  update public.lecture_quota_day
     set seconds_reserved = greatest(0, seconds_reserved - v_seconds),
         updated_at = now()
   where day = coalesce(v_day, (now() at time zone 'utc')::date);

  return v_seconds;
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

CREATE OR REPLACE FUNCTION public.reserve_lecture_for_recording(p_lecture_id uuid, p_seconds integer, p_cap_seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  today date := (now() at time zone 'utc')::date;
  ok    boolean := false;
begin
  if p_seconds is null or p_seconds <= 0 then
    return true;
  end if;

  insert into public.lecture_quota_day (day) values (today)
  on conflict (day) do nothing;

  -- The WHERE clause is the admission test: concurrent callers serialize on
  -- this row, so the second one sees the first one's total and is refused.
  update public.lecture_quota_day
     set seconds_reserved = seconds_reserved + p_seconds,
         updated_at = now()
   where day = today
     and seconds_reserved + p_seconds <= p_cap_seconds
  returning true into ok;

  if not coalesce(ok, false) then
    return false;
  end if;

  -- Same transaction: if this fails, the reservation above rolls back with it,
  -- which is exactly the property the split version could not offer.
  update public.lecture_recordings
     set reserved_seconds = p_seconds,
         reserved_day     = today
   where id = p_lecture_id;

  if not found then
    raise exception 'Lecture % not found while reserving capacity', p_lecture_id
      using errcode = '23503';
  end if;

  return true;
end;
$function$;

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


create or replace function public.is_pro(uid uuid) returns boolean language sql stable as $$
  select exists (select 1 from public.test_pro where user_id = uid) $$;
create or replace function public.lecture_recordings_sync_course_note() returns trigger language plpgsql as $$ begin return null; end $$;

-- ── triggers (production) ──
create trigger lecture_recordings_assert_parent_owner_trigger before insert or update of course_id, user_id on public.lecture_recordings for each row execute function lecture_recordings_assert_parent_owner();
create trigger lecture_recordings_client_columns_trigger before insert or update on public.lecture_recordings for each row execute function lecture_recordings_client_columns();
create trigger lecture_recordings_no_status_regression_trigger before update of status on public.lecture_recordings for each row execute function lecture_recordings_no_status_regression();
create trigger lecture_recordings_recount_parts_trigger after update of segment_count on public.lecture_recordings for each row when (((old.segment_count is distinct from new.segment_count) and (new.status = any (array['transcribed','generating','ready','failed'])))) execute function lecture_recordings_recount_parts();
create trigger lecture_recordings_release_on_delete_trigger before delete on public.lecture_recordings for each row execute function lecture_recordings_release_on_delete();
create trigger lecture_recordings_set_updated_at_trigger before update on public.lecture_recordings for each row execute function lecture_recordings_set_updated_at();
create trigger lecture_segments_assert_parent_owner_trigger before insert or update of lecture_id, user_id on public.lecture_segments for each row execute function lecture_segments_assert_parent_owner();
create trigger lecture_segments_client_columns_trigger before insert or update on public.lecture_segments for each row execute function lecture_segments_client_columns();

-- ── API role access (production: RLS own rows) ──
grant usage on schema public, auth to authenticated, anon, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
alter table public.lecture_recordings enable row level security;
alter table public.lecture_segments enable row level security;
create policy own_lecture_recordings_select on public.lecture_recordings for select using (auth.uid() = user_id);
create policy own_lecture_recordings_update on public.lecture_recordings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_lecture_recordings_delete on public.lecture_recordings for delete using (auth.uid() = user_id);
create policy own_document_notes_insert on public.lecture_recordings for insert with check ((auth.uid() = user_id) and (source = 'document') and (coalesce(duration_seconds, 0) = 0) and (coalesce(segment_count, 0) = 0));
create policy own_lecture_segments on public.lecture_segments using (auth.uid() = user_id) with check (auth.uid() = user_id);
insert into vault.decrypted_secrets values ('semora_lecture_cron_secret', 'cron-secret'), ('push_send_secret', 'push-secret');
