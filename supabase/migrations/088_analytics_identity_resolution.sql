-- ============================================================
-- SEMORA ANALYTICS: ONE PERSON, EVERY DEVICE
-- ============================================================
-- Every event carries a `device_id` (this browser or install) and, once
-- someone is signed in, a `user_id` stamped from their JWT. Neither alone
-- answers the question that matters:
--
--   device_id  splits one student across their phone and their laptop, and
--              across a browser whose data they cleared.
--   user_id    is null for everything before they sign in — which is the whole
--              marketing site, the entire sign-in screen, and every event in
--              the funnel that decides whether they ever sign up at all.
--
-- So a journey that starts on a phone reading a blog post and ends with a
-- purchase on a laptop reads as three unrelated strangers.
--
-- The link already exists in the data and has never been used: the moment a
-- device produces ONE signed-in event, that device and that person are the
-- same. Resolving through that mapping stitches the anonymous half of a
-- journey to the identified half, and both halves of a person's devices to
-- each other.
--
-- Views, not a table. There is nothing to keep in sync and nothing to backfill
-- — the mapping is a fact already recorded, and a materialised copy would only
-- add a way for it to be wrong.
-- ============================================================

-- ─── device → person ────────────────────────────────────────────
-- The person a device belongs to, and when it first proved it.
--
-- MIN(created_at) rather than the latest: the question this answers is "whose
-- device is this", and the first signed-in event is the earliest moment we can
-- honestly say so. A shared device that two people log into resolves to the
-- first, which is the conservative answer — over-merging two students into one
-- would silently corrupt every funnel built on top.
create or replace view public.analytics_device_owner as
select
  device_id,
  min(user_id::text)::uuid as user_id,
  min(created_at)          as linked_at
from public.analytics_events
where user_id is not null
  and device_id is not null
group by device_id
having count(distinct user_id) = 1;

comment on view public.analytics_device_owner is
  'SEMORA (088): which signed-in person a device belongs to. Devices that have seen more than one account are excluded rather than guessed at — a shared library computer must not merge two students into one journey.';

-- ─── every event, resolved to a person ──────────────────────────
-- `person_id` is the identity to group by. It falls back through:
--   1. the user_id on the event itself (signed in at the time)
--   2. the owner of the device (signed in before or after, same browser)
--   3. the device id (never signed in — still one consistent visitor)
--
-- Text rather than uuid because the fallback is a device id, and a column that
-- is sometimes a uuid and sometimes not is a column nothing can join on.
create or replace view public.semora_journey as
select
  e.*,
  coalesce(e.user_id::text, o.user_id::text, e.device_id) as person_id,
  (e.user_id is not null or o.user_id is not null)        as identified,
  -- Robots, marked rather than deleted. Roughly half of recent "web visitors"
  -- were a headless browser minting a fresh device id per page load, which is
  -- indistinguishable from a person bouncing. Excluding them belongs in the
  -- query, not in what gets stored.
  coalesce((e.properties ->> 'automated')::boolean, false) as automated,
  coalesce((e.properties ->> 'ephemeral')::boolean, false)
    or (e.properties ->> 'persisted') = 'false'            as throwaway_device,
  e.properties ->> 'path'                                 as path,
  e.properties ->> 'referrer'                             as referrer
from public.analytics_events e
left join public.analytics_device_owner o on o.device_id = e.device_id
-- Both halves of the funnel: the marketing site and the app, in one place.
-- The base table is shared with CitiZen, whose events must never appear here.
where e.app_name in ('semora', 'semora_site');

comment on view public.semora_journey is
  'SEMORA (088): every Semora event, site and app, resolved to a person_id that survives signing in and crossing devices. Group by person_id; filter automated/throwaway_device to exclude robots.';

revoke all on public.analytics_device_owner from anon, authenticated;
revoke all on public.semora_journey from anon, authenticated;
grant select on public.analytics_device_owner to service_role;
grant select on public.semora_journey to service_role;
