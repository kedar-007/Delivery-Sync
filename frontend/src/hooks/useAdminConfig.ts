import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, adminConfigApi, leaveApi, attendanceApi, badgesApi } from '../lib/api';

// ── Field Normalisers ─────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normaliseWorkflow = (r: any) => ({
  ...r,
  id:           String(r.ROWID ?? r.id ?? ''),
  entityType:   r.entity_type ?? r.entityType,
  isDefault:    r.is_default === 'true' || r.is_default === true || r.isDefault === true,
  isActive:     r.is_active  === 'true' || r.is_active  === true || r.isActive  === true,
  statuses:     (() => { try { return JSON.parse(r.statuses ?? '[]'); } catch { return []; } })(),
  transitions:  (() => { try { return JSON.parse(r.transitions ?? '[]'); } catch { return []; } })(),
  createdBy:    r.CREATORID  ?? r.created_by  ?? r.createdBy,
  createdAt:    r.CREATEDTIME ?? r.created_at ?? r.createdAt,
  updatedAt:    r.MODIFIEDTIME ?? r.updated_at ?? r.updatedAt,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normaliseForm = (r: any) => ({
  ...r,
  id:          String(r.ROWID ?? r.id ?? ''),
  formType:    r.form_type ?? r.formType,
  isActive:    r.is_active === 'true' || r.is_active === true || r.isActive === true,
  fields:      (() => { try { return JSON.parse(r.fields ?? '[]'); } catch { return []; } })(),
  validations: (() => { try { return JSON.parse(r.validations ?? '{}'); } catch { return {}; } })(),
  version:     parseInt(r.version ?? 1, 10),
  createdBy:   r.CREATORID  ?? r.created_by  ?? r.createdBy,
  createdAt:   r.CREATEDTIME ?? r.created_at ?? r.createdAt,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normaliseFlag = (r: any) => ({
  ...r,
  id:               String(r.ROWID ?? r.id ?? ''),
  featureName:      r.feature_name       ?? r.featureName,
  isEnabled:        r.is_enabled === 'true' || r.is_enabled === true || r.isEnabled === true,
  config:           (() => { try { return JSON.parse(r.config ?? '{}'); } catch { return {}; } })(),
  enabledForRoles:  (() => { try { return JSON.parse(r.enabled_for_roles ?? r.enabledForRoles ?? '[]'); } catch { return []; } })(),
  enabledForUsers:  (() => { try { return JSON.parse(r.enabled_for_users ?? r.enabledForUsers ?? '[]'); } catch { return []; } })(),
  updatedBy:        r.CREATORID ?? r.updated_by ?? r.updatedBy,
  updatedAt:        r.MODIFIEDTIME ?? r.updated_at ?? r.updatedAt,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normaliseLeaveType = (r: any) => ({
  ...r,
  id:               String(r.ROWID ?? r.id ?? ''),
  daysPerYear:      parseFloat(r.days_per_year      ?? r.daysPerYear      ?? 0),
  carryForwardDays: parseFloat(r.carry_forward_days ?? r.carryForwardDays ?? 0),
  requiresApproval: r.requires_approval === 'true' || r.requires_approval === true || r.requiresApproval === true,
  minDays:          parseFloat(r.min_days ?? r.minDays ?? 0.5),
  maxDays:          parseFloat(r.max_days ?? r.maxDays ?? 30),
  noticeDays:       parseInt(r.notice_days ?? r.noticeDays ?? 1, 10),
  isPaid:           r.is_paid   === 'true' || r.is_paid   === true || r.isPaid   === true,
  isActive:         r.is_active === 'true' || r.is_active === true || r.isActive === true,
  createdAt:        r.CREATEDTIME ?? r.created_at ?? r.createdAt,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normaliseBadgeDef = (r: any) => ({
  ...r,
  id:               String(r.ROWID ?? r.id ?? ''),
  isAutoAwardable:  r.is_auto_awardable === 'true' || r.is_auto_awardable === true || r.isAutoAwardable === true,
  isActive:         r.is_active === 'true' || r.is_active === true || r.isActive === true,
  autoAwardConfig:  (() => { try { return JSON.parse(r.auto_award_config ?? r.autoAwardConfig ?? '{}'); } catch { return {}; } })(),
  logoUrl:          r.logo_url ?? r.logoUrl ?? null,
  createdBy:        r.CREATORID ?? r.created_by ?? r.createdBy,
  createdAt:        r.CREATEDTIME ?? r.created_at ?? r.createdAt,
});

const applyNorm = <T>(norm: (r: unknown) => T) =>
  (res: unknown): T | T[] => {
    if (Array.isArray(res)) return res.map(norm);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (res as any);
    if (d?.data && Array.isArray(d.data)) return { ...d, data: d.data.map(norm) } as unknown as T;
    return norm(res);
  };

// ── Workflow Hooks ────────────────────────────────────────────────────────────
export const useWorkflows = (params?: Record<string, string>) =>
  useQuery({
    queryKey: ['config', 'workflows', params],
    queryFn: () => adminConfigApi.workflows.list(params).then(applyNorm(normaliseWorkflow)),
  });

export const useCreateWorkflow = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => adminConfigApi.workflows.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'workflows'] }),
  });
};

