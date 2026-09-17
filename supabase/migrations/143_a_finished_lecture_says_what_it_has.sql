-- ============================================================
-- A FINISHED LECTURE SAYS WHAT IT HAS, AND FINISHES WHEN THE PHONE DOES
-- ============================================================
-- Record Lecture completion plan, Phase 1 steps 1.5, 1.7(e), 1.8, 1.11 and the
-- server half of 3.1. Every function below is rebuilt from its LIVE definition
-- (verified identical to 138/139 on 2026-09-16), with changes marked "143".
-- This replaces the held migration 141, which was written from an older copy of
-- notify_lecture_notes_ready and would have deleted its second message.
--
-- 1. THE PHONE SAYS IT IS STILL RECORDING (U6, N9, G5). App versions from 1.15
--    call lecture_heartbeat every minute while recording or paused, and once
--    with 'stopped' at Stop. It is an RPC, not a column write: the 138 guard
--    silently keeps any lecture column the app is not allowed to write, so a
--    plain update would have looked like it worked and stored nothing.
--    With a heartbeat the server knows the difference between "still recording"
--    and "the phone died":
--      recording, no heartbeat for the recording limit + 30 minutes
--                 (a phone offline in a lecture hall keeps recording without
--                 being able to say so, and cannot record longer than that)
--                                             → finish from the parts present
--      paused,    no heartbeat for 12 hours   → finish from the parts present
--      stopped                                → finish after 15 quiet minutes
--    Never while a part that has reached the server is still waiting to be
--    transcribed (a provider retry): notes from part of a lecture whose other
--    parts are merely queued would be announced as missing audio.
--    Versions without a heartbeat keep exactly the old rules.
--
-- 2. NOTES START WHEN THE LECTURE IS DONE, NOT 10-15 MINUTES LATER (N9, G15).
--    A lecture the phone stopped, or a heartbeat lecture the server finished,
--    is sent for notes after a 1-2 minute settle instead of 10/15.
--
-- 3. THE PUSH TELLS THE TRUTH (R1, R2). "Your lecture notes are ready" is kept
--    for complete lectures. A lecture missing parts is announced as notes from
--    the parts that arrived, with the count. "Your notes now cover the whole
--    lecture" is only sent when nothing is missing. A lecture the server
--    finished because the phone went quiet is not announced until the phone
--    has been quiet for an hour.
--
-- 4. QUIETLY REWRITTEN NOTES (1.11). notes_rewrite_requested regenerates notes
--    without a push; the notes job clears it.
--
-- 5. A QUIZ CANNOT SPIN FOREVER (N7). quiz_generating older than 5 minutes is
--    reset by the sweep.
--
-- 6. NOTES FOR LONG LECTURES ARE WRITTEN IN SECTIONS (N3, 3.1).
--    lecture_note_sections holds each section's notes between invocations, so a
--    3-hour lecture never has to fit in one 150-second call.
--
-- 7. A TRANSCRIPT TOO SHORT FOR NOTES IS SHOWN, NOT SPUN ON (N5). The sweep
--    finishes it as 'ready' with error_code TOO_SHORT_FOR_NOTES instead of
--    leaving it 'transcribed' where the notes job (200-character minimum) will
--    never pick it up.
-- ============================================================

