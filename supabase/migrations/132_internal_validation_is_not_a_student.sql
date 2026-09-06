-- ============================================================
-- INTERNAL VALIDATION CAPACITY — separate from the student cost guard
-- ============================================================
-- The Tutor's 50-message rolling-24h cap (DAILY_MESSAGE_CAP in the
-- tutor-chat function) exists to bound AI spend on a STUDENT account, and
-- it is deliberately enforced even for Pro. Measured against real usage it
-- has never bound anyone: across 31 active user-days the busiest single day
-- was 22 messages, the average 4.3, and no day ever reached 50.
--
-- The only thing it has ever blocked is our own controlled production
-- validation, which is a burst workload — a phase QA matrix spends in two
-- hours what a student spends in two weeks, and because the calls land
-- together the whole block ages out together, costing ~21 hours.
--
-- Raising the cap globally, or via the TUTOR_DAILY_CAP env var, would lift
-- the guard for every real student. That is the wrong trade. What is
-- actually needed is to stop conflating two different things:
--
--     REAL USER PRODUCT QUOTA   — the cost safeguard. Unchanged, for everyone.
--     INTERNAL VALIDATION CAP   — a named, expiring, per-account allowance.
--
-- This migration adds the second as the smallest object that can express it,
-- and teaches the existing reservation function to notice it. No student
-- code path changes; the tutor-chat function is not modified at all and
-- still passes the same cap it always has.
--
-- WHY IT IS SAFE, concretely:
--   * try_consume_tutor_usage was ALREADY service_role-only (migration 025
--     revokes execute from public/anon/authenticated). A client cannot reach
--     this logic to begin with, with or without this change.
--   * The uid it receives is taken from a verified JWT in the edge function
--     (userClient.auth.getUser()), never from the request body — so a client
--     cannot nominate a different account, let alone nominate itself as QA.
--   * The allowance lives in a table with RLS on and NO policy, plus an
--     explicit revoke. It is unreadable and unwritable by anon and
--     authenticated. Only service_role and direct SQL can touch it.
--   * It can only ever RAISE a cap, never lower one, so a bad row cannot
--     restrict a real student.
--   * expires_at is NOT NULL and is filtered on read, so a forgotten grant
--     stops working by itself. Missing row, expired row, or a NULL anywhere
--     all fall through to the normal cap: it fails closed in every direction.
--   * daily_cap is bounded by a CHECK, so even a fat-fingered grant cannot
--     be unlimited.
--   * tutor_usage rows are still written for every QA call, and ai_call_log
--     still records every model call. Nothing is exempted from telemetry —
--     internal spend stays measured, which is the whole point of the ledger.
--
-- This migration deliberately creates the MECHANISM ONLY. It grants nothing.
-- Hardcoding an account id here would put a QA identity into schema that
-- ships to every environment, and would fail outright on a fresh database
-- where that account does not exist. Grants are one-off INSERTs run against
-- the environment that needs them, each carrying its own note and expiry.
--
-- SEMORA-owned (verify against supabase/SUPABASE_OWNERSHIP.md). Additive.
-- Removing this feature = drop the table and restore the previous function
-- body; nothing else references it.
-- ============================================================

create table if not exists public.tutor_qa_allowance (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  daily_cap  int not null,
  expires_at timestamptz not null,
  note       text not null,
  created_at timestamptz not null default now(),
  -- A ceiling, not a target. Bounds the blast radius of a mistyped grant:
  -- even the maximum is ~$1.60/day of Luna at the measured per-turn cost.
  constraint tutor_qa_allowance_cap_bounded
    check (daily_cap > 0 and daily_cap <= 2000),
  -- An allowance with no stated reason is not auditable.
  constraint tutor_qa_allowance_note_present
    check (length(btrim(note)) >= 10)
);

comment on table public.tutor_qa_allowance is
  'SEMORA: INTERNAL ONLY. Named, expiring per-account Tutor capacity for controlled production validation. Not a product entitlement, never client-writable, never client-readable. A row only ever raises that account''s rolling-24h cap; absent/expired rows leave the normal cap untouched.';

comment on column public.tutor_qa_allowance.note is
  'Why this allowance exists and who it is for. Required, and read by humans during audit.';

-- No policy is created on purpose. RLS enabled with zero policies denies
-- every authenticated and anon request outright; service_role bypasses RLS.
alter table public.tutor_qa_allowance enable row level security;
revoke all on public.tutor_qa_allowance from anon, authenticated;

-- ─── the reservation function learns about the allowance ────────
-- Body is otherwise byte-for-byte the migration 025 logic: same advisory
-- lock, same rolling window, same count-then-insert atomicity, same return
-- contract. The only addition is the effective-cap lookup.
create or replace function public.try_consume_tutor_usage(uid uuid, cap int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  used          int;
  qa_cap        int;
  effective_cap int := cap;
begin
  perform pg_advisory_xact_lock(hashtext('tutor_usage:' || uid::text));

  -- Internal validation capacity. Deliberately read INSIDE the lock so a
  -- grant that expires mid-burst takes effect on the very next reservation
  -- rather than at some cached boundary.
  select a.daily_cap into qa_cap
    from tutor_qa_allowance a
    where a.user_id = uid
      and a.expires_at > now();

  -- greatest(), not assignment: an allowance may raise a cap and may never
  -- lower one, so a stale or wrong row can never restrict a real account.
  effective_cap := greatest(cap, coalesce(qa_cap, cap));

  select count(*) into used
    from tutor_usage
    where user_id = uid and created_at >= now() - interval '24 hours';
  if used >= effective_cap then
    return false;
  end if;
  insert into tutor_usage (user_id) values (uid);
  return true;
end;
$$;

-- Unchanged from 025, restated so the grant travels with the definition.
revoke all on function public.try_consume_tutor_usage(uuid, int) from public, anon, authenticated;
grant execute on function public.try_consume_tutor_usage(uuid, int) to service_role;
