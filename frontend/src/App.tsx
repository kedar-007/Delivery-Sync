import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/layout/ProtectedRoute';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import PortfolioDashboard from './pages/PortfolioDashboard';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import MilestonesPage from './pages/MilestonesPage';
import StandupPage from './pages/StandupPage';
import EodPage from './pages/EodPage';
import ActionsPage from './pages/ActionsPage';
import BlockersPage from './pages/BlockersPage';
import RaidPage from './pages/RaidPage';
import DecisionsPage from './pages/DecisionsPage';
import ReportsPage from './pages/ReportsPage';
import AdminPage from './pages/AdminPage';
import SuperAdminPage from './pages/SuperAdminPage';
import ReportDetailPage from './pages/ReportDetailPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import TeamsPage from './pages/TeamsPage';
import AiInsightsPage from './pages/AiInsightsPage';
import CeoDashboardPage from './pages/CeoDashboardPage';
import CtoDashboardPage from './pages/CtoDashboardPage';
// ── Enterprise modules ────────────────────────────────────────────────────────
import AttendancePage from './pages/AttendancePage';
import LeavePage from './pages/LeavePage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import OrgChartPage from './pages/OrgChartPage';
import DirectoryPage from './pages/DirectoryPage';
import SprintBoardPage from './pages/SprintBoardPage';
import BacklogPage from './pages/BacklogPage';
import TimeTrackingPage from './pages/TimeTrackingPage';
import AssetManagementPage from './pages/AssetManagementPage';
import EnterpriseReportsPage from './pages/EnterpriseReportsPage';
import AdminConfigPage from './pages/AdminConfigPage';
import ProjectTasksPage from './pages/ProjectTasksPage';
import MyTasksPage from './pages/MyTasksPage';
import SprintsPage from './pages/SprintsPage';
import HelpPage from './pages/HelpPage';

const App = () => (
  <HashRouter>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/super-admin" element={<SuperAdminPage />} />

      {/* Public shareable report — no auth required */}
      <Route path="/:tenantSlug/reports/:reportId" element={<ReportDetailPage />} />

      {/* All protected routes live under /:tenantSlug so the slug appears in the URL */}
      <Route path="/:tenantSlug" element={<ProtectedRoute />}>
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
        {/* ── People module ───────────────────────────────────────────────────── */}
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="leave" element={<LeavePage />} />
        <Route path="announcements" element={<AnnouncementsPage />} />
        <Route path="org-chart" element={<OrgChartPage />} />
        <Route path="directory" element={<DirectoryPage />} />
        {/* ── Work module ─────────────────────────────────────────────────────── */}
        <Route path="time-tracking" element={<TimeTrackingPage />} />
        <Route path="assets" element={<AssetManagementPage />} />
        {/* ── Reports ─────────────────────────────────────────────────────────── */}
        <Route path="reports" element={<ReportsPage />} />
        <Route path="enterprise-reports" element={<EnterpriseReportsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="ai-insights"   element={<AiInsightsPage />} />
        <Route path="ceo-dashboard" element={<CeoDashboardPage />} />
        <Route path="cto-dashboard" element={<CtoDashboardPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="admin-config" element={<AdminConfigPage />} />
        <Route path="help" element={<HelpPage />} />
      </Route>

      {/* Fallback — ProtectedRoute will redirect to /:tenantSlug/dashboard once auth resolves */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  </HashRouter>
);

export default App;
