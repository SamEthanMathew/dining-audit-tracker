// send_audit_email — drain pending rows from public.email_outbox via Resend.
//
// Trigger: invoked by the frontend right after submit_audit succeeds, with
//   { audit_id: <uuid> }, processes the matching pending rows.
// Also safe to call with no body to drain the whole queue (retry path).
//
// Service-role key reads:
//   - app.secrets where key = 'resend_api_key'   (the Resend API key)
//   - public.email_outbox (pending rows)
//   - public.audits joined to locations + users  (to render the body)
// then PATCHes the outbox row to sent/failed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

type OutboxRow = {
  id: string;
  audit_id: string | null;
  to_emails: string[];
  cc_emails: string[] | null;
  subject: string;
  html: string;
  attempts: number;
};

async function getResendKey(admin: ReturnType<typeof createClient>): Promise<string> {
  const { data, error } = await admin.from("app_secrets").select("value").eq("key", "resend_api_key").maybeSingle();
  if (error) throw new Error(`secret lookup: ${error.message}`);
  if (!data?.value) throw new Error("resend_api_key not set in app_secrets");
  return data.value;
}

const STREAM_LABEL: Record<string, string> = {
  landfill: "Landfill",
  bottles_cans: "Bottles & Cans",
  compost: "Compost",
  cardboard: "Cardboard",
};

function gradeColor(grade: string | null | undefined): string {
  switch (grade) {
    case "A": return "#059669";
    case "B": return "#65a30d";
    case "C": return "#d97706";
    case "D": return "#ea580c";
    case "F": return "#dc2626";
    default:  return "#64748b";
  }
}

function renderHtml(audit: any, location: any, submitter: any): string {
  const grades: Record<string, string> = audit.computed_grades ?? {};
  const score = audit.computed_score != null ? Number(audit.computed_score).toFixed(1) : "—";

  const streamRows = (["landfill", "bottles_cans", "compost", "cardboard"] as const).map((s) => {
    const g = grades[s] ?? "—";
    return `<tr>
      <td style="padding:8px 12px;border-top:1px solid #e2e8f0;">${STREAM_LABEL[s]}</td>
      <td style="padding:8px 12px;border-top:1px solid #e2e8f0;text-align:right;">
        <span style="display:inline-block;width:28px;height:28px;line-height:28px;border-radius:9999px;background:${gradeColor(g)};color:#fff;font-weight:700;text-align:center;">${g}</span>
      </td>
    </tr>`;
  }).join("");

  const surveyRow = (label: string, value: boolean | null | undefined) =>
    value === null || value === undefined
      ? ""
      : `<li>${label}: <strong>${value ? "Yes" : "No"}</strong></li>`;

  const survey = [
    surveyRow("Donates to Forinto food rescue", audit.donates_forinto),
    surveyRow("Donates to CMU food pantry", audit.donates_cmu_food_pantry),
    surveyRow("Has reuse program", audit.reuse_program),
    surveyRow("Energy conservation plan", audit.energy_conservation_plan),
    surveyRow("Water conservation plan", audit.water_conservation_plan),
  ].filter(Boolean).join("");

  return `<!doctype html>
<html><body style="font-family:ui-sans-serif,system-ui,sans-serif;color:#0f172a;max-width:640px;margin:0 auto;padding:24px;">
  <h2 style="margin:0 0 8px;color:#0b8a3e;">Dining Audit submitted — ${location?.name ?? "—"}</h2>
  <p style="color:#475569;margin:0 0 24px;">
    ${audit.audit_date}
    · audit mode: <strong>${audit.audit_form_mode}</strong>
    · submitted by <strong>${audit.submitter_name ?? "—"}</strong>
    ${audit.is_sustainability_champion ? " · <em>(sustainability champion at this location)</em>" : ""}
    ${audit.done_by_dining_team ? " · <em>(dining &amp; sustainability team audit)</em>" : ""}
  </p>

  <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;">
    <div style="font-size:36px;font-weight:800;">${score}</div>
    <div style="color:#475569;font-size:14px;">overall score (0–100)</div>
  </div>

  <h3 style="margin:24px 0 8px;">Per-stream grades</h3>
  <table style="width:100%;border-collapse:collapse;">${streamRows}</table>

  ${survey ? `<h3 style="margin:24px 0 8px;">Sustainability programs</h3><ul style="color:#334155;line-height:1.6;">${survey}</ul>` : ""}

  ${audit.general_comments ? `<h3 style="margin:24px 0 8px;">General comments</h3><blockquote style="border-left:3px solid #cbd5e1;padding:4px 12px;color:#475569;margin:0;">${escapeHtml(audit.general_comments)}</blockquote>` : ""}

  <p style="color:#94a3b8;margin-top:32px;font-size:12px;">
    Submitted via the CMU Dining Waste Audit Tracker · login at https://dining-audit-tracker.vercel.app
  </p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

async function processRow(
  admin: ReturnType<typeof createClient>,
  row: OutboxRow,
  resendKey: string
): Promise<{ ok: boolean; error?: string }> {
  // Hydrate audit data if html is empty (we render server-side here so the SQL stays simple)
  let html = row.html;
  if (!html && row.audit_id) {
    const { data: audit, error: aErr } = await admin
      .from("audits")
      .select("*, locations!audits_location_id_fkey(name), users!audits_submitted_by_fkey(full_name, email)")
      .eq("id", row.audit_id)
      .maybeSingle();
    if (aErr || !audit) {
      return { ok: false, error: aErr?.message ?? "audit not found" };
    }
    const loc = (audit as any).locations ?? null;
    const sub = (audit as any).users ?? null;
    html = renderHtml(audit, loc, sub);
  }

  const recipients = row.to_emails.filter((e) => !!e);
  if (recipients.length === 0 && (!row.cc_emails || row.cc_emails.length === 0)) {
    // Nothing to send. Mark sent (no-op) to avoid retry storms.
    await admin.from("email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), html, last_error: "no recipients" }).eq("id", row.id);
    return { ok: true };
  }

  const body = {
    from: "CMU Dining Audits <onboarding@resend.dev>",
    to: recipients.length > 0 ? recipients : (row.cc_emails ?? []),
    cc: recipients.length > 0 ? (row.cc_emails ?? []) : undefined,
    subject: row.subject,
    html,
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    await admin.from("email_outbox").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      html,
      attempts: row.attempts + 1,
    }).eq("id", row.id);
    return { ok: true };
  } else {
    const text = await res.text();
    await admin.from("email_outbox").update({
      status: row.attempts + 1 >= 3 ? "failed" : "pending",
      attempts: row.attempts + 1,
      last_error: `${res.status}: ${text.slice(0, 500)}`,
    }).eq("id", row.id);
    return { ok: false, error: `${res.status}: ${text.slice(0, 300)}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return json({ error: "method not allowed" }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body OK */ }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let resendKey: string;
  try { resendKey = await getResendKey(admin); }
  catch (e) { return json({ error: (e as Error).message }, 500); }

  let q = admin.from("email_outbox").select("id, audit_id, to_emails, cc_emails, subject, html, attempts").eq("status", "pending");
  if (body?.audit_id) q = q.eq("audit_id", body.audit_id);
  q = q.order("created_at", { ascending: true }).limit(25);

  const { data: rows, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const results: any[] = [];
  for (const row of rows ?? []) {
    const r = await processRow(admin, row as OutboxRow, resendKey);
    results.push({ id: row.id, ...r });
  }

  return json({ processed: results.length, results });
});
