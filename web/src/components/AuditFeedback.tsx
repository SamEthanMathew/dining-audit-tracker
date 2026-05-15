import type { Audit, Recommendation } from "../lib/api";
import { STREAM_LABELS } from "../lib/grades";
import GradeBadge from "./GradeBadge";

export default function AuditFeedback({ audit, recommendations }: { audit: Audit; recommendations: Recommendation[] }) {
  const grades = (audit.computed_grades ?? {}) as Record<string, string>;
  return (
    <div className="space-y-6">
      <div className="card p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">Audit submitted</h2>
          <div className="text-right">
            <div className="text-3xl font-bold">{audit.computed_score?.toFixed(0)}</div>
            <div className="text-xs text-slate-500">overall score (0–100)</div>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="text-lg font-semibold mb-3">Per-stream grades</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(["landfill", "bottles_cans", "compost", "cardboard"] as const).map((s) => (
            <div key={s} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200">
              <GradeBadge grade={grades[s]} />
              <div>
                <div className="text-sm font-medium">{STREAM_LABELS[s]}</div>
                <div className="text-xs text-slate-500">{contamPct(audit, s)}% contamination</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <h3 className="text-lg font-semibold mb-3">Recommendations</h3>
        {recommendations.length === 0 ? (
          <p className="text-emerald-700">Great audit — no specific recommendations to surface.</p>
        ) : (
          <ul className="space-y-3">
            {recommendations.map((r) => (
              <li key={r.id} className="border-l-4 border-cmu pl-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  {STREAM_LABELS[r.stream]} · {r.failure_mode.replace(/_/g, " ")}
                </div>
                <div className="text-sm">{r.recommendation_text}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function contamPct(a: Audit, s: "landfill" | "bottles_cans" | "compost" | "cardboard"): string {
  const total  = (a as any)[`${s}_total`] as number;
  const contam = (a as any)[`${s}_contamination`] as number;
  if (!total) return "0.0";
  return ((contam / total) * 100).toFixed(1);
}
