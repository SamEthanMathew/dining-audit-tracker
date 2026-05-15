import { supabase } from "./supabase";
import type { Tables, Json } from "../types/db";

export type Recommendation = Tables<"recommendations">;
export type Audit = Tables<"audits">;
export type Settings = Tables<"settings">;
export type Location = Tables<"locations">;
export type User = Tables<"users">;

export type SubmitAuditPayload = {
  location_id?: string;
  audit_date?: string;
  audit_mode?: "count" | "weight";
  landfill_total: number;
  landfill_contamination: number;
  landfill_notes?: string;
  bottles_cans_total: number;
  bottles_cans_contamination: number;
  bottles_cans_food_present: boolean;
  bottles_cans_notes?: string;
  compost_total: number;
  compost_contamination: number;
  compost_notes?: string;
  cardboard_total: number;
  cardboard_contamination: number;
  cardboard_notes?: string;
  general_comments?: string;
};

export type SubmitAuditResult = {
  audit: Audit;
  recommendations: Recommendation[];
};

export async function submitAudit(payload: SubmitAuditPayload): Promise<SubmitAuditResult> {
  const { data, error } = await supabase.rpc("submit_audit", { payload: payload as unknown as Json });
  if (error) {
    if (error.message?.includes("already_submitted_this_week")) {
      throw new Error("already_submitted_this_week");
    }
    throw new Error(error.message);
  }
  return data as unknown as SubmitAuditResult;
}

export async function listMyAudits(): Promise<Audit[]> {
  const { data, error } = await supabase
    .from("audits")
    .select("*")
    .order("audit_date", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listAllAuditsForAdmin(filters: {
  locationId?: string;
  fromDate?: string;
  toDate?: string;
  role?: "rep" | "admin";
}): Promise<Audit[]> {
  let q = supabase.from("audits").select("*").order("audit_date", { ascending: false });
  if (filters.locationId) q = q.eq("location_id", filters.locationId);
  if (filters.fromDate)   q = q.gte("audit_date", filters.fromDate);
  if (filters.toDate)     q = q.lte("audit_date", filters.toDate);
  if (filters.role)       q = q.eq("submitted_by_role", filters.role);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchLeaderboard() {
  const { data, error } = await supabase.rpc("leaderboard");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchAdminLeaderboard() {
  const { data, error } = await supabase.rpc("admin_leaderboard");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listLocations(activeOnly = true): Promise<Location[]> {
  let q = supabase.from("locations").select("*").order("name");
  if (activeOnly) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listRecommendations(): Promise<Recommendation[]> {
  const { data, error } = await supabase
    .from("recommendations")
    .select("*")
    .order("stream")
    .order("failure_mode");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertRecommendation(payload: Partial<Recommendation>): Promise<Recommendation> {
  const { data, error } = await supabase.rpc("upsert_recommendation", { payload: payload as unknown as Json });
  if (error) throw new Error(error.message);
  return data as Recommendation;
}

export async function fetchSettings(): Promise<Settings> {
  const { data, error } = await supabase.from("settings").select("*").limit(1).single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateSettings(payload: Partial<Settings>): Promise<Settings> {
  const { data, error } = await supabase.rpc("update_settings", { payload: payload as unknown as Json });
  if (error) throw new Error(error.message);
  return data as Settings;
}

export async function nullifyAudit(auditId: string, reason: string): Promise<Audit> {
  const { data, error } = await supabase.rpc("nullify_audit", {
    audit_id: auditId,
    reason,
  });
  if (error) throw new Error(error.message);
  return data as Audit;
}

export async function fetchAdminDashboard(): Promise<{
  locations: { id: string; name: string; audits_this_week: number; missing_this_week: boolean }[];
  recent_nullifications: { id: string; location_id: string; nullified_reason: string | null; nullified_at: string | null; nullified_by: string | null }[];
  recent_settings_changes: { id: string; table_name: string; changed_by: string | null; created_at: string }[];
}> {
  const { data, error } = await supabase.rpc("admin_dashboard_summary");
  if (error) throw new Error(error.message);
  return data as never;
}

export async function listUsers(): Promise<User[]> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listAccessLogs(limit = 200) {
  const { data, error } = await supabase
    .from("access_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listSettingsAuditLog(limit = 200) {
  const { data, error } = await supabase
    .from("settings_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

type AdminUserMgmtOp =
  | { op: "create"; email: string; full_name?: string; role: "rep" | "admin"; location_id?: string }
  | { op: "update"; user_id: string; full_name?: string; role?: "rep" | "admin"; location_id?: string | null; active?: boolean }
  | { op: "reset_password"; user_id: string }
  | { op: "deactivate"; user_id: string }
  | { op: "activate"; user_id: string };

export async function callAdminUserMgmt(payload: AdminUserMgmtOp): Promise<any> {
  const { data, error } = await supabase.functions.invoke("admin_user_mgmt", { body: payload });
  if (error) {
    const msg = (data && (data as any).error) || error.message;
    throw new Error(msg);
  }
  return data;
}
