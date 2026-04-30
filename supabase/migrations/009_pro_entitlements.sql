-- ============================================================
-- PRO ENTITLEMENTS
-- ============================================================
-- Server-validated entitlement table. The client never writes
-- to this directly — only the validate-receipt edge function
-- (running with service role) inserts/updates rows here after
-- it has validated a StoreKit/Play receipt with Apple/Google.
--
-- The `is_pro` SQL function below is the single source of truth
-- for Pro status everywhere in the database (RLS, triggers).
-- ============================================================

create table public.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_pro boolean not null default false,
  plan text check (plan in ('monthly', 'annual', null)),
  expires_at timestamptz,
  original_transaction_id text,
  product_id text,
  platform text check (platform in ('ios', 'android', null)),
  last_validated_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- One Apple subscription = one Semora account. Prevents StoreKit
-- cross-account carry-over: if user A buys Pro and user B signs in
-- on the same device, B can't claim A's transaction. NULLs allowed
-- so multiple "free" rows (where original_transaction_id is null)
-- can coexist.
create unique index entitlements_original_transaction_id_key
  on public.entitlements (original_transaction_id)
  where original_transaction_id is not null;

alter table public.entitlements enable row level security;

-- Users can read their own entitlement only
create policy "users read own entitlement"
  on public.entitlements
  for select
  using (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies for clients — service role bypasses RLS
-- and is the only way to write entitlements (via validate-receipt edge fn).

-- ============================================================
-- is_pro(uuid) — single source of truth
-- ============================================================
-- Returns true if the user has an active, unexpired entitlement.
-- Used by RLS policies and BEFORE INSERT triggers below.
-- SECURITY DEFINER so it can read entitlements from any context
-- (including triggers running as the inserting user).
-- ============================================================
create or replace function public.is_pro(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select e.is_pro
        and (e.expires_at is null or e.expires_at > now())
      from public.entitlements e
      where e.user_id = uid
      limit 1
    ),
    false
  );
$$;

-- Convenience wrapper for the calling user
create or replace function public.current_user_is_pro()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_pro(auth.uid());
$$;

-- Don't expose the internal helper publicly — only the wrapper
revoke all on function public.is_pro(uuid) from public, anon, authenticated;
grant execute on function public.is_pro(uuid) to service_role;
grant execute on function public.current_user_is_pro() to authenticated;

-- ============================================================
-- FREE TIER LIMITS (server-enforced)
-- ============================================================
-- These triggers prevent free users from creating courses/uploads
-- past the limit, even if they bypass the client checks (e.g.,
-- by hitting the REST API with a valid JWT).
-- ============================================================

-- 2 courses per semester for free users
create or replace function public.enforce_free_course_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  course_count integer;
begin
  -- Pro users have no limit
  if public.is_pro(new.user_id) then
    return new;
  end if;

  select count(*) into course_count
  from public.courses
  where user_id = new.user_id
    and semester_id = new.semester_id;

  if course_count >= 2 then
    raise exception 'Free accounts support up to 2 courses per semester. Upgrade to Pro for unlimited courses.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_free_course_limit_trigger on public.courses;
create trigger enforce_free_course_limit_trigger
  before insert on public.courses
  for each row execute function public.enforce_free_course_limit();

-- 2 lifetime scans for free users
create or replace function public.enforce_free_scan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  scan_count integer;
begin
  if public.is_pro(new.user_id) then
    return new;
  end if;

  select count(*) into scan_count
  from public.syllabus_uploads
  where user_id = new.user_id;

  if scan_count >= 2 then
    raise exception 'You''ve used your 2 free scans. Upgrade to Pro for unlimited syllabus scanning.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_free_scan_limit_trigger on public.syllabus_uploads;
create trigger enforce_free_scan_limit_trigger
  before insert on public.syllabus_uploads
  for each row execute function public.enforce_free_scan_limit();
