-- Tests for migration 104 (one-time zero-dated courtesy).
--
-- These run against a THROWAWAY database, never production:
--
--   createdb semora_mig_test
--   psql -v ON_ERROR_STOP=1 -d semora_mig_test -f supabase/tests/104_zero_dated_courtesy.test.sql
--   dropdb semora_mig_test
--
-- The first section rebuilds the pre-104 world (the parts of 001/065/071 the
-- courtesy touches) so the real migration file can be applied on top and its
-- effect observed in isolation. is_pro is a faithful stub over entitlements:
-- the courtesy only ever asks "is this account Pro".
--
-- Concurrency is covered separately and cannot be expressed in one script —
-- see the note at the end.

-- Pre-104 world: the parts of production that the courtesy touches, verbatim
-- in behaviour (009 + 065 + 071). is_pro is a faithful stub over entitlements —
-- the courtesy only ever asks "is this account Pro".
create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid());

create table public.courses (id uuid primary key default gen_random_uuid());

create table public.syllabus_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid,
  storage_path text not null default 'x',
  file_name text not null default 'x',
  file_size_bytes int,
  status text default 'pending',
  created_at timestamptz default now()
);

create table public.scan_usage_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  upload_id  uuid,
  status     text not null check (status in ('success', 'failed')),
  error_code text,
  created_at timestamptz not null default now()
);

create table public.lecture_usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('success','failed')),
  created_at timestamptz not null default now()
);

create table public.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_pro boolean not null default false,
  expires_at timestamptz
);

create or replace function public.is_pro(uid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select coalesce((select e.is_pro and (e.expires_at is null or e.expires_at > now())
                     from public.entitlements e where e.user_id = uid), false);
$$;

create or replace function public.free_action_used(uid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.lecture_usage_log where user_id = uid and status='success')
      or exists (select 1 from public.scan_usage_log    where user_id = uid and status='success')
      or exists (select 1 from public.syllabus_uploads  where user_id = uid);
$$;

create or replace function public.enforce_free_scan_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare prior_uploads integer; lecture_used boolean;
begin
  if public.is_pro(new.user_id) then return new; end if;
  select count(*) into prior_uploads from public.syllabus_uploads where user_id = new.user_id;
  select exists (select 1 from public.lecture_usage_log where user_id=new.user_id and status='success') into lecture_used;
  if prior_uploads >= 1 or lecture_used then
    raise exception 'You''ve used your free scan. Upgrade to Pro for unlimited syllabus scanning and lecture recordings.' using errcode='P0001';
  end if;
  return new;
end; $$;

drop trigger if exists enforce_free_scan_limit_trigger on public.syllabus_uploads;
create trigger enforce_free_scan_limit_trigger
  before insert on public.syllabus_uploads
  for each row execute function public.enforce_free_scan_limit();

-- Pre-existing production rows, to prove the migration does not disturb them.
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),  -- legacy: already spent, has upload
  ('22222222-2222-2222-2222-222222222222');  -- legacy Pro
insert into public.entitlements (user_id, is_pro, expires_at)
  values ('22222222-2222-2222-2222-222222222222', true, now() + interval '1 year');
insert into public.scan_usage_log (user_id, status) values ('11111111-1111-1111-1111-111111111111','success');
insert into public.syllabus_uploads (user_id) values ('11111111-1111-1111-1111-111111111111');

\i supabase/migrations/104_zero_dated_courtesy.sql

\set ON_ERROR_STOP on
\pset pager off

create or replace function pg_temp.check(label text, got boolean, want boolean) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL: % (got %, want %)', label, got, want;
  end if;
  raise notice 'PASS: %', label;
end $$;

