-- The earlier planner RPC accepted reschedule metadata from the app but its
-- final insert omitted it. Preserve both the original move reason and the
-- adaptive coach reason so every visible explanation survives a refresh.

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
  item_reschedule_reason text;
  item_rescheduled_from_date date;
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
    item_reschedule_reason := nullif(item ->> 'reschedule_reason', '');
    item_rescheduled_from_date := nullif(item ->> 'rescheduled_from_date', '')::date;
    item_coach_reason := nullif(item ->> 'coach_reason', '');

    if item_duration < 15 or item_duration > 180 then
      raise exception 'Invalid study-block duration';
    end if;
    if item_reschedule_reason is not null
      and item_reschedule_reason not in ('missed', 'conflict', 'rebuild') then
      raise exception 'Invalid study-block reschedule reason';
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
      user_id, task_id, scheduled_date, start_time, duration_minutes,
      reschedule_reason, rescheduled_from_date, coach_reason
    ) values (
      auth.uid(), item_task_id, item_date, item_time, item_duration,
      item_reschedule_reason, item_rescheduled_from_date, item_coach_reason
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
