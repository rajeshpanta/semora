-- SEMORA (099): record WHICH Apple transaction a failed validation was about.
--
-- receipt_validation_log records that a validation failed and why, but never
-- what it was about. That is fine for 'apple_timeout'. It is useless for the
-- two failures that actually strand a paying customer:
--
--   cross_account_oti          — this subscription belongs to another account
--   oti_held_by_other_account  — same, via the ledger
--
-- Both are ownership disputes, and an ownership dispute you cannot identify
-- is one you cannot resolve. orianaaguiar9@gmail.com hit cross_account_oti
-- three times on 2026-08-19. Four days later the question "which account is
-- holding her subscription?" could not be answered from this database at all
-- — the only surviving fact was that a collision happened. Six accounts were
-- possible; there was no way to choose between them.
--
-- Nullable and unconstrained: most failures legitimately have no transaction
-- to name (Apple unreachable, a malformed receipt, a rate limit), and a
-- logging column must never be the reason a validation fails.
alter table public.receipt_validation_log
  add column if not exists original_transaction_id text;

comment on column public.receipt_validation_log.original_transaction_id is
  'SEMORA (099): the Apple transaction a FAILED validation concerned, when one was identified. Populated for ownership conflicts so the disputed subscription can be traced to the account holding it. Null for failures with no transaction in hand.';

-- The question this column exists to answer is always "who else has this
-- transaction", so index the lookup rather than the scan.
create index if not exists receipt_validation_log_oti_idx
  on public.receipt_validation_log (original_transaction_id)
  where original_transaction_id is not null;
