-- ============================================================
-- SEMORA COLLABORATION MANAGEMENT & LIFECYCLE
-- Adds the member/space lifecycle RPCs the core loop was missing:
-- leave, remove member, change role, archive/delete a space, and
-- revoke an outstanding invite. All owner-gated where noted, all
-- SECURITY DEFINER with membership checks so they can act on rows the
-- caller cannot see or mutate directly under RLS (invites have no
-- owner update/delete policy; members have no update/delete policy).
--
-- The sticky group-completion bug is fixed separately in migration 041
-- (sync_collaboration_to_planner now mirrors the group assignment's
-- actual completion state instead of a sticky OR); it is intentionally
-- not touched here.
-- ============================================================

-- ─── Leave a space ─────────────────────────────────────────
-- The caller removes only themselves. The sole remaining owner cannot
-- leave (they'd orphan the space); they must transfer ownership by
-- promoting another owner first, or delete the space.
create or replace function public.leave_group(p_collaboration_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  my_role text;
  owner_count int;
begin
  select role into my_role
  from public.course_collaboration_members
  where collaboration_id = p_collaboration_id and user_id = auth.uid();

  if my_role is null then
    raise exception 'You are not a member of this space' using errcode = '42501';
  end if;

  if my_role = 'owner' then
    select count(*) into owner_count
    from public.course_collaboration_members
    where collaboration_id = p_collaboration_id and role = 'owner';
    if owner_count <= 1 then
      raise exception 'Transfer ownership or delete the space before leaving' using errcode = '42501';
    end if;
  end if;

  delete from public.course_collaboration_members
  where collaboration_id = p_collaboration_id and user_id = auth.uid();
end;
$$;

-- ─── Remove another member (owner only) ────────────────────
-- Owners cannot remove themselves through this path (use leave_group)
-- and cannot remove the last remaining owner.
create or replace function public.remove_member(
  p_collaboration_id uuid,
  p_member_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_role text;
  owner_count int;
begin
  if public.semora_collaboration_role(p_collaboration_id) <> 'owner' then
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
$$;

-- ─── Change a member's role (owner only) ───────────────────
-- Roles match the existing schema check (owner/editor/viewer). Demoting
-- the last owner is blocked. A viewer cannot create or edit shared
-- deadlines / group assignments — that is already enforced by the RLS
-- policies in migration 037 which require role in ('owner','editor').
create or replace function public.set_member_role(
  p_collaboration_id uuid,
  p_member_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_role text;
  owner_count int;
begin
  if public.semora_collaboration_role(p_collaboration_id) <> 'owner' then
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
$$;

-- ─── Archive / delete a space (owner only) ─────────────────
-- Soft-delete keeps a member's synced planner tasks intact (the
-- collaboration_deadline_id / group_assignment_id FKs are `on delete set
-- null`, so their tasks simply stop updating) while removing the space
-- from every member's hub via the is_active filter used in the client.
create or replace function public.archive_group(p_collaboration_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.semora_collaboration_role(p_collaboration_id) <> 'owner' then
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
$$;

-- Hard delete removes the space and, by cascade, its members, invites,
-- shared deadlines and group assignments. Synced personal tasks survive
-- because their collaboration FKs are `on delete set null`.
create or replace function public.delete_group(p_collaboration_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.semora_collaboration_role(p_collaboration_id) <> 'owner' then
    raise exception 'Only the space owner can delete this space' using errcode = '42501';
  end if;
  delete from public.course_collaborations where id = p_collaboration_id;
end;
$$;

-- ─── Revoke invites (owner only) ───────────────────────────
-- Invalidate a single outstanding invite, or every outstanding invite
-- for the space when no id is given.
create or replace function public.revoke_invite(
  p_collaboration_id uuid,
  p_invite_id uuid default null
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  revoked_count int := 0;
begin
  if public.semora_collaboration_role(p_collaboration_id) <> 'owner' then
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
$$;

revoke all on function public.leave_group(uuid) from public, anon;
revoke all on function public.remove_member(uuid, uuid) from public, anon;
revoke all on function public.set_member_role(uuid, uuid, text) from public, anon;
revoke all on function public.archive_group(uuid) from public, anon;
revoke all on function public.delete_group(uuid) from public, anon;
revoke all on function public.revoke_invite(uuid, uuid) from public, anon;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.archive_group(uuid) to authenticated;
grant execute on function public.delete_group(uuid) to authenticated;
grant execute on function public.revoke_invite(uuid, uuid) to authenticated;
