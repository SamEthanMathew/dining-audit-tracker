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

async function loadProfile(uid: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("users")
    .select("id, full_name, email, role, location_id, active")
    .eq("id", uid)
    .maybeSingle();
  if (error) {
    console.error("profile load error", error);
    return null;
  }
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user.id) setProfile(await loadProfile(data.session.user.id));
      setLoading(false);
    });
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
          await supabase.rpc("log_event", { action: "login", metadata: { email } });
        }
        return { error: null };
      },
      async signOut() {
        await supabase.rpc("log_event", { action: "logout", metadata: null });
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
  if (loading) return <div className="p-8 text-slate-500">Loading…</div>;
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
