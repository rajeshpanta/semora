-- ============================================================
-- SEMORA FLASHCARDS DUE PUSH — opt-out preference
-- ============================================================
-- The spaced-repetition scheduler already computes `cards.due_at` per card and
-- indexes it (cards_deck_due_idx, migration 024), but nothing ever told the
-- user their cards came due. A review queue nobody is reminded about is a
-- review queue nobody clears — which is the whole mechanism of SM-2.
--
-- The cron job that reads this column lives in supabase/cron/flashcards_due_push.sql.
--
-- Opt-OUT (default true) rather than opt-in, matching how reminders behave:
-- someone who built a deck has already expressed intent to review it. The
-- send-push function has no per-type filtering of its own, so this preference
-- can only be honoured by the cron job's SELECT — see that file.
-- ============================================================

alter table public.profiles
  add column if not exists flashcards_due_push_enabled boolean not null default true;

comment on column public.profiles.flashcards_due_push_enabled is
  'SEMORA: opt-out for the daily "cards are due" push (supabase/cron/flashcards_due_push.sql). '
  'Enforced in the cron job SELECT — send-push does not filter by notification type.';
