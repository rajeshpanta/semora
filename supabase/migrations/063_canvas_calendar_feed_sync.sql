-- ============================================================
-- SEMORA CANVAS CALENDAR FEED SYNC
-- Distinguish the policy-compliant calendar subscription fallback from legacy
-- personal-token connections and prepare the same rows for future Canvas OAuth.
-- ============================================================

alter table public.lms_connections
  add column if not exists connection_method text not null default 'legacy_token';

alter table public.lms_connections
  drop constraint if exists lms_connections_connection_method_check;

alter table public.lms_connections
  add constraint lms_connections_connection_method_check
  check (connection_method in ('legacy_token', 'calendar_feed', 'oauth'));

comment on column public.lms_connections.connection_method is
  'How Semora receives read access: a legacy testing token, Canvas Calendar Feed subscription, or provider OAuth.';

comment on table public.lms_connections is
  'SEMORA: LMS connection metadata. Secrets stay in device secure storage or, with explicit/background subscriptions, encrypted Supabase Vault storage.';

-- Canvas publishes a moving window (30 days back / 366 days forward). Only
-- mark a previously imported deadline missing when it remains safely inside
-- that documented window. The task row and the student's completion/grade
-- data are preserved; a future feed appearance clears lms_removed_at through
-- the normal idempotent assignment upsert.
create or replace function public.mark_canvas_calendar_feed_removed(
  p_user_id uuid,
  p_connection_id uuid,
  p_received_ids text[]
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  changed integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.lms_connections
    where id = p_connection_id
      and user_id = p_user_id
      and provider = 'canvas'
      and connection_method = 'calendar_feed'
  ) then
    raise exception 'Canvas calendar connection not found' using errcode = '42501';
  end if;

  update public.tasks
  set lms_removed_at = now(), lms_last_synced_at = now()
  where user_id = p_user_id
    and lms_connection_id = p_connection_id
    -- Stay five/six days inside Canvas's published boundaries so timezone and
    -- refresh-edge differences never produce a false removal.
    and due_date between current_date - 25 and current_date + 360
    and not (lms_external_id = any(coalesce(p_received_ids, array[]::text[])))
    and lms_removed_at is null;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.mark_canvas_calendar_feed_removed(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.mark_canvas_calendar_feed_removed(uuid, uuid, text[]) to service_role;

-- Calendar feeds are lightweight and are intended to remain subscribed. The
-- worker polls for due rows every 15 minutes; each healthy calendar connection
-- schedules its own next attempt one hour later, while API connections retain
-- their slower provider-friendly cadence in the worker.
select cron.unschedule('semora-lms-background-sync')
where exists (select 1 from cron.job where jobname = 'semora-lms-background-sync');

select cron.schedule(
  'semora-lms-background-sync',
  '2,17,32,47 * * * *',
  $job$
  select net.http_post(
    url := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/lms-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-semora-lms-cron-secret', (
        select decrypted_secret from vault.decrypted_secrets where name = 'semora_lms_cron_secret'
      )
    ),
    body := jsonb_build_object('action', 'background', 'limit', 20),
    timeout_milliseconds := 120000
  );
  $job$
);
