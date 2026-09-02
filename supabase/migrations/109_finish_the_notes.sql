-- ============================================================
-- SEMORA: THE SWEEP FINISHES THE JOB
-- ============================================================
-- 082 rescues a recording whose device stopped uploading. 107 rescues a note
-- generation whose isolate died. Both stop at the same place: they put the row
-- back into an honest state and then wait for the student to come back.
--
-- Nobody comes back. Three lectures prove it:
--
--   6706e2b9  2026-08-31 10:18 PT  40 minutes, 10 segments, 32,381 characters
--             The phone lost the microphone six times, forced a save at 11:17,
--             and the save did not land. The student sat on the detail screen
--             watching a spinner, gave up, and left. 082 rebuilt the whole
--             transcript at 11:40 — twenty-three minutes after they walked
--             away. It has been sitting there complete and silent ever since.
--
--   0d841775  2026-09-02 07:18 PT  10 minutes, 2 segments, 6,355 characters
--             Two segments uploaded, then the app stopped reporting entirely.
--             082 rebuilt it at 07:50. Same silence.
--
--   96575255  2026-08-31 10:51 PT  GEOL3005Class-1.pdf, 16,027 characters
--             107's own worked example. Reset to 'transcribed' at 23:30 and
--             never retried, because retrying is the student's job today.
--
-- Each of these already SPENT something — a free action, or a slice of the
-- daily audio pool. The transcript is bought and paid for. Leaving it parked
-- because nobody tapped the right screen is the most expensive possible
-- outcome: we did all the work and delivered none of the value.
--
-- ─── WHY THIS ONE CANNOT BE PURE SQL ───
-- 082 chose SQL deliberately, and said why:
--
--   "a pg_net → Edge Function hop needs the function deployed with
--    --no-verify-jwt, and one ordinary redeploy silently put JWT verification
--    back on and killed the schedule for hours."
--
-- That judgement was right and it still holds. It does not apply here only
-- because it cannot: notes come out of a language model, and Postgres has no
-- way to reach one. Rescuing a transcript is string concatenation; writing
-- notes is not. So the hop is unavoidable, and the honest thing is to carry
-- 082's warning forward rather than pretend it does not apply.
--
-- ─── HOW THIS ONE REFUSES TO FAIL SILENTLY ───
-- The lms-sync outage was not caused by the hop. It was caused by the hop
-- failing where nothing could see it: pg_cron marks `select net.http_post(...)`
-- as succeeded because the statement queued a request, and never looks at what
-- came back. 859 consecutive green runs, every one of them a 401.
--
-- The counter added below is what makes that impossible to repeat. Every
-- attempt is recorded ON THE LECTURE before the request is sent, so a lecture
-- that is asked for three times and still has no notes is visible in a plain
-- SELECT with no dependency on pg_net's six-hour response retention. A broken
-- deploy flag and a broken model both surface the same way: lectures piling up
-- at the attempt ceiling. alert_lecture_notes_stuck() below turns that pile
-- into an ops_alerts row.
--
-- ─── DELIBERATELY DOES NOT RACE THE APP ───
-- Ten minutes of quiet before the server steps in. The detail screen polls
-- every four seconds while it is open and starts notes itself the moment it
-- sees 'transcribed', so a student who IS looking always wins the race and
-- this never fires for them. Ten minutes is also comfortably past the four
-- minutes 107 uses to call a claim dead, so the two sweeps cannot fight over
-- the same row.
--
-- ─── DELIBERATELY IGNORES THE TEST TAPS ───
-- 200 characters minimum. a946c6aa is 23 characters ("thank you" and a cough,
-- 4 seconds) and a9e7da56 is 54. There are no notes to be written from those,
-- and without a floor they would be retried three times each, forever, every
-- time this runs. The two real lectures above are 32,381 and 6,355.
-- ============================================================

-- ─── 1. The attempt counter ─────────────────────────────────
-- smallint, not boolean: "we tried" is not enough to tell a transient blip
-- from a lecture that can never succeed, and the difference is exactly what
-- decides whether to try again.
alter table public.lecture_recordings
  add column if not exists notes_auto_attempts smallint not null default 0;

comment on column public.lecture_recordings.notes_auto_attempts is
  'How many times the server has asked lecture-study-kit to write these notes '
  'unprompted (109). Written before the request is sent, so it survives a hop '
  'that never arrives. Stops at NOTES_AUTO_MAX_ATTEMPTS=3; a lecture sitting '
  'at the ceiling with no notes_md is the signal that the pg_net -> Edge hop '
  'or the model is broken. The student tapping "Try again" is unaffected and '
  'uncounted — this only bounds the UNATTENDED retries.';

-- ─── 2. The scheduler's credential ──────────────────────────
-- Its own secret rather than reusing semora_lms_cron_secret: two schedules
-- that can be revoked independently is worth one more vault row, and a secret
-- shared between a Canvas worker and a notes worker has to be rotated in two
-- places at once or not at all.
do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'semora_lecture_cron_secret'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'semora_lecture_cron_secret',
      'Authorizes the Semora unattended lecture-notes pg_cron worker.'
    );
  end if;
end;
$$;

create or replace function public.read_lecture_cron_secret()
returns text
language plpgsql
security definer
set search_path = vault, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  return (
    select decrypted_secret
    from vault.decrypted_secrets
    where name = 'semora_lecture_cron_secret'
  );
end;
$$;

