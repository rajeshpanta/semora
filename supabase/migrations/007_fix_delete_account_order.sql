-- Two related fixes for account deletion:
--
-- 1. tasks.parse_run_id had no ON DELETE clause, so deleting a parse_run is blocked
--    by tasks that reference it. The parse_run pointer is just metadata about which
--    AI run created a task — losing it is harmless. Switch to ON DELETE SET NULL.
--
-- 2. delete_user_account deleted parse_runs before tasks, hitting the FK above.
--    Reorder the deletes from leaves toward roots so FKs are always satisfied.

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_parse_run_id_fkey;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_parse_run_id_fkey
    FOREIGN KEY (parse_run_id)
    REFERENCES public.parse_runs(id)
    ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid uuid := auth.uid();
  jwt_iat bigint;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  jwt_iat := (auth.jwt() ->> 'iat')::bigint;
  IF jwt_iat IS NULL OR jwt_iat < extract(epoch from now())::bigint - 300 THEN
    RAISE EXCEPTION 'Recent authentication required. Please sign in again to confirm.';
  END IF;

  -- Order: tasks → parse_runs → syllabus_uploads → courses → semesters → profiles → auth.users.
  -- tasks reference parse_runs; parse_runs reference syllabus_uploads and courses.
  DELETE FROM tasks WHERE user_id = uid;
  DELETE FROM parse_runs WHERE user_id = uid;
  DELETE FROM syllabus_uploads WHERE user_id = uid;
  DELETE FROM courses WHERE user_id = uid;
  DELETE FROM semesters WHERE user_id = uid;
  DELETE FROM profiles WHERE id = uid;
  DELETE FROM auth.users WHERE id = uid;
END;
$$;
