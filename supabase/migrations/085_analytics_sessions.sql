-- ============================================================
-- SEMORA: SESSIONS
-- ============================================================
-- Events were individually timestamped but had no notion of a visit, so
-- "how long does someone stay", "how many sessions before they pay" and
-- "where in a single sitting do they drop" were all unanswerable — the events
-- existed, nothing tied them into one arc.
--
-- session_id is generated on the client (one per launch, rotated after a spell
-- in the background) rather than derived here. Deriving sessions from
-- timestamp gaps is guesswork that changes whenever you change the gap; a real
-- identifier is decided once, at the only place that knows the app resumed.
--
-- NOTE the grant. 080 replaced the table-level INSERT grant with an explicit
-- column list to stop user_id being forgeable, which means a new column is NOT
-- writable by clients until it is named here. Miss this and analytics silently
-- keeps working while the new field stays null forever.
-- ============================================================

alter table public.analytics_events
  add column if not exists session_id text;

comment on column public.analytics_events.session_id is
  'SEMORA (085): one id per app launch, rotated after the app has been backgrounded past a threshold. Groups events into a single visit.';

create index if not exists analytics_events_session_idx
  on public.analytics_events (session_id, created_at)
  where session_id is not null;

grant insert (session_id) on public.analytics_events to anon, authenticated;

create or replace view public.semora_events as
  select * from public.analytics_events where app_name = 'semora';
revoke all on public.semora_events from anon, authenticated;
grant select on public.semora_events to service_role;
