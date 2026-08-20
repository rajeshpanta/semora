-- ============================================================
-- SEMORA: THE REVOKE IN 079 DID NOTHING — DO IT PROPERLY
-- ============================================================
-- 079 tried `revoke insert (user_id) ... from anon, authenticated` and a live
-- forgery test still succeeded: one signed-in account attributed an event to a
-- different real user and the row was written with the victim's id.
--
-- The reason is how Postgres layers privileges. These roles hold a TABLE-level
-- INSERT grant, which authorises every column in the table. A column-level
-- REVOKE cannot subtract from it — there is nothing column-shaped to remove.
-- The table grant has to go first, and the columns granted back explicitly.
--
-- So: drop the blanket grant, then re-grant every column EXCEPT user_id. That
-- is the minimum change — clients keep writing exactly what they wrote before,
-- including CitiZen's, which shares this table. A client that omits user_id
-- gets `default auth.uid()`; one that supplies it now gets a hard permission
-- error instead of a silently trusted value.
--
-- `id` is deliberately excluded too: it is a bigserial and no client should be
-- choosing primary keys.
-- ============================================================

revoke insert on public.analytics_events from anon, authenticated;
revoke update on public.analytics_events from anon, authenticated;

grant insert (app_name, event_name, properties, device_id, app_version, platform, created_at)
  on public.analytics_events to anon, authenticated;
