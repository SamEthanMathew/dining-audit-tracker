import { useEffect, useMemo, useState } from "react";
import { listAccessLogs, listUsers } from "../../lib/api";
import type { User } from "../../lib/api";

export default function AdminAccessLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    Promise.all([listAccessLogs(500), listUsers()])
      .then(([l, u]) => { setLogs(l); setUsers(u); })
      .catch((e) => setError(e.message));
  }, []);

  const byId = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);

  const filtered = logs.filter((l) => {
    if (!filter) return true;
    const blob = JSON.stringify(l).toLowerCase();
    return blob.includes(filter.toLowerCase());
  });

  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Access logs</h1>
      <input
        className="input max-w-md"
        placeholder="Filter by action, user, metadata…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="text-left px-3 py-2">When</th>
              <th className="text-left px-3 py-2">User</th>
              <th className="text-left px-3 py-2">Action</th>
              <th className="text-left px-3 py-2">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => (
              <tr key={l.id} className="border-t border-slate-200 align-top">
                <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{l.created_at?.slice(0, 19).replace("T", " ")}</td>
                <td className="px-3 py-2 text-xs">{l.user_id ? (byId[l.user_id]?.email ?? l.user_id.slice(0, 8)) : "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{l.action}</td>
                <td className="px-3 py-2 text-xs"><pre className="whitespace-pre-wrap text-slate-600">{l.metadata ? JSON.stringify(l.metadata) : ""}</pre></td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">No logs match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
