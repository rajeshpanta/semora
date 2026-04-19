-- Function to delete a user's account and all associated data
-- Called via supabase.rpc('delete_user_account') from the client
CREATE OR REPLACE FUNCTION delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Delete in order respecting foreign keys
  DELETE FROM parse_runs WHERE user_id = uid;
  DELETE FROM syllabus_uploads WHERE user_id = uid;
  DELETE FROM tasks WHERE user_id = uid;
  DELETE FROM courses WHERE user_id = uid;
  DELETE FROM semesters WHERE user_id = uid;
  DELETE FROM profiles WHERE id = uid;

  -- Delete the auth user (requires service role, handled by SECURITY DEFINER)
  DELETE FROM auth.users WHERE id = uid;
END;
$$;
