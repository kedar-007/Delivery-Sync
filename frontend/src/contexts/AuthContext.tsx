import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi } from '../lib/api';
import { CurrentUser } from '../types';

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  error: string | null;
  needsRegistration: boolean;
  isLoggedOut: boolean;
  refetch: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  error: null,
  needsRegistration: false,
  isLoggedOut: false,
  refetch: async () => {},
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsRegistration, setNeedsRegistration] = useState(false);
  const [isLoggedOut, setIsLoggedOut] = useState(false);

  const fetchUser = async () => {
    // If the user intentionally logged out (local dev), don't re-authenticate
    if (sessionStorage.getItem('ds_logged_out') === '1') {
      setUser(null);
      setIsLoggedOut(true);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      setNeedsRegistration(false);

      const data = await authApi.me();
      console.log('[DeliverySync] current user:', data);
      setUser(data?.user ?? null);

    } catch (err: unknown) {
      const e = err as Error & { status?: number };
      setUser(null);

      if (e.status === 403) {
        setNeedsRegistration(true);
      } else if (e.status === 401) {
        // Only redirect to Catalyst once — sessionStorage prevents the loop
        const KEY = 'ds_auth_redirect';
        const last = Number(sessionStorage.getItem(KEY) || 0);
        if (Date.now() - last > 10000) {
          sessionStorage.setItem(KEY, String(Date.now()));
          window.location.href = '/__catalyst/auth/login';
        } else {
          setError('Could not verify session. Please refresh.');
        }
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = () => {
    setUser(null);
    setError(null);
    setNeedsRegistration(false);
    setIsLoggedOut(true);
    sessionStorage.removeItem('ds_auth_redirect');
    // Set flag BEFORE redirecting so when Catalyst logout brings us back,
    // fetchUser() sees the flag and doesn't auto-re-authenticate via SSO.
    sessionStorage.setItem('ds_logged_out', '1');
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocal) {
      window.location.replace('/#/login');
    } else {
      // /__catalyst/auth/logout requires its redirect_uri to be whitelisted in
      // Catalyst Console — that config isn't set up, so it returns INVALID_URL_PATTERN.
      // Instead we call our own backend logout route which clears the session
      // cookie and redirects to /app/index.html.
      window.location.href = '/server/delivery_sync_function/api/auth/logout';
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, needsRegistration, isLoggedOut, refetch: fetchUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
