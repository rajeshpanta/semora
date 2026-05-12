-- delete_user_account: also remove the user's uploaded syllabi from
-- storage.objects. The previous version (migration 008) deleted DB rows
-- only, leaving every PDF the user ever scanned in the syllabi bucket
-- indefinitely. Those files routinely contain student names, instructor
-- emails, and other PII — keeping them after the account is deleted
-- contradicts the in-app delete prompt and is a real compliance gap.
--
-- Path convention matches migration 012's storage RLS policies and
-- lib/syllabus.ts:130: `${user_id}/${timestamp}_${filename}`, so
-- (storage.foldername(name))[1] = uid::text identifies the owner.

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

  -- Storage objects first. The user's own RLS policies (migration 012)
  -- would let them issue this delete client-side, but doing it here
  -- guarantees the bucket is empty before the auth row goes away — a
  -- failed delete will roll back the whole transaction and leave the
  -- account intact rather than orphaning both rows and files.
  DELETE FROM storage.objects
   WHERE bucket_id = 'syllabi'
     AND (storage.foldername(name))[1] = uid::text;

  DELETE FROM tasks WHERE user_id = uid;
  DELETE FROM parse_runs WHERE user_id = uid;
  DELETE FROM syllabus_uploads WHERE user_id = uid;
  DELETE FROM courses WHERE user_id = uid;
  DELETE FROM semesters WHERE user_id = uid;
  DELETE FROM profiles WHERE id = uid;
  DELETE FROM auth.users WHERE id = uid;
END;
$$;
