'use client';
import React, { useState, useMemo } from 'react';
import {
  Shield, User, Users, CalendarDays, Clock, Search, Filter,
  RefreshCw, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Tag, FileText, Settings, MapPin, Key, Layers, Package,
  ClipboardList, CheckCircle, XCircle, ArrowRight,
  Download,
} from 'lucide-react';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import UserAvatar from '../components/ui/UserAvatar';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';
import { useAuditLogs, useAdminUsers } from '../hooks/useAdmin';
import { useI18n } from '../contexts/I18nContext';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AuditLog {
  id: string;
  action: string;
  entityType?: string;
  entityId?: string;
  performedByName?: string;
  performedByEmail?: string;
  performedById?: string;
  oldValue?: string;
  newValue?: string;
  createdAt?: string;
}

// ── Action styling ─────────────────────────────────────────────────────────────

const ACTION_STYLES: Record<string, { bg: string; text: string; icon: React.ReactNode; verb: string }> = {
  CREATE:        { bg: 'bg-emerald-100 border-emerald-200', text: 'text-emerald-700', icon: <CheckCircle size={11} />, verb: 'Created' },
  UPDATE:        { bg: 'bg-blue-100 border-blue-200',       text: 'text-blue-700',    icon: <ArrowRight size={11} />,  verb: 'Updated' },
  DELETE:        { bg: 'bg-red-100 border-red-200',         text: 'text-red-700',     icon: <XCircle size={11} />,     verb: 'Deleted' },
  STATUS_CHANGE: { bg: 'bg-amber-100 border-amber-200',     text: 'text-amber-700',   icon: <ArrowRight size={11} />,  verb: 'Status changed' },
  ROLE_CHANGE:   { bg: 'bg-violet-100 border-violet-200',   text: 'text-violet-700',  icon: <Shield size={11} />,      verb: 'Role changed' },
  ASSIGN:        { bg: 'bg-indigo-100 border-indigo-200',   text: 'text-indigo-700',  icon: <Users size={11} />,       verb: 'Assigned' },
  APPROVE:       { bg: 'bg-teal-100 border-teal-200',       text: 'text-teal-700',    icon: <CheckCircle size={11} />, verb: 'Approved' },
  REJECT:        { bg: 'bg-red-100 border-red-200',         text: 'text-red-700',     icon: <XCircle size={11} />,     verb: 'Rejected' },
  REVOKE:        { bg: 'bg-orange-100 border-orange-200',   text: 'text-orange-700',  icon: <Shield size={11} />,      verb: 'Revoked' },
};

const actionStyle = (a: string) =>
  ACTION_STYLES[a] ?? { bg: 'bg-gray-100 border-gray-200', text: 'text-gray-600', icon: <Tag size={11} />, verb: a.replace(/_/g, ' ') };

// ── Entity type labels & icons ─────────────────────────────────────────────────

const ENTITY_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  user:               { label: 'User',              icon: <User size={11} />,          color: 'text-blue-500' },
  org_role:           { label: 'Org Role',          icon: <Shield size={11} />,        color: 'text-violet-500' },
  user_permissions:   { label: 'Permissions',       icon: <Key size={11} />,           color: 'text-indigo-500' },
  user_org_role:      { label: 'Role Assignment',   icon: <Users size={11} />,         color: 'text-purple-500' },
  leave_type:         { label: 'Leave Type',        icon: <CalendarDays size={11} />,  color: 'text-emerald-500' },
  holiday:            { label: 'Holiday',           icon: <CalendarDays size={11} />,  color: 'text-green-500' },
  calendar_config:    { label: 'Calendar Config',   icon: <Settings size={11} />,      color: 'text-teal-500' },
  leave_request:      { label: 'Leave Request',     icon: <FileText size={11} />,      color: 'text-amber-500' },
  ip_config:          { label: 'IP Restriction',    icon: <Shield size={11} />,        color: 'text-red-500' },
  ip_settings:        { label: 'IP Settings',       icon: <Settings size={11} />,      color: 'text-red-500' },
  geo_config:         { label: 'Geo Restriction',   icon: <MapPin size={11} />,        color: 'text-orange-500' },
  geo_settings:       { label: 'Geo Settings',      icon: <Settings size={11} />,      color: 'text-orange-500' },
  zone_config:        { label: 'Zone Restriction',  icon: <MapPin size={11} />,        color: 'text-pink-500' },
  zone_settings:      { label: 'Zone Settings',     icon: <Settings size={11} />,      color: 'text-pink-500' },
  shift:              { label: 'Work Shift',        icon: <Clock size={11} />,         color: 'text-yellow-600' },
  office_location:    { label: 'Office Location',   icon: <MapPin size={11} />,        color: 'text-blue-500' },
  LEAVE:              { label: 'Leave',             icon: <CalendarDays size={11} />,  color: 'text-emerald-500' },
  task:               { label: 'Task',              icon: <ClipboardList size={11} />, color: 'text-blue-500' },
  sprint:             { label: 'Sprint',            icon: <Package size={11} />,       color: 'text-indigo-500' },
};

