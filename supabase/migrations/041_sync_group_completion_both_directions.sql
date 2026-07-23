-- ============================================================
-- SEMORA GROUP-COMPLETION CONSISTENCY
-- Shared group completion is authoritative in linked planner tasks. Reopening
-- an accidentally completed group assignment must reopen those tasks too.
-- ============================================================

create or replace function public.sync_collaboration_to_planner(
  p_collaboration_id uuid,
  p_semester_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  collaboration_row public.course_collaborations;
  local_course uuid;
  deadline_count int := 0;
  group_count int := 0;
begin
  select collaboration.* into collaboration_row
  from public.course_collaborations collaboration
  join public.course_collaboration_members member
    on member.collaboration_id = collaboration.id
   and member.user_id = auth.uid()
  where collaboration.id = p_collaboration_id and collaboration.is_active;

  if collaboration_row.id is null then
    raise exception 'Collaboration not found' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.semesters
    where id = p_semester_id and user_id = auth.uid()
  ) then
    raise exception 'Semester not found' using errcode = '42501';
  end if;

  select member.local_course_id into local_course
  from public.course_collaboration_members member
  join public.courses course
    on course.id = member.local_course_id and course.user_id = auth.uid()
  where member.collaboration_id = p_collaboration_id and member.user_id = auth.uid();

  if local_course is null then
    insert into public.courses(user_id, semester_id, name, color, icon)
    values(auth.uid(), p_semester_id, collaboration_row.course_name, collaboration_row.course_color, 'people')
    returning id into local_course;

    update public.course_collaboration_members
    set local_course_id = local_course
    where collaboration_id = p_collaboration_id and user_id = auth.uid();
  end if;

  insert into public.tasks(
    user_id, course_id, title, description, type, due_date, due_time,
    points_possible, collaboration_deadline_id, source
  )
  select
    auth.uid(), local_course, deadline.title, deadline.description,
    deadline.task_type, deadline.due_date, deadline.due_time,
    deadline.points_possible, deadline.id, 'manual'::public.source_type
  from public.shared_deadlines deadline
  where deadline.collaboration_id = p_collaboration_id
  on conflict (user_id, collaboration_deadline_id)
    where collaboration_deadline_id is not null
  do update set
    course_id = excluded.course_id,
    title = excluded.title,
    description = excluded.description,
    type = excluded.type,
    due_date = excluded.due_date,
    due_time = excluded.due_time,
    points_possible = coalesce(excluded.points_possible, public.tasks.points_possible);
  get diagnostics deadline_count = row_count;

  insert into public.tasks(
    user_id, course_id, title, description, type, due_date, due_time,
    is_completed, completed_at, group_assignment_id, source
  )
  select
    auth.uid(), local_course, assignment.title, assignment.description,
    'assignment'::public.task_type, assignment.due_date, assignment.due_time,
    assignment.is_completed, assignment.completed_at, assignment.id,
    'manual'::public.source_type
  from public.group_assignments assignment
  where assignment.collaboration_id = p_collaboration_id
  on conflict (user_id, group_assignment_id)
    where group_assignment_id is not null
  do update set
    course_id = excluded.course_id,
    title = excluded.title,
    description = excluded.description,
    due_date = excluded.due_date,
    due_time = excluded.due_time,
    is_completed = excluded.is_completed,
    completed_at = excluded.completed_at;
  get diagnostics group_count = row_count;

  return jsonb_build_object(
    'course_id', local_course,
    'deadlines_synced', deadline_count,
    'group_assignments_synced', group_count
  );
end;
$$;

revoke all on function public.sync_collaboration_to_planner(uuid, uuid) from public, anon;
grant execute on function public.sync_collaboration_to_planner(uuid, uuid) to authenticated;
