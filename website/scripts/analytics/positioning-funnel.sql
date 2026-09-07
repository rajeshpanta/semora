-- Which marketing page produced an account, and did that account activate?
--
-- Run from the repository root:
--   supabase db query --linked --file website/scripts/analytics/positioning-funnel.sql
--
-- WHY THIS EXISTS ALONGSIDE organic-funnel.sql
--
-- That report answers "did an organic search session lead to a signup click and
-- some in-app events", entirely out of analytics_events. This one answers the
-- question a positioning change actually needs: of the people who left a
-- marketing page for the app, how many now hold a course, a Canvas connection
-- and real deadlines. The difference is the source. Activation here is read
-- from the PRODUCT TABLES, not from client events, and that matters:
--
--   * lms_connect_completed fired 2 times against 40 real connections, because
--     the event only shipped on 2026-08-31 and 25 of those connections predate
--     it — with the rest spread across 8 live client versions. The event
--     undercounts by an order of magnitude. lms_connections does not.
--   * canvas_offer_shown reads lower than canvas_offer_tapped for the same
--     reason: the impression event was added after the tap event.
--
-- A client event can only ever describe the builds that carry it. A row in
-- courses or lms_connections is what happened. Prefer the table.
--
-- HOW THE JOIN WORKS, AND WHERE IT HONESTLY STOPS
--
-- semoraai.com writes `semora_device_id` as a cookie scoped to .semoraai.com,
-- which app.semoraai.com reads and adopts (lib/analytics.ts siteDeviceId).
-- That shared browser id is the only link between a marketing visit and an
-- account. user_id is then stamped server-side from the JWT — clients hold no
-- INSERT grant on that column — so the account half of the join is trustworthy
-- even though the browser half is self-reported.
--
-- It cannot see, and must never be reported as if it could:
--   * anyone who read the site on a phone and installed from the App Store.
--     There is no shared identifier across that boundary and creating one would
--     mean fingerprinting. iOS is the majority of scans, so treat every number
--     below as a FLOOR on marketing's contribution, never a total.
--   * anyone who cleared cookies, used a private window, or switched device.
--
-- These are observed browser journeys. They are correlation, not attribution:
-- a landing page credited here is where someone happened to click, not proof
-- that the page caused the account.
--
-- Read-only and aggregate. No browser or user identifier is exported.

with clicks as (
  -- One row per browser that showed signup INTENT, tagged with the page it
  -- left from. `placement` (which control on the page) only began recording on
  -- 2026-09-06, so `path` is the field with history — prefer it, and fall back
  -- to placement only to break ties on pages with several CTAs.
  select
    device_id,
    min(created_at) as first_click_at,
    (array_agg(properties->>'path'      order by created_at))[1] as landing_page,
    (array_agg(properties->>'placement' order by created_at))[1] as placement
  from public.analytics_events
  where app_name = 'semora_site'
    and event_name = 'signup_click'
    and device_id is not null
    -- Sign-in is a returning user, not acquisition.
    and coalesce(properties->>'mode', 'signup') = 'signup'
    and coalesce(properties->>'automated', 'false') <> 'true'
  group by device_id
),
accounts as (
  -- The account that later appeared on that same browser. Bounded to 7 days so
  -- a shared or recycled browser cannot credit a page months after the fact.
  select distinct on (c.device_id)
    c.landing_page, c.placement, e.user_id
  from clicks c
  join public.analytics_events e
    on  e.device_id = c.device_id
    and e.app_name  = 'semora'
    and e.user_id is not null
    and e.created_at >= c.first_click_at
    and e.created_at <  c.first_click_at + interval '7 days'
  order by c.device_id, e.created_at
)
select
  coalesce(a.landing_page, '(unknown)')                    as landing_page,
  count(*)                                                 as accounts,
  count(*) filter (where co.user_id is not null)           as with_any_course,
  count(*) filter (where lms.user_id is not null)          as with_canvas,
  count(*) filter (where t.user_id is not null)            as with_deadlines,
  count(*) filter (where ent.user_id is not null)          as went_pro
from accounts a
left join (select distinct user_id from public.courses)                      co  on co.user_id  = a.user_id
left join (select distinct user_id from public.lms_connections)              lms on lms.user_id = a.user_id
left join (select distinct user_id from public.tasks)                        t   on t.user_id   = a.user_id
left join (select distinct user_id from public.entitlements where is_pro)    ent on ent.user_id = a.user_id
group by 1
order by accounts desc, landing_page;
