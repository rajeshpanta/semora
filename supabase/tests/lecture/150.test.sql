-- Tests for 150 (run after harness.sql and the earlier migrations on a
-- THROWAWAY database). Refunding a scan that produced nothing.
set client_min_messages = warning;

-- The harness is lecture-shaped; the scan ledger and its neighbours are built
-- here in their production shapes, including the status CHECK 150 widens and
-- the counts_toward_free_action flag the insert trigger actually enforces.
create table if not exists public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  is_pro boolean not null default false,
  plan text,
  expires_at timestamptz
);
create table if not exists public.promo_grants (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  reason text,
  expires_at timestamptz
);
create table if not exists public.parse_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  upload_id uuid,
  items_accepted integer,
  items_rejected integer,
  created_at timestamptz not null default now()
);
-- The harness owns scan_usage_log without the production CHECK; add it here so
-- the test exercises the constraint 150 has to widen.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'scan_usage_log_status_check') then
    alter table public.scan_usage_log add constraint scan_usage_log_status_check
      check (status = any (array['success','failed','zero_dated']));
  end if;
end;
$$;
create or replace function public.is_pro(uid uuid) returns boolean
language sql stable as $fn$
  select coalesce((select e.is_pro and (e.expires_at is null or e.expires_at > now())
                     from public.entitlements e where e.user_id = uid limit 1), false)
      or exists (select 1 from public.promo_grants g where g.user_id = uid and g.expires_at > now());
$fn$;
create or replace function public.free_action_used(uid uuid) returns boolean
language sql stable as $fn$
  select exists (select 1 from public.lecture_usage_log where user_id = uid and status = 'success')
      or exists (select 1 from public.scan_usage_log where user_id = uid and status = 'success')
      or exists (select 1 from public.syllabus_uploads where user_id = uid and counts_toward_free_action);
$fn$;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000002b1'),  -- scan found nothing: refund
  ('00000000-0000-0000-0000-0000000002b2'),  -- scan found 12 items: no refund
  ('00000000-0000-0000-0000-0000000002b3'),  -- Pro: nothing to refund
  ('00000000-0000-0000-0000-0000000002b4'),  -- a lecture spent the action
  ('00000000-0000-0000-0000-0000000002b5');  -- scanned 3 minutes ago, still parsing
insert into public.profiles (id, preferred_language)
  select id, 'en' from auth.users where id::text like '00000000-0000-0000-0000-0000000002b%';

insert into public.entitlements (user_id, is_pro, plan, expires_at)
values ('00000000-0000-0000-0000-0000000002b3', true, 'monthly', now() + interval '20 days');

-- syllabus_uploads requires a course; one shared stand-in is enough.
insert into public.courses (id, user_id, semester_id, name)
values ('22222222-0000-0000-0000-0000000002b0', '00000000-0000-0000-0000-0000000002b1',
        '33333333-0000-0000-0000-0000000002b0', 'Test course');

-- b1: an upload, a parse that accepted nothing, a spent action.
insert into public.syllabus_uploads (id, user_id, course_id, storage_path, file_name, counts_toward_free_action, created_at) values
  ('11111111-0000-0000-0000-0000000002b1', '00000000-0000-0000-0000-0000000002b1', '22222222-0000-0000-0000-0000000002b0', 'x/y.pdf', 'y.pdf', true, now() - interval '3 days');
insert into public.parse_runs (user_id, upload_id, items_accepted) values
  ('00000000-0000-0000-0000-0000000002b1', '11111111-0000-0000-0000-0000000002b1', 0);
insert into public.scan_usage_log (user_id, upload_id, status, created_at) values
  ('00000000-0000-0000-0000-0000000002b1', '11111111-0000-0000-0000-0000000002b1', 'success', now() - interval '3 days');

-- b2: the product worked.
insert into public.syllabus_uploads (id, user_id, course_id, storage_path, file_name, counts_toward_free_action, created_at) values
  ('11111111-0000-0000-0000-0000000002b2', '00000000-0000-0000-0000-0000000002b2', '22222222-0000-0000-0000-0000000002b0', 'x/y.pdf', 'y.pdf', true, now() - interval '2 days');
insert into public.parse_runs (user_id, upload_id, items_accepted) values
  ('00000000-0000-0000-0000-0000000002b2', '11111111-0000-0000-0000-0000000002b2', 12);
insert into public.scan_usage_log (user_id, upload_id, status, created_at) values
  ('00000000-0000-0000-0000-0000000002b2', '11111111-0000-0000-0000-0000000002b2', 'success', now() - interval '2 days');

-- b3: Pro, and its scan also found nothing.
insert into public.syllabus_uploads (id, user_id, course_id, storage_path, file_name, counts_toward_free_action, created_at) values
  ('11111111-0000-0000-0000-0000000002b3', '00000000-0000-0000-0000-0000000002b3', '22222222-0000-0000-0000-0000000002b0', 'x/y.pdf', 'y.pdf', true, now() - interval '1 day');
insert into public.scan_usage_log (user_id, upload_id, status, created_at) values
  ('00000000-0000-0000-0000-0000000002b3', '11111111-0000-0000-0000-0000000002b3', 'success', now() - interval '1 day');

-- b4: the action went on a lecture; an empty scan does not buy it back.
insert into public.lecture_usage_log (user_id, status, created_at) values
  ('00000000-0000-0000-0000-0000000002b4', 'success', now() - interval '5 days');
