import React, { useEffect, useState } from "react";
import { HashRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import ProtectedRoute from "./components/layout/ProtectedRoute";
import AppLoader from "./components/ui/AppLoader";
import { hasPermission } from "./utils/permissions";
import type { Permission } from "./utils/permissions";

import BotWidget from "./components/bot/BotWidget";
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
import AiPerformancePage from "./pages/AiPerformancePage";
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
import TeamActivityPage from "./pages/TeamActivityPage";
import AssetManagementPage from "./pages/AssetManagementPage";
import AdminConfigPage from "./pages/AdminConfigPage";
import PeopleSettingsPage from "./pages/PeopleSettingsPage";
import ProjectTasksPage from "./pages/ProjectTasksPage";
import ProjectDocsPage from "./pages/ProjectDocsPage";
import MyTasksPage from "./pages/MyTasksPage";
import SprintsPage from "./pages/SprintsPage";
import HelpPage from "./pages/HelpPage";
import DataSeedPage from "./pages/DataSeedPage";
import IpConfigPage from "./pages/IpConfigPage";
import AccessRevokedPage from "./pages/AccessRevokedPage";
import BugReportsPage from "./pages/BugReportsPage";
import AuditLogsPage from "./pages/AuditLogsPage";
import OrgSetupPage from "./pages/OrgSetupPage";
import PublicSharePage from "./pages/PublicSharePage";
import { ConfirmProvider } from "./components/ui/ConfirmDialog";
import { ToastProvider } from "./components/ui/Toast";
import { TourProvider } from "./contexts/TourContext";

// ── Permission-gated route wrapper ───────────────────────────────────────────
// Redirects to /:tenantSlug/dashboard if the current user lacks `permission`.
// Must be rendered inside /:tenantSlug so useParams can read the slug.
const PermRoute = ({ permission, children }: { permission: Permission | Permission[]; children: React.ReactNode }) => {
  const { user } = useAuth();
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const perms = Array.isArray(permission) ? permission : [permission];
  if (!perms.some((p) => hasPermission(user, p))) {
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
  const { user, loading, isLoggedOut, isDeactivated, needsOrgSetup } = useAuth();

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const tenantSlug = user?.tenantSlug || localStorage.getItem('tenantSlug') || '';

  if (loading) return <AppLoader />;
  if (isDeactivated) return <AccessRevokedPage />;

  // ✅ Single source of truth — AuthContext decides if user is logged in
  const mustLogin = !user || isLoggedOut;
  // When user is authenticated but tenant slug is missing, send to /org-setup
  // so they can complete their workspace details — no polling, just a real page.
  const homePath = isSuperAdmin
    ? '/super-admin'
    : tenantSlug
      ? `/${tenantSlug}/dashboard`
      : '/org-setup';

  return (
    <>
    <Routes>
      {/* Org-setup: shown for first-time TENANT_ADMIN (needsOrgSetup)
           OR for any authenticated user whose tenantSlug is missing */}
      <Route path="/org-setup" element={
        needsOrgSetup || (user && !user.tenantSlug)
          ? <OrgSetupPage />
          : user
            ? <Navigate to={`/${user.tenantSlug}/dashboard`} replace />
            : <Navigate to="/login" replace />
      } />

      <Route path="/login" element={
        needsOrgSetup
          ? <Navigate to="/org-setup" replace />
          : mustLogin
            ? <LoginPage />
            : <Navigate to={homePath} replace />
      } />
      {/* /share/:shareToken is handled at the root level, outside AuthProvider */}

      <Route path="/super-admin" element={
        mustLogin ? <Navigate to="/login" replace /> :
        isSuperAdmin ? <SuperAdminPage /> :
        <Navigate to={homePath} replace />
      } />
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
        <Route path="projects/:projectId/docs"      element={<PermRoute permission="PROJECT_READ"><ProjectDocsPage /></PermRoute>} />
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
        <Route path="assets"  element={<PermRoute permission="ASSET_READ"><AssetManagementPage /></PermRoute>} />

        {/* ── Reports & AI module ── */}
        <Route path="bug-reports"        element={<BugReportsPage />} />
        <Route path="reports"            element={<PermRoute permission="REPORT_READ"><ReportsPage /></PermRoute>} />
<Route path="team-activity"      element={<PermRoute permission="TIME_ANALYTICS"><TeamActivityPage /></PermRoute>} />
        <Route path="ai-insights"        element={<PermRoute permission="AI_INSIGHTS"><AiInsightsPage /></PermRoute>} />
        <Route path="ai-performance"     element={<PermRoute permission={['AI_PERFORMANCE_SELF', 'AI_PERFORMANCE', 'AI_TEAM_ANALYSIS']}><AiPerformancePage /></PermRoute>} />

        {/* ── Executive module ── */}
        <Route path="portfolio"      element={<PermRoute permission="ORG_ROLE_READ"><PortfolioDashboard /></PermRoute>} />
        <Route path="ceo-dashboard"  element={<PermRoute permission="CEO_DASHBOARD"><CeoDashboardPage /></PermRoute>} />
        <Route path="cto-dashboard"  element={<PermRoute permission="CTO_DASHBOARD"><CtoDashboardPage /></PermRoute>} />

        {/* ── Administration module ── */}
        <Route path="admin"           element={<PermRoute permission="ADMIN_USERS"><AdminPage /></PermRoute>} />
        <Route path="admin-config"    element={<PermRoute permission="ADMIN_USERS"><AdminConfigPage /></PermRoute>} />
        <Route path="people-settings" element={<PermRoute permission={['LEAVE_ADMIN', 'LOCATION_ADMIN', 'IP_CONFIG_WRITE']}><PeopleSettingsPage /></PermRoute>} />
        <Route path="audit-logs"   element={<PermRoute permission="ADMIN_USERS"><AuditLogsPage /></PermRoute>} />
        <Route path="data-seed"    element={<PermRoute permission="DATA_SEED"><DataSeedPage /></PermRoute>} />
        <Route path="ip-config"    element={<PermRoute permission="IP_CONFIG_WRITE"><IpConfigPage /></PermRoute>} />
      </Route>

      <Route path="*" element={
        needsOrgSetup
          ? <Navigate to="/org-setup" replace />
          : <Navigate to={mustLogin ? "/login" : homePath} replace />
      } />
    </Routes>
    {user && !isLoggedOut && user.botEnabled !== false && <BotWidget />}
  </>
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
    <ToastProvider>
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          {/* Public share links render outside AuthProvider — no /auth/me call */}
          <Route path="/share/:shareToken" element={<PublicSharePage />} />
          <Route path="/*" element={
            <AuthProvider>
              <ConfirmProvider>
                <TourProvider>
                  <AppRoutes />
                </TourProvider>
              </ConfirmProvider>
            </AuthProvider>
          } />
        </Routes>
      </HashRouter>
    </ToastProvider>
  );
};

export default App;