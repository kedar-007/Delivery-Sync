import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../lib/api';
import { useToast } from '../components/ui/Toast';

export const useAdminUsers = (params?: Record<string, string>) =>
  useQuery({
    queryKey: ['admin-users', params],
    queryFn: () => adminApi.listUsers(params).then((d) => d.users),
  });

export const useInviteUser = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => adminApi.inviteUser(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); toast.success('Invitation sent'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to send invitation'),
  });
};

export const useUpdateAdminUser = (userId: string) => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => adminApi.updateUser(userId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); toast.success('User updated'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to update user'),
  });
};

export const useDeactivateUser = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: string) => adminApi.deactivateUser(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); toast.success('User deactivated'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to deactivate user'),
  });
};

export const useActivateUser = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: string) => adminApi.activateUser(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); toast.success('User activated'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to activate user'),
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
    queryFn: () => adminApi.getAuditLogs(params),
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
  const toast = useToast();
  return useMutation({
    mutationFn: (data: { granted: string[]; revoked: string[]; moduleAccess?: string[] }) =>
      adminApi.setUserPermissions(userId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-permissions', userId] });
      qc.invalidateQueries({ queryKey: ['module-permissions'] });
      toast.success('Permissions saved');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to save permissions'),
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
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => adminApi.createOrgRole(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-roles'] });
      qc.invalidateQueries({ queryKey: ['org-chart'] });
      toast.success('Role created');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to create role'),
  });
};

export const useUpdateOrgRole = (id: string) => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => adminApi.updateOrgRole(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-roles'] });
      qc.invalidateQueries({ queryKey: ['org-chart'] });
      toast.success('Role updated');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update role'),
  });
};

export const useDeleteOrgRole = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: string) => adminApi.deleteOrgRole(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-roles'] });
      qc.invalidateQueries({ queryKey: ['org-chart'] });
      toast.success('Role deleted');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to delete role'),
  });
};

export const useSetOrgRolePermissions = (roleId: string) => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ permissions, moduleAccess }: { permissions: string[]; moduleAccess: string[] }) =>
      adminApi.setOrgRolePermissions(roleId, permissions, moduleAccess),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-roles'] });
      qc.invalidateQueries({ queryKey: ['module-permissions'] });
      toast.success('Permissions saved');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to save permissions'),
  });
};

export const useAssignUserOrgRole = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ userId, orgRoleId }: { userId: string; orgRoleId: string | null }) =>
      adminApi.assignUserOrgRole(userId, orgRoleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-roles'] });
      qc.invalidateQueries({ queryKey: ['org-chart'] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('Role assigned');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to assign role'),
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
  const toast = useToast();
  return useMutation({
    mutationFn: (data: { visibilityScope: string; accessLevel?: string; recordTypes?: string[] }) =>
      adminApi.setDefaultVisibility(roleId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sharing-rules', roleId] }); toast.success('Visibility rule saved'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to save visibility rule'),
  });
};

export const useAddExplicitSharingRule = (roleId: string) => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: { targetRoleId: string; accessLevel?: string; recordTypes?: string[] }) =>
      adminApi.addExplicitSharingRule(roleId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sharing-rules', roleId] }); toast.success('Sharing rule added'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to add sharing rule'),
  });
};

export const useDeleteSharingRule = (roleId: string) => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (ruleId: string) => adminApi.deleteSharingRule(ruleId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sharing-rules', roleId] }); toast.success('Sharing rule removed'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to remove sharing rule'),
  });
};

export const useOfficeLocations = () =>
  useQuery({
    queryKey: ['office-locations'],
    queryFn: () => adminApi.getOfficeLocations().then((d) => (d.locations ?? []) as { id: string; name: string; country?: string; timezone?: string }[]),
    staleTime: 60 * 1000,
  });

export const useUpdateUserLocation = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ userId, officeLocationId }: { userId: string; officeLocationId: string | null }) =>
      adminApi.updateUserLocation(userId, officeLocationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('Location assigned');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to assign location'),
  });
};
