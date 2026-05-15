-- 0006_security_hardening.sql
-- Set search_path on app.* helpers and revoke anon execute on all RPCs.

alter function app.set_updated_at()                set search_path = public, pg_temp;
alter function app.week_start(date)                set search_path = public, pg_temp;
alter function app.contam_pct(numeric, numeric)    set search_path = public, pg_temp;
alter function app.letter_to_numeric(text)         set search_path = public, pg_temp;
alter function app.grade_for_stream(public.waste_stream, numeric, numeric, boolean, public.settings) set search_path = public, pg_temp;
alter function app.compute_audit_score(public.audits, public.settings) set search_path = public, pg_temp;
alter function app.audits_compute_score_trg()      set search_path = public, pg_temp;

-- Revoke anon execute on every public RPC; only authenticated should call.
revoke execute on function public.submit_audit(jsonb)                 from anon;
revoke execute on function public.nullify_audit(uuid, text)           from anon;
revoke execute on function public.update_settings(jsonb)              from anon;
revoke execute on function public.upsert_recommendation(jsonb)        from anon;
revoke execute on function public.log_event(text, jsonb)              from anon;
revoke execute on function public.leaderboard()                       from anon;
revoke execute on function public.admin_leaderboard()                 from anon;
revoke execute on function public.admin_dashboard_summary()           from anon;
revoke execute on function public.current_location_score(uuid)        from anon;
revoke execute on function public.current_location_tier(numeric)      from anon;
revoke execute on function app.is_admin()                              from anon;
