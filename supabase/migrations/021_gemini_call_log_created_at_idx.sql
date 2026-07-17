-- SEMORA. Supports the parse-syllabus global circuit breaker, which counts
-- gemini_call_log rows across ALL users in the last 24h on every request.
-- The existing idx_gemini_call_log_user_time leads with user_id, so an
-- unscoped created_at range count would seq-scan the whole ledger as it
-- grows. Additive only — no shape changes, safe with live 1.2/1.3 clients.

create index if not exists idx_gemini_call_log_created_at
  on public.gemini_call_log (created_at desc);