-- ─── 3. The requester ───────────────────────────────────────
create or replace function public.request_pending_lecture_notes(p_limit integer default 5)
returns integer
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  rec       record;
  secret    text;
  requested integer := 0;
begin
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'semora_lecture_cron_secret';

  -- No secret means the request would be rejected at the door and the attempt
  -- would be spent for nothing. Better to do nothing and leave the lectures
  -- eligible than to burn all three tries against a misconfiguration.
  if secret is null then
    return 0;
  end if;

  for rec in
    select id, user_id
    from public.lecture_recordings
    where status = 'transcribed'
      and notes_md is null
      -- 'transcribed' is reachable with a real transcript only. STALLED never
      -- lands here (082 writes it with status 'failed'), but being explicit
      -- costs nothing and documents the intent.
      and length(btrim(coalesce(transcript, ''))) >= 200
      and updated_at < now() - interval '10 minutes'
      and notes_auto_attempts < 3
    order by updated_at
    limit greatest(1, p_limit)
    for update skip locked
  loop
    -- Stamped BEFORE the POST, on purpose and in that order. pg_net queues the
    -- request and returns immediately, so a crash, a rollback or a request that
    -- is never delivered must still cost an attempt — otherwise a hop that
    -- silently drops every request retries the same lecture every ten minutes
    -- until the end of time, which is the lms-sync failure wearing a new hat.
    update public.lecture_recordings
       set notes_auto_attempts = notes_auto_attempts + 1
     where id = rec.id;

    perform net.http_post(
      url     := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/lecture-study-kit',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-semora-lecture-cron-secret', secret
      ),
      body := jsonb_build_object(
        'lectureId', rec.id,
        'mode', 'notes'
      ),
      -- Longer than the 148.5s that killed 96575255, so this worker is never
      -- the thing that gives up first. The Edge platform's own ceiling is the
      -- real limit and the one worth fixing; see 110.
      timeout_milliseconds := 240000
    );

    requested := requested + 1;
  end loop;

  return requested;
end;
$$;

comment on function public.request_pending_lecture_notes(integer) is
  'Asks lecture-study-kit to write notes for lectures the app abandoned after '
  '082/107 rescued their transcript (109). Counts the attempt before sending, '
  'so an undelivered request still costs a try. REQUIRES lecture-study-kit to '
  'be deployed with --no-verify-jwt — without the flag the gateway rejects '
  'this at the door and the function is never reached. See DEPLOY_CHECKLIST.md.';

-- ─── 4. The tripwire ────────────────────────────────────────
-- The whole point of the counter. A lecture at the ceiling with no notes means
-- three unattended requests produced nothing, which is either a missing deploy
-- flag or a model that cannot serve. Both need a human.
create or replace function public.alert_lecture_notes_stuck()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  stuck integer;
begin
  select count(*) into stuck
  from public.lecture_recordings
  where status = 'transcribed'
    and notes_md is null
    and notes_auto_attempts >= 3
    and updated_at > now() - interval '24 hours';

  -- Two, not one, for the same reason 095 chose two: a single lecture can fail
  -- on its own merits (a transcript that is 200 characters of coughing), and an
  -- alert that cries wolf over one row is an alert that gets ignored. A broken
  -- hop fails EVERY lecture, so it clears this bar the moment there is traffic.
  if stuck < 2 then
    return 0;
  end if;

  -- One alert per six hours. Nothing here is fixed in minutes.
  if exists (
    select 1 from public.ops_alerts
    where kind = 'lecture_notes_stuck'
      and created_at > now() - interval '6 hours'
  ) then
    return 0;
  end if;

  insert into public.ops_alerts (kind, detail, delivered)
  values (
    'lecture_notes_stuck',
    jsonb_build_object(
      'stuck_lectures', stuck,
      'likely_cause', 'lecture-study-kit deployed without --no-verify-jwt, or the model is failing',
      'check', 'select status_code, left(content,120) from net._http_response order by id desc limit 5'
    ),
    false
  );

  return stuck;
end;
$$;

comment on function public.alert_lecture_notes_stuck() is
  'Raises an ops_alerts row when unattended note generation has failed three '
  'times for two or more lectures in a day (109). This is the check 082 warned '
  'was missing: pg_cron reports a queued http_post as succeeded no matter what '
  'comes back, so the failure has to be visible on the lecture rows instead.';

revoke all on function public.read_lecture_cron_secret()             from public, anon, authenticated;
revoke all on function public.request_pending_lecture_notes(integer) from public, anon, authenticated;
revoke all on function public.alert_lecture_notes_stuck()            from public, anon, authenticated;
grant execute on function public.read_lecture_cron_secret()             to service_role;
grant execute on function public.request_pending_lecture_notes(integer) to service_role;
grant execute on function public.alert_lecture_notes_stuck()            to service_role;

-- ─── 5. The schedule ────────────────────────────────────────
-- Offset five minutes from semora-sweep-stalled-lectures (*/10 on the tens) so
-- the sweep has always just run and set 'transcribed' before this looks for it.
-- Two workers landing on the same row in the same second is avoidable for free
-- by simply not scheduling them together.
select cron.unschedule('semora-finish-lecture-notes')
where exists (select 1 from cron.job where jobname = 'semora-finish-lecture-notes');

select cron.schedule(
  'semora-finish-lecture-notes',
  '5,15,25,35,45,55 * * * *',
  $cron$
  do $inner$
  begin
    perform public.request_pending_lecture_notes(5);
    perform public.alert_lecture_notes_stuck();
  end
  $inner$;
  $cron$
);
