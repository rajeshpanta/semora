-- Completion, late-penalty, and GPA tracking.
--
-- A task's score remains the FINAL grade reported by the instructor. The
-- penalty is stored separately so Semora can explain the late-work impact
-- before the assignment is graded without deducting it twice afterward.

alter table public.tasks
  add column late_penalty_percent numeric;

alter table public.tasks
  add constraint tasks_late_penalty_percent_range
  check (
    late_penalty_percent is null
    or (late_penalty_percent >= 0 and late_penalty_percent <= 100)
  );

alter table public.courses
  add column credit_hours numeric not null default 3;

alter table public.courses
  add constraint courses_credit_hours_range
  check (credit_hours >= 0.5 and credit_hours <= 12);

-- Keep submission metadata internally consistent even when an older client
-- marks work incomplete or changes a late submission back to on-time.
create or replace function public.normalize_task_submission()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not new.is_completed then
    new.submitted_late := false;
    new.late_penalty_percent := null;
  elsif not new.submitted_late then
    new.late_penalty_percent := null;
  end if;

  return new;
end;
$$;

create trigger normalize_task_submission_trigger
  before insert or update of is_completed, submitted_late, late_penalty_percent
  on public.tasks
  for each row execute function public.normalize_task_submission();

comment on column public.tasks.late_penalty_percent is
  'Expected percentage-point deduction for late work; final instructor score is stored separately.';

comment on column public.courses.credit_hours is
  'Course credit hours used to weight the current semester GPA estimate.';
