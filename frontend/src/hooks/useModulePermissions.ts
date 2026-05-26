import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

export interface ModulePermissions {
  projects: boolean;
  'daily-work': boolean;
  people: boolean;
  assets: boolean;
  time: boolean;
  reports: boolean;
  ai: boolean;
  executive: boolean;
  [key: string]: boolean;
}

const DEFAULTS: ModulePermissions = {
  projects:   true,
  'daily-work': true,
  people:     true,
  assets:     true,
  time:       true,
  reports:    true,
  ai:         true,
  executive:  true,
};

// Per-user localStorage cache so the sidebar renders with the correct module
// state immediately on page reload, eliminating the flash where disabled
// modules briefly appear before the API response arrives.
function lsKey(userId: string) { return `dsv:mods:${userId}`; }

function lsRead(userId: string): ModulePermissions | undefined {
  try {
    const s = localStorage.getItem(lsKey(userId));
    return s ? JSON.parse(s) : undefined;
  } catch { return undefined; }
}

function lsWrite(userId: string, m: ModulePermissions) {
  try { localStorage.setItem(lsKey(userId), JSON.stringify(m)); } catch { /* storage quota */ }
}

export function useModulePermissions() {
  const { user } = useAuth();
  // SUPER_ADMIN bypasses module checks — they're on their own admin page with full access.
  // TENANT_ADMIN now respects module settings so super-admin can gate reports/AI per org.
  const skip = !user || user.role === 'SUPER_ADMIN';
  const userId = user?.id ? String(user.id) : '';

  const { data } = useQuery({
    queryKey: ['module-permissions'],
    queryFn: async () => {
      const m = await adminApi.getModules().then((d) => d.modules as ModulePermissions);
      // Persist so the next page reload serves the correct state instantly.
      if (userId) lsWrite(userId, m);
      return m;
    },
    enabled: !skip,
    staleTime: 0, // always background-refetch on mount so changes propagate immediately
    // Seed with the last-known value from localStorage — prevents the flash
    // where DEFAULTS (all true) renders first before the API responds.
    initialData: !skip && userId ? lsRead(userId) : undefined,
  });

  if (skip) return DEFAULTS;

  // Merge API data with DEFAULTS so any key the backend doesn't return yet
  // (e.g. newly added modules) stays enabled rather than becoming undefined → falsy.
  const tenantModules: ModulePermissions = data ? { ...DEFAULTS, ...data } : DEFAULTS;

  // Overlay org-role module access: if the user's org role has disabled a module,
  // mark it false regardless of the tenant-level setting.
  const disabledByRole: string[] = Array.isArray(user?.moduleAccess) ? user.moduleAccess : [];
  if (disabledByRole.length === 0) return tenantModules;

  const result: ModulePermissions = { ...tenantModules };
  for (const key of disabledByRole) {
    result[key] = false;
  }
  return result;
}
