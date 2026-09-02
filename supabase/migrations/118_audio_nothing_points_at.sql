-- ============================================================
-- SEMORA: AUDIO NOTHING POINTS AT
-- ============================================================
-- 117 finds audio to delete by walking `lecture_segments`. Everything it can
-- see, it sees through a row. So the one class it structurally cannot reach is
-- audio whose row is gone — and that is the class that lasts longest, because
-- nothing else can reach it either.
--
-- One such object has been in the bucket since 2026-08-13: 73 kB under lecture
-- b0371a4c, whose `lecture_recordings` row does not exist and whose segments
-- do not exist. Three weeks of a student's audio that no code path in this
-- system can name.
--
-- ─── HOW A ROW STOPS EXISTING ──────────────────────────────
-- Two mechanisms, and they compound:
--
--   lecture_segments_lecture_id_fkey is ON DELETE CASCADE. Deleting a lecture
--   removes every segment row, and with them every storage_path — the only
--   pointer to those objects that has ever existed.
--
--   purgeLectureAudio (lib/lectures.ts) tries to remove the objects first and
--   swallows the outcome: `await supabase.storage...remove(paths).catch(() => {})`.
--   The row is then deleted regardless. So a storage delete that failed —
--   offline, a transient error, or an RLS rejection during one of the anon
--   windows we are separately chasing — leaves the audio behind and destroys
--   the only record that it exists, in that order.
--
-- ─── WHY THE FIX BELONGS HERE AND NOT IN THE CLIENT ────────
-- Making the row deletion conditional on a successful storage delete would
-- trade this bug for a worse one: a student on a bad connection with a lecture
-- they cannot remove. The client is a phone — sometimes offline, sometimes
-- unauthenticated — and a retention promise cannot rest on it succeeding.
--
-- So the client keeps trying first (it usually works, and it is the fastest
-- path), and this is the floor: an object nothing references is deleted no
-- matter why nothing references it.
--
-- ─── WHY THIS IS SAFE, PRECISELY ───────────────────────────
-- uploadSegment writes the ROW FIRST and uploads SECOND (lib/lectures.ts:313
-- upsert, then :339 createSignedUploadUrl). An object therefore cannot exist
-- before its row does, and "no row" can only mean the row was created and
-- later removed. There is no in-flight window where a healthy upload looks
-- orphaned — which is the whole reason this is safe to automate at all.
--
-- The 24-hour floor is belt to that braces. It costs nothing, and it means a
-- future change to that ordering degrades into a delay rather than into
-- deleting a student's audio out from under an upload in progress.
-- ============================================================

create or replace function public.lecture_orphaned_audio(p_limit integer default 100)
returns table (path text)
language sql
stable
security definer
set search_path = public, storage
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'lectures'
    -- Nothing references it. Not "no transcript" — no ROW, anywhere.
    and not exists (
      select 1 from public.lecture_segments s where s.storage_path = o.name
    )
    -- Older than any upload could possibly be in flight. See the header: the
    -- row is written before the object, so this is redundant today and is here
    -- to stay correct if that ever changes.
    and o.created_at < now() - interval '24 hours'
  order by o.created_at
  limit greatest(1, p_limit);
$$;

comment on function public.lecture_orphaned_audio(integer) is
  'Lecture audio with no lecture_segments row pointing at it (118). Created by '
  'the ON DELETE CASCADE on lecture_segments removing the only pointer, usually '
  'after purgeLectureAudio swallowed a failed storage delete. Safe because '
  'uploadSegment writes the row before the object, so "no row" can only mean '
  'the row was deleted — never that an upload is still in flight.';

revoke all on function public.lecture_orphaned_audio(integer) from public, anon, authenticated;
grant execute on function public.lecture_orphaned_audio(integer) to service_role;

-- ─── The backlog alarm learns about orphans too ─────────────
create or replace function public.alert_lecture_audio_retained()
returns integer
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  stale    integer;
  orphaned integer;
begin
  select count(*) into stale
  from public.lecture_segments s
  join public.lecture_recordings r on r.id = s.lecture_id
  where s.storage_path is not null
    and s.status = 'done'
    and nullif(btrim(coalesce(s.transcript, '')), '') is not null
    and r.status in ('ready', 'transcribed', 'generating', 'failed')
    and s.created_at < now() - interval '24 hours';

  select count(*) into orphaned
  from storage.objects o
  where o.bucket_id = 'lectures'
    and not exists (select 1 from public.lecture_segments s where s.storage_path = o.name)
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
$$;

comment on function public.alert_lecture_audio_retained() is
  'Raises an ops_alerts row when lecture audio that should be gone is still in '
  'the bucket — transcribed-but-retained after 24h, or referenced by nothing '
  'after 48h (117, orphans added in 118). The backlog is the alarm because '
  'pg_cron reports a queued http_post as succeeded whatever comes back.';

revoke all on function public.alert_lecture_audio_retained() from public, anon, authenticated;
grant execute on function public.alert_lecture_audio_retained() to service_role;
