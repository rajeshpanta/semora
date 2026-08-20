-- ============================================================
-- AI TUTOR: real threads, and a way to say an answer was wrong
-- ============================================================
-- Two additive changes, both to tables migration 025 already created.
--
-- 1. tutor_conversations.updated_at
--    The client reused ONE conversation per course, for ever: it read the most
--    recent thread and created one only when none existed. There was no way to
--    start a fresh chat, so a question about the midterm in September sat above
--    a question about the final in December, and the 12-turn history window
--    silently dropped everything between them. Threads are now created, listed,
--    renamed and deleted from the app, which needs an activity timestamp to
--    order them by — created_at sorts a thread you used this morning below one
--    you opened last month and abandoned.
--
-- 2. tutor_messages.rating
--    There is currently no way to know whether the tutor is any good. Not one
--    signal exists: not a rating, not a report, nothing. One tap per answer is
--    the cheapest possible way to find out, and the only way to tell a prompt
--    change that helped from one that did not.
--
-- SEMORA-owned (see supabase/SUPABASE_OWNERSHIP.md). Additive only: every
-- column is nullable or defaulted, so a client running the previous build keeps
-- working unchanged against this schema.
-- ============================================================

-- ─── 1. Thread activity ─────────────────────────────────────────
alter table public.tutor_conversations
  add column if not exists updated_at timestamptz not null default now();

comment on column public.tutor_conversations.updated_at is
  'SEMORA: last time a turn was added. Touched by tutor-chat; orders the thread list.';

-- Backfill from the newest message in each thread so existing conversations do
-- not all collapse to "just now" and sort meaninglessly on first release.
update public.tutor_conversations c
   set updated_at = coalesce(
     (select max(m.created_at) from public.tutor_messages m where m.conversation_id = c.id),
     c.created_at
   );

-- The thread list reads (user_id, course_id) ordered by activity. Both course
-- shapes are indexed by the same entry because course_id is nullable and a
-- general thread (course_id is null) is a first-class case, not an edge one.
create index if not exists tutor_conversations_activity_idx
  on public.tutor_conversations (user_id, course_id, updated_at desc);

-- ─── 2. Answer ratings ──────────────────────────────────────────
-- On the message, not in a side table: it is one value per assistant turn, it
-- is read in the same query that renders the turn, and it cascades with the
-- thread on delete without another foreign key to maintain.
alter table public.tutor_messages
  add column if not exists rating smallint;

alter table public.tutor_messages
  drop constraint if exists tutor_messages_rating_allowed;

alter table public.tutor_messages
  add constraint tutor_messages_rating_allowed
  check (rating is null or rating in (-1, 1));

alter table public.tutor_messages
  add column if not exists rated_at timestamptz;

comment on column public.tutor_messages.rating is
  'SEMORA: -1 unhelpful, 1 helpful, null unrated. Set by the student on assistant turns.';

-- Partial index: the analytics question is always "which answers were rated",
-- never "which were not", and the unrated rows are almost all of them.
create index if not exists tutor_messages_rated_idx
  on public.tutor_messages (user_id, rating, rated_at desc)
  where rating is not null;

-- ─── 3. "Has this note been read yet?" ──────────────────────────
-- The client cannot ask that question today. course_notes.extracted_text is
-- the answer, but it is up to 8,000 characters per row and no client wants to
-- download a semester of lecture text to learn a boolean — so the app asked the
-- server instead, one round trip per note, sequentially, before every first
-- message of a session. A student with ten notes attached watched "Reading your
-- documents… 1 of 10" before a question that needed none of it.
--
-- A stored generated column answers it for free and can never drift, because
-- it is not a copy of the state — it IS the state, evaluated by Postgres on
-- every write. No trigger to maintain, and every writer (tutor-chat,
-- generate-flashcards, the lecture note mirror) gets it right without knowing
-- it exists.
alter table public.course_notes
  add column if not exists extracted boolean
  generated always as (extracted_text is not null) stored;

comment on column public.course_notes.extracted is
  'SEMORA: whether extracted_text is cached. Generated — lets the client skip a prepare round trip.';

-- No new policies. own_tutor_messages (025) is `for all` on auth.uid() =
-- user_id, so a student can already update their own row and nobody else's;
-- the edge function writes the row under the service role as before.
