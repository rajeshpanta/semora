-- ============================================================
-- 059 — multi-provider AI: telemetry columns + syllabus extraction cache
-- ============================================================
-- Semora now routes general AI (extraction, planning, content generation) to
-- Gemini and keeps the AI Tutor on OpenAI. Two things follow:
--
--   1. gemini_call_log has to record WHICH provider/model served a call, and
--      the token counts needed to watch cost. The table keeps its original
--      name on purpose: the free-scan cap counts historical rows in it, and
--      renaming would either orphan that history or force a data migration
--      for no functional gain.
--
--   2. Repeatedly scanning an unchanged syllabus should not repeatedly pay for
--      extraction. A content-hash cache makes re-processing free and, just as
--      importantly, deterministic.
-- ============================================================

alter table public.gemini_call_log
  add column if not exists provider      text,
  add column if not exists model         text,
  add column if not exists task          text,
  add column if not exists prompt_tokens integer,
  add column if not exists output_tokens integer,
  add column if not exists attempts      integer;

-- Existing rows predate multi-provider and were all Gemini-era syllabus scans.
update public.gemini_call_log
   set provider = coalesce(provider, 'legacy'),
       task     = coalesce(task, 'documentExtraction')
 where provider is null or task is null;

comment on column public.gemini_call_log.provider is
  'gemini | openai | legacy. Which provider actually served the call.';
comment on column public.gemini_call_log.task is
  'AiTask the call belonged to — documentExtraction, contentGeneration, tutor, …';

-- Cost/latency dashboards scan by provider and day; the free-scan cap scans by
-- (user, status, month). Index both access patterns.
create index if not exists gemini_call_log_provider_created_idx
  on public.gemini_call_log (provider, created_at desc);
create index if not exists gemini_call_log_user_status_created_idx
  on public.gemini_call_log (user_id, status, created_at desc);

-- ============================================================
-- Syllabus extraction cache
-- ============================================================
-- Keyed by a hash of the document bytes AND the extraction contract (model id
-- + prompt version), so upgrading either invalidates prior entries rather than
-- serving a stale extraction forever.
create table if not exists public.syllabus_extraction_cache (
  content_hash text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  result       jsonb not null,
  model        text,
  hit_count    integer not null default 0,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

alter table public.syllabus_extraction_cache enable row level security;

-- No user-facing policy: the cache is written and read exclusively by the
-- parse-syllabus edge function using the service role. Scoping rows to user_id
-- keeps one student's extraction from ever being served to another, even
-- though the hash would have to collide for that to be possible at all.
revoke all on table public.syllabus_extraction_cache from public, anon, authenticated;
grant select, insert, update on table public.syllabus_extraction_cache to service_role;

create index if not exists syllabus_extraction_cache_user_idx
  on public.syllabus_extraction_cache (user_id, last_used_at desc);

comment on table public.syllabus_extraction_cache is
  'Content-hash cache of syllabus extractions. Re-scanning an unchanged document is free and deterministic. Service-role only.';
