import { useState } from "react";
import { Link } from "react-router-dom";
import SimpleAuditForm from "../components/SimpleAuditForm";
import AuditFeedback from "../components/AuditFeedback";
import { submitAudit, triggerEmail } from "../lib/api";
import type { SubmitAuditPayload, SubmitAuditResult } from "../lib/api";

export default function PublicSubmit() {
  const [result, setResult] = useState<SubmitAuditResult | null>(null);

  async function handle(payload: SubmitAuditPayload) {
    const res = await submitAudit(payload);
    triggerEmail(res.audit.id);
    setResult(res);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-cmu text-white border-b border-cmu-dark">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <div className="font-semibold tracking-tight">CMU Dining — Waste Audit</div>
            <div className="text-xs text-white/80">Back-of-house dustbin check</div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link to="/leaderboard" className="text-white/80 hover:text-white underline-offset-4 hover:underline">Leaderboard</Link>
            <Link to="/login" className="text-white/80 hover:text-white underline-offset-4 hover:underline">Admin sign in</Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {result ? (
          <div className="space-y-6">
            <AuditFeedback audit={result.audit} recommendations={result.recommendations} />
            <div className="flex justify-between">
              <Link to="/leaderboard" className="btn-ghost">See leaderboard</Link>
              <button className="btn-primary" onClick={() => setResult(null)}>Submit another audit</button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-semibold">Submit a waste audit</h1>
              <p className="text-slate-600 text-sm">
                Pick the location you're auditing, fill in your name, and answer a few yes/no questions for each bin.
                Takes about 5–10 minutes including photos.
              </p>
            </div>
            <SimpleAuditForm isAdmin={false} onSubmit={handle} />
          </>
        )}
      </main>

      <footer className="max-w-3xl mx-auto px-4 py-8 text-xs text-slate-400 text-center">
        CMU Dining Waste Audit Tracker · audits are reviewed by the Dining &amp; Sustainability team
      </footer>
    </div>
  );
}
