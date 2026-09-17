-- ============================================================
-- LECTURE HEALTH IS WATCHED, AND THE ALERTS ACTUALLY ARRIVE
-- ============================================================
-- Record Lecture completion plan, step 1.12 and Phase 5 (R4).
--
-- In the week to 2026-09-16, 6 of 17 recordings lost 40% or more of the class
-- and not one alert was raised. Worse: the lecture alerts that DO exist
-- (lecture_parts_unrecoverable, lecture_notes_stuck, lecture_audio_retained,
-- lecture_segments_stranded) are inserted with delivered = false and nothing
-- ever delivers them. Only the Stripe alert (095/097) pushes and emails.
--
-- lecture_health_check runs hourly and:
--   1. looks for the failures students actually hit — lectures finished with
--      parts missing, recordings where the phone captured less audio than the
--      session lasted, sessions that ran away past the recording limit, lectures
--      stuck in a working state, notes cut at the model's output limit, parts
--      that are silent end to end (a dead microphone looks exactly like that),
--      transcription failures, and provider usage near its hourly or daily cap;
--   2. raises one ops alert per kind (at most every 6 hours per kind);
--   3. delivers every undelivered lecture alert — its own and the older ones —
--      the same way the Stripe alert is delivered: a push to ops_alert_recipients
--      and an email through ops-alert, both authorised by push_send_secret.
--
-- The caps default to the provider's FREE tier (7,200 audio-seconds an hour,
-- 28,800 a day, shared by the whole organisation). After moving to a paid tier,
-- change the two numbers in the cron command at the bottom; nothing else.
-- ============================================================

create or replace function public.lecture_deliver_ops_alerts()
returns integer
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  secret     text;
  recipients uuid[];
  alert      record;
  body_text  text;
  sent_count integer := 0;
  email_request bigint;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_send_secret';
  if secret is null then
    return 0;
  end if;

  select coalesce(array_agg(user_id), '{}') into recipients from public.ops_alert_recipients;

  for alert in
    select id, kind, detail, created_at
    from public.ops_alerts
    where kind like 'lecture%'
      and not delivered
      and created_at > now() - interval '24 hours'
    order by created_at
    limit 20
    for update skip locked
  loop
    body_text := 'Semora lecture alert: ' || alert.kind || E'\n\n'
      || coalesce(alert.detail->>'summary', alert.detail->>'meaning', '') || E'\n\n'
      || 'Raised: ' || alert.created_at::text || E'\n\n'
      || 'Detail: ' || coalesce(alert.detail::text, '{}') || E'\n\n'
      || 'Runbook: docs/audits/record-lecture-report-and-plan-2026-09-16.md (Phase 5).';

    if coalesce(array_length(recipients, 1), 0) > 0 then
      perform net.http_post(
        url     := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
        body    := jsonb_build_object(
          'user_ids', to_jsonb(recipients),
          'title', 'Semora: ' || replace(alert.kind, '_', ' '),
          'body', left(coalesce(alert.detail->>'summary', alert.detail->>'meaning', alert.kind), 180),
          'data', jsonb_build_object('type', 'ops_alert', 'kind', alert.kind)
        ),
        -- 136: the 5-second default times out send-push.
        timeout_milliseconds := 60000
      );
    end if;

    email_request := net.http_post(
      url     := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/ops-alert',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
      body    := jsonb_build_object(
        'subject', 'Semora lecture alert: ' || alert.kind,
        'body', left(body_text, 4900)
      ),
      timeout_milliseconds := 60000
    );

    -- Delivery is asynchronous (pg_net): the request id is kept so a failed
    -- send can be found in net._http_response.
    update public.ops_alerts
       set delivered = true,
           detail = coalesce(detail, '{}'::jsonb)
                    || jsonb_build_object('push', coalesce(array_length(recipients, 1), 0) > 0, 'email', true,
                                          'email_request_id', email_request)
     where id = alert.id;
    sent_count := sent_count + 1;
  end loop;

  return sent_count;
end;
$$;

