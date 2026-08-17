-- ============================================================
-- SEMORA — LECTURE RECORDING (065)
--
-- This Postgres instance is SHARED with the Citizen app. Every object below
-- carries a SEMORA comment and a row in supabase/SUPABASE_OWNERSHIP.md.
--
-- The feature: a student records a class lecture, the audio is transcribed by
-- a speech-to-text provider, and an LLM writes study notes from the transcript.
--
-- THREE DESIGN FACTS drive this schema, each learned the hard way:
--
--   1. AUDIO IS CAPTURED IN SEGMENTS, NOT ONE FILE. An .m4a killed before its
--      writer finalizes has no `moov` atom — it is not truncated, it is
--      unplayable. A 90-minute lecture lost to an OS kill is unrecoverable, so
--      capture is chunked into ~5-minute segments (`lecture_segments`). That
--      also caps every upload at ~1.2 MB and every transcription call at ~300
--      seconds of audio, which is what keeps one Edge Function invocation well
--      inside the platform wall-clock limit.
--
--   2. THE AUDIO IS DELETED AS SOON AS THE TRANSCRIPT IS DURABLY WRITTEN.
--      `audio_deleted_at` records when. Lecture audio contains a third party's
--      voice (the instructor) and everyone within microphone range; keeping it
--      after it has served its purpose buys storage cost and an erasure
--      obligation and nothing else. Playback is deliberately not a feature.
--
--   3. THE FREE-LECTURE QUOTA IS COUNTED IN A LEDGER THE USER CANNOT WRITE.
--      `enforce_free_scan_limit` (044) counts rows in `syllabus_uploads`, a
--      table the user can delete from — delete-and-retry resets that quota
--      forever. The cost of a lecture is spent at TRANSCRIPTION time, so the
--      quota is consumed by the CALL, not by the artifact that survives it.
--      `lecture_usage_log` is service-role-only and is never deleted except by
--      account cascade.
-- ============================================================

