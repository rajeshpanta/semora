-- Do not call half a lecture ready
--
-- On 2026-09-14 a student recorded about thirty-eight minutes. Four of the
-- eight parts never left their phone. At 10:10 the server recorded
-- parts_missing = 4. At 10:35 it sent them a push saying "Your lecture notes
-- are ready".
--
-- The notes were real and worth having — they cover the twenty minutes that did
-- arrive, and withholding them would help nobody. What was wrong was the
-- sentence. `status = 'ready'` means the server finished doing what it could,
-- not that it had everything, and 138 gave us the column that knows the
-- difference. This reads it.
--
-- Complete: unchanged, word for word.
-- Incomplete: the notes are announced as covering part of the recording, and
-- the count comes along so the number in the push and the number on the lecture
-- screen are the same number.
--
-- The push is still sent. A student whose lecture lost audio needs to know that
-- more than anyone, and finding out from a transcript with a hole in it is how
-- it went until now.
--
-- Everything else about the job is untouched: one push per lecture ever, the
-- 24-hour window, the 8am-to-8pm local rule, the 60s pg_net timeout from 136,
-- and the skip-locked batch of twenty.

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
begin
  select decrypted_secret into secret
  from vault.decrypted_secrets where name = 'push_send_secret';

  -- No secret means every push would be refused at the door. Stamping the rows
  -- anyway would burn the one notification each lecture ever gets.
  if secret is null then
    return 0;
  end if;

  for rec in
    -- 141: parts_missing comes along now, so the wording below can tell a
    -- finished lecture from one that is only as finished as it can be.
    select r.id, r.user_id, r.title, coalesce(r.parts_missing, 0) as missing
    from public.lecture_recordings r
    join public.profiles p on p.id = r.user_id
    where r.status = 'ready'
      and r.notes_md is not null
      and r.notes_auto_attempts > 0
      and r.notes_ready_notified_at is null
      -- Nothing older than a day. A push about a lecture from last week reads
      -- as a bug, not a rescue.
      and r.updated_at > now() - interval '24 hours'
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

    perform net.http_post(
      url     := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || secret
      ),
      body := jsonb_build_object(
        'user_ids', jsonb_build_array(rec.user_id),
        'title',
          case
            when rec.missing > 0 then 'Your lecture notes are ready, with parts missing'
            else 'Your lecture notes are ready'
          end,
        'body',
          case
            when rec.missing > 0 then
              case
                when nullif(btrim(coalesce(rec.title, '')), '') is not null
                  then 'We wrote up “' || left(btrim(rec.title), 60) || '” from the audio that reached us. '
                       || rec.missing::text
                       || case when rec.missing = 1 then ' part is still missing.' else ' parts are still missing.' end
                else 'We wrote up your lecture from the audio that reached us. '
                     || rec.missing::text
                     || case when rec.missing = 1 then ' part is still missing.' else ' parts are still missing.' end
              end
            when nullif(btrim(coalesce(rec.title, '')), '') is not null
              then 'We finished the notes for “' || left(btrim(rec.title), 60) || '”.'
            else 'We finished writing up the lecture you recorded.'
          end,
        'translations', jsonb_build_object(
          'es', jsonb_build_object(
            'title',
              case
                when rec.missing > 0 then 'Tus apuntes están listos, pero faltan partes'
                else 'Tus apuntes de la clase están listos'
              end,
            'body',
              case
                when rec.missing > 0 then
                  case
                    when nullif(btrim(coalesce(rec.title, '')), '') is not null
                      then 'Redactamos «' || left(btrim(rec.title), 60) || '» con el audio que nos llegó. '
                           || case when rec.missing = 1
                                then 'Todavía falta 1 parte.'
                                else 'Todavía faltan ' || rec.missing::text || ' partes.' end
                    else 'Redactamos tu clase con el audio que nos llegó. '
                         || case when rec.missing = 1
                              then 'Todavía falta 1 parte.'
                              else 'Todavía faltan ' || rec.missing::text || ' partes.' end
                  end
                when nullif(btrim(coalesce(rec.title, '')), '') is not null
                  then 'Terminamos los apuntes de «' || left(btrim(rec.title), 60) || '».'
                else 'Terminamos de redactar la clase que grabaste.'
              end
          )
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

comment on function public.notify_lecture_notes_ready() is
  'SEMORA (112, 136, 141): one push per lecture when its notes land, 8am-8pm local, within 24h. '
  '141 reads parts_missing so a lecture that lost audio is announced as covering part of the '
  'recording, with the count, instead of being called ready.';
