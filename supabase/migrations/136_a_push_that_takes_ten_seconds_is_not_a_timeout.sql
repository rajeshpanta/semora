-- ============================================================
-- A PUSH THAT TAKES TEN SECONDS IS NOT A TIMEOUT
-- ============================================================
-- On Sunday 2026-09-13 the weekly deadline digest sent its pushes and
-- send-push answered 200 after 10.0s. pg_net recorded the call as a failure:
-- "Timeout of 5000 ms reached". The daily flashcards-due push the hour before
-- did the same at 5.4s. Nobody missed a notification. The record said they
-- had, and the digest only gets slower as the number of students with a
-- deadline that week grows.
--
-- The cause is one missing argument. net.http_post defaults
-- timeout_milliseconds to 5000, and every caller of send-push relied on the
-- default. The two jobs that already knew their function could run long,
-- semora-lms-background-sync and semora-lecture-audio-retention, set 120000
-- explicitly. This gives every send-push caller an explicit 60000:
--
--   cron   semora-weekly-deadline-digest   (Sundays 17:00 UTC)
--   cron   semora-flashcards-due           (daily 16:00 UTC)
--   cron   semora-lms-pending-courses      (hourly)
--   fn     public.notify_lecture_notes_ready()
--   fn     public.alert_stripe_webhook_failures()   (push and email calls)
--
-- 60s, not 120s: send-push fans out to Expo in batches and its slowest
-- observed run is 10s, so a minute is six times the worst case while still
-- surfacing a genuinely hung call inside the hour.
--
-- Every definition below is the LIVE one, read from cron.job and
-- pg_get_functiondef on 2026-09-13, with exactly one change per call: the
-- added timeout_milliseconds line. Nothing else in them is edited.
-- cron.schedule with an existing job name replaces that job's command
-- (pg_cron 1.6.4), and CREATE OR REPLACE FUNCTION keeps owner and grants.
--
-- The pg_net timeout does not cancel the edge function, which is why the
-- pushes still went out. It only decides what net._http_response records,
-- and nothing in the schema acts on that table; it is read by people
-- checking whether a job worked. That is exactly the reading this fixes.
-- ============================================================

-- ── scheduled jobs ─────────────────────────────────────────────

select cron.schedule(
  'semora-weekly-deadline-digest',
  '0 17 * * 0',
  $job$
  do $inner$
  declare ids jsonb;
  begin
    select coalesce(jsonb_agg(user_id), '[]'::jsonb) into ids
    from (
      select t.user_id
      from public.tasks t
      where t.is_completed = false
        and t.due_date >= current_date
        and t.due_date < current_date + interval '7 days'
      group by t.user_id
    ) s;
    -- Only fire when someone actually has upcoming work — avoids a weekly
    -- no-audience 400 from send-push.
    if jsonb_array_length(ids) > 0 then
      perform net.http_post(
        url     := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret from vault.decrypted_secrets where name = 'push_send_secret'
          )
        ),
        body := jsonb_build_object(
          'user_ids', ids,
          'title', 'Your week ahead',
          'body',  'You have deadlines coming up this week — open Semora to plan them.',
          'translations', jsonb_build_object(
            'es', jsonb_build_object(
              'title', 'Tu próxima semana',
              'body', 'Tienes próximas entregas esta semana. Abre Semora para organizarlas.'
            )
          ),
          'data',  jsonb_build_object('type', 'weekly_digest')
        ),
        timeout_milliseconds := 60000
      );
    end if;
  end
  $inner$;
$job$
);

select cron.schedule(
  'semora-flashcards-due',
  '0 16 * * *',
  $job$
  do $inner$
  declare
    target_ids uuid[];
  begin
    select coalesce(array_agg(user_id), '{}')
      into target_ids
    from (
      -- cards.user_id is denormalized (migration 024) and RLS-scoped to the
      -- owner, so no join through decks is needed to establish ownership.
      select c.user_id
      from public.cards c
      join public.profiles p on p.id = c.user_id
      where c.due_at <= now()
        and p.flashcards_due_push_enabled
        and (
          p.flashcards_due_push_last_sent_at is null
          or p.flashcards_due_push_last_sent_at < now() - interval '3 days'
        )
        and exists (
          select 1 from public.push_tokens t where t.user_id = c.user_id
        )
      group by c.user_id
      having count(*) >= 5
    ) s;

    if coalesce(array_length(target_ids, 1), 0) > 0 then
      perform net.http_post(
        url     := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret from vault.decrypted_secrets where name = 'push_send_secret'
          )
        ),
        body := jsonb_build_object(
          'user_ids', to_jsonb(target_ids),
          'title', 'Cards are ready to review',
          'body',  'Your flashcards are due — a few minutes now is worth an hour before the exam.',
          'translations', jsonb_build_object(
            'es', jsonb_build_object(
              'title', 'Tus tarjetas están listas para repasar',
              'body', 'Tienes tarjetas pendientes. Unos minutos ahora pueden ahorrarte una hora antes del examen.'
            )
          ),
          -- app/_layout.tsx routes on data.type; 'flashcards_due' opens /flashcards.
          'data',  jsonb_build_object('type', 'flashcards_due')
        ),
        timeout_milliseconds := 60000
      );

      -- Stamp BEFORE the async pg_net request resolves, deliberately. If the
      -- POST fails we skip one cycle rather than risk re-sending on the next
      -- run; under-notifying is the safe direction for a nag.
      update public.profiles
         set flashcards_due_push_last_sent_at = now()
       where id = any(target_ids);
    end if;
  end
  $inner$;
