import React, { useState } from 'react';
import { Copy, Eye, EyeOff, RefreshCcw, Lock, Tag, History, Wrench } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import UserAvatar from '../ui/UserAvatar';

// ── Types ────────────────────────────────────────────────────────────────────
// The payload shape is set by AssetScanController.scanByToken on the backend.
// `tier` switches the renderer between FULL (ops/IT) and BASIC (everyone else).
export interface ScanPayload {
  tier: 'FULL' | 'BASIC';
  asset: {
    name?: string | null;
    asset_tag?: string | null;
    category?: string | null;
    category_name?: string | null;
    serial_number?: string | null;
    status?: string | null;
    asset_condition?: string | null;
    purchase_date?: string | null;
    warranty_expiry?: string | null;
    // FULL tier may include the full asset row.
    [k: string]: unknown;
  };
  owner: {
    id?: string;
    name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  };
  current_assignment?: {
    assigned_date?: string | null;
    handover_at?: string | null;
    condition_at_assignment?: string | null;
    assigned_by_name?: string | null;
    assigned_by_email?: string | null;
    device_id?: string | null;
    device_username?: string | null;
    device_password?: string | null;
    handover_notes?: string | null;
  };
  history?: Array<{
    assigned_date?: string | null;
    returned_date?: string | null;
    user_name?: string | null;
    user_email?: string | null;
    is_active?: boolean;
  }>;
  maintenance?: Array<{
    type?: string | null;
    description?: string | null;
    performed_at?: string | null;
    status?: string | null;
  }>;
}

interface Props {
  open: boolean;
  payload: ScanPayload | null;
  onClose: () => void;
  onScanAnother: () => void;
}

function safeFormat(raw?: string | null, pattern = 'MMM d, yyyy · hh:mm a'): string {
  if (!raw) return '—';
  try {
    const d = parseISO(raw);
    return isValid(d) ? format(d, pattern) : raw;
  } catch {
    return raw;
  }
}

const Row: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="text-xs text-gray-500 w-32 shrink-0">{label}</span>
      <span className="text-sm text-gray-900 font-medium break-all">{value}</span>
    </div>
  );
};

const CopyRow: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => {
  if (!value) return null;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-xs text-gray-500 w-32 shrink-0">{label}</span>
      <span className="text-sm text-gray-900 font-mono break-all flex-1">{value}</span>
      <button
        type="button"
        onClick={() => navigator.clipboard?.writeText(value)}
        className="text-gray-400 hover:text-gray-700 transition-colors"
        title={`Copy ${label}`}
      >
        <Copy size={13} />
      </button>
    </div>
  );
};

const AssetScanResultModal: React.FC<Props> = ({ open, payload, onClose, onScanAnother }) => {
  const [showCreds, setShowCreds] = useState(false);
  if (!payload) return null;
  const { tier, asset, owner } = payload;
  const a = payload.current_assignment ?? {};
  const hasCreds = !!(a.device_id || a.device_username || a.device_password);

  return (
    <Modal open={open} onClose={onClose} title="Asset Details" size="2xl">
      <div className="space-y-4">
        {/* Owner + Asset summary side-by-side on md+ so the modal stays wide,
            not tall. Stacks back on small screens. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Owner</p>
            <div className="flex items-center gap-3">
              <UserAvatar name={owner?.name ?? ''} avatarUrl={owner?.avatar_url ?? undefined} size="lg" />
              <div className="min-w-0">
                <p className="text-base font-semibold text-gray-900 truncate">{owner?.name ?? '—'}</p>
                {owner?.email && <p className="text-xs text-gray-500 truncate">{owner.email}</p>}
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Tag size={11} /> Asset
          </p>
          <p className="text-base font-semibold text-gray-900">{asset.name ?? '—'}</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {asset.asset_tag && (
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                {asset.asset_tag}
              </span>
            )}
            {(asset.category || asset.category_name) && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                {asset.category ?? asset.category_name}
              </span>
            )}
          </div>
          </div>
        </div>

        {tier === 'BASIC' && (
          <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            <p className="text-xs text-amber-700">
              You can see the owner of this asset. Full details (credentials, history) are reserved for IT/ops.
            </p>
          </div>
        )}

        {tier === 'FULL' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Asset record */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Asset record</p>
              <Row label="Serial number"  value={asset.serial_number ?? undefined} />
              <Row label="Status"         value={asset.status ?? undefined} />
              <Row label="Condition"      value={asset.asset_condition ?? undefined} />
              <Row label="Purchase date"  value={safeFormat(asset.purchase_date, 'MMM d, yyyy')} />
              <Row label="Warranty until" value={safeFormat(asset.warranty_expiry, 'MMM d, yyyy')} />
            </div>

            {/* Current assignment */}
            <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
              <p className="text-xs font-medium text-teal-600 uppercase tracking-wide mb-2">Current assignment</p>
              <Row label="Handed over"   value={safeFormat(a.handover_at)} />
              <Row label="Assigned by"   value={a.assigned_by_name ?? undefined} />
              <Row label="Condition"     value={a.condition_at_assignment ?? undefined} />
              <Row label="Notes"         value={a.handover_notes ?? undefined} />

              {hasCreds && (
                <div className="mt-2 border-t border-teal-200 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreds((v) => !v)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-900 transition-colors"
                  >
                    {showCreds ? <EyeOff size={12} /> : <Eye size={12} />}
                    {showCreds ? 'Hide device credentials' : 'Show device credentials'}
                  </button>
                  {showCreds && (
                    <div className="mt-2 bg-white border border-teal-100 rounded-lg p-3">
                      <CopyRow label="Device ID" value={a.device_id ?? undefined} />
                      <CopyRow label="Username"  value={a.device_username ?? undefined} />
                      <CopyRow label="Password"  value={a.device_password ?? undefined} />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* History */}
            {payload.history && payload.history.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <History size={11} /> Assignment history
                </p>
                <div className="space-y-2">
                  {payload.history.map((h, i) => (
                    <div key={i} className="flex items-start gap-3 py-1">
                      <div className={`w-2 h-2 rounded-full mt-1.5 ${h.is_active ? 'bg-teal-500' : 'bg-gray-300'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{h.user_name ?? '—'}</p>
                        <p className="text-xs text-gray-500">
                          {safeFormat(h.assigned_date, 'MMM d, yyyy')}
                          {h.returned_date ? `  →  ${safeFormat(h.returned_date, 'MMM d, yyyy')}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Maintenance */}
            {payload.maintenance && payload.maintenance.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Wrench size={11} /> Maintenance
                </p>
                <div className="space-y-2">
                  {payload.maintenance.map((m, i) => (
                    <div key={i} className="py-1">
                      <p className="text-sm font-medium text-gray-900">
                        {m.type ?? '—'}{m.status ? ` · ${m.status}` : ''}
                      </p>
                      {m.description && <p className="text-xs text-gray-600">{m.description}</p>}
                      <p className="text-xs text-gray-400">{safeFormat(m.performed_at, 'MMM d, yyyy')}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="secondary" icon={<RefreshCcw size={14} />} onClick={onScanAnother}>
            Scan another
          </Button>
          <Button onClick={onClose} icon={<Lock size={14} />}>Done</Button>
        </div>
      </div>
    </Modal>
  );
};

export default AssetScanResultModal;
