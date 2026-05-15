-- 0002_rls_policies.sql
-- Helper functions in app schema (SECURITY DEFINER) + RLS policies per table.

-- Helpers ------------------------------------------------------------------
create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select role = 'admin' and active
       from public.users
      where id = auth.uid()),
    false
  );
$$;

create or replace function app.current_user_location_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select location_id from public.users where id = auth.uid();
$$;

grant execute on function app.is_admin() to authenticated, anon;
grant execute on function app.current_user_location_id() to authenticated;

-- Enable RLS ---------------------------------------------------------------
alter table public.locations          enable row level security;
alter table public.users              enable row level security;
alter table public.audits             enable row level security;
alter table public.access_logs        enable row level security;
alter table public.recommendations    enable row level security;
alter table public.settings           enable row level security;
alter table public.settings_audit_log enable row level security;

-- locations: authenticated read, admin write -------------------------------
drop policy if exists locations_read on public.locations;
create policy locations_read on public.locations
  for select to authenticated using (true);

drop policy if exists locations_admin_all on public.locations;
create policy locations_admin_all on public.locations
  for all to authenticated
  using (app.is_admin())
  with check (app.is_admin());

-- users: self-read; admin all ---------------------------------------------
drop policy if exists users_self_read on public.users;
create policy users_self_read on public.users
  for select to authenticated using (id = auth.uid());

drop policy if exists users_admin_read on public.users;
create policy users_admin_read on public.users
  for select to authenticated using (app.is_admin());

drop policy if exists users_admin_write on public.users;
create policy users_admin_write on public.users
  for all to authenticated
  using (app.is_admin())
  with check (app.is_admin());

-- audits: rep sees + inserts for own location only; admin all -------------
drop policy if exists audits_rep_read on public.audits;
create policy audits_rep_read on public.audits
  for select to authenticated
  using (
    app.is_admin()
    or location_id = app.current_user_location_id()
  );

drop policy if exists audits_rep_insert on public.audits;
create policy audits_rep_insert on public.audits
  for insert to authenticated
  with check (
    app.is_admin()
    or (
      location_id = app.current_user_location_id()
      and submitted_by_role = 'rep'
      and submitted_by = auth.uid()
    )
  );

drop policy if exists audits_admin_update on public.audits;
create policy audits_admin_update on public.audits
  for update to authenticated
  using (app.is_admin())
  with check (app.is_admin());

drop policy if exists audits_admin_delete on public.audits;
create policy audits_admin_delete on public.audits
  for delete to authenticated
  using (app.is_admin());

-- recommendations: authenticated read; admin write ------------------------
drop policy if exists recs_read on public.recommendations;
create policy recs_read on public.recommendations
  for select to authenticated using (true);

drop policy if exists recs_admin_write on public.recommendations;
create policy recs_admin_write on public.recommendations
  for all to authenticated
  using (app.is_admin())
  with check (app.is_admin());

-- settings: authenticated read; admin write -------------------------------
drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings
  for select to authenticated using (true);

drop policy if exists settings_admin_write on public.settings;
create policy settings_admin_write on public.settings
  for all to authenticated
  using (app.is_admin())
  with check (app.is_admin());

-- access_logs / settings_audit_log: admin read; no client inserts ---------
drop policy if exists access_logs_admin_read on public.access_logs;
create policy access_logs_admin_read on public.access_logs
  for select to authenticated using (app.is_admin());

drop policy if exists sal_admin_read on public.settings_audit_log;
create policy sal_admin_read on public.settings_audit_log
  for select to authenticated using (app.is_admin());
-- (no insert/update/delete policies — writes only via SECURITY DEFINER RPCs)