$job$
);

select cron.schedule(
  'semora-lms-pending-courses',
  '7 * * * *',
  $job$
  do $inner$
  declare
    target_ids uuid[];
  begin
    select coalesce(array_agg(distinct c.user_id), '{}')
      into target_ids
    from public.lms_connections c
    join public.profiles p on p.id = c.user_id
    where c.pending_courses_count > 0
      -- ─── Something still worth being interrupted for ──────────
      -- pending_courses_count alone counts a finished Canvas shell the same
      -- as next week's midterm. Of the six students who qualified when this
      -- was first measured, one had nothing pending but coursework already
      -- in the past: an unprompted 9am notification about a course that is
      -- over is how a channel earns itself a Settings visit.
      --
      -- Three signals, and the two fallbacks both err towards notifying,
      -- because the cost of a needless push is one tap and the cost of a
      -- silent miss is a semester of deadlines:
      --
      --   last_due >= today   the work itself is still ahead. On calendar-feed
      --                       connections this is the ONLY usable signal, and
      --                       all 40 live connections are calendar_feed.
      --   last_due is null    no dated items to judge by. Never hide a course
      --                       for lacking the evidence to condemn it.
      --   term_end >= today   the school stated the term outright (token
      --                       connections only). A course whose loaded
      --                       assignments are all past can still be a live
      --                       term with more to come.
      --
      -- Deliberately NOT filtered on item_count: a course legitimately shows
      -- up before its first assignment is posted, and refusing to mention it
      -- until work appears would reintroduce the silence 103 removed.
      and exists (
        select 1
        from public.lms_pending_courses pc
        where pc.user_id = c.user_id
          and pc.connection_id = c.id
          and pc.resolved_at is null
          and pc.ignored_at is null
          and (
            pc.last_due is null
            or pc.last_due >= current_date
            or pc.term_end >= current_date
          )
      )
      and p.lms_pending_push_enabled
      and (
        p.lms_pending_push_last_sent_at is null
        or p.lms_pending_push_last_sent_at < now() - interval '7 days'
      )
      -- 09:00 where the student is, not where the server is.
      and public.semora_local_hour(p.timezone) = 9
      and exists (
        select 1 from public.push_tokens t where t.user_id = c.user_id
      )
      -- The Today banner already reaches anyone who is opening the app.
      and not exists (
        select 1
        from public.analytics_events e
        where e.user_id = c.user_id
          and e.app_name like 'semora%'
          and e.created_at > now() - interval '3 days'
      );

    if coalesce(array_length(target_ids, 1), 0) > 0 then
      perform net.http_post(
        url     := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret from vault.decrypted_secrets where name = 'push_send_secret'
          )
        ),
        body := jsonb_build_object(
          'user_ids', to_jsonb(target_ids),
          'title', 'Canvas has classes waiting',
          'body',  'New courses were found in your Canvas. Their deadlines are not in Semora until you add them.',
          'translations', jsonb_build_object(
            'es', jsonb_build_object(
              'title', 'Canvas tiene materias esperando',
              'body', 'Se encontraron cursos nuevos en tu Canvas. Sus entregas no estarán en Semora hasta que los agregues.'
            )
          ),
          -- app/_layout.tsx routes on data.type; opens /settings/lms/new-courses.
          'data',  jsonb_build_object('type', 'lms_new_courses')
        ),
        timeout_milliseconds := 60000
      );

      -- Stamped BEFORE the async pg_net request resolves, deliberately. If the
      -- POST fails we skip one cycle rather than risk re-sending on the next
      -- run; under-notifying is the safe direction for a nag.
      update public.profiles
         set lms_pending_push_last_sent_at = now()
       where id = any(target_ids);
    end if;
  end
  $inner$;
$job$
);

