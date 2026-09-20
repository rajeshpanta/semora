-- A push names the platform it means
--
-- MOODLE_PLAN.md Phase 4.9. The hourly `semora-lms-pending-courses` job
-- (migration 136) gathers every qualifying student into one array and tells
-- them all "Canvas has classes waiting". Today that is harmless, because every
-- LMS connection in production is Canvas. The moment a Moodle student connects
-- it becomes a notification pointing them at a platform their school does not
-- use.
--
-- WHAT CHANGED, AND WHAT DID NOT
--
-- Every gate is carried over verbatim: the live-pending-course test with its
-- three signals and both fallbacks, `lms_pending_push_enabled`, the seven-day
-- cooldown, 09:00 in the student's own timezone, having a push token, and the
-- "already opening the app" exclusion. The stamp is still written before
-- pg_net resolves, for the same reason.
--
-- The only difference is that the one array becomes two, split by the provider
-- of the connections that actually qualified, and each gets its own wording.
-- A student with BOTH a Canvas and a Moodle connection pending is counted as
-- Canvas, so nobody can receive two pushes in one run.
--
-- Replaces the job in place: cron.schedule() upserts by name.

select cron.schedule(
  'semora-lms-pending-courses',
  '7 * * * *',
  $job$
  do $inner$
  declare
    canvas_ids uuid[];
    moodle_ids uuid[];
    secret     text;
  begin
    select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'push_send_secret';
    if secret is null then
      return;
    end if;

    -- One pass over the qualifying connections, remembering which providers
    -- each student had pending. Splitting afterwards keeps every gate below
    -- identical to the version this replaces.
    with qualifying as (
      select distinct c.user_id, c.provider
      from public.lms_connections c
      join public.profiles p on p.id = c.user_id
      where c.pending_courses_count > 0
        -- ─── Something still worth being interrupted for ──────────
        -- pending_courses_count alone counts a finished course shell the same
        -- as next week's midterm. Three signals, and the two fallbacks both
        -- err towards notifying, because the cost of a needless push is one
        -- tap and the cost of a silent miss is a semester of deadlines:
        --
        --   last_due >= today   the work itself is still ahead. On calendar-feed
        --                       connections this is the ONLY usable signal.
        --   last_due is null    no dated items to judge by. Never hide a course
        --                       for lacking the evidence to condemn it.
        --   term_end >= today   the school stated the term outright (token
        --                       connections only).
        --
        -- Deliberately NOT filtered on item_count: a course legitimately shows
        -- up before its first assignment is posted.
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
        )
    ), split as (
      select user_id, bool_or(provider = 'moodle') as has_moodle,
             bool_or(provider <> 'moodle') as has_other
      from qualifying
      group by user_id
    )
    select
      coalesce(array_agg(user_id) filter (where has_other), '{}'),
      coalesce(array_agg(user_id) filter (where has_moodle and not has_other), '{}')
      into canvas_ids, moodle_ids
    from split;

    if coalesce(array_length(canvas_ids, 1), 0) > 0 then
      perform net.http_post(
        url     := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || secret
        ),
        body := jsonb_build_object(
          'user_ids', to_jsonb(canvas_ids),
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
    end if;

    if coalesce(array_length(moodle_ids, 1), 0) > 0 then
      perform net.http_post(
        url     := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || secret
        ),
        body := jsonb_build_object(
          'user_ids', to_jsonb(moodle_ids),
          'title', 'Moodle has classes waiting',
          'body',  'New courses were found in your Moodle. Their deadlines are not in Semora until you add them.',
          'translations', jsonb_build_object(
            'es', jsonb_build_object(
              'title', 'Moodle tiene materias esperando',
              'body', 'Se encontraron cursos nuevos en tu Moodle. Sus entregas no estarán en Semora hasta que los agregues.'
            )
          ),
          'data',  jsonb_build_object('type', 'lms_new_courses')
        ),
        timeout_milliseconds := 60000
      );
    end if;

    -- Stamped BEFORE the async pg_net requests resolve, deliberately. If a
    -- POST fails we skip one cycle rather than risk re-sending on the next
    -- run; under-notifying is the safe direction for a nag.
    if coalesce(array_length(canvas_ids, 1), 0) + coalesce(array_length(moodle_ids, 1), 0) > 0 then
      update public.profiles
         set lms_pending_push_last_sent_at = now()
       where id = any(canvas_ids || moodle_ids);
    end if;
  end
  $inner$;
  $job$
);