revoke all on function public.lecture_deliver_ops_alerts() from public, anon, authenticated;

create or replace function public.lecture_raise_alert(p_kind text, p_summary text, p_detail jsonb)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Only alerts that name their lecture set get the 3-day rule; the rest are
  -- deduplicated by kind alone, every 6 hours.
  fingerprint text := case when p_detail ? 'fingerprint' then md5(p_detail->>'fingerprint') end;
begin
  -- Once per 6 hours per kind; and never again within 3 days for the SAME
  -- set of lectures (audit: a lecture missing a part re-raised the alert every
  -- 6 hours for as long as anything touched its row).
  if exists (
    select 1 from public.ops_alerts
    where kind = p_kind
      and (created_at > now() - interval '6 hours'
           or (fingerprint is not null and created_at > now() - interval '3 days'
               and detail->>'fingerprint_md5' = fingerprint))
  ) then
    return false;
  end if;
  insert into public.ops_alerts (kind, detail, delivered)
  values (p_kind, coalesce(p_detail, '{}'::jsonb)
                  || jsonb_build_object('summary', p_summary, 'fingerprint_md5', fingerprint), false);
  return true;
end;
$$;

revoke all on function public.lecture_raise_alert(text, text, jsonb) from public, anon, authenticated;

create or replace function public.lecture_health_check(
  p_hour_cap_seconds integer default 7200,
  p_day_cap_seconds  integer default 28800
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  raised integer := 0;
  n      integer;
  ids    jsonb;
  used   integer;
begin
  -- 1. Finished in the last two hours with parts missing.
  select count(*), jsonb_agg(left(id::text, 8))
    into n, ids
  from (
    select id from public.lecture_recordings
    where source = 'recording'
      and status in ('transcribed', 'generating', 'ready')
      and parts_missing > 0
      and updated_at > now() - interval '2 hours'
      and created_at > now() - interval '2 days'
    limit 20
  ) x;
  if n > 0 and public.lecture_raise_alert('lecture_parts_missing',
       n || ' recent lecture(s) finished with parts missing.',
       jsonb_build_object('lectures', ids, 'fingerprint', ids::text, 'check',
         'select id, segment_count, parts_missing, capture_state, app_build from lecture_recordings where parts_missing > 0 order by updated_at desc limit 20')) then
    raised := raised + 1;
  end if;

  -- 2. The phone captured noticeably less audio than the session lasted.
  --    capture_wall_seconds is the time the session spent RECORDING (the app
  --    excludes pauses), so a student who paused is not a gap.
  select count(*), jsonb_agg(left(id::text, 8))
    into n, ids
  from (
    select id from public.lecture_recordings
    where capture_state = 'stopped'
      and capture_wall_seconds >= 600
      and captured_seconds is not null
      and captured_seconds < capture_wall_seconds * 0.95
      and last_heartbeat_at > now() - interval '2 hours'
    limit 20
  ) x;
  if n > 0 and public.lecture_raise_alert('lecture_capture_gap',
       n || ' recording(s) captured less than 95% of the session.',
       jsonb_build_object('lectures', ids, 'check',
         'select id, capture_wall_seconds, captured_seconds, app_build from lecture_recordings where capture_state = ''stopped'' order by last_heartbeat_at desc limit 20')) then
    raised := raised + 1;
  end if;

  -- 3. Sessions that ran far past any recording limit (3.5 hours of wall time),
  --    by the phone's report or by the spread of its parts.
  select count(*), jsonb_agg(left(id::text, 8))
    into n, ids
  from (
    -- Reported by the phone itself (1.15+). The spread of part arrival times is
    -- NOT used: a phone that uploads a backlog days later would look like one.
    select r.id
    from public.lecture_recordings r
    where r.source = 'recording'
      and r.last_heartbeat_at > now() - interval '2 hours'
      and coalesce(r.capture_wall_seconds, 0) > 12600
    limit 20
  ) x;
  if n > 0 and public.lecture_raise_alert('lecture_runaway_session',
       n || ' recording session(s) ran for more than 3.5 hours of wall time.',
       jsonb_build_object('lectures', ids)) then
    raised := raised + 1;
  end if;

  -- 4. Stuck in a working state.
  select count(*), jsonb_agg(left(id::text, 8))
    into n, ids
  from (
    select id from public.lecture_recordings
    where created_at > now() - interval '3 days'
      and (
        (status in ('uploading', 'transcribing')
          and updated_at < now() - interval '1 hour'
          and (last_heartbeat_at is null or last_heartbeat_at < now() - interval '1 hour')
          -- an older app's undeclared lecture legitimately waits up to 3 hours
          and (segment_count > 0 or last_heartbeat_at is not null or updated_at < now() - interval '3 hours'))
        or (status = 'generating' and coalesce(notes_started_at, updated_at) < now() - interval '10 minutes')
        or (status = 'transcribed' and notes_md is null and notes_auto_attempts >= 3)
      )
    limit 20
  ) x;
  if n > 0 and public.lecture_raise_alert('lecture_stuck',
       n || ' lecture(s) stuck in a working state for over an hour.',
       jsonb_build_object('lectures', ids)) then
    raised := raised + 1;
  end if;

  -- 5. Notes cut at the model's output limit.
  select count(*) into n from public.lecture_recordings
  where notes_truncated and updated_at > now() - interval '2 hours';
  if n > 0 and public.lecture_raise_alert('lecture_notes_truncated',
       n || ' lecture(s) had notes cut at the model output limit.', '{}'::jsonb) then
    raised := raised + 1;
  end if;

  -- 6. Parts that are long but hold almost no speech: a dead or muffled mic.
  select count(*) into n from public.lecture_segments
  where status = 'done'
    and seconds >= 120
    and speech_seconds is not null
    and speech_seconds < 3
    and created_at > now() - interval '2 hours';
  if n >= 5 and public.lecture_raise_alert('lecture_silent_parts',
       n || ' parts in 2 hours were silent end to end (possible dead microphones).', '{}'::jsonb) then
    raised := raised + 1;
  end if;

  -- 7. Transcription failures in the last hour.
  select coalesce(sum(failures), 0) into n from public.lecture_transcription_usage
  where hour >= date_trunc('hour', now()) - interval '1 hour';
  if n >= 5 and public.lecture_raise_alert('lecture_provider_failing',
       n || ' transcription requests failed in the last hour. Parts are kept and retried.', '{}'::jsonb) then
    raised := raised + 1;
  end if;

  -- 8. Provider usage near its organisation-wide caps.
  select coalesce(sum(audio_seconds), 0) into used from public.lecture_transcription_usage
  where hour = date_trunc('hour', now());
  if used > p_hour_cap_seconds * 0.8 and public.lecture_raise_alert('lecture_usage_hour_high',
       used || ' of ' || p_hour_cap_seconds || ' audio-seconds used this hour.', '{}'::jsonb) then
    raised := raised + 1;
  end if;
  select coalesce(sum(audio_seconds), 0) into used from public.lecture_transcription_usage
  where hour >= date_trunc('day', now());
  if used > p_day_cap_seconds * 0.8 and public.lecture_raise_alert('lecture_usage_day_high',
       used || ' of ' || p_day_cap_seconds || ' audio-seconds used today (UTC).', '{}'::jsonb) then
    raised := raised + 1;
  end if;

  perform public.lecture_deliver_ops_alerts();
  return raised;
end;
$$;

revoke all on function public.lecture_health_check(integer, integer) from public, anon, authenticated;

comment on function public.lecture_health_check(integer, integer) is
  'SEMORA (144): hourly Record Lecture health check. Raises one ops alert per failure kind (6-hour dedupe) and delivers every undelivered lecture alert by push and email. Caps are the provider free tier; raise them in the cron command after a tier change.';

select cron.schedule(
  'semora-lecture-health',
  '17 * * * *',
  $job$select public.lecture_health_check(7200, 28800);$job$
);
