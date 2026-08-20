-- ============================================================
-- SEMORA: RECOVER THE ATTRIBUTION THAT PRE-DATES user_id
-- ============================================================
-- 078 started stamping user_id from the JWT, but only for events created
-- after it shipped. 5,957 older events had no user at all, so every cohort,
-- retention and conversion question silently began on the day the column
-- landed — and the nine people who actually pay did all of their deciding
-- BEFORE that date, which is exactly the history worth having.
--
-- There is no device→user table to join on. What exists is timing: an
-- analytics `scan_completed` and a `gemini_call_log` success row describe the
-- same scan from two sides, one holding device_id and the other user_id. A
-- scan is rare enough that a ±120s window usually contains exactly one.
--
-- ─── Why this is safe enough to write ───
-- Only UNAMBIGUOUS matches count: an event whose window contains two or more
-- ledger rows is discarded, because there is no way to tell which user it
-- belongs to. A device is then only resolved if every one of its unambiguous
-- matches names the SAME user. Measured before applying: 40 devices matched,
-- 39 agreed with themselves, 1 disagreed and is excluded here rather than
-- guessed at.
--
-- ─── Why the new column ───
-- An inferred attribution must never be mistaken for a measured one. Rows
-- stamped from a JWT are facts; these are a good bet. `user_id_inferred`
-- keeps the two separable forever, so any analysis can exclude them and see
-- whether a conclusion survives without them.
-- ============================================================

alter table public.analytics_events
  add column if not exists user_id_inferred boolean not null default false;

comment on column public.analytics_events.user_id_inferred is
  'SEMORA (083): true when user_id was recovered by correlating a scan event with the scan ledger rather than stamped from a JWT. Exclude these to see only measured attribution.';

with ev as (
  select id, device_id, created_at
  from public.analytics_events
  where app_name = 'semora'
    and event_name = 'scan_completed'
    and user_id is null
    and device_id is not null
),
cand as (
  select e.id as ev_id, e.device_id, g.user_id,
         count(*) over (partition by e.id) as n
  from ev e
  join public.gemini_call_log g
    on g.status = 'success'
   and g.created_at between e.created_at - interval '120 seconds'
                        and e.created_at + interval '120 seconds'
),
resolved as (
  -- n = 1: exactly one ledger row sat in this event's window.
  select device_id, user_id from cand where n = 1 group by device_id, user_id
),
consistent as (
  -- The device never pointed at a second user.
  -- uuid has no min(); the group is single-valued by the HAVING anyway.
  select device_id, (array_agg(distinct user_id))[1] as user_id
  from resolved group by device_id having count(distinct user_id) = 1
)
update public.analytics_events a
   set user_id = c.user_id,
       user_id_inferred = true
  from consistent c
 where a.device_id = c.device_id
   and a.app_name = 'semora'
   and a.user_id is null;
