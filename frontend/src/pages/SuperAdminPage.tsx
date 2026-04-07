import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, Users, Shield, Bell, Lock, Unlock, Eye, Search, X, Check,
  UserX, UserCheck, Layers, LogOut, PanelLeftClose, PanelLeftOpen,
  RefreshCw, ChevronRight, ChevronLeft, AlertTriangle, Settings, BarChart2,
  CreditCard, Activity, TrendingUp, Zap, Filter, CheckCircle2,
} from 'lucide-react';
import { superAdminApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import UserAvatar from '../components/ui/UserAvatar';
import { useMyProfile } from '../hooks/useUsers';

// ── Types ──────────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'organisations' | 'users' | 'modules' | 'billing' | 'metrics' | 'alerts' | 'audit';

// ── Colour maps ────────────────────────────────────────────────────────────────
const PLAN_COLORS: Record<string, string> = {
  STARTER:    'bg-slate-100 text-slate-600 border-slate-200',
  PRO:        'bg-blue-100 text-blue-700 border-blue-200',
  ENTERPRISE: 'bg-violet-100 text-violet-700 border-violet-200',
};
const STATUS_COLORS: Record<string, string> = {
  ACTIVE:    'bg-emerald-100 text-emerald-700 border-emerald-200',
  SUSPENDED: 'bg-amber-100 text-amber-700 border-amber-200',
  CANCELLED: 'bg-red-100 text-red-700 border-red-200',
  LOCKED:    'bg-rose-100 text-rose-700 border-rose-200',
  BLOCKED:   'bg-red-100 text-red-700 border-red-200',
};
const ROLE_COLORS: Record<string, string> = {
  TENANT_ADMIN:  'bg-purple-100 text-purple-700',
  DELIVERY_LEAD: 'bg-blue-100 text-blue-700',
  PMO:           'bg-indigo-100 text-indigo-700',
  EXEC:          'bg-amber-100 text-amber-700',
  TEAM_MEMBER:   'bg-gray-100 text-gray-600',
  CLIENT:        'bg-teal-100 text-teal-700',
  SUPER_ADMIN:   'bg-red-100 text-red-700',
};
// action keyword → badge colours
const ACTION_STYLE: Record<string, { ring: string; dot: string; badge: string }> = {
  CREATE:  { ring: 'border-emerald-200', dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700'  },
  UPDATE:  { ring: 'border-blue-200',    dot: 'bg-blue-400',    badge: 'bg-blue-50 text-blue-700'        },
  DELETE:  { ring: 'border-red-200',     dot: 'bg-red-400',     badge: 'bg-red-50 text-red-700'          },
  BLOCK:   { ring: 'border-rose-200',    dot: 'bg-rose-500',    badge: 'bg-rose-50 text-rose-700'        },
  UNBLOCK: { ring: 'border-teal-200',    dot: 'bg-teal-400',    badge: 'bg-teal-50 text-teal-700'        },
  INVITE:  { ring: 'border-violet-200',  dot: 'bg-violet-400',  badge: 'bg-violet-50 text-violet-700'    },
  LOGIN:   { ring: 'border-gray-200',    dot: 'bg-gray-300',    badge: 'bg-gray-50 text-gray-600'        },
  MODULE:  { ring: 'border-amber-200',   dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700'      },
  TENANT:  { ring: 'border-indigo-200',  dot: 'bg-indigo-400',  badge: 'bg-indigo-50 text-indigo-700'    },
};
const DEFAULT_ACTION_STYLE = { ring: 'border-gray-200', dot: 'bg-gray-200', badge: 'bg-gray-50 text-gray-500' };

const PLAN_PRICE: Record<string, number> = { STARTER: 49, PRO: 149, ENTERPRISE: 499 };
const AUDIT_PAGE_SIZE = 20;

// Module catalogue
const APP_MODULES = [
  { key: 'projects', label: 'Projects & Sprints',  icon: '📋', desc: 'Project management, sprints, tasks, RAID, decisions' },
  { key: 'people',   label: 'People & HR',         icon: '👥', desc: 'Leave, attendance, directory, org chart, announcements' },
  { key: 'assets',   label: 'Asset Management',    icon: '🖥️', desc: 'Assets, categories, assignments, maintenance' },
  { key: 'time',     label: 'Time Tracking',       icon: '⏱️', desc: 'Time entries, approvals, export' },
  { key: 'reports',  label: 'Reports & Analytics', icon: '📊', desc: 'Reports, enterprise reports' },
  { key: 'ai',       label: 'AI Insights',         icon: '🤖', desc: 'AI-powered delivery insights' },
  { key: 'exec',     label: 'Executive Dashboard', icon: '📈', desc: 'CEO/CTO dashboards, portfolio view' },
];

// Per-module chart colours (hex for SVG)
const MOD_HEX: Record<string, string> = {
  projects: '#6366f1', people: '#10b981', assets: '#f59e0b',
  time: '#8b5cf6', reports: '#3b82f6', ai: '#ec4899', admin: '#64748b',
};
const MOD_TW: Record<string, string> = {
  projects: 'bg-indigo-500', people: 'bg-emerald-500', assets: 'bg-amber-500',
  time: 'bg-violet-500', reports: 'bg-blue-500', ai: 'bg-pink-500', admin: 'bg-slate-500',
};
const MOD_ICON: Record<string, string> = {
  projects: '📋', people: '👥', assets: '🖥️', time: '⏱️', reports: '📊', ai: '🤖', admin: '⚙️',
};

// ── Tiny helpers ───────────────────────────────────────────────────────────────
const Pill = ({ label, map }: { label: string; map: Record<string, string> }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${map[label] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
    {label}
  </span>
);

const RoleBadge = ({ role }: { role: string }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${ROLE_COLORS[role] ?? 'bg-gray-100 text-gray-500'}`}>
    {(role || '—').replace(/_/g, ' ')}
  </span>
);

const KpiCard = ({ label, value, sub, icon, color }: { label: string; value: string | number; sub?: string; icon: React.ReactNode; color: string }) => (
  <div className={`rounded-2xl p-5 ${color} flex flex-col gap-2`}>
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium opacity-75">{label}</span>
      <span className="opacity-25 scale-125">{icon}</span>
    </div>
    <p className="text-3xl font-bold">{value}</p>
    {sub && <p className="text-xs opacity-60">{sub}</p>}
  </div>
);

function relativeTime(dateStr: string) {
  if (!dateStr) return '—';
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7)  return `${d}d ago`;
    return new Date(dateStr).toLocaleDateString();
  } catch { return '—'; }
}

function getActionStyle(action: string) {
  const up = (action || '').toUpperCase();
  for (const [k, v] of Object.entries(ACTION_STYLE)) {
    if (up.includes(k)) return v;
  }
  return DEFAULT_ACTION_STYLE;
}

// ── SVG Donut chart ────────────────────────────────────────────────────────────
function DonutChart({ segments, size = 140, stroke = 22 }: {
  segments: { label: string; value: number; color: string }[];
  size?: number; stroke?: number;
}) {
  const cx = size / 2, cy = size / 2;
  const r  = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const total = segments.reduce((s, d) => s + d.value, 0) || 1;

  let offset = 0;
  const arcs = segments.map((seg) => {
    const pct  = seg.value / total;
    const dash = pct * circumference;
    const gap  = circumference - dash;
    // dashoffset = -(cumulative fraction × circumference) positions each segment
    // clockwise from 12 o'clock (the SVG itself is CSS-rotated -90°)
    const rot  = offset * circumference;
    offset    += pct;
    return { ...seg, dash, gap, rot };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
      {/* background ring */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
      {arcs.map((arc, i) => (
        <circle key={i} cx={cx} cy={cy} r={r}
          fill="none"
          stroke={arc.color}
          strokeWidth={stroke}
          strokeDasharray={`${arc.dash} ${arc.gap}`}
          strokeDashoffset={-arc.rot}
          strokeLinecap="butt"
        />
      ))}
    </svg>
  );
}

// ── Bar chart (horizontal) ─────────────────────────────────────────────────────
function HorizBar({ pct, color, animate = true }: { pct: number; color: string; animate?: boolean }) {
  return (
    <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${animate ? 'duration-700' : ''} ${color}`}
        style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }}
      />
    </div>
  );
}

