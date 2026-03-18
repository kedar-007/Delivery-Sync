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
        <Route path="milestones" element={<MilestonesPage />} />
        <Route path="standup" element={<StandupPage />} />
        <Route path="eod" element={<EodPage />} />
        <Route path="actions" element={<ActionsPage />} />
        <Route path="blockers" element={<BlockersPage />} />
        <Route path="raid" element={<RaidPage />} />
        <Route path="decisions" element={<DecisionsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="admin" element={<AdminPage />} />
      </Route>

      {/* Fallback — ProtectedRoute will redirect to /:tenantSlug/dashboard once auth resolves */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  </HashRouter>
);

export default App;
