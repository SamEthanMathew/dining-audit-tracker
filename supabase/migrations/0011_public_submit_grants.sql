-- 0011_public_submit_grants.sql
-- What the anonymous /submit page needs, recorded as committed SQL.
--
-- These grants were applied by hand to the hosted project (migration
-- 20260602195014 "public_submit_and_locations") and never committed, so a
-- from-scratch rebuild produced a form that could not read locations and could
-- not upload a photo. Verified against the live project on 2026-10-14; every
-- statement below matches what is actually deployed and is safe to re-run.
--
-- Reading photos is deliberately NOT granted to anon — see 0013.

-- 1. Location dropdown ----------------------------------------------------
-- Only the names of active dining locations, which are already public.
drop policy if exists locations_read_anon on public.locations;
create policy locations_read_anon on public.locations
  for select to anon using (active = true);

-- 2. RPCs the public page calls -------------------------------------------
-- submit_audit             — the submit itself (see 0012 for the function)
-- leaderboard              — returns (location_id, location_name, tier); no numbers
-- resolve_username         — lets the login box accept a username
-- recommended_audit_window — the "suggested next window" hint on the form
--
-- 0014 is the authority on the final grant set; it revokes the default PUBLIC
-- grant that made these reachable regardless of the role grants below.
grant execute on function public.submit_audit(jsonb)            to anon;
grant execute on function public.leaderboard()                  to anon;
grant execute on function public.resolve_username(text)         to anon;
grant execute on function public.recommended_audit_window(uuid) to anon;

-- 3. Photo upload ----------------------------------------------------------
-- The insert policy and the bucket's limits live in 0013, which supersedes the
-- unrestricted "audit-photos anon insert" policy that was deployed here.
