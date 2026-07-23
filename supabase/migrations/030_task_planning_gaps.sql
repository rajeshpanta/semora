-- Close the remaining task-planning gaps: preserve the original monthly
-- recurrence anchor and provide an atomic RPC for editing a recurring series.

alter table public.tasks
  add column if not exists recurrence_anchor_day smallint,
  add column if not exists recurrence_anchor_is_month_end boolean;

alter table public.tasks
  add constraint tasks_recurrence_anchor_day_valid
    check (recurrence_anchor_day is null or recurrence_anchor_day between 1 and 31);

-- Existing monthly series inherit the date rule from their first occurrence.
with first_occurrence as (
  select
    coalesce(recurrence_series_id, id) as series_id,
    (array_agg(due_date order by due_date, created_at))[1] as first_due
  from public.tasks
  where recurrence_frequency = 'monthly'
  group by coalesce(recurrence_series_id, id)
)
update public.tasks as task
set
  recurrence_anchor_day = extract(day from first_occurrence.first_due)::smallint,
  recurrence_anchor_is_month_end = first_occurrence.first_due =
    (date_trunc('month', first_occurrence.first_due) + interval '1 month' - interval '1 day')::date
from first_occurrence
where coalesce(task.recurrence_series_id, task.id) = first_occurrence.series_id
  and task.recurrence_frequency = 'monthly';

create or replace function public.prepare_task_recurrence()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.recurrence_frequency is null then
    new.recurrence_series_id := null;
    new.recurrence_anchor_day := null;
    new.recurrence_anchor_is_month_end := null;
    return new;
  end if;

  if new.recurrence_frequency is not null and new.recurrence_series_id is null then
    new.recurrence_series_id := new.id;
  end if;

  if new.recurrence_frequency = 'monthly' then
    if new.recurrence_anchor_day is null then
      new.recurrence_anchor_day := extract(day from new.due_date)::smallint;
    end if;
    if new.recurrence_anchor_is_month_end is null then
      new.recurrence_anchor_is_month_end := new.due_date =
        (date_trunc('month', new.due_date) + interval '1 month' - interval '1 day')::date;
    end if;
  else
    new.recurrence_anchor_day := null;
    new.recurrence_anchor_is_month_end := null;
  end if;

  return new;
end;
$$;

