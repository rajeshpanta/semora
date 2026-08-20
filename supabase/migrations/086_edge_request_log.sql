-- ============================================================
-- SEMORA: KEEP SERVER FAILURES PAST THE 24-HOUR LOG WINDOW
-- ============================================================
-- Every edge function emits a structured `request_done` line with outcome,
-- status and latency. Those lines live in Supabase's function logs, which
-- retain roughly a day — so any incident older than that is gone, which is
-- precisely how a 12.5% scan failure rate went three days without anyone
-- being able to read the reason.
--
-- This keeps the FAILURES. Deliberately not the successes: healthy traffic is
-- already counted in the AI ledgers and in analytics, and writing a row per
-- request would add a database write to every call for information that is
-- almost never read. Errors are rare, and they are the ones you need in a
-- week's time.
--
-- No user_id: the logger does not always have one (auth failures are exactly
-- when it does not), and request_id is what actually correlates a report back
-- to the log line.
-- ============================================================

create table if not exists public.edge_request_log (
  id          bigserial primary key,
  fn          text        not null,
  request_id  text        not null,
  outcome     text        not null check (outcome in ('client_error','server_error')),
  status      integer     not null,
  method      text,
  duration_ms integer,
  user_id     uuid,
  created_at  timestamptz not null default now()
);

create index if not exists edge_request_log_fn_created_idx
  on public.edge_request_log (fn, created_at desc);
create index if not exists edge_request_log_status_created_idx
  on public.edge_request_log (status, created_at desc);

comment on table public.edge_request_log is
  'SEMORA (086): durable record of FAILED edge-function requests. Successes are intentionally omitted — they are already counted elsewhere and would add a write per request. Written by the shared logger''s done().';

-- Service role only. This is written by functions and read by the operator.
alter table public.edge_request_log enable row level security;
revoke all on public.edge_request_log from anon, authenticated;
