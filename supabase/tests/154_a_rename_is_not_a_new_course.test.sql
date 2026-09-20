-- Tests for migration 154 (following a Moodle course across a rename).
--
-- Run against a THROWAWAY database, never production:
--
--   createdb semora_mig_test
--   psql -v ON_ERROR_STOP=1 -d semora_mig_test \
--     -f supabase/tests/154_a_rename_is_not_a_new_course.test.sql
--   dropdb semora_mig_test
--
-- The function's whole job is deciding when NOT to act, so most of what is
-- below is a refusal: the cost of a missed rename is one duplicate course the
-- student can delete, and the cost of a wrong merge is two courses' work
-- fused together with no way back.

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid());

create table public.lms_connections (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade
);

create table public.courses (id uuid primary key default gen_random_uuid());

create table public.lms_course_links (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  connection_id      uuid not null references public.lms_connections(id) on delete cascade,
  external_course_id text not null,
  external_name      text not null,
  local_course_id    uuid not null references public.courses(id) on delete cascade,
  updated_at         timestamptz not null default now(),
  unique (connection_id, external_course_id)
);

create table public.tasks (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  title                  text not null,
  lms_connection_id      uuid references public.lms_connections(id) on delete set null,
  lms_external_id        text,
  lms_external_course_id text,
  lms_removed_at         timestamptz,
  unique (lms_connection_id, lms_external_course_id, lms_external_id)
);

create table public.lms_pending_courses (
  connection_id      uuid not null references public.lms_connections(id) on delete cascade,
  external_course_id text not null
);

-- ── the migration under test ────────────────────────────────────────────────
\ir ../migrations/154_a_rename_is_not_a_new_course.sql

-- ── fixtures ────────────────────────────────────────────────────────────────
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111');
insert into public.lms_connections (id, user_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111');
insert into public.courses (id) values
  ('cccccccc-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-000000000002');

create function public.reset_world() returns void language sql as $$
  delete from public.lms_pending_courses;
  delete from public.tasks;
  delete from public.lms_course_links;
$$;

create function public.link(p_key text, p_course uuid) returns void language sql as $$
  insert into public.lms_course_links (user_id, connection_id, external_course_id, external_name, local_course_id)
  values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', p_key, p_key, p_course)
$$;

create function public.work(p_key text, p_ids text[]) returns void language sql as $$
  insert into public.tasks (user_id, title, lms_connection_id, lms_external_course_id, lms_external_id)
  select '11111111-1111-1111-1111-111111111111', p_key || ' ' || v,
         'aaaaaaaa-0000-0000-0000-000000000001', p_key, v
  from unnest(p_ids) v
$$;

-- ── the rename itself ───────────────────────────────────────────────────────
do $t$
declare r jsonb;
begin
  perform public.reset_world();
  perform public.link('PHYS101', 'cccccccc-0000-0000-0000-000000000001');
  perform public.work('PHYS101', array['e1','e2','e3']);
  -- A previous sync already filed the new name as a question.
  insert into public.lms_pending_courses values ('aaaaaaaa-0000-0000-0000-000000000001', 'PHYS101_F26');

  -- The feed now carries the same events under the new shortname, plus one
  -- new deadline posted since.
  r := public.rekey_lms_renamed_courses('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('external_course_id', 'PHYS101_F26', 'external_name', 'Physics 101',
                       'external_ids', jsonb_build_array('e1','e2','e3','e4'))
  ));

  if (r ->> 'rekeyed')::int <> 1 then raise exception 'the rename was not followed: %', r; end if;
  if not exists (select 1 from public.lms_course_links
                 where external_course_id = 'PHYS101_F26' and external_name = 'Physics 101'
                   and local_course_id = 'cccccccc-0000-0000-0000-000000000001') then
    raise exception 'the link kept the old key or lost its course';
  end if;
  if (select count(*) from public.lms_course_links) <> 1 then raise exception 'a second link was created'; end if;
  if (select count(*) from public.tasks where lms_external_course_id = 'PHYS101_F26') <> 3 then
    raise exception 'the work did not move with the course';
  end if;
  if exists (select 1 from public.lms_pending_courses) then
    raise exception 'the new name was left standing as an unanswered question';
  end if;
  raise notice '154 ok: a renamed course is re-keyed in place, work and all, and its pending row is cleared';
end $t$;

