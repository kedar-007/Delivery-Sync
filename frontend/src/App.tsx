import React, { useEffect, useCallback, useState } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import ProtectedRoute from "./components/layout/ProtectedRoute";
import AppLoader from "./components/ui/AppLoader";

import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import PortfolioDashboard from "./pages/PortfolioDashboard";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import MilestonesPage from "./pages/MilestonesPage";
import StandupPage from "./pages/StandupPage";
import EodPage from "./pages/EodPage";
import ActionsPage from "./pages/ActionsPage";
import BlockersPage from "./pages/BlockersPage";
import RaidPage from "./pages/RaidPage";
import DecisionsPage from "./pages/DecisionsPage";
import ReportsPage from "./pages/ReportsPage";
import AdminPage from "./pages/AdminPage";
import SuperAdminPage from "./pages/SuperAdminPage";
import ReportDetailPage from "./pages/ReportDetailPage";
import ProfilePage from "./pages/ProfilePage";
import SettingsPage from "./pages/SettingsPage";
import TeamsPage from "./pages/TeamsPage";
import AiInsightsPage from "./pages/AiInsightsPage";
import CeoDashboardPage from "./pages/CeoDashboardPage";
import CtoDashboardPage from "./pages/CtoDashboardPage";
import AttendancePage from "./pages/AttendancePage";
import LeavePage from "./pages/LeavePage";
import AnnouncementsPage from "./pages/AnnouncementsPage";
import OrgChartPage from "./pages/OrgChartPage";
import DirectoryPage from "./pages/DirectoryPage";
import SprintBoardPage from "./pages/SprintBoardPage";
import BacklogPage from "./pages/BacklogPage";
import TimeTrackingPage from "./pages/TimeTrackingPage";
import AssetManagementPage from "./pages/AssetManagementPage";
import EnterpriseReportsPage from "./pages/EnterpriseReportsPage";
import AdminConfigPage from "./pages/AdminConfigPage";
import ProjectTasksPage from "./pages/ProjectTasksPage";
import MyTasksPage from "./pages/MyTasksPage";
import SprintsPage from "./pages/SprintsPage";
import HelpPage from "./pages/HelpPage";

// ── SDK loader ────────────────────────────────────────────────────────────────

const loadScript = (src: string): Promise<void> =>
  new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => resolve();
    s.onerror = reject;
    document.body.appendChild(s);
  });

// ── Inner app — consumes AuthContext ──────────────────────────────────────────

const AppRoutes = () => {
  const { user, loading, isLoggedOut } = useAuth();

  if (loading) {
    return <AppLoader />;
  }

  // ✅ Single source of truth — AuthContext decides if user is logged in
  const mustLogin = !user || isLoggedOut;
  const tenantSlug = user?.tenantSlug || localStorage.getItem('tenantSlug') || '';
  const homePath = tenantSlug ? `/${tenantSlug}/dashboard` : '/login';

  return (
    <Routes>
      <Route path="/login" element={mustLogin ? <LoginPage /> : <Navigate to={homePath} replace />} />
      <Route path="/super-admin" element={<SuperAdminPage />} />
      <Route path="/:tenantSlug/reports/:reportId" element={<ReportDetailPage />} />

      <Route
        path="/:tenantSlug"
        element={mustLogin ? <Navigate to="/login" replace /> : <ProtectedRoute />}
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="portfolio" element={<PortfolioDashboard />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="projects/:projectId/sprints" element={<SprintBoardPage />} />
        <Route path="projects/:projectId/backlog" element={<BacklogPage />} />
        <Route path="backlog" element={<BacklogPage />} />
        <Route path="projects/:projectId/tasks" element={<ProjectTasksPage />} />
        <Route path="my-tasks" element={<MyTasksPage />} />
        <Route path="sprints" element={<SprintsPage />} />
        <Route path="milestones" element={<MilestonesPage />} />
        <Route path="standup" element={<StandupPage />} />
        <Route path="eod" element={<EodPage />} />
        <Route path="actions" element={<ActionsPage />} />
        <Route path="blockers" element={<BlockersPage />} />
        <Route path="raid" element={<RaidPage />} />
        <Route path="decisions" element={<DecisionsPage />} />
        <Route path="teams" element={<TeamsPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="leave" element={<LeavePage />} />
        <Route path="announcements" element={<AnnouncementsPage />} />
        <Route path="org-chart" element={<OrgChartPage />} />
        <Route path="directory" element={<DirectoryPage />} />
        <Route path="time-tracking" element={<TimeTrackingPage />} />
        <Route path="assets" element={<AssetManagementPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="enterprise-reports" element={<EnterpriseReportsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="ai-insights" element={<AiInsightsPage />} />
        <Route path="ceo-dashboard" element={<CeoDashboardPage />} />
        <Route path="cto-dashboard" element={<CtoDashboardPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="admin-config" element={<AdminConfigPage />} />
        <Route path="help" element={<HelpPage />} />
      </Route>

      <Route path="*" element={<Navigate to={mustLogin ? "/login" : homePath} replace />} />
    </Routes>
  );
};

// ── Root — loads SDK then mounts AuthProvider once ────────────────────────────

const App = () => {
  const [sdkReady, setSdkReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        await loadScript("https://static.zohocdn.com/catalyst/sdk/js/4.5.0/catalystWebSDK.js");
      } catch (e) { console.warn('[DS Auth] CDN SDK failed:', e); }

      try {
        await loadScript("/__catalyst/sdk/init.js");
      } catch (e) { console.warn('[DS Auth] init.js failed (expected on localhost):', e); }

      setSdkReady(true);
    };
    init();
  }, []);

  // Wait for SDK scripts before mounting AuthProvider so catalyst.auth is available
  if (!sdkReady) {
    return <AppLoader />;
  }

  return (
    // ✅ AuthProvider is mounted ONCE at the top — not inside routes
    <AuthProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </AuthProvider>
  );
};

export default App;