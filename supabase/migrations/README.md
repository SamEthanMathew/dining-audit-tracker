# Database migrations

Migrations are numbered, idempotent where reasonable, and applied to the hosted Supabase project via the Supabase MCP server's `apply_migration` tool. Each migration file is committed for traceability even though the canonical record lives in `supabase_migrations.schema_migrations`.

| File | Purpose |
|---|---|
| `0001_init_schema.sql` | Extensions, enums, tables, indexes (incl. the unique partial index for one rep audit per week), updated_at trigger |
| `0002_rls_policies.sql` | RLS enabled; `app.is_admin()` / `app.current_user_location_id()` helpers; per-table policies |
| `0003_scoring_functions.sql` | Stream grading, audit score trigger, location score, leaderboard |
| `0004_rpc_functions.sql` | `submit_audit`, `nullify_audit`, `update_settings`, `upsert_recommendation`, `log_event` |
| `0005_seed_data.sql` | Pilot locations, default settings, recommendation seeds |

To re-run from scratch against a fresh project, apply in numeric order.
