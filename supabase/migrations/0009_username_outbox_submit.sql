-- 0009_username_outbox_submit.sql
-- Username resolver, email outbox, recommended-window RPC,
-- and a rewritten submit_audit that supports both audit_form_modes + photos.

-- resolve_username --------------------------------------------------------
-- Public (anon allowed) RPC that maps a username to the associated email,
-- so login can accept either. Returns null on miss (no enumeration leak
-- beyond a binary signal).
create or replace function public.resolve_username(p_username text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select email from public.users
   where username = p_username and active = true
   limit 1;
$$;

grant execute on function public.resolve_username(text) to anon, authenticated;

-- email_outbox ------------------------------------------------------------
do $$ begin
  create type public.email_status as enum ('pending', 'sent', 'failed');
exception when duplicate_object then null; end $$;

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid references public.audits(id) on delete set null,
  to_emails text[] not null,
  cc_emails text[],
  subject text not null,
  html text not null,
  status public.email_status not null default 'pending',
  attempts int not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_email_outbox_status on public.email_outbox(status, created_at);

alter table public.email_outbox enable row level security;
drop policy if exists email_outbox_admin_read on public.email_outbox;
create policy email_outbox_admin_read on public.email_outbox
  for select to authenticated using (app.is_admin());
-- inserts/updates: SECURITY DEFINER RPCs and edge function only.

-- recommended_audit_window ----------------------------------------------
-- Given the last 5 audits for the location, return the configured window
-- that has been used least often. Pure SQL, deterministic.
create or replace function public.recommended_audit_window(loc uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  windows jsonb;
  pick text;
begin
  select recommended_audit_windows into windows from public.settings limit 1;
  if windows is null or jsonb_array_length(windows) = 0 then
    return 'after_lunch';
  end if;

  with cfg as (
    select jsonb_array_elements_text(windows) as w
  ),
  recent as (
    select case
             when extract(hour from a.created_at) between 6  and 10 then 'after_breakfast'
             when extract(hour from a.created_at) between 11 and 14 then 'after_lunch'
             when extract(hour from a.created_at) between 15 and 17 then 'mid_afternoon'
             when extract(hour from a.created_at) between 18 and 21 then 'after_dinner'
             else 'mid_morning'
           end as w,
           a.created_at
      from public.audits a
     where a.location_id = loc and a.nullified = false
     order by a.created_at desc
     limit 5
  ),
  counts as (
    select c.w, coalesce(count(r.w), 0) as n
      from cfg c left join recent r on r.w = c.w
     group by c.w
  )
  select w into pick from counts order by n asc, w asc limit 1;

  return coalesce(pick, 'after_lunch');
end;
$$;

grant execute on function public.recommended_audit_window(uuid) to authenticated;

-- submit_audit rewrite ----------------------------------------------------
-- Accepts both detailed and simple payloads. Branches based on
-- payload.audit_form_mode (defaults to settings.audit_form_mode_for_reps
-- for reps, 'detailed' for admins to keep prior behavior).
create or replace function public.submit_audit(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller public.users;
  loc_id uuid;
  mode public.audit_form_mode;
  s_row public.settings;
  audit_row public.audits;
  recs jsonb;
  grades jsonb;
  photo jsonb;
begin
  select * into caller from public.users where id = auth.uid();
  if caller is null or not caller.active then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  loc_id := coalesce((payload->>'location_id')::uuid, caller.location_id);

  if caller.role = 'rep' then
    if loc_id is null or loc_id <> caller.location_id then
      raise exception 'reps can only submit for their own location' using errcode = '42501';
    end if;
  else
    if loc_id is null then
      raise exception 'location_id required for admin submission' using errcode = '22023';
    end if;
  end if;

  select * into s_row from public.settings limit 1;
  if s_row is null then
    raise exception 'settings row missing' using errcode = 'P0001';
  end if;

  mode := coalesce(
    (payload->>'audit_form_mode')::public.audit_form_mode,
    case when caller.role = 'rep' then s_row.audit_form_mode_for_reps else 'detailed'::public.audit_form_mode end
  );

  -- submitter_name required for all modes; default to user's name for reps
  -- if not supplied. Trimmed.
  if coalesce(trim(payload->>'submitter_name'), '') = '' then
    if coalesce(trim(caller.full_name), '') = '' then
      raise exception 'submitter_name required' using errcode = '22023';
    end if;
  end if;

  begin
    insert into public.audits (
      location_id, submitted_by, submitted_by_role, audit_mode, audit_date,
      audit_form_mode,
      submitter_name, is_sustainability_champion, done_by_dining_team,
      -- detailed-mode raw data (default to 0 if missing)
      landfill_total, landfill_contamination,
      bottles_cans_total, bottles_cans_contamination, bottles_cans_food_present,
      compost_total, compost_contamination,
      cardboard_total, cardboard_contamination,
      -- simple-mode fields
      simple_responses,
      landfill_contamination_pct, landfill_total_dustbins, landfill_cleared_contamination,
      bottles_cans_contamination_pct, bottles_cans_total_dustbins, bottles_cans_cleared_contamination,
      compost_contamination_pct, compost_total_dustbins, compost_cleared_contamination,
      cardboard_contamination_pct, cardboard_total_dustbins, cardboard_cleared_contamination,
      cardboard_to_baler,
      -- shared text fields
      landfill_additional_description, bottles_cans_additional_description,
      compost_additional_description, cardboard_additional_description,
      general_comments,
      -- sustainability survey (non-scored)
      reuse_program, energy_conservation_plan, water_conservation_plan,
      donates_forinto, donates_cmu_food_pantry, sustainability_contact
    ) values (
      loc_id, auth.uid(), caller.role,
      coalesce((payload->>'audit_mode')::public.audit_mode, s_row.audit_mode),
      coalesce((payload->>'audit_date')::date, current_date),
      mode,
      coalesce(nullif(trim(payload->>'submitter_name'), ''), caller.full_name),
      coalesce((payload->>'is_sustainability_champion')::boolean, false),
      coalesce((payload->>'done_by_dining_team')::boolean, false),
      coalesce((payload->>'landfill_total')::numeric, 0),
      coalesce((payload->>'landfill_contamination')::numeric, 0),
      coalesce((payload->>'bottles_cans_total')::numeric, 0),
      coalesce((payload->>'bottles_cans_contamination')::numeric, 0),
      coalesce((payload->>'bottles_cans_food_present')::boolean, false),
      coalesce((payload->>'compost_total')::numeric, 0),
      coalesce((payload->>'compost_contamination')::numeric, 0),
      coalesce((payload->>'cardboard_total')::numeric, 0),
      coalesce((payload->>'cardboard_contamination')::numeric, 0),
      payload->'simple_responses',
      nullif(payload->>'landfill_contamination_pct', '')::numeric,
      nullif(payload->>'landfill_total_dustbins', '')::int,
      coalesce((payload->>'landfill_cleared_contamination')::boolean, false),
      nullif(payload->>'bottles_cans_contamination_pct', '')::numeric,
      nullif(payload->>'bottles_cans_total_dustbins', '')::int,
      coalesce((payload->>'bottles_cans_cleared_contamination')::boolean, false),
      nullif(payload->>'compost_contamination_pct', '')::numeric,
      nullif(payload->>'compost_total_dustbins', '')::int,
      coalesce((payload->>'compost_cleared_contamination')::boolean, false),
      nullif(payload->>'cardboard_contamination_pct', '')::numeric,
      nullif(payload->>'cardboard_total_dustbins', '')::int,
      coalesce((payload->>'cardboard_cleared_contamination')::boolean, false),
      nullif(payload->>'cardboard_to_baler', '')::boolean,
      nullif(payload->>'landfill_additional_description', ''),
      nullif(payload->>'bottles_cans_additional_description', ''),
      nullif(payload->>'compost_additional_description', ''),
      nullif(payload->>'cardboard_additional_description', ''),
      nullif(payload->>'general_comments', ''),
      nullif(payload->>'reuse_program', '')::boolean,
      nullif(payload->>'energy_conservation_plan', '')::boolean,
      nullif(payload->>'water_conservation_plan', '')::boolean,
      nullif(payload->>'donates_forinto', '')::boolean,
      nullif(payload->>'donates_cmu_food_pantry', '')::boolean,
      payload->'sustainability_contact'
    )
    returning * into audit_row;
  exception
    when unique_violation then
      raise exception 'already_submitted_this_week' using errcode = 'P0001';
  end;

  grades := audit_row.computed_grades;

  -- Attach photos (uploaded to Storage before this RPC)
  if jsonb_typeof(payload->'photos') = 'array' then
    for photo in select * from jsonb_array_elements(payload->'photos') loop
      insert into public.audit_photos(audit_id, stream, storage_path, uploaded_by)
      values (
        audit_row.id,
        (photo->>'stream')::public.waste_stream,
        photo->>'storage_path',
        auth.uid()
      );
    end loop;
  end if;

  -- Match active recommendations to surface to the rep
  with matched as (
    select r.* from public.recommendations r
     where r.active and r.stream = 'landfill' and r.failure_mode = 'high_opportunity'
       and (grades->>'landfill') <> 'A'
    union all
    select r.* from public.recommendations r
     where r.active and r.stream = 'bottles_cans' and r.failure_mode = 'food_present'
       and (audit_row.bottles_cans_food_present
            or coalesce((audit_row.simple_responses -> 'bottles_cans' ->> 'sees_food')::bool, false))
    union all
    select r.* from public.recommendations r
     where r.active and r.stream = 'bottles_cans' and r.failure_mode = 'high_contamination'
       and (grades->>'bottles_cans') <> 'A'
       and not (audit_row.bottles_cans_food_present
                or coalesce((audit_row.simple_responses -> 'bottles_cans' ->> 'sees_food')::bool, false))
    union all
    select r.* from public.recommendations r
     where r.active and r.stream = 'compost' and r.failure_mode = 'above_threshold'
       and (grades->>'compost') <> 'A'
    union all
    select r.* from public.recommendations r
     where r.active and r.stream = 'cardboard' and r.failure_mode = 'not_pure'
       and (grades->>'cardboard') <> 'A'
  )
  select coalesce(jsonb_agg(to_jsonb(m) order by m.stream), '[]'::jsonb)
    into recs from matched m;

  -- Enqueue email notification
  insert into public.email_outbox (audit_id, to_emails, cc_emails, subject, html)
  select
    audit_row.id,
    -- to: location contact_email (if set)
    array_remove(array[ l.contact_email ], null),
    -- cc: dining sustainability + caller's own email
    array_remove(array[ s_row.dining_sustainability_email, caller.email ], null),
    format('[Dining Audit] %s — %s', l.name, audit_row.audit_date),
    ''  -- HTML body rendered by the edge function from audit data
  from public.locations l where l.id = loc_id;

  insert into public.access_logs(user_id, action, metadata)
    values (auth.uid(), 'submit_audit',
            jsonb_build_object('audit_id', audit_row.id, 'mode', mode, 'score', audit_row.computed_score));

  return jsonb_build_object(
    'audit',           to_jsonb(audit_row),
    'recommendations', recs
  );
end;
$$;

grant execute on function public.submit_audit(jsonb) to authenticated;
revoke execute on function public.submit_audit(jsonb) from anon;

-- Update update_settings to handle the new columns ----------------------
create or replace function public.update_settings(payload jsonb)
returns public.settings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  before_row public.settings;
  after_row public.settings;
begin
  if not app.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  select * into before_row from public.settings limit 1;
  if before_row is null then
    raise exception 'settings row missing' using errcode = 'P0001';
  end if;

  update public.settings
     set audit_mode = coalesce((payload->>'audit_mode')::public.audit_mode, audit_mode),
         rep_audit_weight = coalesce((payload->>'rep_audit_weight')::numeric, rep_audit_weight),
         admin_audit_weight = coalesce((payload->>'admin_audit_weight')::numeric, admin_audit_weight),
         decay_half_life_days = coalesce((payload->>'decay_half_life_days')::numeric, decay_half_life_days),
         decay_floor_days = coalesce((payload->>'decay_floor_days')::numeric, decay_floor_days),
         landfill_opportunity_threshold_a = coalesce((payload->>'landfill_opportunity_threshold_a')::numeric, landfill_opportunity_threshold_a),
         bottles_cans_threshold_a = coalesce((payload->>'bottles_cans_threshold_a')::numeric, bottles_cans_threshold_a),
         compost_threshold_a = coalesce((payload->>'compost_threshold_a')::numeric, compost_threshold_a),
         cardboard_strict = coalesce((payload->>'cardboard_strict')::boolean, cardboard_strict),
         tier_thresholds = coalesce(payload->'tier_thresholds', tier_thresholds),
         audit_form_mode_for_reps = coalesce((payload->>'audit_form_mode_for_reps')::public.audit_form_mode, audit_form_mode_for_reps),
         dining_sustainability_email = coalesce(payload->>'dining_sustainability_email', dining_sustainability_email),
         recommended_audit_windows = coalesce(payload->'recommended_audit_windows', recommended_audit_windows),
         bonus_for_cleared_contamination = coalesce((payload->>'bonus_for_cleared_contamination')::numeric, bonus_for_cleared_contamination),
         updated_by = auth.uid()
   where id = before_row.id
  returning * into after_row;

  insert into public.settings_audit_log(table_name, record_id, before, after, changed_by)
    values ('settings', after_row.id, to_jsonb(before_row), to_jsonb(after_row), auth.uid());
  insert into public.access_logs(user_id, action, metadata)
    values (auth.uid(), 'update_settings', jsonb_build_object('payload', payload));
  return after_row;
end;
$$;

grant execute on function public.update_settings(jsonb) to authenticated;
revoke execute on function public.update_settings(jsonb) from anon;

-- Admin: update a location's contact_email + account_username ----------
create or replace function public.update_location(payload jsonb)
returns public.locations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  loc_id uuid := (payload->>'id')::uuid;
  before_row public.locations;
  after_row public.locations;
begin
  if not app.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if loc_id is null then
    raise exception 'id required' using errcode = '22023';
  end if;
  select * into before_row from public.locations where id = loc_id;
  if before_row is null then
    raise exception 'location not found' using errcode = '02000';
  end if;

  update public.locations
     set name = coalesce(payload->>'name', name),
         active = coalesce((payload->>'active')::boolean, active),
         contact_email = case when payload ? 'contact_email'
                              then nullif(payload->>'contact_email', '')
                              else contact_email end,
         account_username = case when payload ? 'account_username'
                                 then nullif(payload->>'account_username', '')
                                 else account_username end
   where id = loc_id
  returning * into after_row;

  insert into public.settings_audit_log(table_name, record_id, before, after, changed_by)
    values ('locations', loc_id, to_jsonb(before_row), to_jsonb(after_row), auth.uid());
  insert into public.access_logs(user_id, action, metadata)
    values (auth.uid(), 'update_location', jsonb_build_object('location_id', loc_id));
  return after_row;
end;
$$;

grant execute on function public.update_location(jsonb) to authenticated;
revoke execute on function public.update_location(jsonb) from anon;
