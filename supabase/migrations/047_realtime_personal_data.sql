-- Enables Supabase Realtime for personal data (tasks, courses, semesters) so
-- edits on one device (e.g. web) reflect on others (e.g. the iPhone app)
-- within seconds instead of waiting on the next poll/focus refetch.
--
-- REPLICA IDENTITY FULL is required, not cosmetic: the client subscribes
-- filtered by `user_id=eq.<uid>`, which is not the primary key, and Postgres's
-- default replica identity only includes the primary key in a DELETE's old-row
-- image. Without FULL, delete events would be silently dropped by Realtime's
-- server-side filter — a task deleted on one device would never tell other
-- devices it's gone. These are low-churn, per-user tables, so the extra WAL
-- volume from full old-row images is negligible.
alter table public.tasks replica identity full;
alter table public.courses replica identity full;
alter table public.semesters replica identity full;

-- Live updates are scoped by RLS on the subscribed rows (same pattern as the
-- collaboration tables in 037_connected_learning_platform.sql).
do $$
begin
  alter publication supabase_realtime add table public.tasks;
exception when duplicate_object or undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.courses;
exception when duplicate_object or undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.semesters;
exception when duplicate_object or undefined_object then null;
end $$;
