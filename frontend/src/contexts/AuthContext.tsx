import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi } from '../lib/api';
import { CurrentUser } from '../types';

export interface SuspensionInfo {
  status: string;
  tenantName: string;
  reason: string | null;
  lockType: string | null;
  lockedAt: string | null;
  unlockDate: string | null;
}

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  error: string | null;
  needsRegistration: boolean;
  isLoggedOut: boolean;
  suspensionInfo: SuspensionInfo | null;
  refetch: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  error: null,
  needsRegistration: false,
  isLoggedOut: false,
  suspensionInfo: null,
  refetch: async () => {},
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsRegistration, setNeedsRegistration] = useState(false);
  const [isLoggedOut, setIsLoggedOut] = useState(false);
  const [suspensionInfo, setSuspensionInfo] = useState<SuspensionInfo | null>(null);

  const fetchUser = async () => {
    try {
      setLoading(true);
      setError(null);
      setNeedsRegistration(false);
      setSuspensionInfo(null);

      const data = await authApi.me();
      const u = data?.user ?? null;
      setUser(u);
      if (u) {
        const slug = u.tenantSlug || localStorage.getItem('tenantSlug') || '';
        if (slug) localStorage.setItem('tenantSlug', slug);
      }
    } catch (err: unknown) {
      const e = err as Error & { status?: number; data?: { code?: string; suspension?: SuspensionInfo } };
      setUser(null);

      if (e.status === 403 && e.data?.code === 'TENANT_SUSPENDED' && e.data.suspension) {
        setSuspensionInfo(e.data.suspension);
      } else if (e.status === 403) {
        setNeedsRegistration(true);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = async () => {
    setUser(null);
    setIsLoggedOut(true);
    localStorage.setItem('ds_logged_out', '1');
    localStorage.removeItem('tenantSlug');
    sessionStorage.clear();

    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const catalyst = (window as any).catalyst;

    if (isLocal) {
      window.location.replace(`${window.location.origin}/app/index.html#/login`);
      return;
    }

    if (typeof catalyst?.auth?.signOut === 'function') {
      try {
        catalyst.auth.signOut(`${window.location.origin}/app/index.html`);
        return;
      } catch (e) {
        console.warn('[DS Auth] catalyst.auth.signOut threw:', e);
      }
    }

    window.location.href = '/server/delivery_sync_function/api/auth/logout';
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, needsRegistration, isLoggedOut, suspensionInfo, refetch: fetchUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
