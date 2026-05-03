-- ============================================================
-- CROSS-TENANT FK PROTECTION
-- ============================================================
-- Audit finding CR-1.
--
-- RLS on courses/tasks/syllabus_uploads/parse_runs only checks
-- `auth.uid() = user_id` for the row being written. The foreign-key
-- constraints only verify the referenced row EXISTS — they do NOT
-- verify ownership. This means user A can insert a row with their
-- own user_id but with a foreign key pointing to user B's data:
--
--   insert into courses (user_id=A, semester_id=B's_semester, ...)
--
-- The row passes RLS (user_id matches auth.uid()), the FK passes
-- (B's semester exists), and from then on UI joins by semester_id
-- expose A's course under B's semester (and vice versa: B's
-- semester listings start showing A's content).
--
-- Fix: BEFORE INSERT/UPDATE triggers that look up the parent row's
-- user_id and reject if it doesn't match new.user_id. Triggers run
-- as SECURITY DEFINER because the parent row may be invisible to
-- the caller under their own RLS view, and we want to assert
-- ownership regardless of what they can see.
--
-- The triggers fire on:
--   * INSERT — every new row's FKs are validated
--   * UPDATE OF (fk_column) — moving a row to a different parent
--   * UPDATE OF user_id — re-attributing a row to another user
--     (defense in depth; RLS already blocks this)
--
-- Nullable FKs (parse_run_id, parse_runs.upload_id, parse_runs.course_id)
-- are skipped when null.
-- ============================================================

-- ─── Generic helper ──────────────────────────────────────────
-- Returns the user_id of a row in the given table, or null if
-- the row doesn't exist. EXECUTE rather than separate functions
-- per table to keep this DRY; the table name is a regclass so
-- callers can't pass arbitrary SQL.
create or replace function public.parent_row_user_id(
  parent_table regclass,
  parent_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  result uuid;
begin
  if parent_id is null then
    return null;
  end if;
  execute format('select user_id from %s where id = $1', parent_table)
    into result
    using parent_id;
  return result;
end;
$$;

revoke all on function public.parent_row_user_id(regclass, uuid) from public, anon, authenticated;

-- ─── courses.semester_id → semesters.user_id ─────────────────
create or replace function public.courses_assert_parent_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  parent_user uuid;
begin
  parent_user := public.parent_row_user_id('public.semesters'::regclass, new.semester_id);
  if parent_user is null then
    raise exception 'Referenced semester does not exist'
      using errcode = '23503';
  end if;
  if parent_user <> new.user_id then
    raise exception 'Cross-tenant write blocked: course cannot reference a semester owned by another user'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists courses_assert_parent_owner_trigger on public.courses;
create trigger courses_assert_parent_owner_trigger
  before insert or update of semester_id, user_id on public.courses
  for each row execute function public.courses_assert_parent_owner();

-- ─── tasks.course_id → courses.user_id ───────────────────────
-- (Indirectly enforces semester ownership too, since courses
-- already checks its own parent.)
create or replace function public.tasks_assert_parent_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  parent_user uuid;
begin
  parent_user := public.parent_row_user_id('public.courses'::regclass, new.course_id);
  if parent_user is null then
    raise exception 'Referenced course does not exist'
      using errcode = '23503';
  end if;
  if parent_user <> new.user_id then
    raise exception 'Cross-tenant write blocked: task cannot reference a course owned by another user'
      using errcode = '42501';
  end if;

  -- Optional FK: parse_run_id
  if new.parse_run_id is not null then
    parent_user := public.parent_row_user_id('public.parse_runs'::regclass, new.parse_run_id);
    if parent_user is null then
      raise exception 'Referenced parse run does not exist'
        using errcode = '23503';
    end if;
    if parent_user <> new.user_id then
      raise exception 'Cross-tenant write blocked: task cannot reference a parse run owned by another user'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_assert_parent_owner_trigger on public.tasks;
create trigger tasks_assert_parent_owner_trigger
  before insert or update of course_id, parse_run_id, user_id on public.tasks
  for each row execute function public.tasks_assert_parent_owner();

-- ─── syllabus_uploads.course_id → courses.user_id ────────────
create or replace function public.syllabus_uploads_assert_parent_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  parent_user uuid;
begin
  parent_user := public.parent_row_user_id('public.courses'::regclass, new.course_id);
  if parent_user is null then
    raise exception 'Referenced course does not exist'
      using errcode = '23503';
  end if;
  if parent_user <> new.user_id then
    raise exception 'Cross-tenant write blocked: syllabus upload cannot reference a course owned by another user'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists syllabus_uploads_assert_parent_owner_trigger on public.syllabus_uploads;
create trigger syllabus_uploads_assert_parent_owner_trigger
  before insert or update of course_id, user_id on public.syllabus_uploads
  for each row execute function public.syllabus_uploads_assert_parent_owner();

-- ─── parse_runs.upload_id → syllabus_uploads.user_id ─────────
-- ─── parse_runs.course_id → courses.user_id ──────────────────
create or replace function public.parse_runs_assert_parent_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  parent_user uuid;
begin
  if new.upload_id is not null then
    parent_user := public.parent_row_user_id('public.syllabus_uploads'::regclass, new.upload_id);
    if parent_user is null then
      raise exception 'Referenced upload does not exist'
        using errcode = '23503';
    end if;
    if parent_user <> new.user_id then
      raise exception 'Cross-tenant write blocked: parse run cannot reference an upload owned by another user'
        using errcode = '42501';
    end if;
  end if;

  if new.course_id is not null then
    parent_user := public.parent_row_user_id('public.courses'::regclass, new.course_id);
    if parent_user is null then
      raise exception 'Referenced course does not exist'
        using errcode = '23503';
    end if;
    if parent_user <> new.user_id then
      raise exception 'Cross-tenant write blocked: parse run cannot reference a course owned by another user'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists parse_runs_assert_parent_owner_trigger on public.parse_runs;
create trigger parse_runs_assert_parent_owner_trigger
  before insert or update of upload_id, course_id, user_id on public.parse_runs
  for each row execute function public.parse_runs_assert_parent_owner();