export const useUpdateWorkflow = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => adminConfigApi.workflows.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'workflows'] }),
  });
};

export const useDeleteWorkflow = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminConfigApi.workflows.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'workflows'] }),
  });
};

export const useActivateWorkflow = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminConfigApi.workflows.activate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'workflows'] }),
  });
};

// ── Feature Flag Hooks ────────────────────────────────────────────────────────
export const useFeatureFlags = () =>
  useQuery({
    queryKey: ['config', 'features'],
    queryFn: () => adminConfigApi.features.list().then(applyNorm(normaliseFlag)),
  });

export const useCreateFeatureFlag = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => adminConfigApi.features.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'features'] }),
  });
};

export const useUpdateFeatureFlag = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ flagName, data }: { flagName: string; data: unknown }) =>
      adminConfigApi.features.update(flagName, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'features'] }),
  });
};

// ── Form Config Hooks ─────────────────────────────────────────────────────────
export const useFormConfigs = (params?: Record<string, string>) =>
  useQuery({
    queryKey: ['config', 'forms', params],
    queryFn: () => adminConfigApi.forms.list(params).then(applyNorm(normaliseForm)),
  });

export const useCreateFormConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => adminConfigApi.forms.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'forms'] }),
  });
};

export const useUpdateFormConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => adminConfigApi.forms.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'forms'] }),
  });
};

// ── Permission Hooks ──────────────────────────────────────────────────────────
export const usePermissionMatrix = () =>
  useQuery({
    queryKey: ['config', 'permissions', 'matrix'],
    queryFn: () => adminConfigApi.permissions.matrix(),
  });

export const useOverrideRolePermissions = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ role, data }: { role: string; data: unknown }) =>
      adminConfigApi.permissions.overrideRole(role, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'permissions'] }),
  });
};

// ── Leave Type Hooks ──────────────────────────────────────────────────────────
export const useLeaveTypes = () =>
  useQuery({
    queryKey: ['config', 'leave-types'],
    queryFn: () => leaveApi.listTypes().then(applyNorm(normaliseLeaveType)),
  });

export const useCreateLeaveType = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => leaveApi.createType(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'leave-types'] }),
  });
};

export const useUpdateLeaveType = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => leaveApi.updateType(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'leave-types'] }),
  });
};

// ── Badge Definition Hooks ────────────────────────────────────────────────────
export const useBadgeDefinitions = () =>
  useQuery({
    queryKey: ['config', 'badge-defs'],
    queryFn: () => badgesApi.list().then(applyNorm(normaliseBadgeDef)),
  });

export const useCreateBadgeDefinition = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => badgesApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'badge-defs'] }),
  });
};

export const useUpdateBadgeDefinition = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => badgesApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'badge-defs'] }),
  });
};

// ── Org Role Permission Hooks ─────────────────────────────────────────────────
export const useOrgRoles = () =>
  useQuery({
    queryKey: ['admin', 'org-roles'],
    queryFn: () => adminApi.listOrgRoles(),
  });

export const useAllPermissions = () =>
  useQuery({
    queryKey: ['admin', 'permissions', 'all'],
    queryFn: () => adminApi.getAllPermissions(),
    staleTime: Infinity,
  });

export const useSetOrgRolePermissions = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, permissions }: { roleId: string; permissions: string[] }) =>
      adminApi.setOrgRolePermissions(roleId, permissions),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'org-roles'] }),
  });
};
