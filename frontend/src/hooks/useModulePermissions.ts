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

export function useModulePermissions() {
  const { user } = useAuth();
  // SUPER_ADMIN and TENANT_ADMIN bypass module checks — always have full access
  const skip = !user || user.role === 'SUPER_ADMIN' || user.role === 'TENANT_ADMIN';

  const { data } = useQuery({
    queryKey: ['module-permissions'],
    queryFn: () => adminApi.getModules().then((d) => d.modules as ModulePermissions),
    enabled: !skip,
    staleTime: 60 * 1000, // 1 minute — module changes propagate within a reasonable window
  });

  if (skip) return DEFAULTS;

  const tenantModules = data ?? DEFAULTS;

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
