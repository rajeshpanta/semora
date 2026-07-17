-- ============================================================
-- AI TUTOR (Pro feature)
-- ============================================================
-- Grounded chat tutor: answers are generated from the course's
-- syllabus + the user's uploaded lecture notes + the course's
-- tasks/deadlines. Four objects ship here:
--
--   * tutor_conversations — one chat thread (optionally scoped to a course)
--   * tutor_messages      — the user/assistant turns in a thread
--   * course_notes        — uploaded lecture notes/slides for grounding
--   * tutor_usage         — per-user rate-limit ledger (see below)
--   * course-notes bucket — PRIVATE storage for the uploaded files
--
-- WHY a dedicated tutor_usage ledger (not gemini_call_log): the
-- 'success' rows in gemini_call_log drive the FREE syllabus-scan quota
-- (lib/queries.useScanCount + parse-syllabus step 2b). Logging tutor
-- calls there would silently consume a user's free syllabus scans. The
-- tutor keeps its cost accounting in its own table so the two quotas
-- never cross-contaminate.
--
-- SEMORA-owned (verify against supabase/SUPABASE_OWNERSHIP.md). Additive
-- only. Tenant safety mirrors migration 015/018: each row carries a
-- denormalized user_id, RLS is `auth.uid() = user_id`, and BEFORE
-- INSERT/UPDATE triggers assert every FK resolves to the same owner
-- (reusing parent_row_user_id() from migration 015). Tables are tagged
-- via COMMENT ON TABLE per the ownership convention.
-- ============================================================

-- ─── tutor_conversations ────────────────────────────────────────
-- One chat thread. course_id is NULLABLE — a "general" tutor session
-- (not tied to a specific course) is a valid state. When set, it grounds
-- the conversation on that course's syllabus/notes/deadlines.
create table if not exists public.tutor_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  title text,
  created_at timestamptz not null default now()
);
create index if not exists tutor_conversations_user_id_idx
  on public.tutor_conversations(user_id, created_at desc);
create index if not exists tutor_conversations_course_id_idx
  on public.tutor_conversations(course_id);

comment on table public.tutor_conversations is
  'SEMORA: AI tutor chat threads (Pro). course_id optionally grounds the thread on a course.';

-- ─── tutor_messages ─────────────────────────────────────────────
-- One turn in a conversation. conversation_id cascades so deleting a
-- thread removes its messages. role is free-text + check (not an enum)
-- so adding a 'system' role later needs no ALTER TYPE migration.
create table if not exists public.tutor_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.tutor_conversations(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now(),
  constraint tutor_messages_role_allowed
    check (role in ('user', 'assistant'))
);
create index if not exists tutor_messages_conversation_id_idx
  on public.tutor_messages(conversation_id, created_at);

comment on table public.tutor_messages is
  'SEMORA: AI tutor chat messages (Pro). One row per user/assistant turn.';

-- ─── course_notes ───────────────────────────────────────────────
-- Uploaded lecture notes / slides for a course, used to ground the
-- tutor. The file lives in the private course-notes bucket; storage_path
-- is the cheap pointer. extracted_text is populated lazily by the
-- tutor-chat edge function the first time it reads the file (Gemini OCRs
-- the doc, then the text is cached here so later turns skip the re-read).
create table if not exists public.course_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  storage_path text not null,
  filename text not null,
  mime_type text,
  extracted_text text,
  created_at timestamptz not null default now()
);
create index if not exists course_notes_course_id_idx
  on public.course_notes(course_id, created_at desc);

comment on table public.course_notes is
  'SEMORA: uploaded lecture notes/slides grounding the AI tutor (Pro). File in course-notes bucket.';

-- ─── tutor_usage ────────────────────────────────────────────────
-- Per-user rate-limit ledger. One row per SUCCESSFUL tutor chat call.
-- The edge function counts rows in a rolling 24h window to enforce a
-- per-user daily cap (even for Pro, to bound Gemini cost). Deliberately
-- SEPARATE from gemini_call_log so tutor spend never touches the free
-- syllabus-scan quota. Client-visible SELECT so a future "N tutor
-- messages left today" pill can read it under RLS; INSERTs happen
-- service-side from the edge function.
create table if not exists public.tutor_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists tutor_usage_user_id_created_idx
  on public.tutor_usage(user_id, created_at desc);

comment on table public.tutor_usage is
  'SEMORA: per-user AI tutor rate-limit ledger (one row per successful call). NOT the scan quota.';

-- ─── RLS ────────────────────────────────────────────────────────
-- Authenticated users manage ONLY their own rows; no anon access. The
-- service_role client (tutor-chat edge function) bypasses RLS.
alter table public.tutor_conversations enable row level security;
alter table public.tutor_messages enable row level security;
alter table public.course_notes enable row level security;
alter table public.tutor_usage enable row level security;

