-- ============================================================
-- 062 — stop Course Spaces duplicating the owner's planner
-- ============================================================
-- Publishing deadlines duplicated the owner's own tasks, and the duplication
-- compounded on every Publish.
--
--   1. publish_course_deadlines selected every incomplete task in the course
--      with no exclusion for tasks that a previous sync had itself created
--      from a shared deadline. So: publish 3 tasks -> sync creates 3 copies in
--      the owner's planner -> publish again sees 6 tasks -> 6 shared deadlines
--      -> sync creates more. Each round grew the shared list, and every member
--      inherited the growth on their next sync.
--
--   2. sync_collaboration_to_planner copied EVERY shared deadline back into the
--      caller's planner, including the ones the caller had just published. The
--      owner therefore ended up with two of each deadline after a single
--      publish-then-sync, before any compounding.
--
-- Both functions are otherwise unchanged; the upsert conflict targets already
-- made re-syncing idempotent, which is why this only ever showed up through
-- the publish path.
--
-- Existing duplicates are NOT removed here: a synced copy is indistinguishable
-- from a task the user legitimately keeps, and silently deleting rows from
-- someone's planner is worse than leaving them. They stop multiplying.
-- ============================================================

create or replace function public.publish_course_deadlines(p_collaboration_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  collaboration_row public.course_collaborations;
  published int := 0;
begin
  select * into collaboration_row
  from public.course_collaborations
  where id = p_collaboration_id and owner_user_id = auth.uid() and is_active;
  if collaboration_row.id is null then
    raise exception 'Only the course owner can publish deadlines' using errcode = '42501';
  end if;

  insert into public.shared_deadlines(
    collaboration_id, source_task_id, created_by, title, description,
    task_type, due_date, due_time, points_possible, source_updated_at
  )
  select
    collaboration_row.id, task.id, auth.uid(), task.title, task.description,
    task.type, task.due_date, task.due_time, task.points_possible, task.updated_at
  from public.tasks task
  where task.course_id = collaboration_row.course_id
    and task.user_id = auth.uid()
    and not task.is_completed
    -- Never re-publish a task that a previous sync created from a shared
    -- deadline. Without this the owner's synced copies were treated as fresh
    -- source tasks on the next Publish, so the shared list doubled every time.
    and task.collaboration_deadline_id is null
  on conflict(collaboration_id, source_task_id) do update set
    title = excluded.title,
    description = excluded.description,
    task_type = excluded.task_type,
    due_date = excluded.due_date,
    due_time = excluded.due_time,
    points_possible = excluded.points_possible,
    source_updated_at = excluded.source_updated_at;

  get diagnostics published = row_count;
  return published;
end;
$$;

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
    -- Skip deadlines this user published themselves: the source task is
    -- already in their planner, and copying it back produced a visible
    -- duplicate of every deadline the owner shared.
    and deadline.created_by <> auth.uid()
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
    due_time = excluded.due_time;
    -- NOTE: is_completed / completed_at deliberately NOT updated here — the
    -- member owns their personal task's completion (mirrors shared_deadlines
    -- above). Only the first insert adopts the group's completion state.
  get diagnostics group_count = row_count;

  return jsonb_build_object(
    'course_id', local_course,
    'deadlines_synced', deadline_count,
    'group_assignments_synced', group_count
  );
end;
$$;
