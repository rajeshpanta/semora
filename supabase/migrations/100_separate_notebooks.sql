-- SEMORA (100): give each app its own notebook to read from.
--
-- analytics_events is shared with the Citizen app. One column keeps them
-- apart, and reading the raw table means remembering to filter on it EVERY
-- time. That is not a theoretical risk — during the 2026-08-23 audit it went
-- wrong twice in one sitting: a Chinese-language voice failure was reported
-- as a Semora bug when it was Citizen's, and an alerting monitor fired on
-- Citizen's traffic. Both because the raw table was queried directly.
--
-- Two named views, so the right thing to read is obvious and the wrong thing
-- takes deliberate effort.

-- ── Semora: the app AND the marketing site ──────────────────────────────
-- Was `app_name = 'semora'`, which silently excluded the website. The site
-- writes 'semora_site' (a separate tag on purpose, so the two are still
-- distinguishable inside this view), and 099's telemetry fix means it is
-- about to start writing for the first time. Left as an equality check, the
-- funnel it unblocks would have been invisible in the one view the codebase
-- tells everyone to use — and the obvious conclusion would have been that
-- the fix had not worked.
create or replace view public.semora_events as
select id, event_name, properties, device_id, app_version, platform,
       created_at, app_name, user_id, user_id_inferred, session_id
from public.analytics_events
where app_name like 'semora%';

comment on view public.semora_events is
  'SEMORA (100): every Semora row — the app (app_name=''semora'') and the marketing site (''semora_site''). Read this, never analytics_events: the raw table also holds the Citizen app. Filter on app_name INSIDE this view to separate app from site.';

-- ── Citizen: its own notebook ───────────────────────────────────────────
-- Citizen has no equivalent and so has only ever had the raw table to read,
-- which is the same trap pointing the other way: any Citizen query that
-- forgets to filter silently counts Semora's users as its own.
create or replace view public.citizen_events as
select id, event_name, properties, device_id, app_version, platform,
       created_at, app_name, user_id, user_id_inferred, session_id
from public.analytics_events
where app_name = 'citizen';

comment on view public.citizen_events is
  'SEMORA (100): every Citizen row. Counterpart to semora_events — created so neither app has to read the shared table directly.';

-- Match semora_events' existing grants exactly: readable by the operator and
-- the service role, not by anon or authenticated. Analytics is operator data.
revoke all on public.citizen_events from anon, authenticated;
revoke all on public.semora_events  from anon, authenticated;
