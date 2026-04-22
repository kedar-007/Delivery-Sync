import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assetsApi } from '../lib/api';

// ── Field Normalisers ─────────────────────────────────────────────────────────
// `condition` is a reserved keyword → renamed to `asset_condition` in DataStore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normaliseAsset = (r: any) => ({
  ...r,
  id:             String(r.ROWID ?? r.id ?? ''),
  assetName:      r.name ?? r.assetName ?? '',          // DB column is 'name'
  assetTag:       r.asset_tag     ?? r.assetTag ?? '',
  tenantId:       r.tenant_id     ?? r.tenantId,
  categoryId:     r.category_id   ?? r.categoryId ?? '',
  serialNumber:   r.serial_number ?? r.serialNumber ?? '',
  purchaseDate:   r.purchase_date ?? r.purchaseDate ?? null,
  purchaseCost:   parseFloat(r.purchase_value ?? r.purchaseCost ?? r.purchaseValue ?? 0) || null,
  purchaseValue:  parseFloat(r.purchase_value ?? r.purchaseValue ?? 0) || null,
  currentValue:   parseFloat(r.current_value  ?? r.currentValue  ?? 0) || null,
  warrantyExpiry: r.warranty_expiry ?? r.warrantyExpiry ?? null,
  condition:      r.asset_condition ?? r.condition ?? 'GOOD', // reserved keyword fix
  documentUrl:    r.document_url  ?? r.documentUrl  ?? null,
  imageUrl:       r.document_url  ?? r.documentUrl  ?? null,  // alias for image display
  assignedTo:          r.assigned_to         ?? r.assignedTo         ?? null,
  assignedAt:          r.assigned_at         ?? r.assignedAt         ?? null,
  assignedDate:        r.assigned_date       ?? r.assignedDate       ?? null,
  daysUsing:           r.days_using          ?? r.daysUsing          ?? null,
  assignedBy:          r.assigned_by         ?? r.assignedBy         ?? null,
  assignedByName:      r.assigned_by_name    ?? r.assignedByName     ?? null,
  assignedByAvatar:    r.assigned_by_avatar  ?? r.assignedByAvatar   ?? null,
  approvedBy:          r.approved_by         ?? r.approvedBy         ?? null,
  approvedByName:      r.approved_by_name    ?? r.approvedByName     ?? null,
  approvedByAvatar:    r.approved_by_avatar  ?? r.approvedByAvatar   ?? null,
  handoverByName:      r.handover_by_name    ?? r.handoverByName     ?? null,
  conditionAtAssignment: r.condition_at_assignment ?? r.conditionAtAssignment ?? null,
  assignmentNotes:     r.assignment_notes    ?? r.assignmentNotes    ?? null,
  expectedReturnDate:  r.expected_return_date ?? r.expectedReturnDate ?? null,
  categoryName:        r.category_name       ?? r.categoryName       ?? null,
  requestId:           r.request_id          ?? r.requestId          ?? null,
  createdBy:           r.CREATORID           ?? r.created_by         ?? r.createdBy,
  createdAt:           r.CREATEDTIME         ?? r.created_at         ?? r.createdAt,
  updatedAt:           r.MODIFIEDTIME        ?? r.updated_at         ?? r.updatedAt,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normaliseRequest = (r: any) => ({
  ...r,
  id:                String(r.ROWID ?? r.id ?? ''),
  requestedBy:       r.requested_by      ?? r.requestedBy,
  requestedByName:   r.requested_by_name ?? r.requestedByName ?? null,
  requestedByEmail:  r.requested_by_email ?? r.requestedByEmail ?? null,
  requestedByAvatar: r.requested_by_avatar ?? r.requestedByAvatar ?? null,
  categoryId:        r.category_id       ?? r.categoryId,
  categoryName:      r.category_name     ?? r.categoryName ?? null,
  assetId:           r.asset_id          ?? r.assetId ?? null,
  assetName:         r.asset_name        ?? r.assetName ?? null,
  assetTag:          r.asset_tag         ?? r.assetTag ?? null,
  priority:          r.priority ?? r.urgency ?? 'NORMAL',
  neededBy:          r.needed_by         ?? r.neededBy ?? null,
  reqNotes:          r.req_notes         ?? r.reqNotes ?? null,
  approvedBy:           r.approved_by           ?? r.approvedBy ?? null,
  approvedByName:       r.approved_by_name      ?? r.approvedByName ?? null,
  approvedAt:           r.approved_at           ?? r.approvedAt ?? null,
  rejectionNotes:       r.rejection_notes       ?? r.rejectionNotes ?? null,
  opsAssignees:         r.ops_assignees         ?? r.opsAssignees ?? [],
  opsAssigneeDetails:   r.ops_assignee_details  ?? r.opsAssigneeDetails ?? [],
  handoverBy:           r.handover_by           ?? r.handoverBy ?? null,
  handoverByName:       r.handover_by_name      ?? r.handoverByName ?? null,
  handoverAt:           r.handover_at           ?? r.handoverAt ?? null,
  handoverNotes:        r.handover_notes        ?? r.handoverNotes ?? null,
  deviceId:             r.device_id             ?? r.deviceId ?? null,
  deviceUsername:       r.device_username       ?? r.deviceUsername ?? null,
  devicePassword:       r.device_password       ?? r.devicePassword ?? null,
  returnBy:             r.return_by             ?? r.returnBy ?? null,
  returnAt:             r.return_at             ?? r.returnAt ?? null,
  returnReason:         r.return_reason         ?? r.returnReason ?? null,
  returnCondition:      r.return_condition      ?? r.returnCondition ?? null,
  returnChecklist:      r.return_checklist      ? (typeof r.return_checklist === 'string' ? JSON.parse(r.return_checklist) : r.return_checklist) : [],
  returnNotes:          r.return_notes          ?? r.returnNotes ?? null,
  returnVerifiedBy:     r.return_verified_by    ?? r.returnVerifiedBy ?? null,
  returnVerifiedAt:     r.return_verified_at    ?? r.returnVerifiedAt ?? null,
  fulfilledBy:          r.fulfilled_by          ?? r.fulfilledBy ?? null,
  fulfilledAt:          r.fulfilled_at          ?? r.fulfilledAt ?? null,
  fulfillmentNotes:     r.fulfillment_notes     ?? r.fulfillmentNotes ?? '',
  createdBy:            r.CREATORID             ?? r.created_by ?? r.createdBy,
  createdAt:            r.CREATEDTIME           ?? r.created_at ?? r.createdAt,
  updatedAt:            r.MODIFIEDTIME          ?? r.updated_at ?? r.updatedAt,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normaliseAssignment = (r: any) => ({
  ...r,
  id:                    String(r.ROWID ?? r.id ?? ''),
  assetId:               r.asset_id              ?? r.assetId,
  userId:                r.user_id               ?? r.userId,
  assignedBy:            r.assigned_by           ?? r.assignedBy,
  requestId:             r.request_id            ?? r.requestId ?? null,
  assignedDate:          r.assigned_date         ?? r.assignedDate,
  expectedReturnDate:    r.expected_return_date  ?? r.expectedReturnDate ?? null,
  returnedDate:          r.returned_date         ?? r.returnedDate ?? null,
  conditionAtAssignment: r.condition_at_assignment ?? r.conditionAtAssignment ?? 'GOOD',
  conditionAtReturn:     r.condition_at_return   ?? r.conditionAtReturn ?? null,
  assignmentNotes:       r.assignment_notes      ?? r.assignmentNotes ?? '',
  returnNotes:           r.return_notes          ?? r.returnNotes ?? '',
  isActive:              r.is_active === 'true'  || r.is_active === true || r.isActive === true,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normaliseMaintenance = (r: any) => ({
  ...r,
  id:            String(r.ROWID ?? r.id ?? ''),
  assetId:       r.asset_id       ?? r.assetId,
  scheduledDate: r.scheduled_date ?? r.scheduledDate,
  completedDate: r.completed_date ?? r.completedDate ?? null,
  performedBy:   r.performed_by   ?? r.performedBy  ?? null,
  createdBy:     r.CREATORID      ?? r.created_by   ?? r.createdBy,
  createdAt:     r.CREATEDTIME    ?? r.created_at   ?? r.createdAt,
});

const applyNorm = <T>(norm: (r: unknown) => T) =>
  (res: unknown): T | T[] => {
    if (Array.isArray(res)) return res.map(norm);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (res as any);
    if (d?.data && Array.isArray(d.data)) return { ...d, data: d.data.map(norm) } as unknown as T;
    return norm(res);
  };

// ── Hooks ─────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normaliseCategory = (r: any) => ({ ...r, id: String(r.ROWID ?? r.id ?? '') });

export const useAssetCategories = () =>
  useQuery({ queryKey: ['assets', 'categories'], queryFn: () => assetsApi.categories.list().then(applyNorm(normaliseCategory)) });

export const useCreateCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => assetsApi.categories.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets', 'categories'] }),
  });
};

export const useAssetInventory = (params?: Record<string, string>) =>
  useQuery({
    queryKey: ['assets', 'inventory', params],
    queryFn: () => assetsApi.inventory.list(params).then(applyNorm(normaliseAsset)),
  });

export const useAvailableAssets = () =>
  useQuery({
    queryKey: ['assets', 'available'],
    queryFn: () => assetsApi.inventory.available().then(applyNorm(normaliseAsset)),
  });

export const useMyAssets = () =>
  useQuery({
    queryKey: ['assets', 'my'],
    queryFn: () => assetsApi.inventory.myAssets().then(applyNorm(normaliseAsset)),
  });

export const useCreateAsset = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => assetsApi.inventory.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets', 'inventory'] }),
  });
};