-- ── heartbeat ───────────────────────────────────────────────────
create or replace function public.lecture_heartbeat(
  p_lecture_id       uuid,
  p_state            text,
  p_wall_seconds     integer default null,
  p_captured_seconds integer default null,
  p_app_build        text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_state is null or p_state not in ('recording', 'paused', 'stopped') then
    raise exception 'invalid capture state' using errcode = '22023';
  end if;

  update public.lecture_recordings
     set last_heartbeat_at    = now(),
         capture_state        = p_state,
         capture_wall_seconds = case when p_wall_seconds is null then capture_wall_seconds
                                     else least(greatest(p_wall_seconds, 0), 604800) end,
         captured_seconds     = case when p_captured_seconds is null then captured_seconds
                                     else least(greatest(p_captured_seconds, 0), 86400) end,
         app_build            = coalesce(left(p_app_build, 32), app_build)
   where id = p_lecture_id
     and user_id = auth.uid()
     and source = 'recording'
     -- A finished lecture only takes the final 'stopped' report (its numbers
     -- feed the health check); it never goes back to "recording".
     and (status in ('recording', 'uploading', 'transcribing') or p_state = 'stopped');

  return found;
end;
$$;

revoke all on function public.lecture_heartbeat(uuid, text, integer, integer, text) from public, anon;
grant execute on function public.lecture_heartbeat(uuid, text, integer, integer, text) to authenticated, service_role;

comment on function public.lecture_heartbeat(uuid, text, integer, integer, text) is
  'SEMORA (143): the recording phone reports it is alive (every minute) and, at Stop, how long the session ran and how much audio it captured. Owner-only.';

-- ── section notes for long lectures ─────────────────────────────
create table if not exists public.lecture_note_sections (
  lecture_id uuid        not null references public.lecture_recordings(id) on delete cascade,
  idx        integer     not null,
  text_hash  text        not null,
  status     text        not null default 'pending' check (status in ('pending', 'done')),
  result     jsonb,
  attempts   integer     not null default 0,
  updated_at timestamptz not null default now(),
  primary key (lecture_id, idx)
);

comment on table public.lecture_note_sections is
  'SEMORA (143): notes for one section of a long lecture transcript, written by lecture-study-kit across several invocations. Keyed by the hash of the section text, so a transcript that grows only rewrites the sections that changed.';

alter table public.lecture_note_sections enable row level security;
revoke all on public.lecture_note_sections from anon, authenticated;

-- ── sweep (138 + 143) ───────────────────────────────────────────
-- 143 adds a parameter (the recording limit, in minutes). The no-argument
-- version is dropped first: two versions would make the cron call ambiguous.
-- The cron command `perform public.sweep_stalled_lectures();` is unchanged and
-- uses the default. When the recording limit is raised (LECTURE_MAX_SECONDS),
-- pass the new limit in that cron command.
drop function if exists public.sweep_stalled_lectures();
CREATE OR REPLACE FUNCTION public.sweep_stalled_lectures(p_max_recording_minutes integer DEFAULT 90)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  swept   integer := 0;
  rec     record;
  seg     record;
  n       integer;
  unrecoverable jsonb := '[]'::jsonb;
begin
  -- ─── 1. Abandoned mid-upload (082; 138: never while still recording) ──
  for rec in
    select r.id, r.user_id
    from public.lecture_recordings r
    where r.updated_at < now() - interval '15 minutes'
      and (
        -- Versions without a heartbeat: exactly the 138 rules.
        (
          r.last_heartbeat_at is null
          and r.status in ('uploading', 'transcribing')
          and (
            coalesce(r.segment_count, 0) > 0
            or (
              r.updated_at < now() - interval '3 hours'
              and not exists (
                select 1 from public.lecture_segments s
                where s.lecture_id = r.id
                  and s.created_at > now() - interval '3 hours'
              )
            )
          )
        )
        or
        -- 143: the phone says whether it is still recording.
        (
          r.last_heartbeat_at is not null
          and r.status in ('recording', 'uploading', 'transcribing')
          and exists (select 1 from public.lecture_segments s where s.lecture_id = r.id)
          and (
            r.capture_state = 'stopped'
            or (r.capture_state = 'recording'
                -- The lecture's own reserved length (the server's limit when it
                -- started), so a raised LECTURE_MAX_SECONDS needs no cron edit.
                and r.last_heartbeat_at < now() - make_interval(
                  mins => greatest(90, p_max_recording_minutes, coalesce(r.reserved_seconds, 0) / 60) + 30))
            or (r.capture_state = 'paused'    and r.last_heartbeat_at < now() - interval '12 hours')
          )
          -- Nothing that reached the server is still waiting on the provider.
          and not exists (
            select 1 from public.lecture_segments s
            where s.lecture_id = r.id
              and s.status in ('pending', 'uploaded', 'transcribing')
              and s.storage_path is not null
              and s.provider_failures < 6
              -- audit: a part recovery has given up on is not "in flight"
              and s.recovery_attempts < 3
          )
        )
      )
    for update skip locked
  loop
    select a.transcript as text, a.text_parts as done_count, a.total_seconds
      into seg
    from public.lecture_assemble_transcript(rec.id) a;

    if seg.done_count > 0 then
      update public.lecture_recordings
      set transcript       = seg.text,
          segment_count    = greatest(coalesce(segment_count, 0), seg.done_count),
          duration_seconds = seg.total_seconds,
          -- 143: a transcript too short to write notes from is shown as it is.
          status           = case when length(public.lecture_transcript_words(seg.text)) < 200 then 'ready' else 'transcribed' end,
          error_code       = case when length(public.lecture_transcript_words(seg.text)) < 200 then 'TOO_SHORT_FOR_NOTES' end,
          updated_at       = now()
      where id = rec.id;
      perform public.lecture_set_parts_missing(rec.id);
    elsif exists (
      select 1 from public.lecture_segments s
      where s.lecture_id = rec.id and s.status in ('pending', 'uploaded', 'transcribing')
        and s.storage_path is not null and s.provider_failures < 6 and s.recovery_attempts < 3
    ) and exists (
      select 1 from public.lecture_recordings r2 where r2.id = rec.id and r2.last_heartbeat_at is not null
    ) then
      -- 143: parts are still on their way (a provider retry, a slow upload).
      -- Nothing is failed while there is still audio to transcribe.
      continue;
    else
      -- Nothing usable was delivered: the free allowance goes back (audit).
      -- lecture_refund_usage refuses on its own if any done part holds text.
      update public.lecture_recordings
      set status     = 'failed',
          error_code = case
            when exists (select 1 from public.lecture_segments s where s.lecture_id = rec.id and s.status = 'done')
              then 'NO_SPEECH' else 'STALLED' end,
          updated_at = now()
      where id = rec.id;
      perform public.lecture_refund_usage(rec.user_id, rec.id, 'STALLED');
    end if;

    swept := swept + 1;
  end loop;

  -- ─── 2. Note generation whose isolate died (107, unchanged) ──
  for rec in
    select id,
           user_id,
           nullif(btrim(coalesce(transcript, '')), '') is not null as has_transcript
    from public.lecture_recordings
    where status = 'generating'
      and coalesce(notes_started_at, updated_at) < now() - interval '4 minutes'
    for update skip locked
  loop
    if rec.has_transcript then
      update public.lecture_recordings
      set status           = 'transcribed',
          error_code       = 'NOTES_FAILED',
          notes_started_at = null,
          updated_at       = now()
      where id = rec.id;
    else
      update public.lecture_recordings
      set status           = 'failed',
          error_code       = 'STALLED',
          notes_started_at = null,
          updated_at       = now()
      where id = rec.id;
    end if;

    swept := swept + 1;
  end loop;

  -- ─── 3. Never left the starting line (110, corrected in 138) ───
  for rec in
    select r.id, r.user_id
    from public.lecture_recordings r
    where r.status = 'recording'
      and (
        (
          not exists (select 1 from public.lecture_segments s where s.lecture_id = r.id)
          and r.created_at < now() - interval '2 hours'
          -- 143: a phone still reporting in is recording offline; wait for it.
          and (r.last_heartbeat_at is null or r.last_heartbeat_at < now() - interval '2 hours')
        )
        or
        (
          exists (select 1 from public.lecture_segments s where s.lecture_id = r.id)
          and not exists (
            select 1 from public.lecture_segments s
            where s.lecture_id = r.id
              and s.created_at > now() - interval '12 hours'
          )
        )
      )
    for update skip locked
  loop
    select a.transcript as text, a.text_parts as done_count, a.total_seconds
      into seg
    from public.lecture_assemble_transcript(rec.id) a;

    if seg.done_count > 0 then
      update public.lecture_recordings
      set transcript       = seg.text,
          segment_count    = greatest(coalesce(segment_count, 0), seg.done_count),
          duration_seconds = seg.total_seconds,
          status           = case when length(public.lecture_transcript_words(seg.text)) < 200 then 'ready' else 'transcribed' end,
          error_code       = case when length(public.lecture_transcript_words(seg.text)) < 200 then 'TOO_SHORT_FOR_NOTES' end,
          updated_at       = now()
      where id = rec.id;
      perform public.lecture_set_parts_missing(rec.id);
    else
      -- Nothing usable was delivered: the free allowance goes back (audit).
      -- lecture_refund_usage refuses on its own if any done part holds text.
      update public.lecture_recordings
      set status     = 'failed',
          error_code = case
            when exists (select 1 from public.lecture_segments s where s.lecture_id = rec.id and s.status = 'done')
              then 'NO_SPEECH' else 'STALLED' end,
          updated_at = now()
      where id = rec.id;
      perform public.lecture_refund_usage(rec.user_id, rec.id, 'STALLED');
    end if;

    swept := swept + 1;
  end loop;

  -- ─── 4. Parts that never arrived within 7 days (138, unchanged) ─────────
  for rec in
    select r.id, r.user_id, r.parts_missing
    from public.lecture_recordings r
    where r.parts_missing > 0
      and r.parts_unrecoverable_at is null
      and r.parts_missing_since < now() - interval '7 days'
      and r.status in ('transcribed', 'generating', 'ready', 'failed')
    for update skip locked
  loop
    update public.lecture_recordings
       set parts_unrecoverable_at = now()
     where id = rec.id;
    unrecoverable := unrecoverable || jsonb_build_object('lecture_id', rec.id, 'parts_missing', rec.parts_missing);
    swept := swept + 1;
  end loop;
  -- One alert per run (audit): a bad week used to send one push and one email
  -- per lecture.
  if jsonb_array_length(unrecoverable) > 0 then
    insert into public.ops_alerts (kind, detail, delivered)
    values (
      'lecture_parts_unrecoverable',
      jsonb_build_object(
        'lectures', unrecoverable,
        'count', jsonb_array_length(unrecoverable),
        'summary', jsonb_array_length(unrecoverable) || ' lecture(s) have parts that never reached the server within 7 days.',
        'meaning', 'parts of these recordings never reached the server within 7 days',
        'student_sees', 'the lecture is labelled as missing these parts'
      ),
      false
    );
  end if;

  -- ─── 5. A quiz claim whose isolate died (143) ─────────────────
  update public.lecture_recordings
     set quiz_generating = false,
         quiz_started_at = null
   where quiz_generating
     and coalesce(quiz_started_at, updated_at) < now() - interval '5 minutes';
  get diagnostics n = row_count;
  swept := swept + n;

  return swept;
