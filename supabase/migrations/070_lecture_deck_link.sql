-- ============================================================
-- SEMORA LECTURE → DECK LINK
-- ============================================================
-- Remembers which flashcard deck a lecture produced.
--
-- The Flashcards button on the lecture screen generates a deck from the
-- lecture's notes. With nowhere to record the result, every press created
-- ANOTHER deck: press it three times and the course has three near-identical
-- decks, none of which is the "real" one, and the student's review history is
-- split across all of them.
--
-- Deliberately NOT solved by matching on title. Lecture titles repeat by
-- nature ("Week 4", "Lecture 12"), the student can rename either side, and a
-- near-miss would silently append cards to the wrong deck — a worse failure
-- than the duplicates it set out to fix. A foreign key says exactly which deck
-- this lecture made, and stays true through any rename.
--
-- ON DELETE SET NULL, not CASCADE, in both directions of intent:
--   • Deleting the DECK must not delete the lecture. The deck is derived from
--     the lecture, never the other way around.
--   • A student who deletes the deck and presses Flashcards again should get a
--     fresh one, which a null lands on naturally.
-- ============================================================

alter table public.lecture_recordings
  add column if not exists deck_id uuid references public.decks(id) on delete set null;

comment on column public.lecture_recordings.deck_id is
  'SEMORA (070): the deck generated from this lecture. Set on first generation so '
  'repeat presses re-open that deck instead of creating another. Null once the deck '
  'is deleted, which makes the next press generate a fresh one.';

-- Deliberately no index: this column is only ever read as part of an already
-- fetched lecture row (by primary key), never filtered on. An index here would
-- be write cost for no read.
