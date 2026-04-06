import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

export interface ModulePermissions {
  projects: boolean;
  people: boolean;
  assets: boolean;
  time: boolean;
  reports: boolean;
  ai: boolean;
  exec: boolean;
  [key: string]: boolean;
}

const DEFAULTS: ModulePermissions = {
  projects: true,
  people:   true,
  assets:   true,
  time:     true,
  reports:  true,
  ai:       true,
  exec:     true,
};

export function useModulePermissions() {
  const { user } = useAuth();
  // SUPER_ADMIN bypasses module checks — always has full access
  const skip = !user || user.role === 'SUPER_ADMIN';

  const { data } = useQuery({
    queryKey: ['module-permissions'],
    queryFn: () => adminApi.getModules().then((d) => d.modules as ModulePermissions),
    enabled: !skip,
    staleTime: 5 * 60 * 1000,
  });

  return skip ? DEFAULTS : (data ?? DEFAULTS);
}
