-- 0012_live_submit_audit.sql
-- The submit_audit that is actually deployed, captured from the live project
-- with pg_get_functiondef so the repo stops disagreeing with production.
--
-- 0009's version rejects anonymous callers outright (it reads the caller from
-- public.users via auth.uid() and raises 'not authorized' when that is null),
-- but /submit has been an anonymous page since commit 8fb0e8a. This version —
-- applied by hand and never committed — treats a null auth.uid() as an
-- anonymous rep: submitted_by is left null (the column is nullable),
-- submitted_by_role defaults to 'rep', and done_by_dining_team is ignored
-- unless the caller is a signed-in admin.
--
-- Amended 2026-10-14 (applied live as "validate_audit_photo_paths" and
-- "submit_audit_guard_photo_paths"): storage paths arrive in the request body
-- of an anonymous endpoint, and audit_photos.storage_path had no uniqueness,
-- so a submitter could attach a path that does not exist or one belonging to
-- somebody else's audit. Now a path must exist in the bucket and can only ever
-- belong to one audit — and a bad path skips that photo instead of failing the
-- whole submission. The path's stream folder must also match the stream the
-- payload claims, so a compost photo cannot be filed under landfill.
--
-- Residual risk, documented rather than fixed: paths are client-chosen, so
-- someone who learns an un-submitted path could claim it first. Enumeration is
-- closed (0013 removed anon read/list) and the paths are random UUIDs, so this
-- needs a leaked path. The real fix is server-issued upload tokens — an Edge
-- Function handing out signed upload URLs tied to one submission — which is a
-- design change, not a policy tweak.

create unique index if not exists uq_audit_photos_storage_path
  on public.audit_photos(storage_path);

create or replace function app.audit_photo_exists(p_path text, p_stream text)
returns boolean
language sql
stable
security definer
set search_path = storage, pg_temp
as $$
  -- Exists in the bucket AND sits in the folder for the stream it claims to
  -- belong to (<submission-uuid>/<stream>/<file>), so a photo cannot be filed
  -- under a bin it was not taken for.
  select exists (
    select 1 from storage.objects o
     where o.bucket_id = 'audit-photos'
       and o.name = p_path
  ) and split_part(p_path, '/', 2) = p_stream;
$$;

revoke execute on function app.audit_photo_exists(text, text) from public;
drop function if exists app.audit_photo_exists(text);

create or replace function public.submit_audit(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  uid uuid := auth.uid();
  caller public.users;
  is_admin bool := false;
  caller_role public.user_role := 'rep';
  caller_email text;
  loc_id uuid;
  mode public.audit_form_mode;
  s_row public.settings;
  audit_row public.audits;
  recs jsonb;
  grades jsonb;
  photo jsonb;
  done_by_team boolean;
begin
  if uid is not null then
    select * into caller from public.users where id = uid;
    if caller is not null and caller.active then
      caller_role := caller.role;
      caller_email := caller.email;
      is_admin := (caller.role = 'admin');
    end if;
  end if;

  loc_id := (payload->>'location_id')::uuid;
  if loc_id is null then
    -- For backward compat: if a logged-in rep submitted without specifying
    -- location, fall back to their assigned location.
    if caller is not null and caller.role = 'rep' and caller.location_id is not null then
      loc_id := caller.location_id;
    else
      raise exception 'location_id required' using errcode = '22023';
    end if;
  end if;

  if not exists (select 1 from public.locations where id = loc_id and active) then
    raise exception 'location not found or inactive' using errcode = '02000';
  end if;

  if coalesce(trim(payload->>'submitter_name'), '') = '' then
    raise exception 'submitter_name required' using errcode = '22023';
  end if;

  -- done_by_dining_team is admin-only; silently drop if claimed by non-admin.
  done_by_team := coalesce((payload->>'done_by_dining_team')::boolean, false) and is_admin;

  select * into s_row from public.settings limit 1;
  if s_row is null then
    raise exception 'settings row missing' using errcode = 'P0001';
  end if;

  mode := coalesce(
    (payload->>'audit_form_mode')::public.audit_form_mode,
    case when is_admin then 'detailed'::public.audit_form_mode
         else s_row.audit_form_mode_for_reps end
  );

  insert into public.audits (
    location_id, submitted_by, submitted_by_role, audit_mode, audit_date,
    audit_form_mode,
    submitter_name, is_sustainability_champion, done_by_dining_team,
    landfill_total, landfill_contamination,
    bottles_cans_total, bottles_cans_contamination, bottles_cans_food_present,
    compost_total, compost_contamination,
    cardboard_total, cardboard_contamination,
    simple_responses,
    landfill_contamination_pct, landfill_total_dustbins, landfill_cleared_contamination,
    bottles_cans_contamination_pct, bottles_cans_total_dustbins, bottles_cans_cleared_contamination,
    compost_contamination_pct, compost_total_dustbins, compost_cleared_contamination,
    cardboard_contamination_pct, cardboard_total_dustbins, cardboard_cleared_contamination,
    cardboard_to_baler,
    landfill_additional_description, bottles_cans_additional_description,
    compost_additional_description, cardboard_additional_description,
    general_comments,
    reuse_program, energy_conservation_plan, water_conservation_plan,
    donates_forinto, donates_cmu_food_pantry, sustainability_contact
  ) values (
    loc_id, uid, caller_role,
    coalesce((payload->>'audit_mode')::public.audit_mode, s_row.audit_mode),
    coalesce((payload->>'audit_date')::date, current_date),
    mode,
    trim(payload->>'submitter_name'),
    coalesce((payload->>'is_sustainability_champion')::boolean, false),
    done_by_team,
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

  grades := audit_row.computed_grades;

  if jsonb_typeof(payload->'photos') = 'array' then
    for photo in select * from jsonb_array_elements(payload->'photos') loop
      -- storage_path comes straight from the request body, and the submit
      -- endpoint is anonymous. Only attach paths that really exist in the
      -- bucket, and let the unique index drop any path already claimed by
      -- another audit — a bad path skips the photo, it does not fail the audit.
      if app.audit_photo_exists(photo->>'storage_path', photo->>'stream') then
        insert into public.audit_photos(audit_id, stream, storage_path, uploaded_by)
        values (
          audit_row.id,
          (photo->>'stream')::public.waste_stream,
          photo->>'storage_path',
          uid
        )
        on conflict (storage_path) do nothing;
      end if;
    end loop;
  end if;

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

  insert into public.email_outbox (audit_id, to_emails, cc_emails, subject, html)
  select
    audit_row.id,
    array_remove(array[ l.contact_email ], null),
    array_remove(array[ s_row.dining_sustainability_email, caller_email ], null),
    format('[Dining Audit] %s - %s', l.name, audit_row.audit_date),
    ''
  from public.locations l where l.id = loc_id;

  insert into public.access_logs(user_id, action, metadata)
    values (uid, 'submit_audit',
            jsonb_build_object('audit_id', audit_row.id, 'mode', mode,
                               'score', audit_row.computed_score,
                               'anon', uid is null));

  return jsonb_build_object(
    'audit',           to_jsonb(audit_row),
    'recommendations', recs
  );
end;
$function$;
