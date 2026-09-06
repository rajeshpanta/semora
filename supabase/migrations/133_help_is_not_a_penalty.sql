-- ============================================================
-- HOW MUCH HELP WAS TAKEN — recorded, never charged for
-- ============================================================
-- APPLIED IN PRODUCTION 2026-09-06. The feature it was written for was then
-- abandoned; this file is committed so the repository matches the database.
--
-- WHAT HAPPENED. Phase A tried to give a student help BEFORE they answered a
-- practice question. Three architectures were built and measured against blind
-- judges on real generated questions:
--
--   direct prose hints          18.0% of shipped hints gave the answer away
--   structured scaffold         30.9%
--   answer-blind help           83.8%
--
-- The conclusion was not that the prompts needed more work. Useful help on a
-- multiple-choice question narrows the space of correct answers, and the answer
-- is one of the options on screen — so help that teaches, settles. The third
-- attempt withheld the options from the model entirely and leaked MORE, because
-- a correct explanation of the concept simply is the answer. Phase A is closed
-- as a product no-go.
--
-- WHY THIS MIGRATION STAYS. It is additive, every default reproduces the exact
-- pre-existing behaviour, and no production code writes a non-default value, so
-- it is inert. Reverting it would mean inventing a rollback migration to erase
-- harmless schema, which costs risk and buys nothing.
--
-- WHAT IT IS. The mastery model could not tell an unaided correct answer from
-- one reached after substantial help — `course_topic_mastery` held two integers
-- and the recorder took a single boolean. That distinction is real regardless of
-- how help is delivered, so the model here may be reused if assisted learning is
-- ever recorded again:
--
--   HONEST  an assisted correct answer is weaker evidence of independent mastery
--   KIND    a student is never worse off for asking; nothing is ever subtracted
--
-- `correct` still counts every correct answer. `assisted_correct` sits ALONGSIDE
-- it as a second count, so a caller wanting confidence computes it and picks its
-- own weight, and every existing consumer reads exactly what it read before.
--
-- KNOWN DEAD COLUMN: `tutor_practice_questions.hints` has no reader and no
-- writer now — it existed only to store generated hints. It is nullable and
-- inert. Left in place deliberately rather than dropped by a new migration.
--
-- SEMORA-owned (verify against supabase/SUPABASE_OWNERSHIP.md). Additive.
-- ============================================================

-- ─── the two written hints, stored with the question ────────────
-- Written during the SAME generation call that already produces choices and
-- distractor_notes, so a question costs one model call exactly as before.
-- Nullable on purpose: hints that could give the answer away are dropped by
-- practiceHints.ts, and a question without them is a normal outcome. Anything
-- rendering hints must treat their absence as ordinary, never as an error.
alter table public.tutor_practice_questions
  add column if not exists hints jsonb;

comment on column public.tutor_practice_questions.hints is
  'SEMORA: two pre-answer hints, escalating. Null when none survived the leak check. Never contains the answer.';

-- ─── how much help had been taken at answer time ────────────────
-- 0 unaided · 1 nudge · 2 distinction · 3 guided walkthrough · 4 revealed.
-- Numeric and ordered so "how independent was this?" is a comparison and a
-- future rung can be inserted without renumbering history.
alter table public.tutor_practice_attempts
  add column if not exists help_level smallint not null default 0;

alter table public.tutor_practice_attempts
  drop constraint if exists tutor_practice_attempts_help_level_range;
alter table public.tutor_practice_attempts
  add constraint tutor_practice_attempts_help_level_range
  check (help_level between 0 and 4);

-- Note for anyone reading a reveal row later: `answer` and `feedback` carry
-- NOT-BLANK checks from migration 057, so a reveal stores the marker
-- '(revealed)' and the explanation that was shown rather than empty strings.
-- help_level is the field that identifies the event.
comment on column public.tutor_practice_attempts.help_level is
  'SEMORA: help taken before answering. 0 unaided … 3 guided, 4 = revealed (not an attempt; excluded from accuracy).';

-- ─── correct answers that had help ──────────────────────────────
alter table public.course_topic_mastery
  add column if not exists assisted_correct integer not null default 0;

alter table public.course_topic_mastery
  drop constraint if exists course_topic_mastery_assisted_sane;
alter table public.course_topic_mastery
  add constraint course_topic_mastery_assisted_sane
  check (assisted_correct >= 0 and assisted_correct <= correct);

comment on column public.course_topic_mastery.assisted_correct is
  'SEMORA: subset of `correct` reached with help. Never subtracted from `correct` — consumers weight it themselves.';

-- ─── the recorder learns about help ─────────────────────────────
-- The old 7-argument function is DROPPED rather than left beside a new
-- 8-argument one with a default. Two overloads where one has a default makes
-- every 7-argument call ambiguous, which would fail at runtime rather than
-- here. Body is otherwise the migration 057 logic unchanged.
drop function if exists public.record_tutor_practice_attempt(uuid, uuid, uuid, text, boolean, text, text[]);

create or replace function public.record_tutor_practice_attempt(
  p_user_id uuid,
  p_course_id uuid,
  p_question_id uuid,
  p_answer text,
  p_is_correct boolean,
  p_feedback text,
  p_topics text[],
  p_help_level int default 0
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  topic_name text;
  help int := least(greatest(coalesce(p_help_level, 0), 0), 4);
begin
  if not exists (
    select 1 from public.tutor_practice_questions
    where id = p_question_id and user_id = p_user_id and course_id = p_course_id
  ) then
    raise exception 'Practice question not found';
  end if;

  insert into public.tutor_practice_attempts (
    user_id, course_id, question_id, answer, is_correct, feedback, topics, help_level
  ) values (
    p_user_id, p_course_id, p_question_id, btrim(p_answer), p_is_correct, btrim(p_feedback), p_topics, help
  );

  -- A revealed answer is not an attempt. Record that it happened, then stop:
  -- writing either a win or a loss here would be inventing evidence.
  if help >= 4 then
    return;
  end if;

  foreach topic_name in array p_topics loop
    if length(btrim(topic_name)) between 1 and 160 then
      insert into public.course_topic_mastery (
        user_id, course_id, topic, attempts, correct, assisted_correct, last_practiced_at
      ) values (
        p_user_id, p_course_id, btrim(topic_name), 1,
        case when p_is_correct then 1 else 0 end,
        case when p_is_correct and help > 0 then 1 else 0 end,
        now()
      )
      on conflict (user_id, course_id, topic) do update
      set attempts = course_topic_mastery.attempts + 1,
          correct = course_topic_mastery.correct + case when p_is_correct then 1 else 0 end,
          assisted_correct = course_topic_mastery.assisted_correct
            + case when p_is_correct and help > 0 then 1 else 0 end,
          last_practiced_at = now();
    end if;
  end loop;
end;
$$;

revoke all on function public.record_tutor_practice_attempt(uuid, uuid, uuid, text, boolean, text, text[], int)
  from public, anon, authenticated;
grant execute on function public.record_tutor_practice_attempt(uuid, uuid, uuid, text, boolean, text, text[], int)
  to service_role;
