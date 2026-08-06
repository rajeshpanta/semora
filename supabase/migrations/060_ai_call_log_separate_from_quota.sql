-- ============================================================
-- 060 — separate AI telemetry from the syllabus-scan quota ledger
-- ============================================================
-- Migration 059 added provider/model/token columns to gemini_call_log and the
-- new router wrote ALL AI telemetry there. That was wrong, and the mistake is
-- worth stating plainly because the table's name hides it:
--
--   gemini_call_log is not a telemetry table. It is the syllabus-scan QUOTA
--   LEDGER. parse-syllabus counts its rows for three separate limits — the
--   free 5/month cap, the per-user 20/24h cap, and the 1500/24h global
--   circuit breaker — and lib/queries.ts mirrors the same count in the
--   client's "scans left" pill.
--
-- Writing tutor and flashcard rows into it therefore charged unrelated
-- features against the scan budget: 20 tutor messages locked a user out of
-- scanning entirely, and enough tutor traffic would 503 scanning for everyone.
--
-- The fix is a dedicated telemetry table. gemini_call_log goes back to being
-- exactly what it was — syllabus scans only, with its original three statuses
-- — and ai_call_log records cost/latency/routing for every provider call.
-- ============================================================

create table if not exists public.ai_call_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  task          text not null,
  provider      text not null,
  model         text not null,
  -- 'fallback' is a first-class outcome: the tutor's temporary Gemini stand-in
  -- must be countable, which the old constraint on gemini_call_log made
  -- impossible (the insert failed the CHECK and was silently swallowed).
  status        text not null check (status in ('success', 'failed', 'fallback', 'rate_limited')),
  error_code    text,
  duration_ms   integer,
  attempts      integer,
  prompt_tokens integer,
  output_tokens integer,
  created_at    timestamptz not null default now()
);

alter table public.ai_call_log enable row level security;

-- Operational telemetry, service-role only. No user-facing policy: this table
-- is written by edge functions and read by cost dashboards, never by a client.
revoke all on table public.ai_call_log from public, anon, authenticated;
grant select, insert on table public.ai_call_log to service_role;

-- Cost/latency rollups scan by provider+day; per-user tier limits by user+day.
create index if not exists ai_call_log_provider_created_idx
  on public.ai_call_log (provider, created_at desc);
create index if not exists ai_call_log_user_task_created_idx
  on public.ai_call_log (user_id, task, created_at desc);

comment on table public.ai_call_log is
  'Operational telemetry for every AI provider call: routing, cost, latency, retries, fallbacks. Deliberately SEPARATE from gemini_call_log, which is the syllabus-scan quota ledger. Contains no academic content.';

-- ── Restore gemini_call_log to a pure quota ledger ──────────────────────────
-- 059 back-filled provider/task onto historical rows; those columns stay (they
-- are harmless and now accurate for scan rows), but nothing except
-- parse-syllabus writes here again.
comment on table public.gemini_call_log is
  'SYLLABUS-SCAN QUOTA LEDGER — not general telemetry. parse-syllabus counts these rows for the free 5/month cap, the 20/24h per-user cap and the 1500/24h global breaker, and lib/queries.ts mirrors the count. Exactly one row per scan attempt. Statuses: success | failed | rate_limited. Never write tutor or flashcard rows here; use ai_call_log.';

-- ── Fix the syllabus cache key ──────────────────────────────────────────────
-- 059 made content_hash the sole primary key while every read filters on
-- user_id, so two classmates uploading the same syllabus permanently evicted
-- each other and one deleting their account took the other's entry with it.
-- The key must match the access pattern: (content_hash, user_id).
alter table public.syllabus_extraction_cache
  drop constraint if exists syllabus_extraction_cache_pkey;

alter table public.syllabus_extraction_cache
  add constraint syllabus_extraction_cache_pkey primary key (content_hash, user_id);
