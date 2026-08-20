-- ============================================================
-- SEMORA: THE "WHY" ON EVERY AI FAILURE, NOT JUST THE SCAN PATH
-- ============================================================
-- 076 added gemini_call_log.error_detail after 16 syllabus scans died on a
-- bare 'http_400' whose reason had already expired from the edge logs — the
-- provider explains itself in the response body, and we were dropping it.
--
-- ai_call_log is the same ledger for every OTHER AI task (tutor, notes,
-- flashcards, quizzes, transcription) and had the same hole: error_code says
-- 'http_400', nothing says which field the provider objected to. Edge-function
-- logs keep roughly a day, so any failure older than that is undiagnosable.
--
-- Same shape as 076 so both ledgers answer the same question the same way.
-- Truncated at the call site: provider bodies can echo request fragments, and
-- a ledger is not the place to accumulate a base64 lecture slide.
-- ============================================================

alter table public.ai_call_log
  add column if not exists error_detail text;

comment on column public.ai_call_log.error_detail is
  'SEMORA (077): truncated provider error body for a failed call — the "why" behind error_code. Null on success.';
