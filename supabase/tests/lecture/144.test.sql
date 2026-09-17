-- Tests for 144 (run after harness.sql, 140, 142, 143, 144 on a THROWAWAY database).
set client_min_messages = warning;

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-0000000000ff');
insert into public.profiles (id) values ('00000000-0000-0000-0000-00000000000a');
insert into public.ops_alert_recipients (user_id) values ('00000000-0000-0000-0000-0000000000ff');

alter table public.lecture_recordings disable trigger lecture_recordings_set_updated_at_trigger;

-- a finished lecture with parts missing
insert into public.lecture_recordings (id, user_id, title, status, source, parts_missing, updated_at)
values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'M', 'ready', 'recording', 3, now() - interval '10 minutes');
-- a capture gap: 60 min session, 40 min captured
insert into public.lecture_recordings (id, user_id, title, status, source, capture_state, capture_wall_seconds, captured_seconds, last_heartbeat_at, updated_at)
values ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'G', 'ready', 'recording', 'stopped', 3600, 2400, now() - interval '5 minutes', now());
-- a stuck lecture
insert into public.lecture_recordings (id, user_id, title, status, source, updated_at)
values ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', 'S', 'transcribing', 'recording', now() - interval '4 hours');
-- an older app's undeclared lecture inside its legitimate 3-hour wait is NOT stuck
insert into public.lecture_recordings (id, user_id, title, status, source, updated_at)
values ('30000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a', 'W', 'transcribing', 'recording', now() - interval '2 hours');
-- provider usage near the hourly cap, with failures
insert into public.lecture_transcription_usage (hour, audio_seconds, requests, failures)
values (date_trunc('hour', now()), 6000, 30, 6);
-- an older undelivered lecture alert raised by another function
insert into public.ops_alerts (kind, detail, delivered) values ('lecture_notes_stuck', '{"stuck_lectures": 2}', false);
-- a healthy lecture: nothing about it may be reported
insert into public.lecture_recordings (id, user_id, title, status, source, parts_missing, capture_state, capture_wall_seconds, captured_seconds, last_heartbeat_at, updated_at)
values ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', 'OK', 'ready', 'recording', 0, 'stopped', 3000, 2990, now(), now());

do $$
declare n integer; kinds text[]; undelivered integer; pushes integer; emails integer;
begin
  delete from net.calls;
  n := public.lecture_health_check(7200, 28800);
  select array_agg(kind order by kind) into kinds from public.ops_alerts where kind <> 'lecture_notes_stuck';
  assert kinds = array['lecture_capture_gap', 'lecture_parts_missing', 'lecture_provider_failing', 'lecture_stuck', 'lecture_usage_hour_high'],
    format('alert kinds: %s', kinds);
  assert n = 5, format('raised %s', n);
  select count(*) into undelivered from public.ops_alerts where not delivered;
  assert undelivered = 0, 'every lecture alert delivered, including the older one';
  select count(*) into pushes from net.calls where url like '%send-push';
  select count(*) into emails from net.calls where url like '%ops-alert';
  assert pushes = 6 and emails = 6, format('push %s email %s', pushes, emails);
  assert (select detail->'lectures' from public.ops_alerts where kind = 'lecture_parts_missing') = '["30000000"]'::jsonb,
    'only the broken lecture is named';
  assert (select detail->'lectures' from public.ops_alerts where kind = 'lecture_stuck') = '["30000000"]'::jsonb
     and (select jsonb_array_length(detail->'lectures') from public.ops_alerts where kind = 'lecture_stuck') = 1,
    'only the genuinely stuck lecture';
  assert (select count(*) from net.calls where (timeout_milliseconds) = 60000) = (select count(*) from net.calls), 'alert calls use a 60s timeout';

  -- dedupe: a second run within 6 hours raises and sends nothing new
  delete from net.calls;
  n := public.lecture_health_check(7200, 28800);
  assert n = 0 and not exists (select 1 from net.calls), 'deduped';
end $$;

-- no recipients and no secret: nothing is sent, nothing is marked delivered
delete from vault.decrypted_secrets where name = 'push_send_secret';
insert into public.ops_alerts (kind, detail, delivered) values ('lecture_test', '{}', false);
do $$
begin
  delete from net.calls;
  perform public.lecture_deliver_ops_alerts();
  assert not exists (select 1 from net.calls), 'no secret, no sends';
  assert exists (select 1 from public.ops_alerts where kind = 'lecture_test' and not delivered), 'left undelivered';
end $$;

do $$ begin
  assert exists (select 1 from cron.job where jobname = 'semora-lecture-health' and schedule = '17 * * * *'), 'scheduled hourly';
end $$;

select '144 OK' as result;

-- ── audit: the same lectures do not re-raise an alert every 6 hours ──
do $$
declare first boolean; again boolean; other boolean;
begin
  delete from public.ops_alerts where kind = 'lecture_dedupe_probe';
  first := public.lecture_raise_alert('lecture_dedupe_probe', 'x', jsonb_build_object('fingerprint', 'set-A'));
  update public.ops_alerts set created_at = now() - interval '7 hours' where kind = 'lecture_dedupe_probe';
  again := public.lecture_raise_alert('lecture_dedupe_probe', 'x', jsonb_build_object('fingerprint', 'set-A'));
  other := public.lecture_raise_alert('lecture_dedupe_probe', 'x', jsonb_build_object('fingerprint', 'set-B'));
  assert first and not again and other, format('dedupe by fingerprint: %s %s %s', first, again, other);
end $$;
