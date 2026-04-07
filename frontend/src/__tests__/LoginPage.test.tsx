import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Prevent axios ESM parse errors (LoginPage → no api imports, but be safe)
jest.mock('../lib/api', () => ({ authApi: { me: jest.fn() } }));

import LoginPage from '../pages/LoginPage';

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear();
    (window as any).catalyst = undefined;
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

  test('renders brand headline', () => {
    renderPage();
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
  });

  test('renders the login container div', () => {
    renderPage();
    expect(document.getElementById('loginDivElementId')).toBeInTheDocument();
  });

  test('clears ds_logged_out and tenantSlug from localStorage on mount', async () => {
    localStorage.setItem('ds_logged_out', '1');
    localStorage.setItem('tenantSlug', 'old-slug');

    renderPage();

    await waitFor(() => {
      expect(localStorage.getItem('ds_logged_out')).toBeNull();
      expect(localStorage.getItem('tenantSlug')).toBeNull();
    });
  });

  test('calls catalyst.auth.signIn when SDK is available', async () => {
    // Make requestAnimationFrame synchronous so the mount() callback fires immediately
    const originalRaf = window.requestAnimationFrame;
    (window as any).requestAnimationFrame = (cb: FrameRequestCallback) => { cb(0); return 0; };

    const signInMock = jest.fn();
    (window as any).catalyst = { auth: { signIn: signInMock } };

    renderPage();

    // Flush the microtask: Promise.resolve().then(() => requestAnimationFrame(mount))
    await act(async () => {
      await Promise.resolve();
    });

    expect(signInMock).toHaveBeenCalledTimes(1);
    const [elementId, opts] = signInMock.mock.calls[0];
    expect(elementId).toBe('loginDivElementId');
    expect(opts).toMatchObject({ service_url: '/app/index.html' });

    (window as any).requestAnimationFrame = originalRaf;
  });

  test('does not throw when catalyst SDK is not available', async () => {
    (window as any).catalyst = undefined;
    expect(() => renderPage()).not.toThrow();
  });
});
