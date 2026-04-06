import React, { useEffect, useCallback, useState } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/layout/ProtectedRoute";

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

const App = () => {
  const [authState, setAuthState] = useState<'loading' | 'authed' | 'unauthenticated'>('loading');

  const ensureScript = useCallback((src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        await ensureScript("https://static.zohocdn.com/catalyst/sdk/js/4.5.0/catalystWebSDK.js");
      } catch (e) { console.warn('[DS Auth] CDN SDK failed:', e); }

      try {
        await ensureScript("/__catalyst/sdk/init.js");
      } catch (e) { console.warn('[DS Auth] init.js failed (expected on localhost):', e); }

      if (localStorage.getItem('ds_logged_out') === '1') {
        setAuthState('unauthenticated');
        return;
      }

      try {
        const ok = await (window as any).catalyst?.auth?.isUserAuthenticated?.();
        if (ok) {
          localStorage.removeItem('ds_logged_out');

          if (!localStorage.getItem('tenantSlug')) {
            try {
              const res = await fetch('/server/delivery_sync_function/api/users/me', { credentials: 'include' });
              const data = await res.json();
              console.log("Auth Res details - ", data.data.user);

              if (data?.data?.user?.tenantSlug) {
                localStorage.setItem('tenantSlug', data.data.user.tenantSlug);
              }
            } catch (e) {
              console.warn('[DS Auth] Could not fetch /auth/me:', e);
            }
          }

          setAuthState('authed');
        } else {
          setAuthState('unauthenticated');
        }
      } catch (e) {
        setAuthState('unauthenticated');
      }
    };
    init();
  }, [ensureScript]);

  if (authState === 'loading') {
    return (
      <div className="min-h-screen w-full flex items-center justify-center" style={{ background: '#0a0f1e' }}>
        <div className="text-slate-400 text-sm animate-pulse">Loading...</div>
      </div>
    );
  }

  const mustLogin = authState === 'unauthenticated';
  const tenantSlug = localStorage.getItem('tenantSlug') || '';
  const homePath = tenantSlug ? `/${tenantSlug}/dashboard` : '/';

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={mustLogin ? <LoginPage /> : <Navigate to={homePath} replace />} />
        <Route path="/super-admin" element={<SuperAdminPage />} />
        <Route path="/:tenantSlug/reports/:reportId" element={<ReportDetailPage />} />

        <Route
          path="/:tenantSlug"
          element={mustLogin ? <Navigate to="/login" replace /> : <AuthProvider><ProtectedRoute /></AuthProvider>}
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="portfolio" element={<PortfolioDashboard />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="projects/:projectId/sprints" element={<SprintBoardPage />} />
          <Route path="projects/:projectId/backlog" element={<BacklogPage />} />
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
    </HashRouter>
  );
};

export default App;