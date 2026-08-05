-- ============================================================
-- SEMORA AUTOMATIC LMS SYNC
-- Encrypted server-side credentials, scheduled sync, run history,
-- recovery state, and editable course mappings.
-- ============================================================

alter table public.lms_connections
  add column if not exists background_sync_enabled boolean not null default false,
  add column if not exists background_sync_authorized_at timestamptz,
  add column if not exists background_sync_paused_at timestamptz,
  add column if not exists next_background_sync_at timestamptz,
  add column if not exists last_sync_attempt_at timestamptz,
  add column if not exists last_successful_sync_at timestamptz,
  add column if not exists consecutive_sync_failures integer not null default 0
    check (consecutive_sync_failures >= 0);

comment on column public.lms_connections.background_sync_enabled is
  'Explicit student opt-in for encrypted server-side credential storage and scheduled LMS sync.';

create index if not exists lms_connections_background_due_idx
  on public.lms_connections(next_background_sync_at)
  where background_sync_enabled = true;

-- This table contains Vault record ids only. The token values themselves are
-- encrypted by Supabase Vault and are never exposed through PostgREST/RLS.
create table public.lms_sync_credentials (
  connection_id uuid primary key references public.lms_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  access_secret_id uuid not null,
  refresh_secret_id uuid,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.lms_sync_credentials is
  'Vault secret references for a student-approved background LMS sync. No plaintext credential is stored in public tables.';

create index lms_sync_credentials_user_idx on public.lms_sync_credentials(user_id);
alter table public.lms_sync_credentials enable row level security;
-- Intentionally no user policy: only tightly-scoped SECURITY DEFINER functions
-- called by the edge worker can read or write these references.

create table public.lms_sync_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.lms_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  trigger text not null check (trigger in ('initial', 'manual', 'foreground_auto', 'background')),
  status text not null check (status in ('running', 'success', 'partial', 'error', 'credentials_required')),
  processed integer not null default 0 check (processed >= 0),
  skipped integer not null default 0 check (skipped >= 0),
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index lms_sync_runs_connection_idx
  on public.lms_sync_runs(connection_id, started_at desc);
create index lms_sync_runs_user_idx
  on public.lms_sync_runs(user_id, started_at desc);

alter table public.lms_sync_runs enable row level security;
create policy "own_lms_sync_runs" on public.lms_sync_runs
  for select to authenticated
  using (auth.uid() = user_id);

create trigger lms_sync_credentials_updated_at
  before update on public.lms_sync_credentials
  for each row execute function public.set_semora_connected_updated_at();

-- Vault records cannot be deleted by a foreign key. Clean them up in the same
-- transaction whenever a student disconnects an LMS connection.
create or replace function public.delete_lms_sync_vault_credentials()
returns trigger
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
begin
  if old.access_secret_id is not null then
    delete from vault.secrets where id = old.access_secret_id;
  end if;
  if old.refresh_secret_id is not null then
    delete from vault.secrets where id = old.refresh_secret_id;
  end if;
  return old;
end;
$$;

create trigger lms_sync_credentials_delete_vault
  before delete on public.lms_sync_credentials
  for each row execute function public.delete_lms_sync_vault_credentials();

-- One private scheduler secret is generated in Vault. It authorizes only the
-- database's pg_cron job to invoke the edge worker; it is never sent to apps.
do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'semora_lms_cron_secret'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'semora_lms_cron_secret',
      'Authorizes the Semora LMS background-sync pg_cron worker.'
    );
  end if;
end;
$$;

-- Service-only credential lifecycle. auth.role() is carried in the service
-- role JWT used by the edge function. No browser or mobile user can call these.
create or replace function public.store_lms_background_credential(
  p_connection_id uuid,
  p_access_token text,
  p_refresh_token text default null,
  p_expires_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  credential public.lms_sync_credentials%rowtype;
  connection_user uuid;
  next_access_secret uuid;
  next_refresh_secret uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_access_token, ''))) = 0 or length(p_access_token) > 8192 then
    raise exception 'Invalid LMS access token' using errcode = '22023';
  end if;

  select user_id into connection_user
  from public.lms_connections
  where id = p_connection_id
  for update;
  if connection_user is null then
    raise exception 'LMS connection not found' using errcode = 'P0002';
  end if;

  select * into credential
  from public.lms_sync_credentials
  where connection_id = p_connection_id
  for update;

  if found then
    perform vault.update_secret(credential.access_secret_id, p_access_token, null, null);
    next_access_secret := credential.access_secret_id;
    if nullif(btrim(coalesce(p_refresh_token, '')), '') is not null then
      if credential.refresh_secret_id is null then
        next_refresh_secret := vault.create_secret(p_refresh_token, null, 'Semora LMS refresh credential');
      else
        perform vault.update_secret(credential.refresh_secret_id, p_refresh_token, null, null);
        next_refresh_secret := credential.refresh_secret_id;
      end if;
    else
      next_refresh_secret := credential.refresh_secret_id;
    end if;

    update public.lms_sync_credentials
    set refresh_secret_id = next_refresh_secret,
        expires_at = p_expires_at
    where connection_id = p_connection_id;
  else
    next_access_secret := vault.create_secret(p_access_token, null, 'Semora LMS access credential');
    if nullif(btrim(coalesce(p_refresh_token, '')), '') is not null then
      next_refresh_secret := vault.create_secret(p_refresh_token, null, 'Semora LMS refresh credential');
    end if;
    insert into public.lms_sync_credentials (
      connection_id, user_id, access_secret_id, refresh_secret_id, expires_at
    ) values (
      p_connection_id, connection_user, next_access_secret, next_refresh_secret, p_expires_at
    );
  end if;

  update public.lms_connections
  set background_sync_enabled = true,
      background_sync_authorized_at = now(),
      background_sync_paused_at = null,
      next_background_sync_at = now(),
      consecutive_sync_failures = 0,
      last_error = null
  where id = p_connection_id;
