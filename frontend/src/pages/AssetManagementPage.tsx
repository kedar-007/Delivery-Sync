import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  Package, Plus, Edit2, Wrench, CheckCircle2, XCircle,
  RotateCcw, AlertTriangle, Calendar, DollarSign, Tag,
} from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { useForm } from 'react-hook-form';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Modal, { ModalActions } from '../components/ui/Modal';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { SkeletonTable, SkeletonCard } from '../components/ui/Skeleton';
import { useAuth } from '../contexts/AuthContext';
import {
  useAssetCategories, useCreateCategory, useAssetInventory, useAvailableAssets, useMyAssets,
  useCreateAsset, useUpdateAsset,
  useAssetRequests, useRequestAsset, useApproveAssetRequest, useRejectAssetRequest,
  useReturnAsset,
  useAssetMaintenance, useScheduleMaintenance,
} from '../hooks/useAssets';

// ── Types ─────────────────────────────────────────────────────────────────────

type AssetStatus = 'AVAILABLE' | 'ASSIGNED' | 'MAINTENANCE' | 'RETIRED';
type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
type Priority = 'LOW' | 'MEDIUM' | 'HIGH';

interface AssetCategory {
  id: string;
  name: string;
}

interface Asset {
  id: string;
  assetName: string;
  categoryId: string;
  categoryName?: string;
  serialNumber?: string;
  status: AssetStatus;
  purchaseDate?: string;
  purchaseCost?: number;
  warrantyExpiry?: string;
  notes?: string;
  assignedDate?: string;
  assignedTo?: string;
}

interface AssetRequest {
  id: string;
  categoryId?: string;
  categoryName?: string;
  assetId?: string;
  assetName?: string;
  reason: string;
  priority: Priority;
  status: RequestStatus;
  requestedBy?: string;
  requestedByName?: string;
  createdAt?: string;
  notes?: string;
}

interface MaintenanceRecord {
  id: string;
  assetId: string;
  assetName?: string;
  scheduledDate: string;
  maintenanceType: string;
  notes?: string;
  status?: string;
}

interface AssetFormData {
  name: string;
  category_id: string;
  asset_tag: string;
  serial_number: string;
  purchase_date: string;
  purchase_value: number;
  warranty_expiry: string;
  notes: string;
}

interface RequestFormData {
  category_id: string;
  asset_id: string;
  reason: string;
  priority: Priority;
}

interface MaintenanceFormData {
  asset_id: string;
  scheduled_date: string;
  maintenance_type: string;
  notes: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ADMIN_ROLES = ['TENANT_ADMIN', 'PMO', 'DELIVERY_LEAD'];

const assetStatusVariant = (status: AssetStatus) => {
  const map: Record<AssetStatus, 'success' | 'default' | 'warning' | 'gray'> = {
    AVAILABLE: 'success',
    ASSIGNED: 'default',
    MAINTENANCE: 'warning',
    RETIRED: 'gray',
  };
  return map[status] ?? 'gray';
};

const requestStatusVariant = (status: RequestStatus) => {
  const map: Record<RequestStatus, 'warning' | 'success' | 'danger'> = {
    PENDING: 'warning',
    APPROVED: 'success',
    REJECTED: 'danger',
  };
  return map[status] ?? 'warning';
};

const priorityVariant = (priority: Priority) => {
  const map: Record<Priority, 'gray' | 'warning' | 'danger'> = {
    LOW: 'gray',
    MEDIUM: 'warning',
    HIGH: 'danger',
  };
  return map[priority] ?? 'gray';
};

const safeFormat = (dateStr: string | undefined, fmt: string) => {
  if (!dateStr) return '—';
  try {
    const d = parseISO(dateStr);
    return isValid(d) ? format(d, fmt) : dateStr;
  } catch {
    return dateStr;
  }
};

// ── Reject Modal ──────────────────────────────────────────────────────────────

interface RejectModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (notes: string) => Promise<void>;
  title?: string;
}

