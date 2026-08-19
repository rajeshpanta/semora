-- ============================================================
-- SEMORA: KEEP THE REASON AN AI CALL FAILED
-- ============================================================
-- 16 of the last 128 syllabus scans (12.5%) died on error_code 'http_400' —
-- OpenAI rejecting the request outright, every one inside 1.7s. The provider
-- says WHY in its response body, and _shared/ai.ts already captures it into
-- AiResult.errorBody. But the only thing done with it is a console.warn, and
-- edge-function logs are retained for ~24h. By the time the pattern was
-- visible in this ledger the bodies were three days gone and unrecoverable.
--
-- So the ledger keeps a truncated copy. `error_code` stays the low-cardinality
-- column you group by; `error_detail` is the sentence that tells you what to
-- fix. Also backfilling the three columns that were only ever written on the
-- SUCCESS path — every failed row currently has model, attempts and task NULL,
-- which is exactly backwards: a successful call needs no diagnosis.
--
-- Truncated to 500 chars at the call site. Provider bodies can echo request
-- fragments, and this table is not the place to accumulate a base64 syllabus.
-- ============================================================

alter table public.gemini_call_log
  add column if not exists error_detail text;

comment on column public.gemini_call_log.error_detail is
  'SEMORA (076): truncated provider error body for a failed call — the "why" behind error_code. Null on success.';
