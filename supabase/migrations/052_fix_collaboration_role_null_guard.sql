-- ============================================================
-- SEMORA — CLOSE A LIVE AUTH BYPASS IN COURSE-SPACE MANAGEMENT
-- ============================================================
-- SEVERITY: HIGH. Any authenticated user who knew a course space's UUID could
-- delete it, remove its members, change their roles, mint invites, or archive
-- it — without being a member of that space at all.
--
-- CAUSE: `semora_collaboration_role()` returns NULL for a non-member, and in
-- SQL a comparison against NULL yields NULL, not TRUE. So a guard written as
--
--     if public.semora_collaboration_role(p_collaboration_id) <> 'owner' then
--       raise exception ...
--
-- never fires for a non-member: `NULL <> 'owner'` is NULL, the IF is not
-- taken, and execution falls straight through to the privileged work. The
-- guard reads correctly and does the opposite of what it looks like.
--
-- PROVEN, not theorised. Against production in a rolled-back transaction, a
-- user with no membership row called delete_group() on another user's space:
--
--     attacker role in space      -> {"role": null}
--     delete_group by NON-MEMBER  -> {"blocked": false, "note": "SUCCEEDED"}
--     victim space still active?  -> {"exists": false}
--
-- FIX: coalesce the role to '' before comparing, so a non-member compares as a
-- real value and the guard fires. Same fix already applied to
-- publish_deck_to_collaboration in migration 051.
--
-- These bodies are the LIVE definitions read back with pg_get_functiondef()
-- and patched at the guard only — nothing else about them is changed, so this
-- cannot silently revert unrelated behaviour from 039/042.
--
-- Affected (all six): archive_group, create_course_collaboration_invite,
-- delete_group, remove_member, revoke_invite, set_member_role.
-- ============================================================

CREATE OR REPLACE FUNCTION public.archive_group(p_collaboration_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if coalesce(public.semora_collaboration_role(p_collaboration_id), '') <> 'owner' then
    raise exception 'Only the space owner can archive this space' using errcode = '42501';
  end if;
  update public.course_collaborations
  set is_active = false
  where id = p_collaboration_id;
  -- Stop any further joins on outstanding links once archived.
  update public.course_collaboration_invites
  set revoked = true
  where collaboration_id = p_collaboration_id and not revoked;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_course_collaboration_invite(p_collaboration_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  invite_token text;
begin
  if coalesce(public.semora_collaboration_role(p_collaboration_id), '') not in ('owner', 'editor') then
    raise exception 'Only editors can invite classmates' using errcode = '42501';
  end if;
  invite_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.course_collaboration_invites(collaboration_id, created_by, token)
  values(p_collaboration_id, auth.uid(), invite_token);
  return invite_token;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_group(p_collaboration_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if coalesce(public.semora_collaboration_role(p_collaboration_id), '') <> 'owner' then
    raise exception 'Only the space owner can delete this space' using errcode = '42501';
  end if;
  delete from public.course_collaborations where id = p_collaboration_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_member(p_collaboration_id uuid, p_member_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  target_role text;
  owner_count int;
begin
  if coalesce(public.semora_collaboration_role(p_collaboration_id), '') <> 'owner' then
    raise exception 'Only the space owner can remove members' using errcode = '42501';
  end if;
  if p_member_user_id = auth.uid() then
    raise exception 'Use leave to remove yourself' using errcode = '42501';
  end if;

  select role into target_role
  from public.course_collaboration_members
  where collaboration_id = p_collaboration_id and user_id = p_member_user_id;

  if target_role is null then
    raise exception 'That member is not in this space' using errcode = '42501';
  end if;

  if target_role = 'owner' then
    select count(*) into owner_count
    from public.course_collaboration_members
    where collaboration_id = p_collaboration_id and role = 'owner';
    if owner_count <= 1 then
      raise exception 'Cannot remove the last owner' using errcode = '42501';
    end if;
  end if;

  delete from public.course_collaboration_members
  where collaboration_id = p_collaboration_id and user_id = p_member_user_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_invite(p_collaboration_id uuid, p_invite_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  revoked_count int := 0;
begin
  if coalesce(public.semora_collaboration_role(p_collaboration_id), '') <> 'owner' then
    raise exception 'Only the space owner can revoke invites' using errcode = '42501';
  end if;

  update public.course_collaboration_invites
  set revoked = true
  where collaboration_id = p_collaboration_id
    and not revoked
    and (p_invite_id is null or id = p_invite_id);
  get diagnostics revoked_count = row_count;
  return revoked_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_member_role(p_collaboration_id uuid, p_member_user_id uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  target_role text;
  owner_count int;
begin
  if coalesce(public.semora_collaboration_role(p_collaboration_id), '') <> 'owner' then
    raise exception 'Only the space owner can change roles' using errcode = '42501';
  end if;
  if p_role not in ('owner', 'editor', 'viewer') then
    raise exception 'Unknown role' using errcode = '22023';
  end if;

  select role into target_role
  from public.course_collaboration_members
  where collaboration_id = p_collaboration_id and user_id = p_member_user_id;

  if target_role is null then
    raise exception 'That member is not in this space' using errcode = '42501';
  end if;

  -- Don't strip the space of its last owner by demoting them.
  if target_role = 'owner' and p_role <> 'owner' then
    select count(*) into owner_count
    from public.course_collaboration_members
    where collaboration_id = p_collaboration_id and role = 'owner';
    if owner_count <= 1 then
      raise exception 'Promote another owner before changing this role' using errcode = '42501';
    end if;
  end if;

  update public.course_collaboration_members
  set role = p_role
  where collaboration_id = p_collaboration_id and user_id = p_member_user_id;
end;
$function$;

-- Grants are unchanged by CREATE OR REPLACE, but re-assert the revokes so a
-- fresh apply of this file alone still lands in the intended state.
revoke all on function public.archive_group(uuid) from public, anon;
revoke all on function public.create_course_collaboration_invite(uuid) from public, anon;
revoke all on function public.delete_group(uuid) from public, anon;
revoke all on function public.remove_member(uuid, uuid) from public, anon;
revoke all on function public.revoke_invite(uuid, uuid) from public, anon;
revoke all on function public.set_member_role(uuid, uuid, text) from public, anon;
