import { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth, ProtectedRoute } from "./lib/auth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import PublicSubmit from "./pages/PublicSubmit";

// Admin screens pull in charts and admin-only code. Reps on cell data only ever
// see the public form, so none of that should be in their first download.
const PublicLeaderboard    = lazy(() => import("./pages/PublicLeaderboard"));
const Leaderboard          = lazy(() => import("./pages/Leaderboard"));
const AdminDashboard       = lazy(() => import("./pages/admin/Dashboard"));
const AdminNewAudit        = lazy(() => import("./pages/admin/NewAudit"));
const AdminAudits          = lazy(() => import("./pages/admin/AuditsLog"));
const AdminUsers           = lazy(() => import("./pages/admin/Users"));
const AdminLocations       = lazy(() => import("./pages/admin/Locations"));
const AdminRecommendations = lazy(() => import("./pages/admin/Recommendations"));
const AdminSettings        = lazy(() => import("./pages/admin/Settings"));
const AdminAccessLogs      = lazy(() => import("./pages/admin/AccessLogs"));

function PageFallback() {
  return <div className="p-8 text-sm text-slate-500">Loading…</div>;
}

function HomeRedirect() {
  const { session, profile, loading } = useAuth();
  if (loading) return null;
  // If a session exists but profile hasn't loaded yet, wait briefly to avoid
  // flashing the public form before redirecting an admin to /admin.
  if (session && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-500">
        Loading your account…
      </div>
    );
  }
  if (profile?.role === "admin") return <Navigate to="/admin" replace />;
  return <PublicSubmit />;
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* Public surface */}
        <Route path="/"            element={<HomeRedirect />} />
        <Route path="/submit"      element={<PublicSubmit />} />
        <Route path="/leaderboard" element={<PublicLeaderboard />} />
        <Route path="/login"       element={<Login />} />

        {/* Admin-only */}
        <Route element={<ProtectedRoute roles={["admin"]}><Layout admin /></ProtectedRoute>}>
          <Route path="/admin"                 element={<AdminDashboard />} />
          <Route path="/admin/new-audit"       element={<AdminNewAudit />} />
          <Route path="/admin/audits"          element={<AdminAudits />} />
          <Route path="/admin/users"           element={<AdminUsers />} />
          <Route path="/admin/locations"       element={<AdminLocations />} />
          <Route path="/admin/recommendations" element={<AdminRecommendations />} />
          <Route path="/admin/settings"        element={<AdminSettings />} />
          <Route path="/admin/access-logs"     element={<AdminAccessLogs />} />
          <Route path="/admin/leaderboard"     element={<Leaderboard />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
