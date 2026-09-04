-- ============================================================
-- SEMORA: A BUSY PROVIDER IS NOT A USED ATTEMPT
-- ============================================================
-- 127 gives a stranded segment three recovery attempts and then stops trying.
-- The cap is not optional — without it a segment the provider will never
-- accept is retried every twenty minutes forever against a pool the whole app
-- shares. But it counts the wrong thing.
--
-- An attempt is charged BEFORE the work, deliberately, so an invocation that
-- dies partway still spends one. The consequence nobody wrote down is that it
-- also spends one when the work never happened:
--
--   429  the provider is rate limited. handleSegment puts the segment back to
--        'uploaded' and explicitly does NOT charge the student, because
--        nothing was transcribed. The recovery attempt was charged anyway.
--   503  a download failed, a claim failed, the database blipped. Same shape:
--        the segment is left reclaimable precisely because it is still good.
--
-- Groq's quota is billed per ORGANIZATION and the free tier is roughly five
-- lectures a day for every Semora user combined, so a 429 is not an exotic
-- failure — it is the expected one on a busy afternoon. Three of them inside an
-- hour would exhaust a segment's whole budget without ever sending its audio
-- anywhere, and then 127's own rule would delete that audio as something
-- nothing will ever transcribe.
--
-- That is a data-loss path invented by the fix for a data-loss path. The
-- student loses five minutes of a class because a THIRD PARTY was busy.
--
-- ─── WHY A REFUND AND NOT A LATER CHARGE ───────────────────
-- Charging afterwards, only on outcomes we saw, would fix this and reintroduce
-- what charging early was for: an invocation killed mid-transcription pays
-- nothing and is retried forever. So the attempt is still charged up front and
-- given back only when the caller can SEE that the provider or our own
-- infrastructure refused, never inferred from silence. A crash still costs one.
-- ============================================================

create or replace function public.lecture_refund_recovery_attempt(p_segment_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.lecture_segments
     set recovery_attempts = greatest(0, recovery_attempts - 1)
   where id = p_segment_id
  returning recovery_attempts;
$$;

comment on function public.lecture_refund_recovery_attempt(uuid) is
  'Gives back a recovery attempt charged for work that never happened (128) — '
  'a rate-limited provider or a transient infrastructure failure, both of '
  'which leave the segment reclaimable on purpose. Only ever called on an '
  'outcome the caller actually observed; a crash still costs an attempt, which '
  'is what charging up front in 127 is for.';

revoke all on function public.lecture_refund_recovery_attempt(uuid) from public, anon, authenticated;
grant execute on function public.lecture_refund_recovery_attempt(uuid) to service_role;
