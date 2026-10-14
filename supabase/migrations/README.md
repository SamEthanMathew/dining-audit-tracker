# Database migrations

Migrations are numbered, idempotent where reasonable, and applied to the hosted Supabase project via the Supabase MCP server's `apply_migration` tool. Each migration file is committed for traceability even though the canonical record lives in `supabase_migrations.schema_migrations`.

| File | Purpose |
|---|---|
| `0001_init_schema.sql` | Extensions, enums, tables, indexes (incl. the unique partial index for one rep audit per week), updated_at trigger |
| `0002_rls_policies.sql` | RLS enabled; `app.is_admin()` / `app.current_user_location_id()` helpers; per-table policies |
| `0003_scoring_functions.sql` | Stream grading, audit score trigger, location score, leaderboard |
| `0004_rpc_functions.sql` | `submit_audit`, `nullify_audit`, `update_settings`, `upsert_recommendation`, `log_event` |
| `0005_seed_data.sql` | Pilot locations, default settings, recommendation seeds |
| `0006_security_hardening.sql` | `search_path` on `app.*` helpers; revokes anon execute (superseded by `0014` — see below) |
| `0007_v2_schema.sql` | Simple audit form columns, `audit_photos`, the `audit-photos` bucket, usernames, sustainability survey |
| `0008_simple_scoring.sql` | Scoring for the simple (yes/no) form |
| `0009_username_outbox_submit.sql` | `resolve_username`, `email_outbox`, `recommended_audit_window`, the authenticated-only `submit_audit` |
| `0010_admin_semathew.sql` | Attaches the admin profile row for `semathew@andrew.cmu.edu` (create the Auth user first) |
| `0011_public_submit_grants.sql` | What the anonymous `/submit` page needs: `locations` read + the four public RPC grants |
| `0012_live_submit_audit.sql` | The deployed `submit_audit`, which accepts anonymous callers (supersedes `0009`'s) |
| `0013_harden_audit_photos_storage.sql` | Closes anon read on the photo bucket; adds a size cap, MIME allow-list, and path-shaped insert policy |
| `0014_rpc_execute_grants.sql` | Revokes the default `PUBLIC` execute grant and grants each RPC to the roles that actually call it |

To re-run from scratch against a fresh project, apply in numeric order.

## Drift

`0010`–`0014` exist because the live project had been changed by hand and the repo no longer described it. If you change the database outside these files, capture it here afterwards — otherwise the next from-scratch rebuild silently produces a different, usually more broken, system. Useful for checking:

```sql
-- what the live project thinks it has applied
select version, name from supabase_migrations.schema_migrations order by version;

-- the real definition of a function, to diff against the repo
select pg_get_functiondef('public.submit_audit(jsonb)'::regprocedure);

-- who can execute what (note: a NULL proacl means the default GRANT TO PUBLIC,
-- and aclexplode reports PUBLIC with grantee 0, which will not join to pg_roles)
select p.proname, coalesce(r.rolname, 'PUBLIC') as grantee
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  left join pg_roles r on r.oid = a.grantee
 where n.nspname = 'public' and a.privilege_type = 'EXECUTE'
 order by 1, 2;
```