// ── Activity sparkline bars ────────────────────────────────────────────────────
function ActivityBars({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="flex items-end gap-px h-16">
      {data.map((d) => {
        const pct = Math.max((d.count / max) * 100, d.count > 0 ? 6 : 1);
        return (
          <div key={d.date} className="flex-1 flex flex-col justify-end group relative" title={`${d.date}: ${d.count} events`}>
            <div
              className="w-full rounded-t-sm bg-indigo-300 group-hover:bg-indigo-500 transition-colors cursor-default"
              style={{ height: `${pct}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Pagination control ─────────────────────────────────────────────────────────
function Pagination({ page, total, pageSize, onChange }: {
  page: number; total: number; pageSize: number; onChange: (p: number) => void;
}) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;

  // Show at most 7 page buttons
  const range: (number | '…')[] = [];
  if (pages <= 7) {
    for (let i = 1; i <= pages; i++) range.push(i);
  } else {
    range.push(1);
    if (page > 3) range.push('…');
    for (let i = Math.max(2, page - 1); i <= Math.min(pages - 1, page + 1); i++) range.push(i);
    if (page < pages - 2) range.push('…');
    range.push(pages);
  }

  const btn = (label: React.ReactNode, target: number, disabled = false, active = false) => (
    <button
      key={String(target) + String(label)}
      onClick={() => !disabled && onChange(target)}
      disabled={disabled}
      className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-semibold transition-colors
        ${active ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}
        ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center justify-between pt-4 border-t border-gray-100">
      <p className="text-xs text-gray-400">
        Showing {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} of <span className="font-semibold text-gray-600">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        {btn(<ChevronLeft size={13} />, page - 1, page === 1)}
        {range.map((r, i) =>
          r === '…'
            ? <span key={`ellipsis-${i}`} className="px-1 text-gray-300 text-xs">…</span>
            : btn(r, r as number, false, r === page)
        )}
        {btn(<ChevronRight size={13} />, page + 1, page === pages)}
      </div>
    </div>
  );
}

// ── Lock Modal ─────────────────────────────────────────────────────────────────
const LOCK_TYPES = [
  { value: 'TEMPORARY_SUSPEND', label: 'Temporary Suspend' },
  { value: 'PERMANENT_BLOCK',   label: 'Permanent Block'   },
  { value: 'PAYMENT_HOLD',      label: 'Payment Hold'      },
  { value: 'SECURITY_HOLD',     label: 'Security Hold'     },
  { value: 'LEGAL_HOLD',        label: 'Legal Hold'        },
  { value: 'MANUAL',            label: 'Manual Lock'       },
];

function LockModal({ tenantId, tenantName, onClose }: { tenantId: string; tenantName: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [lockType, setLockType] = useState('TEMPORARY_SUSPEND');
  const [reason,   setReason]   = useState('');
  const [duration, setDuration] = useState('');
  const lock = useMutation({
    mutationFn: () => superAdminApi.lockTenant(tenantId, { lockType, reason, durationDays: duration ? Number(duration) : undefined }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['sa-tenants'] }); onClose(); },
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-red-600"><Lock size={17} /><h3 className="font-bold">Lock Organisation</h3></div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={17} /></button>
        </div>
        <p className="text-sm text-gray-500 mb-4">Locking <strong>{tenantName}</strong> will immediately restrict all user access.</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lock Type</label>
            <select value={lockType} onChange={e => setLockType(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300">
              {LOCK_TYPES.map(lt => <option key={lt.value} value={lt.value}>{lt.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Reason *</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Reason for locking…" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300" />
          </div>
          {lockType === 'TEMPORARY_SUSPEND' && (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Duration (days)</label>
              <input type="number" value={duration} onChange={e => setDuration(e.target.value)} placeholder="e.g. 7" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300" />
            </div>
          )}
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={() => lock.mutate()} disabled={!reason.trim() || lock.isPending} className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
            {lock.isPending ? 'Locking…' : 'Lock Tenant'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Unlock Modal ───────────────────────────────────────────────────────────────
function UnlockModal({ tenantId, tenantName, onClose }: { tenantId: string; tenantName: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const unlock = useMutation({
    mutationFn: () => superAdminApi.unlockTenant(tenantId, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sa-tenants'] });
      qc.invalidateQueries({ queryKey: ['sa-stats'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                <Unlock size={18} className="text-white" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base leading-tight">Unlock Organisation</h3>
                <p className="text-emerald-100 text-xs mt-0.5">Restore full access to this workspace</p>
              </div>
            </div>
            <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Org name */}
          <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3 border border-gray-200">
            <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
              <Building2 size={16} className="text-indigo-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-800 text-sm">{tenantName}</p>
              <p className="text-xs text-gray-400">Currently suspended — access blocked for all users</p>
            </div>
          </div>

          {/* What happens */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-emerald-700 mb-2 flex items-center gap-1.5">
              <CheckCircle2 size={13} /> What happens when you unlock:
            </p>
            <ul className="space-y-1 text-xs text-emerald-700">
              <li>· All users of <strong>{tenantName}</strong> will immediately regain access</li>
              <li>· Tenant status will be set to <strong>ACTIVE</strong></li>
              <li>· The suspension screen will disappear on next login</li>
              <li>· This action will be recorded in the audit log</li>
            </ul>
          </div>

          {/* Reason */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Reason for unlock <span className="text-gray-300">(optional)</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. Payment received, issue resolved…"
              className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-300"
            />
          </div>

          {/* Confirmation checkbox */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <div
              onClick={() => setConfirmed(c => !c)}
              className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors
                ${confirmed ? 'bg-emerald-600 border-emerald-600' : 'border-gray-300 group-hover:border-emerald-400'}`}
            >
              {confirmed && <Check size={10} className="text-white" strokeWidth={3} />}
            </div>
            <span className="text-xs text-gray-600 leading-relaxed">
              I confirm I want to restore access for <strong className="text-gray-800">{tenantName}</strong> and understand this will be logged.
            </span>
          </label>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => unlock.mutate()}
            disabled={!confirmed || unlock.isPending}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold hover:from-emerald-700 hover:to-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            {unlock.isPending
              ? <><RefreshCw size={14} className="animate-spin" /> Unlocking…</>
              : <><Unlock size={14} /> Unlock & Restore Access</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Module Control Panel ───────────────────────────────────────────────────────
function ModuleControlPanel({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const qc = useQueryClient();
  const { data: modulesData, isLoading } = useQuery({
    queryKey: ['sa-modules', tenantId],
    queryFn:  () => superAdminApi.getModulePermissions(tenantId).then(d => d.modules ?? []),
    enabled:  !!tenantId,
  });
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (modulesData) {
      const map: Record<string, boolean> = {};
      (modulesData as any[]).forEach((m: any) => { map[m.key] = m.enabled; });
      setLocal(map); setDirty(false);
    }
  }, [modulesData]);

  const save = useMutation({
    mutationFn: () => superAdminApi.updateModulePermissions(tenantId, Object.entries(local).map(([key, enabled]) => ({ key, enabled }))),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['sa-modules', tenantId] }); setDirty(false); },
  });

  if (isLoading) return <div className="py-8 text-center text-gray-400 text-sm">Loading modules…</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="font-semibold text-gray-800">{tenantName}</p>
          <p className="text-xs text-gray-400">Enable or disable modules for this organisation</p>
        </div>
        {dirty && (
          <button onClick={() => save.mutate()} disabled={save.isPending} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {save.isPending ? 'Saving…' : <><Check size={14} /> Save Changes</>}
          </button>
        )}
      </div>
      <div className="space-y-2">
        {APP_MODULES.map(mod => (
          <div key={mod.key} className="flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-white hover:border-gray-300 transition-colors">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{mod.icon}</span>
              <div>
                <p className="font-semibold text-sm text-gray-800">{mod.label}</p>
                <p className="text-xs text-gray-400">{mod.desc}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-semibold ${local[mod.key] !== false ? 'text-emerald-600' : 'text-red-500'}`}>
                {local[mod.key] !== false ? 'Enabled' : 'Disabled'}
              </span>
              <button
                onClick={() => { setLocal(prev => ({ ...prev, [mod.key]: !prev[mod.key] })); setDirty(true); }}
                className={`relative w-11 h-6 rounded-full transition-colors ${local[mod.key] !== false ? 'bg-indigo-600' : 'bg-gray-200'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${local[mod.key] !== false ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────────
const NAV: { id: Tab; label: string; icon: React.ReactNode; group: string }[] = [
  { id: 'overview',      label: 'Overview',        icon: <BarChart2 size={16} />,  group: 'Platform'      },
  { id: 'organisations', label: 'Organisations',   icon: <Building2 size={16} />,  group: 'Platform'      },
  { id: 'users',         label: 'Platform Users',  icon: <Users size={16} />,      group: 'Platform'      },
  { id: 'billing',       label: 'Billing & Plans', icon: <CreditCard size={16} />, group: 'Platform'      },
  { id: 'metrics',       label: 'Feature Metrics', icon: <TrendingUp size={16} />, group: 'Platform'      },
  { id: 'modules',       label: 'Module Config',   icon: <Layers size={16} />,     group: 'Configuration' },
  { id: 'alerts',        label: 'Platform Alerts', icon: <Bell size={16} />,       group: 'Configuration' },
  { id: 'audit',         label: 'Audit Trail',     icon: <Shield size={16} />,     group: 'Configuration' },
];

function SuperAdminSidebar({ active, onChange, alertCount }: {
  active: Tab; onChange: (t: Tab) => void; alertCount: number;
}) {
  const { user, logout } = useAuth();
  const { data: profile } = useMyProfile();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`${collapsed ? 'w-16' : 'w-60'} shrink-0 flex flex-col h-screen bg-slate-900 text-slate-200 border-r border-slate-800 transition-all duration-200`}>
      <div className="flex items-center justify-between px-3 py-4 border-b border-slate-800 shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
              <Settings size={13} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-sm text-white leading-tight">Platform Admin</p>
              <p className="text-[10px] text-slate-500">DSV OpsPulse</p>
            </div>
          </div>
        )}
        <button onClick={() => setCollapsed(c => !c)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-auto">
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>

      <nav className={`flex-1 overflow-y-auto py-3 ${collapsed ? 'px-1.5' : 'px-2'} space-y-0.5`}>
        {['Platform', 'Configuration'].map(group => (
          <div key={group} className="mb-3">
            {!collapsed && <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 px-2 mb-1">{group}</p>}
            {NAV.filter(n => n.group === group).map(item => {
              const badge = item.id === 'alerts' ? alertCount : 0;
              return (
                <button key={item.id} onClick={() => onChange(item.id)} title={collapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors
                    ${active === item.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}
                    ${collapsed ? 'justify-center' : ''}`}
                >
                  {item.icon}
                  {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
                  {!collapsed && badge > 0 && (
                    <span className="text-[10px] font-bold bg-red-500 text-white rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">{badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className={`border-t border-slate-800 py-3 ${collapsed ? 'px-1.5' : 'px-2'} space-y-1 shrink-0`}>
        <div className={`flex items-center gap-2.5 px-2 py-1.5 ${collapsed ? 'justify-center' : ''}`}>
          <UserAvatar name={user?.name ?? ''} avatarUrl={profile?.avatarUrl} size="sm" />
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user?.name}</p>
              <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
            </div>
          )}
        </div>
        <button onClick={logout} title={collapsed ? 'Sign out' : undefined}
          className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 text-xs transition-colors ${collapsed ? 'justify-center' : ''}`}
        >
          <LogOut size={14} />
          {!collapsed && 'Sign out'}
        </button>
      </div>
    </aside>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
const SuperAdminPage: React.FC = () => {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as Tab) || 'overview';
  const setActiveTab = (tab: Tab) => setSearchParams({ tab }, { replace: false });

  const [orgSearch,  setOrgSearch]  = useState('');
  const [orgPlan,    setOrgPlan]    = useState('');
  const [orgStatus,  setOrgStatus]  = useState('');

  const [userSearch, setUserSearch] = useState('');
  const [userRole,   setUserRole]   = useState('');
  const [userStatus, setUserStatus] = useState('');

  const [auditSearch, setAuditSearch] = useState('');
  const [auditAction, setAuditAction] = useState('');
  const [auditPage,   setAuditPage]   = useState(1);

  const [lockTarget,     setLockTarget]     = useState<{ id: string; name: string } | null>(null);
  const [unlockTarget,   setUnlockTarget]   = useState<{ id: string; name: string } | null>(null);
  const [moduleTarget,   setModuleTarget]   = useState<{ id: string; name: string } | null>(null);
  const [blockTarget,    setBlockTarget]    = useState<string | null>(null);
  const [blockReason,    setBlockReason]    = useState('');
  const [tenantDetailId, setTenantDetailId] = useState<string | null>(null);

  // Reset audit page when filters change
  useEffect(() => setAuditPage(1), [auditSearch, auditAction]);

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: stats } = useQuery({
    queryKey: ['sa-stats'],
    queryFn:  () => superAdminApi.getStats().then(d => d.stats),
  });

  const { data: tenantsData = [], isLoading: tenantsLoading } = useQuery({
    queryKey: ['sa-tenants', orgSearch, orgPlan, orgStatus],
    queryFn:  () => superAdminApi.listTenants({
      ...(orgSearch && { search: orgSearch }),
      ...(orgPlan   && { plan:   orgPlan   }),
      ...(orgStatus && { status: orgStatus }),
    }).then(d => d.tenants ?? []),
  });

  const { data: usersData = [], isLoading: usersLoading } = useQuery({
    queryKey: ['sa-all-users', userSearch, userRole, userStatus],
    queryFn:  () => superAdminApi.getAllUsers({
      ...(userSearch && { search: userSearch }),
      ...(userRole   && { role:   userRole   }),
      ...(userStatus && { status: userStatus }),
    }).then(d => d.users ?? []),
    enabled: activeTab === 'users',
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ['sa-alerts'],
    queryFn:  () => superAdminApi.getSmartAlerts().then(d => d.alerts ?? []),
  });

  const { data: auditRaw = [] } = useQuery({
    queryKey: ['sa-audit'],
    queryFn:  () => superAdminApi.getAuditLogs({ limit: '200' }).then(d => d.logs ?? []),
    enabled:  activeTab === 'audit',
  });

  const { data: featureUsage } = useQuery({
    queryKey: ['sa-feature-usage'],
    queryFn:  () => superAdminApi.getFeatureUsage(),
    enabled:  activeTab === 'metrics' || activeTab === 'overview',
  });

  const { data: perfData } = useQuery({
    queryKey: ['sa-performance'],
    queryFn:  () => superAdminApi.getPerformanceMetrics(),
    enabled:  activeTab === 'metrics',
  });

  const { data: tenantDetail } = useQuery({
    queryKey: ['sa-tenant-detail', tenantDetailId],
    queryFn:  () => superAdminApi.getTenantDetail(tenantDetailId!).then(d => d.tenant),
    enabled:  !!tenantDetailId,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => superAdminApi.updateTenantStatus(id, status),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['sa-tenants'] }); qc.invalidateQueries({ queryKey: ['sa-stats'] }); },
  });
  const blockUser = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => superAdminApi.blockUser(id, reason),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['sa-all-users'] }); setBlockTarget(null); setBlockReason(''); },
  });
  const unblockUser = useMutation({
    mutationFn: (id: string) => superAdminApi.unblockUser(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['sa-all-users'] }),
  });

  // ── Computed ──────────────────────────────────────────────────────────────────
  const highAlerts = useMemo(() => (alerts as any[]).filter((a: any) => a.severity === 'HIGH'), [alerts]);

  const mrrEstimate = useMemo(() => {
    if (!stats?.planDistribution) return 0;
    return Object.entries(stats.planDistribution as Record<string, number>)
      .reduce((s, [plan, count]) => s + (PLAN_PRICE[plan] ?? 0) * count, 0);
  }, [stats]);

  const filteredAudit = useMemo(() => {
    let logs = auditRaw as any[];
    if (auditSearch) {
      const q = auditSearch.toLowerCase();
      logs = logs.filter(l =>
        l.action?.toLowerCase().includes(q) ||
        l.tenantName?.toLowerCase().includes(q) ||
        l.performedBy?.toLowerCase().includes(q)
      );
    }
    if (auditAction) logs = logs.filter(l => (l.action || '').toUpperCase().includes(auditAction));
    return logs;
  }, [auditRaw, auditSearch, auditAction]);

  const pagedAudit  = filteredAudit.slice((auditPage - 1) * AUDIT_PAGE_SIZE, auditPage * AUDIT_PAGE_SIZE);

  // Donut data
  const donutSegments = useMemo(() =>
    ((featureUsage?.features as any[]) ?? []).map((f: any) => ({
      label: f.label, value: f.events, color: MOD_HEX[f.key] ?? '#94a3b8',
    })), [featureUsage]);

  const currentTabLabel = NAV.find(n => n.id === activeTab)?.label ?? 'Platform Admin';

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <SuperAdminSidebar active={activeTab} onChange={setActiveTab} alertCount={highAlerts.length} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
          <h1 className="text-base font-bold text-gray-900">{currentTabLabel}</h1>
          <div className="flex items-center gap-2">
            {highAlerts.length > 0 && (
              <button onClick={() => setActiveTab('alerts')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
                <Bell size={12} /> {highAlerts.length} Alert{highAlerts.length > 1 ? 's' : ''}
              </button>
            )}
            <button onClick={() => qc.invalidateQueries()} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400" title="Refresh">
              <RefreshCw size={15} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">

          {/* ═══════════════════════════ OVERVIEW ═══════════════════════════ */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard label="Total Organisations" value={stats?.totalTenants ?? '—'} sub={`${stats?.activeTenants ?? 0} active`}            icon={<Building2 />}      color="bg-indigo-50 text-indigo-900"  />
                <KpiCard label="Total Users"          value={stats?.totalUsers ?? '—'}   sub={`${stats?.activeUsers ?? 0} active`}              icon={<Users />}          color="bg-emerald-50 text-emerald-900" />
                <KpiCard label="Est. MRR"             value={`$${mrrEstimate.toLocaleString()}`} sub="based on plan pricing"                    icon={<CreditCard />}     color="bg-violet-50 text-violet-900"  />
                <KpiCard label="Platform Alerts"      value={highAlerts.length}           sub={`${(alerts as any[]).length} total`}              icon={<Bell />}           color={highAlerts.length > 0 ? 'bg-red-50 text-red-900' : 'bg-slate-50 text-slate-900'} />
              </div>

              {stats?.planDistribution && (
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-800 mb-4">Plan Distribution</h3>
                  <div className="flex gap-4">
                    {Object.entries(stats.planDistribution as Record<string, number>).map(([plan, count]) => (
                      <div key={plan} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 flex-1">
                        <Pill label={plan} map={PLAN_COLORS} />
                        <div><p className="text-2xl font-bold text-gray-800">{count}</p><p className="text-xs text-gray-400">${PLAN_PRICE[plan] ?? 0}/mo each</p></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {featureUsage?.features && (
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-800">Top Features Used</h3>
                    <button onClick={() => setActiveTab('metrics')} className="text-xs text-indigo-600 font-medium hover:underline flex items-center gap-0.5">Full metrics <ChevronRight size={12} /></button>
                  </div>
                  <div className="space-y-3">
                    {(featureUsage.features as any[]).slice(0, 5).map((f: any) => (
                      <div key={f.key} className="flex items-center gap-3">
                        <span className="text-base w-6 text-center">{MOD_ICON[f.key] ?? '•'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-gray-700">{f.label}</span>
                            <span className="text-xs text-gray-400">{f.events} events</span>
                          </div>
                          <HorizBar pct={f.percentage} color={MOD_TW[f.key] ?? 'bg-indigo-400'} />
                        </div>
                        <span className="text-xs font-bold text-gray-500 w-8 text-right">{f.percentage}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-800">Recent Organisations</h3>
                  <button onClick={() => setActiveTab('organisations')} className="text-xs text-indigo-600 font-medium hover:underline flex items-center gap-0.5">View all <ChevronRight size={12} /></button>
                </div>
                {(tenantsData as any[]).slice(0, 6).map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
                    <div><p className="text-sm font-semibold text-gray-800">{t.name}</p><p className="text-xs text-gray-400">{t.userCount ?? 0} users · {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—'}</p></div>
                    <div className="flex items-center gap-2"><Pill label={t.plan} map={PLAN_COLORS} /><Pill label={t.status} map={STATUS_COLORS} /></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════════════════ ORGANISATIONS ═══════════════════════ */}
          {activeTab === 'organisations' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={orgSearch} onChange={e => setOrgSearch(e.target.value)} placeholder="Search organisations…" className="pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-56" />
                </div>
                <select value={orgPlan} onChange={e => setOrgPlan(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none">
                  <option value="">All Plans</option><option>STARTER</option><option>PRO</option><option>ENTERPRISE</option>
                </select>
                <select value={orgStatus} onChange={e => setOrgStatus(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none">
                  <option value="">All Statuses</option><option>ACTIVE</option><option>SUSPENDED</option><option>CANCELLED</option>
                </select>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-100 bg-gray-50">
                    {['Organisation','Plan','Status','Users','Joined','Actions'].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {tenantsLoading && <tr><td colSpan={6} className="text-center py-10 text-gray-400">Loading…</td></tr>}
                    {!tenantsLoading && (tenantsData as any[]).map((t: any) => (
                      <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3"><p className="font-semibold text-gray-800">{t.name}</p><p className="text-xs text-gray-400">{t.slug}</p></td>
                        <td className="px-4 py-3"><Pill label={t.plan} map={PLAN_COLORS} /></td>
                        <td className="px-4 py-3"><Pill label={t.status} map={STATUS_COLORS} /></td>
                        <td className="px-4 py-3 text-gray-600">{t.userCount ?? 0}</td>
                        <td className="px-4 py-3 text-xs text-gray-400">{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setTenantDetailId(t.id)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-600" title="View"><Eye size={14} /></button>
                            <button onClick={() => { setModuleTarget({ id: t.id, name: t.name }); setActiveTab('modules'); }} className="p-1.5 rounded-lg hover:bg-violet-50 text-violet-600" title="Modules"><Layers size={14} /></button>
                            {t.status !== 'SUSPENDED' && t.status !== 'LOCKED' && t.status !== 'CANCELLED'
                              ? <button onClick={() => setLockTarget({ id: t.id, name: t.name })} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" title="Lock"><Lock size={14} /></button>
                              : <button onClick={() => setUnlockTarget({ id: t.id, name: t.name })} className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600" title="Unlock"><Unlock size={14} /></button>}
                            {t.status === 'ACTIVE' && <button onClick={() => updateStatus.mutate({ id: t.id, status: 'SUSPENDED' })} className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600" title="Suspend"><UserX size={14} /></button>}
                            {t.status === 'SUSPENDED' && <button onClick={() => updateStatus.mutate({ id: t.id, status: 'ACTIVE' })} className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600" title="Reactivate"><UserCheck size={14} /></button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!tenantsLoading && !(tenantsData as any[]).length && <tr><td colSpan={6} className="text-center py-10 text-gray-400">No organisations found</td></tr>}
                  </tbody>
                </table>
              </div>

              {/* Detail slide-over */}
              {tenantDetailId && (
                <div className="fixed inset-y-0 right-0 z-40 w-full max-w-sm bg-white shadow-2xl border-l border-gray-200 flex flex-col">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <h2 className="font-bold text-gray-800">Organisation Detail</h2>
                    <button onClick={() => setTenantDetailId(null)} className="text-gray-400 hover:text-gray-600"><X size={17} /></button>
                  </div>
                  <div className="overflow-y-auto flex-1 p-5 space-y-4">
                    {!tenantDetail ? <p className="text-sm text-gray-400 text-center pt-8">Loading…</p> : (
                      <>
                        <div>
                          <p className="text-lg font-bold text-gray-800">{tenantDetail.name}</p>
                          <p className="text-xs text-gray-400">{tenantDetail.slug}</p>
                          <div className="flex gap-2 mt-2"><Pill label={tenantDetail.plan} map={PLAN_COLORS} /><Pill label={tenantDetail.status} map={STATUS_COLORS} /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-500">Users</p><p className="text-xl font-bold">{(tenantDetail.users ?? []).length}</p></div>
                          <div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-500">Projects</p><p className="text-xl font-bold">{(tenantDetail.projects ?? []).length}</p></div>
                        </div>
                        {tenantDetail.lockReason && (
                          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                            <p className="text-xs font-semibold text-red-700 mb-1">Lock Reason</p>
                            <p className="text-sm text-red-600">{tenantDetail.lockReason}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Team Members</p>
                          <div className="space-y-2">
                            {(tenantDetail.users ?? []).slice(0, 10).map((u: any) => (
                              <div key={u.id} className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-gray-50">
                                <UserAvatar name={u.name || '?'} size="sm" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold truncate">{u.name}</p>
                                  <p className="text-xs text-gray-400 truncate">{u.email}</p>
                                </div>
                                <RoleBadge role={u.role} />
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════ PLATFORM USERS ════════════════════════ */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap gap-3 items-center">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Search name or email…"
                    className="pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <select value={userRole} onChange={e => setUserRole(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                  <option value="">All Roles</option>
                  {['TENANT_ADMIN','DELIVERY_LEAD','PMO','EXEC','TEAM_MEMBER','CLIENT'].map(r => <option key={r} value={r}>{r.replace(/_/g,' ')}</option>)}
                </select>
                <select value={userStatus} onChange={e => setUserStatus(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                  <option value="">All Statuses</option>
                  <option>ACTIVE</option><option>BLOCKED</option><option>INACTIVE</option>
                </select>
                <span className="ml-auto text-xs text-gray-400">{(usersData as any[]).length} users</span>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Active',     value: (usersData as any[]).filter((u: any) => u.status !== 'BLOCKED').length, icon: <UserCheck size={15} className="text-emerald-600" />, bg: 'bg-emerald-50' },
                  { label: 'Blocked',    value: (usersData as any[]).filter((u: any) => u.status === 'BLOCKED').length,  icon: <UserX size={15} className="text-red-500" />,      bg: 'bg-red-50'     },
                  { label: 'Orgs',       value: new Set((usersData as any[]).map((u: any) => u.tenantId).filter(Boolean)).size, icon: <Building2 size={15} className="text-indigo-600" />, bg: 'bg-indigo-50' },
                ].map(c => (
                  <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg ${c.bg} flex items-center justify-center`}>{c.icon}</div>
                    <div><p className="text-2xl font-bold text-gray-800">{c.value}</p><p className="text-xs text-gray-400">{c.label}</p></div>
                  </div>
                ))}
              </div>

              {/* User table */}
              {usersLoading
                ? <div className="text-center py-16 text-gray-400">Loading users…</div>
                : (
                  <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-gray-100 bg-gray-50">
                        {['User','Organisation','Role','Status','Joined',''].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {(usersData as any[]).map((u: any) => (
                          <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50/60 transition-colors">
                            {/* User cell */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <UserAvatar name={u.name || '?'} size="md" />
                                <div>
                                  <p className="font-semibold text-gray-800 leading-tight">{u.name}</p>
                                  <p className="text-xs text-gray-400">{u.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg font-medium">
                                <Building2 size={10} className="opacity-60" /> {u.tenantName ?? '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                            <td className="px-4 py-3"><Pill label={u.status ?? 'ACTIVE'} map={STATUS_COLORS} /></td>
                            <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</td>
                            <td className="px-4 py-3">
                              {u.status === 'BLOCKED' ? (
                                <button onClick={() => unblockUser.mutate(u.id)} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 font-semibold hover:bg-emerald-100 ml-auto">
                                  <UserCheck size={12} /> Unblock
                                </button>
                              ) : blockTarget === u.id ? (
                                <div className="flex items-center gap-1 justify-end">
                                  <input value={blockReason} onChange={e => setBlockReason(e.target.value)} placeholder="Reason…"
                                    className="text-xs border border-red-200 rounded-lg px-2 py-1 w-24 focus:outline-none focus:ring-1 focus:ring-red-300" autoFocus />
                                  <button onClick={() => blockUser.mutate({ id: u.id, reason: blockReason })} disabled={!blockReason || blockUser.isPending}
                                    className="text-xs px-2 py-1 rounded-lg bg-red-600 text-white font-semibold disabled:opacity-50 whitespace-nowrap">Block</button>
                                  <button onClick={() => { setBlockTarget(null); setBlockReason(''); }} className="p-1 text-gray-400 hover:text-gray-600"><X size={12} /></button>
                                </div>
                              ) : (
                                <button onClick={() => setBlockTarget(u.id)} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 font-semibold hover:bg-red-100 ml-auto">
                                  <UserX size={12} /> Block
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                        {!(usersData as any[]).length && <tr><td colSpan={6} className="text-center py-14 text-gray-400">No users found</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )
              }
            </div>
          )}

          {/* ════════════════════════ BILLING & PLANS ═══════════════════════ */}
          {activeTab === 'billing' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                {Object.entries(PLAN_PRICE).map(([plan, price]) => {
                  const count = (stats?.planDistribution as Record<string,number>)?.[plan] ?? 0;
                  return (
                    <div key={plan} className="bg-white rounded-2xl border border-gray-200 p-5">
                      <Pill label={plan} map={PLAN_COLORS} />
                      <p className="text-3xl font-bold text-gray-900 mt-3">{count}</p>
                      <p className="text-sm text-gray-500">organisations</p>
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-xs text-gray-400">Plan price</p>
                        <p className="text-base font-bold text-gray-700">${price}/mo per org</p>
                        <p className="text-xs text-gray-400 mt-1">MRR: <span className="font-semibold text-gray-600">${(price*count).toLocaleString()}</span></p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-800 mb-4">Plan Limits</h3>
                <table className="w-full text-sm"><thead><tr className="border-b border-gray-100">
                  {['Plan','Users','Projects','Price'].map(h=><th key={h} className="text-left py-2 text-xs font-semibold text-gray-500 uppercase">{h}</th>)}
                </tr></thead><tbody>
                  {[{plan:'STARTER',users:10,projects:5,price:49},{plan:'PRO',users:50,projects:25,price:149},{plan:'ENTERPRISE',users:500,projects:200,price:499}].map(r=>(
                    <tr key={r.plan} className="border-b border-gray-100 last:border-0">
                      <td className="py-3"><Pill label={r.plan} map={PLAN_COLORS} /></td>
                      <td className="py-3 text-gray-700">{r.users}</td>
                      <td className="py-3 text-gray-700">{r.projects}</td>
                      <td className="py-3 font-semibold text-gray-800">${r.price}/mo</td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            </div>
          )}

          {/* ═════════════════════════ FEATURE METRICS ══════════════════════ */}
          {activeTab === 'metrics' && (
            <div className="space-y-6">
              {/* KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard label="Total Events"    value={featureUsage?.totalEvents ?? '—'}  sub="from audit logs"                   icon={<Activity />}       color="bg-blue-50 text-blue-900"   />
                <KpiCard label="Active Orgs"     value={stats?.activeTenants ?? '—'}        sub="with recorded activity"            icon={<Building2 />}      color="bg-emerald-50 text-emerald-900" />
                <KpiCard label="Total Projects"  value={stats?.totalProjects ?? '—'}        sub={`${stats?.activeProjects ?? 0} active`} icon={<Zap />}       color="bg-violet-50 text-violet-900" />
                <KpiCard label="Overdue Tasks"   value={stats?.overdueTasks ?? '—'}         sub={`of ${stats?.totalTasks ?? 0} total`}   icon={<AlertTriangle />} color={stats?.overdueTasks > 0 ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-900'} />
              </div>

              {/* Donut + horizontal bars */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Donut */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-6 flex flex-col items-center justify-center">
                  <h3 className="font-semibold text-gray-800 mb-4 self-start">Feature Distribution</h3>
                  {donutSegments.length > 0 ? (
                    <>
                      <div className="relative">
                        <DonutChart segments={donutSegments} size={160} stroke={26} />
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <p className="text-2xl font-bold text-gray-800">{featureUsage?.totalEvents ?? 0}</p>
                          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">events</p>
                        </div>
                      </div>
                      <div className="mt-5 space-y-2 w-full">
                        {donutSegments.slice(0, 5).map((seg) => (
                          <div key={seg.label} className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: seg.color }} />
                            <span className="text-xs text-gray-600 flex-1 truncate">{seg.label}</span>
                            <span className="text-xs font-bold text-gray-500">{Math.round((seg.value / (featureUsage?.totalEvents || 1)) * 100)}%</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-8">No usage data yet</p>
                  )}
                </div>

                {/* Horizontal bars breakdown */}
                <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="font-semibold text-gray-800">Usage by Feature</h3>
                    <span className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1">{featureUsage?.totalEvents ?? 0} total</span>
                  </div>
                  <div className="space-y-5">
                    {((featureUsage?.features as any[]) ?? []).map((f: any, i: number) => (
                      <div key={f.key}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-base leading-none">{MOD_ICON[f.key] ?? '•'}</span>
                            <span className="text-sm font-semibold text-gray-700">{f.label}</span>
                            {i === 0 && <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">#1</span>}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-400">
                            <span>{f.orgs} org{f.orgs !== 1 ? 's' : ''}</span>
                            <span className="font-bold text-gray-600 tabular-nums w-16 text-right">{f.events} events</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <HorizBar pct={f.percentage} color={MOD_TW[f.key] ?? 'bg-indigo-400'} />
                          </div>
                          <span className="text-xs font-bold text-gray-400 w-8 text-right">{f.percentage}%</span>
                        </div>
                      </div>
                    ))}
                    {!featureUsage?.features?.length && (
                      <p className="text-center py-8 text-gray-400 text-sm">No usage data yet. Activity appears here as users interact with the platform.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Daily activity */}
              {featureUsage?.dailyActivity && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h3 className="font-semibold text-gray-800">Daily Platform Activity</h3>
                      <p className="text-xs text-gray-400 mt-0.5">Last 30 days — hover a bar for the date and event count</p>
                    </div>
                    <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1 rounded-lg font-semibold">
                      {(featureUsage.dailyActivity as any[]).reduce((s: number, d: any) => s + d.count, 0)} events
                    </span>
                  </div>
                  <ActivityBars data={featureUsage.dailyActivity as any[]} />
                  <div className="flex justify-between mt-2 text-[10px] text-gray-400">
                    <span>{(featureUsage.dailyActivity as any[])[0]?.date}</span>
                    <span>{(featureUsage.dailyActivity as any[])[(featureUsage.dailyActivity as any[]).length - 1]?.date}</span>
                  </div>
                </div>
              )}

              {/* Most active orgs */}
              {perfData?.tenantMetrics && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h3 className="font-semibold text-gray-800 mb-5">Most Active Organisations</h3>
                  <div className="space-y-4">
                    {(perfData.tenantMetrics as any[]).slice(0, 8).map((t: any, i: number) => (
                      <div key={t.tenantId} className="flex items-center gap-4">
                        <span className={`text-sm font-bold w-5 text-right ${i < 3 ? 'text-indigo-600' : 'text-gray-300'}`}>{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-semibold text-gray-700 truncate">{t.name}</span>
                            <div className="flex items-center gap-3 text-xs text-gray-400 shrink-0 ml-2">
                              <span>{t.users}u</span>
                              <span>{t.projects}p</span>
                              <span className="font-semibold text-gray-600">{t.tasks} tasks</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-400 rounded-full transition-all" style={{ width: `${t.completionPct}%` }} />
                            </div>
                            <span className="text-[10px] text-gray-400 shrink-0">{t.completionPct}% done</span>
                          </div>
                        </div>
                        <Pill label={t.plan ?? 'STARTER'} map={PLAN_COLORS} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═════════════════════════ MODULE CONFIG ════════════════════════ */}
          {activeTab === 'modules' && (
            <div className="space-y-4">
              {!moduleTarget ? (
                <>
                  <p className="text-sm text-gray-500">Select an organisation to configure its module access.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {(tenantsData as any[]).map((t: any) => (
                      <button key={t.id} onClick={() => setModuleTarget({ id: t.id, name: t.name })}
                        className="text-left p-4 bg-white rounded-2xl border border-gray-200 hover:border-indigo-300 hover:shadow-sm transition-all group">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-gray-800 group-hover:text-indigo-600">{t.name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{t.userCount ?? 0} users</p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Pill label={t.plan} map={PLAN_COLORS} />
                            <Pill label={t.status} map={STATUS_COLORS} />
                          </div>
                        </div>
                        <div className="mt-3 flex items-center gap-1.5 text-xs text-indigo-600 font-medium">
                          <Layers size={12} /> Configure modules <ChevronRight size={12} />
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <button onClick={() => setModuleTarget(null)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
                    ← All Organisations
                  </button>
                  <div className="bg-white rounded-2xl border border-gray-200 p-5">
                    <ModuleControlPanel tenantId={moduleTarget.id} tenantName={moduleTarget.name} />
                  </div>
                </>
              )}
            </div>
          )}

          {/* ════════════════════════ PLATFORM ALERTS ═══════════════════════ */}
          {activeTab === 'alerts' && (
            <div className="space-y-3">
              {!(alerts as any[]).length && (
                <div className="text-center py-16 text-gray-400">
                  <Bell size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No active alerts. Platform is healthy.</p>
                </div>
              )}
              {(alerts as any[]).map((alert: any, i: number) => (
                <div key={i} className={`bg-white rounded-2xl border p-5 ${alert.severity === 'HIGH' ? 'border-red-200' : 'border-amber-200'}`}>
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={16} className={`mt-0.5 shrink-0 ${alert.severity === 'HIGH' ? 'text-red-500' : 'text-amber-500'}`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-xs font-bold ${alert.severity === 'HIGH' ? 'text-red-600' : 'text-amber-600'}`}>{alert.severity}</span>
                        <span className="text-xs text-gray-400">·</span>
                        <span className="text-xs text-gray-500">{alert.type}</span>
                      </div>
                      <p className="font-semibold text-gray-800">{alert.title}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{alert.description}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-gray-400 flex items-center gap-1"><Building2 size={11} />{alert.tenantName}</span>
                        {alert.suggestedAction && <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg">→ {alert.suggestedAction}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ═════════════════════════ AUDIT TRAIL ══════════════════════════ */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              {/* Filter bar */}
              <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3 flex flex-wrap gap-3 items-center">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 shrink-0"><Filter size={13} /> Filters</span>
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={auditSearch} onChange={e => setAuditSearch(e.target.value)} placeholder="Search action, org, user…"
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 text-xs w-52 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <select value={auditAction} onChange={e => setAuditAction(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300">
                  <option value="">All Actions</option>
                  {['CREATE','UPDATE','DELETE','BLOCK','UNBLOCK','INVITE','LOGIN','MODULE','TENANT'].map(a => <option key={a}>{a}</option>)}
                </select>
                {(auditSearch || auditAction) && (
                  <button onClick={() => { setAuditSearch(''); setAuditAction(''); }} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700">
                    <X size={12} /> Clear
                  </button>
                )}
                <span className="ml-auto text-xs text-gray-400">{filteredAudit.length} entries</span>
              </div>

              {/* Timeline entries */}
              {pagedAudit.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-gray-200 text-gray-400">
                  <Shield size={28} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No audit logs found</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  {/* Header */}
                  <div className="grid grid-cols-[16px_1fr_1fr_1fr_96px] gap-4 items-center px-5 py-2.5 border-b border-gray-100 bg-gray-50">
                    <span />
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Action</span>
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Organisation</span>
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Performed By</span>
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide text-right">When</span>
                  </div>

                  <div className="divide-y divide-gray-100">
                    {pagedAudit.map((log: any, i: number) => {
                      const s = getActionStyle(log.action);
                      return (
                        <div key={i} className={`grid grid-cols-[16px_1fr_1fr_1fr_96px] gap-4 items-center px-5 py-3.5 hover:bg-gray-50/70 transition-colors border-l-2 ${s.ring}`}>
                          {/* Dot */}
                          <div className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />

                          {/* Action */}
                          <div className="min-w-0">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold ${s.badge}`}>
                              {log.action || '—'}
                            </span>
                            {log.entityType && <p className="text-[11px] text-gray-400 mt-0.5">{log.entityType}{log.entityId ? ` #${String(log.entityId).slice(-6)}` : ''}</p>}
                          </div>

                          {/* Org */}
                          <div className="min-w-0">
                            {log.tenantName
                              ? <span className="flex items-center gap-1 text-xs font-medium text-gray-700 truncate"><Building2 size={11} className="text-gray-400 shrink-0" />{log.tenantName}</span>
                              : <span className="text-xs text-gray-300">—</span>}
                          </div>

                          {/* Performed by */}
                          <div className="flex items-center gap-2 min-w-0">
                            {log.performedBy && <UserAvatar name={log.performedBy} size="xs" />}
                            <span className="text-xs text-gray-500 truncate">{log.performedBy || '—'}</span>
                          </div>

                          {/* Time */}
                          <div className="text-right">
                            <p className="text-xs text-gray-500 font-medium" title={log.createdAt ? new Date(log.createdAt).toLocaleString() : undefined}>
                              {relativeTime(log.createdAt)}
                            </p>
                            <p className="text-[10px] text-gray-300">{log.createdAt ? new Date(log.createdAt).toLocaleDateString() : ''}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pagination */}
                  <div className="px-5 pb-4 pt-2">
                    <Pagination
                      page={auditPage}
                      total={filteredAudit.length}
                      pageSize={AUDIT_PAGE_SIZE}
                      onChange={setAuditPage}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {lockTarget   && <LockModal   tenantId={lockTarget.id}   tenantName={lockTarget.name}   onClose={() => setLockTarget(null)}   />}
      {unlockTarget && <UnlockModal tenantId={unlockTarget.id} tenantName={unlockTarget.name} onClose={() => setUnlockTarget(null)} />}
    </div>
  );
};

export default SuperAdminPage;