const entityMeta = (type?: string) =>
  type
    ? (ENTITY_META[type] ?? { label: type, icon: <Layers size={11} />, color: 'text-gray-500' })
    : { label: 'System', icon: <Layers size={11} />, color: 'text-gray-400' };

// ── Human-readable summary ─────────────────────────────────────────────────────

const parseJson = (v?: string) => {
  if (!v) return null;
  try { return JSON.parse(v); } catch { return null; }
};

const summarise = (log: AuditLog): string => {
  const nv = parseJson(log.newValue);
  const ov = parseJson(log.oldValue);
  const entity = entityMeta(log.entityType).label;
  const action = log.action;

  if (action === 'CREATE') {
    if (log.entityType === 'user') return `Invited ${nv?.name ?? nv?.email ?? 'new user'} as ${nv?.role ?? 'member'}`;
    if (log.entityType === 'org_role') return `Created role "${nv?.name ?? 'new role'}"`;
    if (log.entityType === 'leave_type') return `Created leave type "${nv?.name ?? ''}"`;
    if (log.entityType === 'holiday') return `Added holiday "${nv?.name ?? ''}" on ${nv?.holiday_date ?? ''}`;
    if (log.entityType === 'ip_config') return `Added IP range ${nv?.ip_address ?? ''} "${nv?.label ?? ''}"`;
    if (log.entityType === 'geo_config') return `Added geo restriction for ${nv?.country_code ?? ''}`;
    if (log.entityType === 'shift') return `Created shift "${nv?.name ?? ''}"`;
    if (log.entityType === 'sprint') return `Created sprint "${nv?.name ?? ''}"`;
    return `Created ${entity.toLowerCase()}`;
  }

  if (action === 'UPDATE') {
    if (log.entityType === 'org_role') return `Updated role "${nv?.name ?? ov?.name ?? ''}"`;
    if (log.entityType === 'calendar_config') return `Updated calendar configuration`;
    if (log.entityType === 'ip_settings') return `Updated IP restriction settings`;
    if (log.entityType === 'geo_settings') return `Updated geo restriction settings`;
    if (log.entityType === 'zone_settings') return `Updated zone settings`;
    if (log.entityType === 'shift') return `Updated shift "${nv?.name ?? ov?.name ?? ''}"`;
    if (log.entityType === 'holiday') return `Updated holiday "${nv?.name ?? ov?.name ?? ''}"`;
    if (log.entityType === 'leave_type') return `Updated leave type "${nv?.name ?? ov?.name ?? ''}"`;
    return `Updated ${entity.toLowerCase()}`;
  }

  if (action === 'DELETE') {
    if (log.entityType === 'org_role') return `Deleted role "${ov?.name ?? ''}"`;
    if (log.entityType === 'holiday') return `Removed holiday "${ov?.name ?? ''}"`;
    if (log.entityType === 'ip_config') return `Removed IP range ${ov?.ip_address ?? ''}`;
    if (log.entityType === 'geo_config') return `Removed geo restriction for ${ov?.country_code ?? ''}`;
    if (log.entityType === 'shift') return `Deleted shift "${ov?.name ?? ''}"`;
    return `Deleted ${entity.toLowerCase()}`;
  }

  if (action === 'ROLE_CHANGE') {
    return `Changed Catalyst role: ${ov?.role ?? '?'} → ${nv?.role ?? '?'}`;
  }

  if (action === 'STATUS_CHANGE') {
    const from = ov?.status ?? ov?.is_active;
    const to   = nv?.status ?? nv?.is_active;
    if (log.entityType === 'user') {
      return to === 'true' || to === true ? 'Reactivated user account' : 'Deactivated user account';
    }
    return `Status changed${from ? `: ${from} → ${to}` : ''}`;
  }

  if (action === 'ASSIGN') {
    if (log.entityType === 'user_org_role') return `Assigned org role "${nv?.orgRoleName ?? ''}"`;
    return `Assigned ${entity.toLowerCase()}`;
  }

  if (action === 'APPROVE') return `Approved leave request`;
  if (action === 'REJECT')  return `Rejected leave request`;

  if (action === 'CREATE' && log.entityType === 'user_permissions') return 'Updated user permissions';
  if (log.entityType === 'user_permissions') return 'Updated user permissions';

  return `${action.replace(/_/g, ' ')} on ${entity.toLowerCase()}`;
};

