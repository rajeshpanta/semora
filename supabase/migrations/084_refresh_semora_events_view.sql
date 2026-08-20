-- ============================================================
-- SEMORA: LET THE VIEW SEE user_id_inferred
-- ============================================================
-- A Postgres view freezes its column list at creation. semora_events was
-- defined with `select *` in 078, before 083 added user_id_inferred, so the
-- new column was invisible through the view — which is the only thing anyone
-- is supposed to query. `create or replace` re-expands the star and appends
-- the trailing column without disturbing the dependent views.
-- ============================================================

create or replace view public.semora_events as
  select * from public.analytics_events where app_name = 'semora';

revoke all on public.semora_events from anon, authenticated;
grant select on public.semora_events to service_role;
