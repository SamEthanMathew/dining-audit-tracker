-- 0005_seed_data.sql
-- Pilot locations, default settings row, recommendation library.

insert into public.locations(name, active)
values
  ('ABP', true),
  ('Schatz', true),
  ('Stacked Underground', true)
on conflict (name) do nothing;

insert into public.settings(id)
values ('00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

-- Recommendation library --------------------------------------------------
-- Grounded in CMU dining sorting guidance and EPA/Keep America Beautiful
-- best practices for contamination reduction at point-of-disposal.

with seeds(stream, failure_mode, threshold_min, threshold_max, recommendation_text) as (
  values
  -- LANDFILL: opportunity contamination (recyclables/compostables in trash)
  ('landfill'::public.waste_stream, 'high_opportunity', 10::numeric, 25::numeric,
   'Landfill bin contains 10–25% items that belong elsewhere. Add a small visual sorting guide above the bin with photos of common items (cups, utensils, packaging) showing their correct stream. A photo guide outperforms text every time.'),
  ('landfill'::public.waste_stream, 'high_opportunity', 25::numeric, 50::numeric,
   'More than a quarter of your landfill waste is recoverable. Run a 5-minute sorting refresh at the start of each shift this week and place the recycling and compost bins immediately adjacent to the landfill bin — proximity is the single highest-leverage change in commercial waste audits.'),
  ('landfill'::public.waste_stream, 'high_opportunity', 50::numeric, 100::numeric,
   'Severe diversion failure: over half of the landfill bin should not be there. Recommend pausing intake at the station and running a full sorting walkthrough with staff. Check whether the bins are clearly labeled, color-coded, and visible from the customer''s standing position before disposal.'),

  -- BOTTLES & CANS: food contamination (hard fail)
  ('bottles_cans'::public.waste_stream, 'food_present', null::numeric, null::numeric,
   'Food residue in the bottles & cans bin renders the entire batch unrecyclable at the MRF. Add a "rinse before recycling" sign at the station and place a small trash bin directly adjacent to capture leftover food, ice, or liquid. This is the single most effective fix for food contamination in recycling streams.'),

  -- BOTTLES & CANS: above-threshold contamination, non-food
  ('bottles_cans'::public.waste_stream, 'high_contamination', 10::numeric, 25::numeric,
   'Non-food contamination above 10%. Most common culprits are coffee cups (often mistaken as recyclable due to the plastic feel) and condiment packets. Add an "Only metal cans and clear plastic bottles" sign with pictures, and verify that the bin opening is shaped to discourage non-conforming items.'),
  ('bottles_cans'::public.waste_stream, 'high_contamination', 25::numeric, 100::numeric,
   'Bottles & cans bin is heavily contaminated. Audit the bin''s placement: it should be on the customer''s direct path with no competing trash bin within an arm''s reach. Consider rotating to a restricted-opening lid (round hole only) to physically limit non-conforming items.'),

  -- COMPOST: above threshold
  ('compost'::public.waste_stream, 'above_threshold', 5::numeric, 15::numeric,
   'Compost contamination is mild but above target. The most common offenders are plastic utensils mistaken for compostable serviceware and plastic-film food wrappers. Verify all serviceware in use is BPI-certified compostable, and add a small picture guide of accepted items at eye level.'),
  ('compost'::public.waste_stream, 'above_threshold', 15::numeric, 100::numeric,
   'Compost stream contamination is high enough to risk batch rejection at the facility. Pull non-compostable items out before pickup if feasible, and run a quick line-staff refresh focused on the difference between compostable (PLA, fiber, certified paper) and look-alike plastics.'),

  -- CARDBOARD: any contamination (strict)
  ('cardboard'::public.waste_stream, 'not_pure', null::numeric, null::numeric,
   'Cardboard stream contains non-cardboard material. Flatten and stack only — no plastic film, no styrofoam, no food residue, no waxed/coated boxes (pizza boxes with grease, freezer boxes). Move this bin to a back-of-house area if customer access is causing contamination, and check that staff know to remove tape and labels before stacking.')
)
insert into public.recommendations(stream, failure_mode, threshold_min, threshold_max, recommendation_text, active)
select stream, failure_mode, threshold_min, threshold_max, recommendation_text, true
  from seeds
 where not exists (
   select 1 from public.recommendations r
    where r.stream = seeds.stream
      and r.failure_mode = seeds.failure_mode
      and r.recommendation_text = seeds.recommendation_text
 );
