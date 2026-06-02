import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth, ProtectedRoute } from "./lib/auth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import PublicSubmit from "./pages/PublicSubmit";
import PublicLeaderboard from "./pages/PublicLeaderboard";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminNewAudit from "./pages/admin/NewAudit";
import AdminAudits from "./pages/admin/AuditsLog";
import AdminUsers from "./pages/admin/Users";
import AdminLocations from "./pages/admin/Locations";
import AdminRecommendations from "./pages/admin/Recommendations";
import AdminSettings from "./pages/admin/Settings";
import AdminAccessLogs from "./pages/admin/AccessLogs";
import Leaderboard from "./pages/Leaderboard";

function HomeRedirect() {
  const { profile, loading } = useAuth();
  if (loading) return null;
  if (profile?.role === "admin") return <Navigate to="/admin" replace />;
  return <PublicSubmit />;
}

export default function App() {
  return (
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
  );
}
