-- The scan tab's free-scan pill must mirror the server's free-scan gate
-- (parse-syllabus step 2b), which counts max(gemini_call_log 'success' rows,
-- syllabus_uploads rows). Migration 005 enabled RLS with NO policies, so the
-- client could only count syllabus_uploads and undercounted — the tab could
-- promise a free scan the server then 402'd. This lets authenticated users
-- SELECT their OWN rows so useScanCount can compute the same max(). The
-- columns (status, error_code, duration_ms, timestamps) hold nothing
-- sensitive, so no status filter is needed here — the client filters to
-- 'success' itself, matching the server.
--
-- SELECT only, on purpose: INSERT/UPDATE/DELETE stay service-role-only —
-- the log is the rate-limit + free-scan ledger, and a client that could
-- write it could forge or erase its own usage.

create policy "own_gemini_call_log_select" on public.gemini_call_log
  for select to authenticated
  using (auth.uid() = user_id);
