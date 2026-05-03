-- Promote class meeting + office hours from inline columns on `courses`
-- to dedicated child tables. Each row represents one recurring time block,
-- which lets a course have multiple meetings (lecture MWF 10-11 + lab Tu
-- 2-4) and multiple office hours (Mon 10-11 + Wed 2-3).
--
-- Pre-launch cut: the legacy columns from migration 017 are dropped in
-- the same transaction after backfill. No deprecated_* shim — we have
-- one client and one backend, both updated atomically.
--
-- Tenant safety mirrors migration 015's pattern: each child carries a
-- denormalized user_id, RLS is `auth.uid() = user_id`, and a BEFORE
-- INSERT/UPDATE trigger asserts course_id resolves to the same user_id.

-- ─── course_meetings ────────────────────────────────────────────
-- One row per recurring meeting block. days_of_week is required and
-- non-empty here (unlike on the legacy courses column) because adding
-- a row implies "this class meets on these days." A course with no
-- fixed schedule simply has zero meeting rows.
create table public.course_meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  days_of_week smallint[] not null,
  start_time time,
  end_time time,
  -- Free-text + check constraint instead of a Postgres enum so adding
  -- new kinds later doesn't require an ALTER TYPE migration.
  kind text not null default 'lecture',
  location text,
  notes text,
  created_at timestamptz not null default now(),
  constraint course_meetings_days_range
    check (
      array_length(days_of_week, 1) > 0
      and days_of_week <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    ),
  constraint course_meetings_time_order
    check (start_time is null or end_time is null or start_time < end_time),
  constraint course_meetings_kind_allowed
    check (kind in ('lecture', 'lab', 'discussion', 'other'))
);
create index course_meetings_course_id_idx on public.course_meetings(course_id);

-- ─── course_office_hours ────────────────────────────────────────
-- Office hours are looser than class meetings: "by appointment" is a
-- valid state with no days/times set, so days_of_week is nullable.
create table public.course_office_hours (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  days_of_week smallint[],
  start_time time,
  end_time time,
  location text,
  notes text,
  created_at timestamptz not null default now(),
  constraint course_office_hours_days_range
    check (
      days_of_week is null
      or days_of_week <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    ),
  constraint course_office_hours_time_order
    check (start_time is null or end_time is null or start_time < end_time)
);
create index course_office_hours_course_id_idx on public.course_office_hours(course_id);

-- ─── RLS ────────────────────────────────────────────────────────
alter table public.course_meetings enable row level security;
alter table public.course_office_hours enable row level security;

create policy "own_course_meetings" on public.course_meetings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_course_office_hours" on public.course_office_hours
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── Cross-tenant FK protection ─────────────────────────────────
-- Reuses parent_row_user_id() from migration 015. Asserts that
-- course_meetings.course_id and course_office_hours.course_id resolve
-- to a course owned by the same user as the row being written.
create or replace function public.course_meetings_assert_parent_owner()
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
    raise exception 'Cross-tenant write blocked: course meeting cannot reference a course owned by another user'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists course_meetings_assert_parent_owner_trigger on public.course_meetings;
create trigger course_meetings_assert_parent_owner_trigger
  before insert or update of course_id, user_id on public.course_meetings
  for each row execute function public.course_meetings_assert_parent_owner();

create or replace function public.course_office_hours_assert_parent_owner()
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
    raise exception 'Cross-tenant write blocked: office hours cannot reference a course owned by another user'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists course_office_hours_assert_parent_owner_trigger on public.course_office_hours;
create trigger course_office_hours_assert_parent_owner_trigger
  before insert or update of course_id, user_id on public.course_office_hours
  for each row execute function public.course_office_hours_assert_parent_owner();

-- ─── Backfill ───────────────────────────────────────────────────
-- Copy any existing structured schedule from courses into course_meetings.
-- Only rows with a non-empty days array carry meaningful schedule info.
-- kind defaults to 'lecture' (no way to tell from legacy data).
insert into public.course_meetings (user_id, course_id, days_of_week, start_time, end_time)
select c.user_id, c.id, c.days_of_week, c.start_time, c.end_time
from public.courses c
where c.days_of_week is not null
  and array_length(c.days_of_week, 1) > 0;

-- ─── Drop legacy columns ────────────────────────────────────────
-- Pre-launch, single client. Backfill above handled the data; constraints
-- from migration 017 (courses_days_of_week_range, courses_time_order)
-- vanish with the columns.
alter table public.courses
  drop column days_of_week,
  drop column start_time,
  drop column end_time;
