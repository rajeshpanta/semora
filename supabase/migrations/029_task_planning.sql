-- Task planning upgrade: priority, start dates, recurrence, custom reminders,
-- and owner-scoped subtasks. Existing rows keep their current behavior.

alter table public.tasks
  add column if not exists priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high')),
  add column if not exists start_date date,
  add column if not exists recurrence_frequency text
    check (recurrence_frequency in ('daily', 'weekly', 'biweekly', 'monthly')),
  add column if not exists recurrence_end_date date,
  add column if not exists recurrence_series_id uuid,
  add column if not exists reminder_offsets_minutes integer[];

alter table public.tasks
  add constraint tasks_start_before_due check (start_date is null or start_date <= due_date),
  add constraint tasks_recurrence_end_after_due check (recurrence_end_date is null or recurrence_end_date >= due_date),
  add constraint tasks_reminder_offsets_valid check (
    reminder_offsets_minutes is null or (
      cardinality(reminder_offsets_minutes) <= 8
      and array_position(reminder_offsets_minutes, null) is null
      and 0 <= all(reminder_offsets_minutes)
      and 525600 >= all(reminder_offsets_minutes)
    )
  );

create unique index if not exists tasks_recurrence_occurrence_unique
  on public.tasks (user_id, recurrence_series_id, due_date)
  where recurrence_series_id is not null;

create index if not exists tasks_user_priority_idx
  on public.tasks (user_id, priority, due_date);

create or replace function public.prepare_task_recurrence()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.recurrence_frequency is not null and new.recurrence_series_id is null then
    new.recurrence_series_id := new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists prepare_task_recurrence_trigger on public.tasks;
create trigger prepare_task_recurrence_trigger
  before insert or update of recurrence_frequency on public.tasks
  for each row execute function public.prepare_task_recurrence();

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
begin
  if not (new.is_completed and not old.is_completed and new.recurrence_frequency is not null) then
    return new;
  end if;

  next_due := case new.recurrence_frequency
    when 'daily' then new.due_date + 1
    when 'weekly' then new.due_date + 7
    when 'biweekly' then new.due_date + 14
    when 'monthly' then case
      when new.due_date = (date_trunc('month', new.due_date) + interval '1 month' - interval '1 day')::date
        then (date_trunc('month', new.due_date) + interval '2 months' - interval '1 day')::date
      else least(
        (new.due_date + interval '1 month')::date,
        (date_trunc('month', new.due_date) + interval '2 months' - interval '1 day')::date
      )
    end
  end;

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
    recurrence_end_date, recurrence_series_id, reminder_offsets_minutes
  ) values (
    new.user_id, new.course_id, new.title, new.description, new.type, next_due,
    new.due_time, new.weight, new.is_extra_credit, 'manual', new.priority,
    next_start, new.recurrence_frequency, new.recurrence_end_date,
    coalesce(new.recurrence_series_id, new.id), new.reminder_offsets_minutes
  )
  on conflict (user_id, recurrence_series_id, due_date)
    where recurrence_series_id is not null do nothing
  returning id into next_task_id;

  -- Reuse the checklist as a template for every occurrence, resetting its
  -- completion state so recurring routines stay genuinely reusable.
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

drop trigger if exists spawn_next_recurring_task_trigger on public.tasks;
create trigger spawn_next_recurring_task_trigger
  after update of is_completed on public.tasks
  for each row execute function public.spawn_next_recurring_task();

create table if not exists public.task_subtasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 240),
  is_completed boolean not null default false,
  position integer not null default 0 check (position >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_subtasks_task_position_idx
  on public.task_subtasks (task_id, position, created_at);
create index if not exists task_subtasks_user_idx
  on public.task_subtasks (user_id);

alter table public.task_subtasks enable row level security;

create policy "Users can view own subtasks" on public.task_subtasks
  for select using (auth.uid() = user_id);
create policy "Users can create own subtasks" on public.task_subtasks
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.tasks
      where tasks.id = task_subtasks.task_id and tasks.user_id = auth.uid()
    )
  );
create policy "Users can update own subtasks" on public.task_subtasks
  for update using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.tasks
      where tasks.id = task_subtasks.task_id and tasks.user_id = auth.uid()
    )
  );
create policy "Users can delete own subtasks" on public.task_subtasks
  for delete using (auth.uid() = user_id);

create or replace function public.set_task_subtask_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.completed_at := case when new.is_completed then coalesce(new.completed_at, now()) else null end;
  return new;
end;
$$;

drop trigger if exists task_subtasks_updated_at_trigger on public.task_subtasks;
create trigger task_subtasks_updated_at_trigger
  before update on public.task_subtasks
  for each row execute function public.set_task_subtask_updated_at();
