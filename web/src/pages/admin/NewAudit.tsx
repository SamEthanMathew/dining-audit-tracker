import { useState } from "react";
import SimpleAuditForm from "../../components/SimpleAuditForm";
import DetailedAuditForm from "../../components/DetailedAuditForm";
import AuditFeedback from "../../components/AuditFeedback";
import { submitAudit, triggerEmail } from "../../lib/api";
import type { SubmitAuditPayload, SubmitAuditResult } from "../../lib/api";
import { useAuth } from "../../lib/auth";

export default function AdminNewAudit() {
  const { profile } = useAuth();
  const [mode, setMode] = useState<"simple" | "detailed">("simple");
  const [result, setResult] = useState<SubmitAuditResult | null>(null);

  async function handle(payload: SubmitAuditPayload) {
    const res = await submitAudit(payload);
    triggerEmail(res.audit.id);
    setResult(res);
  }

  if (result) {
    return (
      <div className="space-y-6">
        <AuditFeedback audit={result.audit} recommendations={result.recommendations} />
        <button className="btn-ghost" onClick={() => setResult(null)}>Submit another</button>
      </div>
    );
  }

  const formProps = {
    isAdmin: true,
    defaultSubmitterName: profile?.full_name ?? "",
    onSubmit: handle,
  };

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Submit admin audit</h1>
          <p className="text-slate-600 text-sm">Admin audits are weighted at 90% by default.</p>
        </div>
        <div className="inline-flex rounded-md border border-slate-300 overflow-hidden text-sm">
          <button
            className={"px-3 py-1.5 " + (mode === "simple" ? "bg-cmu text-white" : "bg-white hover:bg-slate-50")}
            onClick={() => setMode("simple")}
            type="button"
          >Simple</button>
          <button
            className={"px-3 py-1.5 " + (mode === "detailed" ? "bg-cmu text-white" : "bg-white hover:bg-slate-50")}
            onClick={() => setMode("detailed")}
            type="button"
          >Detailed</button>
        </div>
      </header>

      {mode === "simple" ? <SimpleAuditForm {...formProps} /> : <DetailedAuditForm {...formProps} />}
    </div>
  );
}