-- ─── lecture_recordings ─────────────────────────────────────────
-- One row per recording. `course_id` is nullable BY DESIGN: a student in a
-- lecture hall taps record first and decides which course it belongs to
-- afterwards. Attaching a course is what lets the AI tutor and the flashcard
-- generator use the lecture (via the course_notes mirror written by
-- lecture-study-kit).
--
-- ON DELETE SET NULL, not cascade: deleting a course must not destroy an hour
-- of transcribed lecture the student paid for with their free slot. The
-- recording survives, detached, and stays visible in the Lectures list so
-- nothing disappears silently — the student deletes it explicitly if they want
-- it gone. (The course_notes mirror row DOES cascade with the course, which is
-- correct: that row exists only to ground that course's tutor.)
create table if not exists public.lecture_recordings (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  course_id        uuid references public.courses(id) on delete set null,
  title            text not null,
  duration_seconds integer not null default 0,
  segment_count    integer not null default 0,
  -- recording  → capture in progress on the device (row exists so segments can
  --              be uploaded as they close)
  -- uploading  → capture finished, segments still being sent
  -- transcribing → at least one segment is with the speech-to-text provider
  -- transcribed  → full transcript assembled; audio deleted
  -- generating   → notes being written by the LLM
  -- ready        → notes available
  -- failed       → see error_code
  status           text not null default 'recording'
                     check (status in ('recording', 'uploading', 'transcribing',
                                       'transcribed', 'generating', 'ready', 'failed')),
  error_code       text,
  transcript       text,
  notes_md         text,
  quiz             jsonb,
  quiz_generating  boolean not null default false,
  -- Stamped when every segment object has been removed from the `lectures`
  -- bucket. A non-null value is the durable record that the audio is gone.
  audio_deleted_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists lecture_recordings_user_created_idx
  on public.lecture_recordings (user_id, created_at desc);
create index if not exists lecture_recordings_course_created_idx
  on public.lecture_recordings (course_id, created_at desc);

comment on table public.lecture_recordings is
  'SEMORA: recorded class lectures — transcript + AI notes/quiz. Audio itself is deleted once the transcript is written (see audio_deleted_at).';

-- ─── lecture_segments ───────────────────────────────────────────
-- One row per ~5-minute audio chunk. `storage_path` is nulled when the object
-- is deleted after transcription, so a null path on a `done` segment is the
-- normal end state, not an error.
create table if not exists public.lecture_segments (
  id           uuid primary key default gen_random_uuid(),
  lecture_id   uuid not null references public.lecture_recordings(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  seq          integer not null,
  storage_path text,
  seconds      integer not null default 0,
  status       text not null default 'pending'
                 check (status in ('pending', 'uploaded', 'transcribing', 'done', 'failed')),
  -- Set when an Edge invocation claims this segment. A claim older than the
  -- stale window is reclaimable — that is what makes a killed invocation
  -- recoverable without a queue.
  claimed_at   timestamptz,
  transcript   text,
  -- True when capture was interrupted (call, Siri, another app taking the mic)
  -- immediately before this segment, so the UI can say so honestly rather than
  -- presenting a transcript with a silent hole in it.
  has_gap      boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (lecture_id, seq)
);

create index if not exists lecture_segments_lecture_seq_idx
  on public.lecture_segments (lecture_id, seq);

comment on table public.lecture_segments is
  'SEMORA: ~5-minute audio chunks of a lecture_recording. storage_path is nulled once the object is deleted post-transcription.';

-- ─── updated_at ─────────────────────────────────────────────────
create or replace function public.lecture_recordings_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists lecture_recordings_set_updated_at_trigger on public.lecture_recordings;
create trigger lecture_recordings_set_updated_at_trigger
  before update on public.lecture_recordings
  for each row execute function public.lecture_recordings_set_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────
-- Owner-only, no anon access. The Edge Functions use the service-role client
-- and bypass RLS — which is exactly why they re-verify ownership explicitly on
-- every row they read.
alter table public.lecture_recordings enable row level security;
alter table public.lecture_segments   enable row level security;

drop policy if exists "own_lecture_recordings" on public.lecture_recordings;
create policy "own_lecture_recordings" on public.lecture_recordings
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_lecture_segments" on public.lecture_segments;
create policy "own_lecture_segments" on public.lecture_segments
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── Cross-tenant protection ────────────────────────────────────
-- Mirrors 015/025: a lecture may not reference another user's course. The
-- null-course early return is required — an unattached lecture is a valid and
-- common state (recorded first, filed later).
create or replace function public.lecture_recordings_assert_parent_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

drop trigger if exists lecture_recordings_assert_parent_owner_trigger on public.lecture_recordings;
create trigger lecture_recordings_assert_parent_owner_trigger
  before insert or update of course_id, user_id on public.lecture_recordings
  for each row execute function public.lecture_recordings_assert_parent_owner();

-- lecture_segments.lecture_id → lecture_recordings.user_id
create or replace function public.lecture_segments_assert_parent_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

drop trigger if exists lecture_segments_assert_parent_owner_trigger on public.lecture_segments;
create trigger lecture_segments_assert_parent_owner_trigger
  before insert or update of lecture_id, user_id on public.lecture_segments
  for each row execute function public.lecture_segments_assert_parent_owner();

-- ─── Realtime ───────────────────────────────────────────────────
-- The client subscribes filtered by `user_id=eq.<uid>` (lib/realtimeSync.ts),
-- which is not the primary key — without REPLICA IDENTITY FULL the old-row
-- image on DELETE omits user_id and Realtime's server-side filter drops the
-- event. Transcription progress is precisely the thing that must arrive
-- without a poll, so this is load-bearing.
alter table public.lecture_recordings replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.lecture_recordings;
exception when duplicate_object or undefined_object then null;
end $$;

-- ─── Storage: private `lectures` bucket ─────────────────────────
-- Mirrors 012 (syllabi) and 025 (course-notes) exactly. Path convention is
-- `${user_id}/${lecture_id}/seg_${nnn}.m4a`, so foldername(name)[1] is the
-- owner's uid. Lecture audio is the most sensitive thing this app touches —
-- never public, and short-lived by design.
insert into storage.buckets (id, name, public)
values ('lectures', 'lectures', false)
on conflict (id) do update set public = false;

drop policy if exists "Users read own lectures" on storage.objects;
create policy "Users read own lectures"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'lectures'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users insert own lectures" on storage.objects;
create policy "Users insert own lectures"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'lectures'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users update own lectures" on storage.objects;
create policy "Users update own lectures"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'lectures'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'lectures'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete own lectures" on storage.objects;
create policy "Users delete own lectures"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'lectures'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ─── lecture_usage_log — the free-lecture ledger ────────────────
-- SERVICE-ROLE ONLY. See design fact 3 at the top: counting a user-deletable
-- table would let delete-and-retry mint unlimited free lectures. One row per
-- transcription that actually completed. A `failed` row does NOT burn the free
-- lecture — a student whose transcription broke on our side keeps their trial.
create table if not exists public.lecture_usage_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  lecture_id    uuid,
  audio_seconds integer not null default 0,
  status        text not null check (status in ('success', 'failed')),
  error_code    text,
  created_at    timestamptz not null default now()
);

create index if not exists lecture_usage_log_user_created_idx
  on public.lecture_usage_log (user_id, created_at desc);
-- Partial index for the hot query: "has this user ever completed a lecture?"
create index if not exists lecture_usage_log_user_success_idx
  on public.lecture_usage_log (user_id) where status = 'success';

comment on table public.lecture_usage_log is
  'SEMORA: free-lecture quota ledger. Service-role writes only — counting a user-deletable table would let delete-and-retry reset the quota.';

alter table public.lecture_usage_log enable row level security;
revoke all on public.lecture_usage_log from public, anon, authenticated;

-- ─── lecture_quota_day — the global capacity ledger ─────────────
-- The speech-to-text provider's quota is billed per ORGANIZATION, not per end
-- user: every Semora user draws from one shared pool. Without this, six
-- students recording long lectures in one morning can exhaust the day's
-- capacity for everyone else — at zero cost to themselves. Seconds are
-- RESERVED before the user is allowed to start recording and reconciled to the
-- true duration afterwards, because telling a student their lecture cannot be
-- transcribed AFTER they recorded it is the worst possible failure.
create table if not exists public.lecture_quota_day (
  day              date primary key,
  seconds_reserved integer not null default 0,
  updated_at       timestamptz not null default now()
);

comment on table public.lecture_quota_day is
  'SEMORA: global per-day speech-to-text capacity ledger (provider quota is org-wide, not per user). Service-role only.';

alter table public.lecture_quota_day enable row level security;
revoke all on public.lecture_quota_day from public, anon, authenticated;

-- Atomically reserve capacity for today. Returns true when the reservation fit
-- under the cap. `p_cap_seconds` is passed by the Edge Function from an env
-- var so the ceiling can be raised (e.g. after moving to a paid provider tier)
-- without a migration.
create or replace function public.reserve_lecture_seconds(
  p_seconds     integer,
  p_cap_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  today date := (now() at time zone 'utc')::date;
  ok    boolean := false;
begin
  if p_seconds is null or p_seconds <= 0 then
    return true;
  end if;

  -- Ensure today's row exists, then take the reservation in a single
  -- conditional update. The `where` clause is the whole concurrency story:
  -- two simultaneous callers serialize on the row lock and the second sees the
  -- first's total.
  insert into public.lecture_quota_day (day) values (today)
  on conflict (day) do nothing;

  update public.lecture_quota_day
     set seconds_reserved = seconds_reserved + p_seconds,
         updated_at = now()
   where day = today
     and seconds_reserved + p_seconds <= p_cap_seconds
  returning true into ok;

  return coalesce(ok, false);
end;
$$;

-- Give capacity back — on cancel, on failure, and to reconcile a reservation
-- made for the maximum against the recording's true duration. Clamped at zero
-- so a double release can never manufacture capacity.
create or replace function public.release_lecture_seconds(p_seconds integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  today date := (now() at time zone 'utc')::date;
begin
  if p_seconds is null or p_seconds <= 0 then
    return;
  end if;
  update public.lecture_quota_day
     set seconds_reserved = greatest(0, seconds_reserved - p_seconds),
         updated_at = now()
   where day = today;
end;
$$;

revoke all on function public.reserve_lecture_seconds(integer, integer) from public, anon, authenticated;
revoke all on function public.release_lecture_seconds(integer) from public, anon, authenticated;
grant execute on function public.reserve_lecture_seconds(integer, integer) to service_role;
grant execute on function public.release_lecture_seconds(integer) to service_role;

comment on function public.reserve_lecture_seconds(integer, integer) is
  'SEMORA: atomically reserve global speech-to-text capacity for today. Service-role only.';
comment on function public.release_lecture_seconds(integer) is
  'SEMORA: return reserved speech-to-text capacity (cancel, failure, or reconcile to true duration). Service-role only.';

-- ─── course_notes: mark AI-mirrored rows ────────────────────────
-- lecture-study-kit mirrors a lecture's GENERATED NOTES (never the raw
-- transcript) into course_notes so the existing AI tutor and flashcard
-- generator pick up lecture content with no changes to those code paths.
--
-- Two columns make that safe:
--   `source`               — lets the notes-picker UI distinguish a file the
--                            student uploaded from a row Semora generated, so
--                            a lecture cannot be silently deleted from a screen
--                            that only knows how to delete uploads.
--   `source_recording_id`  — the cascade path, plus a partial UNIQUE index that
--                            makes a duplicate mirror physically impossible if
--                            generation is ever retried.
-- storage_path becomes nullable: a mirrored lecture note is generated text with
-- no file behind it, and inventing a path to a non-existent object would be a
-- lie the deletion code would later act on. Safe because the only code that
-- dereferences storage_path is extractNoteText in tutor-chat/generate-flashcards,
-- which runs ONLY when extracted_text is empty — and a mirror row is written
-- with its text already populated.
alter table public.course_notes
  alter column storage_path drop not null;

alter table public.course_notes
  add column if not exists source text not null default 'upload';

alter table public.course_notes
  add column if not exists source_recording_id uuid
    references public.lecture_recordings(id) on delete cascade;

do $$
begin
  alter table public.course_notes
    add constraint course_notes_source_check check (source in ('upload', 'lecture'));
exception when duplicate_object then null;
end $$;

create unique index if not exists course_notes_source_recording_uniq
  on public.course_notes (source_recording_id)
  where source_recording_id is not null;

comment on column public.course_notes.source is
  'SEMORA: upload = a file the student uploaded; lecture = notes generated from a lecture_recording (see source_recording_id).';