end;
$$;

create or replace function public.read_lms_background_credential(p_connection_id uuid)
returns table(access_token text, refresh_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  return query
  select
    access_secret.decrypted_secret,
    refresh_secret.decrypted_secret,
    credential.expires_at
  from public.lms_sync_credentials credential
  join vault.decrypted_secrets access_secret on access_secret.id = credential.access_secret_id
  left join vault.decrypted_secrets refresh_secret on refresh_secret.id = credential.refresh_secret_id
  where credential.connection_id = p_connection_id;
end;
$$;

create or replace function public.disable_lms_background_sync(p_connection_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare connection_user uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select user_id into connection_user from public.lms_connections where id = p_connection_id;
  if connection_user is null then
    raise exception 'LMS connection not found' using errcode = 'P0002';
  end if;
  delete from public.lms_sync_credentials where connection_id = p_connection_id;
  update public.lms_connections
  set background_sync_enabled = false,
      background_sync_paused_at = now(),
      next_background_sync_at = null,
      consecutive_sync_failures = 0
  where id = p_connection_id;
end;
$$;

create or replace function public.read_lms_cron_secret()
returns text
language plpgsql
security definer
set search_path = vault, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  return (
    select decrypted_secret
    from vault.decrypted_secrets
    where name = 'semora_lms_cron_secret'
  );
end;
$$;

revoke all on function public.store_lms_background_credential(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.read_lms_background_credential(uuid) from public, anon, authenticated;
revoke all on function public.disable_lms_background_sync(uuid) from public, anon, authenticated;
revoke all on function public.read_lms_cron_secret() from public, anon, authenticated;
grant execute on function public.store_lms_background_credential(uuid, text, text, timestamptz) to service_role;
grant execute on function public.read_lms_background_credential(uuid) to service_role;
grant execute on function public.disable_lms_background_sync(uuid) to service_role;
grant execute on function public.read_lms_cron_secret() to service_role;

-- Server-side equivalent of the existing user-scoped apply function. It is
-- purposely service-role-only so scheduled sync cannot cross tenant boundaries.
create or replace function public.apply_lms_assignment_sync_service(
  p_user_id uuid,
  p_connection_id uuid,
  p_items jsonb,
  p_external_course_ids text[] default array[]::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  connection_user uuid;
  item jsonb;
  local_course uuid;
  external_course text;
  external_assignment text;
  due_on date;
  due_clock time;
  task_kind public.task_type;
  item_completed boolean;
  item_completed_at timestamptz;
  item_submitted_late boolean;
  processed int := 0;
  skipped int := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select user_id into connection_user
  from public.lms_connections
  where id = p_connection_id;
  if connection_user is null or connection_user <> p_user_id then
    raise exception 'LMS connection not found' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'LMS items must be an array' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    begin
      local_course := nullif(item ->> 'local_course_id', '')::uuid;
      external_course := nullif(item ->> 'external_course_id', '');
      external_assignment := nullif(item ->> 'external_id', '');
      due_on := nullif(item ->> 'due_date', '')::date;
      due_clock := nullif(item ->> 'due_time', '')::time;
      item_completed := coalesce(nullif(item ->> 'is_completed', '')::boolean, false);
      item_completed_at := nullif(item ->> 'completed_at', '')::timestamptz;
      item_submitted_late := coalesce(nullif(item ->> 'submitted_late', '')::boolean, false);
    exception when others then
      skipped := skipped + 1;
      continue;
    end;

    if local_course is null or external_course is null or external_assignment is null
       or due_on is null or nullif(btrim(item ->> 'title'), '') is null
       or not exists (
         select 1 from public.lms_course_links link
         join public.courses course on course.id = link.local_course_id
         where link.connection_id = p_connection_id
           and link.external_course_id = external_course
           and link.local_course_id = local_course
           and link.user_id = p_user_id
           and course.user_id = p_user_id
           and link.sync_enabled
       ) then
      skipped := skipped + 1;
      continue;
    end if;

    task_kind := case lower(coalesce(item ->> 'type', 'assignment'))
      when 'quiz' then 'quiz'::public.task_type
      when 'exam' then 'exam'::public.task_type
      when 'project' then 'project'::public.task_type
      when 'reading' then 'reading'::public.task_type
      when 'other' then 'other'::public.task_type
      else 'assignment'::public.task_type
    end;

    insert into public.tasks (
      user_id, course_id, title, description, type, due_date, due_time,
      points_possible, score, points_earned, is_completed, completed_at,
      submitted_late, source, lms_connection_id, lms_external_course_id,
      lms_external_id, lms_external_updated_at, lms_url,
      lms_last_synced_at, lms_removed_at
    ) values (
      p_user_id, local_course, btrim(item ->> 'title'), nullif(item ->> 'description', ''),
      task_kind, due_on, due_clock,
      nullif(item ->> 'points_possible', '')::numeric,
      nullif(item ->> 'score', '')::numeric,
      nullif(item ->> 'points_earned', '')::numeric,
      item_completed,
      case when item_completed then item_completed_at else null end,
      item_submitted_late,
      'manual'::public.source_type, p_connection_id, external_course,
      external_assignment, nullif(item ->> 'external_updated_at', '')::timestamptz,
      nullif(item ->> 'url', ''), now(), null
    )
    on conflict on constraint tasks_lms_external_unique do update set
      course_id = excluded.course_id,
      title = excluded.title,
      description = excluded.description,
      type = excluded.type,
      due_date = excluded.due_date,
      due_time = excluded.due_time,
      points_possible = coalesce(excluded.points_possible, public.tasks.points_possible),
      score = coalesce(excluded.score, public.tasks.score),
      points_earned = coalesce(excluded.points_earned, public.tasks.points_earned),
      is_completed = public.tasks.is_completed or excluded.is_completed,
      completed_at = case
        when public.tasks.is_completed then public.tasks.completed_at
        when excluded.is_completed then coalesce(excluded.completed_at, public.tasks.completed_at)
        else public.tasks.completed_at
      end,
      submitted_late = public.tasks.submitted_late or excluded.submitted_late,
      lms_external_updated_at = excluded.lms_external_updated_at,
      lms_url = excluded.lms_url,
      lms_last_synced_at = now(),
      lms_removed_at = null;
    processed := processed + 1;
  end loop;

  if coalesce(array_length(p_external_course_ids, 1), 0) > 0 then
    update public.tasks task
    set lms_removed_at = now(), lms_last_synced_at = now()
    where task.user_id = p_user_id
      and task.lms_connection_id = p_connection_id
      and task.lms_external_course_id = any(p_external_course_ids)
      and not exists (
        select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) received
        where received ->> 'external_course_id' = task.lms_external_course_id
          and received ->> 'external_id' = task.lms_external_id
      );
  end if;

  update public.lms_connections
  set last_synced_at = now(),
      last_successful_sync_at = now(),
      last_sync_status = case when skipped > 0 then 'partial' else 'success' end,
      last_error = case when skipped > 0 then skipped || ' items skipped because they had no usable due date or course mapping' else null end,
      consecutive_sync_failures = 0
  where id = p_connection_id and user_id = p_user_id;

  update public.lms_course_links
  set last_synced_at = now()
  where connection_id = p_connection_id and user_id = p_user_id and sync_enabled;

  return jsonb_build_object('processed', processed, 'skipped', skipped);
end;
$$;

revoke all on function public.apply_lms_assignment_sync_service(uuid, uuid, jsonb, text[]) from public, anon, authenticated;
grant execute on function public.apply_lms_assignment_sync_service(uuid, uuid, jsonb, text[]) to service_role;

-- The user-facing mapper only permits changing a link to another course they
-- own. It keeps imported work attached to the selected Semora course on future
-- background syncs.
create or replace function public.set_lms_course_mapping(
  p_link_id uuid,
  p_local_course_id uuid,
  p_sync_enabled boolean default true
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.courses where id = p_local_course_id and user_id = auth.uid()) then
    raise exception 'Course not found' using errcode = '42501';
  end if;
  update public.lms_course_links
  set local_course_id = p_local_course_id,
      sync_enabled = p_sync_enabled
  where id = p_link_id and user_id = auth.uid();
  if not found then
    raise exception 'LMS course mapping not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_lms_course_mapping(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_lms_course_mapping(uuid, uuid, boolean) to authenticated;

-- Four-hour cadence is deliberately modest. Each worker only processes due
-- connections in a bounded batch; transient provider errors use backoff in the
-- edge function rather than repeatedly calling a school's API.
select cron.unschedule('semora-lms-background-sync')
where exists (select 1 from cron.job where jobname = 'semora-lms-background-sync');

select cron.schedule(
  'semora-lms-background-sync',
  '17 */4 * * *',
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
