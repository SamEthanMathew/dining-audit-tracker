-- 0008_simple_scoring.sql
-- New grade function for simple-mode audits + branching in compute_audit_score.

-- Grade a single stream in SIMPLE mode -----------------------------------
create or replace function app.grade_for_stream_simple(
  s public.waste_stream,
  a public.audits,
  s_row public.settings
)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  pct numeric := 0;
  cleared bool := false;
  descr text := '';
  responses jsonb := coalesce(a.simple_responses -> s::text, '{}'::jsonb);
  bad_count int := 0;
  hard_fail bool := false;
  score numeric := 100;
begin
  if s = 'landfill' then
    pct := coalesce(a.landfill_contamination_pct, 0);
    cleared := a.landfill_cleared_contamination;
    descr := coalesce(a.landfill_additional_description, '');
    if coalesce((responses->>'sees_compost')::bool, false)      then bad_count := bad_count + 1; end if;
    if coalesce((responses->>'sees_bottles_cans')::bool, false) then bad_count := bad_count + 1; end if;
    if coalesce((responses->>'sees_cardboard')::bool, false)    then bad_count := bad_count + 1; end if;
  elsif s = 'bottles_cans' then
    pct := coalesce(a.bottles_cans_contamination_pct, 0);
    cleared := a.bottles_cans_cleared_contamination;
    descr := coalesce(a.bottles_cans_additional_description, '');
    if coalesce((responses->>'sees_food')::bool, false) or a.bottles_cans_food_present then
      hard_fail := true;
    end if;
    if coalesce((responses->>'sees_paper')::bool, false)    then bad_count := bad_count + 1; end if;
    if coalesce((responses->>'sees_landfill')::bool, false) then bad_count := bad_count + 1; end if;
  elsif s = 'compost' then
    pct := coalesce(a.compost_contamination_pct, 0);
    cleared := a.compost_cleared_contamination;
    descr := coalesce(a.compost_additional_description, '');
    if coalesce((responses->>'sees_plastic')::bool, false)               then bad_count := bad_count + 1; end if;
    if coalesce((responses->>'sees_metal')::bool, false)                 then bad_count := bad_count + 1; end if;
    if coalesce((responses->>'sees_paper_non_compostable')::bool, false) then bad_count := bad_count + 1; end if;
  elsif s = 'cardboard' then
    pct := coalesce(a.cardboard_contamination_pct, 0);
    cleared := a.cardboard_cleared_contamination;
    descr := coalesce(a.cardboard_additional_description, '');
    if coalesce((responses->>'sees_non_cardboard')::bool, false) then bad_count := bad_count + 1; end if;
    if a.cardboard_to_baler is false then hard_fail := true; end if;
  end if;

  if hard_fail then return 'F'; end if;

  score := score - least(pct, 50) * 1.5;     -- visual contamination penalty
  score := score - bad_count * 10;            -- yes/no question penalties
  if cleared and length(trim(descr)) > 0 then -- bonus for cleared + described
    score := score + s_row.bonus_for_cleared_contamination;
  end if;
  score := greatest(0, least(100, score));

  return case
    when score >= 90 then 'A'
    when score >= 80 then 'B'
    when score >= 70 then 'C'
    when score >= 60 then 'D'
    else 'F'
  end;
end;
$$;

-- Branch compute_audit_score on audit_form_mode -------------------------
create or replace function app.compute_audit_score(a public.audits, s_row public.settings)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  g_lf text; g_bc text; g_co text; g_cb text;
  num_avg numeric;
begin
  if a.audit_form_mode = 'simple' then
    g_lf := app.grade_for_stream_simple('landfill',     a, s_row);
    g_bc := app.grade_for_stream_simple('bottles_cans', a, s_row);
    g_co := app.grade_for_stream_simple('compost',      a, s_row);
    g_cb := app.grade_for_stream_simple('cardboard',    a, s_row);
  else
    g_lf := app.grade_for_stream('landfill',     a.landfill_total,     a.landfill_contamination,     false, s_row);
    g_bc := app.grade_for_stream('bottles_cans', a.bottles_cans_total, a.bottles_cans_contamination, a.bottles_cans_food_present, s_row);
    g_co := app.grade_for_stream('compost',      a.compost_total,      a.compost_contamination,      false, s_row);
    g_cb := app.grade_for_stream('cardboard',    a.cardboard_total,    a.cardboard_contamination,    false, s_row);
  end if;

  num_avg := (
    app.letter_to_numeric(g_lf) +
    app.letter_to_numeric(g_bc) +
    app.letter_to_numeric(g_co) +
    app.letter_to_numeric(g_cb)
  ) / 4.0;

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

-- Replace the trigger to also fire on the new columns -------------------
drop trigger if exists trg_audits_compute_score on public.audits;
create trigger trg_audits_compute_score
  before insert or update
  on public.audits
  for each row execute function app.audits_compute_score_trg();
