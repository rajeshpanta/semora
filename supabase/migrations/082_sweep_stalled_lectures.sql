-- ============================================================
-- SEMORA STALLED-LECTURE SWEEP
-- ============================================================
-- Nothing on the server ever finished a recording that the client abandoned.
--
-- A recording is driven entirely from the device: segments upload, then the
-- client calls finishLecture() to say how many to expect, and that is what
-- lets the transcript be assembled. If the app is killed, backgrounded past
-- the point iOS suspends it, or simply closed after the last segment, that
-- final call never happens — and the row sits in 'uploading' or 'transcribing'
-- forever with no error, no retry and nothing watching.
--
-- It is not hypothetical: a9e7da56 sat in 'transcribing' for over five hours
-- with its one segment already transcribed and CHARGED to the student's free
-- action. They had paid for a lecture and been given a spinner. It was
-- repaired by hand; this is what stops the next one needing that.
--
-- ─── Why SQL and not an Edge Function ───
-- The Canvas background sync learned this the hard way the same morning: a
-- pg_net → Edge Function hop needs the function deployed with --no-verify-jwt,
-- and one ordinary redeploy silently put JWT verification back on and killed
-- the schedule for hours. A sweep that runs entirely inside Postgres has no
-- gateway, no secret and no deploy flag to forget.
-- ============================================================

create or replace function public.sweep_stalled_lectures()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  swept   integer := 0;
  rec     record;
  seg     record;
begin
  for rec in
    select id, user_id
    from public.lecture_recordings
    where status in ('uploading', 'transcribing')
      -- Same 15 minutes the app uses to decide a recording has stalled
      -- (lib/lectures.LECTURE_STALLED_MS). Deliberately identical: if the
      -- server swept sooner, it would finalise a recording the student's
      -- screen still shows as working.
      and updated_at < now() - interval '15 minutes'
    for update skip locked
  loop
    -- What actually made it through, in order. A segment only carries a
    -- transcript once the provider returned one, so this is exactly the
    -- material finishLecture() would have assembled.
    select
      coalesce(string_agg(nullif(btrim(s.transcript), ''), ' ' order by s.seq), '') as text,
      count(*) filter (where nullif(btrim(s.transcript), '') is not null)           as done_count,
      coalesce(sum(s.seconds), 0)                                                   as total_seconds
    into seg
    from public.lecture_segments s
    where s.lecture_id = rec.id
      and s.status = 'done';

    if seg.done_count > 0 then
      -- Salvage. 'transcribed' rather than 'ready' because notes have not been
      -- written yet — that is the state the app already knows how to act on,
      -- so the student's next visit asks for notes exactly as a healthy
      -- recording would.
      update public.lecture_recordings
      set transcript       = seg.text,
          segment_count    = seg.done_count,
          duration_seconds = seg.total_seconds,
          status           = 'transcribed',
          error_code       = null,
          updated_at       = now()
      where id = rec.id;
    else
      -- Nothing survived. Mark it failed so the student sees a real message
      -- instead of a spinner. STALLED, not a generic failure: it says the
      -- recording stopped reaching us, which is the true story and the one
      -- the support inbox needs.
      update public.lecture_recordings
      set status     = 'failed',
          error_code = 'STALLED',
          updated_at = now()
      where id = rec.id;
    end if;

    swept := swept + 1;
  end loop;

  return swept;
end;
$$;

revoke all on function public.sweep_stalled_lectures() from public, anon, authenticated;
grant execute on function public.sweep_stalled_lectures() to service_role;

comment on function public.sweep_stalled_lectures() is
  'SEMORA (082): finalises or fails recordings abandoned mid-upload. Salvages any transcribed segments rather than discarding them — the student was already charged for that audio.';

-- Every 10 minutes: often enough that a stalled recording resolves itself
-- while the student is still nearby, rare enough to be invisible. The sweep
-- touches only rows older than 15 minutes, so a tick that lands mid-recording
-- does nothing.
select cron.unschedule('semora-sweep-stalled-lectures')
where exists (select 1 from cron.job where jobname = 'semora-sweep-stalled-lectures');

select cron.schedule(
  'semora-sweep-stalled-lectures',
  '*/10 * * * *',
  $job$ select public.sweep_stalled_lectures(); $job$
);
