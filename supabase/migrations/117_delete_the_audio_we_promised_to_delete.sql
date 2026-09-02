-- ============================================================
-- SEMORA: THE AUDIO WE PROMISED TO DELETE
-- ============================================================
-- Lecture audio is deleted the moment its transcript is written. That is what
-- the privacy policy says, what deleteLectureAudio does, and what
-- lecture-transcribe's own comment calls "what keeps the retention promise
-- true". It is true only for lectures that finish the ordinary way.
--
-- Measured 2026-09-02: 9 lectures, 29 objects, 26 MB still sitting in the
-- private `lectures` bucket with their transcripts long since written. Two
-- causes, and neither is a missing call — both are the same structural
-- mistake, that deletion happens at ONE moment on ONE path from ONE snapshot.
--
--   THE SWEEP HAS NO STORAGE CLIENT. sweep_stalled_lectures finalises a
--   lecture in plain SQL and cannot delete an object; 082 chose SQL precisely
--   so it would have no Edge Function hop to break. So every lecture the sweep
--   rescues keeps its audio, permanently. 5 of the 9 — and today made this
--   WIDER, not narrower: 113 added a branch for abandoned recordings and 115
--   added a transcript rebuild, both landing rows in 'transcribed' with audio
--   still on disk.
--
--   AUDIO THAT ARRIVED AFTER THE DELETE. The other 4. Lecture 17433304 stamped
--   audio_deleted_at at 09:30:13 on 08-31 and then uploaded seven more segments
--   between 09:34 and 10:06. Nothing could find them afterwards: the row
--   already claimed to be clean, and deleteLectureAudio had cleared
--   storage_path on every segment of the lecture rather than on the ones it
--   actually removed — including one object left with no row pointing at it at
--   all.
--
-- Both are fixed at source in this change's companion edits to
-- lecture-transcribe. This is the floor underneath them: a question asked on a
-- timer, which does not care which path finalised a lecture or which future
-- path forgets to clean up after itself.
--
--   IS THERE AUDIO WHOSE TRANSCRIPT IS ALREADY WRITTEN?
--
-- ─── WHAT THIS MUST NEVER DELETE ───────────────────────────
-- Only `done` segments. A `pending` segment's audio is the ONLY copy of that
-- stretch of the lecture — no transcript exists for it — so deleting it
-- destroys a student's content while claiming to protect their privacy. There
-- are 5 such segments right now and this leaves every one alone; they are a
-- separate problem (nothing retries a stranded upload once a lecture is past
-- 'transcribing') and must not be laundered into a retention win.
--
-- And nothing from a lecture still receiving audio, on the same 15-minute rule
-- 114 uses for notes: a recording that is still arriving is still a recording,
-- whatever its status column says.
--
-- ─── WHY A FUNCTION RATHER THAN A DELETE ───────────────────
-- storage.objects is metadata. Deleting the row here would leave the actual
-- file in the backing store with nothing referencing it — the opposite of the
-- promise, and undetectable afterwards. Only the storage API removes the
-- bytes, so this selects and the Edge Function deletes.
-- ============================================================

create or replace function public.lecture_audio_awaiting_deletion(p_limit integer default 25)
returns table (lecture_id uuid, paths text[])
language sql
stable
security definer
set search_path = public
as $$
  select s.lecture_id,
         array_agg(s.storage_path order by s.seq) as paths
  from public.lecture_segments s
  join public.lecture_recordings r on r.id = s.lecture_id
  where s.storage_path is not null
    -- Transcribed, and only transcribed. This is the whole safety rule.
    and s.status = 'done'
    and nullif(btrim(coalesce(s.transcript, '')), '') is not null
    -- The recording is over. 'generating' counts as over: notes are being
    -- written FROM the transcript, so the audio has already done its job.
    and r.status in ('ready', 'transcribed', 'generating', 'failed')
    -- ...but not if audio is still landing. Same rule as 114.
    and not exists (
      select 1 from public.lecture_segments s2
      where s2.lecture_id = s.lecture_id
        and s2.created_at > now() - interval '15 minutes'
    )
  group by s.lecture_id
  order by s.lecture_id
  limit greatest(1, p_limit);
$$;

comment on function public.lecture_audio_awaiting_deletion(integer) is
  'Lecture audio whose transcript is already written and which is therefore due '
  'for deletion (117). Returns ONLY segments in status done WITH a transcript — '
  'a pending segment holds the sole copy of that part of the lecture and '
  'deleting it would destroy content, not protect it. The Edge Function does '
  'the removal: deleting from storage.objects here would orphan the bytes.';

revoke all on function public.lecture_audio_awaiting_deletion(integer) from public, anon, authenticated;
grant execute on function public.lecture_audio_awaiting_deletion(integer) to service_role;

-- ─── Visibility, because this one CANNOT be allowed to fail quietly ─────────
-- A retention job that silently stops is indistinguishable from one with
-- nothing to do, and the thing it protects is a promise about a student's
-- private audio. So the backlog itself is the alarm: if audio that should be
-- gone is still here after a day of ten-minute ticks, something is broken.
create or replace function public.alert_lecture_audio_retained()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  stale integer;
begin
  select count(*) into stale
  from public.lecture_segments s
  join public.lecture_recordings r on r.id = s.lecture_id
  where s.storage_path is not null
    and s.status = 'done'
    and nullif(btrim(coalesce(s.transcript, '')), '') is not null
    and r.status in ('ready', 'transcribed', 'generating', 'failed')
    -- A full day past every chance to have been collected.
    and s.created_at < now() - interval '24 hours';

  if stale = 0 then
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
      'segments', stale,
      'meaning', 'audio whose transcript was written over 24h ago is still in the lectures bucket',
      'likely_cause', 'lecture-retention deployed without --no-verify-jwt, or storage refusing the delete',
      'check', 'select status_code, left(content,120) from net._http_response order by id desc limit 5'
    ),
    false
  );

  return stale;
end;
$$;

comment on function public.alert_lecture_audio_retained() is
  'Raises an ops_alerts row when audio that should have been deleted is still '
  'in the bucket a day later (117). The backlog is the alarm because pg_cron '
  'reports a queued http_post as succeeded whatever comes back — the failure '
  'mode that hid the Canvas outage for nine days.';

revoke all on function public.alert_lecture_audio_retained() from public, anon, authenticated;
grant execute on function public.alert_lecture_audio_retained() to service_role;

-- ─── Schedule ──────────────────────────────────────────────
-- :08 keeps it clear of the sweep (:00,:10,…), the notes worker (:05,:15,…),
-- the LMS worker (:02,:17,…) and the alert job (*/5). Storage deletes and the
-- transcript rebuild landing on the same second is avoidable for free.
select cron.unschedule('semora-lecture-audio-retention')
where exists (select 1 from cron.job where jobname = 'semora-lecture-audio-retention');

select cron.schedule(
  'semora-lecture-audio-retention',
  '8,28,48 * * * *',
  $cron$
  do $inner$
  declare
    secret text;
  begin
    select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'semora_lecture_cron_secret';

    if secret is not null then
      perform net.http_post(
        url     := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/lecture-retention',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-semora-lecture-cron-secret', secret
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
    end if;

    perform public.alert_lecture_audio_retained();
  end
  $inner$;
  $cron$
);
