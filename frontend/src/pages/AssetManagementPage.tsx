import React, { useState, useMemo } from 'react';
import {
  Package, Plus, Edit2, Wrench, CheckCircle2, XCircle,
  RotateCcw, AlertTriangle, Calendar, Tag, Upload, ChevronRight, ChevronLeft, MapPin,
  Eye, Clock, User, FileText, Hash, Search, Key, Monitor, Truck,
  ClipboardCheck, Shield, ChevronDown, ChevronUp, Lock, Info, QrCode, Filter,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import AssetScannerModal from '../components/assets/AssetScannerModal';
import { format, parseISO, isValid } from 'date-fns';
import { useForm } from 'react-hook-form';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import { useI18n } from '../contexts/I18nContext';
import Button from '../components/ui/Button';
import Modal, { ModalActions } from '../components/ui/Modal';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { SkeletonTable, SkeletonCard } from '../components/ui/Skeleton';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission, PERMISSIONS } from '../utils/permissions';
import UserAvatar from '../components/ui/UserAvatar';
import {
  useAssetCategories, useCreateCategory, useAssetInventory, useAvailableAssets, useMyAssets,
  useCreateAsset, useUpdateAsset, useBulkCreateAssets,
  useAssetRequests, useRequestAsset, useUpdateAssetRequest, useApproveAssetRequest, useRejectAssetRequest,
  useStartProcessingRequest, useHandoverAssetRequest,
  useInitiateReturn, useVerifyReturn, useRejectReturn,
  useAssetMaintenance, useScheduleMaintenance, useCompleteMaintenance,
  useAssignableUsers, useAssetOrgRoles,
} from '../hooks/useAssets';

// ── Types ─────────────────────────────────────────────────────────────────────

type AssetStatus = 'AVAILABLE' | 'ASSIGNED' | 'MAINTENANCE' | 'RETIRED';
type RequestStatus =
  | 'PENDING' | 'APPROVED' | 'REJECTED'
  | 'ASSIGNED_TO_OPS' | 'PROCESSING' | 'HANDED_OVER'
  | 'RETURNED' | 'RETURN_VERIFIED'
  | 'FULFILLED' | 'CANCELLED';
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
  // enriched from assignment + request
  daysUsing?: number | null;
  assignedBy?: string | null;
  assignedByName?: string | null;
  assignedByAvatar?: string | null;
  approvedBy?: string | null;
  approvedByName?: string | null;
  approvedByAvatar?: string | null;
  handoverByName?: string | null;
  conditionAtAssignment?: string | null;
  assignmentNotes?: string | null;
  expectedReturnDate?: string | null;
  requestId?: string | null;
  // Status of the underlying asset_request. When equal to 'RETURNED' the user
  // has already initiated a return and we should show the awaiting-verification state.
  requestStatus?: string | null;
  returnAt?: string | null;
  returnReason?: string | null;
  qrToken?: string | null;
}

interface OpsAssignee { id: string; name: string; email: string; avatarUrl?: string; }

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
  // Approval
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  rejectionNotes?: string;
  // Ops
  opsAssignees?: string[];
  opsAssigneeDetails?: OpsAssignee[];
  // Handover
  handoverBy?: string;
  handoverByName?: string;
  handoverAt?: string;
  handoverNotes?: string;
  deviceId?: string;
  deviceUsername?: string;
  devicePassword?: string;
  qrToken?: string | null;
  // Return
  returnBy?: string;
  returnAt?: string;
  returnReason?: string;
  returnCondition?: string;
  returnChecklist?: string[];
  returnNotes?: string;
  returnVerifiedBy?: string;
  returnVerifiedByName?: string | null;
  returnVerifiedByEmail?: string | null;
  returnVerifiedByAvatar?: string | null;
  returnRejectedByName?: string | null;
  returnVerifiedAt?: string;
  // Industry-standard return workflow (Core 3 + partial recovery)
  returnMissingItems?: string[];
  returnDamageSeverity?: 'NONE' | 'MINOR' | 'MODERATE' | 'SEVERE' | null;
  returnDamageDescription?: string | null;
  returnEstimatedCost?: number;
  returnRejectionNotes?: string | null;
  returnRejectedBy?: string | null;
  returnRejectedAt?: string | null;
}

