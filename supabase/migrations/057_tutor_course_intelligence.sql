-- AI Tutor course intelligence: source citations, server-owned practice
-- questions, private attempt history, and per-course topic mastery.

alter table public.tutor_messages
  add column if not exists citations jsonb not null default '[]'::jsonb;

alter table public.tutor_messages
  add constraint tutor_messages_citations_are_array
  check (jsonb_typeof(citations) = 'array');

comment on column public.tutor_messages.citations is
  'Grounding sources attached by tutor-chat. Source labels are server-produced, never client supplied.';

create table public.tutor_practice_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  mode text not null check (mode in ('practice', 'quiz')),
  prompt text not null check (length(btrim(prompt)) between 1 and 4000),
  choices jsonb not null default '[]'::jsonb check (jsonb_typeof(choices) = 'array'),
  expected_answer text not null check (length(btrim(expected_answer)) between 1 and 2000),
  explanation text not null check (length(btrim(explanation)) between 1 and 4000),
  topics text[] not null default '{}'::text[] check (cardinality(topics) between 1 and 5),
  citations jsonb not null default '[]'::jsonb check (jsonb_typeof(citations) = 'array'),
  created_at timestamptz not null default now()
);

create index tutor_practice_questions_user_course_idx
  on public.tutor_practice_questions (user_id, course_id, created_at desc);

create table public.tutor_practice_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  question_id uuid not null references public.tutor_practice_questions(id) on delete cascade,
  answer text not null check (length(btrim(answer)) between 1 and 4000),
  is_correct boolean not null,
  feedback text not null check (length(btrim(feedback)) between 1 and 4000),
  topics text[] not null default '{}'::text[],
  created_at timestamptz not null default now()
);

create index tutor_practice_attempts_user_course_idx
  on public.tutor_practice_attempts (user_id, course_id, created_at desc);

create table public.course_topic_mastery (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  topic text not null check (length(btrim(topic)) between 1 and 160),
  attempts integer not null default 0 check (attempts >= 0),
  correct integer not null default 0 check (correct >= 0 and correct <= attempts),
  last_practiced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, course_id, topic)
);

create index course_topic_mastery_user_course_idx
  on public.course_topic_mastery (user_id, course_id, correct, attempts, updated_at desc);

alter table public.tutor_practice_questions enable row level security;
alter table public.tutor_practice_attempts enable row level security;
alter table public.course_topic_mastery enable row level security;

-- Questions deliberately have no client SELECT policy: exposing expected_answer
-- would make quiz answers inspectable. The edge function owns question reads.
create policy "Users can view own tutor practice attempts"
  on public.tutor_practice_attempts for select to authenticated
  using (auth.uid() = user_id);

create policy "Users can view own course topic mastery"
  on public.course_topic_mastery for select to authenticated
  using (auth.uid() = user_id);

create or replace function public.tutor_practice_question_assert_parent_owner()
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
    raise exception 'Referenced course does not exist' using errcode = '23503';
  end if;
  if parent_user <> new.user_id then
    raise exception 'Cross-tenant write blocked: tutor practice question cannot reference another user''s course'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger tutor_practice_question_assert_parent_owner_trigger
  before insert or update of course_id, user_id on public.tutor_practice_questions
  for each row execute function public.tutor_practice_question_assert_parent_owner();

create or replace function public.tutor_practice_attempt_assert_parent_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  question_user uuid;
  question_course uuid;
begin
  select user_id, course_id into question_user, question_course
  from public.tutor_practice_questions where id = new.question_id;
  if question_user is null then
    raise exception 'Referenced practice question does not exist' using errcode = '23503';
  end if;
  if question_user <> new.user_id or question_course <> new.course_id then
    raise exception 'Practice attempt must belong to the same user and course'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger tutor_practice_attempt_assert_parent_owner_trigger
  before insert or update of question_id, course_id, user_id on public.tutor_practice_attempts
  for each row execute function public.tutor_practice_attempt_assert_parent_owner();

create or replace function public.course_topic_mastery_assert_parent_owner()
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
    raise exception 'Referenced course does not exist' using errcode = '23503';
  end if;
  if parent_user <> new.user_id then
    raise exception 'Cross-tenant write blocked: topic mastery cannot reference another user''s course'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger course_topic_mastery_assert_parent_owner_trigger
  before insert or update of course_id, user_id on public.course_topic_mastery
  for each row execute function public.course_topic_mastery_assert_parent_owner();

create or replace function public.course_topic_mastery_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger course_topic_mastery_set_updated_at_trigger
  before update on public.course_topic_mastery
  for each row execute function public.course_topic_mastery_set_updated_at();

-- Service-only: the edge function is the only component that knows a quiz's
-- expected answer. It records the attempt and atomically updates every topic
-- in the same transaction, so a client cannot inflate mastery.
create or replace function public.record_tutor_practice_attempt(
  p_user_id uuid,
  p_course_id uuid,
  p_question_id uuid,
  p_answer text,
  p_is_correct boolean,
  p_feedback text,
  p_topics text[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  topic_name text;
begin
  if not exists (
    select 1 from public.tutor_practice_questions
    where id = p_question_id and user_id = p_user_id and course_id = p_course_id
  ) then
    raise exception 'Practice question not found';
  end if;

  insert into public.tutor_practice_attempts (
    user_id, course_id, question_id, answer, is_correct, feedback, topics
  ) values (
    p_user_id, p_course_id, p_question_id, btrim(p_answer), p_is_correct, btrim(p_feedback), p_topics
  );

  foreach topic_name in array p_topics loop
    if length(btrim(topic_name)) between 1 and 160 then
      insert into public.course_topic_mastery (
        user_id, course_id, topic, attempts, correct, last_practiced_at
      ) values (
        p_user_id, p_course_id, btrim(topic_name), 1, case when p_is_correct then 1 else 0 end, now()
      )
      on conflict (user_id, course_id, topic) do update
      set attempts = course_topic_mastery.attempts + 1,
          correct = course_topic_mastery.correct + case when p_is_correct then 1 else 0 end,
          last_practiced_at = now();
    end if;
  end loop;
end;
$$;

revoke all on function public.tutor_practice_question_assert_parent_owner() from public, anon, authenticated;
revoke all on function public.tutor_practice_attempt_assert_parent_owner() from public, anon, authenticated;
revoke all on function public.course_topic_mastery_assert_parent_owner() from public, anon, authenticated;
revoke all on function public.course_topic_mastery_set_updated_at() from public, anon, authenticated;
revoke all on function public.record_tutor_practice_attempt(uuid, uuid, uuid, text, boolean, text, text[]) from public, anon, authenticated;
grant execute on function public.record_tutor_practice_attempt(uuid, uuid, uuid, text, boolean, text, text[]) to service_role;
