import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../lib/api';

export const useAdminUsers = (params?: Record<string, string>) =>
  useQuery({
    queryKey: ['admin-users', params],
    queryFn: () => adminApi.listUsers(params).then((d) => d.users),
  });

export const useInviteUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => adminApi.inviteUser(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
};

export const useUpdateAdminUser = (userId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => adminApi.updateUser(userId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
};

export const useDeactivateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.deactivateUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
};

export const useTenant = () =>
  useQuery({
    queryKey: ['tenant'],
    queryFn: () => adminApi.getTenant().then((d) => d.tenant),
  });

export const useAuditLogs = (params?: Record<string, string>, enabled = true) =>
  useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () => adminApi.getAuditLogs(params).then((d) => d.logs ?? []),
    enabled,
    staleTime: 30 * 1000,
  });
