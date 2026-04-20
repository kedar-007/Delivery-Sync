import React, { useEffect, useCallback, useState } from "react";
import { HashRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import ProtectedRoute from "./components/layout/ProtectedRoute";
import AppLoader from "./components/ui/AppLoader";
import { hasPermission } from "./utils/permissions";
import type { Permission } from "./utils/permissions";

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
import DataSeedPage from "./pages/DataSeedPage";
import IpConfigPage from "./pages/IpConfigPage";

// ── Permission-gated route wrapper ───────────────────────────────────────────
// Redirects to /:tenantSlug/dashboard if the current user lacks `permission`.
// Must be rendered inside /:tenantSlug so useParams can read the slug.
const PermRoute = ({ permission, children }: { permission: Permission; children: React.ReactNode }) => {
  const { user } = useAuth();
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  if (!hasPermission(user, permission)) {
    return <Navigate to={`/${tenantSlug}/dashboard`} replace />;
  }
  return <>{children}</>;
};

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

        {/* ── Always accessible ── */}
        <Route path="dashboard"  element={<DashboardPage />} />
        <Route path="profile"    element={<ProfilePage />} />
        <Route path="settings"   element={<SettingsPage />} />
        <Route path="help"       element={<HelpPage />} />

        {/* ── Projects module ── */}
        <Route path="projects"                      element={<PermRoute permission="PROJECT_READ"><ProjectsPage /></PermRoute>} />
        <Route path="projects/:projectId"           element={<PermRoute permission="PROJECT_READ"><ProjectDetailPage /></PermRoute>} />
        <Route path="projects/:projectId/sprints"   element={<PermRoute permission="SPRINT_READ"><SprintBoardPage /></PermRoute>} />
        <Route path="projects/:projectId/backlog"   element={<PermRoute permission="TASK_READ"><BacklogPage /></PermRoute>} />
        <Route path="projects/:projectId/tasks"     element={<PermRoute permission="TASK_READ"><ProjectTasksPage /></PermRoute>} />
        <Route path="backlog"    element={<PermRoute permission="TASK_READ"><BacklogPage /></PermRoute>} />
        <Route path="my-tasks"   element={<PermRoute permission="TASK_READ"><MyTasksPage /></PermRoute>} />
        <Route path="sprints"    element={<PermRoute permission="SPRINT_READ"><SprintsPage /></PermRoute>} />
        <Route path="milestones" element={<PermRoute permission="MILESTONE_READ"><MilestonesPage /></PermRoute>} />
        <Route path="actions"    element={<PermRoute permission="ACTION_READ"><ActionsPage /></PermRoute>} />
        <Route path="blockers"   element={<PermRoute permission="BLOCKER_READ"><BlockersPage /></PermRoute>} />
        <Route path="raid"       element={<PermRoute permission="RAID_READ"><RaidPage /></PermRoute>} />
        <Route path="decisions"  element={<PermRoute permission="DECISION_READ"><DecisionsPage /></PermRoute>} />

        {/* ── Daily Work module ── */}
        <Route path="standup"       element={<PermRoute permission="STANDUP_SUBMIT"><StandupPage /></PermRoute>} />
        <Route path="eod"           element={<PermRoute permission="EOD_SUBMIT"><EodPage /></PermRoute>} />
        <Route path="time-tracking" element={<PermRoute permission="TIME_WRITE"><TimeTrackingPage /></PermRoute>} />

        {/* ── People module ── */}
        <Route path="teams"         element={<PermRoute permission="TEAM_READ"><TeamsPage /></PermRoute>} />
        <Route path="attendance"    element={<PermRoute permission="ATTENDANCE_READ"><AttendancePage /></PermRoute>} />
        <Route path="leave"         element={<PermRoute permission="LEAVE_READ"><LeavePage /></PermRoute>} />
        <Route path="announcements" element={<PermRoute permission="ANNOUNCEMENT_READ"><AnnouncementsPage /></PermRoute>} />
        <Route path="org-chart"     element={<PermRoute permission="ORG_READ"><OrgChartPage /></PermRoute>} />
        <Route path="directory"     element={<PermRoute permission="TEAM_READ"><DirectoryPage /></PermRoute>} />

        {/* ── Assets module ── */}
        <Route path="assets" element={<PermRoute permission="ASSET_READ"><AssetManagementPage /></PermRoute>} />

        {/* ── Reports & AI module ── */}
        <Route path="reports"            element={<PermRoute permission="REPORT_READ"><ReportsPage /></PermRoute>} />
        <Route path="enterprise-reports" element={<PermRoute permission="ORG_ROLE_READ"><EnterpriseReportsPage /></PermRoute>} />
        <Route path="ai-insights"        element={<PermRoute permission="AI_INSIGHTS"><AiInsightsPage /></PermRoute>} />

        {/* ── Executive module ── */}
        <Route path="portfolio"      element={<PermRoute permission="ORG_ROLE_READ"><PortfolioDashboard /></PermRoute>} />
        <Route path="ceo-dashboard"  element={<PermRoute permission="ORG_ROLE_READ"><CeoDashboardPage /></PermRoute>} />
        <Route path="cto-dashboard"  element={<PermRoute permission="ORG_ROLE_READ"><CtoDashboardPage /></PermRoute>} />

        {/* ── Administration module ── */}
        <Route path="admin"        element={<PermRoute permission="ADMIN_USERS"><AdminPage /></PermRoute>} />
        <Route path="admin-config" element={<PermRoute permission="ADMIN_USERS"><AdminConfigPage /></PermRoute>} />
        <Route path="data-seed"    element={<PermRoute permission="DATA_SEED"><DataSeedPage /></PermRoute>} />
        <Route path="ip-config"    element={<PermRoute permission="IP_CONFIG_WRITE"><IpConfigPage /></PermRoute>} />
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