-- ============================================================
-- SEPARATE THE STRIPE SUBSCRIPTION ID FROM APPLE'S OTI
-- ============================================================
-- Migration 073 had the Stripe webhook reuse `original_transaction_id` to hold
-- the Stripe subscription id, on the reasoning that the existing unique index
-- would then enforce "one subscription = one account" for Stripe too.
--
-- That reasoning was wrong, and the failure is unrecoverable for the user.
-- `original_transaction_id` is the ONLY place a user is associated with their
-- Apple original transaction: `consumed_transactions` (migration 011) stores
-- the OTI alone, with no user_id. So overwriting the column with a Stripe id
-- destroys that association permanently.
--
-- The sequence that bites: subscribe on iOS -> lapse (the OTI is deliberately
-- retained on the row) -> subscribe on the web (OTI overwritten) -> later
-- re-subscribe through the App Store. Apple reissues the SAME original
-- transaction id, validate-receipt finds no entitlement carrying it, falls
-- through to the consumed_transactions ledger, matches, and returns 409
-- "previously linked to a Semora account that has been deleted". The customer
-- is paying Apple and locked out of Pro on their own account, with no way to
-- fix it themselves.
--
-- Stripe gets its own column. Apple's binding is never touched again.
-- ============================================================

alter table public.entitlements
  add column if not exists stripe_subscription_id text;

-- Same guarantee the Apple OTI index gives: one Stripe subscription can back
-- exactly one Semora account. NULLs are unconstrained so every non-Stripe row
-- can coexist.
create unique index if not exists entitlements_stripe_subscription_id_key
  on public.entitlements (stripe_subscription_id)
  where stripe_subscription_id is not null;

comment on column public.entitlements.stripe_subscription_id is
  'Stripe subscription backing this entitlement. Never reuse original_transaction_id for this: that column is the only user-to-Apple-OTI link in the database.';

-- Repair any row already written by the 073-era webhook. A Stripe subscription
-- id is recognisable by its `sub_` prefix, which Apple original transaction ids
-- (all digits) can never collide with.
update public.entitlements
   set stripe_subscription_id = original_transaction_id,
       original_transaction_id = null
 where platform = 'web'
   and original_transaction_id like 'sub\_%';
