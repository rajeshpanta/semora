-- ============================================================
-- SEMORA LMS SUBMISSION-TIME SAFETY
-- A provider may know work is complete without returning a trustworthy
-- submission timestamp. Keep the timestamp unknown instead of using sync time,
-- which could falsely classify on-time work as late.
-- ============================================================

create or replace function public.apply_lms_assignment_sync(
  p_connection_id uuid,
  p_items jsonb,
  p_external_course_ids text[] default array[]::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  connection_user uuid;
  item jsonb;
  local_course uuid;
  external_course text;
  external_assignment text;
  due_on date;
  due_clock time;
  task_kind public.task_type;
  item_completed boolean;
  item_completed_at timestamptz;
  item_submitted_late boolean;
  processed int := 0;
  skipped int := 0;
begin
  select user_id into connection_user
  from public.lms_connections
  where id = p_connection_id;

  if connection_user is null or connection_user <> auth.uid() then
    raise exception 'LMS connection not found' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'LMS items must be an array' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    begin
      local_course := nullif(item ->> 'local_course_id', '')::uuid;
      external_course := nullif(item ->> 'external_course_id', '');
      external_assignment := nullif(item ->> 'external_id', '');
      due_on := nullif(item ->> 'due_date', '')::date;
      due_clock := nullif(item ->> 'due_time', '')::time;
      item_completed := coalesce(nullif(item ->> 'is_completed', '')::boolean, false);
      item_completed_at := nullif(item ->> 'completed_at', '')::timestamptz;
      item_submitted_late := coalesce(nullif(item ->> 'submitted_late', '')::boolean, false);
    exception when others then
      skipped := skipped + 1;
      continue;
    end;

    if local_course is null or external_course is null or external_assignment is null
       or due_on is null or nullif(btrim(item ->> 'title'), '') is null
       or not exists (
         select 1 from public.lms_course_links link
         where link.connection_id = p_connection_id
           and link.external_course_id = external_course
           and link.local_course_id = local_course
           and link.user_id = auth.uid()
           and link.sync_enabled
       ) then
      skipped := skipped + 1;
      continue;
    end if;

    task_kind := case lower(coalesce(item ->> 'type', 'assignment'))
      when 'quiz' then 'quiz'::public.task_type
      when 'exam' then 'exam'::public.task_type
      when 'project' then 'project'::public.task_type
      when 'reading' then 'reading'::public.task_type
      when 'other' then 'other'::public.task_type
      else 'assignment'::public.task_type
    end;

    insert into public.tasks (
      user_id, course_id, title, description, type, due_date, due_time,
      points_possible, score, points_earned, is_completed, completed_at,
      submitted_late, source, lms_connection_id, lms_external_course_id,
      lms_external_id, lms_external_updated_at, lms_url,
      lms_last_synced_at, lms_removed_at
    ) values (
      auth.uid(), local_course, btrim(item ->> 'title'), nullif(item ->> 'description', ''),
      task_kind, due_on, due_clock,
      nullif(item ->> 'points_possible', '')::numeric,
      nullif(item ->> 'score', '')::numeric,
      nullif(item ->> 'points_earned', '')::numeric,
      item_completed,
      case when item_completed then item_completed_at else null end,
      item_submitted_late,
      'manual'::public.source_type, p_connection_id, external_course,
      external_assignment, nullif(item ->> 'external_updated_at', '')::timestamptz,
      nullif(item ->> 'url', ''), now(), null
    )
    on conflict on constraint tasks_lms_external_unique do update set
      course_id = excluded.course_id,
      title = excluded.title,
      description = excluded.description,
      type = excluded.type,
      due_date = excluded.due_date,
      due_time = excluded.due_time,
      points_possible = coalesce(excluded.points_possible, public.tasks.points_possible),
      score = coalesce(excluded.score, public.tasks.score),
      points_earned = coalesce(excluded.points_earned, public.tasks.points_earned),
      is_completed = public.tasks.is_completed or excluded.is_completed,
      completed_at = case
        when public.tasks.is_completed then public.tasks.completed_at
        when excluded.is_completed then coalesce(excluded.completed_at, public.tasks.completed_at)
        else public.tasks.completed_at
      end,
      submitted_late = public.tasks.submitted_late or excluded.submitted_late,
      lms_external_updated_at = excluded.lms_external_updated_at,
      lms_url = excluded.lms_url,
      lms_last_synced_at = now(),
      lms_removed_at = null;

    processed := processed + 1;
  end loop;

  if coalesce(array_length(p_external_course_ids, 1), 0) > 0 then
    update public.tasks task
    set lms_removed_at = now(), lms_last_synced_at = now()
    where task.user_id = auth.uid()
      and task.lms_connection_id = p_connection_id
      and task.lms_external_course_id = any(p_external_course_ids)
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) received
        where received ->> 'external_course_id' = task.lms_external_course_id
          and received ->> 'external_id' = task.lms_external_id
      );
  end if;

  update public.lms_connections
  set last_synced_at = now(),
      last_sync_status = case when skipped > 0 then 'partial' else 'success' end,
      last_error = case
        when skipped > 0
        then skipped || ' items skipped because they had no usable due date or course mapping'
        else null
      end
  where id = p_connection_id and user_id = auth.uid();

  update public.lms_course_links
  set last_synced_at = now()
  where connection_id = p_connection_id and user_id = auth.uid();

  return jsonb_build_object('processed', processed, 'skipped', skipped);
end;
$$;

revoke all on function public.apply_lms_assignment_sync(uuid, jsonb, text[]) from public, anon;
grant execute on function public.apply_lms_assignment_sync(uuid, jsonb, text[]) to authenticated;
