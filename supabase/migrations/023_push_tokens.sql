-- ============================================================
-- PUSH TOKENS (server-side re-engagement channel)
-- ============================================================
-- Semora is semester-cyclical: students go quiet between terms and
-- LOCAL notifications (lib/notifications.ts) can never reach a closed
-- app. This table stores each device's Expo push token so a server /
-- cron job (send-push edge function) can deliver re-engagement pushes
-- ("your new semester is starting", "N deadlines this week") even when
-- the app isn't running.
--
-- One row per device token. A user with the app on multiple devices has
-- multiple rows; a token that moves between accounts is re-owned via the
-- upsert on the unique `token` (see lib/push.ts).
--
-- SEMORA-owned (verify against supabase/SUPABASE_OWNERSHIP.md). Additive
-- only. Tagged via COMMENT ON TABLE per the ownership convention so the
-- shared-project audit can attribute it correctly.
-- ============================================================

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Expo push token (ExponentPushToken[...]). Unique so a device that
  -- re-signs-in under a different account rebinds the row (onConflict token)
  -- instead of leaving a stale row that would push to the wrong user.
  token text not null unique,
  platform text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sender-side lookup is by user_id (send-push fetches tokens for a set of
-- user_ids). Token is already indexed by the unique constraint above.
create index if not exists push_tokens_user_id_idx on public.push_tokens(user_id);

-- Tag ownership in the DB so the shared-project audit (Semora + Citizen)
-- can attribute this table without cross-referencing the repo.
comment on table public.push_tokens is
  'SEMORA: Expo push tokens for server-side re-engagement notifications. One row per device.';

-- ─── RLS ────────────────────────────────────────────────────────
-- Authenticated users manage ONLY their own rows; no anon access. The
-- service_role client (send-push edge function) bypasses RLS and reads
-- all tokens — no service policy needed (that's the default).
alter table public.push_tokens enable row level security;

create policy "own_push_tokens" on public.push_tokens
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── updated_at trigger ─────────────────────────────────────────
-- Keep updated_at fresh on every UPDATE (e.g. the client re-upserting an
-- existing token). No shared moddatetime trigger exists in earlier
-- migrations, so this migration ships a small self-contained one.
create or replace function public.push_tokens_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists push_tokens_set_updated_at_trigger on public.push_tokens;
create trigger push_tokens_set_updated_at_trigger
  before update on public.push_tokens
  for each row execute function public.push_tokens_set_updated_at();
