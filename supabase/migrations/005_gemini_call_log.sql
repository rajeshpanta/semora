-- Ledger of every Gemini API call, used for per-user rate limiting and cost monitoring.
-- Written exclusively by the parse-syllabus edge function via the service role key.
-- RLS is on with no policies, so regular users cannot read or write this table.

create table public.gemini_call_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('success', 'failed', 'rate_limited')),
  error_code text,
  duration_ms int,
  created_at timestamptz default now()
);

create index idx_gemini_call_log_user_time
  on public.gemini_call_log(user_id, created_at desc);

alter table public.gemini_call_log enable row level security;
-- Intentionally no policies: only the service role can read or write.
