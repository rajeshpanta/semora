-- Adaptive Smart Plan: retain the reason behind a scheduled session and keep a
-- concise, student-visible trail of the signals that changed a plan.

alter table public.study_blocks
  add column if not exists coach_reason text;

alter table public.study_blocks
  add constraint study_blocks_coach_reason_valid
  check (coach_reason is null or coach_reason in ('exam', 'grade_risk'));

comment on column public.study_blocks.coach_reason is
  'Optional adaptive-coach signal that raised this session above otherwise equal work.';

create table if not exists public.study_plan_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  semester_id uuid not null references public.semesters(id) on delete cascade,
  kind text not null check (kind in ('habit', 'missed', 'calendar', 'exam', 'grade_risk', 'capacity')),
  change_key text not null check (length(btrim(change_key)) between 1 and 120),
  title text not null check (length(btrim(title)) between 1 and 140),
  detail text not null check (length(btrim(detail)) between 1 and 500),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists study_plan_changes_user_semester_created_idx
  on public.study_plan_changes (user_id, semester_id, created_at desc);

alter table public.study_plan_changes enable row level security;

create policy "Users can view own study-plan changes"
  on public.study_plan_changes for select to authenticated
  using (auth.uid() = user_id);

-- The client cannot write a fabricated activity trail directly. This RPC
-- verifies semester ownership and de-duplicates the same explanation for 12h,
-- which lets automatic rebuilds remain useful without becoming noisy.
create or replace function public.record_study_plan_changes(
  p_semester_id uuid,
  p_changes jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  item_kind text;
  item_key text;
  item_title text;
  item_detail text;
  item_metadata jsonb;
begin
  if not exists (
    select 1 from public.semesters
    where id = p_semester_id and user_id = auth.uid()
  ) then
    raise exception 'Semester not found';
  end if;

  if p_changes is null or jsonb_typeof(p_changes) <> 'array'
    or jsonb_array_length(p_changes) > 4 then
    raise exception 'Invalid study-plan changes';
  end if;

  for item in select value from jsonb_array_elements(p_changes)
  loop
    item_kind := btrim(coalesce(item ->> 'kind', ''));
    item_key := btrim(coalesce(item ->> 'key', ''));
    item_title := btrim(coalesce(item ->> 'title', ''));
    item_detail := btrim(coalesce(item ->> 'detail', ''));
    item_metadata := coalesce(item -> 'metadata', '{}'::jsonb);

    if item_kind not in ('habit', 'missed', 'calendar', 'exam', 'grade_risk', 'capacity')
      or length(item_key) not between 1 and 120
      or length(item_title) not between 1 and 140
      or length(item_detail) not between 1 and 500
      or jsonb_typeof(item_metadata) <> 'object' then
      raise exception 'Invalid study-plan change';
    end if;

    if not exists (
      select 1
      from public.study_plan_changes
      where user_id = auth.uid()
        and semester_id = p_semester_id
        and change_key = item_key
        and created_at > now() - interval '12 hours'
    ) then
      insert into public.study_plan_changes (
        user_id, semester_id, kind, change_key, title, detail, metadata
      ) values (
        auth.uid(), p_semester_id, item_kind, item_key, item_title, item_detail, item_metadata
      );
    end if;
  end loop;
end;
$$;

revoke all on function public.record_study_plan_changes(uuid, jsonb) from public, anon;
grant execute on function public.record_study_plan_changes(uuid, jsonb) to authenticated;

-- Preserve the Pro/free horizon backstop from migration 049 while allowing
-- each new block to retain the coach signal that made it a priority.
create or replace function public.replace_study_plan(
  p_semester_id uuid,
  p_blocks jsonb
)
returns setof public.study_blocks
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  item_task_id uuid;
  item_date date;
  item_time time;
  item_duration integer;
  item_coach_reason text;
  max_horizon_days integer;
  max_scheduled_date date;
begin
  if not exists (
    select 1 from public.semesters
    where id = p_semester_id and user_id = auth.uid()
  ) then
    raise exception 'Semester not found';
  end if;

  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then
    raise exception 'Study blocks must be a JSON array';
  end if;

  max_horizon_days := case when public.is_pro(auth.uid()) then 14 else 7 end;
  select max((value ->> 'scheduled_date')::date)
    into max_scheduled_date
    from jsonb_array_elements(p_blocks);

  if max_scheduled_date is not null
     and max_scheduled_date > current_date + max_horizon_days then
    raise exception
      'Study plan exceeds the % day horizon for this account', max_horizon_days
      using errcode = 'check_violation';
  end if;

  delete from public.study_blocks as block
  using public.tasks as task, public.courses as course
  where block.task_id = task.id
    and task.course_id = course.id
    and block.user_id = auth.uid()
    and course.semester_id = p_semester_id
    and not block.is_completed;

  for item in select value from jsonb_array_elements(p_blocks)
  loop
    item_task_id := (item ->> 'task_id')::uuid;
    item_date := (item ->> 'scheduled_date')::date;
    item_time := (item ->> 'start_time')::time;
    item_duration := (item ->> 'duration_minutes')::integer;
    item_coach_reason := nullif(item ->> 'coach_reason', '');

    if item_duration < 15 or item_duration > 180 then
      raise exception 'Invalid study-block duration';
    end if;
    if item_coach_reason is not null and item_coach_reason not in ('exam', 'grade_risk') then
      raise exception 'Invalid study-block coach reason';
    end if;

    if not exists (
      select 1
      from public.tasks as task
      join public.courses as course on course.id = task.course_id
      where task.id = item_task_id
        and task.user_id = auth.uid()
        and course.semester_id = p_semester_id
        and not task.is_completed
    ) then
      raise exception 'Invalid task in study plan';
    end if;

    insert into public.study_blocks (
      user_id, task_id, scheduled_date, start_time, duration_minutes, coach_reason
    ) values (
      auth.uid(), item_task_id, item_date, item_time, item_duration, item_coach_reason
    );
  end loop;

  return query
  select block.*
  from public.study_blocks as block
  join public.tasks as task on task.id = block.task_id
  join public.courses as course on course.id = task.course_id
  where block.user_id = auth.uid()
    and course.semester_id = p_semester_id
  order by block.scheduled_date, block.start_time;
end;
$$;

revoke all on function public.replace_study_plan(uuid, jsonb) from public;
grant execute on function public.replace_study_plan(uuid, jsonb) to authenticated;
