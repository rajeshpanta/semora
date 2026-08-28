-- Optional reminders before recurring class meetings.
--
-- One nullable column, because there is nowhere existing to put it: the three
-- reminder_* booleans are a fixed tri-state, gpa_scale is the only jsonb and is
-- semantically dedicated, and courses has no equivalent. Null means off, which
-- is what every existing row gets and what an older client — which never reads
-- this column — behaves as.
--
-- Minutes rather than a preset enum so the stored value is the same shape as
-- tasks.reminder_offsets_minutes: one unit for "how long before", used by the
-- same scheduler.
--
-- The upper bound is a day. A class reminder further ahead than that is a
-- calendar, not a reminder, and the recurring trigger it would need has no way
-- to say "the day before, unless that is a holiday".
alter table public.profiles
  add column if not exists class_reminder_minutes smallint;

alter table public.profiles
  add constraint profiles_class_reminder_minutes_range check (
    class_reminder_minutes is null
    or (class_reminder_minutes >= 0 and class_reminder_minutes <= 1440)
  );

comment on column public.profiles.class_reminder_minutes is
  'Minutes before a class meeting to send a reminder; null disables class reminders entirely.';
