import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "./supabase";
import type { Tables, UserRole } from "../types/db";

type Profile = Pick<Tables<"users">, "id" | "full_name" | "email" | "role" | "location_id" | "active">;

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

// Hard cap on auth bootstrap so a stuck network/localStorage can't freeze the app.
const AUTH_BOOT_TIMEOUT_MS = 6000;

function withTimeout<T>(p: Promise<T>, ms: number, fallback: () => T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback()), ms)),
  ]);
}

const PROFILE_LOAD_TIMEOUT_MS = 5000;

async function loadProfile(uid: string): Promise<Profile | null> {
  try {
    const q = Promise.resolve(
      supabase
        .from("users")
        .select("id, full_name, email, role, location_id, active")
        .eq("id", uid)
        .maybeSingle()
    );
    type Resp = { data: Profile | null; error: { message: string } | null };
    const result = await withTimeout<Resp>(
      q as unknown as Promise<Resp>,
      PROFILE_LOAD_TIMEOUT_MS,
      () => ({ data: null, error: { message: "profile load timeout" } })
    );
    if (result.error) {
      console.error("profile load error", result.error);
      return null;
    }
    return result.data;
  } catch (e) {
    console.error("profile load threw", e);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const got = await withTimeout(
          supabase.auth.getSession().then((r) => r.data.session ?? null),
          AUTH_BOOT_TIMEOUT_MS,
          () => null
        );
        if (!active) return;
        setSession(got);
        if (got?.user?.id) setProfile(await loadProfile(got.user.id));
      } catch (e) {
        console.error("auth bootstrap failed", e);
      } finally {
        if (active) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!active) return;
      setSession(s);
      if (s?.user?.id) setProfile(await loadProfile(s.user.id));
      else setProfile(null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthState = useMemo(
    () => ({
      session,
      profile,
      loading,
      async signIn(email, password) {
        const { error, data } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { error: error.message };
        if (data.user) {
          supabase.rpc("log_event", { action: "login", metadata: { email } }).then(() => {}, () => {});
        }
        return { error: null };
      },
      async signOut() {
        try {
          await supabase.rpc("log_event", { action: "logout", metadata: null });
        } catch { /* best-effort */ }
        await supabase.auth.signOut();
      },
      async refreshProfile() {
        if (session?.user?.id) setProfile(await loadProfile(session.user.id));
      },
    }),
    [session, profile, loading]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}

export function ProtectedRoute({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: UserRole[];
}) {
  const { session, profile, loading } = useAuth();
  const loc = useLocation();
  if (loading) {
    return (
      <div className="p-8 text-slate-500">
        Loading…
        <p className="text-xs text-slate-400 mt-2">If this stays for more than a few seconds, <button onClick={resetAuth} className="text-cmu hover:underline">reset your session</button>.</p>
      </div>
    );
  }
  if (!session) return <Navigate to="/login" state={{ from: loc }} replace />;
  if (!profile || !profile.active) {
    return (
      <div className="p-8 text-red-600">
        Your account is not active. Contact an administrator.
      </div>
    );
  }
  if (roles && !roles.includes(profile.role)) {
    return <Navigate to={profile.role === "admin" ? "/admin" : "/audit"} replace />;
  }
  return <>{children}</>;
}

function resetAuth() {
  try {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith("sb-") || k.includes("supabase")) localStorage.removeItem(k);
    });
  } catch { /* ignore */ }
  window.location.href = "/login";
}
