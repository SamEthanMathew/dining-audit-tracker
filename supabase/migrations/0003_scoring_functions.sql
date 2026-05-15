-- 0003_scoring_functions.sql
-- Per-stream grading, audit score trigger, location score, tiers, leaderboard.

-- Safe-divide contamination percentage -------------------------------------
create or replace function app.contam_pct(total numeric, contam numeric)
returns numeric
language sql
immutable
as $$
  select case when total is null or total <= 0 then 0
              else (contam / total) * 100.0 end;
$$;

-- A=4, B=3, C=2, D=1, F=0 -------------------------------------------------
create or replace function app.letter_to_numeric(letter text)
returns numeric
language sql
immutable
as $$
  select case letter
           when 'A' then 4
           when 'B' then 3
           when 'C' then 2
           when 'D' then 1
           else 0
         end::numeric;
$$;

-- Per-stream grade (letter A-F) -------------------------------------------
create or replace function app.grade_for_stream(
  s public.waste_stream,
  total numeric,
  contam numeric,
  food_present boolean,
  s_row public.settings
)
returns text
language plpgsql
immutable
as $$
declare
  pct numeric := app.contam_pct(total, contam);
  thr numeric;
  span numeric;
begin
  if s = 'landfill' then
    thr := s_row.landfill_opportunity_threshold_a;
    if pct <= thr then return 'A'; end if;
    if pct >= 50 then return 'F'; end if;
    -- evenly split [thr, 50] into 4 buckets: B, C, D, F
    span := (50 - thr) / 4.0;
    if pct <= thr + span      then return 'B';
    elsif pct <= thr + 2*span then return 'C';
    elsif pct <= thr + 3*span then return 'D';
    else return 'F'; end if;

  elsif s = 'bottles_cans' then
    if food_present then return 'F'; end if;
    thr := s_row.bottles_cans_threshold_a;
    if thr <= 0 then
      return case when pct = 0 then 'A' else 'F' end;
    end if;
    if pct = 0          then return 'A';
    elsif pct <= thr/3.0 then return 'A';
    elsif pct <= 2*thr/3.0 then return 'B';
    elsif pct <= thr     then return 'C';
    else return 'F'; end if;

  elsif s = 'compost' then
    thr := s_row.compost_threshold_a;
    return case when pct <= thr then 'A' else 'F' end;

  elsif s = 'cardboard' then
    if s_row.cardboard_strict then
      return case when contam = 0 then 'A' else 'F' end;
    else
      -- future-proof non-strict: same scale as compost using a 5% bar
      return case when pct <= 5 then 'A'
                  when pct <= 15 then 'B'
                  when pct <= 30 then 'C'
                  when pct <= 50 then 'D'
                  else 'F' end;
    end if;
  end if;

  return 'F';
end;
$$;

-- Compute the full grades + 0-100 score given a row + settings -----------
create or replace function app.compute_audit_score(a public.audits, s_row public.settings)
returns jsonb
language plpgsql
immutable
as $$
declare
  g_lf text  := app.grade_for_stream('landfill',      a.landfill_total,     a.landfill_contamination,     false, s_row);
  g_bc text  := app.grade_for_stream('bottles_cans',  a.bottles_cans_total, a.bottles_cans_contamination, a.bottles_cans_food_present, s_row);
  g_co text  := app.grade_for_stream('compost',       a.compost_total,      a.compost_contamination,      false, s_row);
  g_cb text  := app.grade_for_stream('cardboard',     a.cardboard_total,    a.cardboard_contamination,    false, s_row);
  num_avg numeric := (
    app.letter_to_numeric(g_lf) +
    app.letter_to_numeric(g_bc) +
    app.letter_to_numeric(g_co) +
    app.letter_to_numeric(g_cb)
  ) / 4.0;
begin
  return jsonb_build_object(
    'grades', jsonb_build_object(
      'landfill',     g_lf,
      'bottles_cans', g_bc,
      'compost',      g_co,
      'cardboard',    g_cb
    ),
    'score', round((num_avg / 4.0) * 100.0, 2)
  );
