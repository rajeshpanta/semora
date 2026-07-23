-- Supabase Storage now rejects direct writes to storage.objects, including
-- from SECURITY DEFINER functions. Uploaded files are deleted through the
-- authenticated Storage API immediately before this RPC is called; this
-- function owns the relational/auth deletion only.

create or replace function public.delete_user_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  last_signin timestamptz;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select last_sign_in_at into last_signin from auth.users where id = uid;
  if last_signin is null or last_signin < now() - interval '5 minutes' then
    raise exception 'Recent authentication required. Please sign in again to confirm.';
  end if;

  delete from public.tasks where user_id = uid;
  delete from public.parse_runs where user_id = uid;
  delete from public.syllabus_uploads where user_id = uid;
  delete from public.courses where user_id = uid;
  delete from public.semesters where user_id = uid;
  delete from public.profiles where id = uid;
  delete from auth.users where id = uid;
end;
$$;

comment on function public.delete_user_account() is
  'Deletes the recently re-authenticated caller after the client removes private Storage uploads through the Storage API.';