-- Does an upload succeed? (the trigger's answer, as the app would experience it)
create or replace function pg_temp.upload_allowed(uid uuid) returns boolean
language plpgsql as $$
begin
  begin
    insert into public.syllabus_uploads (user_id) values (uid);
    return true;
  exception when others then
    return false;
  end;
end $$;

do $$
declare u uuid; charged text;
begin
  -- 1. free + first parse WITH dated items -> consumed
  insert into auth.users default values returning id into u;
  select public.record_scan_usage(u, false) into charged;
  perform pg_temp.check('1. dated parse writes success', charged = 'success', true);
  perform pg_temp.check('1. free action consumed', public.free_action_used(u), true);

  -- 2. free + first ZERO-DATED parse -> NOT consumed
  insert into auth.users default values returning id into u;
  select public.record_scan_usage(u, true) into charged;
  perform pg_temp.check('2. zero-dated writes courtesy', charged = 'zero_dated', true);
  perform pg_temp.check('2. free action NOT consumed', public.free_action_used(u), false);

  -- 4. courtesy is spent even if the student never uploads/saves
  select public.record_scan_usage(u, true) into charged;
  perform pg_temp.check('4. second zero-dated is charged', charged = 'success', true);
  perform pg_temp.check('3. free action now consumed', public.free_action_used(u), true);
  perform pg_temp.check('9a. only ONE courtesy row exists',
    (select count(*) = 1 from public.scan_usage_log where user_id = u and status='zero_dated'), true);

  -- 5. valid dated parse + abandons review -> still consumed (no upload at all)
  insert into auth.users default values returning id into u;
  perform public.record_scan_usage(u, false);
  perform pg_temp.check('5. abandoned dated parse stays consumed', public.free_action_used(u), true);

  -- 6. NOT_SYLLABUS -> nothing recorded, nothing consumed
  insert into auth.users default values returning id into u;
  perform pg_temp.check('6. NOT_SYLLABUS leaves action available', public.free_action_used(u), false);

  -- 7. failed parse -> unchanged
  insert into auth.users default values returning id into u;
  insert into public.scan_usage_log (user_id, status) values (u, 'failed');
  perform pg_temp.check('7. failed parse does not consume', public.free_action_used(u), false);

  -- 8. Pro user unaffected: no courtesy granted, ledger keeps its old shape
  insert into auth.users default values returning id into u;
  insert into public.entitlements (user_id, is_pro, expires_at) values (u, true, now() + interval '1 year');
  select public.record_scan_usage(u, true) into charged;
  perform pg_temp.check('8. Pro zero-dated writes success, not courtesy', charged = 'success', true);
  perform pg_temp.check('8. Pro has no courtesy row',
    (select count(*) = 0 from public.scan_usage_log where user_id = u and status='zero_dated'), true);
end $$;

-- 9b. The DATABASE, not the caller, enforces one courtesy per account.
do $$
declare u uuid; ok boolean := false;
begin
  insert into auth.users default values returning id into u;
  insert into public.scan_usage_log (user_id, status) values (u, 'zero_dated');
  begin
    insert into public.scan_usage_log (user_id, status) values (u, 'zero_dated');
  exception when unique_violation then ok := true;
  end;
  perform pg_temp.check('9b. duplicate courtesy rejected by unique index', ok, true);
end $$;

-- 10. free_action_used() and enforce_free_scan_limit() agree, case by case.
do $$
declare u uuid;
begin
  -- courtesy user: app says available, trigger must allow the upload
  insert into auth.users default values returning id into u;
  perform public.record_scan_usage(u, true);
  perform pg_temp.check('10a. courtesy: app says available', public.free_action_used(u), false);
  perform pg_temp.check('10a. courtesy: trigger allows upload', pg_temp.upload_allowed(u), true);
  perform pg_temp.check('10a. courtesy upload marked non-counting',
    (select counts_toward_free_action = false from public.syllabus_uploads where user_id = u), true);
  -- and after claiming, the app STILL says available (that is the point)
  perform pg_temp.check('10a. still available after courtesy upload', public.free_action_used(u), false);

  -- Now the real scan. The trigger's contract is "was a PREVIOUS action
  -- spent?" — it deliberately cannot call free_action_used(), because by the
  -- time it fires the ledger already holds the scan in flight (071's ordering
  -- hazard). So the upload for THIS scan must still be allowed...
  perform public.record_scan_usage(u, false);
  perform pg_temp.check('10b. after real scan: app says used', public.free_action_used(u), true);
  perform pg_temp.check('10b. the in-flight scan''s own upload is allowed', pg_temp.upload_allowed(u), true);
  -- ...and only AFTER that counting upload exists does the backstop refuse.
  perform pg_temp.check('10b. a further upload is refused', pg_temp.upload_allowed(u), false);
  perform pg_temp.check('10b. exactly one counting upload',
    (select count(*) = 1 from public.syllabus_uploads where user_id = u and counts_toward_free_action), true);

  -- Normal user, no courtesy involved: same contract as 10b. The scan in
  -- flight gets its upload; the one after it is refused.
  insert into auth.users default values returning id into u;
  perform public.record_scan_usage(u, false);
  perform pg_temp.check('10c. normal: app says used', public.free_action_used(u), true);
  perform pg_temp.check('10c. normal: in-flight upload allowed', pg_temp.upload_allowed(u), true);
  perform pg_temp.check('10c. normal: next upload refused', pg_temp.upload_allowed(u), false);

  -- pro: always allowed
  insert into auth.users default values returning id into u;
  insert into public.entitlements (user_id, is_pro, expires_at) values (u, true, now() + interval '1 year');
  perform public.record_scan_usage(u, false);
  perform pg_temp.check('10d. pro: trigger allows', pg_temp.upload_allowed(u), true);
  perform pg_temp.check('10d. pro: trigger allows again', pg_temp.upload_allowed(u), true);
end $$;

-- 12. Pre-existing users are exactly as they were.
do $$
begin
  perform pg_temp.check('12. legacy spent user still spent',
    public.free_action_used('11111111-1111-1111-1111-111111111111'), true);
  perform pg_temp.check('12. legacy pro still unspent',
    public.free_action_used('22222222-2222-2222-2222-222222222222'), false);
end $$;

-- CONCURRENCY (verified 2026-08-26, two overlapping psql sessions):
--   A: begin; select record_scan_usage(u, true); pg_sleep(3); commit;   -> 'zero_dated'
--   B: select record_scan_usage(u, true);  (while A is uncommitted)     -> 'success'
-- B blocked on scan_usage_log_one_courtesy_per_user, then fell through to the
-- charge. Final state: exactly one courtesy row, one charged row,
-- free_action_used = true. Two simultaneous zero-dated parses cannot both be
-- excused, and the guarantee is the index — not the caller.
