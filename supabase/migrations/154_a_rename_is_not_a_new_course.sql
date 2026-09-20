-- A rename is not a new course
--
-- MOODLE_PLAN.md Phase 3.5 (decision 6).
--
-- THE PROBLEM
--
-- A Moodle calendar feed has no course id in it. The only course key an iCal
-- VEVENT carries is CATEGORIES, which Moodle fills with the course SHORTNAME —
-- and a shortname is a text field a teacher or an administrator can edit at any
-- time. `PHYS101` becomes `PHYS101_F26` the week before the term starts and
-- every event in the feed changes course key at once.
--
-- To Semora that reads as two separate things happening together: a linked
-- course that stopped appearing, and a brand new course that turned up with a
-- term's worth of deadlines in it. The student gets a "new course found" badge
-- for a class they have been using all semester, and if they accept it they now
-- have the same course twice — `tasks_lms_external_unique` is
-- (connection, external_course_id, external_id), so the new key collides with
-- nothing and every assignment imports a second time.
--
-- THE ANCHOR
--
-- The feed does carry something stable across a rename: the event ids. A
-- Moodle VEVENT UID is `<eventid>@<wwwroot-minus-scheme>` and the event id is a
-- database primary key that a rename does not touch. So the same deadlines
-- reappear under the new shortname with exactly the same ids they had under the
-- old one.
--
-- That gives a test with no guesswork in it: if every live task Semora holds
-- for a course that has vanished from the feed reappears, by id, under a course
-- key that is NOT linked yet, then it is not a new course. It is the same
-- course wearing a new name, and the right answer is to re-key in place.
--
-- WHAT IT REFUSES TO DO
--
--   * Both keys present in the same feed — that is two courses, not a rename.
--   * The vanished course has no live tasks — nothing to anchor on, so it is
--     treated as an ordinary disappearance (Phase 3.4 names that one).
--   * Any id missing — a course that changed name AND dropped work is not
--     provably the same course, and a wrong merge is worse than a duplicate.
--   * Two old courses fit one new key, or one old course fits two new keys —
--     ambiguous, and an ambiguous merge is unrecoverable. Left alone; the
--     student sees the ordinary new-course review.
--   * The new key already holds tasks — re-keying into it would collide.
--
-- Every one of those falls back to exactly the behaviour that exists today.
--
-- ADDITIVE. One new function. No table, column or existing function is
-- changed, and nothing calls this except the Moodle calendar-feed sync.

create or replace function public.rekey_lms_renamed_courses(
  p_connection_id uuid,
  p_courses jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner    uuid;
  pair     record;
  moved    integer := 0;
  renames  jsonb := '[]'::jsonb;
begin
  select user_id into owner from public.lms_connections where id = p_connection_id;
  if owner is null then
    return jsonb_build_object('rekeyed', 0, 'renames', renames);
  end if;

  for pair in
    with feed as (
      select
        nullif(btrim(c ->> 'external_course_id'), '')                       as new_id,
        coalesce(nullif(btrim(c ->> 'external_name'), ''),
                 nullif(btrim(c ->> 'external_course_id'), ''))             as new_name,
        (select array_agg(v)
           from jsonb_array_elements_text(coalesce(c -> 'external_ids', '[]'::jsonb)) v)
                                                                            as ids
      from jsonb_array_elements(coalesce(p_courses, '[]'::jsonb)) c
    ),
    present as (
      select new_id from feed where new_id is not null
    ),
    candidate as (
      select f.new_id, f.new_name, f.ids
      from feed f
      where f.new_id is not null
        and coalesce(array_length(f.ids, 1), 0) > 0
        and not exists (
          select 1 from public.lms_course_links l
          where l.connection_id = p_connection_id and l.external_course_id = f.new_id
        )
        -- Re-keying into a key that already holds work would either collide on
        -- tasks_lms_external_unique or silently merge two courses.
        and not exists (
          select 1 from public.tasks t
          where t.lms_connection_id = p_connection_id and t.lms_external_course_id = f.new_id
        )
    ),
    stale as (
      select l.id as link_id, l.external_course_id as old_id,
             (select array_agg(t.lms_external_id)
                from public.tasks t
               where t.lms_connection_id = p_connection_id
                 and t.lms_external_course_id = l.external_course_id
                 and t.lms_removed_at is null
                 and t.lms_external_id is not null) as ids
      from public.lms_course_links l
      where l.connection_id = p_connection_id
        and not exists (select 1 from present p where p.new_id = l.external_course_id)
    ),
    matched as (
      select s.link_id, s.old_id, c.new_id, c.new_name
      from stale s
      join candidate c on s.ids <@ c.ids
      where coalesce(array_length(s.ids, 1), 0) > 0
    )
    select m.link_id, m.old_id, m.new_id, m.new_name
    from matched m
    where 1 = (select count(*) from matched q where q.link_id = m.link_id)
      and 1 = (select count(*) from matched q where q.new_id  = m.new_id)
  loop
    update public.tasks
       set lms_external_course_id = pair.new_id
     where lms_connection_id = p_connection_id
       and lms_external_course_id = pair.old_id;

    update public.lms_course_links
       set external_course_id = pair.new_id,
           external_name      = pair.new_name,
           updated_at         = now()
     where id = pair.link_id;

    -- If a previous sync already filed this as a question, it is answered now.
    delete from public.lms_pending_courses
     where connection_id = p_connection_id
       and external_course_id = pair.new_id;

    moved := moved + 1;
    renames := renames || jsonb_build_object('from', pair.old_id, 'to', pair.new_id);
  end loop;

  return jsonb_build_object('rekeyed', moved, 'renames', renames);
end;
$$;

revoke all on function public.rekey_lms_renamed_courses(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.rekey_lms_renamed_courses(uuid, jsonb) to service_role;

comment on function public.rekey_lms_renamed_courses(uuid, jsonb) is
  'SEMORA (154): follows a Moodle course across a shortname rename by its event ids, so a renamed '
  'course is re-keyed in place instead of arriving as a new course whose assignments import twice. '
  'Refuses on any ambiguity; every refusal falls back to the ordinary new-course review.';
