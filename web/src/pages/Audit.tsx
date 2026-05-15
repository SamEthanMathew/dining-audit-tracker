import { useState } from "react";
import AuditForm from "../components/AuditForm";
import type { AuditFormValues } from "../components/AuditForm";
import AuditFeedback from "../components/AuditFeedback";
import { submitAudit } from "../lib/api";
import type { SubmitAuditResult } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function Audit() {
  const { profile } = useAuth();
  const [result, setResult] = useState<SubmitAuditResult | null>(null);

  async function handle(values: AuditFormValues) {
    const payload = flatten(values);
    try {
      const res = await submitAudit(payload);
      setResult(res);
    } catch (e: any) {
      if (e.message === "already_submitted_this_week") {
        throw new Error("You already submitted an audit for this week. Contact an admin if a correction is needed.");
      }
      throw e;
    }
  }

  return (
    <div className="space-y-6">
      {!result ? (
        <>
          <header>
            <h1 className="text-2xl font-semibold">Submit weekly audit</h1>
            <p className="text-slate-600 text-sm">
              You can submit one audit per calendar week for your location. Be specific in the contamination counts —
              it directly affects recommendations.
            </p>
          </header>
          <AuditForm
            defaultLocationId={profile?.location_id ?? undefined}
            lockLocation
            onSubmit={handle}
          />
        </>
      ) : (
        <>
          <AuditFeedback audit={result.audit} recommendations={result.recommendations} />
          <button className="btn-ghost" onClick={() => setResult(null)}>
            Back
          </button>
        </>
      )}
    </div>
  );
}

export function flatten(v: AuditFormValues) {
  return {
    location_id: v.location_id,
    audit_date: v.audit_date,
    landfill_total: Number(v.landfill.total),
    landfill_contamination: Number(v.landfill.contamination),
    landfill_notes: v.landfill.notes,
    bottles_cans_total: Number(v.bottles_cans.total),
    bottles_cans_contamination: Number(v.bottles_cans.contamination),
    bottles_cans_food_present: !!v.bottles_cans.food_present,
    bottles_cans_notes: v.bottles_cans.notes,
    compost_total: Number(v.compost.total),
    compost_contamination: Number(v.compost.contamination),
    compost_notes: v.compost.notes,
    cardboard_total: Number(v.cardboard.total),
    cardboard_contamination: Number(v.cardboard.contamination),
    cardboard_notes: v.cardboard.notes,
    general_comments: v.general_comments,
  };
}