create policy "own_tutor_conversations" on public.tutor_conversations
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_tutor_messages" on public.tutor_messages
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_course_notes" on public.course_notes
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- tutor_usage: read own rows only. INSERTs are service-role (the edge
-- function logs each successful call); no client INSERT policy on
-- purpose, so a client can't fabricate usage rows to game the cap.
create policy "read_own_tutor_usage" on public.tutor_usage
  for select to authenticated
  using (auth.uid() = user_id);

-- ─── atomic rate-limit reservation ──────────────────────────────
-- Count-then-insert from the edge function is NOT atomic: N concurrent
-- requests all read count < cap and all proceed, blowing the daily cap in
-- a burst. This function serializes per-user via a transaction-scoped
-- advisory lock so the count and the insert are one atomic step, and
-- reserves the slot BEFORE the (paid) Gemini call so a burst can't exceed
-- the cap. Returns true if a slot was consumed, false if the user is at
-- the cap. SECURITY DEFINER + service_role-only so clients can't call it
-- to fabricate usage.
create or replace function public.try_consume_tutor_usage(uid uuid, cap int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  used int;
begin
  perform pg_advisory_xact_lock(hashtext('tutor_usage:' || uid::text));
  select count(*) into used
    from tutor_usage
    where user_id = uid and created_at >= now() - interval '24 hours';
  if used >= cap then
    return false;
  end if;
  insert into tutor_usage (user_id) values (uid);
  return true;
end;
$$;

revoke all on function public.try_consume_tutor_usage(uuid, int) from public, anon, authenticated;
grant execute on function public.try_consume_tutor_usage(uuid, int) to service_role;

-- ─── Cross-tenant FK protection ─────────────────────────────────
-- Reuses parent_row_user_id() from migration 015. Asserts each FK
-- resolves to a parent owned by the same user as the row being written,
-- mirroring the tasks/course_meetings triggers.

-- tutor_conversations.course_id → courses.user_id (nullable FK, skipped
-- when null — a general conversation has no course).
create or replace function public.tutor_conversations_assert_parent_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  parent_user uuid;
begin
  if new.course_id is not null then
    parent_user := public.parent_row_user_id('public.courses'::regclass, new.course_id);
    if parent_user is null then
      raise exception 'Referenced course does not exist'
        using errcode = '23503';
    end if;
    if parent_user <> new.user_id then
      raise exception 'Cross-tenant write blocked: conversation cannot reference a course owned by another user'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tutor_conversations_assert_parent_owner_trigger on public.tutor_conversations;
create trigger tutor_conversations_assert_parent_owner_trigger
  before insert or update of course_id, user_id on public.tutor_conversations
  for each row execute function public.tutor_conversations_assert_parent_owner();

-- tutor_messages.conversation_id → tutor_conversations.user_id
create or replace function public.tutor_messages_assert_parent_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  parent_user uuid;
begin
  parent_user := public.parent_row_user_id('public.tutor_conversations'::regclass, new.conversation_id);
  if parent_user is null then
    raise exception 'Referenced conversation does not exist'
      using errcode = '23503';
  end if;
  if parent_user <> new.user_id then
    raise exception 'Cross-tenant write blocked: message cannot reference a conversation owned by another user'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists tutor_messages_assert_parent_owner_trigger on public.tutor_messages;
create trigger tutor_messages_assert_parent_owner_trigger
  before insert or update of conversation_id, user_id on public.tutor_messages
  for each row execute function public.tutor_messages_assert_parent_owner();

-- course_notes.course_id → courses.user_id
create or replace function public.course_notes_assert_parent_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  parent_user uuid;
begin
  parent_user := public.parent_row_user_id('public.courses'::regclass, new.course_id);
  if parent_user is null then
    raise exception 'Referenced course does not exist'
      using errcode = '23503';
  end if;
  if parent_user <> new.user_id then
    raise exception 'Cross-tenant write blocked: course note cannot reference a course owned by another user'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists course_notes_assert_parent_owner_trigger on public.course_notes;
create trigger course_notes_assert_parent_owner_trigger
  before insert or update of course_id, user_id on public.course_notes
  for each row execute function public.course_notes_assert_parent_owner();

-- ─── Storage: private course-notes bucket ───────────────────────
-- Mirrors migration 012's syllabi pattern exactly. Private bucket +
-- owner-scoped storage.objects policies. Path convention is
-- `${user_id}/${timestamp}_${filename}` so foldername(name)[1] is the
-- owner's uid. Lecture notes can contain the student's own work and
-- course PII — never public.
insert into storage.buckets (id, name, public)
values ('course-notes', 'course-notes', false)
on conflict (id) do update set public = false;

drop policy if exists "Users read own course notes" on storage.objects;
create policy "Users read own course notes"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'course-notes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users insert own course notes" on storage.objects;
create policy "Users insert own course notes"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'course-notes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users update own course notes" on storage.objects;
create policy "Users update own course notes"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'course-notes'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'course-notes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete own course notes" on storage.objects;
create policy "Users delete own course notes"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'course-notes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