end;
$function$;

-- Dropping the old version dropped its grants; a new function is executable by
-- PUBLIC until told otherwise. Only the cron (service role) may sweep, as since 082.
revoke all on function public.sweep_stalled_lectures(integer) from public, anon, authenticated;
grant execute on function public.sweep_stalled_lectures(integer) to service_role;

-- ── notes requests (138 + 143) ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_pending_lecture_notes(p_limit integer DEFAULT 5)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'pg_temp'
AS $function$
declare
  rec       record;
  secret    text;
  requested integer := 0;
begin
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'semora_lecture_cron_secret';

  if secret is null then
    return 0;
  end if;

  for rec in
    select r.id, r.user_id
    from public.lecture_recordings r
    where (
            (r.status = 'transcribed' and r.notes_md is null)
            -- 138: notes written from a transcript that has since grown.
            -- 143: or a quiet rewrite was asked for.
            or (r.status in ('transcribed', 'ready') and (r.notes_stale or r.notes_rewrite_requested))
          )
      and length(btrim(coalesce(r.transcript, ''))) >= 200
      and r.notes_auto_attempts < 3
      and (
        -- 143: the recording is known to be over — the phone said Stop, or the
        -- server finished a heartbeat lecture whose phone went quiet. A short
        -- settle is enough.
        (
          (r.capture_state = 'stopped'
           or (r.last_heartbeat_at is not null and r.last_heartbeat_at < now() - interval '2 hours'))
          and r.updated_at < now() - interval '1 minute'
          and not exists (
            select 1 from public.lecture_segments s
            where s.lecture_id = r.id
              and (
                s.created_at > now() - interval '2 minutes'
                -- a part that reached the server and is still being transcribed
                or (s.status in ('pending', 'uploaded', 'transcribing')
                    and s.storage_path is not null and s.provider_failures < 6
                    and s.recovery_attempts < 3)
              )
          )
        )
        or
        -- A long lecture's FIRST notes, part-way through their sections: carry
        -- on promptly rather than waiting the full 10 minutes between steps.
        -- Only while no notes exist yet and no audio is arriving (review
        -- finding): section rows outlive the notes, and without these guards
        -- every late part of a long lecture set off a paid rewrite a minute
        -- later, over a lecture still receiving audio.
        (
          r.status = 'transcribed' and r.notes_md is null
          and r.updated_at < now() - interval '1 minute'
          and exists (select 1 from public.lecture_note_sections n where n.lecture_id = r.id)
          and not exists (
            select 1 from public.lecture_segments s
            where s.lecture_id = r.id
              and (
                s.created_at > now() - interval '15 minutes'
                or (s.status in ('pending', 'uploaded', 'transcribing')
                    and s.storage_path is not null and s.provider_failures < 6
                    and s.recovery_attempts < 3)
              )
          )
        )
        or
        -- Everything else: the 138 wait. A lecture still receiving segments is
        -- still being recorded, whatever its status column says.
        (
          r.updated_at < now() - interval '10 minutes'
          and not exists (
            select 1 from public.lecture_segments s
            where s.lecture_id = r.id
              and s.created_at > now() - interval '15 minutes'
          )
        )
      )
    order by r.updated_at
    limit greatest(1, p_limit)
    for update skip locked
  loop
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
      timeout_milliseconds := 240000
    );

    requested := requested + 1;
  end loop;

  return requested;
