import { useEffect, useState } from "react";
import { listLocations, updateLocation } from "../../lib/api";
import type { Location } from "../../lib/api";

export default function AdminLocations() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [editing, setEditing] = useState<Location | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    try { setLocations(await listLocations(false)); }
    catch (e: any) { setError(e.message); }
  }
  useEffect(() => { reload(); }, []);

  async function save(payload: Partial<Location>) {
    setBusy(true);
    try {
      await updateLocation(payload);
      setEditing(null);
      await reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Locations</h1>
      <p className="text-slate-600 text-sm">Edit each location's contact email (where audit notifications are sent) and the username for the shared location account.</p>
      {error && <div className="text-red-700 bg-red-50 border border-red-200 px-4 py-2 rounded">{error}</div>}

      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">Username</th>
              <th className="text-left px-3 py-2">Contact Email</th>
              <th className="text-left px-3 py-2">Active</th>
              <th className="text-left px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {locations.map((l) => (
              <tr key={l.id} className="border-t border-slate-200">
                <td className="px-3 py-2 font-medium">{l.name}</td>
                <td className="px-3 py-2 font-mono text-xs">{l.account_username ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{l.contact_email ?? "—"}</td>
                <td className="px-3 py-2">{l.active ? "yes" : "no"}</td>
                <td className="px-3 py-2"><button className="text-cmu hover:underline" onClick={() => setEditing(l)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditModal initial={editing} onCancel={() => setEditing(null)} onSave={save} busy={busy} />
      )}
    </div>
  );
}

function EditModal({
  initial, onCancel, onSave, busy,
}: {
  initial: Location;
  onCancel: () => void;
  onSave: (payload: Partial<Location>) => Promise<void>;
  busy: boolean;
}) {
  const [name, setName] = useState(initial.name);
  const [contactEmail, setContactEmail] = useState(initial.contact_email ?? "");
  const [accountUsername, setAccountUsername] = useState(initial.account_username ?? "");
  const [active, setActive] = useState(initial.active);

  return (
    <div className="fixed inset-0 bg-black/40 z-10 flex items-center justify-center p-4" onClick={onCancel}>
      <form
        className="card max-w-md w-full p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ id: initial.id, name, contact_email: contactEmail, account_username: accountUsername, active });
        }}
      >
        <h2 className="text-xl font-semibold">Edit location</h2>
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label">Contact email</label>
          <input className="input" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)}
            placeholder="sustainability rep at this location" />
          <p className="text-xs text-slate-500 mt-1">Receives audit notifications when this location is audited.</p>
        </div>
        <div>
          <label className="label">Account username</label>
          <input className="input" value={accountUsername} onChange={(e) => setAccountUsername(e.target.value)}
            placeholder="e.g. abp_rep" />
          <p className="text-xs text-slate-500 mt-1">Staff at this location log in with this username + a shared password.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}
