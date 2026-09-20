-- Where every Moodle student got to, and where they stopped.
--
--   psql "$SEMORA_DB_URL" -f website/scripts/analytics/moodle-funnel.sql
--
-- psql, not `supabase db query --file`: the \echo section headers are a psql
-- meta-command and the Supabase runner sends them to the server as SQL, where
-- they are a syntax error on line 36. Without psql to hand, paste one block at
-- a time into `supabase db query --linked "<block>"`; every block below is
-- valid on its own.
--
-- Read-only. America/Los_Angeles, 7-day window (the owner's reporting rules).
-- analytics_events is SHARED with the Citizen app, the marketing site and dev
-- builds, so every query filters app_name = 'semora'. Without that filter the
-- numbers are not wrong by a little.
--
-- The grain is DISTINCT SESSION. A student who taps "Find my Moodle" four
-- times is one person struggling, not four people trying.
--
-- ─── THE STEPS A STUDENT PASSES THROUGH ────────────────────────────────────
--
--   lms_provider_tapped      chose Moodle on the LMS settings screen
--   lms_connect_opened       the connect screen rendered
--   lms_setup_site_entered   typed or pasted their school's address
--   lms_setup_probe_result   the no-login site check answered
--   lms_setup_lane_chosen    picked phone or laptop
--   lms_setup_export_opened  Semora opened their Moodle in a browser
--   lms_setup_returned       they came back to Semora        <- the key one
--   lms_setup_paste_rejected they pasted the wrong thing     <- the stall
--     ... reason moodle_feed_url_other_lms means they pasted a link from a
--     DIFFERENT platform (almost always their Canvas feed). That one needs a
--     different fix from every other rejection: not clearer instructions, but
--     a student who is on the wrong platform entirely.
--   lms_setup_autofilled     the link came off the clipboard
--   canvas_setup_auto_advanced  the link validated and submitted itself
--   lms_discover_succeeded   Moodle answered with courses
--   lms_discover_failed      it did not, with a bounded reason
--   lms_courses_selected     they chose what to import
--   lms_connect_completed    CONNECTED
--   lms_connect_failed       the final save failed
--   lms_setup_help_opened    two failures, so they were offered help

\echo '════ 1. EVERY SESSION, STEP BY STEP, AND WHERE IT ENDED ════'
-- One row per student session: the full ordered trail, and the last step they
-- reached. This is the "what exactly happened to this person" view.

with e as (
  select session_id, device_id, event_name, properties, created_at
  from public.semora_events
  where app_name = 'semora'
    and created_at > now() - interval '7 days'
    and (properties->>'provider' = 'moodle'
         or (event_name = 'lms_provider_tapped' and properties->>'provider' = 'moodle'))
),
ranked as (
  select session_id, device_id, event_name, created_at,
         coalesce(properties->>'reason', properties->>'result', properties->>'setup_lane', '') as detail,
         row_number() over (partition by session_id order by created_at desc) as recency
  from e
)
select
  session_id,
  min(created_at at time zone 'America/Los_Angeles')          as started,
  round(extract(epoch from (max(created_at) - min(created_at)))) as seconds_spent,
  count(*)                                                     as events,
  -- The whole trail, in order, so nothing is hidden behind an aggregate.
  string_agg(
    event_name || case when detail <> '' then '(' || detail || ')' else '' end,
    ' → ' order by created_at
  )                                                            as journey,
  max(event_name) filter (where recency = 1)                   as last_step,
  bool_or(event_name = 'lms_connect_completed')                as connected
from ranked
group by session_id
order by started desc
limit 100;

\echo ''
\echo '════ 2. THE FUNNEL: how many made it past each step ════'

with e as (
  select session_id, event_name
  from public.semora_events
  where app_name = 'semora'
    and created_at > now() - interval '7 days'
    and properties->>'provider' = 'moodle'
),
steps(ord, step, matcher) as (values
  (1,  'chose Moodle',            array['lms_provider_tapped']),
  (2,  'opened connect',          array['lms_connect_opened']),
  (3,  'entered their school',    array['lms_setup_site_entered']),
  (4,  'site check answered',     array['lms_setup_probe_result']),
  (5,  'chose a lane',            array['lms_setup_lane_chosen']),
  (6,  'opened Moodle',           array['lms_setup_export_opened']),
  (7,  'CAME BACK',               array['lms_setup_returned']),
  (8,  'link accepted',           array['lms_setup_autofilled','canvas_setup_auto_advanced']),
  (9,  'Moodle answered',         array['lms_discover_succeeded']),
  (10, 'chose courses',           array['lms_courses_selected']),
  (11, 'CONNECTED',               array['lms_connect_completed'])
)
select s.ord, s.step,
       count(distinct e.session_id) as sessions,
       case when lag(count(distinct e.session_id)) over (order by s.ord) > 0
            then round(100.0 * count(distinct e.session_id)
                       / lag(count(distinct e.session_id)) over (order by s.ord), 1) end as pct_kept
from steps s
left join e on e.event_name = any(s.matcher)
group by s.ord, s.step
order by s.ord;

\echo ''
\echo '════ 3. WHERE THEY STOPPED: the last step of every dead session ════'
-- The single most useful table here. Every session that did NOT connect,
-- grouped by the step it died on. The biggest row is the thing to fix.

with e as (
  select session_id, event_name, properties, created_at
  from public.semora_events
  where app_name = 'semora'
    and created_at > now() - interval '7 days'
    and properties->>'provider' = 'moodle'
),
last_step as (
  select distinct on (session_id)
         session_id, event_name,
         coalesce(properties->>'reason', properties->>'result', '') as detail
  from e
  where session_id not in (select session_id from e where event_name = 'lms_connect_completed')
  order by session_id, created_at desc
)
select event_name as died_at, nullif(detail, '') as detail, count(*) as sessions
from last_step
group by 1, 2
order by sessions desc;

\echo ''
\echo '════ 4. THE BROWSER ROUND TRIP: did they come back? ════'
-- The one trip Semora cannot control. A student who opens their school''s
-- Moodle and never returns needs a completely different fix from one who
-- returns and then cannot find the link — and before lms_setup_returned
-- existed those two were the same row.

with e as (
  select session_id, event_name
  from public.semora_events
  where app_name = 'semora'
    and created_at > now() - interval '7 days'
    and properties->>'provider' = 'moodle'
),
trips as (
  select session_id,
    bool_or(event_name = 'lms_setup_returned')                                    as came_back,
    bool_or(event_name in ('lms_setup_autofilled','canvas_setup_auto_advanced'))  as pasted,
    bool_or(event_name = 'lms_connect_completed')                                 as connected
  from e
  where session_id in (select session_id from e where event_name = 'lms_setup_export_opened')
  group by session_id
)
select count(*)                                              as went_to_moodle,
       count(*) filter (where came_back)                     as came_back,
       count(*) filter (where came_back and not pasted)      as came_back_empty_handed,
       count(*) filter (where pasted)                        as pasted_a_link,
       count(*) filter (where connected)                     as connected
from trips;

\echo ''
\echo '════ 5. WHAT THEY PASTED WHEN IT WAS WRONG ════'
-- Fires while the student is still looking at the field, so it catches the
-- ones who read the hint and gave up without ever submitting. That is the
-- difference between "nobody can find the link" and "everybody finds the
-- wrong page", which need different fixes.

select properties->>'reason' as what_they_pasted,
       count(distinct session_id) as sessions,
       count(*) as times
from public.semora_events
where app_name = 'semora'
  and created_at > now() - interval '7 days'
  and event_name = 'lms_setup_paste_rejected'
  and properties->>'provider' = 'moodle'
group by 1 order by sessions desc;

\echo ''
\echo '════ 6. WHY A SUBMITTED LINK WAS REFUSED ════'
-- Every reason is a bounded code, and the server''s own code beats any client
-- guess. Anything landing in "other" is a gap in that table.

select coalesce(properties->>'reason', '(none)') as reason,
       count(distinct session_id) as sessions, count(*) as events
from public.semora_events
where app_name = 'semora'
  and created_at > now() - interval '7 days'
  and properties->>'provider' = 'moodle'
  and event_name in ('lms_discover_failed', 'lms_connect_failed')
group by 1 order by sessions desc;

\echo ''
\echo '════ 7. WHAT EACH SCHOOL''S MOODLE LOOKS LIKE ════'
-- Also THE table that decides whether the parked browser sign-in road
-- (MOODLE_PLAN.md §12) is ever worth building: it needs many hosts with
-- type_of_login 2 or 3. A wall of 1s means Moodle''s own launch page throws
-- before the login form and that road stays closed.

select properties->>'host'        as host,
       properties->>'result'      as check_result,
       properties->>'typeoflogin' as type_of_login,
       properties->>'mobile'      as mobile_ws,
       properties->>'sso'         as has_sso,
       count(distinct session_id) as sessions
from public.semora_events
where app_name = 'semora'
  and created_at > now() - interval '7 days'
  and event_name = 'lms_setup_probe_result'
group by 1,2,3,4,5
order by sessions desc, host;

\echo ''
\echo '════ 8. CONNECTIONS THAT EXIST, AND WHETHER THEY SYNC ════'
-- A connection is not a success until it has synced TWICE: once on connect,
-- and once from the background worker. The second run is what proves the
-- Vault credential and the schedule are both real.

select c.connection_method,
       c.last_sync_status,
       count(*)                                          as connections,
       count(*) filter (where r.runs >= 2)               as synced_twice_or_more,
       count(*) filter (where c.background_sync_enabled) as background_on,
       max(c.created_at at time zone 'America/Los_Angeles') as newest
from public.lms_connections c
left join (
  select connection_id, count(*) as runs
  from public.lms_sync_runs
  where status in ('success', 'partial')
  group by connection_id
) r on r.connection_id = c.id
where c.provider = 'moodle'
group by 1, 2
order by connections desc;

\echo ''
\echo '════ 9. WHAT EACH SYNC ACTUALLY SAW ════'
-- Migration 151 (lms_sync_runs.summary) was applied 2026-09-19, so this runs.
-- horizon_days is how far ahead that school''s export reaches: under 60 means
-- an administrator narrowed it, and the review screen says so.
-- unmatched_categories is a course key seen only under preset_what=all —
-- usually a real group-only course, but ALSO how a site-events pseudo-course
-- would leak in as a class at a school whose language Semora does not know.
-- undated is the token lane''s count of assignments the school never dated.

select r.connection_id,
       r.status,
       r.processed,
       r.summary->>'horizon_days'        as horizon_days,
       r.summary->'unmatched_categories' as unmatched_categories,
       r.summary->>'undated'             as undated,
       r.error_code,
       r.started_at at time zone 'America/Los_Angeles' as ran_at
from public.lms_sync_runs r
join public.lms_connections c on c.id = r.connection_id
where c.provider = 'moodle'
  and r.started_at > now() - interval '7 days'
order by r.started_at desc
limit 60;

\echo ''
\echo '════ 9b. COURSES THAT VANISHED, AND RENAMES THAT WERE FOLLOWED ════'
-- Two things that look identical in the data and are not:
--
--   a course whose shortname CHANGED  -> migration 154 re-keys it in place, and
--                                        the student is told nothing, because
--                                        nothing happened to them
--   a course that STOPPED APPEARING   -> the connection card says "Your
--                                        enrolment in X has ended in Moodle."
--
-- Before 154, the first case produced the second case's symptoms plus a "new
-- course" badge, and importing it duplicated the whole term.

select c.id as connection_id,
       c.last_error                                    as notice_on_the_card,
       c.last_sync_status,
       c.pending_courses_count,
       c.last_successful_sync_at at time zone 'America/Los_Angeles' as last_ok
from public.lms_connections c
where c.provider = 'moodle'
  and (c.last_error is not null or c.pending_courses_count > 0)
order by c.last_successful_sync_at desc nulls last
limit 50;

\echo ''
\echo '════ 9c. THE SITE CHECK, AND WHETHER ANYONE IS HAMMERING IT ════'
-- 30 per user per hour is the bound (migration 151). A user at or near it is
-- either stuck in a retry loop or is not a student.

select a.user_id,
       count(*)                                          as checks,
       count(distinct a.host)                            as distinct_hosts,
       max(a.at at time zone 'America/Los_Angeles')      as latest
from public.lms_probe_attempts a
where a.at > now() - interval '7 days'
group by a.user_id
order by checks desc
limit 25;

\echo ''
\echo '════ 10. WHICH BUILD THESE CAME FROM ════'
-- A new event reads as "broken" for the first week purely because OTA
-- delivery is silent and two-launch. Check the bundle before concluding
-- anything from a zero.

select properties->>'bundle' as bundle,
       min(created_at at time zone 'America/Los_Angeles') as first_seen,
       count(distinct session_id) as sessions
from public.semora_events
where app_name = 'semora'
  and created_at > now() - interval '7 days'
  and event_name = 'lms_connect_opened'
  and properties->>'provider' = 'moodle'
group by 1 order by first_seen;
