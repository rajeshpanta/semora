-- ============================================================
-- CONSUMED TRANSACTIONS LEDGER
-- ============================================================
-- Append-only record of every Apple original_transaction_id that
-- has ever been bound to a Semora account.
--
-- Why this exists: the entitlements table is keyed on user_id and
-- CASCADEs on account delete. Without this ledger, the sequence
--   1. user A subscribes (entitlement row + ledger row)
--   2. user A deletes account (entitlement row CASCADE-removed)
--   3. user A's Apple subscription keeps renewing (no Semora cancel)
--   4. user B signs in on the same device
-- would let user B claim user A's still-paying subscription —
-- because validate-receipt would find no row for that OTI in
-- entitlements anymore. The ledger survives the CASCADE so the
-- edge function can reject the rebind.
--
-- Trade-off: a user who deletes their Semora account can never
-- re-claim their Apple subscription on a new Semora account
-- without support intervention. Documented; acceptable for MVP.
-- ============================================================

create table public.consumed_transactions (
  original_transaction_id text primary key,
  consumed_at timestamptz not null default now()
);

-- Service-role only. No RLS policies = no client access.
-- Edge function with service role bypasses RLS to read/write.
alter table public.consumed_transactions enable row level security;