interface MaintenanceRecord {
  id: string;
  assetId: string;
  assetName?: string | null;
  assetTag?: string | null;
  scheduledDate: string;
  completedDate?: string | null;
  maintenanceType: string;
  notes?: string | null;
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


const assetStatusVariant = (status: AssetStatus) => {
  const map: Record<AssetStatus, 'success' | 'default' | 'warning' | 'gray'> = {
    AVAILABLE: 'success',
    ASSIGNED: 'default',
    MAINTENANCE: 'warning',
    RETIRED: 'gray',
  };
  return map[status] ?? 'gray';
};

const requestStatusVariant = (status: RequestStatus): 'warning' | 'success' | 'danger' | 'default' | 'gray' => {
  const map: Record<RequestStatus, 'warning' | 'success' | 'danger' | 'default' | 'gray'> = {
    PENDING:         'warning',
    APPROVED:        'success',
    REJECTED:        'danger',
    ASSIGNED_TO_OPS: 'default',
    PROCESSING:      'default',
    HANDED_OVER:     'success',
    RETURNED:        'warning',
    RETURN_VERIFIED: 'gray',
    FULFILLED:       'success',
    CANCELLED:       'gray',
  };
  return map[status] ?? 'warning';
};

const requestStatusLabel = (status: RequestStatus): string => {
  const map: Record<RequestStatus, string> = {
    PENDING:         'Pending',
    APPROVED:        'Approved',
    REJECTED:        'Rejected',
    ASSIGNED_TO_OPS: 'Ops Assigned',
    PROCESSING:      'Processing',
    HANDED_OVER:     'Handed Over',
    RETURNED:        'Returned',
    RETURN_VERIFIED: 'Return Verified',
    FULFILLED:       'Fulfilled',
    CANCELLED:       'Cancelled',
  };
  return map[status] ?? status;
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
  const { t } = useI18n();
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
        <label className="form-label">{t('blockers.modal.resolution')}</label>
        <textarea
          className="form-textarea"
          rows={3}
          placeholder={t('common.notes')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <ModalActions>
        <Button variant="outline" type="button" onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="danger" onClick={handleConfirm} loading={loading} icon={<XCircle size={16} />}>
          {t('common.reject')}
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
  const { t } = useI18n();
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
    <Modal open={open} onClose={onClose} title={asset ? t('assets.modal.editTitle') : t('assets.modal.createTitle')} size="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && <Alert type="error" message={error} />}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="form-label">{t('assets.modal.nameLabel')}</label>
            <input
              className="form-input"
              placeholder="e.g. MacBook Pro 14-inch"
              {...register('name', { required: t('validation.required') })}
            />
            {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <label className="form-label">{t('assets.modal.category')}</label>
            <select className="form-select" {...register('category_id', { required: t('validation.required') })}>
              <option value="">{t('assets.selectCategory')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {errors.category_id && <p className="text-xs text-red-600 mt-1">{errors.category_id.message}</p>}
          </div>

          <div>
            <label className="form-label">{t('assets.modal.serialNumber')}</label>
            <input
              className="form-input"
              placeholder="e.g. ASSET-001"
              {...register('asset_tag', { required: !asset ? t('validation.required') : false })}
            />
            {errors.asset_tag && <p className="text-xs text-red-600 mt-1">{errors.asset_tag.message}</p>}
          </div>

          <div>
            <label className="form-label">{t('assets.modal.serialNumber')}</label>
            <input
              className="form-input"
              placeholder="e.g. ABC123XYZ"
              {...register('serial_number')}
            />
          </div>

          <div>
            <label className="form-label">{t('assets.purchaseDate')}</label>
            <input type="date" className="form-input" {...register('purchase_date')} />
          </div>

          <div>
            <label className="form-label">{t('assets.purchaseValue')}</label>
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
            <label className="form-label">{t('assets.warrantyExpiry')}</label>
            <input type="date" className="form-input" {...register('warranty_expiry')} />
          </div>

          <div className="col-span-2">
            <label className="form-label">{t('common.notes')} <span className="text-gray-400 font-normal">{t('common.optional2')}</span></label>
            <textarea className="form-textarea" rows={2} {...register('notes')} />
          </div>

          <div className="col-span-2">
            <label className="form-label">{t('common.upload')} <span className="text-gray-400 font-normal">{t('common.optional2')}</span></label>
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
          <Button variant="outline" type="button" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" loading={isSubmitting} icon={<Package size={16} />}>
            {asset ? t('assets.modal.save') : t('assets.modal.create')}
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
  editRequest?: AssetRequest | null;
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

const RequestModal = ({ open, onClose, categories, availableAssets, editRequest }: RequestModalProps) => {
  const { t } = useI18n();
  const isEditMode = !!editRequest;
  const [step, setStep] = useState<1 | 2>(1);
  const [filterCat, setFilterCat] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [anyInCat, setAnyInCat] = useState(false); // "any available" chosen
  const [error, setError] = useState('');
  const requestAsset = useRequestAsset();
  const updateRequest = useUpdateAssetRequest();

  const { register, handleSubmit, reset, watch, setValue, formState: { isSubmitting, errors } } = useForm<RequestFormData>({
    defaultValues: { category_id: '', asset_id: '', reason: '', priority: 'MEDIUM', needed_by: '', notes: '' },
  });

  React.useEffect(() => {
    if (open) {
      if (isEditMode && editRequest) {
        setStep(2);
        setFilterCat(editRequest.categoryId ?? '');
        const origAsset = (availableAssets as Asset[]).find((a) => a.id === editRequest.assetId);
        setSelectedAsset(origAsset ?? null);
        setAnyInCat(!editRequest.assetId && !!editRequest.categoryId);
        const neededByDate = editRequest.neededBy
          ? editRequest.neededBy.split('T')[0]
          : '';
        reset({
          category_id: editRequest.categoryId ?? '',
          asset_id: editRequest.assetId ?? '',
          reason: editRequest.reason ?? '',
          priority: (editRequest.priority as Priority) || 'MEDIUM',
          needed_by: neededByDate,
          notes: editRequest.reqNotes ?? '',
        });
      } else {
        reset({ category_id: '', asset_id: '', reason: '', priority: 'MEDIUM', needed_by: '', notes: '' });
        setStep(1); setFilterCat(''); setSelectedAsset(null); setAnyInCat(false);
      }
      setError('');
    }
  }, [open, isEditMode, editRequest, reset]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (isEditMode && editRequest) {
        await updateRequest.mutateAsync({ id: editRequest.id, data });
      } else {
        await requestAsset.mutateAsync(data);
      }
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Something went wrong');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEditMode ? t('assets.modal.editTitle') : t('assets.new')} size="xl">
      {/* Step progress — hidden in edit mode */}
      {!isEditMode && (
        <div className="flex items-center gap-2 mb-5">
          {[{ n: 1, label: t('assets.browseSelect') }, { n: 2, label: t('assets.requestDetails') }].map(({ n, label }, i) => (
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
      )}

      {error && <Alert type="error" message={error} className="mb-4" />}

      {/* ── STEP 1: Browse & pick asset ── */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Category chips */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">{t('assets.filterByCategory')}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { setFilterCat(''); setSelectedAsset(null); setAnyInCat(false); setValue('category_id', ''); setValue('asset_id', ''); }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  !filterCat ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
                }`}
              >
                {t('common.all')} ({(availableAssets as Asset[]).length})
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
              <div className="py-8 px-5 bg-amber-50 border border-amber-200 rounded-xl text-center">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                    <Package size={20} className="text-amber-500" />
                  </div>
                  <p className="text-sm font-semibold text-amber-800">{t('assets.noStockInCategory')}</p>
                  <p className="text-xs text-amber-600 max-w-xs leading-relaxed">
                    There are currently no available assets in <strong>{selCatName}</strong>.
                    You can still submit a request — the ops team will be notified and procure one for you.
                  </p>
                  <button type="button" onClick={handleSelectAny}
                    className={`mt-1 px-4 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${
                      anyInCat
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-white text-amber-700 border-amber-400 hover:bg-amber-50'
                    }`}>
                    {anyInCat ? t('assets.requestSubmittedOps') : t('assets.submitAnyway')}
                  </button>
                </div>
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
                      <p className="text-sm font-semibold text-gray-700">{t('assets.anyAvailable')}</p>
                      <p className="text-xs text-gray-400">{t('assets.adminWillPick')}</p>
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
            <Button variant="outline" type="button" onClick={onClose}>{t('common.cancel')}</Button>
            <Button
              type="button"
              onClick={handleNext}
              disabled={!filterCat && !selectedAsset}
              icon={<ChevronRight size={14} />}
            >
              {t('assets.nextRequestDetails')}
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
                {selectedAsset
                  ? selectedAsset.assetName
                  : (isEditMode && editRequest?.assetId && editRequest?.assetName)
                    ? editRequest.assetName
                    : `Any available · ${selCatName}`}
              </p>
              {selectedAsset && (
                <p className="text-xs text-indigo-500">
                  {[selectedAsset.brand, selectedAsset.model, selectedAsset.assetTag].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            <button type="button" onClick={() => setStep(1)} className="text-xs text-indigo-500 hover:text-indigo-700 font-medium shrink-0">
              {t('common.edit')}
            </button>
          </div>

          {/* Reason */}
          <div>
            <label className="form-label">{t('blockers.modal.descLabel')} <span className="text-red-500">*</span></label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="Why do you need this asset? Describe your use case…"
              {...register('reason', { required: t('validation.required') })}
            />
            {errors.reason && <p className="text-xs text-red-600 mt-1">{errors.reason.message}</p>}
          </div>

          {/* Priority + Needed by */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">{t('common.priority')}</label>
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
              <label className="form-label">{t('common.dueDate')} <span className="text-gray-400 font-normal">{t('common.optional2')}</span></label>
              <input type="date" className="form-input" {...register('needed_by')} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="form-label">{t('common.notes')} <span className="text-gray-400 font-normal">{t('common.optional2')}</span></label>
            <textarea
              className="form-textarea"
              rows={2}
              placeholder="Special requirements, preferred specs, or any other details…"
              {...register('notes')}
            />
          </div>

          <ModalActions>
            {!isEditMode && (
              <Button variant="outline" type="button" onClick={() => setStep(1)}>{t('common.back')}</Button>
            )}
            <Button type="submit" loading={isSubmitting} icon={isEditMode ? <Edit2 size={16} /> : <Plus size={16} />}>
              {isEditMode ? t('assets.modal.save') : t('common.submit')}
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
  const { t } = useI18n();
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
      await scheduleMaintenance.mutateAsync({
        asset_id:       data.asset_id,
        type:           data.maintenance_type,
        scheduled_date: data.scheduled_date,
        description:    data.notes,
      });
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Something went wrong');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('assets.modal.createTitle')} size="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && <Alert type="error" message={error} />}

        <div>
          <label className="form-label">{t('assets.modal.nameLabel')}</label>
          <select className="form-select" {...register('asset_id', { required: t('validation.required') })}>
            <option value="">{t('assets.selectAsset')}</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.assetName}{a.serialNumber ? ` · ${a.serialNumber}` : ''}
              </option>
            ))}
          </select>
          {errors.asset_id && <p className="text-xs text-red-600 mt-1">{errors.asset_id.message}</p>}
        </div>

        <div>
          <label className="form-label">{t('milestones.modal.dueDate')}</label>
          <input
            type="date"
            className="form-input"
            {...register('scheduled_date', { required: t('validation.required') })}
          />
          {errors.scheduled_date && <p className="text-xs text-red-600 mt-1">{errors.scheduled_date.message}</p>}
        </div>

        <div>
          <label className="form-label">{t('common.type')}</label>
          <input
            className="form-input"
            placeholder="e.g. Battery replacement, OS upgrade…"
            {...register('maintenance_type', { required: t('validation.required') })}
          />
          {errors.maintenance_type && <p className="text-xs text-red-600 mt-1">{errors.maintenance_type.message}</p>}
        </div>

        <div>
          <label className="form-label">{t('common.notes')} <span className="text-gray-400 font-normal">{t('common.optional2')}</span></label>
          <textarea className="form-textarea" rows={2} {...register('notes')} />
        </div>

        <ModalActions>
          <Button variant="outline" type="button" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" loading={isSubmitting || scheduleMaintenance.isPending} icon={<Wrench size={16} />}>
            {t('common.save')}
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
  const { t } = useI18n();
  const { data: myAssets = [], isLoading, error } = useMyAssets();
  const initiateReturn = useInitiateReturn();
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  // returnTarget holds the *request id*, not the asset id — the user-initiated
  // return goes through POST /requests/:id/return (gated on ASSET_READ) so it
  // works for everyone. The legacy /assignments/:id/return endpoint needs
  // ASSET_ASSIGN and silently 403s for normal requesters.
  const [returnTarget, setReturnTarget] = useState<{ requestId: string; assetName?: string } | null>(null);
  const [returnNotes, setReturnNotes]   = useState('');
  const [returnError, setReturnError]   = useState('');
  // QR sticker — the per-assignment token surfaced by the backend so the
  // owner can re-print the sticker without having to dig into the request.
  const [qrTarget, setQrTarget] = useState<{ token: string; assetName?: string; assetTag?: string | null } | null>(null);

  React.useEffect(() => {
    if (returnTarget) { setReturnNotes(''); setReturnError(''); }
  }, [returnTarget]);

  const handleReturn = async () => {
    if (!returnTarget) return;
    try {
      setReturnError('');
      await initiateReturn.mutateAsync({
        id: returnTarget.requestId,
        data: { reason: returnNotes },
      });
      setReturnTarget(null);
    } catch (err) {
      setReturnError(err instanceof Error ? err.message : 'Could not initiate return');
    }
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
          {t('assets.new')}
        </Button>
      </div>

      {(myAssets as Asset[]).length === 0 ? (
        <EmptyState
          icon={<Package size={36} />}
          title={t('assets.noAssets')}
          description={t('assets.noAssetsDesc')}
          action={
            <Button size="sm" icon={<Plus size={14} />} onClick={() => setRequestModalOpen(true)}>
              {t('assets.new')}
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(myAssets as Asset[]).map((asset) => {
            const returnPending = asset.requestStatus === 'RETURNED';
            return (
            <div key={asset.id} className={`rounded-xl border shadow-sm overflow-hidden flex flex-col ${
              returnPending
                ? 'bg-amber-50/40 border-amber-200'
                : 'bg-white border-gray-200'
            }`}>
              {/* Card header — colored band reflects state. Amber when a return
                  has been initiated and is waiting on ops to verify. */}
              <div className={`h-1.5 w-full ${
                returnPending
                  ? 'bg-gradient-to-r from-amber-400 to-orange-500'
                  : asset.status === 'ASSIGNED'
                    ? 'bg-gradient-to-r from-indigo-500 to-violet-500'
                    : 'bg-gray-200'
              }`} />

              <div className="p-5 flex flex-col gap-4 flex-1">
                {/* Title row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-base font-bold text-gray-900 truncate">{asset.assetName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{asset.categoryName ?? '—'}</p>
                  </div>
                  {returnPending ? (
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                      RETURN REQUESTED
                    </span>
                  ) : (
                    <Badge variant={assetStatusVariant(asset.status)}>{asset.status}</Badge>
                  )}
                </div>

                {returnPending && (
                  <div className="bg-amber-100/60 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
                    <Clock size={13} className="text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs leading-snug">
                      <p className="font-semibold text-amber-800">{t('assets.awaitingOpsVerification')}</p>
                      <p className="text-amber-700">
                        {t('assets.returnInitiatedDesc')}{asset.returnAt ? ` on ${safeFormat(asset.returnAt, 'MMM d')}` : ''}
                      </p>
                    </div>
                  </div>
                )}

                {/* Serial number */}
                {asset.serialNumber && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                    <Tag size={12} className="shrink-0 text-gray-400" />
                    <span className="font-mono font-medium text-gray-700">{asset.serialNumber}</span>
                    {asset.conditionAtAssignment && (
                      <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full ${conditionColor(asset.conditionAtAssignment)}`}>
                        {asset.conditionAtAssignment}
                      </span>
                    )}
                  </div>
                )}

                {/* Info grid */}
                <div className="space-y-2.5">
                  {/* Assigned date + days using */}
                  {asset.assignedDate && (
                    <div className="flex items-center gap-2">
                      <Calendar size={13} className="shrink-0 text-indigo-400" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-gray-500">{t('assets.assignedOn')} </span>
                        <span className="text-xs font-semibold text-gray-800">{safeFormat(asset.assignedDate, 'MMM d, yyyy')}</span>
                      </div>
                      {asset.daysUsing != null && (
                        <span className="text-[10px] font-bold bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full whitespace-nowrap">
                          {asset.daysUsing === 0 ? 'Today' : `${asset.daysUsing}d`}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Handed over by */}
                  {(asset.handoverByName || asset.assignedByName) && (
                    <div className="flex items-center gap-2">
                      <Truck size={13} className="shrink-0 text-teal-400" />
                      <span className="text-xs text-gray-500">{t('assets.givenBy')} </span>
                      <div className="flex items-center gap-1.5 ml-auto">
                        <UserAvatar name={asset.handoverByName ?? asset.assignedByName ?? ''} size="sm" />
                        <span className="text-xs font-semibold text-gray-800 truncate max-w-[100px]">
                          {asset.handoverByName ?? asset.assignedByName}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Approved by */}
                  {asset.approvedByName && (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={13} className="shrink-0 text-green-400" />
                      <span className="text-xs text-gray-500">{t('assets.approvedBy')} </span>
                      <div className="flex items-center gap-1.5 ml-auto">
                        <UserAvatar name={asset.approvedByName} avatarUrl={asset.approvedByAvatar ?? undefined} size="sm" />
                        <span className="text-xs font-semibold text-gray-800 truncate max-w-[100px]">
                          {asset.approvedByName}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Expected return date */}
                  {asset.expectedReturnDate && (
                    <div className="flex items-center gap-2">
                      <Clock size={13} className="shrink-0 text-amber-400" />
                      <span className="text-xs text-gray-500">{t('assets.returnBy')} </span>
                      <span className="text-xs font-semibold text-amber-700 ml-auto">
                        {safeFormat(asset.expectedReturnDate, 'MMM d, yyyy')}
                      </span>
                    </div>
                  )}
                </div>

                {/* Notes */}
                {asset.assignmentNotes && (
                  <p className="text-xs text-gray-500 italic bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">
                    "{asset.assignmentNotes}"
                  </p>
                )}

                <div className="mt-auto space-y-2">
                  {asset.qrToken && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      icon={<QrCode size={14} />}
                      onClick={() => setQrTarget({
                        token: asset.qrToken!,
                        assetName: asset.assetName,
                        assetTag: asset.assetTag ?? null,
                      })}
                    >
                      {t('assets.scanQr')}
                    </Button>
                  )}

                <Button
                  size="sm"
                  variant="outline"
                  icon={<RotateCcw size={14} />}
                  disabled={!asset.requestId || returnPending}
                  title={
                    returnPending
                      ? 'Return already requested — waiting for ops to verify.'
                      : !asset.requestId
                        ? 'Contact your IT admin — this asset was directly assigned and has no request to return through.'
                        : undefined
                  }
                  onClick={() => asset.requestId && setReturnTarget({ requestId: String(asset.requestId), assetName: asset.assetName })}
                >
                  {returnPending ? t('statuses.pending') : t('assets.checkIn')}
                </Button>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      <RequestModal
        open={requestModalOpen}
        onClose={() => setRequestModalOpen(false)}
        categories={categories}
        availableAssets={availableAssets}
      />

      {/* Printable QR sticker for the asset the user currently holds. */}
      <Modal open={qrTarget !== null} onClose={() => setQrTarget(null)} title={t('assets.qrSticker')} size="sm">
        {qrTarget && (
          <div className="space-y-3 flex flex-col items-center">
            <div className="bg-white p-3 rounded-lg border border-gray-200">
              <QRCodeCanvas
                id={`my-asset-qr-${qrTarget.token}`}
                value={`dsync://asset-scan/${qrTarget.token}`}
                size={208}
                level="M"
                includeMargin={false}
              />
            </div>
            <p className="text-sm font-semibold text-gray-900 text-center">{qrTarget.assetName ?? '—'}</p>
            {qrTarget.assetTag && (
              <p className="text-xs text-gray-500 font-mono">{qrTarget.assetTag}</p>
            )}
            <p className="text-xs text-gray-500 text-center leading-snug">
              {t('assets.qrStickerDesc')}
            </p>
            <Button
              size="sm"
              variant="outline"
              icon={<Upload size={14} className="rotate-180" />}
              onClick={() => {
                const canvas = document.getElementById(`my-asset-qr-${qrTarget.token}`) as HTMLCanvasElement | null;
                if (!canvas) return;
                const link = document.createElement('a');
                link.href = canvas.toDataURL('image/png');
                link.download = `asset-qr-${qrTarget.assetTag || qrTarget.token}.png`;
                link.click();
              }}
            >
              {t('assets.download')}
            </Button>
          </div>
        )}
      </Modal>

      {/* Return confirm modal — initiates the return so ops can verify. */}
      <Modal open={returnTarget !== null} onClose={() => setReturnTarget(null)} title={t('assets.checkIn')} size="md">
        <div className="space-y-3">
          {returnError && <Alert type="error" message={returnError} />}
          <p className="text-sm text-gray-600">
            {t('assets.initiateReturnDesc', { name: returnTarget?.assetName ?? t('assets.thisAsset') })}
          </p>
          <div>
            <label className="form-label">{t('common.notes')} <span className="text-gray-400 font-normal">{t('common.optional2')}</span></label>
            <textarea className="form-textarea" rows={3}
              placeholder="e.g. Leaving the team, upgrading to a new device…"
              value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} />
          </div>
        </div>
        <ModalActions>
          <Button variant="outline" onClick={() => setReturnTarget(null)}>{t('common.cancel')}</Button>
          <Button
            icon={<RotateCcw size={16} />}
            loading={initiateReturn.isPending}
            onClick={handleReturn}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            {t('assets.checkIn')}
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
  const { t } = useI18n();
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
    <Modal open={open} onClose={onClose} title={t('assets.modal.category')} size="sm">
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
            {t('common.add')}
          </Button>
        </div>
        {categories.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">{t('common.noData')}</p>
        ) : (
          <ul className="divide-y divide-gray-100 max-h-56 overflow-y-auto rounded-lg border border-gray-200">
            {categories.map((c) => (
              <li key={c.id} className="px-3 py-2 text-sm text-gray-800">{c.name}</li>
            ))}
          </ul>
        )}
      </div>
      <ModalActions>
        <Button variant="outline" onClick={onClose}>{t('common.close')}</Button>
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
  const { t } = useI18n();
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
    <Modal open={open} onClose={onClose} title={t('common.upload')} size="lg">
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
            {t('assets.download')}
          </Button>
        </div>

        {/* File picker */}
        <div>
          <label className="form-label">{t('common.upload')}</label>
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
        <Button variant="outline" onClick={onClose}>{t('common.close')}</Button>
        {resolvedRows.length > 0 && !result && (
          <Button icon={<Upload size={14} />} onClick={handleSubmit} loading={bulkCreate.isPending}>
            {t('common.upload')} {resolvedRows.length}
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
  const { t } = useI18n();
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [invPage, setInvPage] = useState(1);
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
  const { data: allInventory = [] }                = useAssetInventory(); // unfiltered for summary
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

  // Count per asset name across full (unfiltered) inventory for stock badge
  const assetNameCount = useMemo(() => {
    const counts: Record<string, number> = {};
    (allInventory as Asset[]).forEach((a) => {
      const key = (a.assetName ?? '').toLowerCase();
      if (key) counts[key] = (counts[key] ?? 0) + 1;
    });
    return counts;
  }, [allInventory]);

  // Stock summary derived from full (unfiltered) inventory
  const stockSummary = useMemo(() => {
    const all = allInventory as Asset[];
    const total     = all.length;
    const available = all.filter((a) => a.status === 'AVAILABLE').length;
    const assigned  = all.filter((a) => a.status === 'ASSIGNED').length;
    const inMaint   = all.filter((a) => a.status === 'MAINTENANCE').length;

    const byCat: Array<{ name: string; total: number; available: number }> = categories.map((c) => {
      const items = all.filter((a) => String(a.categoryId) === String(c.id));
      return { name: c.name, total: items.length, available: items.filter((a) => a.status === 'AVAILABLE').length };
    }).filter((c) => c.total > 0);

    return { total, available, assigned, inMaint, byCat };
  }, [allInventory, categories]);

  React.useEffect(() => { setInvPage(1); }, [filterCategory, filterStatus]);

  const pagedInventory = enrichedInventory.slice((invPage - 1) * PAGE_SIZE, invPage * PAGE_SIZE);

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
      {/* Stock Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t('assets.title'),                   value: stockSummary.total,     color: 'text-gray-700',   bg: 'bg-gray-50',   border: 'border-gray-200' },
          { label: t('assets.status.available'),        value: stockSummary.available,  color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200' },
          { label: t('assets.status.checkedOut'),       value: stockSummary.assigned,   color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200' },
          { label: t('assets.status.maintenance'),      value: stockSummary.inMaint,    color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200' },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl px-4 py-3 flex flex-col gap-0.5`}>
            <span className={`text-2xl font-bold ${s.color}`}>{s.value}</span>
            <span className="text-xs text-gray-500 font-medium">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Category stock breakdown */}
      {stockSummary.byCat.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t('assets.stockByCategory')}</p>
          <div className="flex flex-wrap gap-2">
            {stockSummary.byCat.map((c) => (
              <div key={c.name}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer transition-colors ${
                  c.available === 0
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : 'bg-green-50 border-green-200 text-green-700'
                }`}
                onClick={() => setFilterCategory(
                  categories.find((cat) => cat.name === c.name)?.id ?? ''
                )}
              >
                <span>{c.name}</span>
                <span className="font-bold">{c.available}/{c.total}</span>
                {c.available === 0 && <span className="ml-0.5 text-red-500">⚠</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[160px]">
          <select
            className="form-select"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="">{t('common.all')}</option>
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
            <option value="">{t('common.all')}</option>
            <option value="AVAILABLE">{t('assets.status.available')}</option>
            <option value="ASSIGNED">{t('assets.status.checkedOut')}</option>
            <option value="MAINTENANCE">{t('assets.status.maintenance')}</option>
            <option value="RETIRED">{t('assets.status.retired')}</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">{t('assets.title')}</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" icon={<Tag size={14} />} onClick={() => setCatModalOpen(true)}>
              {t('assets.modal.category')} {categories.length > 0 && <span className="ml-1 text-xs text-gray-500">({categories.length})</span>}
            </Button>
            <Button size="sm" variant="outline" icon={<Upload size={14} />} onClick={() => setBulkModalOpen(true)}>
              {t('common.upload')}
            </Button>
            <Button size="sm" icon={<Plus size={14} />} onClick={() => { setEditAsset(null); setModalOpen(true); }}>
              {t('assets.modal.create')}
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
            title={t('assets.noAssets')}
            description={t('assets.noAssetsDesc')}
          />
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50/80">
                <tr>
                  {[t('assets.modal.nameLabel'), t('assets.modal.category'), t('assets.modal.serialNumber'), t('common.status'), t('projects.modal.startDate'), t('assets.cost'), t('common.actions')].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagedInventory.map((asset) => {
                  const totalCount = assetNameCount[(asset.assetName ?? '').toLowerCase()] ?? 1;
                  return (
                  <tr key={asset.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{asset.assetName}</span>
                        {totalCount > 1 && (
                          <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                            {totalCount} in stock
                          </span>
                        )}
                      </div>
                    </td>
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
                        ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(asset.purchaseCost)
                        : '—'
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(asset)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors rounded"
                          title={t('common.edit')}
                        >
                          <Edit2 size={14} />
                        </button>
                        {asset.status !== 'RETIRED' && (
                          <button
                            onClick={() => setRetireTarget(asset)}
                            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded"
                            title={t('assets.retireAsset')}
                          >
                            <AlertTriangle size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={invPage} totalCount={enrichedInventory.length} onChange={setInvPage} />
          </>
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
      <Modal open={retireTarget !== null} onClose={() => setRetireTarget(null)} title={t('assets.status.retired')} size="sm">
        <p className="text-sm text-gray-600">
          {t('common.confirmDeleteDesc')} <strong>{retireTarget?.assetName}</strong>
        </p>
        <ModalActions>
          <Button variant="outline" onClick={() => setRetireTarget(null)}>{t('common.cancel')}</Button>
          <Button
            variant="danger"
            icon={<AlertTriangle size={16} />}
            loading={updateAsset.isPending}
            onClick={handleRetire}
          >
            {t('assets.status.retired')}
          </Button>
        </ModalActions>
      </Modal>
    </div>
  );
};

// ── Approve Modal (with ops assignment) ──────────────────────────────────────

interface ApproveModalProps {
  open: boolean;
  onClose: () => void;
  request: AssetRequest | null;
  onDone: () => void;
}

const ApproveModal = ({ open, onClose, request, onDone }: ApproveModalProps) => {
  const { t } = useI18n();
  const approveRequest = useApproveAssetRequest();
  const { data: allUsers = [] } = useAssignableUsers();
  const { data: orgRoles = [] } = useAssetOrgRoles();
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [message, setMessage]             = useState('');
  const [userSearch, setUserSearch]       = useState('');
  const [error, setError]                 = useState('');
  const [showOpsSection, setShowOpsSection] = useState(false);

  React.useEffect(() => {
    if (open) { setSelectedUsers([]); setSelectedRoles([]); setMessage(''); setError(''); setUserSearch(''); setShowOpsSection(false); }
  }, [open]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filteredUsers = useMemo(() => (allUsers as any[]).filter((u: any) =>
    !userSearch || u.name?.toLowerCase().includes(userSearch.toLowerCase()) || u.email?.toLowerCase().includes(userSearch.toLowerCase())
  ), [allUsers, userSearch]);

  const toggleUser = (id: string) => setSelectedUsers((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toggleRole = (id: string) => setSelectedRoles((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const handleApprove = async () => {
    if (!request) return;
    try {
      setError('');
      await approveRequest.mutateAsync({
        id: request.id,
        data: {
          ops_user_ids: selectedUsers,
          ops_role_ids: selectedRoles,
          approval_message: message,
        },
      });
      onDone();
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Approval failed');
    }
  };

  if (!request) return null;
  const hasOps = selectedUsers.length > 0 || selectedRoles.length > 0;

  return (
    <Modal open={open} onClose={onClose} title={t('common.approve')} size="lg">
      <div className="space-y-4">
        {error && <Alert type="error" message={error} />}

        {/* Request summary */}
        <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-3">
          <UserAvatar name={request.requestedByName ?? ''} avatarUrl={request.requestedByAvatar ?? undefined} size="md" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">{request.requestedByName ?? '—'}</p>
            <p className="text-xs text-gray-500 truncate">{request.categoryName} {request.assetName ? `· ${request.assetName}` : ''}</p>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{request.reason}</p>
          </div>
        </div>

        {/* Optional message */}
        <div>
          <label className="form-label">{t('common.notes')} <span className="text-gray-400 font-normal">{t('common.optional2')}</span></label>
          <textarea className="form-textarea" rows={2} placeholder="Any instructions for the ops team or requester…"
            value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>

        {/* Ops assignment section */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            onClick={() => setShowOpsSection((v) => !v)}
          >
            <div className="flex items-center gap-2">
              <Truck size={14} className="text-amber-500" />
              <span className="text-sm font-medium text-gray-800">{t('assets.assignToOps')}</span>
              {hasOps && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                  {selectedUsers.length + selectedRoles.length} selected
                </span>
              )}
            </div>
            {showOpsSection ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
          </button>

          {showOpsSection && (
            <div className="border-t border-gray-100 p-4 space-y-4">
              <p className="text-xs text-gray-500">
                {t('assets.opsNotifyDesc')}
              </p>

              {/* Org Roles */}
              {(orgRoles as { id: string; name: string }[]).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide flex items-center gap-1.5"><Shield size={11} /> {t('assets.roles')}</p>
                  <div className="flex flex-wrap gap-2">
                    {(orgRoles as { id: string; name: string }[]).map((role) => (
                      <button key={role.id} type="button"
                        onClick={() => toggleRole(role.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                          selectedRoles.includes(role.id)
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'
                        }`}>
                        {role.name}
                        {selectedRoles.includes(role.id) && ' ✓'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Individual Users */}
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide flex items-center gap-1.5"><User size={11} /> {t('assets.individualUsers')}</p>
                <div className="relative mb-2">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input className="form-input pl-8 text-sm py-1.5" placeholder="Search users…"
                    value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1 border border-gray-100 rounded-lg p-1">
                  {(filteredUsers as { id: string; name: string; email: string; avatarUrl?: string }[]).map((u) => (
                    <button key={u.id} type="button"
                      onClick={() => toggleUser(u.id)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                        selectedUsers.includes(u.id) ? 'bg-amber-50 border border-amber-200' : 'hover:bg-gray-50'
                      }`}>
                      <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{u.name}</p>
                        <p className="text-xs text-gray-400 truncate">{u.email}</p>
                      </div>
                      {selectedUsers.includes(u.id) && <CheckCircle2 size={14} className="text-amber-600 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <ModalActions>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            onClick={handleApprove}
            loading={approveRequest.isPending}
            icon={<CheckCircle2 size={15} />}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {hasOps ? t('common.approve') : t('common.approve')}
          </Button>
        </ModalActions>
      </div>
    </Modal>
  );
};

// ── Handover Modal ────────────────────────────────────────────────────────────

interface HandoverModalProps {
  open: boolean;
  onClose: () => void;
  request: AssetRequest | null;
  availableAssets: Asset[];
  onDone: () => void;
}

const HandoverModal = ({ open, onClose, request, availableAssets, onDone }: HandoverModalProps) => {
  const { t } = useI18n();
  const handover = useHandoverAssetRequest();
  const [assetId, setAssetId]           = useState('');
  const [deviceId, setDeviceId]         = useState('');
  const [deviceUsername, setDeviceUsername] = useState('');
  const [devicePassword, setDevicePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [notes, setNotes]               = useState('');
  const [error, setError]               = useState('');

  React.useEffect(() => {
    if (open) {
      setAssetId(request?.assetId ?? '');
      setDeviceId(''); setDeviceUsername(''); setDevicePassword('');
      setShowPassword(false); setNotes(''); setError('');
    }
  }, [open, request]);

  const handleSubmit = async () => {
    if (!request) return;
    if (!assetId) { setError('Please select an asset to hand over'); return; }
    try {
      setError('');
      await handover.mutateAsync({
        id: request.id,
        data: { asset_id: assetId, device_id: deviceId, device_username: deviceUsername, device_password: devicePassword, notes },
      });
      onDone();
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Handover failed');
    }
  };

  if (!request) return null;
  const filteredAssets = availableAssets.filter((a) => !request.categoryId || String(a.categoryId) === request.categoryId);

  return (
    <Modal open={open} onClose={onClose} title={t('assets.checkOut')} size="2xl">
      <div className="space-y-4">
        {error && <Alert type="error" message={error} />}

        {/* "Who it's for" + asset picker — full width since these are the
            primary decisions for the handover. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 flex items-center gap-3">
            <UserAvatar name={request.requestedByName ?? ''} avatarUrl={request.requestedByAvatar ?? undefined} size="sm" />
            <div>
              <p className="text-xs text-indigo-500 font-medium">{t('assets.handingOverTo')}</p>
              <p className="text-sm font-semibold text-indigo-800">{request.requestedByName ?? '—'}</p>
            </div>
          </div>

          <div>
            <label className="form-label">{t('assets.modal.assignTo')}</label>
            <select className="form-select" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
              <option value="">{t('assets.chooseAsset')}</option>
              {filteredAssets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.assetName}{a.assetTag ? ` (${a.assetTag})` : ''}{a.serialNumber ? ` · ${a.serialNumber}` : ''}
                </option>
              ))}
              {availableAssets.filter((a) => !filteredAssets.some((f) => f.id === a.id)).length > 0 && (
                <>
                  <option disabled>── Other categories ──</option>
                  {availableAssets.filter((a) => !filteredAssets.some((f) => f.id === a.id)).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.assetName}{a.assetTag ? ` (${a.assetTag})` : ''}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>
        </div>

        {/* Credentials + notes side-by-side on md+ so the modal grows wide
            instead of tall. The credentials block keeps its own internal grid. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-gray-200 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-1.5">
              <Key size={12} /> {t('assets.deviceCredentials')} <span className="text-gray-400 font-normal normal-case">{t('common.optional2')}</span>
            </p>
            <div>
              <label className="form-label">{t('assets.deviceId')}</label>
              <input className="form-input" placeholder="e.g. IMEI, device serial…" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">{t('assets.deviceUsername')}</label>
                <input className="form-input" placeholder="Username or email…" value={deviceUsername} onChange={(e) => setDeviceUsername(e.target.value)} />
              </div>
              <div>
                <label className="form-label">{t('assets.devicePassword')}</label>
                <div className="relative">
                  <input
                    className="form-input pr-9"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Device password…"
                    value={devicePassword}
                    onChange={(e) => setDevicePassword(e.target.value)}
                  />
                  <button type="button" onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <Lock size={13} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col">
            <label className="form-label">{t('common.notes')} <span className="text-gray-400 font-normal">{t('common.optional2')}</span></label>
            <textarea className="form-textarea flex-1 min-h-[160px]" placeholder="Collection point, instructions, accessories included…"
              value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <ModalActions>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={handleSubmit} loading={handover.isPending} icon={<Truck size={15} />}
            className="bg-violet-600 hover:bg-violet-700 text-white">
            {t('assets.checkOut')}
          </Button>
        </ModalActions>
      </div>
    </Modal>
  );
};

// ── Verify Return Modal ───────────────────────────────────────────────────────

const DEFAULT_CHECKLIST = [
  'Power adapter / charger included',
  'Original packaging / box',
  'No visible physical damage',
  'Device is factory reset / data wiped',
  'All accessories returned',
];

interface VerifyReturnModalProps {
  open: boolean;
  onClose: () => void;
  request: AssetRequest | null;
  onDone: () => void;
}

type ItemStatus = 'PRESENT' | 'MISSING';
type Condition  = 'GOOD' | 'FAIR' | 'DAMAGED' | 'LOST';
type Severity   = 'NONE' | 'MINOR' | 'MODERATE' | 'SEVERE';

const VerifyReturnModal = ({ open, onClose, request, onDone }: VerifyReturnModalProps) => {
  const { t } = useI18n();
  const verify = useVerifyReturn();
  const reject = useRejectReturn();
  const [condition, setCondition] = useState<Condition>('GOOD');
  // Per-item status enables partial-recovery reporting (e.g. charger MISSING,
  // laptop PRESENT). Stored as { item: status } so we can emit two arrays.
  const [checklistState, setChecklistState] = useState<Record<string, ItemStatus>>({});
  const [damageSeverity, setDamageSeverity] = useState<Severity>('NONE');
  const [damageDescription, setDamageDescription] = useState('');
  const [estimatedCost, setEstimatedCost] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionNotes, setRejectionNotes] = useState('');

  React.useEffect(() => {
    if (open) {
      setCondition('GOOD');
      setChecklistState({});
      setDamageSeverity('NONE');
      setDamageDescription('');
      setEstimatedCost('');
      setNotes('');
      setError('');
      setShowRejectForm(false);
      setRejectionNotes('');
    }
  }, [open]);

  const setItem = (item: string, status: ItemStatus) =>
    setChecklistState((prev) => ({ ...prev, [item]: status }));

  const presentItems = Object.entries(checklistState).filter(([, s]) => s === 'PRESENT').map(([k]) => k);
  const missingItems = Object.entries(checklistState).filter(([, s]) => s === 'MISSING').map(([k]) => k);
  const isDamaged = condition === 'DAMAGED' || condition === 'LOST';

  const handleSubmit = async () => {
    if (!request) return;
    if (isDamaged && !damageDescription.trim()) {
      setError('Please describe the damage / loss');
      return;
    }
    try {
      setError('');
      await verify.mutateAsync({
        id: request.id,
        data: {
          condition,
          checklist: presentItems,
          missing_items: missingItems,
          damage_severity: damageSeverity,
          damage_description: damageDescription,
          estimated_cost: parseFloat(estimatedCost) || 0,
          notes,
        },
      });
      onDone();
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Verification failed');
    }
  };

  const handleReject = async () => {
    if (!request) return;
    if (!rejectionNotes.trim()) {
      setError('Please explain what the requester needs to fix');
      return;
    }
    try {
      setError('');
      await reject.mutateAsync({ id: request.id, data: { notes: rejectionNotes } });
      onDone();
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Rejection failed');
    }
  };

  if (!request) return null;

  return (
    <Modal open={open} onClose={onClose} title={t('assets.verifyReturn')} size="2xl">
      <div className="space-y-4">
        {error && <Alert type="error" message={error} />}

        <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-3">
          <UserAvatar name={request.requestedByName ?? ''} size="sm" />
          <div>
            <p className="text-xs text-gray-400">{t('assets.returnedBy')}</p>
            <p className="text-sm font-semibold text-gray-900">{request.requestedByName ?? '—'}</p>
          </div>
          {request.assetName && (
            <span className="ml-auto text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full font-medium">
              {request.assetName}
            </span>
          )}
        </div>

        {showRejectForm ? (
          /* ── Reject (bounce-back) flow ─────────────────────────────────── */
          <div className="space-y-3">
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
                {t('assets.bounceReturnBack')}
              </p>
              <p className="text-xs text-amber-800 leading-snug">
                {t('assets.bounceReturnDesc')}
              </p>
            </div>
            <div>
              <label className="form-label">{t('assets.whatNeedsToBeFixed')} <span className="text-red-500">*</span></label>
              <textarea className="form-textarea" rows={3}
                placeholder="e.g. Returned without the charger. Please bring the original charger to the IT desk."
                value={rejectionNotes} onChange={(e) => setRejectionNotes(e.target.value)} />
            </div>
            <ModalActions>
              <Button variant="outline" onClick={() => setShowRejectForm(false)}>{t('common.back')}</Button>
              <Button onClick={handleReject} loading={reject.isPending}
                className="bg-amber-600 hover:bg-amber-700 text-white" icon={<RotateCcw size={15} />}>
                {t('assets.bounceBackToRequester')}
              </Button>
            </ModalActions>
          </div>
        ) : (
          /* ── Verify flow ───────────────────────────────────────────────── */
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* LEFT — outcome */}
              <div className="space-y-4">
                <div>
                  <label className="form-label">{t('assets.assetCondition')} <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-4 gap-2 mt-1">
                    {(['GOOD', 'FAIR', 'DAMAGED', 'LOST'] as const).map((c) => (
                      <button key={c} type="button"
                        onClick={() => setCondition(c)}
                        className={`py-2.5 rounded-xl text-xs font-semibold border-2 transition-all ${
                          condition === c
                            ? c === 'GOOD'    ? 'border-green-500 bg-green-50 text-green-700'
                            : c === 'FAIR'    ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : c === 'DAMAGED' ? 'border-amber-500 bg-amber-50 text-amber-700'
                            :                  'border-red-500 bg-red-50 text-red-700'
                            : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}>
                        {c}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5 leading-snug">
                    {t('assets.conditionHelp')}
                  </p>
                </div>

                {isDamaged && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-3">
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">{t('assets.damageReport')}</p>
                    <div>
                      <label className="form-label">{t('common.priority')}</label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['MINOR', 'MODERATE', 'SEVERE'] as const).map((s) => (
                          <button key={s} type="button"
                            onClick={() => setDamageSeverity(s)}
                            className={`py-2 rounded-lg text-xs font-semibold border transition-all ${
                              damageSeverity === s
                                ? 'border-amber-500 bg-amber-100 text-amber-800'
                                : 'border-amber-200 text-amber-600 hover:bg-amber-50'
                            }`}>
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="form-label">{t('assets.damageDescription')} <span className="text-red-500">*</span></label>
                      <textarea className="form-textarea" rows={2}
                        placeholder="Cracked screen, dent on lid, missing keys…"
                        value={damageDescription} onChange={(e) => setDamageDescription(e.target.value)} />
                    </div>
                    {condition === 'DAMAGED' && (
                      <div>
                        <label className="form-label">{t('assets.estimatedRepairCost')}</label>
                        <input className="form-input" type="number" min={0} placeholder="0"
                          value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value)} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* RIGHT — checklist + notes */}
              <div className="space-y-4">
                <div>
                  <label className="form-label flex items-center gap-1.5">
                    <ClipboardCheck size={13} className="text-gray-400" /> {t('assets.recoveryChecklist')}
                  </label>
                  <p className="text-xs text-gray-400 mb-2">{t('assets.recoveryChecklistDesc')}</p>
                  <div className="space-y-1.5">
                    {DEFAULT_CHECKLIST.map((item) => {
                      const status = checklistState[item];
                      return (
                        <div key={item} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-50">
                          <span className="flex-1 text-sm text-gray-700">{item}</span>
                          <div className="flex gap-1">
                            <button type="button" onClick={() => setItem(item, 'PRESENT')}
                              className={`text-[10px] font-semibold px-2 py-1 rounded ${
                                status === 'PRESENT'
                                  ? 'bg-green-100 text-green-700 border border-green-200'
                                  : 'bg-gray-50 text-gray-400 border border-gray-200 hover:text-gray-600'
                              }`}>
                              PRESENT
                            </button>
                            <button type="button" onClick={() => setItem(item, 'MISSING')}
                              className={`text-[10px] font-semibold px-2 py-1 rounded ${
                                status === 'MISSING'
                                  ? 'bg-red-100 text-red-700 border border-red-200'
                                  : 'bg-gray-50 text-gray-400 border border-gray-200 hover:text-gray-600'
                              }`}>
                              MISSING
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="form-label">{t('assets.verificationNotes')} <span className="text-gray-400 font-normal">{t('common.optional2')}</span></label>
                  <textarea className="form-textarea" rows={3} placeholder="Any context for future audit…"
                    value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>
            </div>

            <ModalActions>
              <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
              <Button variant="outline" onClick={() => setShowRejectForm(true)}
                className="text-amber-700 border-amber-300 hover:bg-amber-50"
                icon={<RotateCcw size={14} />}>
                {t('assets.rejectReturn')}
              </Button>
              <Button onClick={handleSubmit} loading={verify.isPending} icon={<ClipboardCheck size={15} />}>
                {t('assets.verifyReturn')}
              </Button>
            </ModalActions>
          </>
        )}
      </div>
    </Modal>
  );
};

// ── Request Detail Modal ──────────────────────────────────────────────────────

function RequestDetailModal({ req, open, onClose, canApprove, canAssign, currentUserId, availableAssets, onActionDone, onEdit }: {
  req: AssetRequest | null;
  open: boolean;
  onClose: () => void;
  canApprove: boolean;
  canAssign: boolean;
  currentUserId?: string;
  availableAssets: Asset[];
  onActionDone: () => void;
  onEdit?: (req: AssetRequest) => void;
}) {
  const { t } = useI18n();
  const rejectRequest  = useRejectAssetRequest();
  const initiateReturn = useInitiateReturn();
  const startProc      = useStartProcessingRequest();
  const [showCreds, setShowCreds]             = useState(false);
  const [rejectOpen, setRejectOpen]           = useState(false);
  const [handoverOpen, setHandoverOpen]       = useState(false);
  const [verifyReturnOpen, setVerifyReturnOpen] = useState(false);
  const [approveOpen, setApproveOpen]         = useState(false);
  const [returnNotes, setReturnNotes]         = useState('');
  const [returning, setReturning]             = useState(false);

  React.useEffect(() => {
    if (open) { setShowCreds(false); setReturnNotes(''); }
  }, [open]);

  if (!req) return null;

  const statusColors: Record<string, string> = {
    PENDING:         'bg-amber-50 text-amber-700 border-amber-200',
    APPROVED:        'bg-green-50 text-green-700 border-green-200',
    REJECTED:        'bg-red-50 text-red-700 border-red-200',
    ASSIGNED_TO_OPS: 'bg-blue-50 text-blue-700 border-blue-200',
    PROCESSING:      'bg-violet-50 text-violet-700 border-violet-200',
    HANDED_OVER:     'bg-teal-50 text-teal-700 border-teal-200',
    RETURNED:        'bg-orange-50 text-orange-700 border-orange-200',
    RETURN_VERIFIED: 'bg-gray-50 text-gray-600 border-gray-200',
    FULFILLED:       'bg-teal-50 text-teal-700 border-teal-200',
    CANCELLED:       'bg-gray-50 text-gray-500 border-gray-200',
  };

  const isRequester = currentUserId && req.requestedBy && String(req.requestedBy) === String(currentUserId);
  const isOpsUser   = req.opsAssignees?.some((id) => String(id) === String(currentUserId));
  // The user who approved this request can see the QR sticker too — they may
  // need to re-print or share it with the requester. Device credentials remain
  // gated more tightly (requester / ops only) below.
  const isApprover  = currentUserId && req.approvedBy && String(req.approvedBy) === String(currentUserId);
  const hasDeviceCreds = req.deviceId || req.deviceUsername || req.devicePassword;

  // Status timeline entries
  const timeline: Array<{ label: string; at?: string; by?: string; color: string }> = [
    { label: 'Submitted', at: req.createdAt, by: req.requestedByName, color: 'bg-gray-400' },
  ];
  if (req.approvedAt) timeline.push({ label: 'Approved', at: req.approvedAt, by: req.approvedByName, color: 'bg-green-500' });
  if (req.status === 'REJECTED') timeline.push({ label: 'Rejected', color: 'bg-red-500' });
  if (['ASSIGNED_TO_OPS', 'PROCESSING', 'HANDED_OVER', 'RETURNED', 'RETURN_VERIFIED'].includes(req.status) && req.approvedAt)
    timeline.push({ label: 'Assigned to Ops', color: 'bg-blue-500' });
  if (req.handoverAt) timeline.push({ label: 'Handed Over', at: req.handoverAt, by: req.handoverByName, color: 'bg-teal-500' });
  if (req.returnAt) timeline.push({ label: 'Return Initiated', at: req.returnAt, color: 'bg-orange-500' });
  if (req.returnVerifiedAt) timeline.push({ label: 'Return Verified', at: req.returnVerifiedAt, color: 'bg-gray-500' });

  const handleReject = async (notes: string) => {
    await rejectRequest.mutateAsync({ id: req.id, data: { notes } });
    setRejectOpen(false);
    onActionDone();
    onClose();
  };

  const handleInitiateReturn = async () => {
    setReturning(true);
    try {
      await initiateReturn.mutateAsync({ id: req.id, data: { reason: returnNotes } });
      onActionDone();
      onClose();
    } catch { /* noop */ }
    finally { setReturning(false); }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title={t('assets.requestDetails')} size="2xl">
        <div className="space-y-5">
          {/* Status + Priority */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${statusColors[req.status] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
              {requestStatusLabel(req.status)}
            </span>
            <Badge variant={priorityVariant(req.priority)}>{req.priority || 'NORMAL'}</Badge>
            <span className="text-xs text-gray-400 ml-auto">
              {safeFormat(req.createdAt, 'MMM d, yyyy · hh:mm a')}
            </span>
          </div>

          {/* Body laid out in 2 columns on md+ so the modal stays wide, not tall.
              Left: the original request (who/what/why). Right: process state. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-5">
          {/* Requester */}
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5"><User size={12} /> {t('assets.requestedBy')}</p>
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
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5"><Tag size={12} /> {t('assets.modal.category')}</p>
              <p className="text-sm font-semibold text-gray-900">{req.categoryName ?? '—'}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5"><Package size={12} /> {t('nav.assets')}</p>
              <p className="text-sm font-semibold text-gray-900">{req.assetName ?? t('assets.anyAvailable')}</p>
              {req.assetTag && <p className="text-xs text-gray-400 font-mono mt-0.5">{req.assetTag}</p>}
            </div>
          </div>

          {/* Reason */}
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5"><FileText size={12} /> {t('assets.reason')}</p>
            <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-4 leading-relaxed">{req.reason || '—'}</p>
          </div>

          {/* Needed By + Notes */}
          {(req.neededBy || req.reqNotes) && (
            <div className="grid grid-cols-1 gap-3">
              {req.neededBy && (
                <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                  <Calendar size={15} className="text-blue-500 shrink-0" />
                  <div>
                    <p className="text-xs text-blue-500 font-medium">{t('assets.neededBy')}</p>
                    <p className="text-sm font-semibold text-blue-800">{safeFormat(req.neededBy, 'MMMM d, yyyy')}</p>
                  </div>
                </div>
              )}
              {req.reqNotes && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                  <p className="text-xs text-amber-600 font-medium mb-1">{t('common.notes')}</p>
                  <p className="text-sm text-amber-900">{req.reqNotes}</p>
                </div>
              )}
            </div>
          )}
          </div>{/* ── end left column ── */}

          <div className="space-y-5">{/* ── right column: process state ── */}
          {/* Ops Assignees */}
          {req.opsAssigneeDetails && req.opsAssigneeDetails.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Truck size={12} /> {t('assets.opsTeamAssigned')}</p>
              <div className="flex flex-wrap gap-2">
                {req.opsAssigneeDetails.map((u) => (
                  <div key={u.id} className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 rounded-full px-2.5 py-1">
                    <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size="sm" />
                    <span className="text-xs font-medium text-blue-700">{u.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Handover details */}
          {req.handoverAt && (
            <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
              <p className="text-xs font-medium text-teal-600 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Truck size={12} /> {t('assets.handedOver')}</p>
              <p className="text-sm text-teal-800">
                By <strong>{req.handoverByName ?? '—'}</strong> on {safeFormat(req.handoverAt, 'MMM d, yyyy · hh:mm a')}
              </p>
              {req.handoverNotes && <p className="text-xs text-teal-700 mt-1">{req.handoverNotes}</p>}

              {/* Asset QR — printed on a sticker and applied to the physical device.
                  A new token is generated on every handover, so the previous QR
                  stops resolving as soon as the return is verified. */}
              {req.qrToken && req.status === 'HANDED_OVER' && (isRequester || isOpsUser || canAssign || isApprover) && (
                <div className="mt-3 border-t border-teal-200 pt-3">
                  <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <QrCode size={12} /> {t('assets.qrSticker')}
                  </p>
                  <div className="flex items-center gap-3 bg-white rounded-lg p-3 border border-teal-200">
                    <div className="shrink-0 bg-white p-1.5 rounded">
                      <QRCodeCanvas
                        id={`asset-qr-${req.id}`}
                        value={`dsync://asset-scan/${req.qrToken}`}
                        size={112}
                        level="M"
                        includeMargin={false}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-teal-700 leading-snug">
                        {t('assets.qrStickerDescDetail')}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          const canvas = document.getElementById(`asset-qr-${req.id}`) as HTMLCanvasElement | null;
                          if (!canvas) return;
                          const url = canvas.toDataURL('image/png');
                          const link = document.createElement('a');
                          link.href = url;
                          link.download = `asset-qr-${req.assetTag || req.id}.png`;
                          link.click();
                        }}
                        className="mt-2 text-xs font-semibold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1"
                      >
                        <Upload size={11} className="rotate-180" /> {t('assets.download')} PNG
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Device Credentials — shown to requester or ops */}
              {hasDeviceCreds && (isRequester || isOpsUser || canAssign) && (
                <div className="mt-3 border-t border-teal-200 pt-3">
                  <button onClick={() => setShowCreds((v) => !v)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-800 transition-colors">
                    <Key size={12} />
                    {showCreds ? t('common.showLess') : t('common.showMore')} {t('assets.deviceCredentials')}
                  </button>
                  {showCreds && (
                    <div className="mt-2 space-y-1.5">
                      {req.deviceId && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-teal-600">{t('assets.deviceId')}</span>
                          <span className="text-xs font-mono font-semibold text-teal-900">{req.deviceId}</span>
                        </div>
                      )}
                      {req.deviceUsername && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-teal-600">{t('assets.deviceUsername')}</span>
                          <span className="text-xs font-mono font-semibold text-teal-900">{req.deviceUsername}</span>
                        </div>
                      )}
                      {req.devicePassword && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-teal-600">{t('assets.devicePassword')}</span>
                          <span className="text-xs font-mono font-semibold text-teal-900">{req.devicePassword}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Return details */}
          {req.returnAt && (
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
              <p className="text-xs font-medium text-orange-600 uppercase tracking-wide mb-2 flex items-center gap-1.5"><RotateCcw size={12} /> {t('assets.returnInitiated')}</p>
              <p className="text-sm text-orange-800">{safeFormat(req.returnAt, 'MMM d, yyyy')}</p>
              {req.returnReason && <p className="text-xs text-orange-700 mt-1">{req.returnReason}</p>}
            </div>
          )}
          {req.returnVerifiedAt && (
            <div className={`border rounded-xl p-4 ${
              req.returnCondition === 'LOST'
                ? 'bg-red-50 border-red-100'
                : req.returnCondition === 'DAMAGED'
                  ? 'bg-amber-50 border-amber-100'
                  : 'bg-gray-50 border-gray-200'
            }`}>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5"><ClipboardCheck size={12} /> {t('assets.returnVerified')}</p>
              <p className="text-sm text-gray-700">
                Condition: <strong>{req.returnCondition ?? '—'}</strong>
                {' · '}{safeFormat(req.returnVerifiedAt, 'MMM d, yyyy')}
              </p>
              {req.returnVerifiedByName && (
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                  <UserAvatar name={req.returnVerifiedByName} avatarUrl={req.returnVerifiedByAvatar ?? undefined} size="xs" />
                  <span>{t('assets.verifiedBy')} <strong className="text-gray-800">{req.returnVerifiedByName}</strong></span>
                </div>
              )}
              {(req.returnCondition === 'DAMAGED' || req.returnCondition === 'LOST') && req.returnDamageDescription && (
                <div className="mt-2 bg-white/60 rounded-lg p-2.5 border border-amber-200">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">
                    {req.returnDamageSeverity ?? 'Damage'} {req.returnCondition === 'LOST' ? '· Asset Lost' : '· Damage Report'}
                  </p>
                  <p className="text-xs text-amber-900">{req.returnDamageDescription}</p>
                  {req.returnEstimatedCost ? (
                    <p className="text-xs text-amber-800 mt-1">
                      Estimated cost: <strong>{req.returnEstimatedCost.toLocaleString()}</strong>
                    </p>
                  ) : null}
                </div>
              )}
              {req.returnChecklist && req.returnChecklist.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{t('assets.returnedItems')}</p>
                  <ul className="space-y-0.5">
                    {req.returnChecklist.map((item, i) => (
                      <li key={i} className="text-xs text-gray-600 flex items-center gap-1.5"><CheckCircle2 size={10} className="text-green-500" />{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {req.returnMissingItems && req.returnMissingItems.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mb-1">{t('assets.missingItems')}</p>
                  <ul className="space-y-0.5">
                    {req.returnMissingItems.map((item, i) => (
                      <li key={i} className="text-xs text-red-700 flex items-center gap-1.5"><XCircle size={10} className="text-red-500" />{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {req.returnNotes && <p className="text-xs text-gray-500 mt-1">{req.returnNotes}</p>}
            </div>
          )}

          {/* Bounce-back banner — shown when ops has rejected a prior return and
              the request is back in HANDED_OVER. Tells the requester what to fix. */}
          {req.returnRejectionNotes && req.status === 'HANDED_OVER' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                <AlertTriangle size={12} /> {t('assets.previousReturnBouncedBack')}
              </p>
              <p className="text-sm text-amber-900">{req.returnRejectionNotes}</p>
              <p className="text-xs text-amber-700 mt-1">
                {req.returnRejectedByName && <>by <strong>{req.returnRejectedByName}</strong>{' · '}</>}
                {req.returnRejectedAt && safeFormat(req.returnRejectedAt, 'MMM d, yyyy · hh:mm a')}
              </p>
            </div>
          )}

          {/* Status timeline */}
          {timeline.length > 1 && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">{t('assets.activity')}</p>
              <div className="space-y-2">
                {timeline.map((t, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${t.color}`} />
                    <div className="flex-1 flex items-baseline gap-2">
                      <span className="text-xs font-medium text-gray-700">{t.label}</span>
                      {t.by && <span className="text-xs text-gray-400">by {t.by}</span>}
                    </div>
                    {t.at && <span className="text-xs text-gray-400 whitespace-nowrap">{safeFormat(t.at, 'MMM d · hh:mm a')}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>{/* ── end right column ── */}
          </div>{/* ── end 2-col body ── */}

          {/* Action buttons based on status & permissions */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
            {isRequester && onEdit && ['APPROVED', 'ASSIGNED_TO_OPS', 'PROCESSING'].includes(req.status) && (
              <div className="w-full flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                <Info size={14} className="text-blue-400 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700 leading-relaxed">
                  {t('assets.requestBeingProcessed')}
                </p>
              </div>
            )}
            {isRequester && req.status === 'REJECTED' && req.rejectionNotes && (
              <div className="w-full flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                <XCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-red-700 mb-0.5">{t('assets.requestRejected')}</p>
                  <p className="text-xs text-red-600">{req.rejectionNotes}</p>
                </div>
              </div>
            )}
            {/* Approve/Reject — for PENDING */}
            {canApprove && req.status === 'PENDING' && (
              <>
                <Button className="flex-1 justify-center bg-green-600 hover:bg-green-700 text-white"
                  icon={<CheckCircle2 size={15} />} onClick={() => setApproveOpen(true)}>
                  {t('common.approve')}
                </Button>
                <Button variant="outline" className="text-red-600 border-red-300 hover:bg-red-50"
                  icon={<XCircle size={15} />} onClick={() => setRejectOpen(true)}>
                  {t('common.reject')}
                </Button>
              </>
            )}
            {/* Reject — for APPROVED (before ops) */}
            {canApprove && req.status === 'APPROVED' && (
              <Button variant="outline" className="text-red-600 border-red-300 hover:bg-red-50"
                icon={<XCircle size={15} />} onClick={() => setRejectOpen(true)}>
                {t('common.reject')}
              </Button>
            )}
            {/* Handover — for ops assignees or ASSET_ASSIGN, when ASSIGNED_TO_OPS or PROCESSING */}
            {(canAssign || isOpsUser) && ['ASSIGNED_TO_OPS', 'PROCESSING', 'APPROVED'].includes(req.status) && (
              <>
                {req.status === 'ASSIGNED_TO_OPS' && (
                  <Button variant="outline"
                    icon={<Monitor size={14} />}
                    onClick={() => startProc.mutateAsync(req.id).then(() => onActionDone()).catch(() => undefined)}
                    loading={startProc.isPending}>
                    {t('assets.markProcessing')}
                  </Button>
                )}
                <Button icon={<Truck size={14} />} className="bg-violet-600 hover:bg-violet-700 text-white"
                  onClick={() => setHandoverOpen(true)}>
                  {t('assets.handOver')}
                </Button>
              </>
            )}
            {/* Initiate Return — requester, when HANDED_OVER */}
            {isRequester && req.status === 'HANDED_OVER' && (
              <div className="w-full space-y-2">
                <textarea className="form-textarea text-sm" rows={2}
                  placeholder={t('assets.reasonForReturn')}
                  value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} />
                <Button variant="outline" icon={<RotateCcw size={14} />}
                  loading={returning} onClick={handleInitiateReturn}
                  className="w-full justify-center text-orange-600 border-orange-300 hover:bg-orange-50">
                  {t('assets.returnThisAsset')}
                </Button>
              </div>
            )}
            {/* Verify Return — ops, when RETURNED */}
            {(canAssign || isOpsUser) && req.status === 'RETURNED' && (
              <Button icon={<ClipboardCheck size={14} />} className="w-full justify-center bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={() => setVerifyReturnOpen(true)}>
                {t('assets.verifyReturn')}
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* Sub-modals */}
      <ApproveModal open={approveOpen} onClose={() => setApproveOpen(false)} request={req} onDone={onActionDone} />
      <HandoverModal open={handoverOpen} onClose={() => setHandoverOpen(false)} request={req} availableAssets={availableAssets} onDone={() => { onActionDone(); onClose(); }} />
      <VerifyReturnModal open={verifyReturnOpen} onClose={() => setVerifyReturnOpen(false)} request={req} onDone={() => { onActionDone(); onClose(); }} />
      <RejectModal open={rejectOpen} onClose={() => setRejectOpen(false)} onConfirm={handleReject} title={t('assets.rejectAssetRequest')} />
    </>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

interface PaginationProps {
  page: number;
  totalCount: number;
  pageSize?: number;
  onChange: (page: number) => void;
}

const Pagination = ({ page, totalCount, pageSize = PAGE_SIZE, onChange }: PaginationProps) => {
  const totalPages = Math.ceil(totalCount / pageSize);
  if (totalPages <= 1) return null;

  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-white rounded-b-xl">
      <p className="text-xs text-gray-400">
        Showing <span className="font-medium text-gray-600">{from}–{to}</span> of{' '}
        <span className="font-medium text-gray-600">{totalCount}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={14} />
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`e${i}`} className="px-2 text-gray-400 text-xs">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p as number)}
              className={`min-w-[28px] h-7 px-2 text-xs font-medium rounded-lg transition-colors ${
                p === page ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};

// ── Requests Tab ──────────────────────────────────────────────────────────────

interface RequestsTabProps {
  canApprove: boolean;
  canAssign: boolean;
  currentUserId?: string;
  categories: AssetCategory[];
  availableAssets: Asset[];
}

const RequestsTab = ({ canApprove, canAssign, currentUserId, categories, availableAssets }: RequestsTabProps) => {
  type ViewMode = 'all' | 'mine' | 'approved';
  const { t } = useI18n();
  const [viewMode, setViewMode]             = useState<ViewMode>(canApprove ? 'all' : 'mine');
  const [filterStatus, setFilterStatus]     = useState('');
  const [search, setSearch]                 = useState('');
  const [page, setPage]                     = useState(1);
  const [detailReq, setDetailReq]           = useState<AssetRequest | null>(null);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [editRequest, setEditRequest]       = useState<AssetRequest | null>(null);

  const isMyView       = !canApprove || viewMode === 'mine';
  const isApprovedView = viewMode === 'approved';

  const params = useMemo<Record<string, string>>(() => {
    const p: Record<string, string> = {};
    if (filterStatus) p.status = filterStatus;
    if (isApprovedView) p.mode = 'approved';
    return p;
  }, [filterStatus, isApprovedView]);

  React.useEffect(() => { setPage(1); }, [viewMode, filterStatus, search]);

  const { data: requests = [], isLoading, error, refetch } = useAssetRequests(params);

  if (isLoading) return <SkeletonTable rows={6} />;
  if (error) return <Alert type="error" message={(error as Error).message} />;

  const allReqList = requests as AssetRequest[];
  const reqList = isMyView
    ? allReqList.filter((r) => String(r.requestedBy) === String(currentUserId))
    : allReqList;

  const q = search.trim().toLowerCase();
  const filteredList = q ? reqList.filter((r) =>
    r.requestedByName?.toLowerCase().includes(q) ||
    r.categoryName?.toLowerCase().includes(q) ||
    r.assetName?.toLowerCase().includes(q) ||
    r.reason?.toLowerCase().includes(q)
  ) : reqList;

  const reqStats = {
    total:      reqList.length,
    pending:    reqList.filter((r) => r.status === 'PENDING').length,
    inProgress: reqList.filter((r) => ['APPROVED', 'ASSIGNED_TO_OPS', 'PROCESSING'].includes(r.status)).length,
    handedOver: reqList.filter((r) => r.status === 'HANDED_OVER').length,
    returned:   reqList.filter((r) => r.status === 'RETURNED').length,
    fulfilled:  reqList.filter((r) => r.status === 'FULFILLED').length,
  };

  const paged = filteredList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const statusOptions: Array<{ value: string; label: string }> = [
    { value: '',                label: t('assets.allStatuses') },
    { value: 'PENDING',         label: t('statuses.pending') },
    { value: 'APPROVED',        label: t('statuses.approved') },
    { value: 'ASSIGNED_TO_OPS', label: t('assets.opsAssigned') },
    { value: 'PROCESSING',      label: t('assets.processing') },
    { value: 'HANDED_OVER',     label: t('assets.handedOver') },
    { value: 'RETURNED',        label: t('assets.returned') },
    { value: 'RETURN_VERIFIED', label: t('assets.returnVerified') },
    { value: 'REJECTED',        label: t('statuses.rejected') },
  ];

  const statsCards = [
    { label: t('common.total'),        value: reqStats.total,      color: 'text-gray-800',   bg: 'bg-gray-50',    border: 'border-gray-200',   status: '' },
    { label: t('statuses.pending'),    value: reqStats.pending,    color: 'text-amber-700',  bg: 'bg-amber-50',   border: 'border-amber-200',  status: 'PENDING' },
    { label: t('assets.inProgress'),   value: reqStats.inProgress, color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-200',   status: 'APPROVED' },
    { label: t('assets.handedOver'),   value: reqStats.handedOver, color: 'text-violet-700', bg: 'bg-violet-50',  border: 'border-violet-200', status: 'HANDED_OVER' },
    { label: t('assets.returned'),     value: reqStats.returned,   color: 'text-orange-700', bg: 'bg-orange-50',  border: 'border-orange-200', status: 'RETURNED' },
    { label: t('assets.fulfilled'),    value: reqStats.fulfilled,  color: 'text-green-700',  bg: 'bg-green-50',   border: 'border-green-200',  status: 'FULFILLED' },
  ];

  return (
    <div className="space-y-4">
      {/* Sub-tabs for approvers */}
      {canApprove && (
        <div className="flex gap-1 border-b border-gray-200">
          {(['all', 'mine', 'approved'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => { setViewMode(mode); setFilterStatus(''); setSearch(''); }}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                viewMode === mode
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {mode === 'all' ? t('assets.allRequests') : mode === 'mine' ? t('assets.myRequests') : t('assets.approvedByMe')}
            </button>
          ))}
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {statsCards.map((s) => (
          <button
            key={s.label}
            onClick={() => { setFilterStatus(s.status); setPage(1); }}
            className={`${s.bg} border ${s.border} rounded-xl px-4 py-3 flex flex-col gap-0.5 text-left transition-all hover:shadow-sm active:scale-95 ${
              filterStatus === s.status ? 'ring-2 ring-blue-400 ring-offset-1' : ''
            }`}
          >
            <span className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</span>
            <span className="text-xs text-gray-500 font-medium leading-tight">{s.label}</span>
          </button>
        ))}
      </div>

      {/* Filter + search bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            className="form-input pl-8 text-sm"
            placeholder={`Search ${isMyView ? '' : 'requester, '}category, asset or reason…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={13} className="text-gray-400 shrink-0" />
          <select
            className="form-select w-[170px]"
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          >
            {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {isMyView && (
          <Button icon={<Plus size={14} />} onClick={() => setRequestModalOpen(true)}>
            {t('assets.newRequest')}
          </Button>
        )}
      </div>

      {/* Table card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            {isMyView ? t('assets.myRequests') : isApprovedView ? t('assets.approvedByMe') : t('assets.allRequests')}
          </h3>
          <span className="text-xs text-gray-400">
            {filteredList.length !== reqList.length
              ? `${filteredList.length} of ${reqList.length} result${reqList.length !== 1 ? 's' : ''}`
              : `${reqList.length} request${reqList.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {filteredList.length === 0 ? (
          <EmptyState
            icon={<Package size={36} />}
            title={q ? t('common.noResults') : t('assets.noRequests')}
            description={
              q
                ? t('assets.noResultsDesc')
                : isMyView
                ? t('assets.noMyRequestsDesc')
                : isApprovedView
                ? t('assets.noApprovedDesc')
                : t('assets.noRequestsDesc')
            }
            action={
              isMyView && !q ? (
                <Button size="sm" icon={<Plus size={14} />} onClick={() => setRequestModalOpen(true)}>
                  {t('assets.new')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50/80">
                  <tr>
                    {!isMyView && (
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                        {t('assets.requester')}
                      </th>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {t('assets.categoryAsset')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {t('assets.reason')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {t('common.priority')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {t('common.status')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {t('assets.submitted')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {t('assets.neededBy')}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {t('common.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paged.map((req) => {
                    const needsOpsAction = canAssign && !isMyView && ['ASSIGNED_TO_OPS', 'PROCESSING', 'APPROVED'].includes(req.status);
                    const needsVerify    = canAssign && !isMyView && req.status === 'RETURNED';
                    return (
                      <tr
                        key={req.id}
                        className="hover:bg-blue-50/30 transition-colors cursor-pointer group"
                        onClick={() => setDetailReq(req)}
                      >
                        {!isMyView && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <UserAvatar
                                name={req.requestedByName ?? ''}
                                avatarUrl={req.requestedByAvatar ?? undefined}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate max-w-[130px]">
                                  {req.requestedByName ?? '—'}
                                </p>
                                {req.requestedByEmail && (
                                  <p className="text-xs text-gray-400 truncate max-w-[130px]">
                                    {req.requestedByEmail}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                        )}

                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-900">{req.categoryName ?? '—'}</p>
                          {req.assetName && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded mt-0.5 font-medium">
                              <Hash size={9} /> {req.assetName}
                              {req.assetTag && <span className="text-indigo-400 font-normal">· {req.assetTag}</span>}
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 max-w-[200px]">
                          <p className="text-sm text-gray-700 truncate" title={req.reason}>{req.reason || '—'}</p>
                          {req.reqNotes && (
                            <p className="text-xs text-gray-400 truncate mt-0.5" title={req.reqNotes}>{req.reqNotes}</p>
                          )}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge variant={priorityVariant(req.priority)}>{req.priority || 'NORMAL'}</Badge>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge variant={requestStatusVariant(req.status)}>{requestStatusLabel(req.status)}</Badge>
                          {req.opsAssigneeDetails && req.opsAssigneeDetails.length > 0 && !isMyView && (
                            <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1 whitespace-nowrap">
                              <Truck size={9} className="text-amber-500" />
                              {req.opsAssigneeDetails.map((u) => u.name).join(', ')}
                            </p>
                          )}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                          {safeFormat(req.createdAt, 'MMM d, yyyy')}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          {req.neededBy ? (
                            <span className="flex items-center gap-1 text-xs text-blue-600">
                              <Clock size={10} />
                              {safeFormat(req.neededBy, 'MMM d, yyyy')}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right">
                          <div
                            className="flex items-center justify-end gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {(needsOpsAction || needsVerify) && (
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full mr-1 ${
                                needsVerify
                                  ? 'bg-indigo-100 text-indigo-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}>
                                {needsVerify ? t('assets.verify') : t('assets.action')}
                              </span>
                            )}
                            <button
                              onClick={() => setDetailReq(req)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title={t('common.view')}
                            >
                              <Eye size={14} />
                            </button>
                            {isMyView && req.status === 'PENDING' && (
                              <button
                                onClick={() => setEditRequest(req)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                title={t('common.edit')}
                              >
                                <Edit2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalCount={filteredList.length} onChange={setPage} />
          </>
        )}
      </div>

      {isMyView && (
        <>
          <RequestModal
            open={requestModalOpen}
            onClose={() => setRequestModalOpen(false)}
            categories={categories}
            availableAssets={availableAssets}
          />
          <RequestModal
            open={!!editRequest}
            onClose={() => setEditRequest(null)}
            categories={categories}
            availableAssets={availableAssets}
            editRequest={editRequest}
          />
        </>
      )}

      <RequestDetailModal
        req={detailReq}
        open={detailReq !== null}
        onClose={() => setDetailReq(null)}
        canApprove={canApprove && !isMyView}
        canAssign={canAssign && !isMyView}
        currentUserId={currentUserId}
        availableAssets={availableAssets}
        onActionDone={() => { refetch(); setDetailReq(null); }}
        onEdit={isMyView ? (r) => { setDetailReq(null); setEditRequest(r); } : undefined}
      />
    </div>
  );
};

// ── Maintenance Tab ───────────────────────────────────────────────────────────

interface MaintenanceTabProps {
  allAssets: Asset[];
}

const MaintenanceTab = ({ allAssets }: MaintenanceTabProps) => {
  const { t } = useI18n();
  const { data: records = [], isLoading, error } = useAssetMaintenance();
  const completeMaintenance = useCompleteMaintenance();
  const [modalOpen, setModalOpen]           = useState(false);
  const [maintPage, setMaintPage]           = useState(1);
  const [completeTarget, setCompleteTarget] = useState<MaintenanceRecord | null>(null);
  const [completeNotes, setCompleteNotes]   = useState('');
  const [completeError, setCompleteError]   = useState('');

  if (isLoading) return <SkeletonTable rows={4} />;
  if (error) return <Alert type="error" message={(error as Error).message} />;

  const maintList = records as MaintenanceRecord[];
  const scheduled  = maintList.filter((r) => (r.status ?? 'SCHEDULED') !== 'COMPLETED').length;
  const completed  = maintList.filter((r) => r.status === 'COMPLETED').length;
  const pagedMaint = maintList.slice((maintPage - 1) * PAGE_SIZE, maintPage * PAGE_SIZE);

  const handleComplete = async () => {
    if (!completeTarget) return;
    try {
      setCompleteError('');
      await completeMaintenance.mutateAsync({ id: completeTarget.id, notes: completeNotes });
      setCompleteTarget(null);
      setCompleteNotes('');
    } catch (err: unknown) {
      setCompleteError((err as Error).message ?? 'Failed to complete maintenance');
    }
  };

  const maintStatusVariant = (status?: string): 'warning' | 'success' | 'default' => {
    if (!status || status === 'SCHEDULED') return 'warning';
    if (status === 'COMPLETED') return 'success';
    return 'default';
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex flex-col gap-0.5">
          <span className="text-2xl font-bold text-gray-800 tabular-nums">{maintList.length}</span>
          <span className="text-xs text-gray-500 font-medium">{t('assets.totalRecords')}</span>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex flex-col gap-0.5">
          <span className="text-2xl font-bold text-amber-700 tabular-nums">{scheduled}</span>
          <span className="text-xs text-gray-500 font-medium">{t('assets.scheduledInProgress')}</span>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex flex-col gap-0.5">
          <span className="text-2xl font-bold text-green-700 tabular-nums">{completed}</span>
          <span className="text-xs text-gray-500 font-medium">{t('statuses.completed')}</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">{t('assets.maintenanceSchedule')}</h3>
          <Button size="sm" icon={<Wrench size={14} />} onClick={() => setModalOpen(true)}>
            {t('assets.scheduleMaintenance')}
          </Button>
        </div>

        {maintList.length === 0 ? (
          <EmptyState
            icon={<Wrench size={36} />}
            title={t('assets.noMaintenance')}
            description={t('assets.noMaintenanceDesc')}
            action={
              <Button size="sm" icon={<Wrench size={14} />} onClick={() => setModalOpen(true)}>
                {t('assets.scheduleMaintenance')}
              </Button>
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50/80">
                  <tr>
                    {[t('assets.modal.nameLabel'), t('common.type'), t('assets.scheduledDate'), t('assets.completedDate'), t('common.notes'), t('common.status'), t('common.actions')].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pagedMaint.map((rec) => {
                    const isScheduled = !rec.status || rec.status === 'SCHEDULED';
                    return (
                      <tr key={rec.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-900">
                            {rec.assetName ?? <span className="text-gray-400 italic text-xs">ID: {rec.assetId}</span>}
                          </p>
                          {rec.assetTag && (
                            <span className="text-xs text-gray-400 font-mono">{rec.assetTag}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                          {rec.maintenanceType || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {safeFormat(rec.scheduledDate, 'MMM d, yyyy')}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                          {rec.completedDate ? safeFormat(rec.completedDate, 'MMM d, yyyy') : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 max-w-[180px] truncate" title={rec.notes ?? ''}>
                          {rec.notes ?? '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge variant={maintStatusVariant(rec.status)}>
                            {rec.status ?? 'SCHEDULED'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {isScheduled ? (
                            <button
                              onClick={() => { setCompleteTarget(rec); setCompleteNotes(''); setCompleteError(''); }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
                            >
                              <CheckCircle2 size={12} /> {t('assets.markDone')}
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400 flex items-center gap-1">
                              <CheckCircle2 size={12} className="text-green-500" /> {t('statuses.completed')}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={maintPage} totalCount={maintList.length} onChange={setMaintPage} />
          </>
        )}
      </div>

      <MaintenanceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        assets={allAssets}
      />

      {/* Complete Maintenance Modal */}
      <Modal
        open={completeTarget !== null}
        onClose={() => setCompleteTarget(null)}
        title={t('assets.markMaintenanceDone')}
        size="sm"
      >
        {completeError && <Alert type="error" message={completeError} className="mb-3" />}
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-100 rounded-xl p-3 flex items-center gap-3">
            <Wrench size={16} className="text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-900">
                {completeTarget?.assetName ?? `Asset #${completeTarget?.assetId}`}
                {completeTarget?.assetTag && (
                  <span className="ml-1.5 text-xs font-mono text-green-600">· {completeTarget.assetTag}</span>
                )}
              </p>
              <p className="text-xs text-green-700">{completeTarget?.maintenanceType}</p>
            </div>
          </div>
          <div>
            <label className="form-label">{t('assets.completionNotes')} <span className="text-gray-400 font-normal">{t('common.optional2')}</span></label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="What was done? Any observations or follow-up needed…"
              value={completeNotes}
              onChange={(e) => setCompleteNotes(e.target.value)}
            />
          </div>
          <p className="text-xs text-gray-500">
            {t('assets.markingDoneDesc')}
          </p>
        </div>
        <ModalActions>
          <Button variant="outline" onClick={() => setCompleteTarget(null)}>{t('common.cancel')}</Button>
          <Button
            onClick={handleComplete}
            loading={completeMaintenance.isPending}
            icon={<CheckCircle2 size={15} />}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {t('assets.confirmCompletion')}
          </Button>
        </ModalActions>
      </Modal>
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'my-assets' | 'inventory' | 'requests' | 'maintenance';

const AssetManagementPage = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('my-assets');

  const isAdmin      = hasPermission(user, PERMISSIONS.ASSET_ADMIN);
  const canWrite     = hasPermission(user, PERMISSIONS.ASSET_WRITE) || isAdmin;
  const canApprove   = hasPermission(user, PERMISSIONS.ASSET_APPROVE) || isAdmin;
  const canAssign    = hasPermission(user, PERMISSIONS.ASSET_ASSIGN);
  // Anyone with asset read access can scan a sticker. The backend decides
  // what they see: FULL tier when the caller holds ASSET_SCAN_FULL, otherwise
  // the BASIC owner-lookup payload. This matches the original spec
  // ("ops team get full details, normal users see who owns the asset") without
  // requiring an explicit scan-permission grant on every user.
  const canScan      = hasPermission(user, PERMISSIONS.ASSET_READ);
  const [scanOpen, setScanOpen] = useState(false);

  const { data: categories = [] } = useAssetCategories();
  const { data: availableAssets = [] } = useAvailableAssets();
  const { data: allInventory = [] } = useAssetInventory();

  const tabs: Array<{ id: Tab; label: string; hidden?: boolean }> = [
    { id: 'my-assets',   label: t('assets.tabMyAssets') },
    { id: 'inventory',   label: t('assets.tabInventory'),   hidden: !canWrite },
    { id: 'requests',    label: t('assets.tabRequests') },
    { id: 'maintenance', label: t('assets.tabMaintenance'), hidden: !canWrite },
  ];

  const visibleTabs = tabs.filter((t) => !t.hidden);

  return (
    <Layout>
      <Header
        title={t('nav.assets')}
        subtitle={t('assets.subtitle')}
        actions={
          canScan ? (
            <Button
              variant="secondary"
              icon={<QrCode size={14} />}
              onClick={() => setScanOpen(true)}
            >
              {t('assets.scanQr')}
            </Button>
          ) : undefined
        }
      />

      <AssetScannerModal open={scanOpen} onClose={() => setScanOpen(false)} />

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
        {activeTab === 'inventory' && canWrite && (
          <InventoryTab categories={categories as AssetCategory[]} />
        )}
        {activeTab === 'requests' && (
          <RequestsTab
            canApprove={canApprove}
            canAssign={canAssign}
            currentUserId={user?.id}
            categories={categories as AssetCategory[]}
            availableAssets={availableAssets as Asset[]}
          />
        )}
        {activeTab === 'maintenance' && canWrite && (
          <MaintenanceTab allAssets={allInventory as Asset[]} />
        )}
      </div>
    </Layout>
  );
};

export default AssetManagementPage;