end;
$$;

-- Trigger: fill computed_grades + computed_score on insert/update --------
create or replace function app.audits_compute_score_trg()
returns trigger
language plpgsql
as $$
declare
  s_row public.settings;
  result jsonb;
begin
  select * into s_row from public.settings limit 1;
  if s_row is null then
    raise exception 'settings row not found — seed migration not applied?' using errcode = 'P0001';
  end if;
  result := app.compute_audit_score(new, s_row);
  new.computed_grades := result -> 'grades';
  new.computed_score  := (result ->> 'score')::numeric;
  return new;
end;
$$;

drop trigger if exists trg_audits_compute_score on public.audits;
create trigger trg_audits_compute_score
  before insert or update of
    landfill_total, landfill_contamination,
    bottles_cans_total, bottles_cans_contamination, bottles_cans_food_present,
    compost_total, compost_contamination,
    cardboard_total, cardboard_contamination
  on public.audits
  for each row execute function app.audits_compute_score_trg();

-- Location score: weighted avg w/ role weight + exp time decay -----------
create or replace function public.current_location_score(loc uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  s_row public.settings;
  weighted_sum numeric := 0;
  total_weight numeric := 0;
  r record;
  age_days numeric;
  decay numeric;
  rw numeric;
  w numeric;
begin
  select * into s_row from public.settings limit 1;
  if s_row is null then return null; end if;

  for r in
    select submitted_by_role, computed_score, audit_date
      from public.audits
     where location_id = loc and nullified = false and computed_score is not null
  loop
    age_days := greatest(extract(epoch from (now() - r.audit_date::timestamp)) / 86400.0, 0);
    if age_days > s_row.decay_floor_days then
      decay := 0;
    else
      decay := power(0.5, age_days / nullif(s_row.decay_half_life_days, 0));
    end if;
    rw := case when r.submitted_by_role = 'admin'
               then s_row.admin_audit_weight
               else s_row.rep_audit_weight end;
    w := rw * decay;
    if w > 0 then
      weighted_sum := weighted_sum + r.computed_score * w;
      total_weight := total_weight + w;
    end if;
  end loop;

  if total_weight <= 0 then return null; end if;
  return round(weighted_sum / total_weight, 2);
end;
$$;

-- Tier mapping ------------------------------------------------------------
create or replace function public.current_location_tier(score numeric)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  t jsonb;
  plat numeric; gold numeric; silver numeric;
begin
  if score is null then return 'unrated'; end if;
  select tier_thresholds into t from public.settings limit 1;
  plat   := coalesce((t->>'platinum')::numeric, 90);
  gold   := coalesce((t->>'gold')::numeric, 75);
  silver := coalesce((t->>'silver')::numeric, 60);
  if score >= plat then return 'platinum'; end if;
  if score >= gold then return 'gold'; end if;
  if score >= silver then return 'silver'; end if;
  return 'bronze';
end;
$$;

-- Public leaderboard: tier only, ALL authenticated users see ---------------
create or replace function public.leaderboard()
returns table(location_id uuid, location_name text, tier text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select l.id, l.name, public.current_location_tier(public.current_location_score(l.id))
    from public.locations l
   where l.active
   order by l.name;
$$;

grant execute on function public.leaderboard() to authenticated;

-- Admin leaderboard: includes raw score -----------------------------------
create or replace function public.admin_leaderboard()
returns table(location_id uuid, location_name text, score numeric, tier text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query
    select l.id, l.name,
           public.current_location_score(l.id),
           public.current_location_tier(public.current_location_score(l.id))
      from public.locations l
     where l.active
     order by l.name;
end;
$$;

grant execute on function public.admin_leaderboard() to authenticated;
grant execute on function public.current_location_score(uuid) to authenticated;
grant execute on function public.current_location_tier(numeric) to authenticated;