end;
$function$;

-- ── notifications (138's two loops + 143 wording) ───────────────
CREATE OR REPLACE FUNCTION public.notify_lecture_notes_ready()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'pg_temp'
AS $function$
declare
  rec      record;
  secret   text;
  notified integer := 0;
  title_en text;
  body_en  text;
  title_es text;
  body_es  text;
  lecture_name text;
begin
  select decrypted_secret into secret
  from vault.decrypted_secrets where name = 'push_send_secret';

  if secret is null then
    return 0;
  end if;

  for rec in
    select r.id, r.user_id, r.title, coalesce(r.parts_missing, 0) as missing
    from public.lecture_recordings r
    join public.profiles p on p.id = r.user_id
    where r.status = 'ready'
      and r.notes_md is not null
      and r.notes_auto_attempts > 0
      and r.notes_ready_notified_at is null
      and r.notes_refreshed_at is null
      and r.updated_at > now() - interval '24 hours'
      -- 143: a lecture the server finished because its phone went quiet is not
      -- announced while that phone may still come back with the rest.
      and not (
        r.last_heartbeat_at is not null
        and coalesce(r.capture_state, '') <> 'stopped'
        and r.last_heartbeat_at > now() - interval '60 minutes'
      )
      and exists (select 1 from public.push_tokens t where t.user_id = r.user_id)
      and extract(
            hour from (
              now() at time zone (
                case when exists (
                  select 1 from pg_timezone_names z where z.name = nullif(p.timezone, '')
                ) then p.timezone else 'UTC' end
              )
            )
          ) between 8 and 20
    order by r.updated_at
    limit 20
    for update of r skip locked
  loop
    update public.lecture_recordings
       set notes_ready_notified_at = now()
     where id = rec.id;

    lecture_name := nullif(left(btrim(coalesce(rec.title, '')), 60), '');

    if rec.missing = 0 then
      title_en := 'Your lecture notes are ready';
      body_en  := case when lecture_name is not null then 'We finished the notes for “' || lecture_name || '”.'
                       else 'We finished writing up the lecture you recorded.' end;
      title_es := 'Tus apuntes de la clase están listos';
      body_es  := case when lecture_name is not null then 'Terminamos los apuntes de «' || lecture_name || '».'
                       else 'Terminamos de redactar la clase que grabaste.' end;
    else
      -- 143: notes from part of a recording are worth having, and the student
      -- needs to know that is what they are.
      title_en := 'Your lecture notes are ready — some audio is missing';
      body_en  := case when lecture_name is not null then 'Notes for “' || lecture_name || '” cover the parts that arrived. '
                       else 'Your notes cover the parts of the recording that arrived. ' end
                  || case when rec.missing = 1 then '1 part didn’t reach us.' else rec.missing || ' parts didn’t reach us.' end;
      title_es := 'Tus apuntes están listos, pero falta audio';
      body_es  := case when lecture_name is not null then 'Los apuntes de «' || lecture_name || '» cubren las partes que llegaron. '
                       else 'Tus apuntes cubren las partes de la grabación que llegaron. ' end
                  || case when rec.missing = 1 then 'No nos llegó 1 parte.' else 'No nos llegaron ' || rec.missing || ' partes.' end;
    end if;

    perform net.http_post(
      url     := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || secret
      ),
      body := jsonb_build_object(
        'user_ids', jsonb_build_array(rec.user_id),
        'title', title_en,
        'body', body_en,
        'translations', jsonb_build_object(
          'es', jsonb_build_object('title', title_es, 'body', body_es)
        ),
        'data', jsonb_build_object(
          'type', 'lecture_notes_ready',
          'lectureId', rec.id
        )
      ),
      timeout_milliseconds := 60000
    );

    notified := notified + 1;
  end loop;

  -- 138: notes rewritten after missing parts arrived.
  for rec in
    select r.id, r.user_id, r.title, coalesce(r.parts_missing, 0) as missing
    from public.lecture_recordings r
    join public.profiles p on p.id = r.user_id
    where r.status = 'ready'
      and r.notes_md is not null
      and r.notes_refreshed_at is not null
      and r.notes_refreshed_at > coalesce(r.notes_ready_notified_at, '-infinity'::timestamptz)
      and r.notes_refreshed_at > now() - interval '24 hours'
      and coalesce(r.notes_ready_notified_at, '-infinity'::timestamptz) < now() - interval '1 hour'
      and exists (select 1 from public.push_tokens t where t.user_id = r.user_id)
      and extract(
            hour from (
              now() at time zone (
                case when exists (
                  select 1 from pg_timezone_names z where z.name = nullif(p.timezone, '')
                ) then p.timezone else 'UTC' end
              )
            )
          ) between 8 and 20
    order by r.notes_refreshed_at
    limit 20
    for update of r skip locked
  loop
    update public.lecture_recordings
       set notes_ready_notified_at = now()
     where id = rec.id;

    lecture_name := nullif(left(btrim(coalesce(rec.title, '')), 60), '');

    if rec.missing = 0 then
      title_en := 'Your notes now cover the whole lecture';
      body_en  := case when lecture_name is not null then 'The rest of “' || lecture_name || '” arrived, and the notes are updated.'
                       else 'The rest of your recording arrived, and the notes are updated.' end;
      title_es := 'Tus apuntes ya cubren toda la clase';
      body_es  := case when lecture_name is not null then 'Llegó el resto de «' || lecture_name || '» y los apuntes están actualizados.'
                       else 'Llegó el resto de tu grabación y los apuntes están actualizados.' end;
    else
      -- 143: more arrived, but not everything. "The whole lecture" would be false.
      title_en := 'Your lecture notes were updated';
      body_en  := case when lecture_name is not null then 'More of “' || lecture_name || '” arrived and the notes are updated. '
                       else 'More of your recording arrived and the notes are updated. ' end
                  || case when rec.missing = 1 then '1 part is still missing.' else rec.missing || ' parts are still missing.' end;
      title_es := 'Tus apuntes se actualizaron';
      body_es  := case when lecture_name is not null then 'Llegó más de «' || lecture_name || '» y los apuntes están actualizados. '
                       else 'Llegó más de tu grabación y los apuntes están actualizados. ' end
                  || case when rec.missing = 1 then 'Todavía falta 1 parte.' else 'Todavía faltan ' || rec.missing || ' partes.' end;
    end if;

    perform net.http_post(
      url     := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || secret
      ),
      body := jsonb_build_object(
        'user_ids', jsonb_build_array(rec.user_id),
        'title', title_en,
        'body', body_en,
        'translations', jsonb_build_object(
          'es', jsonb_build_object('title', title_es, 'body', body_es)
        ),
        'data', jsonb_build_object(
          'type', 'lecture_notes_ready',
          'lectureId', rec.id
        )
      ),
      timeout_milliseconds := 60000
    );

    notified := notified + 1;
  end loop;

  return notified;
end;
$function$;

-- ── stuck-notes alert counts quiet rewrites too (138 + 143) ─────
CREATE OR REPLACE FUNCTION public.alert_lecture_notes_stuck()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  stuck integer;
begin
  select count(*) into stuck
  from public.lecture_recordings
  where (
          (status = 'transcribed' and notes_md is null)
          or (status in ('transcribed', 'ready') and (notes_stale or notes_rewrite_requested))
        )
    and notes_auto_attempts >= 3
    and updated_at > now() - interval '24 hours';

  if stuck < 2 then
    return 0;
  end if;

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
$function$;
