-- ============================================================
-- SEMORA: MAKE analytics_events.user_id ACTUALLY UNFORGEABLE
-- ============================================================
-- 078 gave the column a `default auth.uid()` and claimed a client could not
-- forge it. That claim was too strong, and testing showed why: the default
-- only applies when the client OMITS the column. A client that sends a
-- user_id explicitly overrides it, and the foreign key rejects only ids that
-- do not exist — supplying a REAL other user's id would have been accepted.
--
-- Both INSERT policies on this table are `with check (true)`, so RLS is not
-- going to catch it either. The fix is at the privilege layer: take away the
-- ability to write the column at all. With no INSERT grant on user_id, a
-- client that omits it gets the default (correct), and a client that supplies
-- it gets "permission denied for column user_id" (also correct).
--
-- The grant is revoked per-column, so every other column stays writable and
-- normal analytics is untouched — including CitiZen's, which shares this table
-- and never sends a user_id anyway.
-- ============================================================

revoke insert (user_id) on public.analytics_events from anon, authenticated;
revoke update (user_id) on public.analytics_events from anon, authenticated;

comment on column public.analytics_events.user_id is
  'SEMORA (078/079): stamped from the JWT via default auth.uid(). Clients hold no INSERT/UPDATE grant on this column, so the value cannot be supplied or altered by them. Null for signed-out events.';
