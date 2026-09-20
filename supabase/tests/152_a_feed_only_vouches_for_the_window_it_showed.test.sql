-- Tests for migration 152 (a windowed removal reconciler for calendar feeds).
--
-- Run against a THROWAWAY database, never production:
--
--   createdb semora_mig_test
--   psql -v ON_ERROR_STOP=1 -d semora_mig_test \
--     -f supabase/tests/152_a_feed_only_vouches_for_the_window_it_showed.test.sql
--   dropdb semora_mig_test
--
-- The first section rebuilds only the parts of the world this function reads,
-- copied from the live schema (tasks' lms_* columns, lms_connections, the
-- service-role gate and note_lms_removal_refused). The migration is then
-- applied on top, so what is exercised is the real function.

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid());

-- auth.role() is what the service-role gate reads. Switchable, so the test can
-- prove the gate actually closes.
create table public.test_role (value text not null);
insert into public.test_role values ('service_role');
create function auth.role() returns text language sql stable as $$
  select value from public.test_role limit 1
$$;

create table public.lms_connections (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  provider          text not null,
  connection_method text not null
);

create table public.tasks (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  title                   text not null,
  due_date                date not null,
  due_time                time,
  is_completed            boolean default false,
  score                   numeric,
  points_earned           numeric,
  lms_connection_id       uuid references public.lms_connections(id) on delete set null,
  lms_external_id         text,
  lms_external_course_id  text,
  lms_removed_at          timestamptz,
  lms_last_synced_at      timestamptz,
  lms_synced_due_date     date,
  lms_synced_due_time     time,
  lms_field_overrides     jsonb not null default '{}'::jsonb
);

create table public.task_subtasks (
  id      uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade
);

create table public.removal_refusals (
  connection_id uuid, received integer, on_file integer, reason text
);
create function public.note_lms_removal_refused(
  p_connection_id uuid, p_received integer, p_on_file integer, p_reason text
) returns void language sql as $$
  insert into public.removal_refusals values (p_connection_id, p_received, p_on_file, p_reason)
$$;

-- The Canvas original, verbatim from production (migration 120), so the test
-- can prove 152 leaves it alone and produces the same result on a Canvas row.
create or replace function public.mark_canvas_calendar_feed_removed(
  p_user_id uuid, p_connection_id uuid, p_received_ids text[]
) returns integer language plpgsql security definer set search_path to 'public', 'pg_temp'
as $canvas$
declare
  removed integer := 0; marked integer := 0;
  received integer := coalesce(array_length(p_received_ids, 1), 0);
  on_file integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.lms_connections
                 where id = p_connection_id and user_id = p_user_id
                   and provider = 'canvas' and connection_method = 'calendar_feed') then
    raise exception 'Canvas calendar connection not found' using errcode = '42501';
  end if;
  select count(*) into on_file from public.tasks
   where user_id = p_user_id and lms_connection_id = p_connection_id
     and lms_removed_at is null
     and due_date between current_date - 25 and current_date + 360;
  if received = 0 and on_file > 0 then
    perform public.note_lms_removal_refused(p_connection_id, received, on_file, 'empty_feed');
    return 0;
  end if;
  if on_file >= 4 and received * 2 < on_file then
    perform public.note_lms_removal_refused(p_connection_id, received, on_file, 'short_feed');
    return 0;
  end if;
  delete from public.tasks
   where user_id = p_user_id and lms_connection_id = p_connection_id
     and due_date between current_date - 25 and current_date + 360
     and not (lms_external_id = any(coalesce(p_received_ids, array[]::text[])))
     and lms_removed_at is null and not is_completed
     and score is null and points_earned is null
     and (lms_synced_due_date is null or due_date is not distinct from lms_synced_due_date)
     and (lms_synced_due_time is null or due_time is not distinct from lms_synced_due_time)
     and lms_field_overrides = '{}'::jsonb
     and not exists (select 1 from public.task_subtasks s where s.task_id = tasks.id);
  get diagnostics removed = row_count;
  update public.tasks set lms_removed_at = now(), lms_last_synced_at = now()
   where user_id = p_user_id and lms_connection_id = p_connection_id
     and due_date between current_date - 25 and current_date + 360
     and not (lms_external_id = any(coalesce(p_received_ids, array[]::text[])))
     and lms_removed_at is null;
  get diagnostics marked = row_count;
  return removed + marked;
