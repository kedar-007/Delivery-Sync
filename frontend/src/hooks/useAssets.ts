import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assetsApi } from '../lib/api';

// ── Field Normalisers ─────────────────────────────────────────────────────────
// `condition` is a reserved keyword → renamed to `asset_condition` in DataStore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normaliseAsset = (r: any) => ({
  ...r,
  id:             String(r.ROWID ?? r.id ?? ''),
  tenantId:       r.tenant_id     ?? r.tenantId,
  categoryId:     r.category_id   ?? r.categoryId,
  assetTag:       r.asset_tag     ?? r.assetTag,
  serialNumber:   r.serial_number ?? r.serialNumber ?? '',
  purchaseDate:   r.purchase_date ?? r.purchaseDate ?? null,
  purchaseValue:  parseFloat(r.purchase_value ?? r.purchaseValue ?? 0) || null,
  currentValue:   parseFloat(r.current_value  ?? r.currentValue  ?? 0) || null,
  warrantyExpiry: r.warranty_expiry ?? r.warrantyExpiry ?? null,
  condition:      r.asset_condition ?? r.condition ?? 'GOOD', // reserved keyword fix
  documentUrl:    r.document_url  ?? r.documentUrl  ?? null,
  assignedTo:     r.assigned_to   ?? r.assignedTo   ?? null,
  assignedAt:     r.assigned_at   ?? r.assignedAt   ?? null,
  createdBy:      r.CREATORID     ?? r.created_by   ?? r.createdBy,
  createdAt:      r.CREATEDTIME   ?? r.created_at   ?? r.createdAt,
  updatedAt:      r.MODIFIEDTIME  ?? r.updated_at   ?? r.updatedAt,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normaliseRequest = (r: any) => ({
  ...r,
  id:              String(r.ROWID ?? r.id ?? ''),
  requestedBy:     r.requested_by     ?? r.requestedBy,
  categoryId:      r.category_id      ?? r.categoryId,
  assetId:         r.asset_id         ?? r.assetId ?? null,
  approvedBy:      r.approved_by      ?? r.approvedBy ?? null,
  approvedAt:      r.approved_at      ?? r.approvedAt ?? null,
  fulfilledBy:     r.fulfilled_by     ?? r.fulfilledBy ?? null,
  fulfilledAt:     r.fulfilled_at     ?? r.fulfilledAt ?? null,
  fulfillmentNotes:r.fulfillment_notes ?? r.fulfillmentNotes ?? '',
  createdBy:       r.CREATORID        ?? r.created_by ?? r.createdBy,
  createdAt:       r.CREATEDTIME      ?? r.created_at ?? r.createdAt,
  updatedAt:       r.MODIFIEDTIME     ?? r.updated_at ?? r.updatedAt,
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
export const useAssetCategories = () =>
  useQuery({ queryKey: ['assets', 'categories'], queryFn: () => assetsApi.categories.list() });

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
    mutationFn: (id: string) => assetsApi.requests.approve(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
  });
};

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
