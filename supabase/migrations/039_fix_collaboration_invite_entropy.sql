-- pgcrypto lives in Supabase's `extensions` schema, while the collaboration
-- RPC intentionally uses a locked-down search_path.
create or replace function public.create_course_collaboration_invite(p_collaboration_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invite_token text;
begin
  if public.semora_collaboration_role(p_collaboration_id) not in ('owner', 'editor') then
    raise exception 'Only editors can invite classmates' using errcode = '42501';
  end if;
  invite_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.course_collaboration_invites(collaboration_id, created_by, token)
  values(p_collaboration_id, auth.uid(), invite_token);
  return invite_token;
end;
$$;

revoke all on function public.create_course_collaboration_invite(uuid) from public, anon;
grant execute on function public.create_course_collaboration_invite(uuid) to authenticated;