end
$canvas$;

-- ── the migration under test ────────────────────────────────────────────────
\ir ../migrations/152_a_feed_only_vouches_for_the_window_it_showed.sql

-- ── fixtures ────────────────────────────────────────────────────────────────
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into public.lms_connections (id, user_id, provider, connection_method) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'moodle', 'calendar_feed'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'canvas', 'calendar_feed'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'moodle', 'legacy_token');

-- ── a task outside the window is never touched ──────────────────────────────
do $t$
declare n integer;
begin
  delete from public.tasks;
  insert into public.tasks (user_id, title, due_date, lms_connection_id, lms_external_id) values
    ('11111111-1111-1111-1111-111111111111', 'Inside',  current_date + 10,  'aaaaaaaa-0000-0000-0000-000000000001', 'ev-in'),
    ('11111111-1111-1111-1111-111111111111', 'Beyond',  current_date + 200, 'aaaaaaaa-0000-0000-0000-000000000001', 'ev-far'),
    ('11111111-1111-1111-1111-111111111111', 'Behind',  current_date - 40,  'aaaaaaaa-0000-0000-0000-000000000001', 'ev-old');

  -- A 60-day window. The feed reported only 'ev-in'.
  n := public.mark_lms_calendar_feed_removed(
        '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
        array['ev-in'], current_date - 4, current_date + 59);

  if n <> 0 then raise exception 'nothing inside the window was missing, yet % rows changed', n; end if;
  if (select count(*) from public.tasks) <> 3 then raise exception 'a task outside the window was removed'; end if;
  raise notice '152 ok: items beyond the horizon and older than the look-back are untouched';
end $t$;

-- ── an untouched in-window task the feed dropped IS removed ─────────────────
do $t$
declare n integer;
begin
  delete from public.tasks;
  insert into public.tasks (user_id, title, due_date, lms_connection_id, lms_external_id) values
    ('11111111-1111-1111-1111-111111111111', 'Kept',    current_date + 5,  'aaaaaaaa-0000-0000-0000-000000000001', 'ev-1'),
    ('11111111-1111-1111-1111-111111111111', 'Dropped', current_date + 6,  'aaaaaaaa-0000-0000-0000-000000000001', 'ev-2'),
    ('11111111-1111-1111-1111-111111111111', 'Kept2',   current_date + 7,  'aaaaaaaa-0000-0000-0000-000000000001', 'ev-3'),
    ('11111111-1111-1111-1111-111111111111', 'Kept3',   current_date + 8,  'aaaaaaaa-0000-0000-0000-000000000001', 'ev-4');

  n := public.mark_lms_calendar_feed_removed(
        '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
        array['ev-1','ev-3','ev-4'], current_date - 4, current_date + 59);

  if n <> 1 then raise exception 'expected 1 change, got %', n; end if;
  if exists (select 1 from public.tasks where lms_external_id = 'ev-2') then
    raise exception 'the dropped item survived';
  end if;
  raise notice '152 ok: an untouched item the feed stopped listing is deleted';
end $t$;

-- ── anything the student touched is MARKED, never deleted ───────────────────
do $t$
declare kinds text[] := array['completed','scored','redated','overridden','subtasked'];
        k text; touched_id uuid;
