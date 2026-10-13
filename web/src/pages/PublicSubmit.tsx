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
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-cmu text-white border-b border-cmu-dark pt-safe">
        <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold tracking-tight leading-tight truncate">CMU Dining — Waste Audit</div>
            <div className="text-[11px] text-white/70 leading-tight">Back-of-house dustbin check</div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Link
              to="/leaderboard"
              className="min-h-10 px-2.5 flex items-center rounded-lg text-xs font-semibold text-white/85 hover:bg-white/10 active:bg-white/15"
            >
              Leaderboard
            </Link>
            <Link
              to="/login"
              className="min-h-10 px-2.5 flex items-center rounded-lg text-xs font-semibold text-white/85 hover:bg-white/10 active:bg-white/15"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-5 sm:py-6">
        {result ? (
          <div className="space-y-6">
            <AuditFeedback audit={result.audit} recommendations={result.recommendations} />
            <div className="flex flex-col sm:flex-row sm:justify-between gap-2">
              <button className="btn-primary sm:order-2" onClick={() => setResult(null)}>Submit another audit</button>
              <Link to="/leaderboard" className="btn-ghost sm:order-1">See leaderboard</Link>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-5">
              <h1 className="text-xl sm:text-2xl font-semibold">Submit a waste audit</h1>
              <p className="text-slate-600 text-sm mt-1">
                Pick the location you're auditing, add your name, then answer a few yes/no questions for each bin.
                Photos are optional. Takes about 5–10 minutes.
              </p>
            </div>
            <SimpleAuditForm isAdmin={false} onSubmit={handle} />
          </>
        )}
      </main>

      <footer className="max-w-3xl mx-auto px-4 py-6 text-xs text-slate-400 text-center pb-safe">
        CMU Dining Waste Audit Tracker · audits are reviewed by the Dining &amp; Sustainability team
      </footer>
    </div>
  );
}
