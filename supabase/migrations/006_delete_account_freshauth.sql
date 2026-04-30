-- Replace delete_user_account with a version that requires recent authentication
-- (JWT issued within the last 5 minutes) and sets search_path explicitly.
-- The client must call signInWithPassword right before invoking this RPC.

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

  DELETE FROM parse_runs WHERE user_id = uid;
  DELETE FROM syllabus_uploads WHERE user_id = uid;
  DELETE FROM tasks WHERE user_id = uid;
  DELETE FROM courses WHERE user_id = uid;
  DELETE FROM semesters WHERE user_id = uid;
  DELETE FROM profiles WHERE id = uid;
  DELETE FROM auth.users WHERE id = uid;
END;
$$;
