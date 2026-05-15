import { useEffect, useState } from "react";
import { fetchLeaderboard } from "../lib/api";
import TierBadge from "../components/TierBadge";

export default function Leaderboard() {
  const [rows, setRows] = useState<{ location_id: string; location_name: string; tier: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard().then(setRows).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Leaderboard</h1>
        <p className="text-slate-600 text-sm">
          Tier badges only. Numeric scores stay private to admins.
        </p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((r) => (
          <div key={r.location_id} className="card p-4 flex items-center justify-between">
            <div className="font-medium">{r.location_name}</div>
            <TierBadge tier={r.tier} size="lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
