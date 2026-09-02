-- ============================================================
-- SEMORA: FINISHED LECTURES STOP HOLDING THE DAY'S CAPACITY
-- ============================================================
-- Every recording reserves the 90-minute worst case (5,400s) out of a pool of
-- LECTURE_DAILY_AUDIO_SECONDS — 25,000s for the WHOLE app, about four and a
-- half concurrent starts. The reservation is meant to be handed back the
-- moment the recording is over. Often it is not, and once it is not, nothing
-- can ever take it back.
--
-- Measured on 2026-09-02 before this migration:
--
--   day         pool used   real audio   held by finished lectures
--   2026-08-24    5,400        3,562       5,400   (100% of it)
--   2026-08-31   16,200       11,035      16,200   (100% of it, 65% of the day)
--   2026-09-02   16,200         —          5,400   (one finished, two live)
--
-- On 2026-08-31 the pool read as two-thirds spent while every single second of
-- it was held by lectures that had already finished. At 10:49 that morning
-- lecture-transcribe returned its only 503 in history — AT_CAPACITY — to
-- 1f875f86, who is a PAYING user. They were turned away from a feature they
-- pay for so that three completed lectures could keep holding capacity none of
-- them needed.
--
-- ─── WHY IT ESCAPES EVERY EXISTING CLEANUP ───
-- reclaim_stale_lecture_reservations is the designated janitor and it only
-- matches:
--
--   where reserved_seconds > 0 and status in ('recording', 'uploading')
--
-- So a reservation is reachable only while the lecture is still in flight. The
-- instant a row advances past those two states the janitor goes blind to it,
-- and there are three ordinary ways to advance without releasing:
--
--   1. sweep_stalled_lectures (082/107/110) writes 'transcribed' and 'failed'
--      in plain SQL and never calls release_lecture_reservation. Four of the
--      seven rows above were put in their final state by the sweep.
--   2. lecture-transcribe's "another invocation already finalized this" branch
--      (index.ts:936-946) returns early and skips the release the normal
--      finalize path does.
--   3. Notes generation moves 'transcribed' to 'ready' without ever looking at
--      the reservation, because writing notes has nothing to do with capacity.
--
-- Any of those and the seconds are stranded until the UTC day rolls over.
--
-- ─── THE FIX IS A FLOOR, NOT A PATCH ───
-- Rather than adding a release call to each of the three paths above and
-- hoping the fourth one never gets written, this states the invariant directly
-- and enforces it on a timer: A LECTURE THAT IS NOT CAPTURING AUDIO MUST NOT
-- HOLD AUDIO CAPACITY. Whatever new way a row finds to reach a finished state,
-- this catches it within ten minutes.
--
-- 'recording', 'uploading' and 'transcribing' are the three states where audio
-- is still arriving or still being counted, and they are left strictly alone —
-- that is reclaim_stale_lecture_reservations' territory and it is right about
-- it. Everything else is over.
--
-- release_lecture_reservation is reused rather than reimplemented: it reads and
-- zeroes the row's own reserved_seconds under a row lock and decrements the
-- matching lecture_quota_day. Doing that arithmetic inline here would be a
-- second copy of the ledger logic, and 066 already warns what happens when the
-- amount released is not the amount the row is actually holding.
-- ============================================================

create or replace function public.release_finished_lecture_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r        record;
  released integer := 0;
begin
  for r in
    select id
      from public.lecture_recordings
     where reserved_seconds > 0
       -- The complement of "still capturing". Written as NOT IN so a status
       -- added later is treated as finished and released, rather than silently
       -- inheriting the leak by not being on an allow-list.
       and status not in ('recording', 'uploading', 'transcribing')
     order by reserved_day
     limit 200
     for update skip locked
  loop
    released := released + public.release_lecture_reservation(r.id);
  end loop;

  return released;
end;
$$;

comment on function public.release_finished_lecture_reservations() is
  'Hands back daily audio capacity held by lectures that are no longer '
  'capturing audio (111). reclaim_stale_lecture_reservations only sees rows in '
  '"recording"/"uploading", so anything that reaches a finished state without '
  'releasing — the SQL sweep, the already-finalized early return, notes '
  'generation — stranded its reservation until the UTC day rolled over. '
  'Returns the number of seconds handed back.';

revoke all on function public.release_finished_lecture_reservations() from public, anon, authenticated;
grant execute on function public.release_finished_lecture_reservations() to service_role;

-- Runs on the same ten-minute tick as the sweep, and deliberately AFTER it in
-- the same statement: the sweep is one of the things that produces finished
-- rows, so releasing first would leave whatever it just settled waiting a full
-- cycle for its capacity to come back.
select cron.unschedule('semora-sweep-stalled-lectures')
where exists (select 1 from cron.job where jobname = 'semora-sweep-stalled-lectures');

select cron.schedule(
  'semora-sweep-stalled-lectures',
  '*/10 * * * *',
  $cron$
  do $inner$
  begin
    perform public.sweep_stalled_lectures();
    perform public.release_finished_lecture_reservations();
  end
  $inner$;
  $cron$
);
