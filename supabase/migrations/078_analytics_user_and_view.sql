-- ============================================================
-- SEMORA ANALYTICS: WHO DID IT, AND WHOSE APP WAS IT
-- ============================================================
-- `analytics_events` is shared with CitiZen — it is not defined in this repo,
-- and 22% of its rows belong to the other app. Everything here is additive for
-- that reason; nothing changes CitiZen's behaviour.
--
-- ─── 1. user_id, stamped by the DATABASE not the client ───
-- Until now an event carried only a device_id, so nothing could be tied to an
-- account: "what did the people who paid actually do first?" was unanswerable,
-- and one student on an iPhone and a laptop looked like two strangers.
--
-- The column DEFAULTS to auth.uid() and the client does not send it. That is
-- deliberate and it is a security property, not a convenience: both INSERT
-- policies on this table are `with check (true)`, so a value supplied by the
-- client could name any user at all. Taken from the JWT, it cannot be forged.
-- Signed-out events keep a null user_id, which is correct — there is no user
-- yet — and they still carry device_id, so the pre-signup funnel is intact.
--
-- ON DELETE SET NULL: deleting an account must not destroy the aggregate
-- history, but it must stop pointing at a person.
-- ============================================================

alter table public.analytics_events
  add column if not exists user_id uuid default auth.uid()
    references auth.users(id) on delete set null;

comment on column public.analytics_events.user_id is
  'SEMORA (078): stamped from the JWT via default auth.uid(), never sent by the client — both INSERT policies are `with check (true)`, so a client-supplied value would be forgeable. Null for signed-out events.';

-- Partial: the null rows are the signed-out majority and never joined on.
create index if not exists analytics_events_user_created_idx
  on public.analytics_events (user_id, created_at desc)
  where user_id is not null;

-- ─── 2. A view that cannot forget the app filter ───
-- `app_name` DEFAULTS TO 'citizen', so a Semora row is only Semora because the
-- client sets it explicitly. Any query that forgets `where app_name='semora'`
-- silently mixes in the other app — which is a quiet way to be wrong rather
-- than a loud one. Query this instead.
create or replace view public.semora_events as
  select * from public.analytics_events where app_name = 'semora';

comment on view public.semora_events is
  'SEMORA (078): analytics_events scoped to this app. The base table is shared with CitiZen and app_name defaults to ''citizen'' — always query through here.';

-- Analytics is for the operator, not the app. No client role reads it.
revoke all on public.semora_events from anon, authenticated;
grant select on public.semora_events to service_role;
