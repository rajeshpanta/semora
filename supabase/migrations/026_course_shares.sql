-- ============================================================
-- COURSE SHARES — copy-on-join course sharing ("get my classmate's deadlines")
-- ============================================================
-- One row per share link a Pro user creates. The link carries an
-- unguessable token; a RECIPIENT (any authenticated user, free or Pro)
-- resolves the token to a point-in-time SNAPSHOT of the course + its
-- tasks and writes a PRIVATE COPY into their own account. Nothing is
-- ever shared live — the snapshot is captured at share time so the
-- recipient never gains read access to the owner's rows, and later
-- edits/deletes by the owner don't leak.
--
-- Trust model:
--   * SENDING (create a share) is Pro-gated + owner-checked, enforced
--     server-side in the share-course edge function (build the snapshot
--     atomically there). No client INSERT policy on this table.
--   * RECEIVING (resolve a token → import) is FREE — this is the growth
--     loop. A recipient must be able to read a share row they DON'T own,
--     but ONLY by presenting the exact token, and ONLY the snapshot (never
--     the owner_user_id or the whole table). That's the resolve_course_share
--     SECURITY DEFINER RPC below — modeled on migration 009's is_pro and
--     migration 015's parent_row_user_id (SECURITY DEFINER + grant-to-role).
--
-- SEMORA-owned (verify against supabase/SUPABASE_OWNERSHIP.md). Additive
-- only. Tenant safety mirrors migration 015/018/025: owner_user_id is a
-- denormalized FK, RLS scopes SELECT/mutations to the owner, and a BEFORE
-- INSERT/UPDATE trigger asserts course_id resolves to the same owner
-- (reusing parent_row_user_id() from migration 015). Tagged via COMMENT.
-- ============================================================

create table if not exists public.course_shares (
  id uuid primary key default gen_random_uuid(),
  -- Unguessable share token. Generated server-side by the edge function
  -- (crypto.randomUUID + extra entropy); unique so a link maps to exactly
  -- one share. This is the ONLY key a recipient presents to resolve.
  token text not null unique,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  -- Point-in-time capture of the course + its task list at share time.
  -- Shape (built by the edge function):
  --   { "course": { name, instructor, color, icon, grade_scale },
  --     "tasks": [ { title, type, due_date, due_time, weight, description,
  --                  is_extra_credit }, ... ],
  --     "owner_name": "Alex" | null,
  --     "shared_at": "<iso>" }
  -- Snapshot, NOT a live join — the recipient copies from here, so the
  -- owner's later edits/deletes never reach an already-created copy and the
  -- recipient never reads the owner's actual course/task rows.
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  -- Nullable — a share can be open-ended. When set and past, resolve returns
  -- an 'expired' status instead of the snapshot.
  expires_at timestamptz,
  -- Owner can kill a link without deleting the row (keeps analytics/history).
  revoked boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists course_shares_owner_user_id_idx
  on public.course_shares(owner_user_id, created_at desc);
create index if not exists course_shares_course_id_idx
  on public.course_shares(course_id);

comment on table public.course_shares is
  'SEMORA: copy-on-join course sharing. token → snapshot of a course + its tasks; recipients import a private copy. Sending is Pro; receiving is free.';

-- ─── updated_at trigger ─────────────────────────────────────────
-- Mirror the convention used across Semora tables (see 009 entitlements).
create or replace function public.course_shares_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists course_shares_set_updated_at_trigger on public.course_shares;
create trigger course_shares_set_updated_at_trigger
  before update on public.course_shares
  for each row execute function public.course_shares_set_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────
-- OWNER-ONLY table access. A recipient does NOT get a SELECT policy here —
-- they read the snapshot exclusively through resolve_course_share(token)
-- below (so they can never enumerate the table, read owner_user_id, or list
-- other users' shares). No client INSERT/UPDATE/DELETE policy other than the
-- owner managing their OWN rows: creation itself happens service-side in the
-- edge function (Pro + ownership enforced there), but the owner is still
-- allowed to revoke/delete their own links directly.
alter table public.course_shares enable row level security;

create policy "owner reads own course shares" on public.course_shares
  for select to authenticated
  using (auth.uid() = owner_user_id);

create policy "owner updates own course shares" on public.course_shares
  for update to authenticated
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

create policy "owner deletes own course shares" on public.course_shares
  for delete to authenticated
  using (auth.uid() = owner_user_id);

-- Deliberately NO insert policy for clients: the share-course edge function
-- (service role) is the only writer, so a client can't fabricate a share for
-- a course it doesn't own or bypass the Pro gate.

-- ─── Cross-tenant FK protection ─────────────────────────────────
-- Reuses parent_row_user_id() from migration 015. Even though creation is
-- service-side, the trigger is defense-in-depth: course_id must resolve to a
-- course owned by owner_user_id. Mirrors the tasks/course_meetings triggers.
create or replace function public.course_shares_assert_parent_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  parent_user uuid;
begin
  parent_user := public.parent_row_user_id('public.courses'::regclass, new.course_id);
  if parent_user is null then
    raise exception 'Referenced course does not exist'
      using errcode = '23503';
  end if;
  if parent_user <> new.owner_user_id then
    raise exception 'Cross-tenant write blocked: course share cannot reference a course owned by another user'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists course_shares_assert_parent_owner_trigger on public.course_shares;
create trigger course_shares_assert_parent_owner_trigger
  before insert or update of course_id, owner_user_id on public.course_shares
  for each row execute function public.course_shares_assert_parent_owner();

-- ============================================================
-- resolve_course_share(token) — recipient read path
-- ============================================================
-- Returns the SNAPSHOT (plus a status) for ANY authenticated user who
-- presents the exact token, WITHOUT exposing the course_shares table for
-- select to non-owners. SECURITY DEFINER so it can read a row the caller
-- doesn't own; it returns ONLY snapshot-derived data, never owner_user_id
-- or the internal ids, so it can't be used to enumerate shares or users.
--
-- Returned json shape:
--   { "status": "ok" | "not_found" | "expired" | "revoked",
--     "snapshot": <the jsonb snapshot> | null }
-- The caller (lib/shareCourse.importSharedCourse) branches on status so the
-- join screen can show a clean "link expired / revoked / invalid" state
-- instead of a generic error.
--
-- Modeled on migration 009's is_pro (SECURITY DEFINER + explicit grant to
-- authenticated, revoke from public/anon).
create or replace function public.resolve_course_share(share_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  rec public.course_shares%rowtype;
begin
  if share_token is null or length(share_token) = 0 then
    return jsonb_build_object('status', 'not_found', 'snapshot', null);
  end if;

  select * into rec
  from public.course_shares
  where token = share_token
  limit 1;

  if not found then
    return jsonb_build_object('status', 'not_found', 'snapshot', null);
  end if;
  if rec.revoked then
    return jsonb_build_object('status', 'revoked', 'snapshot', null);
  end if;
  if rec.expires_at is not null and rec.expires_at <= now() then
    return jsonb_build_object('status', 'expired', 'snapshot', null);
  end if;

  return jsonb_build_object('status', 'ok', 'snapshot', rec.snapshot);
end;
$$;

-- Only authenticated users can resolve a token (a recipient must be signed
-- in to import — the join screen sends signed-out users through onboarding/
-- auth first and resumes afterward). anon/public get nothing.
revoke all on function public.resolve_course_share(text) from public, anon;
grant execute on function public.resolve_course_share(text) to authenticated;
-- service_role (the edge function) may also resolve for completeness.
grant execute on function public.resolve_course_share(text) to service_role;
