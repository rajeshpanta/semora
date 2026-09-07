-- ============================================================
-- AN ACTIVITY THAT CAN REPORT BACK
-- ============================================================
-- Semora has several study surfaces and no way for any of them to tell the
-- tutor what happened. A lecture quiz is 13-15 objectively graded questions
-- and app/lecture/quiz.tsx holds the whole thing in useState: the student
-- answers, sees a percentage, and the moment the modal closes it is gone.
-- Nothing downstream can react to it, which is the single reason cross-
-- activity orchestration does not exist.
--
-- This is the smallest thing that changes that: one durable outcome per
-- attempt, and a way to produce it that the student cannot forge.
--
-- WHY THE SERVER GRADES. The quiz jsonb ships to the device — it has to, the
-- screen renders the choices — so answerIndex is already in the client's
-- hands and a client-reported score is a claim about a key the client holds.
-- Tutor practice was deliberately built the other way (057: no client SELECT
-- policy on the question table, evaluation server-side), and an outcome that
-- may later inform what a student is told they know has to meet the same bar.
-- So the client sends WHICH CHOICES were picked and this function decides.
--
-- WHAT IS NOT HERE. No write to course_topic_mastery. A lecture quiz is not
-- yet an evidence class — that is a separate product decision, and pouring
-- one activity into the mastery model before its reliability is established
-- is how a measurement becomes a claim about a person by accident. For now
-- the outcome exists as an outcome, usable inside the session that produced
-- it. D'0's four verdicts are untouched.
--
-- SEMORA-owned (verify against supabase/SUPABASE_OWNERSHIP.md). Additive.
-- ============================================================

-- ─── one completed attempt at one lecture's quiz ─────────────────
create table if not exists public.lecture_quiz_attempts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  lecture_id        uuid not null references public.lecture_recordings(id) on delete cascade,
  -- Denormalised so a result can be read per course without joining a lecture
  -- that may since have been deleted. Set by the function, never the client.
  course_id         uuid references public.courses(id) on delete set null,

  correct_count     smallint not null,
  question_count    smallint not null,
  -- What they actually picked, in order; -1 for a question left unanswered.
  -- Kept because it is what makes the row auditable and a retake comparable,
  -- and it is small — 15 smallints, not a copy of the quiz.
  answers           smallint[] not null default '{}',

  -- THE ACADEMIC CONTEXT the conductor launched from, so the result can be
  -- read back into the right guided session. Both nullable: a student who
  -- opens the quiz straight from the lecture screen has neither, and that is
  -- an ordinary attempt rather than a broken one.
  source_task_id    uuid references public.tasks(id) on delete set null,
  source_topic      text,

  created_at        timestamptz not null default now(),

  constraint lecture_quiz_attempts_counts_sane
    check (question_count > 0 and correct_count >= 0 and correct_count <= question_count),
  constraint lecture_quiz_attempts_topic_len
    check (source_topic is null or length(btrim(source_topic)) between 1 and 160)
);

comment on table public.lecture_quiz_attempts is
  'SEMORA: one server-graded lecture-quiz attempt. Written only by record_lecture_quiz_attempt. Not an evidence class yet — does NOT feed course_topic_mastery.';
comment on column public.lecture_quiz_attempts.answers is
  'SEMORA: chosen choice index per question, in order; -1 = unanswered.';
comment on column public.lecture_quiz_attempts.source_task_id is
  'SEMORA: the assessment the guided session was about, when launched from one. Null for a direct attempt.';

create index if not exists lecture_quiz_attempts_user_lecture_idx
  on public.lecture_quiz_attempts (user_id, lecture_id, created_at desc);

-- ─── the student sees their own attempts, and nobody else's ──────
alter table public.lecture_quiz_attempts enable row level security;

drop policy if exists own_lecture_quiz_attempts_select on public.lecture_quiz_attempts;
create policy own_lecture_quiz_attempts_select
  on public.lecture_quiz_attempts for select
  using (auth.uid() = user_id);

-- No insert/update/delete policy on purpose. RLS with no write policy denies
-- every client write, so the ONLY way a row appears is the SECURITY DEFINER
-- function below — which grades rather than believing.

-- ─── grade it here, where the answer key already lives ───────────
create or replace function public.record_lecture_quiz_attempt(
  p_lecture_id uuid,
  p_answers int[],
  p_source_task_id uuid default null,
  p_source_topic text default null
)
returns table (correct_count int, question_count int, attempt_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quiz     jsonb;
  v_course   uuid;
  v_total    int;
  v_correct  int := 0;
  v_answers  smallint[] := '{}';
  v_topic    text;
  v_task     uuid;
  i          int;
  v_picked   int;
begin
  -- Ownership first: the lecture must be this caller's. A quiz id belonging to
  -- someone else must not produce a row at all, not even an empty one.
  select lr.quiz, lr.course_id
    into v_quiz, v_course
    from public.lecture_recordings lr
   where lr.id = p_lecture_id
     and lr.user_id = auth.uid();

  if v_quiz is null or jsonb_typeof(v_quiz) <> 'array' then
    raise exception 'Lecture quiz not found';
  end if;

  v_total := jsonb_array_length(v_quiz);
  if v_total = 0 then
    raise exception 'Lecture quiz not found';
  end if;

  -- Grade against the stored key. The client sent choices, not a score.
  for i in 0 .. v_total - 1 loop
    v_picked := coalesce(p_answers[i + 1], -1);
    v_answers := v_answers || v_picked::smallint;
    if v_picked >= 0
       and v_picked = (v_quiz -> i ->> 'answerIndex')::int then
      v_correct := v_correct + 1;
    end if;
  end loop;

  -- Context is accepted only when it is genuinely this student's, so a
  -- fabricated task id cannot attach an outcome to someone else's work.
  select t.id into v_task
    from public.tasks t
   where t.id = p_source_task_id and t.user_id = auth.uid();

  v_topic := nullif(btrim(coalesce(p_source_topic, '')), '');
  if v_topic is not null and length(v_topic) > 160 then
    v_topic := left(v_topic, 160);
  end if;

  return query
  insert into public.lecture_quiz_attempts (
    user_id, lecture_id, course_id, correct_count, question_count,
    answers, source_task_id, source_topic
  ) values (
    auth.uid(), p_lecture_id, v_course, v_correct, v_total,
    v_answers, v_task, v_topic
  )
  returning v_correct, v_total, lecture_quiz_attempts.id;
end;
$$;

revoke all on function public.record_lecture_quiz_attempt(uuid, int[], uuid, text)
  from public, anon;
grant execute on function public.record_lecture_quiz_attempt(uuid, int[], uuid, text)
  to authenticated, service_role;