insert into public.scan_usage_log (user_id, status, created_at) values
  ('00000000-0000-0000-0000-0000000002b4', 'success', now() - interval '4 days');

-- b5: scanned minutes ago; the parse may still be running.
insert into public.syllabus_uploads (id, user_id, course_id, storage_path, file_name, counts_toward_free_action, created_at) values
  ('11111111-0000-0000-0000-0000000002b5', '00000000-0000-0000-0000-0000000002b5', '22222222-0000-0000-0000-0000000002b0', 'x/y.pdf', 'y.pdf', true, now() - interval '3 minutes');
insert into public.scan_usage_log (user_id, upload_id, status, created_at) values
  ('00000000-0000-0000-0000-0000000002b5', '11111111-0000-0000-0000-0000000002b5', 'success', now() - interval '3 minutes');

-- ── 1. exactly the student who got nothing ─────────────────────────────────
do $$
declare
  n integer;
begin
  n := public.refund_empty_scans();
  if n <> 1 then
    raise exception '150.1 expected 1 refund, got %', n;
  end if;
  if not exists (select 1 from public.scan_usage_log where user_id = '00000000-0000-0000-0000-0000000002b1' and status = 'refunded') then
    raise exception '150.1 the empty scan was not refunded';
  end if;
  if exists (select 1 from public.scan_usage_log where user_id = '00000000-0000-0000-0000-0000000002b2' and status = 'refunded') then
    raise exception '150.1 a scan that produced 12 items was refunded';
  end if;
  if exists (select 1 from public.scan_usage_log where user_id = '00000000-0000-0000-0000-0000000002b3' and status = 'refunded') then
    raise exception '150.1 a Pro account was refunded a free action it does not use';
  end if;
  if exists (select 1 from public.scan_usage_log where user_id = '00000000-0000-0000-0000-0000000002b4' and status = 'refunded') then
    raise exception '150.1 a lecture-spent action was refunded through the scan ledger';
  end if;
  if exists (select 1 from public.scan_usage_log where user_id = '00000000-0000-0000-0000-0000000002b5' and status = 'refunded') then
    raise exception '150.1 a scan from three minutes ago was called a failure';
  end if;
end;
$$;

-- ── 2. the refund actually gives the scan back ─────────────────────────────
do $$
begin
  -- Both gates, not just the visible one: free_action_used() reads the ledger,
  -- enforce_free_scan_limit() counts counts_toward_free_action.
  if public.free_action_used('00000000-0000-0000-0000-0000000002b1') then
    raise exception '150.2 the student is still told their action is spent';
  end if;
  if exists (
    select 1 from public.syllabus_uploads
    where user_id = '00000000-0000-0000-0000-0000000002b1' and counts_toward_free_action
  ) then
    raise exception '150.2 the upload still counts, so the next scan would be refused';
  end if;
  -- and the history is intact
  if not exists (select 1 from public.scan_usage_log where user_id = '00000000-0000-0000-0000-0000000002b1') then
    raise exception '150.2 the scan row was deleted instead of marked';
  end if;
  if (select refunded_at from public.scan_usage_log where user_id = '00000000-0000-0000-0000-0000000002b1' and status = 'refunded') is null then
    raise exception '150.2 refunded_at was not stamped';
  end if;
end;
$$;

-- ── 3. once per account, for life ──────────────────────────────────────────
do $$
declare
  n integer;
begin
  -- A second empty scan after the refund must not earn a second one.
  insert into public.syllabus_uploads (id, user_id, course_id, storage_path, file_name, counts_toward_free_action, created_at) values
    ('11111111-0000-0000-0000-0000000002c1', '00000000-0000-0000-0000-0000000002b1', '22222222-0000-0000-0000-0000000002b0', 'x/z.pdf', 'z.pdf', true, now() - interval '2 hours');
  insert into public.scan_usage_log (user_id, upload_id, status, created_at) values
    ('00000000-0000-0000-0000-0000000002b1', '11111111-0000-0000-0000-0000000002c1', 'success', now() - interval '2 hours');

  n := public.refund_empty_scans();
  if n <> 0 then
    raise exception '150.3 a second refund was granted (%), so a blank page is unlimited free AI', n;
  end if;
  if (select count(*) from public.scan_usage_log where user_id = '00000000-0000-0000-0000-0000000002b1' and status = 'refunded') <> 1 then
    raise exception '150.3 more than one refunded row exists for one account';
  end if;
end;
$$;

-- ── 4. the cap is the database's, not the job's ────────────────────────────
do $$
begin
  begin
    insert into public.scan_usage_log (user_id, status, refunded_at)
    values ('00000000-0000-0000-0000-0000000002b1', 'refunded', now());
    raise exception '150.4 a second refunded row was accepted by the table';
  exception
    when unique_violation then null;  -- expected
  end;
end;
$$;

-- ── 5. nobody in the app can call it ───────────────────────────────────────
do $$
begin
  if has_function_privilege('anon', 'public.refund_empty_scans(integer)', 'execute')
     or has_function_privilege('authenticated', 'public.refund_empty_scans(integer)', 'execute') then
    raise exception '150.5 a client can refund its own free action';
  end if;
end;
$$;

select '150 ok' as result;
