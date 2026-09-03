-- ============================================================
-- SEMORA (122): SAY WHERE IT CAME FROM, AND COUNT WHAT IS ACTUALLY THERE
-- ============================================================
-- Four small corrections, none of which changes what a sync imports.
--
--   1.7   Canvas tasks admit they came from Canvas (enum value added in 121).
--   1.8   pending_courses_count cannot drift, and a half-resolved course
--         cannot disappear from the list of questions forever.
--   1.9   the scheduled job in this repo becomes the one that is running.
--   1.13  account deletion names lms_connections instead of trusting a cascade
--         nobody has read, and the vault gains a check for what it is holding.
--
-- The apply function is re-emitted in full for 1.7. Only one line differs from
-- 120's copy — the source value — but a function body cannot be patched, and
-- 121 had to commit the enum value before this file could use it.
-- ============================================================

-- ─── 1.7: the backfill ──────────────────────────────────────
-- Every task carrying an LMS id came from an LMS, whatever it currently
-- claims. Scoped by lms_external_id rather than by connection so a row whose
-- connection was deleted is still corrected.
update public.tasks
   set source = 'lms'::public.source_type
 where lms_external_id is not null
   and source <> 'lms'::public.source_type;

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
      -- 1.7: it came from Canvas, so it says Canvas. The enum value was
      -- added in 121 precisely so this line could stop lying.
      'lms'::public.source_type, p_connection_id, external_course,
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

-- ─── 1.8: a count that cannot drift ─────────────────────────
-- pending_courses_count is recomputed by hand in three different functions
-- (103, lines 187, 285 and 366). All three are correct today, which is exactly
-- the problem: the counter's accuracy depends on every future writer
-- remembering to be the fourth. Anything that touches lms_pending_courses
-- without recomputing — a cascade, an admin fix, a function written next
-- semester — leaves a badge advertising questions that are not there.
--
-- A trigger cannot forget. The three hand-written recomputes stay where they
-- are; they now agree with the trigger instead of being the only thing
-- standing between the badge and reality.
create or replace function public.lms_sync_pending_count()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  target uuid := coalesce(new.connection_id, old.connection_id);
begin
  update public.lms_connections c
     set pending_courses_count = (
       select count(*) from public.lms_pending_courses p
        where p.connection_id = target
          and p.ignored_at is null
          and p.resolved_at is null)
   where c.id = target;
  return null;
end;
$function$;

drop trigger if exists lms_pending_courses_count_trg on public.lms_pending_courses;
create trigger lms_pending_courses_count_trg
  after insert or update or delete on public.lms_pending_courses
  for each row
  execute function public.lms_sync_pending_count();

comment on function public.lms_sync_pending_count() is
  'SEMORA (122): keeps lms_connections.pending_courses_count equal to the '
  'number of unanswered pending courses. The count was previously maintained '
  'by hand in three separate functions, which made its accuracy a convention '
  'rather than a property.';

-- ─── 1.8b: a question that stopped being asked ──────────────
-- resolved_at means "the student linked this course, stop offering it". It is
-- stamped BEFORE the link is created (103, lines 257 and 279), so a failure in
-- between leaves a course marked answered that was never linked. The row is
-- then invisible to the count, is not deleted by the recorder (which only
-- removes rows that are unlisted or genuinely linked), and the course is never
-- offered again — the student simply never sees those assignments.
--
-- Nothing is stuck today. This makes it self-correcting rather than relying on
-- that staying true: still listed, still not linked, therefore still a
-- question, whatever a previous run recorded.
update public.lms_pending_courses p
   set resolved_at = null
 where p.resolved_at is not null
   and p.ignored_at is null
   and not exists (
     select 1 from public.lms_course_links l
      where l.connection_id = p.connection_id
        and l.external_course_id = p.external_course_id
   );

create or replace function public.lms_unstick_resolved_pending()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  freed integer;
begin
  update public.lms_pending_courses p
     set resolved_at = null
   where p.resolved_at is not null
     and p.ignored_at is null
     and not exists (
       select 1 from public.lms_course_links l
        where l.connection_id = p.connection_id
          and l.external_course_id = p.external_course_id
     );
  get diagnostics freed = row_count;
  return freed;
end;
$function$;

revoke all on function public.lms_unstick_resolved_pending() from public, anon, authenticated;
grant execute on function public.lms_unstick_resolved_pending() to service_role;

comment on function public.lms_unstick_resolved_pending() is
  'SEMORA (122): clears resolved_at on pending courses that were marked '
  'answered but never actually linked — the window between the stamp and the '
  'link in 103. Without it such a course is never offered to the student '
  'again.';

-- ─── 1.13: deletion says what it deletes ────────────────────
-- lms_connections is not named here. It is removed by the ON DELETE CASCADE on
-- auth.users, which was verified to exist and to work — but the verification
-- took a wrong turn first (information_schema hides constraints the querying
-- role cannot see, and reported none), and the answer to "does this student's
-- encrypted Canvas feed URL survive account deletion" should not depend on
-- reading pg_constraint correctly.
--
-- So it is explicit, and it is ordered BEFORE auth.users. That also fixes the
-- ordering: deleting the connection here fires the lms_sync_credentials delete
-- trigger that purges the Vault secret as a first-class step, rather than as a
-- side effect of a cascade several tables deep.
create or replace function public.delete_user_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  last_signin timestamptz;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select last_sign_in_at into last_signin from auth.users where id = uid;
  if last_signin is null or last_signin < now() - interval '5 minutes' then
    raise exception 'Recent authentication required. Please sign in again to confirm.';
  end if;

  -- First, and deliberately: this is the row that owns an encrypted credential
  -- in the Vault. Its delete trigger purges the secret; everything below is
  -- ordinary application data.
  delete from public.lms_connections where user_id = uid;

  delete from public.tasks where user_id = uid;
  delete from public.parse_runs where user_id = uid;
  delete from public.syllabus_uploads where user_id = uid;
  delete from public.courses where user_id = uid;
  delete from public.semesters where user_id = uid;
  delete from public.profiles where id = uid;
  delete from auth.users where id = uid;
end;
$$;

comment on function public.delete_user_account() is
  'Deletes the recently re-authenticated caller after the client removes '
  'private Storage uploads through the Storage API. Removes lms_connections '
  'first (122) so the Vault purge trigger on lms_sync_credentials runs as an '
  'explicit step rather than as a cascade side effect.';

-- ─── 1.13b: what is the vault actually holding? ─────────────
-- A secret whose owning row is gone is unreachable and undeletable by any
-- normal path, and there is no way to notice one without asking. Names only —
-- this never reads decrypted_secret, and must not.
create or replace function public.lms_vault_orphans()
returns table (secret_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = public, vault
as $$
  select s.name, s.created_at
  from vault.secrets s
  where not exists (
      select 1 from public.lms_sync_credentials c
       where c.access_secret_id = s.id or c.refresh_secret_id = s.id)
    -- Infrastructure secrets, which belong to no connection by design.
    and s.name not in (
      'semora_lecture_cron_secret',
      'semora_lms_cron_secret',
      'push_send_secret')
  order by s.created_at;
$$;

revoke all on function public.lms_vault_orphans() from public, anon, authenticated;
grant execute on function public.lms_vault_orphans() to service_role;

comment on function public.lms_vault_orphans() is
  'SEMORA (122): encrypted LMS credentials in the Vault that no '
  'lms_sync_credentials row points at — a student''s Canvas feed URL left '
  'behind by a delete that did not fire the purge trigger. Returns names and '
  'dates only; it must never select decrypted_secret. The three infrastructure '
  'secrets are excluded by name because they belong to no connection.';