// ── ChangeDiff — field-by-field diff ──────────────────────────────────────────

const HIDDEN_KEYS = new Set(['tenant_id', 'MODIFIEDTIME', 'CREATEDTIME', 'ROWID', 'is_active', 'tenantId']);

const friendlyKey = (k: string) =>
  k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const ChangeDiff = ({ oldVal, newVal, collapsed }: { oldVal?: string; newVal?: string; collapsed?: boolean }) => {
  const ov = parseJson(oldVal);
  const nv = parseJson(newVal);

  if (!ov && !nv) return <span className="text-gray-400 text-xs italic">No details</span>;

  if (ov && nv && typeof ov === 'object' && typeof nv === 'object') {
    const keys = Array.from(new Set([...Object.keys(ov), ...Object.keys(nv)])).filter(k => !HIDDEN_KEYS.has(k));
    const changed = keys.filter(k => String(ov[k] ?? '') !== String(nv[k] ?? '') && !(ov[k] === null && nv[k] === undefined) && !(ov[k] === undefined && nv[k] === null));
    if (changed.length === 0) return <span className="text-gray-400 text-xs italic">No visible changes</span>;
    const visible = collapsed ? changed.slice(0, 2) : changed;
    return (
      <div className="space-y-1.5">
        {visible.map(k => (
          <div key={k} className="flex items-start gap-2 text-xs">
            <span className="font-medium text-gray-500 shrink-0 min-w-[80px]">{friendlyKey(k)}</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {ov[k] !== undefined && <span className="px-1.5 py-0.5 bg-red-50 text-red-600 rounded border border-red-100 line-through max-w-[200px] truncate">{String(ov[k])}</span>}
              <ArrowRight size={10} className="text-gray-400 shrink-0" />
              {nv[k] !== undefined && <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-100 font-medium max-w-[200px] truncate">{String(nv[k])}</span>}
            </div>
          </div>
        ))}
        {collapsed && changed.length > 2 && (
          <p className="text-[10px] text-gray-400 italic">{changed.length - 2} more field{changed.length - 2 > 1 ? 's' : ''} changed</p>
        )}
      </div>
    );
  }

  // CREATE — show new values
  if (nv && typeof nv === 'object') {
    const keys = Object.keys(nv).filter(k => !HIDDEN_KEYS.has(k) && nv[k] !== null && nv[k] !== '');
    const visible = collapsed ? keys.slice(0, 3) : keys;
    return (
      <div className="space-y-1.5">
        {visible.map(k => (
          <div key={k} className="flex items-start gap-2 text-xs">
            <span className="font-medium text-gray-500 shrink-0 min-w-[80px]">{friendlyKey(k)}</span>
            <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-100 font-medium max-w-[240px] truncate">{String(nv[k])}</span>
          </div>
        ))}
        {collapsed && keys.length > 3 && (
          <p className="text-[10px] text-gray-400 italic">+{keys.length - 3} more</p>
        )}
      </div>
    );
  }

  return <span className="text-xs text-gray-600 break-all">{newVal || oldVal}</span>;
};

// ── Log row ────────────────────────────────────────────────────────────────────

const LogRow = ({ log, avatarUrl }: { log: AuditLog; avatarUrl?: string }) => {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const hasDetail = !!(log.oldValue || log.newValue);
  const style = actionStyle(log.action);
  const meta  = entityMeta(log.entityType);
  const summary = summarise(log);

  const fmtTime = (s?: string) => {
    if (!s) return '—';
    const d = new Date(s);
    return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="border-b border-gray-100 last:border-0">
      <div
        className={`flex items-start gap-3 px-5 py-4 transition-colors ${hasDetail ? 'cursor-pointer hover:bg-gray-50/80' : ''}`}
        onClick={() => hasDetail && setExpanded(e => !e)}
      >
        {/* Avatar */}
        <div className="shrink-0 mt-0.5">
          <UserAvatar
            name={log.performedByName || log.performedByEmail || '?'}
            avatarUrl={avatarUrl}
            size="sm"
          />
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            {/* Who */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold text-gray-900 truncate">
                {log.performedByName || t('common.na')}
              </span>
              {log.performedByEmail && (
                <span className="text-xs text-gray-400 truncate hidden sm:block">{log.performedByEmail}</span>
              )}
            </div>
            {/* When */}
            <span className="text-xs text-gray-400 whitespace-nowrap shrink-0 flex items-center gap-1">
              <Clock size={10} />
              {fmtTime(log.createdAt)}
            </span>
          </div>

          {/* Summary sentence */}
          <p className="text-sm text-gray-700 mt-0.5">{summary}</p>

          {/* Chips row */}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {/* Action badge */}
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${style.bg} ${style.text}`}>
              {style.icon}
              {log.action.replace(/_/g, ' ')}
            </span>
            {/* Entity chip */}
            {log.entityType && (
              <span className={`inline-flex items-center gap-1 text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200`}>
                <span className={meta.color}>{meta.icon}</span>
                {meta.label}
                {log.entityId && <span className="text-gray-400">#{log.entityId.slice(-6)}</span>}
              </span>
            )}
          </div>

          {/* Collapsed diff preview */}
          {!expanded && hasDetail && (
            <div className="mt-2">
              <ChangeDiff oldVal={log.oldValue} newVal={log.newValue} collapsed />
            </div>
          )}
        </div>

        {/* Expand toggle */}
        {hasDetail && (
          <div className="shrink-0 text-gray-400 mt-1">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && hasDetail && (
        <div className="px-5 pb-5 ml-11">
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Change Details</p>
            <ChangeDiff oldVal={log.oldValue} newVal={log.newValue} />
          </div>
          {/* Raw toggle */}
          <details className="mt-2">
            <summary className="text-[11px] text-gray-400 cursor-pointer hover:text-gray-600 select-none">
              Raw JSON
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-red-400 font-semibold mb-1">Before</p>
                <pre className="bg-red-50 border border-red-100 rounded-lg p-2 text-[10px] text-red-700 font-mono break-all whitespace-pre-wrap">{log.oldValue || 'null'}</pre>
              </div>
              <div>
                <p className="text-[10px] text-emerald-600 font-semibold mb-1">After</p>
                <pre className="bg-emerald-50 border border-emerald-100 rounded-lg p-2 text-[10px] text-emerald-800 font-mono break-all whitespace-pre-wrap">{log.newValue || 'null'}</pre>
              </div>
            </div>
          </details>
        </div>
      )}
    </div>
  );
};

// ── Pagination helper ──────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

const Paginator = ({
  page, totalPages, total, perPage, label,
  onPrev, onNext, onPage,
}: {
  page: number; totalPages: number; total: number; perPage: number; label: string;
  onPrev: () => void; onNext: () => void; onPage: (p: number) => void;
}) => (
  <div className="flex items-center justify-between px-1 mt-3">
    <p className="text-xs text-gray-500">
      {total === 0 ? `No ${label}` : `Showing ${(page - 1) * perPage + 1}–${Math.min(page * perPage, total)} of ${total} ${label}`}
    </p>
    {totalPages > 1 && (
      <div className="flex items-center gap-1">
        <button onClick={onPrev} disabled={page === 1}
          className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
          <ChevronLeft size={13} />
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
          .reduce<(number | '…')[]>((acc, p, idx, arr) => {
            if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('…');
            acc.push(p);
            return acc;
          }, [])
          .map((p, i) => p === '…' ? (
            <span key={`e${i}`} className="px-1 text-xs text-gray-400">…</span>
          ) : (
            <button key={p} onClick={() => onPage(p as number)}
              className={`min-w-[28px] h-7 rounded-lg text-xs font-medium border transition-colors ${
                page === p ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>{p}</button>
          ))}
        <button onClick={onNext} disabled={page === totalPages}
          className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
          <ChevronRight size={13} />
        </button>
      </div>
    )}
  </div>
);

