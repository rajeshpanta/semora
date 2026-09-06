-- Per-distractor teaching notes on a practice question.
--
-- Evaluation could only ever say "the best answer is X": the explanation was
-- written with the question, before anyone had answered it, so it addressed no
-- particular mistake. Which wrong choice a student picked is the most specific
-- thing the practice loop learns about them, and it was being thrown away.
--
-- Practice is closed-set multiple choice, so every wrong answer a student CAN
-- give is known when the question is written. The notes are therefore generated
-- there, on a model call that was happening anyway, instead of by a second call
-- at evaluation time — the student is waiting during evaluation, and a call
-- there would add latency, cost, a timeout path and a quota charge to the one
-- moment that must not stall.
--
-- Shape: a JSON object keyed by the NORMALISED text of an incorrect choice
-- (lower-cased, "A) " prefix stripped, whitespace collapsed — the same
-- normalisation the grader uses), mapping to one or two sentences of teaching.
-- Never keyed by the correct answer.
--
-- Nullable in effect via the '{}' default: every row written before this
-- migration simply has no notes and evaluation falls back to exactly the
-- behaviour that shipped before. Nothing needs backfilling.
alter table public.tutor_practice_questions
  add column if not exists distractor_notes jsonb not null default '{}'::jsonb;

alter table public.tutor_practice_questions
  drop constraint if exists tutor_practice_questions_distractor_notes_object;

alter table public.tutor_practice_questions
  add constraint tutor_practice_questions_distractor_notes_object
  check (jsonb_typeof(distractor_notes) = 'object');

comment on column public.tutor_practice_questions.distractor_notes is
  'Normalised incorrect-choice text -> why a student who picked it was probably thinking that. Server-only: this column is never selected into a client response before the question has been answered, because it discloses which choices are wrong.';
