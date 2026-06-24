import { useEffect, useState } from "react";
import { listAllAuditsForAdmin, listLocations, nullifyAudit } from "../../lib/api";
import type { Audit, Location } from "../../lib/api";
import GradeBadge from "../../components/GradeBadge";
import AuditDetailView from "../../components/AuditDetailView";
import { STREAM_LABELS } from "../../lib/grades";
import { supabase } from "../../lib/supabase";

export default function AdminAudits() {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({});
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
      // Fetch photo counts per audit for the rendered list
      const ids = a.map((x) => x.id);
      if (ids.length > 0) {
        const { data: photoRows } = await supabase
          .from("audit_photos")
          .select("audit_id")
          .in("audit_id", ids);
        const counts: Record<string, number> = {};
        for (const r of photoRows ?? []) counts[r.audit_id] = (counts[r.audit_id] ?? 0) + 1;
        setPhotoCounts(counts);
      } else {
        setPhotoCounts({});
      }
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
              <th className="text-left px-3 py-2">Submitter</th>
              <th className="text-left px-3 py-2">Score</th>
              {(["landfill", "bottles_cans", "compost", "cardboard"] as const).map((s) => (
                <th key={s} className="text-left px-3 py-2">{STREAM_LABELS[s]}</th>
              ))}
              <th className="text-left px-3 py-2">📷</th>
              <th className="text-left px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {audits.map((a) => {
              const g = (a.computed_grades ?? {}) as Record<string, string>;
              const photoCount = photoCounts[a.id] ?? 0;
              return (
                <tr key={a.id} className="border-t border-slate-200 hover:bg-slate-50 cursor-pointer" onClick={() => setOpen(a)}>
                  <td className="px-3 py-2 whitespace-nowrap">{a.audit_date}</td>
                  <td className="px-3 py-2">{locName(a.location_id)}</td>
                  <td className="px-3 py-2 text-xs">
                    <div className="font-medium">{a.submitter_name || "(no name)"}</div>
                    <div className="text-slate-500">{a.audit_form_mode} · {a.submitted_by_role}</div>
                  </td>
                  <td className="px-3 py-2 font-semibold">{a.computed_score?.toFixed(0)}</td>
                  <td className="px-3 py-2"><GradeBadge grade={g.landfill} /></td>
                  <td className="px-3 py-2"><GradeBadge grade={g.bottles_cans} /></td>
                  <td className="px-3 py-2"><GradeBadge grade={g.compost} /></td>
                  <td className="px-3 py-2"><GradeBadge grade={g.cardboard} /></td>
                  <td className="px-3 py-2 text-xs">
                    {photoCount > 0
                      ? <span className="font-medium text-cmu">{photoCount}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">{a.nullified ? <span className="text-red-700">nullified</span> : "active"}</td>
                </tr>
              );
            })}
            {audits.length === 0 && !loading && (
              <tr><td colSpan={10} className="px-3 py-6 text-center text-slate-500">No audits match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/40 z-10 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto" onClick={() => setOpen(null)}>
          <div className="card max-w-3xl w-full my-2 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <AuditDetailView audit={open} location={locations.find(l => l.id === open.location_id)} />
            <div className="flex justify-between pt-3 border-t border-slate-200">
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
