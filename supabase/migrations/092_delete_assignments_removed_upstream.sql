-- ============================================================
-- SEMORA: AN ASSIGNMENT DELETED IN CANVAS DISAPPEARS HERE TOO
-- ============================================================
-- Until now a removal was recorded, not applied. `lms_removed_at` was stamped
-- and the row stayed exactly where it was: in Today, on the calendar, inside
-- the overdue count, inside the week's workload. The only sign it had been
-- cancelled was a banner on the task's own detail screen — which a student
-- sees only if they open the thing they are trying to stop being reminded of.
--
-- So an instructor deleting an assignment made the student's list WORSE than
-- if Semora had never synced it. They cannot tell whether it still counts, and
-- the app is the reason they cannot tell.
--
-- ─── What is deleted, and what is not ───────────────────────────
-- Deleted: rows the student never touched. Not completed, no score, no points,
-- no sub-steps. Such a row is a copy of an LMS record that no longer exists,
-- and there is nothing of the student's in it to lose.
--
-- Kept and marked: everything else. The moment a student ticks it off, types a
-- mark, or breaks it into steps, the row stops being a copy and starts being
-- their work. A recorded grade is an input to their grade projection —
-- deleting it would silently move a number they are relying on, which is a
-- worse confusion than the one being fixed. Those keep lms_removed_at and stay
-- where grades and completed work live.
--
-- In practice almost every removal is the first case: an assignment nobody
-- started, which is exactly the kind that lingers and nags.
--
-- ─── Why this is safe to do at all ──────────────────────────────
-- "Missing from the feed" is only trusted when the feed was clearly complete:
-- lms-sync sets removalSafe only when the response was non-empty AND under
-- Canvas's 1,000-item cap, and the reconcile stays inside a −25/+360 day
-- window so a timezone or refresh edge cannot fake a removal. Nothing here
-- loosens those guards; it only changes what happens once they have passed.
--
-- ─── Both removal paths, because ORDER decided the outcome ──────
-- Two functions reconcile removals and apply_lms_assignment_sync_service runs
-- FIRST. It stamped lms_removed_at, and mark_canvas_calendar_feed_removed only
-- acts on rows where lms_removed_at is null — so changing the Canvas-specific
-- one alone would have deleted nothing, ever. Both are rewritten together.
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_lms_assignment_sync_service(p_user_id uuid, p_connection_id uuid, p_items jsonb, p_external_course_ids text[] DEFAULT ARRAY[]::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select user_id into connection_user
  from public.lms_connections
  where id = p_connection_id;
  if connection_user is null or connection_user <> p_user_id then
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
         join public.courses course on course.id = link.local_course_id
         where link.connection_id = p_connection_id
           and link.external_course_id = external_course
           and link.local_course_id = local_course
           and link.user_id = p_user_id
           and course.user_id = p_user_id
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
      p_user_id, local_course, btrim(item ->> 'title'), nullif(item ->> 'description', ''),
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
    -- Gone from the LMS: delete it if it was never touched, keep it if it was.
    --
    -- Marking alone left a cancelled assignment sitting in Today, in the
    -- calendar and in every count, with the only hint being a banner you had
    -- to open the task to see. An instructor deletes an assignment and the
    -- student keeps being nagged by it — which is worse than it quietly
    -- disappearing, because they cannot tell whether it still counts.
    --
    -- UNTOUCHED IS THE WHOLE TEST. If the student never completed it, never
    -- recorded a mark and never broke it into steps, the row is a copy of an
    -- LMS record that no longer exists and there is nothing of theirs in it.
    -- The moment any of those is true the row stops being a copy and starts
    -- being their work: a grade they typed is the input to their projection,
    -- and deleting it would silently move a number they rely on. Those keep
    -- the existing lms_removed_at marker and stay visible where grades live.
    delete from public.tasks task
    where task.user_id = p_user_id
      and task.lms_connection_id = p_connection_id
      and task.lms_external_course_id = any(p_external_course_ids)
      and not task.is_completed
      and task.score is null
      and task.points_earned is null
      and not exists (select 1 from public.task_subtasks s where s.task_id = task.id)
      and not exists (
        select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) received
        where received ->> 'external_course_id' = task.lms_external_course_id
          and received ->> 'external_id' = task.lms_external_id
      );

    update public.tasks task
    set lms_removed_at = now(), lms_last_synced_at = now()
    where task.user_id = p_user_id
      and task.lms_connection_id = p_connection_id
      and task.lms_external_course_id = any(p_external_course_ids)
      and task.lms_removed_at is null
      and not exists (
        select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) received
        where received ->> 'external_course_id' = task.lms_external_course_id
          and received ->> 'external_id' = task.lms_external_id
      );
  end if;

  update public.lms_connections
  set last_synced_at = now(),
      last_successful_sync_at = now(),
      last_sync_status = case when skipped > 0 then 'partial' else 'success' end,
      last_error = case when skipped > 0 then skipped || ' items skipped because they had no usable due date or course mapping' else null end,
      consecutive_sync_failures = 0
  where id = p_connection_id and user_id = p_user_id;

  update public.lms_course_links
  set last_synced_at = now()
  where connection_id = p_connection_id and user_id = p_user_id and sync_enabled;

  return jsonb_build_object('processed', processed, 'skipped', skipped);
end;
$function$;

revoke all on function public.apply_lms_assignment_sync_service(uuid, uuid, jsonb, text[]) from public, anon, authenticated;
grant execute on function public.apply_lms_assignment_sync_service(uuid, uuid, jsonb, text[]) to service_role;

-- ─── the Canvas calendar-feed path ──────────────────────────────
-- Same rule, same window. Returns the number of rows that stopped being
-- listed, deleted and marked together, so the caller's logging is unchanged.
create or replace function public.mark_canvas_calendar_feed_removed(
  p_user_id uuid, p_connection_id uuid, p_received_ids text[]
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  removed integer := 0;
  marked  integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.lms_connections
    where id = p_connection_id
      and user_id = p_user_id
      and provider = 'canvas'
      and connection_method = 'calendar_feed'
  ) then
    raise exception 'Canvas calendar connection not found' using errcode = '42501';
  end if;

  -- Untouched: the row is a stale copy, so it goes.
  delete from public.tasks
  where user_id = p_user_id
    and lms_connection_id = p_connection_id
    -- Stay five/six days inside Canvas's published boundaries so timezone and
    -- refresh-edge differences never produce a false removal.
    and due_date between current_date - 25 and current_date + 360
    and not (lms_external_id = any(coalesce(p_received_ids, array[]::text[])))
    and lms_removed_at is null
    and not is_completed
    and score is null
    and points_earned is null
    and not exists (select 1 from public.task_subtasks s where s.task_id = tasks.id);
  get diagnostics removed = row_count;

  -- Carries the student's own work: keep it, flag it.
  update public.tasks
  set lms_removed_at = now(), lms_last_synced_at = now()
  where user_id = p_user_id
    and lms_connection_id = p_connection_id
    and due_date between current_date - 25 and current_date + 360
    and not (lms_external_id = any(coalesce(p_received_ids, array[]::text[])))
    and lms_removed_at is null;
  get diagnostics marked = row_count;

  return removed + marked;
end;
$function$;

revoke all on function public.mark_canvas_calendar_feed_removed(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.mark_canvas_calendar_feed_removed(uuid, uuid, text[]) to service_role;
