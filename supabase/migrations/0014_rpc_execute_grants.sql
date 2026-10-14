-- 0014_rpc_execute_grants.sql
-- Applied to the live project 2026-10-14 (as "least_privilege_rpc_grants" and
-- then "revoke_public_execute_on_rpcs" once the first attempt proved to be a
-- no-op).
--
-- Every function in the public schema still carried Postgres' default
-- `GRANT EXECUTE TO PUBLIC`. PUBLIC includes anon, so 0006's
-- `revoke execute ... from anon` never actually closed anything — the roles
-- just inherited the privilege from PUBLIC instead.
--
-- Mostly that was harmless: the admin RPCs all guard themselves with
-- app.is_admin() and raise 42501. The exception was current_location_score,
-- which has no guard and returns the raw numeric score the product
-- deliberately keeps private (the public leaderboard shows tiers only) —
-- confirmed callable with nothing but the publishable key.
--
-- Revoke PUBLIC, then grant back exactly who needs each function.

-- Public surface: the anonymous submit form and the tier-only leaderboard.
revoke execute on function public.submit_audit(jsonb)                from public;
grant  execute on function public.submit_audit(jsonb)                to anon, authenticated, service_role;

revoke execute on function public.leaderboard()                      from public;
grant  execute on function public.leaderboard()                      to anon, authenticated, service_role;

revoke execute on function public.resolve_username(text)             from public;
grant  execute on function public.resolve_username(text)             to anon, authenticated, service_role;

revoke execute on function public.recommended_audit_window(uuid)     from public;
grant  execute on function public.recommended_audit_window(uuid)     to anon, authenticated, service_role;

-- Signed-in only. The admin ones also guard themselves with app.is_admin();
-- this is the permission layer underneath that.
revoke execute on function public.log_event(text, jsonb)             from public;
grant  execute on function public.log_event(text, jsonb)             to authenticated, service_role;

revoke execute on function public.admin_dashboard_summary()          from public;
grant  execute on function public.admin_dashboard_summary()          to authenticated, service_role;

revoke execute on function public.admin_leaderboard()                from public;
grant  execute on function public.admin_leaderboard()                to authenticated, service_role;

revoke execute on function public.nullify_audit(uuid, text)          from public;
grant  execute on function public.nullify_audit(uuid, text)          to authenticated, service_role;

revoke execute on function public.update_settings(jsonb)             from public;
grant  execute on function public.update_settings(jsonb)             to authenticated, service_role;

revoke execute on function public.update_location(jsonb)             from public;
grant  execute on function public.update_location(jsonb)             to authenticated, service_role;

revoke execute on function public.create_location(jsonb)             from public;
grant  execute on function public.create_location(jsonb)             to authenticated, service_role;

revoke execute on function public.upsert_recommendation(jsonb)       from public;
grant  execute on function public.upsert_recommendation(jsonb)       to authenticated, service_role;

-- Not called from any client. leaderboard() and admin_leaderboard() call them
-- internally, and SECURITY DEFINER runs as the owner, so those paths keep
-- working without a client grant.
revoke execute on function public.current_location_score(uuid)       from public, anon;
revoke execute on function public.current_location_tier(numeric)     from public, anon;
grant  execute on function public.current_location_score(uuid)       to service_role;
grant  execute on function public.current_location_tier(numeric)     to service_role;

-- Verified after applying, with the publishable key and with an admin JWT:
--
--   RPC                        anon    admin
--   leaderboard                200     200
--   resolve_username           200     200
--   recommended_audit_window   200     200
--   current_location_score     401     200
--   admin_leaderboard          401     200
--   admin_dashboard_summary    401     200
--   update_settings            401     200
--
-- and an anonymous submit with a photo still returns 200.
