-- Cached-input and reasoning tokens on the AI telemetry row.
--
-- ai_call_log recorded prompt_tokens and output_tokens and nothing else, which
-- left two cost questions permanently unanswerable:
--
--   * Cached input is billed at a TENTH of the input rate. Tutor sends the same
--     system prompt, date anchor, syllabus and notes on every turn of a
--     conversation, so most of a turn's input should be cache hits — but with
--     no cached_tokens there was no way to tell whether that was happening,
--     and input is the larger half of a Tutor turn's cost.
--   * Reasoning tokens are counted INSIDE output_tokens rather than alongside
--     them, so the logged output figure overstates how much the student
--     actually reads and hides what raising reasoning effort really costs.
--
-- Nullable, no default and no backfill: rows written before this migration
-- genuinely did not measure these, and a zero would read as "no cache hits"
-- rather than "not recorded".
alter table public.ai_call_log
  add column if not exists cached_tokens integer,
  add column if not exists reasoning_tokens integer;

comment on column public.ai_call_log.cached_tokens is
  'Input tokens served from the provider prompt cache, billed at ~10% of the input rate. NULL means not recorded (all rows before migration 131).';
comment on column public.ai_call_log.reasoning_tokens is
  'Reasoning tokens, already included in output_tokens rather than additional to them. NULL means not recorded.';
