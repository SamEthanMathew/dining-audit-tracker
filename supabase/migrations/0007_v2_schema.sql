-- 0007_v2_schema.sql
-- v2: simple audit form, photos, per-location accounts, usernames, sustainability survey.

-- New enum -----------------------------------------------------------------
do $$ begin
  create type public.audit_form_mode as enum ('simple', 'detailed');
exception when duplicate_object then null; end $$;

-- locations ----------------------------------------------------------------
alter table public.locations
  add column if not exists contact_email text,
  add column if not exists account_username text;

create unique index if not exists uq_locations_account_username
  on public.locations(account_username) where account_username is not null;

-- users --------------------------------------------------------------------
alter table public.users add column if not exists username text;
create unique index if not exists uq_users_username
  on public.users(username) where username is not null;

-- audits: rename notes -> additional_description --------------------------
do $$ begin
  alter table public.audits rename column landfill_notes to landfill_additional_description;
exception when undefined_column then null; end $$;
do $$ begin
  alter table public.audits rename column bottles_cans_notes to bottles_cans_additional_description;
exception when undefined_column then null; end $$;
do $$ begin
  alter table public.audits rename column compost_notes to compost_additional_description;
exception when undefined_column then null; end $$;
do $$ begin
  alter table public.audits rename column cardboard_notes to cardboard_additional_description;
exception when undefined_column then null; end $$;

-- audits: new columns -----------------------------------------------------
alter table public.audits
  add column if not exists submitter_name text,
  add column if not exists is_sustainability_champion boolean not null default false,
  add column if not exists done_by_dining_team boolean not null default false,
  add column if not exists audit_form_mode public.audit_form_mode not null default 'detailed',
  add column if not exists simple_responses jsonb,
  add column if not exists landfill_contamination_pct numeric,
  add column if not exists landfill_total_dustbins integer,
  add column if not exists landfill_cleared_contamination boolean not null default false,
  add column if not exists bottles_cans_contamination_pct numeric,
  add column if not exists bottles_cans_total_dustbins integer,
  add column if not exists bottles_cans_cleared_contamination boolean not null default false,
  add column if not exists compost_contamination_pct numeric,
  add column if not exists compost_total_dustbins integer,
  add column if not exists compost_cleared_contamination boolean not null default false,
  add column if not exists cardboard_contamination_pct numeric,
  add column if not exists cardboard_total_dustbins integer,
  add column if not exists cardboard_cleared_contamination boolean not null default false,
  add column if not exists cardboard_to_baler boolean,
  add column if not exists reuse_program boolean,
  add column if not exists energy_conservation_plan boolean,
  add column if not exists water_conservation_plan boolean,
  add column if not exists donates_forinto boolean,
  add column if not exists donates_cmu_food_pantry boolean,
  add column if not exists sustainability_contact jsonb;

-- settings: new columns ---------------------------------------------------
alter table public.settings
  add column if not exists audit_form_mode_for_reps public.audit_form_mode not null default 'simple',
  add column if not exists dining_sustainability_email text,
  add column if not exists recommended_audit_windows jsonb not null
    default '["after_breakfast","after_lunch","after_dinner","mid_morning","mid_afternoon"]'::jsonb,
  add column if not exists bonus_for_cleared_contamination numeric not null default 5;

-- audit_photos table -----------------------------------------------------
create table if not exists public.audit_photos (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  stream public.waste_stream not null,
  storage_path text not null,
  uploaded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_photos_audit on public.audit_photos(audit_id, stream);

create or replace function app.enforce_photo_limit()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare cnt int;
begin
  select count(*) into cnt from public.audit_photos
   where audit_id = new.audit_id and stream = new.stream;
  if cnt >= 5 then
    raise exception 'Maximum 5 photos per stream per audit' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_photos_limit on public.audit_photos;
create trigger trg_audit_photos_limit
  before insert on public.audit_photos
  for each row execute function app.enforce_photo_limit();

alter table public.audit_photos enable row level security;

drop policy if exists audit_photos_select on public.audit_photos;
create policy audit_photos_select on public.audit_photos
  for select to authenticated using (
    app.is_admin()
    or exists (
      select 1 from public.audits a
       where a.id = audit_photos.audit_id
         and a.location_id = app.current_user_location_id()
    )
  );

drop policy if exists audit_photos_insert on public.audit_photos;
create policy audit_photos_insert on public.audit_photos
  for insert to authenticated with check (
    app.is_admin()
    or exists (
      select 1 from public.audits a
       where a.id = audit_photos.audit_id
         and a.submitted_by = auth.uid()
    )
  );

drop policy if exists audit_photos_admin_delete on public.audit_photos;
create policy audit_photos_admin_delete on public.audit_photos
  for delete to authenticated using (app.is_admin());

-- Storage bucket for audit photos ----------------------------------------
insert into storage.buckets (id, name, public)
values ('audit-photos', 'audit-photos', false)
on conflict (id) do nothing;

drop policy if exists "audit-photos authenticated read"   on storage.objects;
drop policy if exists "audit-photos authenticated insert" on storage.objects;
drop policy if exists "audit-photos admin delete"         on storage.objects;

create policy "audit-photos authenticated read" on storage.objects
  for select to authenticated using (bucket_id = 'audit-photos');

create policy "audit-photos authenticated insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'audit-photos');

create policy "audit-photos admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'audit-photos' and app.is_admin());
