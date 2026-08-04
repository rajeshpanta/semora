-- ============================================================
-- SEMORA FLASHCARDS DUE PUSH — per-user send throttle
-- ============================================================
-- Migration 048 added the opt-out; this adds the "don't nag" half.
--
-- THE BUG THIS FIXES: the job's only audience guard was `having count(*) >= 5`.
-- Due cards stay due until they are reviewed, so a user who builds a deck and
-- then ignores it stays in that audience permanently — and would have received
-- an identical push every single day, forever. That is the fastest way to earn
-- a notifications-off (or an uninstall) from exactly the user we were trying
-- to re-engage.
--
-- The throttle lives on profiles rather than in the cron job's SQL because it
-- has to be durable state: pg_cron gives the job no memory between runs.
-- ============================================================

alter table public.profiles
  add column if not exists flashcards_due_push_last_sent_at timestamptz;

comment on column public.profiles.flashcards_due_push_last_sent_at is
  'SEMORA: when the daily "cards are due" push last went to this user. The cron '
  'job (supabase/cron/flashcards_due_push.sql) both reads this to throttle to one '
  'send per 3 days and writes it after dispatching. Null = never sent.';

-- Cheap partial index: the cron job filters on this column across the whole
-- profiles table once a day, and null (never-sent) is the common case.
create index if not exists profiles_flashcards_push_sent_idx
  on public.profiles (flashcards_due_push_last_sent_at)
  where flashcards_due_push_enabled;
