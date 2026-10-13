import { useEffect, useMemo, useState } from "react";
import { listAllAuditsForAdmin, listLocations, nullifyAudit, friendlyError } from "../../lib/api";
import type { Audit, Location } from "../../lib/api";
import GradeBadge from "../../components/GradeBadge";
import AuditDetailView from "../../components/AuditDetailView";
import { STREAM_LABELS } from "../../lib/grades";
import { supabase } from "../../lib/supabase";

type Filters = { locationId?: string; fromDate?: string; toDate?: string; role?: "rep" | "admin" };

const STREAMS = ["landfill", "bottles_cans", "compost", "cardboard"] as const;

export default function AdminAudits() {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({});
  const [filters, setFilters] = useState<Filters>({});
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [open, setOpen] = useState<Audit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function reload(next: Filters = filters) {
    setLoading(true);
    setError(null);
    try {
      const [a, l] = await Promise.all([listAllAuditsForAdmin(next), listLocations(false)]);
      setAudits(a);
      setLocations(l);
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
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function locName(id: string) {
    return locations.find((l) => l.id === id)?.name ?? id.slice(0, 8);
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return audits;
    return audits.filter((a) =>
      (a.submitter_name ?? "").toLowerCase().includes(q) ||
      locName(a.location_id).toLowerCase().includes(q) ||
      a.audit_date.includes(q)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audits, search, locations]);

  const totalPhotos = useMemo(
    () => visible.reduce((n, a) => n + (photoCounts[a.id] ?? 0), 0),
    [visible, photoCounts]
  );

  async function handleNullify() {
    if (!open) return;
    const reason = window.prompt("Nullification reason (required):");
    if (!reason) return;
    try {
      const updated = await nullifyAudit(open.id, reason);
      setAudits((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setOpen(updated);
    } catch (e: any) {
      alert(friendlyError(e));
    }
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-semibold">Audit log</h1>
        <span className="text-xs text-slate-500 shrink-0">
          {visible.length} audit{visible.length === 1 ? "" : "s"} · {totalPhotos} photo{totalPhotos === 1 ? "" : "s"}
        </span>
      </div>

      <div className="card p-3 space-y-3">
        <div className="flex gap-2">
          <input
            className="input"
            type="search"
            inputMode="search"
            placeholder="Search name, location, date…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="button"
            className="btn-ghost shrink-0"
            onClick={() => setShowFilters((s) => !s)}
            aria-expanded={showFilters}
          >
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 border-t border-slate-100">
            <div>
              <label className="label">Location</label>
              <select
                className="input"
                value={filters.locationId ?? ""}
                onChange={(e) => setFilters({ ...filters, locationId: e.target.value || undefined })}
              >
                <option value="">All</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">From</label>
              <input className="input" type="date" value={filters.fromDate ?? ""}
                onChange={(e) => setFilters({ ...filters, fromDate: e.target.value || undefined })} />
            </div>
            <div>
              <label className="label">To</label>
              <input className="input" type="date" value={filters.toDate ?? ""}
                onChange={(e) => setFilters({ ...filters, toDate: e.target.value || undefined })} />
            </div>
            <div>
              <label className="label">Submitted by</label>
              <select
                className="input"
                value={filters.role ?? ""}
                onChange={(e) => setFilters({ ...filters, role: (e.target.value || undefined) as any })}
              >
                <option value="">All roles</option>
                <option value="rep">Rep</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-4 flex gap-2">
              <button className="btn-primary flex-1 sm:flex-none" onClick={() => reload()} disabled={loading}>
                {loading ? "Loading…" : "Apply filters"}
              </button>
              <button
                className="btn-ghost flex-1 sm:flex-none"
                onClick={() => { setFilters({}); reload({}); }}
                disabled={loading}
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {/* Phone: cards. Desktop: table. */}
      <ul className="space-y-2 lg:hidden">
        {visible.map((a) => {
          const g = (a.computed_grades ?? {}) as Record<string, string>;
          const photoCount = photoCounts[a.id] ?? 0;
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setOpen(a)}
                className="card w-full p-3 text-left active:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold leading-tight truncate">{locName(a.location_id)}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {a.audit_date} · {a.submitter_name || "(no name)"}
                    </div>
                    <div className="text-xs text-slate-400">
                      {a.audit_form_mode} · {a.submitted_by_role}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl font-bold tabular-nums leading-none">
                      {a.computed_score?.toFixed(0) ?? "—"}
                    </div>
                    {a.nullified
                      ? <div className="text-[11px] font-semibold text-red-700 mt-1">nullified</div>
                      : <div className="text-[11px] text-slate-400 mt-1">score</div>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                  {STREAMS.map((s) => (
                    <span key={s} className="flex items-center gap-1" title={STREAM_LABELS[s]}>
                      <GradeBadge grade={g[s]} />
                    </span>
                  ))}
                  <span className="ml-auto chip">📷 {photoCount}</span>
                </div>
              </button>
            </li>
          );
        })}
        {visible.length === 0 && !loading && (
          <li className="card p-6 text-center text-slate-500 text-sm">No audits match.</li>
        )}
        {loading && <li className="card p-6 text-center text-slate-500 text-sm">Loading…</li>}
      </ul>

      <div className="card overflow-x-auto hidden lg:block">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Location</th>
              <th className="text-left px-3 py-2">Submitter</th>
              <th className="text-left px-3 py-2">Score</th>
              {STREAMS.map((s) => (
                <th key={s} className="text-left px-3 py-2">{STREAM_LABELS[s]}</th>
              ))}
              <th className="text-left px-3 py-2">📷</th>
              <th className="text-left px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((a) => {
              const g = (a.computed_grades ?? {}) as Record<string, string>;
              const photoCount = photoCounts[a.id] ?? 0;
              return (
                <tr
                  key={a.id}
                  className="border-t border-slate-200 hover:bg-slate-50 cursor-pointer"
                  onClick={() => setOpen(a)}
                >
                  <td className="px-3 py-2 whitespace-nowrap">{a.audit_date}</td>
                  <td className="px-3 py-2">{locName(a.location_id)}</td>
                  <td className="px-3 py-2 text-xs">
                    <div className="font-medium">{a.submitter_name || "(no name)"}</div>
                    <div className="text-slate-500">{a.audit_form_mode} · {a.submitted_by_role}</div>
                  </td>
                  <td className="px-3 py-2 font-semibold tabular-nums">{a.computed_score?.toFixed(0) ?? "—"}</td>
                  {STREAMS.map((s) => (
                    <td key={s} className="px-3 py-2"><GradeBadge grade={g[s]} /></td>
                  ))}
                  <td className="px-3 py-2 text-xs">
                    {photoCount > 0
                      ? <span className="font-semibold text-cmu">{photoCount}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {a.nullified ? <span className="text-red-700">nullified</span> : "active"}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && !loading && (
              <tr><td colSpan={10} className="px-3 py-6 text-center text-slate-500">No audits match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-30 flex sm:items-center sm:justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(null)}
        >
          <div
            className="bg-white w-full sm:max-w-4xl sm:rounded-xl flex flex-col max-h-screen sm:max-h-[90vh] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t-0 border-b border-slate-200 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <h2 className="font-semibold">Audit detail</h2>
              <button
                type="button"
                onClick={() => setOpen(null)}
                aria-label="Close"
                className="w-10 h-10 rounded-lg text-xl leading-none text-slate-500 hover:bg-slate-100 active:bg-slate-200"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              <AuditDetailView audit={open} location={locations.find((l) => l.id === open.location_id)} />
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {!open.nullified ? (
                <button className="btn-danger" onClick={handleNullify}>Nullify audit</button>
              ) : <span className="text-xs text-red-700">This audit is nullified.</span>}
              <button className="btn-ghost ml-auto" onClick={() => setOpen(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
