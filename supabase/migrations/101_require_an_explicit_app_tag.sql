-- SEMORA (101): make "forgot the app tag" a loud error instead of a silent
-- misfile into the other app's data.
--
-- analytics_events is shared with Citizen. The column is already NOT NULL, so
-- a null was never possible — but it carried `default 'citizen'`, which means
-- OMITTING the column entirely was silently accepted and filed as Citizen's.
-- A Semora writer that forgot the tag would not error, would not warn, and
-- would not be noticed: its rows would simply become someone else's data and
-- quietly shrink whichever Semora funnel they belonged to.
--
-- Removing the default closes that. With no default and NOT NULL, an insert
-- that omits app_name fails immediately and visibly, at the write, instead of
-- succeeding into the wrong app.
--
-- Verified safe before changing a table two live apps write to. Every writer
-- sends the tag explicitly:
--
--   Semora  lib/analytics.ts:143                track()            'semora'
--   Semora  lib/analytics.ts:209                trackBeforeLeaving 'semora'
--   Semora  website/app/api/telemetry/route.ts  site beacon        'semora_site'
--   Citizen Lok-Citizenship/AppBackbone/AnalyticsService.swift:281 'citizen'
--
-- and nothing else writes here at all — no edge function, no cron, no trigger.
--
-- Citizen's own comment anticipated this exact change:
--
--   "The DB column has a default of 'citizen', so technically this is
--    redundant — but sending it explicitly protects against the unlikely
--    scenario where someone changes the default later."
--
-- This is that later.
alter table public.analytics_events
  alter column app_name drop default;

comment on column public.analytics_events.app_name is
  'SEMORA (101): which app wrote this row — ''semora'' | ''semora_site'' | ''citizen''. NOT NULL with NO default on purpose: every writer states its own name, so omitting it fails loudly rather than being filed as another app''s data. Read through semora_events / citizen_events rather than filtering this by hand.';
