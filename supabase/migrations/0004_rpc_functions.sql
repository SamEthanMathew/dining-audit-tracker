-- 0004_rpc_functions.sql
-- Client-callable RPCs (all SECURITY DEFINER).

-- submit_audit -------------------------------------------------------------
create or replace function public.submit_audit(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller public.users;
  loc_id uuid;
  audit_row public.audits;
  recs jsonb;
  grades jsonb;
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

  begin
    insert into public.audits (
      location_id, submitted_by, submitted_by_role, audit_mode, audit_date,
      landfill_total, landfill_contamination, landfill_notes,
      bottles_cans_total, bottles_cans_contamination, bottles_cans_food_present, bottles_cans_notes,
      compost_total, compost_contamination, compost_notes,
      cardboard_total, cardboard_contamination, cardboard_notes,
      general_comments
    ) values (
      loc_id,
      auth.uid(),
      caller.role,
      coalesce((payload->>'audit_mode')::public.audit_mode,
               (select audit_mode from public.settings limit 1)),
      coalesce((payload->>'audit_date')::date, current_date),
      (payload->>'landfill_total')::numeric,
      (payload->>'landfill_contamination')::numeric,
      nullif(payload->>'landfill_notes', ''),
      (payload->>'bottles_cans_total')::numeric,
      (payload->>'bottles_cans_contamination')::numeric,
      coalesce((payload->>'bottles_cans_food_present')::boolean, false),
      nullif(payload->>'bottles_cans_notes', ''),
      (payload->>'compost_total')::numeric,
      (payload->>'compost_contamination')::numeric,
      nullif(payload->>'compost_notes', ''),
      (payload->>'cardboard_total')::numeric,
      (payload->>'cardboard_contamination')::numeric,
      nullif(payload->>'cardboard_notes', ''),
      nullif(payload->>'general_comments', '')
    )
    returning * into audit_row;
  exception
    when unique_violation then
      raise exception 'already_submitted_this_week' using errcode = 'P0001';
  end;

  grades := audit_row.computed_grades;

  with matched as (
    select r.*
      from public.recommendations r
     where r.active and r.stream = 'landfill' and r.failure_mode = 'high_opportunity'
       and (grades->>'landfill') <> 'A'
    union all
    select r.*
      from public.recommendations r
     where r.active and r.stream = 'bottles_cans' and r.failure_mode = 'food_present'
       and audit_row.bottles_cans_food_present = true
    union all
    select r.*
      from public.recommendations r
     where r.active and r.stream = 'bottles_cans' and r.failure_mode = 'high_contamination'
       and audit_row.bottles_cans_food_present = false
       and (grades->>'bottles_cans') <> 'A'
    union all
    select r.*
      from public.recommendations r
     where r.active and r.stream = 'compost' and r.failure_mode = 'above_threshold'
       and (grades->>'compost') <> 'A'
    union all
    select r.*
      from public.recommendations r
     where r.active and r.stream = 'cardboard' and r.failure_mode = 'not_pure'
       and (grades->>'cardboard') <> 'A'
  )
  select coalesce(jsonb_agg(to_jsonb(m) order by m.stream), '[]'::jsonb)
    into recs from matched m;

  insert into public.access_logs(user_id, action, metadata)
    values (auth.uid(), 'submit_audit', jsonb_build_object(
      'audit_id', audit_row.id,
      'location_id', loc_id,
      'role', caller.role,
      'score', audit_row.computed_score
    ));

  return jsonb_build_object(
    'audit',           to_jsonb(audit_row),
    'recommendations', recs
  );
end;
$$;

grant execute on function public.submit_audit(jsonb) to authenticated;

-- nullify_audit ------------------------------------------------------------
create or replace function public.nullify_audit(audit_id uuid, reason text)
returns public.audits
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  before_row public.audits;
  after_row public.audits;
begin
  if not app.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if coalesce(trim(reason), '') = '' then
    raise exception 'nullification reason required' using errcode = '22023';
  end if;

  select * into before_row from public.audits where id = audit_id;
  if before_row is null then
    raise exception 'audit not found' using errcode = '02000';
  end if;

  update public.audits
     set nullified = true,
         nullified_reason = reason,
         nullified_by = auth.uid(),
         nullified_at = now()
   where id = audit_id
  returning * into after_row;

  insert into public.settings_audit_log(table_name, record_id, before, after, changed_by)
    values ('audits', audit_id, to_jsonb(before_row), to_jsonb(after_row), auth.uid());
  insert into public.access_logs(user_id, action, metadata)
    values (auth.uid(), 'nullify_audit',
            jsonb_build_object('audit_id', audit_id, 'reason', reason));

  return after_row;
end;
$$;

grant execute on function public.nullify_audit(uuid, text) to authenticated;

-- update_settings ----------------------------------------------------------
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

-- upsert_recommendation ---------------------------------------------------
create or replace function public.upsert_recommendation(payload jsonb)
returns public.recommendations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rec_id uuid;
  before_row public.recommendations;
  after_row public.recommendations;
begin
  if not app.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  rec_id := nullif(payload->>'id', '')::uuid;

  if rec_id is not null then
    select * into before_row from public.recommendations where id = rec_id;
    if before_row is null then
      raise exception 'recommendation not found' using errcode = '02000';
    end if;
    update public.recommendations
       set stream = coalesce((payload->>'stream')::public.waste_stream, stream),
           failure_mode = coalesce(payload->>'failure_mode', failure_mode),
           threshold_min = case when payload ? 'threshold_min'
                                then (payload->>'threshold_min')::numeric
                                else threshold_min end,
           threshold_max = case when payload ? 'threshold_max'
                                then (payload->>'threshold_max')::numeric
                                else threshold_max end,
           recommendation_text = coalesce(payload->>'recommendation_text', recommendation_text),
           active = coalesce((payload->>'active')::boolean, active),
           updated_by = auth.uid()
     where id = rec_id
    returning * into after_row;
  else
    insert into public.recommendations(stream, failure_mode, threshold_min, threshold_max,
                                       recommendation_text, active, updated_by)
    values (
      (payload->>'stream')::public.waste_stream,
      payload->>'failure_mode',
      (payload->>'threshold_min')::numeric,
      (payload->>'threshold_max')::numeric,
      payload->>'recommendation_text',
      coalesce((payload->>'active')::boolean, true),
      auth.uid()
    )
    returning * into after_row;
  end if;

  insert into public.settings_audit_log(table_name, record_id, before, after, changed_by)
    values ('recommendations', after_row.id, to_jsonb(before_row), to_jsonb(after_row), auth.uid());
  insert into public.access_logs(user_id, action, metadata)
    values (auth.uid(),
            case when rec_id is null then 'recommendation_created' else 'recommendation_updated' end,
            jsonb_build_object('recommendation_id', after_row.id));

  return after_row;
end;
$$;

grant execute on function public.upsert_recommendation(jsonb) to authenticated;

-- log_event (lightweight, callable by anyone authenticated) ---------------
create or replace function public.log_event(action text, metadata jsonb default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then return; end if;
  if action is null or trim(action) = '' then return; end if;
  insert into public.access_logs(user_id, action, metadata)
    values (auth.uid(), action, metadata);
end;
$$;

grant execute on function public.log_event(text, jsonb) to authenticated;

-- Convenience: dashboard summary for admin --------------------------------
create or replace function public.admin_dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  out jsonb;
begin
  if not app.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  with this_week as (
    select location_id, count(*) as audits_this_week
      from public.audits
     where nullified = false
       and audit_week = app.week_start(current_date)
     group by location_id
  ),
  loc_status as (
    select l.id, l.name,
           coalesce(t.audits_this_week, 0) as audits_this_week,
           (coalesce(t.audits_this_week, 0) = 0) as missing_this_week
      from public.locations l
      left join this_week t on t.location_id = l.id
     where l.active
  ),
  recent_null as (
    select id, location_id, nullified_reason, nullified_at, nullified_by
      from public.audits
     where nullified = true
     order by nullified_at desc nulls last
     limit 10
  ),
  recent_settings as (
    select id, table_name, changed_by, created_at
      from public.settings_audit_log
     order by created_at desc
     limit 10
  )
  select jsonb_build_object(
    'locations', (select coalesce(jsonb_agg(to_jsonb(loc_status)), '[]'::jsonb) from loc_status),
    'recent_nullifications', (select coalesce(jsonb_agg(to_jsonb(recent_null)), '[]'::jsonb) from recent_null),
    'recent_settings_changes', (select coalesce(jsonb_agg(to_jsonb(recent_settings)), '[]'::jsonb) from recent_settings)
  )
  into out;
  return out;
end;
$$;

grant execute on function public.admin_dashboard_summary() to authenticated;
