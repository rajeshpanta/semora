-- 146: what the real-world audit found (2026-09-16, before any of 142-145
-- shipped). Three small things that belong to no single earlier migration.
--
-- 1. Indexes for the scans the arrival job, retention and the health check
--    make every minute or hour on lecture_segments without a lecture_id:
--    by storage path, and by status for parts that are not done. Both partial,
--    so they stay small (retention nulls the path of a deleted part).
-- 2. The arrival job's cron passes a bigger batch: five parts a minute drained
--    a provider outage for the whole app at 300 parts an hour.
-- 3. alert_lecture_audio_retained also counts audio the 7-day arrival window
--    has passed over, which 142's retention now deletes; if that stops
--    happening, this says so.
--
-- Plain CREATE INDEX (not CONCURRENTLY): migrations run in a transaction, and
-- the table is small; the lock lasts well under a second.

create index if not exists lecture_segments_storage_path_idx
  on public.lecture_segments (storage_path)
  where storage_path is not null;

create index if not exists lecture_segments_open_idx
  on public.lecture_segments (status, created_at)
  where status <> 'done';

select cron.schedule(
  'semora-lecture-arrivals',
  '* * * * *',
  $job$select public.lecture_take_over_arrived_audio(20);$job$
);

create or replace function public.alert_lecture_audio_retained()
returns integer
language plpgsql
security definer
set search_path to 'public', 'storage', 'pg_temp'
as $function$
declare
  stale    integer;
  orphaned integer;
begin
  select count(*) into stale
  from public.lecture_segments s
  join public.lecture_recordings r on r.id = s.lecture_id
  where s.storage_path is not null
    and (
      (s.status = 'done'
       and nullif(btrim(coalesce(s.transcript, '')), '') is not null
       and r.status in ('ready', 'transcribed', 'generating', 'failed')
       and s.created_at < now() - interval '24 hours')
      -- 146: audio nothing will ever act on again (the 7-day arrival window
      -- has passed) that retention has not collected within a day.
      or (s.status <> 'done' and s.created_at < now() - interval '9 days')
    );

  select count(*) into orphaned
  from storage.objects o
  where o.bucket_id = 'lectures'
    and not exists (select 1 from public.lecture_segments s where s.storage_path = o.name)
    -- 139: same rule as lecture_orphaned_audio.
    and not public.lecture_audio_is_actionable(o.name, o.created_at)
    -- 48h, not 24: one full day past the point the janitor first becomes
    -- eligible to collect it, so a single missed tick is not an alert.
    and o.created_at < now() - interval '48 hours';

  if stale + orphaned = 0 then
    return 0;
  end if;

  if exists (
    select 1 from public.ops_alerts
    where kind = 'lecture_audio_retained'
      and created_at > now() - interval '12 hours'
  ) then
    return 0;
  end if;

  insert into public.ops_alerts (kind, detail, delivered)
  values (
    'lecture_audio_retained',
    jsonb_build_object(
      'transcribed_but_retained', stale,
      'orphaned_no_row', orphaned,
      'meaning', 'lecture audio that should have been deleted is still in the bucket',
      'likely_cause', 'lecture-retention deployed without --no-verify-jwt, or storage refusing the delete',
      'check', 'select status_code, left(content,120) from net._http_response order by id desc limit 5'
    ),
    false
  );

  return stale + orphaned;
end;
$function$;
