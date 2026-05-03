-- Structured class meeting schedule on courses.
--
-- The existing meeting_time text column stays as Gemini's parking lot
-- (free-text from the syllabus, e.g. "MWF 10:00-11:00am") and as a
-- fallback display when structured fields aren't populated. These new
-- columns let the Today tab answer "is this class meeting today?"
-- deterministically, without trying to NLP-parse the text field.
--
-- Convention:
--   days_of_week — JS Date.getDay() values: 0=Sunday, 1=Monday, ..., 6=Saturday.
--                  Empty array (or null) means "no schedule set".
--                  Lectures + labs that meet on different days share a row;
--                  if a course has truly distinct sections (lecture MWF +
--                  lab Tu), the user adds them as two course rows in v1.
--   start_time / end_time — local wall-clock time (no timezone). Stored
--                  in the user's local time as displayed; the app does not
--                  shift these on travel.

alter table public.courses
  add column if not exists days_of_week smallint[],
  add column if not exists start_time time,
  add column if not exists end_time time;

-- Cheap sanity guards. UI prevents bad input but the DB shouldn't trust it.
-- `<@` means "every element of the left array is contained in the right".
-- Empty array passes (treated same as null = "no schedule").
alter table public.courses
  add constraint courses_days_of_week_range
    check (
      days_of_week is null
      or days_of_week <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    );

alter table public.courses
  add constraint courses_time_order
    check (start_time is null or end_time is null or start_time < end_time);
