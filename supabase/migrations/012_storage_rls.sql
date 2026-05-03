-- ============================================================
-- STORAGE: lock down syllabi bucket
-- ============================================================
-- The bucket was created with public = true and zero RLS
-- policies on storage.objects. That meant:
--   1. Anyone with a file URL could download the syllabus
--      (public bucket = no auth required for reads)
--   2. Any authenticated user could potentially list/read files
--      across user folders (no RLS = no row-level scoping)
--
-- Syllabi can include student names, contact info, professor
-- emails, course schedules — treat as PII.
--
-- Path convention is `${user_id}/${timestamp}_${filename}` so
-- foldername(name)[1] gives the owner's user_id.
-- ============================================================

-- Make the bucket private. Existing uploads (none at time of migration)
-- become accessible only via authenticated requests respecting RLS.
update storage.buckets set public = false where id = 'syllabi';

-- Per-user policies. Each statement scopes to the syllabi bucket
-- AND requires the path's first folder to equal the caller's uid.

drop policy if exists "Users read own syllabi" on storage.objects;
create policy "Users read own syllabi"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'syllabi'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users insert own syllabi" on storage.objects;
create policy "Users insert own syllabi"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'syllabi'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users update own syllabi" on storage.objects;
create policy "Users update own syllabi"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'syllabi'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'syllabi'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete own syllabi" on storage.objects;
create policy "Users delete own syllabi"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'syllabi'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
