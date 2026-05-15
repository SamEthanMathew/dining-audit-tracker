# CMU Dining Waste Audit Tracker

Production system for CMU Dining sustainability reps and administrators to record weekly waste-segregation audits across dining locations, with a private scoring engine and a public tier-based leaderboard.

Pilot covers three locations: **ABP**, **Schatz**, and **Stacked Underground**. Architecture supports adding locations without code changes.

## Stack

- **Frontend** — Vite + React 18 + TypeScript + Tailwind + React Router v6 + React Hook Form + Zod + Recharts
- **Backend** — Supabase (Postgres 17 + Auth + RLS + one Edge Function)
- **Hosting** — Vercel (frontend) + Supabase (DB, Auth, Edge)

## Repo Layout

```
/web                React app
/supabase           SQL migrations and the admin_user_mgmt edge function
/scripts            One-off ops scripts (seed_users.ts)
```

## Local Development

```bash
# 1. Install root + web deps
npm install
npm --prefix web install

# 2. Configure env (copy and fill)
cp web/.env.example web/.env.local
# Fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# 3. Run dev server
npm run dev
```

## Operations

### Apply database migrations
Migrations live in `supabase/migrations/`. They are applied to the hosted Supabase project via the Supabase MCP server (see `supabase/migrations/README.md`).

### Seed users
```bash
# Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env or .env.seed
npm run seed:users
```
Creates the admin account plus one rep per location. Reports generated passwords to stdout. **Service role key must never be committed.**

### Edge function
`supabase/functions/admin_user_mgmt/` is deployed via the Supabase MCP server. It is the only place outside of `scripts/seed_users.ts` where the service role key lives, and it requires an admin caller JWT.

## Roles

| Role | Can see | Can do |
|---|---|---|
| **rep** | Own audits, own location's tier badge, the tier-only public leaderboard | Submit one audit/week for own location |
| **admin** | Everything across all locations | Anything — submit audits anywhere (90% weighted), nullify, edit recommendations, change settings, manage users |

## Scoring Summary

- Four streams: `landfill`, `bottles_cans`, `compost`, `cardboard`
- Per-stream letter grades A–F via rules + thresholds (all configurable)
- Per-audit overall score = average of stream letter grades normalised to 0–100
- Location score = weighted average across non-nullified audits, with:
  - `role_weight` — admin 0.9, rep 0.1 (configurable)
  - `time_decay` — exponential, configurable half-life and floor
- Tiers — Platinum / Gold / Silver / Bronze, thresholds configurable

All knobs live in the `settings` table, editable via `/admin/settings`.
