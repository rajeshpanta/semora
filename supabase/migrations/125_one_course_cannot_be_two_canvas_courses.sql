-- ============================================================
-- SEMORA (125): ONE COURSE CANNOT BE TWO CANVAS COURSES
-- ============================================================
-- 124 let a new-term import link a Canvas course to a course the student
-- already has. It did not account for `lms_course_links_connection_id_local_
-- course_id_key` — a unique constraint on (connection_id, local_course_id),
-- which says a single connection may map at most ONE Canvas course onto any
-- one Semora course.
--
-- That constraint is right: two Canvas courses feeding one Semora course would
-- interleave two classes' deadlines into a single list with no way to tell
-- them apart, and the removal sweep would then see each one's items missing
-- from the other's feed.
--
-- But 124 inserted the link without checking, so choosing an already-linked
-- course raised a raw 23505 out of the database and failed the WHOLE import —
-- every other course in that term included. Found by a rolled-back test
-- against production data before this shipped: the first course the test
-- picked happened to be linked already, which is not luck so much as evidence
-- of how ordinary the case is. This connection has 137 links; the
-- first-connection path cannot hit it because a new connection has none.
--
-- ─── THE FIX, AND WHY IT IS A FALLBACK NOT AN ERROR ────────
-- Same reasoning as the stale-id fallback 124 already had: a student halfway
-- through importing a term must not be stopped by one bad choice. An
-- already-claimed course is treated exactly like an invalid one — Semora
-- creates a fresh course for that Canvas class instead. They end up with the
-- import they asked for, and the one course they mis-targeted is separate
-- rather than absent.
-- ============================================================

create or replace function public.link_lms_pending_courses(
  p_connection_id uuid,
  p_semester_id uuid,
  p_external_course_ids text[],
  p_link_to jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pending record;
  created_course uuid;
  linked_course uuid;
  created integer := 0;
  palette text[] := array['#6B46C1','#0F766E','#B45309','#1D4ED8','#BE185D','#15803D','#7C3AED','#C2410C'];
  taken integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to import courses.' using errcode = 'P0001';
  end if;

  perform 1 from public.lms_connections
   where id = p_connection_id and user_id = auth.uid();
  if not found then
    raise exception 'LMS connection not found.' using errcode = 'P0001';
  end if;

  perform 1 from public.semesters
   where id = p_semester_id and user_id = auth.uid();
  if not found then
    raise exception 'Semester not found.' using errcode = 'P0001';
  end if;

  select count(*) into taken from public.courses
   where user_id = auth.uid() and semester_id = p_semester_id;

  for pending in
    select * from public.lms_pending_courses
     where connection_id = p_connection_id
       and user_id = auth.uid()
       and resolved_at is null
       and external_course_id = any(p_external_course_ids)
     order by external_name
  loop
    if exists (
      select 1 from public.lms_course_links l
       where l.connection_id = p_connection_id
         and l.external_course_id = pending.external_course_id
    ) then
      update public.lms_pending_courses set resolved_at = now() where id = pending.id;
      continue;
    end if;

    linked_course := null;
    if p_link_to ? pending.external_course_id then
      begin
        select c.id into linked_course
        from public.courses c
        where c.id = (p_link_to ->> pending.external_course_id)::uuid
          -- The id came from a client: it must be theirs, and in this term.
          and c.user_id = auth.uid()
          and c.semester_id = p_semester_id
          -- ── 125 ── and not already spoken for by this connection.
          and not exists (
            select 1 from public.lms_course_links l2
             where l2.connection_id = p_connection_id
               and l2.local_course_id = c.id
          );
      exception when others then
        linked_course := null;
      end;
    end if;

    if linked_course is not null then
      -- Nothing about the existing course is touched — not its name, colour,
      -- instructor or grade setup. Only where the next sync puts deadlines.
      insert into public.lms_course_links (
        user_id, connection_id, external_course_id, external_name, local_course_id
      ) values (
        auth.uid(), p_connection_id, pending.external_course_id,
        pending.external_name, linked_course
      );
      update public.lms_pending_courses set resolved_at = now() where id = pending.id;
      continue;
    end if;

    insert into public.courses (user_id, semester_id, name, color, icon, source)
    values (
      auth.uid(),
      p_semester_id,
      pending.external_name,
      palette[(taken % array_length(palette, 1)) + 1],
      'book',
      'lms'
    )
    returning id into created_course;

    insert into public.lms_course_links (
      user_id, connection_id, external_course_id, external_name, local_course_id
    ) values (
      auth.uid(), p_connection_id, pending.external_course_id,
      pending.external_name, created_course
    );

    update public.lms_pending_courses set resolved_at = now() where id = pending.id;
    taken := taken + 1;
    created := created + 1;
  end loop;

  update public.lms_connections c
     set pending_courses_count = (
       select count(*) from public.lms_pending_courses p
        where p.connection_id = c.id
          and p.ignored_at is null
          and p.resolved_at is null
     )
   where c.id = p_connection_id;

  return created;
end;
$$;

revoke all on function public.link_lms_pending_courses(uuid, uuid, text[], jsonb) from public;
grant execute on function public.link_lms_pending_courses(uuid, uuid, text[], jsonb) to authenticated;

comment on function public.link_lms_pending_courses(uuid, uuid, text[], jsonb) is
  'SEMORA (103; linking 124; already-linked guard 125): resolves pending Canvas '
  'courses into a semester. p_link_to maps an external course id to a course the '
  'student already owns. A link target must be theirs, in the target semester, '
  'and not already claimed by another Canvas course on this connection — the '
  'unique constraint on (connection_id, local_course_id) would otherwise fail '
  'the entire import with a raw 23505. Any rejected target falls back to '
  'creating a course rather than stopping the import.';
