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

export const useActivateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.activateUser(id),
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

export const useMyPermissions = () =>
  useQuery({
    queryKey: ['my-permissions'],
    queryFn: () => adminApi.getMyPermissions(),
    staleTime: 2 * 60 * 1000,
  });

export const useUserPermissions = (userId: string, enabled = true) =>
  useQuery({
    queryKey: ['user-permissions', userId],
    queryFn: () => adminApi.getUserPermissions(userId),
    enabled: enabled && !!userId,
    staleTime: 60 * 1000,
  });

export const useSetUserPermissions = (userId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { granted: string[]; revoked: string[] }) =>
      adminApi.setUserPermissions(userId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-permissions', userId] }),
  });
};

// ── Org Roles hooks ───────────────────────────────────────────────────────────

export const useOrgRoles = () =>
  useQuery({
    queryKey: ['org-roles'],
    queryFn: () => adminApi.listOrgRoles().then((d: any) => d.roles ?? []),
    staleTime: 60 * 1000,
  });

export const useAllPermissions = () =>
  useQuery({
    queryKey: ['all-permissions'],
    queryFn: () => adminApi.getAllPermissions(),
    staleTime: 10 * 60 * 1000,
  });

export const useOrgChart = () =>
  useQuery({
    queryKey: ['org-chart'],
    queryFn: () => adminApi.getOrgChart(),
    staleTime: 60 * 1000,
  });

export const useCreateOrgRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => adminApi.createOrgRole(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-roles'] });
      qc.invalidateQueries({ queryKey: ['org-chart'] });
    },
  });
};

export const useUpdateOrgRole = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => adminApi.updateOrgRole(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-roles'] });
      qc.invalidateQueries({ queryKey: ['org-chart'] });
    },
  });
};

export const useDeleteOrgRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.deleteOrgRole(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-roles'] });
      qc.invalidateQueries({ queryKey: ['org-chart'] });
    },
  });
};

export const useSetOrgRolePermissions = (roleId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (permissions: string[]) => adminApi.setOrgRolePermissions(roleId, permissions),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-roles'] }),
  });
};

export const useAssignUserOrgRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, orgRoleId }: { userId: string; orgRoleId: string | null }) =>
      adminApi.assignUserOrgRole(userId, orgRoleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-roles'] });
      qc.invalidateQueries({ queryKey: ['org-chart'] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });
};

// ── Data Sharing Rules hooks ──────────────────────────────────────────────────

export const useSharingRules = (roleId: string | null) =>
  useQuery({
    queryKey: ['sharing-rules', roleId],
    queryFn: async () => {
      const data = await adminApi.getSharingRules(roleId!);
      const rules: any[] = data.rules ?? [];
      const defaultVisibility = rules.find((r) => r.visibilityScope !== 'EXPLICIT') ?? null;
      const explicitRules = rules.filter((r) => r.visibilityScope === 'EXPLICIT');
      return { defaultVisibility, explicitRules };
    },
    enabled: !!roleId,
    staleTime: 30 * 1000,
  });

export const useSetDefaultVisibility = (roleId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { visibilityScope: string; accessLevel?: string; recordTypes?: string[] }) =>
      adminApi.setDefaultVisibility(roleId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sharing-rules', roleId] }),
  });
};

export const useAddExplicitSharingRule = (roleId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { targetRoleId: string; accessLevel?: string; recordTypes?: string[] }) =>
      adminApi.addExplicitSharingRule(roleId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sharing-rules', roleId] }),
  });
};

export const useDeleteSharingRule = (roleId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) => adminApi.deleteSharingRule(ruleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sharing-rules', roleId] }),
  });
};
