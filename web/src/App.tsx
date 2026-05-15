import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth, ProtectedRoute } from "./lib/auth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Audit from "./pages/Audit";
import MyAudits from "./pages/MyAudits";
import Leaderboard from "./pages/Leaderboard";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminNewAudit from "./pages/admin/NewAudit";
import AdminAudits from "./pages/admin/AuditsLog";
import AdminUsers from "./pages/admin/Users";
import AdminRecommendations from "./pages/admin/Recommendations";
import AdminSettings from "./pages/admin/Settings";
import AdminAccessLogs from "./pages/admin/AccessLogs";

function HomeRedirect() {
  const { profile, loading } = useAuth();
  if (loading) return <div className="p-8 text-slate-500">Loading…</div>;
  if (!profile) return <Navigate to="/login" replace />;
  return <Navigate to={profile.role === "admin" ? "/admin" : "/audit"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<HomeRedirect />} />

      {/* Rep + admin both can view */}
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/audit"       element={<Audit />} />
        <Route path="/my-audits"   element={<MyAudits />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
      </Route>

      {/* Admin-only */}
      <Route element={<ProtectedRoute roles={["admin"]}><Layout admin /></ProtectedRoute>}>
        <Route path="/admin"                 element={<AdminDashboard />} />
        <Route path="/admin/new-audit"       element={<AdminNewAudit />} />
        <Route path="/admin/audits"          element={<AdminAudits />} />
        <Route path="/admin/users"           element={<AdminUsers />} />
        <Route path="/admin/recommendations" element={<AdminRecommendations />} />
        <Route path="/admin/settings"        element={<AdminSettings />} />
        <Route path="/admin/access-logs"     element={<AdminAccessLogs />} />
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
