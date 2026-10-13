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
      <header className="bg-cmu text-white border-b border-cmu-dark sticky top-0 z-20 pt-safe">
        <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
          <Link
            to={admin ? "/admin" : "/audit"}
            className="font-semibold tracking-tight leading-tight min-w-0"
          >
            <span className="block text-base sm:text-lg truncate">CMU Dining</span>
            <span className="block text-[11px] font-normal text-white/70 -mt-0.5">Waste Audits</span>
          </Link>
          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden md:inline text-sm opacity-80 max-w-[18rem] truncate">
              {profile?.full_name || profile?.email}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-white/15 text-[10px] uppercase tracking-wide">
              {profile?.role}
            </span>
            <button
              onClick={signOut}
              className="min-h-10 px-3 rounded-lg text-xs font-semibold bg-white/10 border border-white/25 hover:bg-white/20 active:bg-white/25"
            >
              Sign out
            </button>
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-2 flex gap-0.5 overflow-x-auto no-scrollbar">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={(n as any).end}
              className={({ isActive }) =>
                "px-3 min-h-11 flex items-center text-sm whitespace-nowrap border-b-2 " +
                (isActive
                  ? "border-white text-white font-semibold"
                  : "border-transparent text-white/75 hover:text-white active:text-white")
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-5 sm:py-6 pb-safe">
        <Outlet />
      </main>
    </div>
  );
}