-- ── every refusal ───────────────────────────────────────────────────────────
do $t$
declare r jsonb;
begin
  -- Both keys in the same feed: two courses, not one renamed.
  perform public.reset_world();
  perform public.link('PHYS101', 'cccccccc-0000-0000-0000-000000000001');
  perform public.work('PHYS101', array['e1','e2']);
  r := public.rekey_lms_renamed_courses('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('external_course_id', 'PHYS101',     'external_ids', jsonb_build_array('e1','e2')),
    jsonb_build_object('external_course_id', 'PHYS101_F26', 'external_ids', jsonb_build_array('e1','e2','e9'))
  ));
  if (r ->> 'rekeyed')::int <> 0 then raise exception 'a course still in the feed was treated as renamed'; end if;

  -- One id missing: not provably the same course.
  perform public.reset_world();
  perform public.link('PHYS101', 'cccccccc-0000-0000-0000-000000000001');
  perform public.work('PHYS101', array['e1','e2','e3']);
  r := public.rekey_lms_renamed_courses('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('external_course_id', 'PHYS101_F26', 'external_ids', jsonb_build_array('e1','e2'))
  ));
  if (r ->> 'rekeyed')::int <> 0 then raise exception 'a partial id match was accepted as a rename'; end if;

  -- Two old courses both fit the new key: ambiguous, so neither moves.
  perform public.reset_world();
  perform public.link('PHYS101', 'cccccccc-0000-0000-0000-000000000001');
  perform public.link('PHYS102', 'cccccccc-0000-0000-0000-000000000002');
  perform public.work('PHYS101', array['e1']);
  perform public.work('PHYS102', array['e2']);
  r := public.rekey_lms_renamed_courses('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('external_course_id', 'PHYS_ALL', 'external_ids', jsonb_build_array('e1','e2'))
  ));
  if (r ->> 'rekeyed')::int <> 0 then raise exception 'two courses were merged into one on an ambiguous match'; end if;

  -- One old course fits two new keys: equally ambiguous.
  perform public.reset_world();
  perform public.link('PHYS101', 'cccccccc-0000-0000-0000-000000000001');
  perform public.work('PHYS101', array['e1']);
  r := public.rekey_lms_renamed_courses('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('external_course_id', 'A', 'external_ids', jsonb_build_array('e1','e5')),
    jsonb_build_object('external_course_id', 'B', 'external_ids', jsonb_build_array('e1','e6'))
  ));
  if (r ->> 'rekeyed')::int <> 0 then raise exception 'a course was re-keyed to one of two equally good candidates'; end if;

  -- The new key already holds work: re-keying would collide or merge.
  perform public.reset_world();
  perform public.link('PHYS101', 'cccccccc-0000-0000-0000-000000000001');
  perform public.work('PHYS101', array['e1']);
  perform public.work('PHYS101_F26', array['e7']);
  r := public.rekey_lms_renamed_courses('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('external_course_id', 'PHYS101_F26', 'external_ids', jsonb_build_array('e1','e7'))
  ));
  if (r ->> 'rekeyed')::int <> 0 then raise exception 'work was re-keyed into a key that already held tasks'; end if;

  -- Nothing to anchor on: a linked course with no live work.
  perform public.reset_world();
  perform public.link('PHYS101', 'cccccccc-0000-0000-0000-000000000001');
  r := public.rekey_lms_renamed_courses('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('external_course_id', 'PHYS101_F26', 'external_ids', jsonb_build_array('e1'))
  ));
  if (r ->> 'rekeyed')::int <> 0 then raise exception 'a course with no work was guessed into a rename'; end if;

  -- Removed work is not an anchor either.
  perform public.reset_world();
  perform public.link('PHYS101', 'cccccccc-0000-0000-0000-000000000001');
  perform public.work('PHYS101', array['e1']);
  update public.tasks set lms_removed_at = now();
  r := public.rekey_lms_renamed_courses('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('external_course_id', 'PHYS101_F26', 'external_ids', jsonb_build_array('e1'))
  ));
  if (r ->> 'rekeyed')::int <> 0 then raise exception 'already-removed work was used as a rename anchor'; end if;

  raise notice '154 ok: both-present, partial, ambiguous-either-way, occupied-key and no-anchor all refuse';
end $t$;

-- ── an unknown connection, and an empty feed ────────────────────────────────
do $t$
declare r jsonb;
begin
  r := public.rekey_lms_renamed_courses('00000000-0000-0000-0000-000000000000', '[]'::jsonb);
  if (r ->> 'rekeyed')::int <> 0 then raise exception 'an unknown connection was acted on'; end if;

  perform public.reset_world();
  perform public.link('PHYS101', 'cccccccc-0000-0000-0000-000000000001');
  perform public.work('PHYS101', array['e1']);
  r := public.rekey_lms_renamed_courses('aaaaaaaa-0000-0000-0000-000000000001', '[]'::jsonb);
  if (r ->> 'rekeyed')::int <> 0 then raise exception 'an empty feed moved a course'; end if;
  if (select count(*) from public.tasks where lms_external_course_id = 'PHYS101') <> 1 then
    raise exception 'an empty feed disturbed the work on file';
  end if;
  raise notice '154 ok: an unknown connection and an empty feed both change nothing';
end $t$;

\echo '154: all groups passed'
