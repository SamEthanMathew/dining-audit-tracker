import { useEffect, useState } from "react";
import type { Audit } from "../lib/api";
import { listMyAudits } from "../lib/api";
import GradeBadge from "../components/GradeBadge";
import { STREAM_LABELS } from "../lib/grades";

export default function MyAudits() {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Audit | null>(null);

  useEffect(() => {
    listMyAudits().then(setAudits).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (audits.length === 0) return <p className="text-slate-500">No audits submitted yet.</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">My audits</h1>
      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Score</th>
              <th className="text-left px-3 py-2">Landfill</th>
              <th className="text-left px-3 py-2">Bottles & Cans</th>
              <th className="text-left px-3 py-2">Compost</th>
              <th className="text-left px-3 py-2">Cardboard</th>
              <th className="text-left px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {audits.map((a) => {
              const g = (a.computed_grades ?? {}) as Record<string, string>;
              return (
                <tr key={a.id} className="border-t border-slate-200 hover:bg-slate-50 cursor-pointer" onClick={() => setOpen(a)}>
                  <td className="px-3 py-2">{a.audit_date}</td>
                  <td className="px-3 py-2 font-semibold">{a.computed_score?.toFixed(0)}</td>
                  <td className="px-3 py-2"><GradeBadge grade={g.landfill} /></td>
                  <td className="px-3 py-2"><GradeBadge grade={g.bottles_cans} /></td>
                  <td className="px-3 py-2"><GradeBadge grade={g.compost} /></td>
                  <td className="px-3 py-2"><GradeBadge grade={g.cardboard} /></td>
                  <td className="px-3 py-2 text-xs">
                    {a.nullified ? <span className="text-red-700">nullified</span> : "active"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/40 z-10 flex items-center justify-center p-4" onClick={() => setOpen(null)}>
          <div className="card max-w-2xl w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold">Audit detail — {open.audit_date}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              {(["landfill", "bottles_cans", "compost", "cardboard"] as const).map((s) => {
                const total = (open as any)[`${s}_total`] as number;
                const contam = (open as any)[`${s}_contamination`] as number;
                const g = ((open.computed_grades ?? {}) as Record<string, string>)[s];
                return (
                  <div key={s} className="p-2 rounded border border-slate-200">
                    <div className="font-medium">{STREAM_LABELS[s]}</div>
                    <div className="text-xs text-slate-500">
                      {contam} / {total} ({total ? ((contam / total) * 100).toFixed(1) : "0"}%)
                    </div>
                    <div className="mt-1"><GradeBadge grade={g} /></div>
                  </div>
                );
              })}
            </div>
            {open.general_comments && (
              <p className="text-sm text-slate-700 italic">"{open.general_comments}"</p>
            )}
            {open.nullified && (
              <div className="text-sm text-red-700">
                Nullified: {open.nullified_reason}
              </div>
            )}
            <div className="flex justify-end">
              <button className="btn-ghost" onClick={() => setOpen(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
