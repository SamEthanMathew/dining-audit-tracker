import { useEffect, useState } from "react";
import { fetchAdminDashboard, fetchAdminLeaderboard } from "../../lib/api";
import TierBadge from "../../components/TierBadge";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";

export default function AdminDashboard() {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchAdminDashboard>> | null>(null);
  const [board, setBoard] = useState<Awaited<ReturnType<typeof fetchAdminLeaderboard>>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchAdminDashboard(), fetchAdminLeaderboard()])
      .then(([d, b]) => { setData(d); setBoard(b); })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return <p className="text-slate-500">Loading…</p>;

  const chartData = data.locations.map((l) => ({ name: l.name, audits: l.audits_this_week }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Admin dashboard</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-semibold mb-2">Audits this week (by location)</h2>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="audits" fill="#0b8a3e" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {data.locations.some((l) => l.missing_this_week) && (
            <div className="text-sm mt-2 text-amber-700">
              Missing this week:{" "}
              <span className="font-medium">
                {data.locations.filter((l) => l.missing_this_week).map((l) => l.name).join(", ")}
              </span>
            </div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-2">Location scores</h2>
          <div className="space-y-2">
            {board.map((b) => (
              <div key={b.location_id} className="flex items-center justify-between text-sm">
                <div className="font-medium">{b.location_name}</div>
                <div className="flex items-center gap-3">
                  <span className="text-slate-500">{b.score?.toFixed?.(1) ?? "—"}</span>
                  <TierBadge tier={b.tier} size="sm" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-semibold mb-2">Recent nullifications</h2>
          {data.recent_nullifications.length === 0 ? (
            <p className="text-slate-500 text-sm">No nullifications yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.recent_nullifications.map((r) => (
                <li key={r.id} className="border-l-2 border-red-300 pl-3">
                  <div className="text-xs text-slate-500">{r.nullified_at?.slice(0, 19).replace("T", " ")}</div>
                  <div>{r.nullified_reason}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-5">
          <h2 className="font-semibold mb-2">Recent settings / recommendation changes</h2>
          {data.recent_settings_changes.length === 0 ? (
            <p className="text-slate-500 text-sm">No changes yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.recent_settings_changes.map((s) => (
                <li key={s.id} className="flex justify-between">
                  <span className="font-mono">{s.table_name}</span>
                  <span className="text-slate-500">{s.created_at?.slice(0, 19).replace("T", " ")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
