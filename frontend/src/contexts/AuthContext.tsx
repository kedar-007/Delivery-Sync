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
  needsOrgSetup: boolean;
  isLoggedOut: boolean;
  isDeactivated: boolean;
  suspensionInfo: SuspensionInfo | null;
  refetch: (silent?: boolean) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  error: null,
  needsRegistration: false,
  needsOrgSetup: false,
  isLoggedOut: false,
  isDeactivated: false,
  suspensionInfo: null,
  refetch: async (_silent?: boolean) => { },
  logout: async () => { },
});

export const useAuth = () => useContext(AuthContext);

// ── Helpers ───────────────────────────────────────────────────────────────────

const clearAllSiteData = () => {

  localStorage.clear();
  sessionStorage.clear();

  document.cookie.split(';').forEach((cookie) => {
    const name = cookie.split('=')[0].trim();
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/app`;
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/server`;
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; domain=${window.location.hostname}; path=/`;
  });

  if ('caches' in window) {
    caches.keys().then((names) => names.forEach((n) => caches.delete(n)));
  }

  if ('indexedDB' in window) {
    indexedDB.databases?.().then((dbs) => {
      dbs.forEach((db) => { if (db.name) indexedDB.deleteDatabase(db.name); });
    }).catch(() => { });
  }
};

// ── Provider ──────────────────────────────────────────────────────────────────

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsRegistration, setNeedsReg] = useState(false);
  const [needsOrgSetup, setNeedsOrgSetup] = useState(false);
  const [isLoggedOut, setIsLoggedOut] = useState(
    // Initialise from localStorage so first render is correct
    localStorage.getItem('ds_logged_out') === '1'
  );
  const [suspensionInfo, setSuspensionInfo] = useState<SuspensionInfo | null>(null);
  const [isDeactivated, setIsDeactivated] = useState(false);

  const fetchUser = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      if (!silent) {
        // For silent refetch (e.g. after org setup) do NOT pre-clear these — clearing them
        // before the API responds creates a window where needsOrgSetup=false + user=null,
        // which triggers the catch-all route to redirect to /login.
        setNeedsReg(false);
        setNeedsOrgSetup(false);
        setSuspensionInfo(null);
        setIsDeactivated(false);
      }

      const data = await authApi.me();
      const u = data?.user ?? null;
      // Batch all state updates together after the API call so no intermediate
      // render sees an inconsistent state (e.g. user=null + needsOrgSetup=false).
      setUser(u);
      setIsLoggedOut(false);
      localStorage.removeItem('ds_logged_out'); // session confirmed valid — clear stale flag
      if (silent) {
        setNeedsReg(false);
        setNeedsOrgSetup(false);
        setSuspensionInfo(null);
        setIsDeactivated(false);
      }

      if (u?.tenantSlug) {
        localStorage.setItem('tenantSlug', u.tenantSlug);
      }
    } catch (err: unknown) {
      const e = err as Error & {
        status?: number;
        data?: { code?: string; suspension?: SuspensionInfo };
      };
      setUser(null);

      if (e.status === 403 && e.data?.code === 'TENANT_SUSPENDED' && e.data.suspension) {
        setSuspensionInfo(e.data.suspension);
      } else if (e.status === 403 && e.data?.code === 'USER_DEACTIVATED') {
        setIsDeactivated(true);
      } else if (e.status === 403 && e.data?.code === 'NEEDS_ORG_SETUP') {
        setNeedsOrgSetup(true);
      } else if (e.status === 403) {
        setNeedsReg(true);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    // Always call fetchUser on mount, even if ds_logged_out='1' is in localStorage.
    // An invited user who has a valid Catalyst session (accepted the invite email)
    // must not be blocked by a stale logout flag left over from a previous user's
    // logout on the same browser. If the session really is invalid, /me returns 401
    // and the login page is shown — same end result, but without the false block.
    fetchUser();
    // Silently refetch permissions when the tab becomes visible again (e.g. after admin
    // grants a new permission in another tab). Silent = no full-screen loader so the
    // current page stays visible while the check runs in the background.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && localStorage.getItem('ds_logged_out') !== '1') {
        fetchUser(true);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = async () => {
    // 1. Update React state immediately
    setUser(null);
    setIsLoggedOut(true);
    setNeedsReg(false);
    setSuspensionInfo(null);
    setLoading(false);

    // 2. Clear all site data
    clearAllSiteData();

    // 3. Set logout flag AFTER clear (clearAllSiteData wipes localStorage)
    localStorage.setItem('ds_logged_out', '1');

    // 4. Yield one frame so React can flush state before navigation
    await new Promise((r) => requestAnimationFrame(r));

    // 5. Sign out via Catalyst SDK — it clears the SSO session cookie and
    //    redirects the browser to redirectURL. Same pattern as LMS reference.
    try {
      const redirectURL = `${window.location.origin}/app/index.html#/login`;
      await (window as any).catalyst?.auth?.signOut?.(redirectURL);
    } catch (e) {
      console.warn('[DS Auth] signOut threw:', e);
      // Fallback — hard navigate to login
      window.location.replace(`${window.location.origin}/app/index.html#/login`);
    }
  };

  return (
    <AuthContext.Provider value={{
      user, loading, error,
      needsRegistration, needsOrgSetup, isLoggedOut, isDeactivated,
      suspensionInfo,
      refetch: fetchUser,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
};