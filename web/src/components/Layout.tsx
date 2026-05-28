import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function Layout({ admin = false }: { admin?: boolean }) {
  const { profile, signOut } = useAuth();

  const repNav = [
    { to: "/audit",       label: "Submit Audit" },
    { to: "/my-audits",   label: "My Audits" },
    { to: "/leaderboard", label: "Leaderboard" },
  ];
  const adminNav = [
    { to: "/admin",                 label: "Dashboard", end: true },
    { to: "/admin/new-audit",       label: "New Audit" },
    { to: "/admin/audits",          label: "Audits" },
    { to: "/admin/users",           label: "Users" },
    { to: "/admin/locations",       label: "Locations" },
    { to: "/admin/recommendations", label: "Recommendations" },
    { to: "/admin/settings",        label: "Settings" },
    { to: "/admin/access-logs",     label: "Access Logs" },
    { to: "/leaderboard",           label: "Leaderboard" },
  ];
  const nav = admin ? adminNav : repNav;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-cmu text-white border-b border-cmu-dark">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to={admin ? "/admin" : "/audit"} className="font-semibold text-lg tracking-tight">
            CMU Dining — Waste Audits
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="opacity-80 hidden sm:inline">
              {profile?.full_name || profile?.email}{" "}
              <span className="px-1.5 py-0.5 ml-1 rounded bg-white/15 text-xs uppercase tracking-wide">
                {profile?.role}
              </span>
            </span>
            <button onClick={signOut} className="btn-ghost !bg-white/10 !text-white !border-white/30 hover:!bg-white/20">
              Sign out
            </button>
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={(n as any).end}
              className={({ isActive }) =>
                "px-3 py-2 text-sm whitespace-nowrap border-b-2 " +
                (isActive ? "border-white text-white" : "border-transparent text-white/80 hover:text-white")
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
