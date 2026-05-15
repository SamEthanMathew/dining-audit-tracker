import { useEffect, useState } from "react";
import { listRecommendations, upsertRecommendation } from "../../lib/api";
import type { Recommendation } from "../../lib/api";
import { STREAM_LABELS } from "../../lib/grades";

const STREAMS = ["landfill", "bottles_cans", "compost", "cardboard"] as const;

export default function AdminRecommendations() {
  const [items, setItems] = useState<Recommendation[]>([]);
  const [editing, setEditing] = useState<Recommendation | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    try {
      setItems(await listRecommendations());
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => { reload(); }, []);

  async function save(payload: Partial<Recommendation>) {
    try {
      await upsertRecommendation(payload);
      setEditing(null);
      setAdding(false);
      await reload();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Recommendations</h1>
        <button className="btn-primary" onClick={() => setAdding(true)}>Add recommendation</button>
      </div>

      {error && <div className="text-red-700 bg-red-50 border border-red-200 px-4 py-2 rounded">{error}</div>}

      {(adding || editing) && (
        <RecForm
          initial={editing ?? undefined}
          onCancel={() => { setEditing(null); setAdding(false); }}
          onSave={save}
        />
      )}

      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="text-left px-3 py-2">Stream</th>
              <th className="text-left px-3 py-2">Failure mode</th>
              <th className="text-left px-3 py-2">Range</th>
              <th className="text-left px-3 py-2">Recommendation</th>
              <th className="text-left px-3 py-2">Active</th>
              <th className="text-left px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-t border-slate-200 align-top">
                <td className="px-3 py-2">{STREAM_LABELS[r.stream]}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.failure_mode}</td>
                <td className="px-3 py-2 text-xs">
                  {r.threshold_min == null && r.threshold_max == null
                    ? "any"
                    : `${r.threshold_min ?? "≥0"}–${r.threshold_max ?? "∞"}%`}
                </td>
                <td className="px-3 py-2 max-w-xl">{r.recommendation_text}</td>
                <td className="px-3 py-2">{r.active ? "yes" : "no"}</td>
                <td className="px-3 py-2 text-sm">
                  <button className="text-cmu hover:underline" onClick={() => setEditing(r)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RecForm({
  initial, onCancel, onSave,
}: {
  initial?: Recommendation;
  onCancel: () => void;
  onSave: (payload: Partial<Recommendation>) => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<Recommendation>>(initial ?? {
    stream: "landfill", failure_mode: "high_opportunity",
    threshold_min: null, threshold_max: null,
    recommendation_text: "", active: true,
  });
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="card p-5 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await onSave({ ...form, id: initial?.id });
        setSaving(false);
      }}
    >
      <h2 className="font-semibold">{initial ? "Edit recommendation" : "New recommendation"}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="label">Stream</label>
          <select className="input" value={form.stream as string} onChange={(e) => setForm({ ...form, stream: e.target.value as any })}>
            {STREAMS.map((s) => <option key={s} value={s}>{STREAM_LABELS[s]}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Failure mode</label>
          <input className="input" required value={form.failure_mode ?? ""} onChange={(e) => setForm({ ...form, failure_mode: e.target.value })} />
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="label">Min %</label>
            <input className="input" type="number" step="0.1" value={form.threshold_min ?? ""}
              onChange={(e) => setForm({ ...form, threshold_min: e.target.value === "" ? null : Number(e.target.value) })} />
          </div>
          <div className="flex-1">
            <label className="label">Max %</label>
            <input className="input" type="number" step="0.1" value={form.threshold_max ?? ""}
              onChange={(e) => setForm({ ...form, threshold_max: e.target.value === "" ? null : Number(e.target.value) })} />
          </div>
        </div>
      </div>
      <div>
        <label className="label">Recommendation text</label>
        <textarea rows={4} className="input" required value={form.recommendation_text ?? ""}
          onChange={(e) => setForm({ ...form, recommendation_text: e.target.value })} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.active !== false} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
        Active (matched on new audits)
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}
