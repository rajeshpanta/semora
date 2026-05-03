-- Drop the legacy free-text class meeting + office hours columns from
-- `courses`. Migration 018 introduced `course_meetings` and
-- `course_office_hours` child tables that hold the structured equivalent;
-- the Today tab and detail screen both source from those now.
--
-- Pre-launch cut: no shim, no deprecation period. Editing in two
-- places (free-text + structured) was confusing users; the structured
-- editor is the single source of truth going forward.
--
-- Note: callers wanting to record room / format / "or by appointment"
-- nuance now use the per-row `location` and `notes` columns on the
-- child tables instead.

alter table public.courses drop column if exists meeting_time;
alter table public.courses drop column if exists office_hours;
