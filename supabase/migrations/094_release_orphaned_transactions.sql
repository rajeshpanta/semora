-- SEMORA (094): let a deleted account RELEASE its Apple transaction.
--
-- consumed_transactions exists so that deleting an account cannot be used to
-- launder a subscription onto a second account: the entitlement row CASCADEs
-- away, but the ledger row survives and blocks the re-claim. That is the
-- right instinct and it stays.
--
-- What it got wrong is that the row was a bare tombstone — an id and a date,
-- with no record of WHO consumed it. So once the owning account was gone,
-- validate-receipt could tell that *someone* had claimed the transaction but
-- not that the someone no longer existed, and answered every future attempt
-- with "linked to a deleted account" — including the rightful Apple ID's.
--
-- Observed in production: transaction ...940349 was consumed 2026-08-12, its
-- account was deleted, and the subscriber who came back on 2026-08-17 and
-- 2026-08-18 was refused both times. Apple kept billing. Nobody held the Pro.
-- The row was unclaimable by anyone, forever.
--
-- The fix is to record the owner and let Postgres maintain it:
-- `on delete set null` means claimed_by becomes NULL exactly when the owning
-- account is deleted. A NULL claimed_by therefore *is* the orphan signal, and
-- it can never drift out of sync with auth.users.
alter table public.consumed_transactions
  add column if not exists claimed_by uuid references auth.users(id) on delete set null,
  add column if not exists claimed_at timestamptz;

comment on column public.consumed_transactions.claimed_by is
  'SEMORA (094): the account currently holding this Apple transaction. NULL means the holder deleted their account (ON DELETE SET NULL) — the transaction is orphaned and the Apple ID presenting a live receipt for it may reclaim it.';

-- Backfill from the live entitlements. Anything with no entitlement row is
-- genuinely orphaned and correctly stays NULL — that is precisely the set
-- validate-receipt may now hand back to its rightful owner.
update public.consumed_transactions c
   set claimed_by = e.user_id,
       claimed_at = coalesce(c.claimed_at, e.updated_at, c.consumed_at)
  from public.entitlements e
 where e.original_transaction_id = c.original_transaction_id
   and c.claimed_by is null;

-- The orphan lookup runs on the purchase path, so keep it cheap.
create index if not exists consumed_transactions_claimed_by_idx
  on public.consumed_transactions (claimed_by);
