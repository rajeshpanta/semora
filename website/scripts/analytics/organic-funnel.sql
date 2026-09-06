-- Read-only, aggregate report. Browser identifiers are not exported.
-- Run from the repository root: supabase db query --linked --file website/scripts/analytics/organic-funnel.sql
-- Referrers and automation flags are client supplied; these are observed
-- browser journeys, not verified people or causal attribution. App Store
-- installs and cross-device activity cannot be joined by a browser cookie.
with site_events as (
  select device_id, session_id, created_at, event_name, properties
  from public.analytics_events
  where app_name = 'semora_site'
    and created_at >= now() - interval '30 days'
    and coalesce(properties->>'automated', 'false') <> 'true'
), entries as (
  select distinct on (session_id)
    device_id, session_id, created_at,
    properties->>'path' as landing_page,
    properties->>'referrer' as referrer
  from site_events
  where event_name = 'page_view'
    and properties->>'entry' = 'true'
    and session_id is not null
  order by session_id, created_at
), organic as (
  select * from entries
  where coalesce(referrer, '') ~ '(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.yahoo\.com)$'
), journey as (
  select o.*,
    exists (
      select 1 from site_events s where s.session_id=o.session_id
        and s.created_at >= o.created_at
        and s.event_name='signup_click'
        and s.properties->>'mode'='signup'
    ) as signup_intent,
    exists (
      select 1 from public.analytics_events a
      where a.app_name='semora' and a.device_id=o.device_id
        and a.created_at >= o.created_at
        and a.created_at < o.created_at + interval '7 days'
        and a.event_name in ('signed_in', 'sign_in_succeeded')
    ) as signed_in_within_7d,
    exists (
      select 1 from public.analytics_events a
      where a.app_name='semora' and a.device_id=o.device_id
        and a.created_at >= o.created_at
        and a.created_at < o.created_at + interval '7 days'
        and a.event_name='tasks_saved'
    ) as tasks_saved_within_7d
  from organic o
)
select landing_page,
  count(*) as search_sessions,
  count(distinct device_id) as browser_ids,
  count(*) filter (where signup_intent) as sessions_with_signup_click,
  count(*) filter (where signed_in_within_7d) as sessions_followed_by_sign_in,
  count(*) filter (where tasks_saved_within_7d) as sessions_followed_by_saved_tasks,
  count(*) filter (where created_at > now()-interval '7 days') as sessions_still_in_7d_window
from journey
 group by landing_page
 order by search_sessions desc;