-- ── functions ──────────────────────────────────────────────────

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
    select r.id, r.user_id, r.title
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
        'title', 'Your lecture notes are ready',
        'body',
          case
            when nullif(btrim(coalesce(rec.title, '')), '') is not null
              then 'We finished the notes for “' || left(btrim(rec.title), 60) || '”.'
            else 'We finished writing up the lecture you recorded.'
          end,
        'translations', jsonb_build_object(
          'es', jsonb_build_object(
            'title', 'Tus apuntes de la clase están listos',
            'body',
              case
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

CREATE OR REPLACE FUNCTION public.alert_stripe_webhook_failures(p_force boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n            integer;
  first_at     timestamptz;
  last_at      timestamptz;
  secret       text;
  recipients   uuid[];
  alert_id     bigint;
  summary      text;
  subject      text;
  push_title   text;
  push_body    text;
  tag          text := '';
  pushed       boolean := false;
  emailed      boolean := false;
begin
  select count(*), min(created_at), max(created_at)
    into n, first_at, last_at
  from public.edge_request_log
  where fn = 'stripe-webhook'
    and created_at > now() - interval '30 minutes';

  -- Threshold of two, not one: this endpoint sits on a public URL, so a lone
  -- 'Missing signature' is usually an internet scanner, and alerting on it
  -- would train the operator to ignore the alert. A genuine Stripe failure
  -- ALWAYS repeats — Stripe retries on a backoff (observed 08-20: 20:20,
  -- 20:26, 20:30, 21:19, 22:00, 23:23, 06:51) — so a real problem clears this
  -- bar within minutes and noise does not.
  if not p_force and coalesce(n, 0) < 2 then
    return 0;
  end if;

  -- At most one alert an hour. Forced test fires are excluded (see 096).
  if not p_force and exists (
    select 1 from public.ops_alerts
    where kind = 'stripe_webhook_failing'
      and created_at > now() - interval '1 hour'
      and coalesce(detail->>'forced', 'false') <> 'true'
  ) then
    return 0;
  end if;

  if p_force then
    tag := 'TEST FIRE — NO ACTION NEEDED. ';
  end if;

  select coalesce(array_agg(user_id), '{}') into recipients
  from public.ops_alert_recipients;

  select decrypted_secret into secret
  from vault.decrypted_secrets where name = 'push_send_secret';

  if p_force then
    subject    := 'TEST FIRE — alerting works, nothing is wrong';
    push_title := 'Semora: test alert (all good)';
    push_body  := 'Drill only — the alerting path works. Nothing is wrong with Stripe.';
    summary :=
      'This is a DRILL. Nobody needs to do anything.' || E'\n\n'
      || 'It was triggered on purpose to prove the alerting path works end to '
      || 'end: database -> message -> your phone and inbox.' || E'\n\n'
      || 'Real failures found in the last 30 minutes: ' || coalesce(n, 0) || E'\n\n'
      || 'A REAL alert can never report zero — it only fires at two or more — '
      || 'so a zero here always means a drill.';
  else
    subject    := 'Stripe webhook failing (' || coalesce(n, 0) || ' rejected in 30m)';
    push_title := 'Semora: Stripe webhook failing';
    push_body  := coalesce(n, 0) || ' rejected deliveries in 30 min. Web purchases may not be granting Pro.';
    summary :=
      coalesce(n, 0) || ' Stripe webhook deliveries were REJECTED in the last 30 minutes.'
      || E'\n\n'
      || 'First: ' || coalesce(first_at::text, 'n/a') || E'\n'
      || 'Last:  ' || coalesce(last_at::text,  'n/a') || E'\n\n'
      || 'stripe-webhook is the only thing that grants or removes web-billed '
      || 'Pro. While it is rejecting deliveries, Stripe still charges cards and '
      || 'Semora never hears: a new subscriber pays and gets nothing, and a '
      || 'cancellation leaves someone on Pro for free.' || E'\n\n'
      || 'Check: Stripe Dashboard -> Developers -> Webhooks -> the endpoint -> '
      || 'recent deliveries. A failure there says which secret signed them.' || E'\n\n'
      || 'Raw: select * from public.edge_request_log where fn = ''stripe-webhook'' '
      || 'order by created_at desc;';
  end if;

  insert into public.ops_alerts (kind, detail)
  values (
    'stripe_webhook_failing',
    jsonb_build_object(
      'failures_30m', coalesce(n, 0),
      'first_at', first_at,
      'last_at', last_at,
      'forced', p_force
    )
  )
  returning id into alert_id;

  if secret is not null then
    if coalesce(array_length(recipients, 1), 0) > 0 then
      perform net.http_post(
        url     := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || secret
        ),
        body := jsonb_build_object(
          'user_ids', to_jsonb(recipients),
          'title', push_title,
          'body', push_body,
          'data', jsonb_build_object('type', 'ops_alert', 'kind', 'stripe_webhook_failing',
                                     'test', p_force)
        ),
        timeout_milliseconds := 60000
      );
      pushed := true;
    end if;

    perform net.http_post(
      url     := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/ops-alert',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || secret
      ),
      body := jsonb_build_object('subject', tag || subject, 'body', summary),
      timeout_milliseconds := 60000
    );
    emailed := true;
  end if;

  update public.ops_alerts
     set delivered = (pushed or emailed),
         detail = detail || jsonb_build_object('push', pushed, 'email', emailed)
   where id = alert_id;

  return coalesce(n, 0);
end;
$function$;