drop trigger if exists prepare_task_recurrence_trigger on public.tasks;
create trigger prepare_task_recurrence_trigger
  before insert or update of recurrence_frequency, due_date on public.tasks
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
    recurrence_anchor_day, recurrence_anchor_is_month_end
  ) values (
    new.user_id, new.course_id, new.title, new.description, new.type, next_due,
    new.due_time, new.weight, new.is_extra_credit, 'manual', new.priority,
    next_start, new.recurrence_frequency, new.recurrence_end_date,
    coalesce(new.recurrence_series_id, new.id), new.reminder_offsets_minutes,
    new.recurrence_anchor_day, new.recurrence_anchor_is_month_end
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

-- Update one occurrence, this-and-future, or the complete series without
-- leaving a half-updated chain. The app uses this RPC for multi-row edits;
-- single-occurrence edits continue through the normal tasks update policy.
create or replace function public.update_recurring_task_series(
  p_task_id uuid,
  p_scope text,
  p_patch jsonb
)
returns setof public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  base public.tasks%rowtype;
  target_ids uuid[];
  series_id uuid;
  new_due date;
  new_start date;
  due_shift integer := 0;
  start_lead integer;
  new_frequency text;
  anchor_day smallint;
  anchor_is_month_end boolean;
begin
  if p_scope not in ('future', 'all') then
    raise exception 'Invalid recurring edit scope';
  end if;

  select * into base
  from public.tasks
  where id = p_task_id and user_id = auth.uid();

  if not found then
    raise exception 'Task not found';
  end if;
  if base.recurrence_frequency is null then
    raise exception 'Task is not recurring';
  end if;

  series_id := coalesce(base.recurrence_series_id, base.id);
  new_due := case
    when p_patch ? 'due_date' then (p_patch ->> 'due_date')::date
    else base.due_date
  end;
  due_shift := new_due - base.due_date;

  if p_patch ? 'start_date' and p_patch -> 'start_date' <> 'null'::jsonb then
    new_start := (p_patch ->> 'start_date')::date;
    start_lead := new_due - new_start;
  end if;

  new_frequency := case
    when p_patch ? 'recurrence_frequency' and p_patch -> 'recurrence_frequency' <> 'null'::jsonb
      then p_patch ->> 'recurrence_frequency'
    when p_patch ? 'recurrence_frequency' then null
    else base.recurrence_frequency
  end;

  if new_frequency = 'monthly' then
    if base.recurrence_frequency = 'monthly' and new_due = base.due_date then
      anchor_day := coalesce(base.recurrence_anchor_day, extract(day from base.due_date)::smallint);
      anchor_is_month_end := coalesce(
        base.recurrence_anchor_is_month_end,
        base.due_date = (date_trunc('month', base.due_date) + interval '1 month' - interval '1 day')::date
      );
    else
      anchor_day := extract(day from new_due)::smallint;
      anchor_is_month_end := new_due =
        (date_trunc('month', new_due) + interval '1 month' - interval '1 day')::date;
    end if;
  end if;

  select array_agg(id order by due_date, created_at) into target_ids
  from public.tasks
  where user_id = auth.uid()
    and coalesce(recurrence_series_id, id) = series_id
    and (p_scope = 'all' or due_date >= base.due_date);

  if target_ids is null or cardinality(target_ids) = 0 then
    raise exception 'No recurring tasks found';
  end if;

  -- Temporarily leave the partial unique index so shifting dates cannot
  -- collide with another target occurrence midway through the statement.
  update public.tasks
  set recurrence_series_id = null
  where id = any(target_ids);

  update public.tasks as task
  set
    title = case when p_patch ? 'title' then p_patch ->> 'title' else task.title end,
    description = case when p_patch ? 'description'
      then nullif(p_patch ->> 'description', '') else task.description end,
    type = case when p_patch ? 'type' then (p_patch ->> 'type')::public.task_type else task.type end,
    due_date = task.due_date + due_shift,
    due_time = case when p_patch ? 'due_time'
      then nullif(p_patch ->> 'due_time', '')::time else task.due_time end,
    weight = case when p_patch ? 'weight' and p_patch -> 'weight' <> 'null'::jsonb
      then (p_patch ->> 'weight')::numeric
      when p_patch ? 'weight' then null else task.weight end,
    priority = case when p_patch ? 'priority' then p_patch ->> 'priority' else task.priority end,
    start_date = case
      when p_patch ? 'start_date' and p_patch -> 'start_date' = 'null'::jsonb then null
      when p_patch ? 'start_date' then (task.due_date + due_shift) - start_lead
      else case when task.start_date is null then null else task.start_date + due_shift end
    end,
    recurrence_frequency = new_frequency,
    recurrence_end_date = case
      when p_patch ? 'recurrence_end_date' and p_patch -> 'recurrence_end_date' <> 'null'::jsonb
        then (p_patch ->> 'recurrence_end_date')::date
      when p_patch ? 'recurrence_end_date' then null
      else task.recurrence_end_date
    end,
    reminder_offsets_minutes = case
      when p_patch ? 'reminder_offsets_minutes' and p_patch -> 'reminder_offsets_minutes' <> 'null'::jsonb
        then array(select jsonb_array_elements_text(p_patch -> 'reminder_offsets_minutes')::integer)
      when p_patch ? 'reminder_offsets_minutes' then null
      else task.reminder_offsets_minutes
    end,
    recurrence_series_id = case when new_frequency is null then null else series_id end,
    recurrence_anchor_day = case when new_frequency = 'monthly' then anchor_day else null end,
    recurrence_anchor_is_month_end = case when new_frequency = 'monthly' then anchor_is_month_end else null end,
    updated_at = now()
  where task.id = any(target_ids);

  return query
  select result_task.* from public.tasks as result_task
  where result_task.id = any(target_ids)
  order by result_task.due_date, result_task.created_at;
end;
$$;

revoke all on function public.update_recurring_task_series(uuid, text, jsonb) from public;
grant execute on function public.update_recurring_task_series(uuid, text, jsonb) to authenticated;
