-- Academic intelligence V2:
-- category-based grading, school GPA scales, planner conflict preferences,
-- quiet hours, and richer study-block reschedule metadata.

alter table public.profiles
  add column if not exists gpa_scale jsonb not null default
    '[{"letter":"A+","points":4},{"letter":"A","points":4},{"letter":"A-","points":3.7},{"letter":"B+","points":3.3},{"letter":"B","points":3},{"letter":"B-","points":2.7},{"letter":"C+","points":2.3},{"letter":"C","points":2},{"letter":"C-","points":1.7},{"letter":"D+","points":1.3},{"letter":"D","points":1},{"letter":"D-","points":0.7},{"letter":"F","points":0}]'::jsonb,
  add column if not exists quiet_hours_enabled boolean not null default false,
  add column if not exists quiet_hours_start time not null default '22:00',
  add column if not exists quiet_hours_end time not null default '08:00',
  add column if not exists study_auto_reschedule boolean not null default true,
  add column if not exists study_avoid_calendar_conflicts boolean not null default true;

alter table public.profiles
  add constraint profiles_gpa_scale_is_array
    check (jsonb_typeof(gpa_scale) = 'array');

alter table public.courses
  add column if not exists extra_credit_policy text not null default 'bonus';

alter table public.courses
  add constraint courses_extra_credit_policy_valid
    check (extra_credit_policy in ('bonus', 'category', 'ignore'));

create table public.grade_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  name text not null,
  weight_percent numeric not null,
  drop_lowest_count smallint not null default 0,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grade_categories_name_not_blank check (length(btrim(name)) > 0),
  constraint grade_categories_weight_range check (weight_percent > 0 and weight_percent <= 100),
  constraint grade_categories_drop_range check (drop_lowest_count between 0 and 20),
  unique (course_id, name)
);

create index grade_categories_course_position_idx
  on public.grade_categories (course_id, position, created_at);
create index grade_categories_user_idx
  on public.grade_categories (user_id);

alter table public.grade_categories enable row level security;
create policy "own_grade_categories" on public.grade_categories
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.grade_categories_assert_parent_owner()
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
    raise exception 'Referenced course does not exist' using errcode = '23503';
  end if;
  if parent_user <> new.user_id then
    raise exception 'Cross-tenant write blocked: grade category cannot reference another user''s course'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger grade_categories_assert_parent_owner_trigger
  before insert or update of course_id, user_id on public.grade_categories
  for each row execute function public.grade_categories_assert_parent_owner();

create or replace function public.grade_categories_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger grade_categories_set_updated_at_trigger
  before update on public.grade_categories
  for each row execute function public.grade_categories_set_updated_at();

alter table public.tasks
  add column if not exists grade_category_id uuid
    references public.grade_categories(id) on delete set null;

create index tasks_grade_category_idx on public.tasks (grade_category_id);

create or replace function public.tasks_assert_grade_category_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  category_user uuid;
  category_course uuid;
begin
  if new.grade_category_id is null then
    return new;
  end if;
  select user_id, course_id into category_user, category_course
  from public.grade_categories
  where id = new.grade_category_id;
  if category_user is null then
    raise exception 'Referenced grade category does not exist' using errcode = '23503';
  end if;
  if category_user <> new.user_id or category_course <> new.course_id then
    raise exception 'Grade category must belong to the same user and course'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger tasks_assert_grade_category_owner_trigger
  before insert or update of grade_category_id, course_id, user_id on public.tasks
  for each row execute function public.tasks_assert_grade_category_owner();

alter table public.study_blocks
  add column if not exists reschedule_reason text,
  add column if not exists rescheduled_from_date date;

alter table public.study_blocks
  add constraint study_blocks_reschedule_reason_valid
    check (reschedule_reason is null or reschedule_reason in ('missed', 'conflict', 'rebuild'));

comment on table public.grade_categories is
  'SEMORA: per-course grading categories, weights, and dropped-lowest rules.';
comment on column public.courses.extra_credit_policy is
  'How extra-credit tasks affect the course grade: bonus, category, or ignore.';
comment on column public.profiles.gpa_scale is
  'School-specific letter-to-grade-point mapping used for GPA estimates.';
comment on column public.study_blocks.reschedule_reason is
  'Why an automatically regenerated study block moved.';

-- Recurring tasks retain their category, and series-wide edits may change it.
create or replace function public.spawn_next_recurring_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_due date;
  next_start date;
  next_task_id uuid;
  next_month_start date;
  next_month_end date;
  anchor_day integer;
