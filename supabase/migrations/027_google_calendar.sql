-- ============================================================
-- GOOGLE CALENDAR SYNC (Pro feature)
-- ============================================================
-- One-way push of the user's incomplete tasks (and optionally class
-- meetings) into their Google Calendar via the Google Calendar REST
-- API. Complements the device (EventKit) sync in lib/calendarSync.ts
-- and the shipped .ics export — this variant works for users whose
-- primary calendar is Google, without a device round-trip.
--
-- Two objects ship here:
--
--   * google_calendar_tokens — per-user OAuth token store. Holds the
--     REFRESH token (long-lived, offline server access) plus a cached
--     access token. THESE ARE SECRETS: there is NO client access at all
--     (no RLS policies → every client read/write is denied; only the
--     service_role google-cal-sync edge function touches this table).
--     Mirrors the entitlements service-role-only pattern (migration 009),
--     but stricter — entitlements lets the owner SELECT their row; here
--     even SELECT is denied because a leaked refresh token is a
--     full-account Google credential.
--
--   * task_google_event_map — task_id → the Google event id it created.
--     Drives idempotent upsert/delete on re-sync (mirrors the SecureStore
--     event map in lib/calendarSync.ts, but server-side because the sync
--     runs in the edge function). Owner-readable under RLS (it holds no
--     secret — just opaque Google event ids), but writes are service-role.
--
-- SEMORA-owned (verified against supabase/SUPABASE_OWNERSHIP.md; the
-- shared Citizen app is never touched here). Additive only. RLS +
-- updated_at trigger + cross-tenant-FK conventions mirror migrations
-- 009 / 015 / 018 / 023 / 025. Tables tagged via COMMENT ON TABLE per
-- the ownership convention so the shared-project audit can attribute them.
-- ============================================================

-- ─── google_calendar_tokens ─────────────────────────────────────
-- One row per user (user_id is the PK). google_calendar_id is the id of
-- the dedicated "Semora" calendar the edge function creates/finds in the
-- user's Google account (nullable until 'connect' provisions it).
-- sync_enabled mirrors the SecureStore SYNCED_ENABLED_KEY flag — set true
-- on connect, false on disconnect or on graceful revocation handling.
create table if not exists public.google_calendar_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text,
  access_token text,
  expires_at timestamptz,
  -- The dedicated "Semora" Google calendar id (calendarList entry).
  -- Nullable: a row can exist (tokens stored) before the calendar is
  -- provisioned, and a graceful-revocation path may null the tokens while
  -- keeping the row for the map's FK.
  google_calendar_id text,
  sync_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.google_calendar_tokens is
  'SEMORA: per-user Google Calendar OAuth tokens (Pro). SECRETS — service-role only, no client access.';

-- ─── task_google_event_map ──────────────────────────────────────
-- task_id → google_event_id. One row per synced task. Cascades on task
-- delete so a removed task's mapping never dangles. Unique on
-- (user_id, task_id) so re-sync upserts in place instead of stacking
-- duplicate mappings. Holds no secret — just the opaque Google event id —
-- so the owner may SELECT it; writes stay service-role (the edge function
-- maintains it during 'sync').
create table if not exists public.task_google_event_map (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  google_event_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_google_event_map_user_task_key unique (user_id, task_id)
);

create index if not exists task_google_event_map_user_id_idx
  on public.task_google_event_map(user_id);

comment on table public.task_google_event_map is
  'SEMORA: task_id → Google Calendar event id for one-way sync (Pro). Owner-readable; writes service-role.';

-- ─── RLS ─────────────────────────────────────────────────────────
-- google_calendar_tokens: RLS ENABLED with NO policies → the default-deny
-- applies to every client role (anon + authenticated). Only the
-- service_role client (google-cal-sync edge function) can read/write,
-- because service_role bypasses RLS. Tokens are secrets — the owner must
-- NOT be able to read their own refresh token back out.
alter table public.google_calendar_tokens enable row level security;
-- (intentionally no policies)

-- task_google_event_map: owner may SELECT their own rows (a future
-- "N tasks synced to Google" pill can read it). No client INSERT/UPDATE/
-- DELETE policy — the edge function maintains the map service-side so a
-- client can't fabricate or corrupt mappings.
alter table public.task_google_event_map enable row level security;

create policy "read_own_task_google_event_map" on public.task_google_event_map
  for select to authenticated
  using (auth.uid() = user_id);

-- ─── updated_at triggers ─────────────────────────────────────────
-- Self-contained per-table trigger, same shape as push_tokens (023).
-- No shared moddatetime trigger exists in earlier migrations.
create or replace function public.google_calendar_tokens_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists google_calendar_tokens_set_updated_at_trigger on public.google_calendar_tokens;
create trigger google_calendar_tokens_set_updated_at_trigger
  before update on public.google_calendar_tokens
  for each row execute function public.google_calendar_tokens_set_updated_at();

create or replace function public.task_google_event_map_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists task_google_event_map_set_updated_at_trigger on public.task_google_event_map;
create trigger task_google_event_map_set_updated_at_trigger
  before update on public.task_google_event_map
  for each row execute function public.task_google_event_map_set_updated_at();

-- ─── Cross-tenant FK protection ─────────────────────────────────
-- Reuses parent_row_user_id() from migration 015. task_google_event_map
-- carries a denormalized user_id and an FK to tasks; assert the referenced
-- task is owned by the same user as the row being written (mirrors the
-- tasks/course_notes triggers). google_calendar_tokens has no cross-tenant
-- FK (user_id is its only FK, straight to auth.users), so it needs none.
create or replace function public.task_google_event_map_assert_parent_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  parent_user uuid;
begin
  parent_user := public.parent_row_user_id('public.tasks'::regclass, new.task_id);
  if parent_user is null then
    raise exception 'Referenced task does not exist'
      using errcode = '23503';
  end if;
  if parent_user <> new.user_id then
    raise exception 'Cross-tenant write blocked: event mapping cannot reference a task owned by another user'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists task_google_event_map_assert_parent_owner_trigger on public.task_google_event_map;
create trigger task_google_event_map_assert_parent_owner_trigger
  before insert or update of task_id, user_id on public.task_google_event_map
  for each row execute function public.task_google_event_map_assert_parent_owner();
