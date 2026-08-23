-- SEMORA (102): a wrong app tag should fail as loudly as a missing one.
--
-- 101 made the tag mandatory, which closed "forgot to say who I am". It did
-- nothing about "said the wrong thing", because the column accepted any string
-- at all. Two ways that bites:
--
--   'citizen' from Semora code — a copy-paste between two apps that share a
--     table. The rows land in the other app's data and nothing complains.
--
--   'Semora' with a capital — matches NEITHER view. semora_events tests
--     `like 'semora%'`, which is case-sensitive, so the rows exist, are
--     counted by nothing, and are invisible to both apps at once. That is
--     strictly worse than landing in the wrong bucket, because at least a
--     wrong bucket can be noticed by someone.
--
-- Three values, spelled out. Adding a fourth app means editing this line
-- first, which is the point: joining a table two live products depend on
-- should be a deliberate act, not something a typo can accomplish.
--
-- Safe against history: 'semora' (7744) and 'citizen' (2045) are the only
-- values that have ever existed, so every one of the 9789 existing rows
-- passes. 'semora_site' has never been written — the website's telemetry was
-- silently dropping every event until the fix in this same session — but it
-- is included because the site is about to start writing for the first time.
alter table public.analytics_events
  add constraint analytics_events_app_name_known
  check (app_name in ('semora', 'semora_site', 'citizen'));

comment on constraint analytics_events_app_name_known on public.analytics_events is
  'SEMORA (102): the tag must name a known app. Guards the shared table against a typo becoming another app''s data, or vanishing from both. Add a value here before shipping a writer that uses it.';
