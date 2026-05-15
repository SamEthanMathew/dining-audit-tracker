import { useEffect, useState } from "react";
import { fetchSettings, updateSettings } from "../../lib/api";
import type { Settings } from "../../lib/api";

export default function AdminSettings() {
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchSettings().then(setS).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!s) return <p className="text-slate-500">Loading…</p>;

  const tt = (s.tier_thresholds ?? {}) as Record<string, number>;

  async function save() {
    if (!s) return;
    setBusy(true);
    setError(null);
    try {
      const next = await updateSettings({
        audit_mode: s.audit_mode,
        rep_audit_weight: Number(s.rep_audit_weight),
        admin_audit_weight: Number(s.admin_audit_weight),
        decay_half_life_days: Number(s.decay_half_life_days),
        decay_floor_days: Number(s.decay_floor_days),
        landfill_opportunity_threshold_a: Number(s.landfill_opportunity_threshold_a),
        bottles_cans_threshold_a: Number(s.bottles_cans_threshold_a),
        compost_threshold_a: Number(s.compost_threshold_a),
        cardboard_strict: s.cardboard_strict,
        tier_thresholds: s.tier_thresholds,
      });
      setS(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="text-slate-600 text-sm">Changes take effect on the next audit submission and the next leaderboard read.</p>

      <div className="card p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">Audit mode (form units)</label>
          <select className="input" value={s.audit_mode} onChange={(e) => setS({ ...s, audit_mode: e.target.value as any })}>
            <option value="count">count</option>
            <option value="weight">weight</option>
          </select>
        </div>
        <div>
          <label className="label">Rep audit weight</label>
          <input className="input" type="number" step="0.01" value={s.rep_audit_weight} onChange={(e) => setS({ ...s, rep_audit_weight: Number(e.target.value) })} />
        </div>
        <div>
          <label className="label">Admin audit weight</label>
          <input className="input" type="number" step="0.01" value={s.admin_audit_weight} onChange={(e) => setS({ ...s, admin_audit_weight: Number(e.target.value) })} />
        </div>
        <div>
          <label className="label">Decay half-life (days)</label>
          <input className="input" type="number" step="1" value={s.decay_half_life_days} onChange={(e) => setS({ ...s, decay_half_life_days: Number(e.target.value) })} />
        </div>
        <div>
          <label className="label">Decay floor (days)</label>
          <input className="input" type="number" step="1" value={s.decay_floor_days} onChange={(e) => setS({ ...s, decay_floor_days: Number(e.target.value) })} />
        </div>
        <div>
          <label className="label">Landfill A-threshold (%)</label>
          <input className="input" type="number" step="0.1" value={s.landfill_opportunity_threshold_a} onChange={(e) => setS({ ...s, landfill_opportunity_threshold_a: Number(e.target.value) })} />
        </div>
        <div>
          <label className="label">Bottles &amp; Cans A-threshold (%)</label>
          <input className="input" type="number" step="0.1" value={s.bottles_cans_threshold_a} onChange={(e) => setS({ ...s, bottles_cans_threshold_a: Number(e.target.value) })} />
        </div>
        <div>
          <label className="label">Compost A-threshold (%)</label>
          <input className="input" type="number" step="0.1" value={s.compost_threshold_a} onChange={(e) => setS({ ...s, compost_threshold_a: Number(e.target.value) })} />
        </div>
        <div>
          <label className="label">Cardboard strict mode</label>
          <select className="input" value={s.cardboard_strict ? "1" : "0"} onChange={(e) => setS({ ...s, cardboard_strict: e.target.value === "1" })}>
            <option value="1">Strict (any contamination → F)</option>
            <option value="0">Lenient (sliding scale)</option>
          </select>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-3">Tier thresholds</h2>
        <div className="grid grid-cols-3 gap-3">
          {(["platinum", "gold", "silver"] as const).map((tier) => (
            <div key={tier}>
              <label className="label capitalize">{tier} ≥</label>
              <input
                className="input"
                type="number"
                step="0.1"
                value={tt[tier] ?? ""}
                onChange={(e) => setS({ ...s, tier_thresholds: { ...tt, [tier]: Number(e.target.value) } })}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-2">Below the silver threshold → Bronze.</p>
      </div>

      <div className="flex items-center gap-3 justify-end">
        {saved && <span className="text-emerald-700 text-sm">Saved.</span>}
        <button className="btn-primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}