// Static option lists — populated from known constants, not from loaded data,
// so dropdowns are complete regardless of pagination page.
const ACTION_OPTIONS = Object.keys(ACTION_STYLES);
const ENTITY_OPTIONS = Object.keys(ENTITY_META);

// ── Main page ──────────────────────────────────────────────────────────────────

const AuditLogsPage = () => {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterUser, setFilterUser]     = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterEntity, setFilterEntity] = useState('');
  const [filterFrom, setFilterFrom]     = useState('');
  const [filterTo, setFilterTo]         = useState('');

  // All server-side filter params, including page/pageSize for true server pagination.
  const params = useMemo(() => {
    const p: Record<string, string> = { page: String(page), pageSize: String(PAGE_SIZE) };
    if (filterUser)   p.performedBy = filterUser;
    if (filterAction) p.action      = filterAction;
    if (filterEntity) p.entityType  = filterEntity;
    if (filterFrom)   p.dateFrom    = filterFrom;
    if (filterTo)     p.dateTo      = filterTo;
    return p;
  }, [page, filterUser, filterAction, filterEntity, filterFrom, filterTo]);

  const { data, isLoading, refetch } = useAuditLogs(params);
  const { data: users = [] } = useAdminUsers();

  // Unwrap paginated response — total is the real DB COUNT, not the page size.
  const rawLogs    = useMemo(() => (data as any)?.logs ?? [] as AuditLog[], [data]);
  const total      = (data as any)?.total    ?? 0;
  const totalPages = (data as any)?.totalPages ?? 1;

  const avatarMap = useMemo(() => {
    const m: Record<string, string> = {};
    (users as any[]).forEach((u) => { if (u.avatarUrl) m[u.id] = u.avatarUrl; });
    return m;
  }, [users]);

  // Client-side text search within the current page only.
  const logs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rawLogs as AuditLog[];
    return (rawLogs as AuditLog[]).filter(l =>
      (l.performedByName || '').toLowerCase().includes(q) ||
      (l.performedByEmail || '').toLowerCase().includes(q) ||
      (l.action || '').toLowerCase().includes(q) ||
      (l.entityType || '').toLowerCase().includes(q) ||
      (l.newValue || '').toLowerCase().includes(q) ||
      (l.oldValue || '').toLowerCase().includes(q)
    );
  }, [rawLogs, search]);

  // User dropdown options from the full users list (independent of current page).
  const userOptions = useMemo(() => {
    return (users as any[]).map(u => [String(u.id), u.name || u.email || u.id] as [string, string]);
  }, [users]);

  const hasFilters = !!(search || filterUser || filterAction || filterEntity || filterFrom || filterTo);
  const clearFilters = () => {
    setSearch(''); setFilterUser(''); setFilterAction('');
    setFilterEntity(''); setFilterFrom(''); setFilterTo('');
    setPage(1);
  };

  // Stats — total comes from the real DB COUNT; today/week/users are from the current page.
  const now = new Date();
  const todayStr  = now.toISOString().slice(0, 10);
  const weekStart = useMemo(() => { const d = new Date(todayStr); d.setDate(d.getDate() - 7); return d; }, [todayStr]);
  const stats = useMemo(() => {
    const all = rawLogs as AuditLog[];
    const today     = all.filter(l => l.createdAt?.startsWith(todayStr)).length;
    const week      = all.filter(l => l.createdAt && new Date(l.createdAt) >= weekStart).length;
    const activeUsers = new Set(all.map(l => l.performedById).filter(Boolean)).size;
    return { today, week, activeUsers };
  }, [rawLogs, todayStr, weekStart]);

  // Export CSV (current page only when filters active, or remind user to use date filters for larger exports).
  const exportCsv = () => {
    const rows = [
      ['When', 'Who', 'Email', 'Action', 'Module', 'Entity ID', 'Summary'],
      ...logs.map(l => [
        l.createdAt ?? '', l.performedByName ?? '', l.performedByEmail ?? '',
        l.action, l.entityType ?? '', l.entityId ?? '', summarise(l),
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'audit-log.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout>
      <Header
        title={t('admin.audit.title')}
        subtitle="Every write operation — who changed what, and when"
        actions={
          <Button variant="outline" onClick={exportCsv} icon={<Download size={14} />}>
            {t('common.export')}
          </Button>
        }
      />

      <div className="px-6 pb-8 space-y-5 mt-2">

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: t('common.today'),        value: stats.today,       color: 'text-blue-600',    bg: 'bg-blue-50',    icon: <Clock size={14} className="text-blue-400" /> },
            { label: 'Last 7 days (page)',     value: stats.week,        color: 'text-indigo-600',  bg: 'bg-indigo-50',  icon: <CalendarDays size={14} className="text-indigo-400" /> },
            { label: t('common.total'),        value: total,             color: 'text-gray-700',    bg: 'bg-gray-50',    icon: <FileText size={14} className="text-gray-400" /> },
            { label: t('admin.users.title'),   value: stats.activeUsers, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: <Users size={14} className="text-emerald-400" /> },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3`}>
              {s.icon}
              <div>
                <p className={`text-xl font-bold leading-none ${s.color}`}>{isLoading ? '—' : s.value}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter size={13} className="text-gray-400" />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.filter')}</span>
            </div>
            <div className="flex items-center gap-2">
              {hasFilters && (
                <button onClick={clearFilters} className="text-xs text-blue-600 hover:underline">
                  {t('common.clear')}
                </button>
              )}
              <button onClick={() => refetch()} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                <RefreshCw size={11} /> {t('common.refresh')}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {/* Search — filters within the current page */}
            <div className="lg:col-span-2 relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-300/40 focus:border-blue-400"
                placeholder={t('common.searchPlaceholder')}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {/* Who — populated from full user list, not just current page */}
            <div className="relative">
              <User size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <select
                className="w-full pl-7 pr-2 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-300/40 appearance-none"
                value={filterUser}
                onChange={e => { setFilterUser(e.target.value); setPage(1); }}
              >
                <option value="">{t('common.all')} {t('admin.users.title')}</option>
                {userOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>

            {/* Action — static list from known constants */}
            <div className="relative">
              <Tag size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <select
                className="w-full pl-7 pr-2 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-300/40 appearance-none"
                value={filterAction}
                onChange={e => { setFilterAction(e.target.value); setPage(1); }}
              >
                <option value="">{t('common.all')} {t('nav.actions')}</option>
                {ACTION_OPTIONS.map(a => (
                  <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>

            {/* Module / entity — static list from known constants */}
            <div className="relative">
              <Layers size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <select
                className="w-full pl-7 pr-2 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-300/40 appearance-none"
                value={filterEntity}
                onChange={e => { setFilterEntity(e.target.value); setPage(1); }}
              >
                <option value="">{t('common.all')} modules</option>
                {ENTITY_OPTIONS.map(e => (
                  <option key={e} value={e}>{entityMeta(e).label}</option>
                ))}
              </select>
            </div>

            {/* Date from */}
            <div className="relative">
              <CalendarDays size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="date"
                className="w-full pl-7 pr-2 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-300/40"
                value={filterFrom}
                onChange={e => { setFilterFrom(e.target.value); setPage(1); }}
              />
            </div>

            {/* Date to */}
            <div className="relative">
              <CalendarDays size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="date"
                className="w-full pl-7 pr-2 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-300/40"
                value={filterTo}
                onChange={e => { setFilterTo(e.target.value); setPage(1); }}
              />
            </div>
          </div>
        </div>

        {/* Result count */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {isLoading
              ? t('common.loading')
              : `${total} event${total !== 1 ? 's' : ''}${hasFilters ? ' matching filters' : ''} — page ${page} of ${totalPages}`}
          </p>
        </div>

        {/* Log list */}
        {isLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-100 rounded animate-pulse w-48" />
                  <div className="h-3 bg-gray-100 rounded animate-pulse w-64" />
                  <div className="h-2.5 bg-gray-100 rounded animate-pulse w-32" />
                </div>
                <div className="h-3 bg-gray-100 rounded animate-pulse w-24" />
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No events match your filters' : t('admin.audit.noLogs')}
            description={hasFilters ? 'Try adjusting or clearing the filters.' : 'Activity will appear here as your team uses the platform.'}
            action={hasFilters ? <Button variant="outline" onClick={clearFilters}>{t('common.clear')}</Button> : undefined}
          />
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {logs.map(log => (
                <LogRow
                  key={log.id}
                  log={log}
                  avatarUrl={log.performedById ? avatarMap[log.performedById] : undefined}
                />
              ))}
            </div>
            <Paginator
              page={page} totalPages={totalPages} total={total}
              perPage={PAGE_SIZE} label="events"
              onPrev={() => setPage(p => Math.max(1, p - 1))}
              onNext={() => setPage(p => Math.min(totalPages, p + 1))}
              onPage={setPage}
            />
          </>
        )}
      </div>
    </Layout>
  );
};

export default AuditLogsPage;
