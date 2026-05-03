-- Per-user audit + rate-limit log for the validate-receipt edge function.
--
-- Apple's verifyReceipt has its own server-side rate limit, but a
-- malicious authenticated user can still burn our edge-function CPU
-- and Apple's shared-secret quota by hammering the endpoint. This
-- table caps usage at 30 calls/hour per user (enforced in the
-- edge function), which is generous for legitimate purchase / restore
-- / cold-launch validation but blocks abuse.
--
-- Mirrors the gemini_call_log pattern from migration 005.

create table if not exists public.receipt_validation_log (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('success', 'failed', 'rate_limited')),
  error_code text,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists receipt_validation_log_user_recent_idx
  on public.receipt_validation_log (user_id, created_at desc);

-- Service role only. The client has no business reading this directly,
-- and the edge function uses the service-role client (which bypasses RLS).
alter table public.receipt_validation_log enable row level security;
