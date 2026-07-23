-- A "this task only" edit that turns recurrence off must detach that row
-- from its old series. Otherwise later edits still treat it as a member of
-- the series even though it can no longer create another occurrence.

create or replace function public.prepare_task_recurrence()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.recurrence_frequency is null then
    new.recurrence_series_id := null;
    new.recurrence_anchor_day := null;
    new.recurrence_anchor_is_month_end := null;
    return new;
  end if;

  if new.recurrence_series_id is null then
    new.recurrence_series_id := new.id;
  end if;

  if new.recurrence_frequency = 'monthly' then
    if new.recurrence_anchor_day is null then
      new.recurrence_anchor_day := extract(day from new.due_date)::smallint;
    end if;
    if new.recurrence_anchor_is_month_end is null then
      new.recurrence_anchor_is_month_end := new.due_date =
        (date_trunc('month', new.due_date) + interval '1 month' - interval '1 day')::date;
    end if;
  else
    new.recurrence_anchor_day := null;
    new.recurrence_anchor_is_month_end := null;
  end if;

  return new;
end;
$$;

update public.tasks
set
  recurrence_series_id = null,
  recurrence_anchor_day = null,
  recurrence_anchor_is_month_end = null
where recurrence_frequency is null
  and (
    recurrence_series_id is not null
    or recurrence_anchor_day is not null
    or recurrence_anchor_is_month_end is not null
  );