begin
  if not (new.is_completed and not old.is_completed and new.recurrence_frequency is not null) then
    return new;
  end if;
  if new.recurrence_frequency = 'monthly' then
    next_month_start := (date_trunc('month', new.due_date) + interval '1 month')::date;
    next_month_end := (date_trunc('month', new.due_date) + interval '2 months' - interval '1 day')::date;
    anchor_day := coalesce(new.recurrence_anchor_day, extract(day from new.due_date)::integer);
    next_due := case
      when coalesce(new.recurrence_anchor_is_month_end, false) then next_month_end
      else make_date(
        extract(year from next_month_start)::integer,
        extract(month from next_month_start)::integer,
        least(anchor_day, extract(day from next_month_end)::integer)
      )
    end;
  else
    next_due := case new.recurrence_frequency
      when 'daily' then new.due_date + 1
      when 'weekly' then new.due_date + 7
      when 'biweekly' then new.due_date + 14
    end;
  end if;
  if new.recurrence_end_date is not null and next_due > new.recurrence_end_date then
    return new;
  end if;
  next_start := case
    when new.start_date is null then null
    else new.start_date + (next_due - new.due_date)
  end;

  insert into public.tasks (
    user_id, course_id, title, description, type, due_date, due_time, weight,
    is_extra_credit, source, priority, start_date, recurrence_frequency,
    recurrence_end_date, recurrence_series_id, reminder_offsets_minutes,
    recurrence_anchor_day, recurrence_anchor_is_month_end, estimated_minutes,
    grade_category_id
  ) values (
    new.user_id, new.course_id, new.title, new.description, new.type, next_due,
    new.due_time, new.weight, new.is_extra_credit, 'manual', new.priority,
    next_start, new.recurrence_frequency, new.recurrence_end_date,
    coalesce(new.recurrence_series_id, new.id), new.reminder_offsets_minutes,
    new.recurrence_anchor_day, new.recurrence_anchor_is_month_end,
    new.estimated_minutes, new.grade_category_id
  )
  on conflict (user_id, recurrence_series_id, due_date)
    where recurrence_series_id is not null do nothing
  returning id into next_task_id;

  if next_task_id is not null then
    insert into public.task_subtasks (user_id, task_id, title, position)
    select new.user_id, next_task_id, title, position
    from public.task_subtasks
    where task_id = new.id
    order by position, created_at;
  end if;
  return new;
end;
$$;

do $extend_category_series_edit$
declare
  function_definition text;
  priority_assignment text :=
    'priority = case when p_patch ? ''priority'' then p_patch ->> ''priority'' else task.priority end,';
begin
  select pg_get_functiondef(
    'public.update_recurring_task_series(uuid,text,jsonb)'::regprocedure
  ) into function_definition;
  if position('grade_category_id = case' in function_definition) = 0 then
    function_definition := replace(
      function_definition,
      priority_assignment,
      priority_assignment || E'\n    grade_category_id = case\n'
        || '      when p_patch ? ''grade_category_id'' and p_patch -> ''grade_category_id'' <> ''null''::jsonb' || E'\n'
        || '        then (p_patch ->> ''grade_category_id'')::uuid' || E'\n'
        || '      when p_patch ? ''grade_category_id'' then null else task.grade_category_id end,'
    );
  end if;
  if position('grade_category_id = case' in function_definition) = 0 then
    raise exception 'Could not extend recurring series edits with grade_category_id';
  end if;
  execute function_definition;
end;
$extend_category_series_edit$;

-- V2 replacement keeps optional move metadata for delivery/status surfaces.
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
begin
  if not exists (
    select 1 from public.semesters where id = p_semester_id and user_id = auth.uid()
  ) then
    raise exception 'Semester not found';
  end if;
  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then
    raise exception 'Study blocks must be a JSON array';
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
    if item_duration < 15 or item_duration > 180 then
      raise exception 'Invalid study-block duration';
    end if;
    if not exists (
      select 1 from public.tasks as task
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
      reschedule_reason, rescheduled_from_date
    ) values (
      auth.uid(), item_task_id, item_date, item_time, item_duration,
      nullif(item ->> 'reschedule_reason', ''),
      nullif(item ->> 'rescheduled_from_date', '')::date
    );
  end loop;

  return query
  select block.*
  from public.study_blocks as block
  join public.tasks as task on task.id = block.task_id
  join public.courses as course on course.id = task.course_id
  where block.user_id = auth.uid() and course.semester_id = p_semester_id
  order by block.scheduled_date, block.start_time;
end;
$$;
