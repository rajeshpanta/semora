-- ============================================================
-- SEMORA: DOES THE UNGRADED QUEUE ACTUALLY SHRINK?
-- ============================================================
-- The "Waiting on a grade" card moved into the desktop rail and grew an
-- inline percentage field, so recording a grade costs one keystroke instead
-- of a navigation. It fires `grade_recorded`. Until now that event landed in
-- analytics_events and nothing read it, which is the same as not having
-- shipped the measurement at all: the change was made precisely because the
-- queue grows, and there was no way to see whether it stopped growing.
--
-- Four views, in the order you would actually ask the questions:
--
--   semora_grade_entry        one row per grade typed in — the raw event,
--                             with the JSON unpacked and type-checked
--   semora_grade_entry_daily  is anyone using it, and is that rising
--   semora_ungraded_backlog   how deep is each student's queue RIGHT NOW
--   semora_grade_entry_effect before vs after: does using it change the
--                             share of finished work that has a score
--
-- Views, not tables, matching 081/088: the volumes are tiny and a stale
-- answer about a feature's effect is worse than a slow one.
--
-- All four are operator tools. Views run as their owner, so these read tasks
-- straight through RLS — every client role is revoked below, deliberately and
-- not as boilerplate.
-- ============================================================

-- ─── one row per grade typed in ─────────────────────────────────
-- `percent` is regex-guarded rather than cast blindly. properties is
-- free-form JSON written by the client; one malformed value would otherwise
-- take down every query built on this view, which is a bad trade for a
-- number that is only ever descriptive.
--
-- No person_id resolution here (unlike semora_journey). Recording a grade
-- requires a signed-in session and a task that belongs to you, so user_id is
-- always present — and it is the only key that joins to tasks.
create or replace view public.semora_grade_entry as
  select
    e.user_id,
    e.created_at,
    date_trunc('day', e.created_at)                as day,
    coalesce(e.properties ->> 'screen', 'unknown') as screen,
    e.platform,
    case
      when e.properties ->> 'percent' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (e.properties ->> 'percent')::numeric
    end                                            as percent
  from public.semora_events e
  where e.event_name = 'grade_recorded'
    and e.user_id is not null;

comment on view public.semora_grade_entry is
  'SEMORA (089): every grade typed into the app, with screen/platform/percent unpacked. `screen` distinguishes the fast path (today_rail) from any future entry point.';

-- ─── is it being used, and is that rising ───────────────────────
-- Split by screen on purpose: the rail card is one entry point and the task
-- screen will grow others. A single total would hide the fast path getting
-- popular while the slow one dies, which is the outcome being aimed for.
create or replace view public.semora_grade_entry_daily as
  select
    day,
    screen,
    platform,
    count(*)                  as entries,
    count(distinct user_id)   as students,
    round(avg(percent), 1)    as avg_percent
  from public.semora_grade_entry
  group by day, screen, platform;

comment on view public.semora_grade_entry_daily is
  'SEMORA (089): grade entries per day by screen and platform. Rising `entries` with flat `students` means a few people bulk-clearing; rising `students` is adoption.';

-- ─── how deep is the queue right now ────────────────────────────
-- Mirrors the app's definition exactly: `is_completed` and `score is null`
-- (app/(tabs)/index.tsx — completedWaitingForGrade). If that filter ever
-- changes, change it here too, or the dashboard measures a different queue
-- from the one the student is looking at.
--
-- oldest_ungraded_age_days is the number that matters most. A queue of three
-- items from this week is a student who has not got their work back yet; a
-- queue of three items from six weeks ago is the hole in the grade model
-- that the card exists to close.
create or replace view public.semora_ungraded_backlog as
  with completed as (
    select
      t.user_id,
      count(*) filter (where t.score is null)     as ungraded,
      count(*) filter (where t.score is not null) as graded,
      min(t.completed_at) filter (where t.score is null) as oldest_ungraded_at
    from public.tasks t
    where t.is_completed
    group by t.user_id
  ),
  entries as (
    select
      user_id,
      count(*)                                                     as grades_recorded_in_app,
      count(*) filter (where created_at > now() - interval '7 days')  as grades_recorded_7d,
      count(*) filter (where created_at > now() - interval '30 days') as grades_recorded_30d,
      max(created_at)                                              as last_grade_recorded_at
    from public.semora_grade_entry
    group by user_id
  )
  select
    c.user_id,
    c.ungraded,
    c.graded,
    c.ungraded + c.graded                                             as completed_total,
    round(c.graded::numeric / nullif(c.ungraded + c.graded, 0), 3)    as graded_share,
    c.oldest_ungraded_at,
    (extract(epoch from now() - c.oldest_ungraded_at) / 86400)::int   as oldest_ungraded_age_days,
    coalesce(e.grades_recorded_in_app, 0)                             as grades_recorded_in_app,
    coalesce(e.grades_recorded_7d, 0)                                 as grades_recorded_7d,
    coalesce(e.grades_recorded_30d, 0)                                as grades_recorded_30d,
    e.last_grade_recorded_at
  from completed c
  left join entries e on e.user_id = c.user_id;

comment on view public.semora_ungraded_backlog is
  'SEMORA (089): per-student depth of the "Waiting on a grade" queue, using the app''s own definition (is_completed and score is null), beside how many grades that student has typed in. Sort by oldest_ungraded_age_days to find abandoned queues.';

-- ─── before vs after ────────────────────────────────────────────
-- The closest thing to a causal read the current schema allows.
--
-- HONEST CAVEAT, because this view will be quoted at some point: `tasks` has
-- no score_recorded_at. A task is bucketed by when it was COMPLETED, not by
-- when it was graded, so a task finished before someone first used the card
-- and graded through the card afterwards counts in `graded_before`. That
-- flatters the "before" side, so this view UNDERSTATES the card's effect.
-- Treat a positive gap as real and a flat result as inconclusive rather than
-- as evidence the card does nothing. A timestamped score column is what would
-- make this exact rather than directional.
create or replace view public.semora_grade_entry_effect as
  with first_entry as (
    select user_id, min(created_at) as first_recorded_at
    from public.semora_grade_entry
    group by user_id
  )
  select
    f.user_id,
    f.first_recorded_at,
    count(*) filter (where t.completed_at <  f.first_recorded_at)                            as completed_before,
    count(*) filter (where t.completed_at <  f.first_recorded_at and t.score is not null)    as graded_before,
    count(*) filter (where t.completed_at >= f.first_recorded_at)                            as completed_after,
    count(*) filter (where t.completed_at >= f.first_recorded_at and t.score is not null)    as graded_after
  from first_entry f
  join public.tasks t
    on t.user_id = f.user_id
   and t.is_completed
   and t.completed_at is not null
  group by f.user_id, f.first_recorded_at;

comment on view public.semora_grade_entry_effect is
  'SEMORA (089): for students who have typed a grade in-app, the share of finished work carrying a score before vs after their first entry. Directional only — tasks are bucketed by completion date because score has no timestamp, which understates the effect.';

revoke all on public.semora_grade_entry        from anon, authenticated;
revoke all on public.semora_grade_entry_daily  from anon, authenticated;
revoke all on public.semora_ungraded_backlog   from anon, authenticated;
revoke all on public.semora_grade_entry_effect from anon, authenticated;

grant select on public.semora_grade_entry        to service_role;
grant select on public.semora_grade_entry_daily  to service_role;
grant select on public.semora_ungraded_backlog   to service_role;
grant select on public.semora_grade_entry_effect to service_role;
