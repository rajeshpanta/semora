-- ============================================================
-- SEMORA: GATE COLLABORATION *CREATE* BEHIND PRO
-- Creating (hosting) a shared course space is a Pro feature — it stands up a
-- backend-hosted, realtime collaboration space that the owner runs. JOINING an
-- existing space via an invite stays FREE (the classroom growth loop: a
-- classmate without Pro must still be able to accept an invite and join).
--
-- The client already gates the "Start a course space" action (locked teaser ->
-- paywall, context 'collaboration'). This is the SERVER-SIDE backstop so a
-- patched client can't create for free. Only CREATE is gated here — nothing
-- touches join / members / invites / deadlines / group-assignment paths.
--
-- This is a create-or-replace supersede of the migration 037 RPC; the body is
-- verbatim from 037 with a single is_pro(auth.uid()) guard added up front
-- (mirrors enforce_free_scan_limit's structure, migration 044). Additive only;
-- the shared Citizen app is not touched.
-- ============================================================

create or replace function public.create_course_collaboration(p_course_id uuid)
returns public.course_collaborations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  course_row public.courses;
  result public.course_collaborations;
begin
  -- Pro gate: only Pro users may CREATE (own) a shared course space. Joining an
  -- existing space is unaffected — that goes through join_course_collaboration,
  -- which is left free. This runs as definer, so it may call is_pro() (whose
  -- ACL is service_role-only), exactly like the free-tier limit triggers do.
  if not public.is_pro(auth.uid()) then
    raise exception 'Hosting a shared course space is a Pro feature. Joining a classmate''s space is always free.'
      using errcode = 'P0001';
  end if;

  select * into course_row from public.courses where id = p_course_id and user_id = auth.uid();
  if course_row.id is null then raise exception 'Course not found' using errcode = '42501'; end if;
  insert into public.course_collaborations(owner_user_id, course_id, course_name, course_color)
  values(auth.uid(), course_row.id, course_row.name, course_row.color)
  on conflict(course_id) do update set
    course_name = excluded.course_name,
    course_color = excluded.course_color,
    is_active = true
  returning * into result;
  return result;
end;
$$;

-- Preserve migration 037's grants exactly — the redefinition above reset the
-- function body but not its ACL; re-assert to be explicit and idempotent.
revoke all on function public.create_course_collaboration(uuid) from public, anon;
grant execute on function public.create_course_collaboration(uuid) to authenticated;
