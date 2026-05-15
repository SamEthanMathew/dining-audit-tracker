import { useState } from "react";
import AuditForm from "../../components/AuditForm";
import type { AuditFormValues } from "../../components/AuditForm";
import AuditFeedback from "../../components/AuditFeedback";
import { submitAudit } from "../../lib/api";
import type { SubmitAuditResult } from "../../lib/api";
import { flatten } from "../Audit";

export default function AdminNewAudit() {
  const [result, setResult] = useState<SubmitAuditResult | null>(null);

  async function handle(values: AuditFormValues) {
    const res = await submitAudit(flatten(values));
    setResult(res);
  }

  return (
    <div className="space-y-6">
      {!result ? (
        <>
          <header>
            <h1 className="text-2xl font-semibold">Submit admin audit</h1>
            <p className="text-slate-600 text-sm">
              Admin audits are weighted at 90% by default. Select any location.
            </p>
          </header>
          <AuditForm onSubmit={handle} />
        </>
      ) : (
        <>
          <AuditFeedback audit={result.audit} recommendations={result.recommendations} />
          <button className="btn-ghost" onClick={() => setResult(null)}>Submit another</button>
        </>
      )}
    </div>
  );
}
