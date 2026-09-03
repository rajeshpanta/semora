-- ============================================================
-- SEMORA (119): A SHORT FEED IS NOT AN EMPTY SEMESTER
-- ============================================================
-- Two changes to the same pair of functions, because they are the only two
-- places in this system that DELETE a student's task without the student
-- asking, and both of them decide it from a single HTTP response.
--
-- ─── 1.3  THE GUARD BELONGS IN THE FUNCTION ─────────────────
-- Removal is currently gated by `removalSafe`, computed in the edge function:
--
--     removalSafe: assignments.length > 0 && feed.assignments.length < 1000
--
-- That is a good rule in the wrong place. It is a CALLER CONVENTION: the SQL
-- accepts whatever array it is handed and deletes everything absent from it,
-- so the entire protection is one `&&` in TypeScript standing between a
-- truncated feed and every Canvas task a student has. Call
-- mark_canvas_calendar_feed_removed with an empty array today — from a future
-- caller, a refactor, a retry that lost its body, psql — and it deletes every
-- untouched Canvas task in a 385-day window and marks the rest removed.
--
-- Nothing has done that. The guard is here so that nothing can.
--
-- The in-SQL rule is deliberately not a copy of the caller's. The caller asks
-- "did this response look complete?"; only the database can ask the question
-- that actually matters — "is this response consistent with what we already
-- have?" A feed carrying fewer than half the items currently on file is not
-- trusted to prove absence, whatever the caller believes.
--
-- WHY REFUSING IS THE SAFE DIRECTION. A refusal leaves a cancelled assignment
-- visible for another hour. The failure it prevents is a student opening
-- Semora to find their semester gone. Those are not comparable, so this errs
-- one way every time — and raises an ops_alert, because a guard that trips
-- silently is indistinguishable from one that never trips.
--
-- ─── 1.4  AN EDITED DUE DATE IS THE STUDENT'S WORK ──────────
-- "Untouched" decides whether a vanished assignment is deleted outright or
-- kept and flagged. Today it means: not completed, no score, no points, no
-- subtasks. Every one of those is something the student ADDED.
--
-- A student who moved a due date has touched the row just as deliberately —
-- an instructor says "hand it in Friday" in class without updating Canvas,
-- the student fixes the date in Semora, and that edit is the only record of
-- it anywhere. Today that row is "untouched" and is deleted without trace.
--
-- Detecting it needs a fact the schema has never stored: what CANVAS last
-- said the due date was, as distinct from what the row says now. Two columns,
-- written by the sync on every item, and the difference between them is the
-- student's edit.
--
-- Existing rows have NULL and are treated exactly as they are today until
-- their next sync backfills them. This cannot change the outcome for any row
-- it has not first recorded a Canvas value for.
--
-- NOTE ON ORDER: on its own this only protects an edit until the next sync
-- overwrites it, because `due_date = excluded.due_date` still lets Canvas win
-- unconditionally. 120 is what stops the overwrite. These two columns are the
-- substrate that change needs, which is why they land first.
-- ============================================================

-- ─── 1.4: what Canvas last told us ──────────────────────────
alter table public.tasks
  add column if not exists lms_synced_due_date date,
  add column if not exists lms_synced_due_time time;

comment on column public.tasks.lms_synced_due_date is
  'SEMORA (119): the due DATE the LMS last sent for this item, as opposed to '
  'due_date which is what the task says now. A difference between the two is '
  'the student''s own edit, and is what stops the removal sweep from deleting '
  'a date they deliberately changed. NULL on rows last synced before 119.';

comment on column public.tasks.lms_synced_due_time is
  'SEMORA (119): the due TIME the LMS last sent. See lms_synced_due_date.';

