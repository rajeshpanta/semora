-- ============================================================
-- SEMORA (120): THE STUDENT OWNS WHAT THEY EDITED
-- ============================================================
-- Canvas currently wins every field, every hour, forever:
--
--     on conflict ... do update set title = excluded.title,
--                                   due_date = excluded.due_date, ...
--
-- A student can retype a cryptic assignment name into something they
-- recognise, move a due date their instructor changed verbally, or fix a type
-- Canvas got wrong — and the next background sync silently puts it all back.
-- They are not told, nothing is recorded, and because the sync runs hourly it
-- usually happens before they look again. From the inside it reads as the app
-- discarding their work at random.
--
-- And the other half of the same problem: "Delete" on a Canvas task deletes
-- the row, the next sync re-imports it from the feed, and it reappears. The
-- student concludes either that delete is broken or — worse — that Semora
-- deleted something from Canvas itself. Neither is true and both are the
-- fault of offering an action the sync is guaranteed to undo.
--
-- ─── THE MODEL ──────────────────────────────────────────────
-- Canvas owns a field until the student edits it. Then they own it.
--
-- Ownership is recorded per FIELD, not per row, so fixing a title does not
-- also freeze the due date — the student keeps getting the updates they never
-- touched, which is the entire reason they connected Canvas.
--
-- ─── THE ONE EXCEPTION, AND WHY ─────────────────────────────
-- Canvas still wins a due date it moves EARLIER, even one the student owns.
--
-- Ownership exists to protect a student's intent. It must not protect them
-- into missing a deadline that genuinely moved up: the cost of the two
-- mistakes is not symmetric — a re-applied edit is an annoyance, a missed
-- submission is a grade. When that happens lms_conflict_at is stamped so the
-- app can say what changed and offer the student's value back, rather than the
-- change being invisible either way. A later date never overrides them: it
-- cannot cause a miss, so their intent stands.
--
-- ─── HIDING, NOT DELETING ───────────────────────────────────
-- lms_hidden_at takes a row out of the student's lists without pretending
-- anything happened in Canvas. lms_suppressed_items is the durable half: the
-- task row can still be deleted by the removal sweep or a cascade, and without
-- an external-id record a re-listed item would come straight back. The table
-- outlives the row, which is exactly what "I don't want to see this" requires.
--
-- Nothing here reaches Canvas. Semora holds a read-only calendar feed and
-- cannot write to a student's LMS even if it wanted to — which is precisely
-- why the word "delete" had to stop appearing on these rows.
-- ============================================================

-- ─── Ownership, visibility, and the record of a disagreement ─
alter table public.tasks
  add column if not exists lms_field_overrides jsonb not null default '{}'::jsonb,
  add column if not exists lms_hidden_at timestamptz,
  add column if not exists lms_conflict_at timestamptz;

comment on column public.tasks.lms_field_overrides is
  'SEMORA (120): which fields of this LMS task the student now owns, as a set '
  'of keys ("title", "description", "type", "due_date", "due_time"). A field '
  'listed here is never overwritten by a sync — except a due date Canvas moves '
  'EARLIER, which always wins so ownership can never cause a missed deadline.';

comment on column public.tasks.lms_hidden_at is
  'SEMORA (120): the student hid this LMS task. Hidden, not deleted: deleting '
  'it only made the next sync re-import it, which read as the delete button '
  'being broken. See lms_suppressed_items for the half that outlives the row.';

comment on column public.tasks.lms_conflict_at is
  'SEMORA (120): when a sync last brought a value that disagreed with a field '
  'the student owns. Set whether or not the student''s value was kept, so the '
  'app can always show what changed instead of silently picking a winner.';

-- Hidden rows are read out of nearly every list query, so the index pays for
-- itself immediately; partial, because almost no row is ever hidden.
create index if not exists tasks_lms_hidden_idx
  on public.tasks (user_id, lms_connection_id)
  where lms_hidden_at is not null;

-- ─── The suppression list, which outlives the task row ──────
create table if not exists public.lms_suppressed_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.lms_connections(id) on delete cascade,
  external_course_id text,
  external_id text not null,
  suppressed_at timestamptz not null default now(),
  unique (connection_id, external_id)
);

comment on table public.lms_suppressed_items is
  'SEMORA (120): LMS items the student has hidden, keyed by the provider''s own '
  'id so the record survives the task row being deleted by the removal sweep or '
  'a cascade. Without it a hidden item returns on the next sync. Unhiding '
  'removes the row, and the following sync restores the item''s current values.';

alter table public.lms_suppressed_items enable row level security;

-- Read-only to the owner. Writes go exclusively through set_lms_task_hidden
-- below, which is the only path that keeps the row and the task in agreement.
drop policy if exists lms_suppressed_items_select_own on public.lms_suppressed_items;
create policy lms_suppressed_items_select_own on public.lms_suppressed_items
  for select using (auth.uid() = user_id);

