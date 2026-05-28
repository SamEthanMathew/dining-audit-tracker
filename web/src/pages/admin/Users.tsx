import { useEffect, useState } from "react";
import { callAdminUserMgmt, listLocations, listUsers } from "../../lib/api";
import type { Location, User } from "../../lib/api";
import { supabase } from "../../lib/supabase";

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({ email: "", full_name: "", role: "rep" as "rep" | "admin", location_id: "" });
  const [createdInfo, setCreatedInfo] = useState<{ email: string; password: string } | null>(null);

  async function reload() {
    try {
      const [u, l] = await Promise.all([listUsers(), listLocations(false)]);
      setUsers(u);
      setLocations(l);
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => { reload(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCreatedInfo(null);
    try {
      const out = await callAdminUserMgmt({
        op: "create",
        email: form.email,
        full_name: form.full_name,
        role: form.role,
        location_id: form.role === "rep" ? form.location_id : undefined,
      });
      setCreatedInfo({ email: out.email, password: out.generated_password });
      setForm({ email: "", full_name: "", role: "rep", location_id: "" });
      setCreating(false);
      await reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u: User) {
    setBusy(true);
    try {
      await callAdminUserMgmt({ op: u.active ? "deactivate" : "activate", user_id: u.id });
      await reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(u: User) {
    if (!window.confirm(`Reset password for ${u.email}?`)) return;
    setBusy(true);
    try {
      const out = await callAdminUserMgmt({ op: "reset_password", user_id: u.id });
      alert(`New password for ${u.email}:\n\n${out.new_password}\n\nCopy and share securely — it won't be shown again.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeRoleOrLocation(u: User, patch: { role?: "rep" | "admin"; location_id?: string | null }) {
    setBusy(true);
    try {
      await callAdminUserMgmt({ op: "update", user_id: u.id, ...patch });
      await reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function editUsername(u: User) {
    const next = window.prompt(`Username for ${u.email}:`, u.username ?? "");
    if (next === null) return;
    const trimmed = next.trim();
    setBusy(true);
    try {
      const { error } = await supabase.from("users").update({ username: trimmed || null }).eq("id", u.id);
      if (error) throw error;
      await reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Users</h1>
        <button className="btn-primary" onClick={() => setCreating(true)} disabled={busy}>Add user</button>
      </div>

      {error && <div className="text-red-700 bg-red-50 border border-red-200 px-4 py-2 rounded">{error}</div>}
      {createdInfo && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded p-3 text-sm">
          <div className="font-semibold">Created {createdInfo.email}</div>
          <div>
            Initial password: <span className="font-mono bg-white px-2 py-0.5 rounded">{createdInfo.password}</span>{" "}
            <span className="text-xs text-emerald-700">— share securely; won't be shown again.</span>
          </div>
        </div>
      )}

      {creating && (
        <form onSubmit={handleCreate} className="card p-5 space-y-3">
          <h2 className="font-semibold">New user</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="label">Full name</label>
              <input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div>
              <label className="label">Role</label>
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "rep" | "admin" })}>
                <option value="rep">Rep</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {form.role === "rep" && (
              <div>
                <label className="label">Location</label>
                <select className="input" value={form.location_id} required onChange={(e) => setForm({ ...form, location_id: e.target.value })}>
                  <option value="">Select…</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button className="btn-primary" disabled={busy}>{busy ? "Creating…" : "Create"}</button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="text-left px-3 py-2">Username</th>
              <th className="text-left px-3 py-2">Email</th>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">Role</th>
              <th className="text-left px-3 py-2">Location</th>
              <th className="text-left px-3 py-2">Active</th>
              <th className="text-left px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-slate-200">
                <td className="px-3 py-2 font-mono text-xs">
                  <button className="text-cmu hover:underline" onClick={() => editUsername(u)} disabled={busy}>
                    {u.username ?? <span className="italic text-slate-400">set…</span>}
                  </button>
                </td>
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">{u.full_name}</td>
                <td className="px-3 py-2">
                  <select
                    className="input !py-1"
                    value={u.role}
                    onChange={(e) => changeRoleOrLocation(u, { role: e.target.value as "rep" | "admin", location_id: e.target.value === "admin" ? null : u.location_id })}
                  >
                    <option value="rep">rep</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  {u.role === "rep" ? (
                    <select
                      className="input !py-1"
                      value={u.location_id ?? ""}
                      onChange={(e) => changeRoleOrLocation(u, { location_id: e.target.value })}
                    >
                      <option value="">—</option>
                      {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  ) : <span className="text-slate-500 text-xs">n/a (admin)</span>}
                </td>
                <td className="px-3 py-2">{u.active ? "yes" : "no"}</td>
                <td className="px-3 py-2 space-x-3 text-sm whitespace-nowrap">
                  <button className="text-cmu hover:underline" onClick={() => resetPassword(u)} disabled={busy}>Reset pw</button>
                  <button className="text-slate-700 hover:underline" onClick={() => toggleActive(u)} disabled={busy}>{u.active ? "Deactivate" : "Activate"}</button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">No users yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