-- ─── The refusal has to be visible ──────────────────────────
-- A guard nobody can see is a guard nobody maintains. When removal is refused
-- the sync still reports success (nothing failed — we declined to act on a
-- response we did not trust), so without this the only evidence would be
-- deletions that quietly never happened.
--
-- Rate-limited to one row per connection per 12 hours: a genuinely shrinking
-- feed would otherwise raise an alert every hour for the rest of the semester.
create or replace function public.note_lms_removal_refused(
  p_connection_id uuid,
  p_received integer,
  p_on_file integer,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if exists (
    select 1 from public.ops_alerts
    where kind = 'lms_removal_refused'
      and detail ->> 'connection_id' = p_connection_id::text
      and created_at > now() - interval '12 hours'
  ) then
    return;
  end if;

  insert into public.ops_alerts (kind, detail, delivered)
  values (
    'lms_removal_refused',
    jsonb_build_object(
      'connection_id', p_connection_id,
      'reason', p_reason,
      'received_items', p_received,
      'items_on_file', p_on_file,
      'meaning', 'a sync returned too few items to be trusted as proof that the missing ones were cancelled, so nothing was deleted',
      'benign_cause', 'end of term, a course unpublished, or the student dropping a class - the feed really did shrink',
      'action', 'if the shrink is real this clears itself once the feed and the tasks on file agree again'
    ),
    false
  );
end;
$function$;

revoke all on function public.note_lms_removal_refused(uuid, integer, integer, text) from public, anon, authenticated;
grant execute on function public.note_lms_removal_refused(uuid, integer, integer, text) to service_role;

comment on function public.note_lms_removal_refused(uuid, integer, integer, text) is
  'SEMORA (119): records that an LMS removal sweep declined to act because the '
  'feed was empty or implausibly short. De-duplicated per connection per 12h.';

-- ─── The Canvas calendar-feed removal path ──────────────────
create or replace function public.mark_canvas_calendar_feed_removed(
  p_user_id uuid, p_connection_id uuid, p_received_ids text[]
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  removed   integer := 0;
  marked    integer := 0;
  received  integer := coalesce(array_length(p_received_ids, 1), 0);
  on_file   integer := 0;
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

  -- ── 1.3: is this feed even entitled to prove absence? ─────
  -- Counted over the same window the removal uses, so the comparison is
  -- like-for-like and a semester rolling out of the window cannot fake a
  -- collapse.
  select count(*) into on_file
  from public.tasks
  where user_id = p_user_id
    and lms_connection_id = p_connection_id
    and lms_removed_at is null
    and due_date between current_date - 25 and current_date + 360;

  -- An empty feed removes nothing, ever. There is no such thing as evidence
  -- of absence from a response that contained nothing.
  if received = 0 and on_file > 0 then
    perform public.note_lms_removal_refused(p_connection_id, received, on_file, 'empty_feed');
    return 0;
  end if;

  -- Fewer than half of what we hold is a truncated or partial response until
  -- proven otherwise. Canvas's own 1,000-item cap is the caller's concern;
  -- this catches every other way a response arrives short.
  if on_file >= 4 and received * 2 < on_file then
    perform public.note_lms_removal_refused(p_connection_id, received, on_file, 'short_feed');
    return 0;
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
    -- 1.4: a due date the student moved away from what Canvas sent.
    and (lms_synced_due_date is null or due_date is not distinct from lms_synced_due_date)
    and (lms_synced_due_time is null or due_time is not distinct from lms_synced_due_time)
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

comment on function public.mark_canvas_calendar_feed_removed(uuid, uuid, text[]) is
  'SEMORA (092, guarded in 119): reconciles Canvas calendar-feed removals. '
  'Refuses to treat a feed as evidence of absence when it is empty or carries '
  'fewer than half the items on file (119) — the guard lives here rather than '
  'in the caller because this is the function that does the deleting. Deletes '
  'only rows carrying nothing of the student''s, which since 119 includes a '
  'due date they edited away from what Canvas sent.';

-- ─── The generic removal path ───────────────────────────────
-- Runs for every provider, and runs FIRST — 092 recorded that ordering matters
-- here, because this function stamps lms_removed_at and the Canvas-specific
-- one above only acts on rows where that is still null. Guarding one without
-- the other would leave the door open, so both get the same rule.
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
  received int := 0;
  on_file int := 0;
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
      lms_last_synced_at, lms_removed_at,
      lms_synced_due_date, lms_synced_due_time
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
      nullif(item ->> 'url', ''), now(), null,
      -- 1.4: what Canvas said, kept alongside what the task says.
      due_on, due_clock
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
      lms_removed_at = null,
      -- Always the incoming value, never coalesced: this column's whole job is
      -- to be Canvas's current answer, so that due_date differing from it means
      -- the student changed something.
      lms_synced_due_date = excluded.lms_synced_due_date,
      lms_synced_due_time = excluded.lms_synced_due_time;
    processed := processed + 1;
  end loop;

  if coalesce(array_length(p_external_course_ids, 1), 0) > 0 then
    -- ── 1.3: the same trust test as the Canvas path ─────────
    -- Scoped to the courses this call claims to have covered, so a connection
    -- syncing one course of four is not measured against all four.
    select count(*) into received
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) r
    where r ->> 'external_course_id' = any(p_external_course_ids);

    select count(*) into on_file
    from public.tasks t
    where t.user_id = p_user_id
      and t.lms_connection_id = p_connection_id
      and t.lms_external_course_id = any(p_external_course_ids)
      and t.lms_removed_at is null;

    if (received = 0 and on_file > 0) or (on_file >= 4 and received * 2 < on_file) then
      perform public.note_lms_removal_refused(
        p_connection_id, received, on_file,
        case when received = 0 then 'empty_feed' else 'short_feed' end
      );
    else
      -- Gone from the LMS: delete it if it was never touched, keep it if it was.
      --
      -- UNTOUCHED IS THE WHOLE TEST. If the student never completed it, never
      -- recorded a mark, never broke it into steps and never moved its due
      -- date, the row is a copy of an LMS record that no longer exists and
      -- there is nothing of theirs in it. The moment any of those is true the
      -- row stops being a copy and starts being their work.
      delete from public.tasks task
      where task.user_id = p_user_id
        and task.lms_connection_id = p_connection_id
        and task.lms_external_course_id = any(p_external_course_ids)
        and not task.is_completed
        and task.score is null
        and task.points_earned is null
        -- 1.4: a due date or time the student moved away from Canvas's.
        and (task.lms_synced_due_date is null or task.due_date is not distinct from task.lms_synced_due_date)
        and (task.lms_synced_due_time is null or task.due_time is not distinct from task.lms_synced_due_time)
        and not exists (select 1 from public.task_subtasks s where s.task_id = task.id)
        and not exists (
          select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) received_item
          where received_item ->> 'external_course_id' = task.lms_external_course_id
            and received_item ->> 'external_id' = task.lms_external_id
        );

      update public.tasks task
      set lms_removed_at = now(), lms_last_synced_at = now()
      where task.user_id = p_user_id
        and task.lms_connection_id = p_connection_id
        and task.lms_external_course_id = any(p_external_course_ids)
        and task.lms_removed_at is null
        and not exists (
          select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) received_item
          where received_item ->> 'external_course_id' = task.lms_external_course_id
            and received_item ->> 'external_id' = task.lms_external_id
        );
    end if;
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
