import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  Package, Plus, Edit2, Wrench, CheckCircle2, XCircle,
  RotateCcw, AlertTriangle, Calendar, Tag, Upload, ChevronRight, MapPin,
  Eye, Clock, User, FileText, Hash,
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
import UserAvatar from '../components/ui/UserAvatar';
import {
  useAssetCategories, useCreateCategory, useAssetInventory, useAvailableAssets, useMyAssets,
  useCreateAsset, useUpdateAsset, useBulkCreateAssets,
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
  assetTag?: string;
  categoryId: string;
  categoryName?: string;
  serialNumber?: string;
  brand?: string;
  model?: string;
  location?: string;
  condition?: string;
  imageUrl?: string;
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
  assetTag?: string;
  reason: string;
  priority: Priority;
  status: RequestStatus;
  requestedBy?: string;
  requestedByName?: string;
  requestedByEmail?: string;
  requestedByAvatar?: string;
  neededBy?: string | null;
  reqNotes?: string | null;
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
  needed_by: string;
  notes: string;
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

const conditionColor = (c?: string) => {
  const map: Record<string, string> = {
    EXCELLENT: 'bg-green-100 text-green-700',
    GOOD:      'bg-blue-100 text-blue-700',
    FAIR:      'bg-yellow-100 text-yellow-700',
    POOR:      'bg-red-100 text-red-700',
  };
  return map[(c ?? '').toUpperCase()] ?? 'bg-gray-100 text-gray-600';
};

const RequestModal = ({ open, onClose, categories, availableAssets }: RequestModalProps) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [filterCat, setFilterCat] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [anyInCat, setAnyInCat] = useState(false); // "any available" chosen
  const [error, setError] = useState('');
  const requestAsset = useRequestAsset();

  const { register, handleSubmit, reset, watch, setValue, formState: { isSubmitting, errors } } = useForm<RequestFormData>({
    defaultValues: { category_id: '', asset_id: '', reason: '', priority: 'MEDIUM', needed_by: '', notes: '' },
  });

  React.useEffect(() => {
    if (open) {
      reset({ category_id: '', asset_id: '', reason: '', priority: 'MEDIUM', needed_by: '', notes: '' });
      setStep(1); setFilterCat(''); setSelectedAsset(null); setAnyInCat(false); setError('');
    }
  }, [open, reset]);

  const filteredAssets = useMemo(() =>
    (availableAssets as Asset[]).filter((a) => !filterCat || String(a.categoryId) === filterCat),
    [filterCat, availableAssets]
  );

  const selCatName = useMemo(() => {
    const catId = selectedAsset ? String(selectedAsset.categoryId) : filterCat;
    return categories.find((c) => c.id === catId)?.name ?? '';
  }, [selectedAsset, filterCat, categories]);

  const handlePickCategory = (catId: string) => {
    setFilterCat(catId);
    setSelectedAsset(null);
    setAnyInCat(false);
    setValue('category_id', catId);
    setValue('asset_id', '');
  };

  const handleSelectAsset = (asset: Asset) => {
    setSelectedAsset(asset);
    setAnyInCat(false);
    setValue('asset_id', asset.id);
    setValue('category_id', String(asset.categoryId));
  };

  const handleSelectAny = () => {
    setSelectedAsset(null);
    setAnyInCat(true);
    setValue('asset_id', '');
    setValue('category_id', filterCat);
  };

  const handleNext = () => {
    if (!filterCat && !selectedAsset) { setError('Please select a category to continue.'); return; }
    setError('');
    setStep(2);
  };

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
    <Modal open={open} onClose={onClose} title="Request New Asset" size="xl">
      {/* Step progress */}
      <div className="flex items-center gap-2 mb-5">
        {[{ n: 1, label: 'Browse & Select' }, { n: 2, label: 'Request Details' }].map(({ n, label }, i) => (
          <React.Fragment key={n}>
            <div className={`flex items-center gap-1.5 ${step === n ? 'text-indigo-600' : step > n ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                step === n ? 'border-indigo-600 bg-indigo-50' : step > n ? 'border-green-500 bg-green-50' : 'border-gray-300 bg-white'
              }`}>
                {step > n ? '✓' : n}
              </div>
              <span className="text-xs font-medium hidden sm:inline">{label}</span>
            </div>
            {i < 1 && <div className={`flex-1 h-px ${step > n ? 'bg-green-400' : 'bg-gray-200'}`} />}
          </React.Fragment>
        ))}
      </div>

      {error && <Alert type="error" message={error} className="mb-4" />}

      {/* ── STEP 1: Browse & pick asset ── */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Category chips */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Filter by Category</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { setFilterCat(''); setSelectedAsset(null); setAnyInCat(false); setValue('category_id', ''); setValue('asset_id', ''); }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  !filterCat ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
                }`}
              >
                All ({(availableAssets as Asset[]).length})
              </button>
              {categories.map((c) => {
                const count = (availableAssets as Asset[]).filter((a) => String(a.categoryId) === c.id).length;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handlePickCategory(c.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      filterCat === c.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
                    }`}
                  >
                    {c.name} {count > 0 && <span className={`ml-1 ${filterCat === c.id ? 'opacity-70' : 'text-gray-400'}`}>({count})</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Asset cards */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">
              {filterCat
                ? `${filteredAssets.length} available in ${selCatName}`
                : `${(availableAssets as Asset[]).length} assets available — select a category above`}
            </p>

            {filteredAssets.length === 0 && filterCat ? (
              <div className="text-center py-10 text-sm text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                No available assets in this category
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-0.5">
                {/* "Any available" option — only shown when category is selected */}
                {filterCat && (
                  <button
                    type="button"
                    onClick={handleSelectAny}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                      anyInCat ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200' : 'border-dashed border-gray-300 hover:border-indigo-300 bg-white'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <Package size={18} className="text-gray-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Any available</p>
                      <p className="text-xs text-gray-400">Admin will pick the best match</p>
                    </div>
                    {anyInCat && <CheckCircle2 size={16} className="text-indigo-600 ml-auto shrink-0" />}
                  </button>
                )}

                {filteredAssets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => handleSelectAsset(asset)}
                    className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                      selectedAsset?.id === asset.id
                        ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200'
                        : 'border-gray-200 hover:border-indigo-300 bg-white'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center shrink-0">
                      {asset.imageUrl
                        ? <img src={asset.imageUrl} alt={asset.assetName} className="w-full h-full object-cover" />
                        : <Package size={18} className="text-gray-400" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{asset.assetName}</p>
                      {(asset.brand || asset.model) && (
                        <p className="text-xs text-gray-500 truncate">{[asset.brand, asset.model].filter(Boolean).join(' · ')}</p>
                      )}
                      <div className="flex items-center flex-wrap gap-1.5 mt-1">
                        {asset.assetTag && (
                          <span className="text-xs font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{asset.assetTag}</span>
                        )}
                        {asset.condition && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${conditionColor(asset.condition)}`}>
                            {asset.condition}
                          </span>
                        )}
                      </div>
                      {asset.location && (
                        <p className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                          <MapPin size={10} /> {asset.location}
                        </p>
                      )}
                    </div>
                    {selectedAsset?.id === asset.id && <CheckCircle2 size={16} className="text-indigo-600 shrink-0 mt-0.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ModalActions>
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
            <Button
              type="button"
              onClick={handleNext}
              disabled={!filterCat && !selectedAsset}
              icon={<ChevronRight size={14} />}
            >
              Next: Request Details
            </Button>
          </ModalActions>
        </div>
      )}

      {/* ── STEP 2: Request details ── */}
      {step === 2 && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Selected asset summary */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-indigo-50 border border-indigo-100">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 overflow-hidden flex items-center justify-center shrink-0">
              {selectedAsset?.imageUrl
                ? <img src={selectedAsset.imageUrl} alt={selectedAsset.assetName} className="w-full h-full object-cover" />
                : <Package size={16} className="text-indigo-500" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-indigo-800 truncate">
                {selectedAsset ? selectedAsset.assetName : `Any available · ${selCatName}`}
              </p>
              {selectedAsset && (
                <p className="text-xs text-indigo-500">
                  {[selectedAsset.brand, selectedAsset.model, selectedAsset.assetTag].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            <button type="button" onClick={() => setStep(1)} className="text-xs text-indigo-500 hover:text-indigo-700 font-medium shrink-0">
              Change
            </button>
          </div>

          {/* Reason */}
          <div>
            <label className="form-label">Reason <span className="text-red-500">*</span></label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="Why do you need this asset? Describe your use case…"
              {...register('reason', { required: 'Reason is required' })}
            />
            {errors.reason && <p className="text-xs text-red-600 mt-1">{errors.reason.message}</p>}
          </div>

          {/* Priority + Needed by */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Priority</label>
              <div className="flex gap-2 mt-1">
                {(['LOW', 'MEDIUM', 'HIGH'] as Priority[]).map((p) => (
                  <label key={p} className="flex-1 cursor-pointer">
                    <input type="radio" className="sr-only" value={p} {...register('priority')} />
                    <div className={`text-center py-2 rounded-lg border-2 text-xs font-semibold transition-all ${
                      watch('priority') === p
                        ? p === 'HIGH'   ? 'border-red-500   bg-red-50   text-red-700'
                        : p === 'MEDIUM' ? 'border-amber-500 bg-amber-50 text-amber-700'
                        :                  'border-gray-400  bg-gray-50  text-gray-700'
                        : 'border-gray-200 text-gray-400 hover:border-gray-300'
                    }`}>
                      {p}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="form-label">Needed By <span className="text-gray-400 font-normal">(optional)</span></label>
              <input type="date" className="form-input" {...register('needed_by')} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="form-label">Additional Notes <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              className="form-textarea"
              rows={2}
              placeholder="Special requirements, preferred specs, or any other details…"
              {...register('notes')}
            />
          </div>

          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setStep(1)}>Back</Button>
            <Button type="submit" loading={isSubmitting} icon={<Plus size={16} />}>
              Submit Request
            </Button>
          </ModalActions>
        </form>
      )}
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

// ── Bulk Upload Modal ─────────────────────────────────────────────────────────

interface BulkUploadModalProps {
  open: boolean;
  onClose: () => void;
  categories: AssetCategory[];
}

// Parse a CSV line respecting quoted fields
const parseCSVLine = (line: string): string[] => {
  const cols: string[] = [];
  let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
    else { cur += c; }
  }
  cols.push(cur.trim());
  return cols;
};

const BULK_HEADERS = ['name', 'category_id', 'asset_tag', 'serial_number', 'brand', 'model', 'purchase_value', 'purchase_date', 'warranty_expiry', 'location', 'notes'];

const BulkUploadModal = ({ open, onClose, categories }: BulkUploadModalProps) => {
  const bulkCreate = useBulkCreateAssets();
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [parseErr, setParseErr] = useState('');
  const [result, setResult] = useState<{ created: unknown[]; failed: { asset_tag: string; reason: string }[] } | null>(null);

  React.useEffect(() => {
    if (open) { setRows([]); setParseErr(''); setResult(null); }
  }, [open]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setParseErr(''); setRows([]); setResult(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) { setParseErr('File must have a header row and at least one data row.'); return; }
      const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
      const parsed: Record<string, string>[] = [];
      for (let i = 1; i < lines.length; i++) {
        const vals = parseCSVLine(lines[i]);
        if (vals.every((v) => !v)) continue;
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = vals[idx] ?? ''; });
        parsed.push(row);
      }
      if (parsed.length === 0) { setParseErr('No data rows found.'); return; }
      setRows(parsed.slice(0, 200));
    };
    reader.readAsText(file);
  };

  const handleSubmit = async () => {
    try {
      const res = await bulkCreate.mutateAsync(rows);
      setResult(res as any);
    } catch (e: unknown) { setParseErr((e as Error).message ?? 'Upload failed'); }
  };

  const catMap = useMemo(() => {
    const m: Record<string, string> = {};
    categories.forEach((c) => { m[c.name.toLowerCase()] = c.id; m[c.id] = c.id; });
    return m;
  }, [categories]);

  // Resolve category_id from name or id
  const resolvedRows = useMemo<Record<string, string>[]>(() =>
    rows.map((r) => ({ ...r, category_id: catMap[String(r.category_id).toLowerCase()] ?? r.category_id })),
  [rows, catMap]);

  const TEMPLATE = BULK_HEADERS.join(',') + '\n' +
    `MacBook Pro 14,${categories[0]?.id ?? 'CATEGORY_ID'},ASSET-001,SN123,Apple,M3 Pro,2500,2026-01-15,2029-01-15,HQ Office,Good condition`;

  return (
    <Modal open={open} onClose={onClose} title="Bulk Upload Assets" size="lg">
      <div className="space-y-4">
        {/* Template download */}
        <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
          <div>
            <p className="text-sm font-medium text-blue-800">CSV Template</p>
            <p className="text-xs text-blue-600">Columns: {BULK_HEADERS.join(', ')}</p>
          </div>
          <Button size="sm" variant="outline"
            onClick={() => {
              const blob = new Blob([TEMPLATE], { type: 'text/csv' });
              const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
              a.download = 'assets_template.csv'; a.click();
            }}>
            Download Template
          </Button>
        </div>

        {/* File picker */}
        <div>
          <label className="form-label">Select CSV File</label>
          <input type="file" accept=".csv,text/csv" className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            onChange={handleFile} />
        </div>

        {parseErr && <Alert type="error" message={parseErr} />}

        {/* Preview */}
        {resolvedRows.length > 0 && !result && (
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">{resolvedRows.length} row(s) ready to upload</p>
            <div className="overflow-x-auto rounded-lg border border-gray-200 max-h-48">
              <table className="min-w-full text-xs divide-y divide-gray-100">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>{['Name', 'Category ID', 'Asset Tag', 'Serial', 'Value'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {resolvedRows.slice(0, 10).map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 text-gray-800">{r.name}</td>
                      <td className="px-3 py-1.5 text-gray-600 font-mono text-xs">{r.category_id}</td>
                      <td className="px-3 py-1.5 text-gray-600">{r.asset_tag}</td>
                      <td className="px-3 py-1.5 text-gray-600">{r.serial_number}</td>
                      <td className="px-3 py-1.5 text-gray-600">{r.purchase_value}</td>
                    </tr>
                  ))}
                  {resolvedRows.length > 10 && (
                    <tr><td colSpan={5} className="px-3 py-2 text-center text-gray-400 text-xs">…and {resolvedRows.length - 10} more</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-2">
            <div className="flex gap-4 p-3 bg-green-50 rounded-lg border border-green-100">
              <span className="text-sm text-green-700 font-medium">✓ {result.created.length} created</span>
              {result.failed.length > 0 && <span className="text-sm text-red-600 font-medium">✗ {result.failed.length} failed</span>}
            </div>
            {result.failed.length > 0 && (
              <ul className="text-xs text-red-600 space-y-0.5 max-h-28 overflow-y-auto">
                {result.failed.map((f, i) => <li key={i}><strong>{f.asset_tag}</strong>: {f.reason}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
      <ModalActions>
        <Button variant="outline" onClick={onClose}>Close</Button>
        {resolvedRows.length > 0 && !result && (
          <Button icon={<Upload size={14} />} onClick={handleSubmit} loading={bulkCreate.isPending}>
            Upload {resolvedRows.length} Assets
          </Button>
        )}
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
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  const filterParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (filterCategory) p.category_id = filterCategory;
    if (filterStatus) p.status = filterStatus;
    return p;
  }, [filterCategory, filterStatus]);

  const { data: inventory = [], isLoading, error } = useAssetInventory(filterParams);
  const updateAsset = useUpdateAsset();

  const catMap = useMemo(() => {
    const m: Record<string, string> = {};
    (categories as AssetCategory[]).forEach((c) => { m[String(c.id)] = c.name; });
    return m;
  }, [categories]);

  const enrichedInventory = useMemo(() =>
    (inventory as Asset[]).map((a) => ({
      ...a,
      categoryName: catMap[String(a.categoryId)] ?? a.categoryName ?? '—',
    })),
    [inventory, catMap]
  );

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
            <Button size="sm" variant="outline" icon={<Upload size={14} />} onClick={() => setBulkModalOpen(true)}>
              Upload CSV
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
        ) : enrichedInventory.length === 0 ? (
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
                {enrichedInventory.map((asset) => (
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

      <BulkUploadModal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
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

// ── Request Detail Modal ──────────────────────────────────────────────────────

function RequestDetailModal({ req, open, onClose, onApprove, onReject, isAdmin, approving }: {
  req: AssetRequest | null;
  open: boolean;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  isAdmin: boolean;
  approving: boolean;
}) {
  if (!req) return null;

  const statusColors: Record<string, string> = {
    PENDING:   'bg-amber-50 text-amber-700 border-amber-200',
    APPROVED:  'bg-green-50 text-green-700 border-green-200',
    REJECTED:  'bg-red-50 text-red-700 border-red-200',
    FULFILLED: 'bg-blue-50 text-blue-700 border-blue-200',
    CANCELLED: 'bg-gray-50 text-gray-600 border-gray-200',
  };

  return (
    <Modal open={open} onClose={onClose} title="Request Details" size="md">
      <div className="space-y-5">
        {/* Status + Priority bar */}
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${statusColors[req.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
            {req.status}
          </span>
          <Badge variant={priorityVariant(req.priority)}>{req.priority || 'NORMAL'}</Badge>
          <span className="text-xs text-gray-400 ml-auto">
            Submitted {safeFormat(req.createdAt, 'MMM d, yyyy · hh:mm a')}
          </span>
        </div>

        {/* Requester */}
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <User size={12} /> Requested By
          </p>
          <div className="flex items-center gap-3">
            <UserAvatar name={req.requestedByName ?? ''} avatarUrl={req.requestedByAvatar ?? undefined} size="md" />
            <div>
              <p className="text-sm font-semibold text-gray-900">{req.requestedByName ?? '—'}</p>
              {req.requestedByEmail && <p className="text-xs text-gray-500">{req.requestedByEmail}</p>}
            </div>
          </div>
        </div>

        {/* Category + Asset */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
              <Tag size={12} /> Category
            </p>
            <p className="text-sm font-semibold text-gray-900">{req.categoryName ?? '—'}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
              <Package size={12} /> Asset
            </p>
            <p className="text-sm font-semibold text-gray-900">{req.assetName ?? 'Any available'}</p>
            {req.assetTag && <p className="text-xs text-gray-400 font-mono mt-0.5">{req.assetTag}</p>}
          </div>
        </div>

        {/* Reason */}
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
            <FileText size={12} /> Reason
          </p>
          <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-4 leading-relaxed">{req.reason || '—'}</p>
        </div>

        {/* Needed By + Notes */}
        {(req.neededBy || req.reqNotes) && (
          <div className="grid grid-cols-1 gap-3">
            {req.neededBy && (
              <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                <Calendar size={15} className="text-blue-500 shrink-0" />
                <div>
                  <p className="text-xs text-blue-500 font-medium">Needed By</p>
                  <p className="text-sm font-semibold text-blue-800">
                    {(() => { try { return format(parseISO(req.neededBy!), 'MMMM d, yyyy'); } catch { return req.neededBy; } })()}
                  </p>
                </div>
              </div>
            )}
            {req.reqNotes && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                <p className="text-xs text-amber-600 font-medium mb-1">Additional Notes</p>
                <p className="text-sm text-amber-900">{req.reqNotes}</p>
              </div>
            )}
          </div>
        )}

        {/* Admin actions */}
        {isAdmin && req.status === 'PENDING' && (
          <div className="flex gap-3 pt-1 border-t border-gray-100">
            <Button
              className="flex-1 justify-center bg-green-600 hover:bg-green-700 text-white"
              icon={<CheckCircle2 size={15} />}
              onClick={() => { onApprove(req.id); onClose(); }}
              loading={approving}
            >
              Approve Request
            </Button>
            <Button
              variant="outline"
              className="flex-1 justify-center text-red-600 border-red-300 hover:bg-red-50"
              icon={<XCircle size={15} />}
              onClick={() => { onReject(req.id); onClose(); }}
            >
              Reject
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

const RequestsTab = ({ isAdmin, categories, availableAssets }: RequestsTabProps) => {
  const params = useMemo<Record<string, string>>(() => {
    const p: Record<string, string> = {};
    if (isAdmin) p.status = 'PENDING';
    return p;
  }, [isAdmin]);
  const { data: requests = [], isLoading, error } = useAssetRequests(params);
  const approveRequest = useApproveAssetRequest();
  const rejectRequest  = useRejectAssetRequest();
  const [rejectTarget,  setRejectTarget]  = useState<string | null>(null);
  const [detailReq,     setDetailReq]     = useState<AssetRequest | null>(null);
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

  const reqList = requests as AssetRequest[];

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
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            {isAdmin ? 'Pending Asset Requests' : 'My Requests'}
          </h3>
          <span className="text-xs text-gray-400">{reqList.length} request{reqList.length !== 1 ? 's' : ''}</span>
        </div>

        {reqList.length === 0 ? (
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
          <div className="divide-y divide-gray-100">
            {reqList.map((req) => (
              <div
                key={req.id}
                className="px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => setDetailReq(req)}
              >
                {/* Requester avatar */}
                {isAdmin && (
                  <div className="shrink-0">
                    <UserAvatar name={req.requestedByName ?? ''} avatarUrl={req.requestedByAvatar ?? undefined} size="md" />
                  </div>
                )}

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {isAdmin && (
                      <span className="text-sm font-semibold text-gray-900">{req.requestedByName ?? '—'}</span>
                    )}
                    <span className="text-xs text-gray-400">
                      {isAdmin ? '·' : ''} {req.categoryName ?? 'Unknown category'}
                    </span>
                    {req.assetName && (
                      <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Hash size={10} /> {req.assetName}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 truncate">{req.reason || '—'}</p>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {req.neededBy && (
                      <span className="text-xs text-blue-600 flex items-center gap-1">
                        <Clock size={11} />
                        Needed by {(() => { try { return format(parseISO(req.neededBy), 'MMM d'); } catch { return req.neededBy; } })()}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {safeFormat(req.createdAt, 'MMM d, yyyy')}
                    </span>
                  </div>
                </div>

                {/* Priority + Status */}
                <div className="shrink-0 flex flex-col items-end gap-2">
                  <Badge variant={requestStatusVariant(req.status)}>{req.status}</Badge>
                  <Badge variant={priorityVariant(req.priority)}>{req.priority || 'NORMAL'}</Badge>
                </div>

                {/* Admin action buttons */}
                {isAdmin && req.status === 'PENDING' && (
                  <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-green-600 border-green-300 hover:bg-green-50"
                      icon={<CheckCircle2 size={13} />}
                      onClick={() => handleApprove(req.id)}
                      loading={approveRequest.isPending}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-300 hover:bg-red-50"
                      icon={<XCircle size={13} />}
                      onClick={() => setRejectTarget(req.id)}
                    >
                      Reject
                    </Button>
                  </div>
                )}

                <Eye size={15} className="text-gray-300 shrink-0" />
              </div>
            ))}
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

      <RequestDetailModal
        req={detailReq}
        open={detailReq !== null}
        onClose={() => setDetailReq(null)}
        onApprove={handleApprove}
        onReject={(id) => { setDetailReq(null); setRejectTarget(id); }}
        isAdmin={isAdmin}
        approving={approveRequest.isPending}
      />

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
