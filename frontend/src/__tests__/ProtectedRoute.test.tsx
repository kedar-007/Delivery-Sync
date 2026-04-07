import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Mock AuthContext without using jest.requireActual to avoid pulling in api.ts → axios
jest.mock('../contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

// Mock api.ts to prevent axios ESM import errors
jest.mock('../lib/api', () => ({
  authApi: { me: jest.fn() },
}));

import ProtectedRoute from '../components/layout/ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';

const mockedUseAuth = useAuth as jest.Mock;

const buildUser = (overrides = {}) => ({
  id: '1',
  email: 'user@example.com',
  name: 'Test User',
  role: 'TEAM_MEMBER',
  tenantId: '10',
  tenantSlug: 'acme',
  tenantName: 'Acme Corp',
  status: 'ACTIVE',
  avatarUrl: '',
  ...overrides,
});

const renderRoutes = (initialPath: string) =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>login-page</div>} />
        <Route path="/super-admin" element={<div>super-admin-page</div>} />
        <Route path="/:tenantSlug" element={<ProtectedRoute />}>
          <Route path="dashboard" element={<div>dashboard</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

describe('ProtectedRoute', () => {
  test('shows loader while auth is loading', () => {
    mockedUseAuth.mockReturnValue({
      user: null, loading: true, isLoggedOut: false,
      needsRegistration: false, suspensionInfo: null,
    });
    renderRoutes('/acme/dashboard');
    expect(screen.queryByText('login-page')).not.toBeInTheDocument();
    expect(screen.queryByText('dashboard')).not.toBeInTheDocument();
  });

  test('redirects to /login when not authenticated', () => {
    mockedUseAuth.mockReturnValue({
      user: null, loading: false, isLoggedOut: false,
      needsRegistration: false, suspensionInfo: null,
    });
    renderRoutes('/acme/dashboard');
    expect(screen.getByText('login-page')).toBeInTheDocument();
  });

  test('redirects to /login when isLoggedOut is true', () => {
    mockedUseAuth.mockReturnValue({
      user: buildUser(), loading: false, isLoggedOut: true,
      needsRegistration: false, suspensionInfo: null,
    });
    renderRoutes('/acme/dashboard');
    expect(screen.getByText('login-page')).toBeInTheDocument();
  });

  test('renders dashboard for authenticated user with matching slug', () => {
    mockedUseAuth.mockReturnValue({
      user: buildUser(), loading: false, isLoggedOut: false,
      needsRegistration: false, suspensionInfo: null,
    });
    renderRoutes('/acme/dashboard');
    expect(screen.getByText('dashboard')).toBeInTheDocument();
  });

  test('redirects SUPER_ADMIN to /super-admin', () => {
    mockedUseAuth.mockReturnValue({
      user: buildUser({ role: 'SUPER_ADMIN', tenantSlug: '' }),
      loading: false, isLoggedOut: false,
      needsRegistration: false, suspensionInfo: null,
    });
    renderRoutes('/acme/dashboard');
    expect(screen.getByText('super-admin-page')).toBeInTheDocument();
  });

  test('redirects to /login when needsRegistration is true', () => {
    mockedUseAuth.mockReturnValue({
      user: null, loading: false, isLoggedOut: false,
      needsRegistration: true, suspensionInfo: null,
    });
    renderRoutes('/acme/dashboard');
    expect(screen.getByText('login-page')).toBeInTheDocument();
  });
});
