/**
 * Seed the four test accounts:
 *   - admin: semathew@andrew.cmu.edu
 *   - rep:   rep.abp@diningaudits.test         -> ABP
 *   - rep:   rep.schatz@diningaudits.test      -> Schatz
 *   - rep:   rep.stacked@diningaudits.test     -> Stacked Underground
 *
 * Requires env vars:
 *   SUPABASE_URL                 e.g. https://puglxbrebcldfcyrvglu.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY    service-role JWT
 *
 * Optional:
 *   ADMIN_EMAIL                  override admin email
 *   ADMIN_PASSWORD               override admin password (otherwise generated)
 *
 * Idempotent: existing users are skipped (no rotation of credentials).
 */

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const URL  = process.env.SUPABASE_URL ?? "";
const SRK  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!URL || !SRK) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  process.exit(1);
}

const supabase = createClient(URL, SRK, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function randomPassword(len = 16): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

type Spec = { email: string; full_name: string; role: "admin" | "rep"; locationName?: string; password?: string };

const ADMIN_EMAIL    = process.env.ADMIN_EMAIL ?? "semathew@andrew.cmu.edu";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? randomPassword();

const specs: Spec[] = [
  { email: ADMIN_EMAIL, full_name: "Sam Mathew",       role: "admin", password: ADMIN_PASSWORD },
  { email: "rep.abp@diningaudits.test",     full_name: "ABP Rep",     role: "rep", locationName: "ABP" },
  { email: "rep.schatz@diningaudits.test",  full_name: "Schatz Rep",  role: "rep", locationName: "Schatz" },
  { email: "rep.stacked@diningaudits.test", full_name: "Stacked Rep", role: "rep", locationName: "Stacked Underground" },
];

async function fetchLocations() {
  const { data, error } = await supabase.from("locations").select("id, name");
  if (error) throw error;
  return data ?? [];
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  // listUsers paginates; just walk the first page (small fleet).
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
}

async function ensureUser(spec: Spec, locsByName: Record<string, string>) {
  const existingId = await findUserIdByEmail(spec.email);
  if (existingId) {
    console.log(`= already exists: ${spec.email}`);
    // ensure public.users row matches
    await supabase.from("users").upsert({
      id: existingId,
      email: spec.email,
      full_name: spec.full_name,
      role: spec.role,
      location_id: spec.role === "rep" ? locsByName[spec.locationName!] : null,
      active: true,
    });
    return { email: spec.email, password: "(unchanged)" };
  }

  const password = spec.password ?? randomPassword();
  const { data: created, error } = await supabase.auth.admin.createUser({
    email: spec.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: spec.full_name },
  });
  if (error || !created.user) {
    throw new Error(`createUser ${spec.email}: ${error?.message ?? "unknown"}`);
  }
  const { error: pErr } = await supabase.from("users").insert({
    id: created.user.id,
    full_name: spec.full_name,
    email: spec.email,
    role: spec.role,
    location_id: spec.role === "rep" ? locsByName[spec.locationName!] : null,
    active: true,
  });
  if (pErr) {
    await supabase.auth.admin.deleteUser(created.user.id);
    throw new Error(`public.users insert ${spec.email}: ${pErr.message}`);
  }
  console.log(`+ created: ${spec.email}`);
  return { email: spec.email, password };
}

async function main() {
  const locs = await fetchLocations();
  const locsByName: Record<string, string> = {};
  for (const l of locs) locsByName[l.name] = l.id;
  console.log("Locations:", locsByName);

  const results: { email: string; password: string }[] = [];
  for (const s of specs) {
    if (s.role === "rep" && !locsByName[s.locationName!]) {
      console.error(`! Missing location for ${s.email}: ${s.locationName}`);
      process.exit(1);
    }
    results.push(await ensureUser(s, locsByName));
  }

  console.log("\n=== Test credentials ===");
  for (const r of results) {
    console.log(`${r.email.padEnd(38)} ${r.password}`);
  }
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