create index if not exists lms_suppressed_items_connection_idx
  on public.lms_suppressed_items (connection_id, external_id);

-- ─── Ownership is recorded by the database, not the client ──
-- Every screen that edits a task would otherwise have to remember to declare
-- the override, and the one that forgets produces exactly the bug this
-- migration exists to fix — silently, months later. A trigger cannot forget.
--
-- The service_role test is what keeps this from marking everything: the sync
-- itself runs as service_role (apply_lms_assignment_sync_service refuses to
-- run as anything else), so its writes are never mistaken for a student's.
create or replace function public.tasks_record_lms_override()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  owned jsonb := coalesce(old.lms_field_overrides, '{}'::jsonb);
begin
  if new.lms_external_id is null then
    return new;
  end if;
  -- Only a human editing their own row claims ownership.
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;

  if new.title is distinct from old.title then owned := owned || '{"title": true}'::jsonb; end if;
  if new.description is distinct from old.description then owned := owned || '{"description": true}'::jsonb; end if;
  if new.type is distinct from old.type then owned := owned || '{"type": true}'::jsonb; end if;
  if new.due_date is distinct from old.due_date then owned := owned || '{"due_date": true}'::jsonb; end if;
  if new.due_time is distinct from old.due_time then owned := owned || '{"due_time": true}'::jsonb; end if;

  new.lms_field_overrides := owned;
  return new;
end;
$function$;

drop trigger if exists tasks_record_lms_override_trg on public.tasks;
create trigger tasks_record_lms_override_trg
  before update on public.tasks
  for each row
  execute function public.tasks_record_lms_override();

comment on function public.tasks_record_lms_override() is
  'SEMORA (120): records which fields of an LMS task the student has edited, so '
  'the sync stops overwriting them. Lives in a trigger because every edit '
  'screen would otherwise have to declare it and the one that forgets '
  'reintroduces the bug invisibly. Ignores writes that are not made by an '
  'authenticated user, which is how the sync''s own service_role updates are '
  'excluded.';

