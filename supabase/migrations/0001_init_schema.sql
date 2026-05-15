-- 0001_init_schema.sql
-- Extensions, enums, tables, indexes, updated_at trigger.

create extension if not exists "pgcrypto" with schema "extensions";

create schema if not exists app;

-- Enums ---------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('rep', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.audit_mode as enum ('count', 'weight');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.waste_stream as enum ('landfill', 'bottles_cans', 'compost', 'cardboard');
exception when duplicate_object then null; end $$;

-- updated_at trigger function ---------------------------------------------
create or replace function app.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- IMMUTABLE week-start helper (Monday-based, ISO week)
create or replace function app.week_start(d date)
returns date
language sql
immutable
as $$
  select (d - ((extract(isodow from d))::integer - 1))::date;
$$;

-- locations ----------------------------------------------------------------
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- users (extends auth.users) ----------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text unique not null,
  role public.user_role not null,
  location_id uuid references public.locations(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint users_rep_must_have_location
    check ((role = 'rep' and location_id is not null) or (role = 'admin'))
);

create index if not exists idx_users_location on public.users(location_id);
create index if not exists idx_users_role on public.users(role);

-- access_logs --------------------------------------------------------------
create table if not exists public.access_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  action text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_access_logs_user on public.access_logs(user_id, created_at desc);
create index if not exists idx_access_logs_action on public.access_logs(action, created_at desc);

-- audits -------------------------------------------------------------------
create table if not exists public.audits (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete restrict,
  submitted_by uuid not null references public.users(id) on delete restrict,
  submitted_by_role public.user_role not null,
  audit_mode public.audit_mode not null,
  audit_date date not null,
  audit_week date generated always as (app.week_start(audit_date)) stored,

  landfill_total       numeric not null check (landfill_total >= 0),
  landfill_contamination numeric not null check (landfill_contamination >= 0),
  landfill_notes text,

  bottles_cans_total       numeric not null check (bottles_cans_total >= 0),
  bottles_cans_contamination numeric not null check (bottles_cans_contamination >= 0),
  bottles_cans_food_present boolean not null default false,
  bottles_cans_notes text,

  compost_total       numeric not null check (compost_total >= 0),
  compost_contamination numeric not null check (compost_contamination >= 0),
  compost_notes text,

  cardboard_total       numeric not null check (cardboard_total >= 0),
  cardboard_contamination numeric not null check (cardboard_contamination >= 0),
  cardboard_notes text,

  general_comments text,

  computed_score numeric,
  computed_grades jsonb,

  nullified boolean not null default false,
  nullified_reason text,
  nullified_by uuid references public.users(id) on delete set null,
  nullified_at timestamptz,

  created_at timestamptz not null default now(),

  constraint audits_contam_le_total_landfill
    check (landfill_contamination <= landfill_total),
  constraint audits_contam_le_total_bottles
    check (bottles_cans_contamination <= bottles_cans_total),
  constraint audits_contam_le_total_compost
    check (compost_contamination <= compost_total),
  constraint audits_contam_le_total_cardboard
    check (cardboard_contamination <= cardboard_total)
);

create index if not exists idx_audits_location_date on public.audits(location_id, audit_date desc);
create index if not exists idx_audits_submitted_by on public.audits(submitted_by, audit_date desc);
create index if not exists idx_audits_week on public.audits(audit_week);

-- One rep audit per location per week (active = non-nullified)
create unique index if not exists uq_audits_one_rep_per_week
  on public.audits(location_id, audit_week)
  where submitted_by_role = 'rep' and nullified = false;

-- recommendations ----------------------------------------------------------
create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  stream public.waste_stream not null,
  failure_mode text not null,
  threshold_min numeric,
  threshold_max numeric,
  recommendation_text text not null,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);
create index if not exists idx_recs_stream_mode on public.recommendations(stream, failure_mode, active);

drop trigger if exists trg_recs_updated_at on public.recommendations;
create trigger trg_recs_updated_at
  before update on public.recommendations
  for each row execute function app.set_updated_at();

-- settings (single row) ----------------------------------------------------
create table if not exists public.settings (
  id uuid primary key,
  audit_mode public.audit_mode not null default 'count',
  rep_audit_weight numeric not null default 0.10,
  admin_audit_weight numeric not null default 0.90,
  decay_half_life_days numeric not null default 60,
  decay_floor_days numeric not null default 180,
  landfill_opportunity_threshold_a numeric not null default 10,
  bottles_cans_threshold_a numeric not null default 10,
  compost_threshold_a numeric not null default 5,
  cardboard_strict boolean not null default true,
  tier_thresholds jsonb not null default '{"platinum":90,"gold":75,"silver":60}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null,
  -- enforce a single row by fixing the id
  constraint settings_singleton check (id = '00000000-0000-0000-0000-000000000001')
);

drop trigger if exists trg_settings_updated_at on public.settings;
create trigger trg_settings_updated_at
  before update on public.settings
  for each row execute function app.set_updated_at();

-- settings_audit_log -------------------------------------------------------
create table if not exists public.settings_audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid,
  before jsonb,
  after jsonb,
  changed_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_sal_table_time on public.settings_audit_log(table_name, created_at desc);
