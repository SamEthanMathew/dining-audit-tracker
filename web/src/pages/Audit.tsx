import { useEffect, useState } from "react";
import SimpleAuditForm from "../components/SimpleAuditForm";
import DetailedAuditForm from "../components/DetailedAuditForm";
import AuditFeedback from "../components/AuditFeedback";
import { fetchSettings, submitAudit, triggerEmail } from "../lib/api";
import type { Settings, SubmitAuditPayload, SubmitAuditResult } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function Audit() {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [result, setResult] = useState<SubmitAuditResult | null>(null);

  useEffect(() => { fetchSettings().then(setSettings).catch(console.error); }, []);

  async function handle(payload: SubmitAuditPayload) {
    try {
      const res = await submitAudit(payload);
      triggerEmail(res.audit.id);
      setResult(res);
    } catch (e: any) {
      if (e.message === "already_submitted_this_week") {
        throw new Error("You already submitted an audit for this week. Contact an admin if a correction is needed.");
      }
      throw e;
    }
  }

  if (!settings) return <p className="text-slate-500">Loading…</p>;

  if (result) {
    return (
      <div className="space-y-6">
        <AuditFeedback audit={result.audit} recommendations={result.recommendations} />
        <button className="btn-ghost" onClick={() => setResult(null)}>Back</button>
      </div>
    );
  }

  const mode = settings.audit_form_mode_for_reps;
  const props = {
    defaultLocationId: profile?.location_id ?? undefined,
    lockLocation: true,
    isAdmin: false,
    defaultSubmitterName: profile?.full_name ?? "",
    onSubmit: handle,
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Submit weekly audit</h1>
        <p className="text-slate-600 text-sm">One submission per calendar week for your location.</p>
      </header>
      {mode === "simple" ? <SimpleAuditForm {...props} /> : <DetailedAuditForm {...props} />}
    </div>
  );
}
