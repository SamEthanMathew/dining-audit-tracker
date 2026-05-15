import { useEffect, useState } from "react";
import { listAllAuditsForAdmin, listLocations, nullifyAudit } from "../../lib/api";
import type { Audit, Location } from "../../lib/api";
import GradeBadge from "../../components/GradeBadge";
import { STREAM_LABELS } from "../../lib/grades";

export default function AdminAudits() {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [filters, setFilters] = useState<{ locationId?: string; fromDate?: string; toDate?: string; role?: "rep" | "admin" }>({});
  const [open, setOpen] = useState<Audit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    try {
      const [a, l] = await Promise.all([listAllAuditsForAdmin(filters), listLocations(false)]);
      setAudits(a);
      setLocations(l);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function locName(id: string) {
    return locations.find((l) => l.id === id)?.name ?? id.slice(0, 8);
  }

  async function handleNullify() {
    if (!open) return;
    const reason = window.prompt("Nullification reason (required):");
    if (!reason) return;
    try {
      const updated = await nullifyAudit(open.id, reason);
      setAudits((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setOpen(updated);
    } catch (e: any) {
      alert(e.message);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Audit log</h1>

      <div className="card p-3 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">Location</label>
          <select className="input" value={filters.locationId ?? ""} onChange={(e) => setFilters({ ...filters, locationId: e.target.value || undefined })}>
            <option value="">All</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input className="input" type="date" value={filters.fromDate ?? ""} onChange={(e) => setFilters({ ...filters, fromDate: e.target.value || undefined })} />
        </div>
        <div>
          <label className="label">To</label>
          <input className="input" type="date" value={filters.toDate ?? ""} onChange={(e) => setFilters({ ...filters, toDate: e.target.value || undefined })} />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={filters.role ?? ""} onChange={(e) => setFilters({ ...filters, role: (e.target.value || undefined) as any })}>
            <option value="">All</option>
            <option value="rep">Rep</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button className="btn-primary" onClick={reload} disabled={loading}>{loading ? "Loading…" : "Apply"}</button>
      </div>

      {error && <p className="text-red-600">{error}</p>}

      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Location</th>
              <th className="text-left px-3 py-2">Role</th>
              <th className="text-left px-3 py-2">Score</th>
              {(["landfill", "bottles_cans", "compost", "cardboard"] as const).map((s) => (
                <th key={s} className="text-left px-3 py-2">{STREAM_LABELS[s]}</th>
              ))}
              <th className="text-left px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {audits.map((a) => {
              const g = (a.computed_grades ?? {}) as Record<string, string>;
              return (
                <tr key={a.id} className="border-t border-slate-200 hover:bg-slate-50 cursor-pointer" onClick={() => setOpen(a)}>
                  <td className="px-3 py-2">{a.audit_date}</td>
                  <td className="px-3 py-2">{locName(a.location_id)}</td>
                  <td className="px-3 py-2">{a.submitted_by_role}</td>
                  <td className="px-3 py-2 font-semibold">{a.computed_score?.toFixed(0)}</td>
                  <td className="px-3 py-2"><GradeBadge grade={g.landfill} /></td>
                  <td className="px-3 py-2"><GradeBadge grade={g.bottles_cans} /></td>
                  <td className="px-3 py-2"><GradeBadge grade={g.compost} /></td>
                  <td className="px-3 py-2"><GradeBadge grade={g.cardboard} /></td>
                  <td className="px-3 py-2 text-xs">{a.nullified ? <span className="text-red-700">nullified</span> : "active"}</td>
                </tr>
              );
            })}
            {audits.length === 0 && !loading && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-500">No audits match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/40 z-10 flex items-center justify-center p-4" onClick={() => setOpen(null)}>
          <div className="card max-w-2xl w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold">Audit detail — {open.audit_date} · {locName(open.location_id)}</h2>
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
              <div className="text-sm text-red-700">Nullified: {open.nullified_reason}</div>
            )}
            <div className="flex justify-between">
              {!open.nullified && (
                <button className="text-red-700 hover:underline text-sm" onClick={handleNullify}>
                  Nullify this audit
                </button>
              )}
              <button className="btn-ghost ml-auto" onClick={() => setOpen(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
