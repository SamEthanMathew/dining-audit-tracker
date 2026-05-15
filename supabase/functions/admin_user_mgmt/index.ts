// admin_user_mgmt — privileged user management.
// Callers must be an authenticated admin (checked against public.users).
// Service-role key is used for the Auth admin API.
//
// POST body:
//   { op: "create",     email, full_name, role, location_id?, password? }
//   { op: "update",     user_id, full_name?, role?, location_id?, active? }
//   { op: "reset_password", user_id }
//   { op: "deactivate", user_id }
//   { op: "activate",   user_id }

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function randomPassword(): string {
  const buf = new Uint8Array(18);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf)).replace(/[+/=]/g, "").slice(0, 20);
}

async function assertCallerIsAdmin(req: Request): Promise<{ uid: string }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    throw new Response("missing bearer", { status: 401, headers: CORS });
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !userData?.user) {
    throw new Response("unauthenticated", { status: 401, headers: CORS });
  }
  const { data: profile, error: pErr } = await userClient
    .from("users").select("role, active").eq("id", userData.user.id).single();
  if (pErr || !profile || profile.role !== "admin" || !profile.active) {
    throw new Response("admin only", { status: 403, headers: CORS });
  }
  return { uid: userData.user.id };
}

async function logAccess(admin: SupabaseClient, actorId: string, action: string, metadata: Record<string, unknown>) {
  await admin.from("access_logs").insert({ user_id: actorId, action, metadata });
}

async function handleCreate(admin: SupabaseClient, actorId: string, body: any) {
  const { email, full_name, role, location_id } = body;
  if (!email || !role || !["rep", "admin"].includes(role)) {
    return json({ error: "email and role (rep|admin) required" }, 400);
  }
  if (role === "rep" && !location_id) {
    return json({ error: "location_id required for rep" }, 400);
  }
  const password = body.password || randomPassword();

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name ?? "" },
  });
  if (error || !created.user) {
    return json({ error: error?.message ?? "create failed" }, 400);
  }

  const { error: profileErr } = await admin.from("users").insert({
    id: created.user.id,
    full_name: full_name ?? "",
    email,
    role,
    location_id: role === "rep" ? location_id : null,
    active: true,
  });
  if (profileErr) {
    // roll back the auth user to avoid orphans
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: profileErr.message }, 400);
  }

  await logAccess(admin, actorId, "admin_user_create", { user_id: created.user.id, email, role, location_id });
  return json({ user_id: created.user.id, email, role, location_id, generated_password: password });
}

async function handleUpdate(admin: SupabaseClient, actorId: string, body: any) {
  const { user_id, full_name, role, location_id, active } = body;
  if (!user_id) return json({ error: "user_id required" }, 400);

  const patch: Record<string, unknown> = {};
  if (full_name !== undefined) patch.full_name = full_name;
  if (role !== undefined) patch.role = role;
  if (location_id !== undefined) patch.location_id = location_id;
  if (active !== undefined) patch.active = active;

  if (role !== undefined && !["rep", "admin"].includes(role)) {
    return json({ error: "role must be rep or admin" }, 400);
  }

  const { data: updated, error } = await admin.from("users").update(patch).eq("id", user_id).select().single();
  if (error) return json({ error: error.message }, 400);
  await logAccess(admin, actorId, "admin_user_update", { user_id, patch });
  return json({ user: updated });
}

async function handleResetPassword(admin: SupabaseClient, actorId: string, body: any) {
  const { user_id } = body;
  if (!user_id) return json({ error: "user_id required" }, 400);
  const newPassword = randomPassword();
  const { error } = await admin.auth.admin.updateUserById(user_id, { password: newPassword });
  if (error) return json({ error: error.message }, 400);
  await logAccess(admin, actorId, "admin_user_password_reset", { user_id });
  return json({ user_id, new_password: newPassword });
}

async function handleDeactivate(admin: SupabaseClient, actorId: string, body: any) {
  const { user_id } = body;
  if (!user_id) return json({ error: "user_id required" }, 400);
  const { error } = await admin.from("users").update({ active: false }).eq("id", user_id);
  if (error) return json({ error: error.message }, 400);
  await logAccess(admin, actorId, "admin_user_deactivate", { user_id });
  return json({ user_id, active: false });
}

async function handleActivate(admin: SupabaseClient, actorId: string, body: any) {
  const { user_id } = body;
  if (!user_id) return json({ error: "user_id required" }, 400);
  const { error } = await admin.from("users").update({ active: true }).eq("id", user_id);
  if (error) return json({ error: error.message }, 400);
  await logAccess(admin, actorId, "admin_user_activate", { user_id });
  return json({ user_id, active: true });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return json({ error: "method not allowed" }, 405);

  let caller;
  try {
    caller = await assertCallerIsAdmin(req);
  } catch (resp) {
    if (resp instanceof Response) return resp;
    return json({ error: "unauthorized" }, 401);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const op = body?.op;
  if (!op) return json({ error: "op required" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  switch (op) {
    case "create":         return handleCreate(admin, caller.uid, body);
    case "update":         return handleUpdate(admin, caller.uid, body);
    case "reset_password": return handleResetPassword(admin, caller.uid, body);
    case "deactivate":     return handleDeactivate(admin, caller.uid, body);
    case "activate":       return handleActivate(admin, caller.uid, body);
    default:               return json({ error: `unknown op: ${op}` }, 400);
  }
});