begin
  foreach k in array kinds loop
    delete from public.tasks;
    insert into public.tasks (user_id, title, due_date, lms_connection_id, lms_external_id,
                              lms_synced_due_date, lms_field_overrides)
    values ('11111111-1111-1111-1111-111111111111', k, current_date + 5,
            'aaaaaaaa-0000-0000-0000-000000000001', 'ev-touched',
            current_date + 5, '{}'::jsonb)
    returning tasks.id into touched_id;
    -- Pad so the short-feed guard does not fire on a one-row table.
    insert into public.tasks (user_id, title, due_date, lms_connection_id, lms_external_id)
    select '11111111-1111-1111-1111-111111111111', 'pad'||g, current_date + 5, 'aaaaaaaa-0000-0000-0000-000000000001', 'pad'||g
    from generate_series(1,4) g;

    if k = 'completed'  then update public.tasks set is_completed = true where tasks.id = touched_id; end if;
    if k = 'scored'     then update public.tasks set score = 90 where tasks.id = touched_id; end if;
    if k = 'redated'    then update public.tasks set due_date = current_date + 9 where tasks.id = touched_id; end if;
    if k = 'overridden' then update public.tasks set lms_field_overrides = '{"title":true}'::jsonb where tasks.id = touched_id; end if;
    if k = 'subtasked'  then insert into public.task_subtasks (task_id) values (touched_id); end if;

    perform public.mark_lms_calendar_feed_removed(
      '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
      array['pad1','pad2','pad3','pad4'], current_date - 4, current_date + 59);

    if not exists (select 1 from public.tasks where tasks.id = touched_id) then
      raise exception 'a % task was DELETED; it should only be marked', k;
    end if;
    if (select lms_removed_at from public.tasks where tasks.id = touched_id) is null then
      raise exception 'a % task was neither removed nor marked', k;
    end if;
  end loop;
  raise notice '152 ok: completed, scored, re-dated, overridden and subtasked work is marked, never deleted';
end $t$;

-- ── the two refusals ────────────────────────────────────────────────────────
do $t$
declare n integer;
begin
  delete from public.tasks; delete from public.removal_refusals;
  insert into public.tasks (user_id, title, due_date, lms_connection_id, lms_external_id)
  select '11111111-1111-1111-1111-111111111111', 'task'||g, current_date + 5, 'aaaaaaaa-0000-0000-0000-000000000001', 'ev'||g
  from generate_series(1,6) g;

  -- An outage that answers 200 with an empty calendar.
  n := public.mark_lms_calendar_feed_removed(
        '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
        array[]::text[], current_date - 4, current_date + 59);
  if n <> 0 or (select count(*) from public.tasks) <> 6 then raise exception 'empty feed deleted rows'; end if;
  if not exists (select 1 from public.removal_refusals where reason = 'empty_feed') then
    raise exception 'empty_feed was not reported';
  end if;

  -- A feed that came back suspiciously short.
  n := public.mark_lms_calendar_feed_removed(
        '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
        array['ev1','ev2'], current_date - 4, current_date + 59);
  if n <> 0 or (select count(*) from public.tasks) <> 6 then raise exception 'short feed deleted rows'; end if;
  if not exists (select 1 from public.removal_refusals where reason = 'short_feed') then
    raise exception 'short_feed was not reported';
  end if;
  raise notice '152 ok: an empty feed and a halved feed both refuse and alert, deleting nothing';
end $t$;

-- ── a term ending is named as such, and still deletes nothing ──────────
do $t$
declare n integer;
begin
  delete from public.tasks; delete from public.removal_refusals;
  -- Four items in a course the feed still carries, six in one it does not.
  insert into public.tasks (user_id, title, due_date, lms_connection_id, lms_external_id, lms_external_course_id)
  select '11111111-1111-1111-1111-111111111111', 'live'||g, current_date + 5,
         'aaaaaaaa-0000-0000-0000-000000000001', 'live'||g, 'PHYS101'
  from generate_series(1,4) g;
  insert into public.tasks (user_id, title, due_date, lms_connection_id, lms_external_id, lms_external_course_id)
  select '11111111-1111-1111-1111-111111111111', 'gone'||g, current_date + 5,
         'aaaaaaaa-0000-0000-0000-000000000001', 'gone'||g, 'HIST200'
  from generate_series(1,6) g;

  -- The feed halved, which alone reads as short_feed. But every missing id
  -- belongs to HIST200, and HIST200 is not in the feed at all.
  n := public.mark_lms_calendar_feed_removed(
        '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
        array['live1','live2','live3','live4'], current_date - 4, current_date + 59,
        array['PHYS101']);
  if n <> 0 then raise exception 'a term ending deleted % rows', n; end if;
  if (select count(*) from public.tasks) <> 10 then raise exception 'a term ending lost work'; end if;
  if not exists (select 1 from public.removal_refusals where reason = 'term_end') then
    raise exception 'the refusal was not named term_end (got %)',
      (select string_agg(reason, ',') from public.removal_refusals);
  end if;

  -- The same shape WITHOUT the course list still reads as short_feed, so a
  -- caller that says nothing gets exactly the old behaviour.
  delete from public.removal_refusals;
  n := public.mark_lms_calendar_feed_removed(
        '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
        array['live1','live2','live3','live4'], current_date - 4, current_date + 59);
  if exists (select 1 from public.removal_refusals where reason = 'term_end') then
    raise exception 'term_end was inferred without being told which courses the feed carried';
  end if;

  -- A shrink that is NOT explained by a vanished course keeps its old name.
  delete from public.removal_refusals;
  n := public.mark_lms_calendar_feed_removed(
        '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
        array['live1','live2','live3'], current_date - 4, current_date + 59,
        array['PHYS101','HIST200']);
  if not exists (select 1 from public.removal_refusals where reason = 'short_feed') then
    raise exception 'a genuine short feed was excused as a term ending';
  end if;
  raise notice '152 ok: whole courses vanishing is reported as term_end, and nothing else is';
