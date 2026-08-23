-- SEMORA (093): record WHICH Apple environment an entitlement came from.
--
-- Apple tells us this on every validation — `environment` on a StoreKit 2
-- signed transaction, and on the verifyReceipt response for the legacy
-- path — and until now validate-receipt read it once, for the
-- BLOCK_SANDBOX_PRO gate, and threw it away.
--
-- Throwing it away is why a Sandbox subscription is indistinguishable from
-- a paid one in this table. Sandbox durations are compressed (a month is
-- five minutes, a year is one hour), so a tester's subscription lapses
-- almost immediately and leaves behind a row that looks exactly like a
-- paying customer who mysteriously lost access. On 2026-08-22 that cost a
-- real afternoon of investigation, and the question "did this person
-- actually pay us?" could not be answered from the database at all.
--
-- Deliberately NOT a check constraint: Apple owns this vocabulary
-- ('Production' | 'Sandbox' today), and a new value must never be the
-- reason a paying customer's entitlement fails to write.
--
-- NULL means "recorded before 093, or Apple did not say" — it is not a
-- synonym for Production. Revenue queries should filter
-- `environment is distinct from 'Sandbox'` rather than `= 'Production'`,
-- so historical rows keep counting.
alter table public.entitlements
  add column if not exists environment text;

comment on column public.entitlements.environment is
  'SEMORA (093): Apple environment this entitlement was validated in — ''Production'' | ''Sandbox'' | null (unknown/pre-093). Written by validate-receipt. Sandbox rows are testers and App Review, never revenue.';

-- Operators ask "who is paying us" far more often than they ask about a
-- single user, and that question is now a filtered scan of this table.
create index if not exists entitlements_environment_idx
  on public.entitlements (environment)
  where environment is not null;
