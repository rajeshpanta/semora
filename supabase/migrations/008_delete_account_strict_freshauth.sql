-- Tighten the fresh-auth check on delete_user_account.
--
-- The previous version checked auth.jwt() ->> 'iat', but that timestamp updates
-- on every access-token refresh (which happens automatically every ~50 minutes
-- while the app is active). An idle attacker who picked up an unlocked phone
-- could trigger a refresh just by opening the app, satisfying the check.
--
-- Switch to auth.users.last_sign_in_at, which is updated only on actual sign-in
-- events (signInWithPassword, magic link, OAuth), not on token refresh.
-- The client must call signInWithPassword right before invoking this RPC.

CREATE OR REPLACE FUNCTION delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid uuid := auth.uid();
  last_signin timestamptz;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT last_sign_in_at INTO last_signin FROM auth.users WHERE id = uid;
  IF last_signin IS NULL OR last_signin < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'Recent authentication required. Please sign in again to confirm.';
  END IF;

  DELETE FROM tasks WHERE user_id = uid;
  DELETE FROM parse_runs WHERE user_id = uid;
  DELETE FROM syllabus_uploads WHERE user_id = uid;
  DELETE FROM courses WHERE user_id = uid;
  DELETE FROM semesters WHERE user_id = uid;
  DELETE FROM profiles WHERE id = uid;
  DELETE FROM auth.users WHERE id = uid;
END;
$$;