const RejectModal = ({ open, onClose, onConfirm, title = 'Reject Request' }: RejectModalProps) => {
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (open) { setNotes(''); setError(''); }
  }, [open]);

  const handleConfirm = async () => {
    try {
      setLoading(true);
      setError('');
      await onConfirm(notes);
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to reject');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      {error && <Alert type="error" message={error} className="mb-3" />}
      <div>
        <label className="form-label">Reason for rejection</label>
        <textarea
          className="form-textarea"
          rows={3}
          placeholder="Explain why this request is being rejected…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <ModalActions>
        <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
        <Button variant="danger" onClick={handleConfirm} loading={loading} icon={<XCircle size={16} />}>
          Reject
        </Button>
      </ModalActions>
    </Modal>
  );
};

// ── Add / Edit Asset Modal ────────────────────────────────────────────────────

interface AssetModalProps {
  open: boolean;
  onClose: () => void;
  asset?: Asset | null;
  categories: AssetCategory[];
}

const AssetModal = ({ open, onClose, asset, categories }: AssetModalProps) => {
  const [error, setError] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const createAsset = useCreateAsset();
  const updateAsset = useUpdateAsset();

  const { register, handleSubmit, reset, formState: { isSubmitting, errors } } = useForm<AssetFormData>({
    defaultValues: {
      name: asset?.assetName ?? '',
      category_id: asset?.categoryId ?? '',
      asset_tag: '',
      serial_number: asset?.serialNumber ?? '',
      purchase_date: asset?.purchaseDate ?? '',
      purchase_value: asset?.purchaseCost ?? 0,
      warranty_expiry: asset?.warrantyExpiry ?? '',
      notes: asset?.notes ?? '',
    },
  });

  React.useEffect(() => {
    if (open) {
      reset({
        name: asset?.assetName ?? '',
        category_id: asset?.categoryId ?? '',
        asset_tag: '',
        serial_number: asset?.serialNumber ?? '',
        purchase_date: asset?.purchaseDate ?? '',
        purchase_value: asset?.purchaseCost ?? 0,
        warranty_expiry: asset?.warrantyExpiry ?? '',
        notes: asset?.notes ?? '',
      });
      setError('');
      setImageFile(null);
    }
  }, [open, asset, reset]);

  const onSubmit = async (data: AssetFormData) => {
    try {
      setError('');
      let payload: FormData | AssetFormData = data;
      if (imageFile) {
        const fd = new FormData();
        Object.entries(data).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') fd.append(k, String(v)); });
        fd.append('image', imageFile);
        payload = fd;
      }
      if (asset) {
        await updateAsset.mutateAsync({ id: asset!.id, data: payload });
      } else {
        await createAsset.mutateAsync(payload);
      }
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Something went wrong');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={asset ? 'Edit Asset' : 'Add Asset'} size="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && <Alert type="error" message={error} />}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="form-label">Asset Name *</label>
            <input
              className="form-input"
              placeholder="e.g. MacBook Pro 14-inch"
              {...register('name', { required: 'Asset name is required' })}
            />
            {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <label className="form-label">Category *</label>
            <select className="form-select" {...register('category_id', { required: 'Category is required' })}>
              <option value="">Select category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {errors.category_id && <p className="text-xs text-red-600 mt-1">{errors.category_id.message}</p>}
          </div>

          <div>
            <label className="form-label">Asset Tag *</label>
            <input
              className="form-input"
              placeholder="e.g. ASSET-001"
              {...register('asset_tag', { required: !asset ? 'Asset tag is required' : false })}
            />
            {errors.asset_tag && <p className="text-xs text-red-600 mt-1">{errors.asset_tag.message}</p>}
          </div>

          <div>
            <label className="form-label">Serial Number</label>
            <input
              className="form-input"
              placeholder="e.g. ABC123XYZ"
              {...register('serial_number')}
            />
          </div>

          <div>
            <label className="form-label">Purchase Date</label>
            <input type="date" className="form-input" {...register('purchase_date')} />
          </div>

          <div>
            <label className="form-label">Purchase Value</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="form-input"
              placeholder="0.00"
              {...register('purchase_value', { valueAsNumber: true })}
            />
          </div>

          <div className="col-span-2">
            <label className="form-label">Warranty Expiry</label>
            <input type="date" className="form-input" {...register('warranty_expiry')} />
          </div>

          <div className="col-span-2">
            <label className="form-label">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea className="form-textarea" rows={2} {...register('notes')} />
          </div>

          <div className="col-span-2">
            <label className="form-label">Asset Image <span className="text-gray-400 font-normal">(optional, uploaded to Stratus)</span></label>
            <input
              type="file"
              accept="image/*"
              className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            />
            {imageFile && <p className="text-xs text-indigo-600 mt-1">{imageFile.name}</p>}
          </div>
        </div>

        <ModalActions>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting} icon={<Package size={16} />}>
            {asset ? 'Save Changes' : 'Add Asset'}
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
};

// ── Request Asset Modal ───────────────────────────────────────────────────────

interface RequestModalProps {
  open: boolean;
  onClose: () => void;
  categories: AssetCategory[];
  availableAssets: Asset[];
}

const RequestModal = ({ open, onClose, categories, availableAssets }: RequestModalProps) => {
  const [error, setError] = useState('');
  const requestAsset = useRequestAsset();

  const { register, handleSubmit, reset, watch, formState: { isSubmitting, errors } } = useForm<RequestFormData>({
    defaultValues: { category_id: '', asset_id: '', reason: '', priority: 'MEDIUM' },
  });

  const selectedCategory = watch('category_id');

  const filteredAssets = useMemo(() => {
    if (!selectedCategory) return availableAssets;
    return availableAssets.filter((a) => a.categoryId === selectedCategory);
  }, [selectedCategory, availableAssets]);

  React.useEffect(() => {
    if (open) { reset({ category_id: '', asset_id: '', reason: '', priority: 'MEDIUM' }); setError(''); }
  }, [open, reset]);

  const onSubmit = async (data: RequestFormData) => {
    try {
      setError('');
      await requestAsset.mutateAsync(data);
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Something went wrong');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Request New Asset" size="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && <Alert type="error" message={error} />}

        <div>
          <label className="form-label">Category *</label>
          <select className="form-select" {...register('category_id', { required: 'Category is required' })}>
            <option value="">Select category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {errors.category_id && <p className="text-xs text-red-600 mt-1">{errors.category_id.message}</p>}
        </div>

        <div>
          <label className="form-label">Specific Asset <span className="text-gray-400 font-normal">(optional)</span></label>
          <select className="form-select" {...register('asset_id')}>
            <option value="">Any available asset</option>
            {filteredAssets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.assetName}{a.serialNumber ? ` · ${a.serialNumber}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="form-label">Reason *</label>
          <textarea
            className="form-textarea"
            rows={3}
            placeholder="Why do you need this asset?"
            {...register('reason', { required: 'Reason is required' })}
          />
          {errors.reason && <p className="text-xs text-red-600 mt-1">{errors.reason.message}</p>}
        </div>

        <div>
          <label className="form-label">Priority</label>
          <select className="form-select" {...register('priority')}>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </div>

        <ModalActions>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting} icon={<Plus size={16} />}>
            Submit Request
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
};

// ── Schedule Maintenance Modal ────────────────────────────────────────────────

interface MaintenanceModalProps {
  open: boolean;
  onClose: () => void;
  assets: Asset[];
}

const MaintenanceModal = ({ open, onClose, assets }: MaintenanceModalProps) => {
  const [error, setError] = useState('');
  const scheduleMaintenance = useScheduleMaintenance();

  const { register, handleSubmit, reset, formState: { isSubmitting, errors } } = useForm<MaintenanceFormData>({
    defaultValues: { asset_id: '', scheduled_date: '', maintenance_type: '', notes: '' },
  });

  React.useEffect(() => {
    if (open) { reset({ asset_id: '', scheduled_date: '', maintenance_type: '', notes: '' }); setError(''); }
  }, [open, reset]);

  const onSubmit = async (data: MaintenanceFormData) => {
    try {
      setError('');
      await scheduleMaintenance.mutateAsync(data);
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Something went wrong');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Schedule Maintenance" size="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && <Alert type="error" message={error} />}

        <div>
          <label className="form-label">Asset *</label>
          <select className="form-select" {...register('asset_id', { required: 'Asset is required' })}>
            <option value="">Select asset…</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.assetName}{a.serialNumber ? ` · ${a.serialNumber}` : ''}
              </option>
            ))}
          </select>
          {errors.asset_id && <p className="text-xs text-red-600 mt-1">{errors.asset_id.message}</p>}
        </div>

        <div>
          <label className="form-label">Scheduled Date *</label>
          <input
            type="date"
            className="form-input"
            {...register('scheduled_date', { required: 'Date is required' })}
          />
          {errors.scheduled_date && <p className="text-xs text-red-600 mt-1">{errors.scheduled_date.message}</p>}
        </div>

        <div>
          <label className="form-label">Maintenance Type *</label>
          <input
            className="form-input"
            placeholder="e.g. Battery replacement, OS upgrade…"
            {...register('maintenance_type', { required: 'Type is required' })}
          />
          {errors.maintenance_type && <p className="text-xs text-red-600 mt-1">{errors.maintenance_type.message}</p>}
        </div>

        <div>
          <label className="form-label">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
          <textarea className="form-textarea" rows={2} {...register('notes')} />
        </div>

        <ModalActions>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting || scheduleMaintenance.isPending} icon={<Wrench size={16} />}>
            Schedule
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
};

// ── My Assets Tab ─────────────────────────────────────────────────────────────

interface MyAssetsTabProps {
  categories: AssetCategory[];
  availableAssets: Asset[];
}

const MyAssetsTab = ({ categories, availableAssets }: MyAssetsTabProps) => {
  const { data: myAssets = [], isLoading, error } = useMyAssets();
  const returnAsset = useReturnAsset();
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [returnTarget, setReturnTarget] = useState<string | null>(null);

  const handleReturn = async () => {
    if (!returnTarget) return;
    try {
      await returnAsset.mutateAsync({ id: returnTarget });
      setReturnTarget(null);
    } catch { /* noop */ }
  };

  if (isLoading) return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  );
  if (error) return <Alert type="error" message={(error as Error).message} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button icon={<Plus size={14} />} onClick={() => setRequestModalOpen(true)}>
          Request New Asset
        </Button>
      </div>

      {(myAssets as Asset[]).length === 0 ? (
        <EmptyState
          icon={<Package size={36} />}
          title="No assets assigned"
          description="You have no assets currently assigned to you."
          action={
            <Button size="sm" icon={<Plus size={14} />} onClick={() => setRequestModalOpen(true)}>
              Request Asset
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(myAssets as Asset[]).map((asset) => (
            <div key={asset.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{asset.assetName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{asset.categoryName ?? '—'}</p>
                </div>
                <Badge variant={assetStatusVariant(asset.status)}>{asset.status}</Badge>
              </div>

              {asset.serialNumber && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Tag size={12} className="shrink-0" />
                  <span className="font-mono">{asset.serialNumber}</span>
                </div>
              )}

              {asset.assignedDate && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Calendar size={12} className="shrink-0" />
                  <span>Assigned {safeFormat(asset.assignedDate, 'MMM d, yyyy')}</span>
                </div>
              )}

              <Button
                size="sm"
                variant="outline"
                className="mt-auto"
                icon={<RotateCcw size={14} />}
                onClick={() => setReturnTarget(asset.id)}
              >
                Return Asset
              </Button>
            </div>
          ))}
        </div>
      )}

      <RequestModal
        open={requestModalOpen}
        onClose={() => setRequestModalOpen(false)}
        categories={categories}
        availableAssets={availableAssets}
      />

      {/* Return confirm modal */}
      <Modal open={returnTarget !== null} onClose={() => setReturnTarget(null)} title="Return Asset" size="sm">
        <p className="text-sm text-gray-600">Are you sure you want to return this asset? This action cannot be undone.</p>
        <ModalActions>
          <Button variant="outline" onClick={() => setReturnTarget(null)}>Cancel</Button>
          <Button
            variant="danger"
            icon={<RotateCcw size={16} />}
            loading={returnAsset.isPending}
            onClick={handleReturn}
          >
            Return Asset
          </Button>
        </ModalActions>
      </Modal>
    </div>
  );
};

// ── Manage Categories Modal ───────────────────────────────────────────────────

interface CategoryManageModalProps {
  open: boolean;
  onClose: () => void;
  categories: AssetCategory[];
}

const CategoryManageModal = ({ open, onClose, categories }: CategoryManageModalProps) => {
  const createCategory = useCreateCategory();
  const [name, setName] = useState('');
  const [err, setErr] = useState('');

  const handleAdd = async () => {
    if (!name.trim()) { setErr('Category name is required'); return; }
    try {
      setErr('');
      await createCategory.mutateAsync({ name: name.trim() });
      setName('');
    } catch (e: unknown) { setErr((e as Error).message ?? 'Failed to create'); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Manage Categories" size="sm">
      <div className="space-y-4">
        {err && <Alert type="error" message={err} />}
        <div className="flex gap-2">
          <input
            className="form-input flex-1"
            placeholder="New category name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
          />
          <Button size="sm" onClick={handleAdd} loading={createCategory.isPending} icon={<Plus size={14} />}>
            Add
          </Button>
        </div>
        {categories.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">No categories yet. Add one above.</p>
        ) : (
          <ul className="divide-y divide-gray-100 max-h-56 overflow-y-auto rounded-lg border border-gray-200">
            {categories.map((c) => (
              <li key={c.id} className="px-3 py-2 text-sm text-gray-800">{c.name}</li>
            ))}
          </ul>
        )}
      </div>
      <ModalActions>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </ModalActions>
    </Modal>
  );
};

// ── Inventory Tab ─────────────────────────────────────────────────────────────

interface InventoryTabProps {
  categories: AssetCategory[];
}

const InventoryTab = ({ categories }: InventoryTabProps) => {
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [retireTarget, setRetireTarget] = useState<Asset | null>(null);
  const [catModalOpen, setCatModalOpen] = useState(false);

  const filterParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (filterCategory) p.category_id = filterCategory;
    if (filterStatus) p.status = filterStatus;
    return p;
  }, [filterCategory, filterStatus]);

  const { data: inventory = [], isLoading, error } = useAssetInventory(filterParams);
  const updateAsset = useUpdateAsset();

  const handleRetire = async () => {
    if (!retireTarget) return;
    try {
      await updateAsset.mutateAsync({ id: retireTarget.id, data: { status: 'RETIRED' } });
      setRetireTarget(null);
    } catch { /* noop */ }
  };

  const openEdit = (asset: Asset) => {
    setEditAsset(asset);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditAsset(null);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[160px]">
          <select
            className="form-select"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <select
            className="form-select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="RETIRED">Retired</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Asset Inventory</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" icon={<Tag size={14} />} onClick={() => setCatModalOpen(true)}>
              Categories {categories.length > 0 && <span className="ml-1 text-xs text-gray-500">({categories.length})</span>}
            </Button>
            <Button size="sm" icon={<Plus size={14} />} onClick={() => { setEditAsset(null); setModalOpen(true); }}>
              Add Asset
            </Button>
          </div>
        </div>

        {isLoading ? (
          <SkeletonTable rows={6} />
        ) : error ? (
          <Alert type="error" message={(error as Error).message} className="m-5" />
        ) : (inventory as Asset[]).length === 0 ? (
          <EmptyState
            icon={<Package size={36} />}
            title="No assets found"
            description="Add your first asset to start tracking inventory."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  {['Asset Name', 'Category', 'Serial Number', 'Status', 'Purchase Date', 'Cost', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(inventory as Asset[]).map((asset) => (
                  <tr key={asset.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{asset.assetName}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{asset.categoryName ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 font-mono">{asset.serialNumber ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={assetStatusVariant(asset.status)}>{asset.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {safeFormat(asset.purchaseDate, 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {asset.purchaseCost != null
                        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(asset.purchaseCost)
                        : '—'
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(asset)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors rounded"
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </button>
                        {asset.status !== 'RETIRED' && (
                          <button
                            onClick={() => setRetireTarget(asset)}
                            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded"
                            title="Retire asset"
                          >
                            <AlertTriangle size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AssetModal
        open={modalOpen}
        onClose={closeModal}
        asset={editAsset}
        categories={categories}
      />

      <CategoryManageModal
        open={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        categories={categories}
      />

      {/* Retire confirm modal */}
      <Modal open={retireTarget !== null} onClose={() => setRetireTarget(null)} title="Retire Asset" size="sm">
        <p className="text-sm text-gray-600">
          Are you sure you want to retire <strong>{retireTarget?.assetName}</strong>? This will mark it as permanently out of service.
        </p>
        <ModalActions>
          <Button variant="outline" onClick={() => setRetireTarget(null)}>Cancel</Button>
          <Button
            variant="danger"
            icon={<AlertTriangle size={16} />}
            loading={updateAsset.isPending}
            onClick={handleRetire}
          >
            Retire Asset
          </Button>
        </ModalActions>
      </Modal>
    </div>
  );
};

// ── Requests Tab ──────────────────────────────────────────────────────────────

interface RequestsTabProps {
  isAdmin: boolean;
  categories: AssetCategory[];
  availableAssets: Asset[];
}

const RequestsTab = ({ isAdmin, categories, availableAssets }: RequestsTabProps) => {
  const params = useMemo<Record<string, string>>(() => {
    const p: Record<string, string> = {};
    if (isAdmin) p.status = 'PENDING';
    return p;
  }, [isAdmin]);
  const { data: requests = [], isLoading, error } = useAssetRequests(params);
  const approveRequest = useApproveAssetRequest();
  const rejectRequest = useRejectAssetRequest();
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [requestModalOpen, setRequestModalOpen] = useState(false);

  const handleApprove = async (id: string) => {
    try { await approveRequest.mutateAsync(id); } catch { /* noop */ }
  };

  const handleReject = async (notes: string) => {
    if (!rejectTarget) return;
    await rejectRequest.mutateAsync({ id: rejectTarget, data: { notes } });
    setRejectTarget(null);
  };

  if (isLoading) return <SkeletonTable rows={4} />;
  if (error) return <Alert type="error" message={(error as Error).message} />;

  return (
    <div className="space-y-4">
      {!isAdmin && (
        <div className="flex justify-end">
          <Button icon={<Plus size={14} />} onClick={() => setRequestModalOpen(true)}>
            New Request
          </Button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">
            {isAdmin ? 'Pending Asset Requests' : 'My Requests'}
          </h3>
        </div>

        {(requests as AssetRequest[]).length === 0 ? (
          <EmptyState
            icon={<Package size={36} />}
            title="No requests"
            description={isAdmin ? 'No pending asset requests.' : 'You have not submitted any asset requests.'}
            action={
              !isAdmin ? (
                <Button size="sm" icon={<Plus size={14} />} onClick={() => setRequestModalOpen(true)}>
                  Request Asset
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  {[
                    ...(isAdmin ? ['Requested By'] : []),
                    'Category', 'Asset', 'Reason', 'Priority', 'Status',
                    ...(isAdmin ? ['Actions'] : ['Date']),
                  ].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(requests as AssetRequest[]).map((req) => (
                  <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                    {isAdmin && (
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                        {req.requestedByName ?? '—'}
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm text-gray-700">{req.categoryName ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{req.assetName ?? 'Any'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate" title={req.reason}>
                      {req.reason}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={priorityVariant(req.priority)}>{req.priority}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={requestStatusVariant(req.status)}>{req.status}</Badge>
                    </td>
                    {isAdmin ? (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 border-green-300 hover:bg-green-50"
                            icon={<CheckCircle2 size={14} />}
                            onClick={() => handleApprove(req.id)}
                            loading={approveRequest.isPending}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-300 hover:bg-red-50"
                            icon={<XCircle size={14} />}
                            onClick={() => setRejectTarget(req.id)}
                          >
                            Reject
                          </Button>
                        </div>
                      </td>
                    ) : (
                      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                        {safeFormat(req.createdAt, 'MMM d, yyyy')}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!isAdmin && (
        <RequestModal
          open={requestModalOpen}
          onClose={() => setRequestModalOpen(false)}
          categories={categories}
          availableAssets={availableAssets}
        />
      )}

      <RejectModal
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleReject}
        title="Reject Asset Request"
      />
    </div>
  );
};

// ── Maintenance Tab ───────────────────────────────────────────────────────────

interface MaintenanceTabProps {
  allAssets: Asset[];
}

const MaintenanceTab = ({ allAssets }: MaintenanceTabProps) => {
  const { data: records = [], isLoading, error } = useAssetMaintenance();
  const [modalOpen, setModalOpen] = useState(false);

  if (isLoading) return <SkeletonTable rows={4} />;
  if (error) return <Alert type="error" message={(error as Error).message} />;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Maintenance Schedule</h3>
          <Button size="sm" icon={<Wrench size={14} />} onClick={() => setModalOpen(true)}>
            Schedule Maintenance
          </Button>
        </div>

        {(records as MaintenanceRecord[]).length === 0 ? (
          <EmptyState
            icon={<Wrench size={36} />}
            title="No maintenance records"
            description="Schedule asset maintenance to keep track of upkeep."
            action={
              <Button size="sm" icon={<Wrench size={14} />} onClick={() => setModalOpen(true)}>
                Schedule Maintenance
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  {['Asset', 'Scheduled Date', 'Type', 'Notes', 'Status'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(records as MaintenanceRecord[]).map((rec) => (
                  <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{rec.assetName ?? rec.assetId}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                      {safeFormat(rec.scheduledDate, 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{rec.maintenanceType}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate" title={rec.notes}>
                      {rec.notes ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {rec.status ? (
                        <Badge variant="default">{rec.status}</Badge>
                      ) : (
                        <Badge variant="warning">SCHEDULED</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <MaintenanceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        assets={allAssets}
      />
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'my-assets' | 'inventory' | 'requests' | 'maintenance';

const AssetManagementPage = () => {
  const { user } = useAuth();
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('my-assets');

  const isAdmin = user?.role ? ADMIN_ROLES.includes(user.role) : false;

  const { data: categories = [] } = useAssetCategories();
  const { data: availableAssets = [] } = useAvailableAssets();
  const { data: allInventory = [] } = useAssetInventory();

  const tabs: Array<{ id: Tab; label: string; adminOnly?: boolean }> = [
    { id: 'my-assets', label: 'My Assets' },
    { id: 'inventory', label: 'Inventory', adminOnly: true },
    { id: 'requests', label: 'Requests' },
    { id: 'maintenance', label: 'Maintenance', adminOnly: true },
  ];

  const visibleTabs = tabs.filter((t) => !t.adminOnly || isAdmin);

  return (
    <Layout>
      <Header
        title="Asset Management"
        subtitle="Track and manage organisational assets"
      />

      <div className="p-6 space-y-5">
        {/* Tab bar */}
        <div className="flex gap-1 border-b border-gray-200">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab.id
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'my-assets' && (
          <MyAssetsTab
            categories={categories as AssetCategory[]}
            availableAssets={availableAssets as Asset[]}
          />
        )}
        {activeTab === 'inventory' && isAdmin && (
          <InventoryTab categories={categories as AssetCategory[]} />
        )}
        {activeTab === 'requests' && (
          <RequestsTab
            isAdmin={isAdmin}
            categories={categories as AssetCategory[]}
            availableAssets={availableAssets as Asset[]}
          />
        )}
        {activeTab === 'maintenance' && isAdmin && (
          <MaintenanceTab allAssets={allInventory as Asset[]} />
        )}
      </div>
    </Layout>
  );
};

export default AssetManagementPage;