-- ─── Hide / restore ─────────────────────────────────────────
-- One RPC, because the task row and the suppression list must never disagree:
-- a task hidden without a suppression row comes back on the next sync, and a
-- suppression row without a hidden task hides an item nobody asked to hide.
create or replace function public.set_lms_task_hidden(
  p_task_id uuid,
  p_hidden boolean
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  t record;
begin
  select id, user_id, lms_connection_id, lms_external_course_id, lms_external_id
    into t
  from public.tasks
  where id = p_task_id;

  if t.id is null or t.user_id <> auth.uid() then
    raise exception 'Task not found' using errcode = '42501';
  end if;
  if t.lms_external_id is null or t.lms_connection_id is null then
    raise exception 'This task did not come from a connected class' using errcode = '22023';
  end if;

  if p_hidden then
    update public.tasks set lms_hidden_at = now() where id = t.id;
    insert into public.lms_suppressed_items (user_id, connection_id, external_course_id, external_id)
    values (t.user_id, t.lms_connection_id, t.lms_external_course_id, t.lms_external_id)
    on conflict (connection_id, external_id) do nothing;
  else
    update public.tasks set lms_hidden_at = null where id = t.id;
    delete from public.lms_suppressed_items
    where connection_id = t.lms_connection_id and external_id = t.lms_external_id;
  end if;
end;
$function$;

revoke all on function public.set_lms_task_hidden(uuid, boolean) from public, anon;
grant execute on function public.set_lms_task_hidden(uuid, boolean) to authenticated;

comment on function public.set_lms_task_hidden(uuid, boolean) is
  'SEMORA (120): hides or restores an LMS task for its owner. Writes both the '
  'task''s lms_hidden_at and its lms_suppressed_items row together — held apart '
  'they disagree, and either half alone produces an item that reappears or one '
  'that vanishes without being asked to.';

-- ─── The sync learns to leave the student's fields alone ────
-- Only the ON CONFLICT branch changes shape. A first import still takes every
-- value from Canvas, because there is nothing of the student's to protect yet.
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
  suppressed_count int := 0;
  received int := 0;
  on_file int := 0;
  suppressed text[];
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

  -- Loaded once. A per-item EXISTS would be one query per assignment for a
  -- list that is almost always empty.
  select coalesce(array_agg(external_id), array[]::text[]) into suppressed
  from public.lms_suppressed_items
  where connection_id = p_connection_id;

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

    -- The student hid this. Counted separately and NOT as `skipped`: skipped
    -- drives last_sync_status='partial' and writes "N items skipped because
    -- they had no usable due date", which would report a healthy connection as
    -- degraded for doing exactly what it was told.
    if external_assignment is not null and external_assignment = any(suppressed) then
      suppressed_count := suppressed_count + 1;
      continue;
    end if;

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
      due_on, due_clock
    )
    on conflict on constraint tasks_lms_external_unique do update set
      course_id = excluded.course_id,
      -- ── Fields the student may own ──────────────────────
      title = case when public.tasks.lms_field_overrides ? 'title'
                   then public.tasks.title else excluded.title end,
      description = case when public.tasks.lms_field_overrides ? 'description'
                   then public.tasks.description else excluded.description end,
      type = case when public.tasks.lms_field_overrides ? 'type'
                   then public.tasks.type else excluded.type end,
      -- Date and time move together or not at all: comparing them separately
      -- can keep a student's 9am against Canvas's date and produce an instant
      -- neither side ever meant.
      due_date = case
        when not (public.tasks.lms_field_overrides ?| array['due_date','due_time'])
          then excluded.due_date
        when (excluded.due_date + coalesce(excluded.due_time, '23:59'::time))
           < (public.tasks.due_date + coalesce(public.tasks.due_time, '23:59'::time))
          then excluded.due_date
        else public.tasks.due_date
      end,
      due_time = case
        when not (public.tasks.lms_field_overrides ?| array['due_date','due_time'])
          then excluded.due_time
        when (excluded.due_date + coalesce(excluded.due_time, '23:59'::time))
           < (public.tasks.due_date + coalesce(public.tasks.due_time, '23:59'::time))
          then excluded.due_time
        else public.tasks.due_time
      end,
      -- ── Fields Canvas always owns ───────────────────────
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
      lms_synced_due_date = excluded.lms_synced_due_date,
      lms_synced_due_time = excluded.lms_synced_due_time,
      -- Stamped whenever Canvas disagreed with a field the student owns —
      -- including the case where Canvas won on an earlier date, because that
      -- is precisely the change they most need to be told about.
      lms_conflict_at = case
        when public.tasks.lms_field_overrides = '{}'::jsonb then public.tasks.lms_conflict_at
        when (public.tasks.lms_field_overrides ? 'title'
              and excluded.title is distinct from public.tasks.title)
          or (public.tasks.lms_field_overrides ? 'description'
              and excluded.description is distinct from public.tasks.description)
          or (public.tasks.lms_field_overrides ? 'type'
              and excluded.type is distinct from public.tasks.type)
          or ((public.tasks.lms_field_overrides ?| array['due_date','due_time'])
              and (excluded.due_date is distinct from public.tasks.due_date
                   or excluded.due_time is distinct from public.tasks.due_time))
        then now()
        else public.tasks.lms_conflict_at
      end;
    processed := processed + 1;
  end loop;

  if coalesce(array_length(p_external_course_ids, 1), 0) > 0 then
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
      delete from public.tasks task
      where task.user_id = p_user_id
        and task.lms_connection_id = p_connection_id
        and task.lms_external_course_id = any(p_external_course_ids)
        and not task.is_completed
        and task.score is null
        and task.points_earned is null
        and (task.lms_synced_due_date is null or task.due_date is not distinct from task.lms_synced_due_date)
        and (task.lms_synced_due_time is null or task.due_time is not distinct from task.lms_synced_due_time)
        -- 120: a field they took ownership of is their work, same as a grade.
        and task.lms_field_overrides = '{}'::jsonb
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

  return jsonb_build_object('processed', processed, 'skipped', skipped, 'suppressed', suppressed_count);
end;
$function$;

revoke all on function public.apply_lms_assignment_sync_service(uuid, uuid, jsonb, text[]) from public, anon, authenticated;
grant execute on function public.apply_lms_assignment_sync_service(uuid, uuid, jsonb, text[]) to service_role;

-- ─── The Canvas removal path learns the same rule ───────────
-- Only the untouched test changes: a field the student owns makes the row
-- theirs, exactly as a grade or a subtask already did.
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

  select count(*) into on_file
  from public.tasks
  where user_id = p_user_id
    and lms_connection_id = p_connection_id
    and lms_removed_at is null
    and due_date between current_date - 25 and current_date + 360;

  if received = 0 and on_file > 0 then
    perform public.note_lms_removal_refused(p_connection_id, received, on_file, 'empty_feed');
    return 0;
  end if;

  if on_file >= 4 and received * 2 < on_file then
    perform public.note_lms_removal_refused(p_connection_id, received, on_file, 'short_feed');
    return 0;
  end if;

  delete from public.tasks
  where user_id = p_user_id
    and lms_connection_id = p_connection_id
    and due_date between current_date - 25 and current_date + 360
    and not (lms_external_id = any(coalesce(p_received_ids, array[]::text[])))
    and lms_removed_at is null
    and not is_completed
    and score is null
    and points_earned is null
    and (lms_synced_due_date is null or due_date is not distinct from lms_synced_due_date)
    and (lms_synced_due_time is null or due_time is not distinct from lms_synced_due_time)
    and lms_field_overrides = '{}'::jsonb
    and not exists (select 1 from public.task_subtasks s where s.task_id = tasks.id);
  get diagnostics removed = row_count;

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