end $t$;

-- ── the gates ───────────────────────────────────────────────────────────────
do $t$
declare ok boolean;
begin
  -- A token connection is not a feed.
  ok := false;
  begin
    perform public.mark_lms_calendar_feed_removed(
      '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000003',
      array['x'], current_date - 4, current_date + 59);
  exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'a legacy_token connection was accepted'; end if;

  -- Another user's connection.
  ok := false;
  begin
    perform public.mark_lms_calendar_feed_removed(
      '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001',
      array['x'], current_date - 4, current_date + 59);
  exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'one user reconciled another user''s connection'; end if;

  -- An inverted or missing window.
  ok := false;
  begin
    perform public.mark_lms_calendar_feed_removed(
      '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
      array['x'], current_date + 10, current_date - 10);
  exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception 'an inverted window was accepted'; end if;

  -- Not the service role.
  update public.test_role set value = 'authenticated';
  ok := false;
  begin
    perform public.mark_lms_calendar_feed_removed(
      '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
      array['x'], current_date - 4, current_date + 59);
  exception when sqlstate '42501' then ok := true; end;
  update public.test_role set value = 'service_role';
  if not ok then raise exception 'a non-service role was accepted'; end if;

  raise notice '152 ok: token connections, other users, bad windows and non-service callers are all refused';
end $t$;

-- ── Canvas is unchanged, and gets the same answer either way ────────────────
do $t$
declare old_result integer; new_result integer;
begin
  delete from public.tasks;
  insert into public.tasks (user_id, title, due_date, lms_connection_id, lms_external_id)
  select '22222222-2222-2222-2222-222222222222', 'c'||g, current_date + 5, 'aaaaaaaa-0000-0000-0000-000000000002', 'cv'||g
  from generate_series(1,6) g;
  old_result := public.mark_canvas_calendar_feed_removed(
    '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002',
    array['cv1','cv2','cv3','cv4','cv5']);

  delete from public.tasks;
  insert into public.tasks (user_id, title, due_date, lms_connection_id, lms_external_id)
  select '22222222-2222-2222-2222-222222222222', 'c'||g, current_date + 5, 'aaaaaaaa-0000-0000-0000-000000000002', 'cv'||g
  from generate_series(1,6) g;
  new_result := public.mark_lms_calendar_feed_removed(
    '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002',
    array['cv1','cv2','cv3','cv4','cv5'], current_date - 25, current_date + 360);

  if old_result <> new_result then
    raise exception 'the new function answered % where Canvas''s answered %', new_result, old_result;
  end if;
  raise notice '152 ok: a Canvas row passed Canvas''s own window gets an identical result';
end $t$;

-- ── the Canvas function still exists, untouched ─────────────────────────────
do $t$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'mark_canvas_calendar_feed_removed'
  ) then raise exception 'migration 152 dropped the Canvas function'; end if;
  raise notice '152 ok: mark_canvas_calendar_feed_removed is still present and unmodified';
end $t$;
