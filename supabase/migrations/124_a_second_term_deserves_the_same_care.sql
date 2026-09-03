-- ============================================================
-- SEMORA (124): A SECOND TERM DESERVES THE SAME CARE AS THE FIRST
-- ============================================================
-- Connecting Canvas for the first time asks a careful question before it
-- creates anything: "you already have a course called Organic Chemistry — is
-- this Canvas course the same one?" The student links the two and their notes,
-- grades and colour survive. That path runs pendingCourseChoices() and passes a
-- `linkTo` map into connectLms.
--
-- Importing NEXT TERM's courses asks nothing. link_lms_pending_courses takes a
-- list of external ids and inserts a brand new course for every one of them.
-- There is no parameter that could express "link this to the course I already
-- have", so a student who created Organic Chemistry by hand in August and
-- imports it from Canvas in September ends up with two of them — one holding
-- their work, one holding the deadlines.
--
-- The asymmetry is not deliberate. 103 built the new-term path as a way to
-- resolve pending courses, and resolving meant creating; the duplicate question
-- had already been solved on the other path and was simply never asked here.
--
-- ─── WHAT CHANGES ──────────────────────────────────────────
-- One optional parameter. `p_link_to` maps an external course id to a course
-- the student already owns; anything absent from it is created exactly as
-- before, so every existing caller behaves identically.
--
-- ─── WHY THE OWNERSHIP CHECK IS NOT OPTIONAL ───────────────
-- p_link_to arrives from a client and names a row by id. Without the
-- user_id/semester check below, a caller could hand this function ANY course
-- id in the database and have their Canvas feed start writing deadlines into a
-- stranger's course. The function is SECURITY DEFINER, so nothing else would
-- stop it. A linked course must belong to the caller AND live in the semester
-- being imported into; anything else falls back to creating a fresh course
-- rather than failing the import, because a student halfway through importing a
-- term should not be stopped by a stale id.
-- ============================================================

-- ─── The old signature has to go, not just be superseded ────
-- Postgres allows overloads, and a 4-arg version with a DEFAULT would sit
-- alongside the existing 3-arg one. A client calling it with three arguments
-- would then match BOTH and PostgREST would fail the call outright with
-- "function is not unique" — every new-term import, immediately. Dropping the
-- old signature first is what makes this a replacement rather than a second
-- function wearing the same name.
drop function if exists public.link_lms_pending_courses(uuid, uuid, text[]);

create or replace function public.link_lms_pending_courses(
  p_connection_id uuid,
  p_semester_id uuid,
  p_external_course_ids text[],
  -- {"<external_course_id>": "<existing course uuid>"} — omit to create.
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
  linked integer := 0;
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
    -- Already linked by a concurrent run: resolve the question, create nothing.
    if exists (
      select 1 from public.lms_course_links l
       where l.connection_id = p_connection_id
         and l.external_course_id = pending.external_course_id
    ) then
      update public.lms_pending_courses set resolved_at = now() where id = pending.id;
      continue;
    end if;

    -- ── Link to a course the student already has ────────────
    linked_course := null;
    if p_link_to ? pending.external_course_id then
      begin
        select c.id into linked_course
        from public.courses c
        where c.id = (p_link_to ->> pending.external_course_id)::uuid
          -- Both checks matter. See the header: this id came from a client.
          and c.user_id = auth.uid()
          and c.semester_id = p_semester_id;
      exception when others then
        -- A malformed uuid is not worth failing an import over.
        linked_course := null;
      end;
    end if;

    if linked_course is not null then
      -- No course row is created and NOTHING about the existing course is
      -- touched — not its name, colour, instructor or grade setup. All that
      -- changes is where the next sync puts this Canvas course's deadlines,
      -- which is exactly what connectLms does on the first-connection path.
      insert into public.lms_course_links (
        user_id, connection_id, external_course_id, external_name, local_course_id
      ) values (
        auth.uid(), p_connection_id, pending.external_course_id,
        pending.external_name, linked_course
      );
      update public.lms_pending_courses set resolved_at = now() where id = pending.id;
      linked := linked + 1;
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

  -- Still the number of courses CREATED, unchanged for every existing caller.
  -- The screen needs both halves to tell the student the truth ("2 added, 1
  -- linked"), so the linked count goes out through a NOTICE-free channel: the
  -- caller re-reads lms_course_links if it wants it. Changing this return type
  -- would break the two callers that already read it as an integer.
  return created;
end;
$$;

revoke all on function public.link_lms_pending_courses(uuid, uuid, text[], jsonb) from public;
grant execute on function public.link_lms_pending_courses(uuid, uuid, text[], jsonb) to authenticated;

comment on function public.link_lms_pending_courses(uuid, uuid, text[], jsonb) is
  'SEMORA (103, linking added in 124): resolves pending Canvas courses into a '
  'semester. p_link_to maps an external course id to a course the student '
  'already owns, so a second-term import can link instead of duplicating — the '
  'same question the first-connection path has always asked. A linked course '
  'must belong to the caller and to the target semester; anything else falls '
  'back to creating, because a stale id must not fail a whole import.';