export const useBulkCreateAssets = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: unknown[]) => assetsApi.inventory.bulkCreate(rows),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets', 'inventory'] }),
  });
};

export const useUpdateAsset = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => assetsApi.inventory.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
  });
};

export const useAssetRequests = (params?: Record<string, string>) =>
  useQuery({
    queryKey: ['assets', 'requests', params],
    queryFn: () => assetsApi.requests.list(params).then(applyNorm(normaliseRequest)),
  });

export const useRequestAsset = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => assetsApi.requests.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets', 'requests'] }),
  });
};

export const useApproveAssetRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: unknown }) => assetsApi.requests.approve(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
  });
};

export const useAssignOpsRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => assetsApi.requests.assignOps(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
  });
};

export const useStartProcessingRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => assetsApi.requests.startProcessing(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
  });
};

export const useHandoverAssetRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => assetsApi.requests.handover(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
  });
};

export const useInitiateReturn = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: unknown }) => assetsApi.requests.initiateReturn(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
  });
};

export const useVerifyReturn = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => assetsApi.requests.verifyReturn(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
  });
};

export const useAssignableUsers = () =>
  useQuery({
    queryKey: ['assets', 'assignable-users'],
    queryFn: () => assetsApi.requests.assignableUsers(),
    staleTime: 60_000,
  });

export const useAssetOrgRoles = () =>
  useQuery({
    queryKey: ['assets', 'org-roles'],
    queryFn: () => assetsApi.requests.orgRoles(),
    staleTime: 60_000,
  });

export const useRejectAssetRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => assetsApi.requests.reject(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
  });
};

export const useAssetAssignments = (params?: Record<string, string>) =>
  useQuery({
    queryKey: ['assets', 'assignments', params],
    queryFn: () => assetsApi.assignments.list(params).then(applyNorm(normaliseAssignment)),
  });

export const useReturnAsset = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: unknown }) => assetsApi.assignments.return(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
  });
};

export const useAssetMaintenance = (params?: Record<string, string>) =>
  useQuery({
    queryKey: ['assets', 'maintenance', params],
    queryFn: () => assetsApi.maintenance.list(params).then(applyNorm(normaliseMaintenance)),
  });

export const useScheduleMaintenance = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => assetsApi.maintenance.schedule(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets', 'maintenance'] }),
  });
};
