-- Smart Study Planner: task effort estimates, synced planner preferences,
-- persisted study blocks, and an atomic plan-replacement RPC.

alter table public.tasks
  add column if not exists estimated_minutes smallint;

alter table public.tasks
  add constraint tasks_estimated_minutes_valid
    check (estimated_minutes is null or estimated_minutes between 15 and 2880);

-- Recurring occurrences inherit effort, and series edits apply an effort
-- override to the selected scope just like priority/start/reminder fields.
create or replace function public.spawn_next_recurring_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_due date;
  next_start date;
  next_task_id uuid;
  next_month_start date;
  next_month_end date;
  anchor_day integer;
begin
  if not (new.is_completed and not old.is_completed and new.recurrence_frequency is not null) then
    return new;
  end if;

  if new.recurrence_frequency = 'monthly' then
    next_month_start := (date_trunc('month', new.due_date) + interval '1 month')::date;
    next_month_end := (date_trunc('month', new.due_date) + interval '2 months' - interval '1 day')::date;
    anchor_day := coalesce(new.recurrence_anchor_day, extract(day from new.due_date)::integer);
    next_due := case
      when coalesce(new.recurrence_anchor_is_month_end, false) then next_month_end
      else make_date(
        extract(year from next_month_start)::integer,
        extract(month from next_month_start)::integer,
        least(anchor_day, extract(day from next_month_end)::integer)
      )
    end;
  else
    next_due := case new.recurrence_frequency
      when 'daily' then new.due_date + 1
      when 'weekly' then new.due_date + 7
      when 'biweekly' then new.due_date + 14
    end;
  end if;

  if new.recurrence_end_date is not null and next_due > new.recurrence_end_date then
    return new;
  end if;

  next_start := case
    when new.start_date is null then null
    else new.start_date + (next_due - new.due_date)
  end;

  insert into public.tasks (
    user_id, course_id, title, description, type, due_date, due_time, weight,
    is_extra_credit, source, priority, start_date, recurrence_frequency,
    recurrence_end_date, recurrence_series_id, reminder_offsets_minutes,
    recurrence_anchor_day, recurrence_anchor_is_month_end, estimated_minutes
  ) values (
    new.user_id, new.course_id, new.title, new.description, new.type, next_due,
    new.due_time, new.weight, new.is_extra_credit, 'manual', new.priority,
    next_start, new.recurrence_frequency, new.recurrence_end_date,
    coalesce(new.recurrence_series_id, new.id), new.reminder_offsets_minutes,
    new.recurrence_anchor_day, new.recurrence_anchor_is_month_end,
    new.estimated_minutes
  )
  on conflict (user_id, recurrence_series_id, due_date)
    where recurrence_series_id is not null do nothing
  returning id into next_task_id;

  if next_task_id is not null then
    insert into public.task_subtasks (user_id, task_id, title, position)
    select new.user_id, next_task_id, title, position
    from public.task_subtasks
    where task_id = new.id
    order by position, created_at;
  end if;

  return new;
end;
$$;

do $extend_series_edit$
declare
  function_definition text;
  priority_assignment text :=
    'priority = case when p_patch ? ''priority'' then p_patch ->> ''priority'' else task.priority end,';
begin
  select pg_get_functiondef(
    'public.update_recurring_task_series(uuid,text,jsonb)'::regprocedure
  ) into function_definition;

  if position('estimated_minutes = case' in function_definition) = 0 then
    function_definition := replace(
      function_definition,
      priority_assignment,
      priority_assignment || E'\n    estimated_minutes = case\n'
        || '      when p_patch ? ''estimated_minutes'' and p_patch -> ''estimated_minutes'' <> ''null''::jsonb' || E'\n'
        || '        then (p_patch ->> ''estimated_minutes'')::smallint' || E'\n'
        || '      when p_patch ? ''estimated_minutes'' then null else task.estimated_minutes end,'
    );
  end if;

  if position('estimated_minutes = case' in function_definition) = 0 then
    raise exception 'Could not extend recurring series edits with estimated_minutes';
  end if;

  execute function_definition;
end;
$extend_series_edit$;

alter table public.profiles
  add column if not exists study_daily_minutes smallint not null default 90,
  add column if not exists study_session_minutes smallint not null default 45,
  add column if not exists study_weekday_start time not null default '17:00',
  add column if not exists study_weekend_start time not null default '10:00',
  add column if not exists study_include_weekends boolean not null default true;

alter table public.profiles
  add constraint profiles_study_daily_minutes_valid
    check (study_daily_minutes between 30 and 480),
  add constraint profiles_study_session_minutes_valid
    check (study_session_minutes in (25, 45, 50));

create table public.study_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  scheduled_date date not null,
  start_time time not null,
  duration_minutes smallint not null
    check (duration_minutes between 15 and 180),
  is_completed boolean not null default false,
  completed_at timestamptz,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index study_blocks_user_date_idx
  on public.study_blocks (user_id, scheduled_date, start_time);
create index study_blocks_task_idx
  on public.study_blocks (task_id, is_completed);
create unique index study_blocks_task_slot_unique
  on public.study_blocks (user_id, task_id, scheduled_date, start_time);

alter table public.study_blocks enable row level security;

create policy "Users can view own study blocks" on public.study_blocks
  for select using (auth.uid() = user_id);
create policy "Users can create own study blocks" on public.study_blocks
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.tasks
      where tasks.id = study_blocks.task_id and tasks.user_id = auth.uid()
    )
  );
create policy "Users can update own study blocks" on public.study_blocks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own study blocks" on public.study_blocks
  for delete using (auth.uid() = user_id);

create or replace function public.set_study_block_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.completed_at := case
    when new.is_completed then coalesce(new.completed_at, now())
    else null
  end;
  return new;
end;
$$;

create trigger study_blocks_updated_at_trigger
  before update on public.study_blocks
  for each row execute function public.set_study_block_updated_at();

-- Replace every unfinished block for one semester in one transaction.
-- Completed blocks are history: they remain in place and reduce the task's
-- remaining effort the next time the client generates a plan.
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

    if item_duration < 15 or item_duration > 180 then
      raise exception 'Invalid study-block duration';
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
      user_id, task_id, scheduled_date, start_time, duration_minutes
    ) values (
      auth.uid(), item_task_id, item_date, item_time, item_duration
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

-- A completed task no longer needs unfinished study sessions. Completed
-- block history is retained for progress and future effort calculations.
create or replace function public.cleanup_completed_task_study_blocks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_completed and not old.is_completed then
    delete from public.study_blocks
    where task_id = new.id and not is_completed;
  end if;
  return new;
end;
$$;

create trigger cleanup_completed_task_study_blocks_trigger
  after update of is_completed on public.tasks
  for each row execute function public.cleanup_completed_task_study_blocks();
