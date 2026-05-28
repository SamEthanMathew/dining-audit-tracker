import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { resolveUsername } from "../lib/api";

export default function Login() {
  const { signIn, session } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  if (session) {
    nav("/", { replace: true });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // If the identifier doesn't look like an email, look up the email by username.
      let email = identifier.trim();
      if (!email.includes("@")) {
        const resolved = await resolveUsername(email);
        if (!resolved) {
          setError("Username not found.");
          setBusy(false);
          return;
        }
        email = resolved;
      }
      const { error } = await signIn(email, password);
      setBusy(false);
      if (error) setError(error);
      else nav("/", { replace: true });
    } catch (e: any) {
      setError(e?.message ?? "Sign-in failed.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm card p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-9 h-9 rounded-lg bg-cmu" />
          <div>
            <h1 className="font-semibold leading-tight">CMU Dining</h1>
            <p className="text-xs text-slate-500 leading-tight">Waste Audit Tracker</p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="label">Username or email</label>
            <input
              className="input"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
          )}
          <button className="btn-primary w-full" disabled={busy} type="submit">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
