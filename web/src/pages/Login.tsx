import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { resolveUsername } from "../lib/api";

export default function Login() {
  const { signIn, session, profile, loading } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  // If already authenticated, bounce to the right home WITHOUT calling nav() during render.
  if (!loading && session) {
    if (profile?.role === "admin") return <Navigate to="/admin" replace />;
    if (profile) return <Navigate to="/" replace />;
    // Have a session but no profile yet — show loading rather than rendering the form again.
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 text-slate-500 text-sm">
        Loading your account…
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
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
      if (error) {
        setError(error);
        setBusy(false);
        return;
      }
      // Don't nav imperatively — the AuthProvider's onAuthStateChange will
      // set session+profile, and the early-return above will redirect on next render.
      // Keep busy=true so the button doesn't flash back to "Sign in" while redirecting.
      nav("/", { replace: true });
    } catch (e: any) {
      setError(e?.message ?? "Sign-in failed.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 pt-safe pb-safe">
      <div className="w-full max-w-sm card p-5 sm:p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-cmu shrink-0" />
          <div>
            <h1 className="font-semibold leading-tight">CMU Dining</h1>
            <p className="text-xs text-slate-500 leading-tight">Waste Audit Tracker</p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="identifier">Username or email</label>
            <input
              id="identifier"
              className="input"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <div className="relative">
              <input
                id="password"
                className="input pr-16"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                autoCapitalize="none"
                spellCheck={false}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-1 top-1 bottom-1 px-3 rounded-md text-xs font-semibold text-slate-600 hover:bg-slate-100 active:bg-slate-200"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
          )}
          <button className="btn-primary w-full" disabled={busy} type="submit">
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                Object.keys(localStorage).forEach((k) => {
                  if (k.startsWith("sb-") || k.includes("supabase")) localStorage.removeItem(k);
                });
              } catch { /* ignore */ }
              window.location.reload();
            }}
            className="block w-full text-xs text-slate-500 hover:text-cmu hover:underline pt-2"
          >
            Stuck? Clear session and try again
          </button>
        </form>
      </div>
    </div>
  );
}
