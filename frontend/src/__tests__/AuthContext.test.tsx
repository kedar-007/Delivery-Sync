import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';

// Mock api.ts before importing AuthContext to prevent axios ESM error
jest.mock('../lib/api', () => ({
  authApi: {
    me: jest.fn(),
  },
}));

import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { authApi } from '../lib/api';

const mockedMe = (authApi as any).me as jest.Mock;

// Helper component that exposes auth state
const AuthConsumer = () => {
  const { user, loading, isLoggedOut } = useAuth();
  if (loading) return <div>loading</div>;
  if (isLoggedOut) return <div>logged-out</div>;
  if (!user) return <div>no-user</div>;
  return <div>user:{user.email}</div>;
};

const renderWithAuth = () =>
  render(
    <AuthProvider>
      <AuthConsumer />
    </AuthProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

describe('AuthProvider', () => {
  test('shows loading then resolves user on success', async () => {
    mockedMe.mockResolvedValueOnce({
      user: {
        id: '1', email: 'test@example.com', name: 'Test User',
        role: 'TEAM_MEMBER', tenantId: '42', tenantSlug: 'acme',
        tenantName: 'Acme Corp', status: 'ACTIVE', avatarUrl: '',
      },
    });

    renderWithAuth();
    expect(screen.getByText('loading')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('user:test@example.com')).toBeInTheDocument();
    });
  });

  test('stores tenantSlug in localStorage after successful fetch', async () => {
    mockedMe.mockResolvedValueOnce({
      user: {
        id: '1', email: 'lead@example.com', name: 'Lead',
        role: 'DELIVERY_LEAD', tenantId: '10', tenantSlug: 'my-org',
        tenantName: 'My Org', status: 'ACTIVE', avatarUrl: '',
      },
    });

    renderWithAuth();
    await waitFor(() => {
      expect(localStorage.getItem('tenantSlug')).toBe('my-org');
    });
  });

  test('shows no-user when API returns 401', async () => {
    const err = Object.assign(new Error('Unauthorized'), { status: 401 });
    mockedMe.mockRejectedValueOnce(err);

    renderWithAuth();

    await waitFor(() => {
      expect(screen.getByText('no-user')).toBeInTheDocument();
    });
  });

  test('skips API call when ds_logged_out flag is set', async () => {
    localStorage.setItem('ds_logged_out', '1');

    renderWithAuth();

    await waitFor(() => {
      expect(screen.getByText('logged-out')).toBeInTheDocument();
    });
    expect(mockedMe).not.toHaveBeenCalled();
  });

  test('provides refetch to re-fetch user', async () => {
    mockedMe
      .mockResolvedValueOnce({
        user: {
          id: '1', email: 'a@example.com', name: 'A', role: 'TEAM_MEMBER',
          tenantId: '1', tenantSlug: 'slug', tenantName: 'Org', status: 'ACTIVE', avatarUrl: '',
        },
      })
      .mockResolvedValueOnce({
        user: {
          id: '1', email: 'b@example.com', name: 'B', role: 'TEAM_MEMBER',
          tenantId: '1', tenantSlug: 'slug', tenantName: 'Org', status: 'ACTIVE', avatarUrl: '',
        },
      });

    const RefetchConsumer = () => {
      const { user, loading, refetch } = useAuth();
      if (loading) return <div>loading</div>;
      return (
        <div>
          <span>{user?.email}</span>
          <button onClick={refetch}>refetch</button>
        </div>
      );
    };

    const { getByText } = render(
      <AuthProvider><RefetchConsumer /></AuthProvider>
    );

    await waitFor(() => getByText('a@example.com'));

    act(() => { getByText('refetch').click(); });

    await waitFor(() => getByText('b@example.com'));
    expect(mockedMe).toHaveBeenCalledTimes(2);
  });
});
