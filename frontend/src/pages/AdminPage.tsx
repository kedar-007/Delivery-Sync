import React, { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import {
  Plus, UserCheck, UserX, Shield, Search, Filter, RefreshCw,
  ChevronDown, ChevronUp, Clock, User, Tag, Layers, Calendar,
} from 'lucide-react';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import UserAvatar from '../components/ui/UserAvatar';
import { StatusBadge } from '../components/ui/Badge';
import Modal, { ModalActions } from '../components/ui/Modal';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/Spinner';
import { useAdminUsers, useInviteUser, useDeactivateUser, useAuditLogs } from '../hooks/useAdmin';
import { User as UserType } from '../types';

type Tab = 'users' | 'audit';
interface InviteForm { email: string; name: string; role: string; }

// ─── Action badge colours ────────────────────────────────────────────────────
const ACTION_COLORS: Record<string, string> = {
  CREATE:       'bg-emerald-100 text-emerald-700 border-emerald-200',
  UPDATE:       'bg-blue-100   text-blue-700   border-blue-200',
  DELETE:       'bg-red-100    text-red-700    border-red-200',
  STATUS_CHANGE:'bg-amber-100  text-amber-700  border-amber-200',
  ROLE_CHANGE:  'bg-violet-100 text-violet-700 border-violet-200',
  RESOLVE:      'bg-teal-100   text-teal-700   border-teal-200',
  ESCALATE:     'bg-orange-100 text-orange-700 border-orange-200',
  RAG_CHANGE:   'bg-pink-100   text-pink-700   border-pink-200',
};
const actionColor = (a: string) => ACTION_COLORS[a] || 'bg-gray-100 text-gray-600 border-gray-200';

// ─── Parse change diff from JSON strings ─────────────────────────────────────
const ChangeDiff = ({ oldVal, newVal }: { oldVal?: string; newVal?: string }) => {
  const parse = (v?: string) => {
    if (!v) return null;
    try { return JSON.parse(v); } catch { return v; }
  };
  const oldObj = parse(oldVal);
  const newObj = parse(newVal);
  if (!oldObj && !newObj) return <span className="text-gray-400 text-xs">—</span>;

  // If both are objects, show field-by-field diff
  if (oldObj && newObj && typeof oldObj === 'object' && typeof newObj === 'object') {
    const keys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)]));
    const changed = keys.filter(k => String(oldObj[k] ?? '') !== String(newObj[k] ?? ''));
    if (changed.length === 0) {
      return <span className="text-gray-400 text-xs">No visible changes</span>;
    }
    return (
      <div className="space-y-1">
        {changed.map(k => (
          <div key={k} className="flex items-center gap-1.5 flex-wrap text-xs">
            <span className="font-medium text-gray-500">{k}:</span>
            {oldObj[k] !== undefined && (
              <span className="px-1.5 py-0.5 bg-red-50 text-red-600 rounded line-through">
                {String(oldObj[k])}
              </span>
            )}
            <span className="text-gray-400">→</span>
            {newObj[k] !== undefined && (
              <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded font-medium">
                {String(newObj[k])}
              </span>
            )}
          </div>
        ))}
      </div>
    );
  }

  // If only newValue, show it as a summary
  if (newObj) {
    const str = typeof newObj === 'object'
      ? Object.entries(newObj).map(([k, v]) => `${k}: ${v}`).join(', ')
      : String(newObj);
    return <span className="text-xs text-gray-600 break-all">{str}</span>;
  }

  return <span className="text-xs text-gray-400 break-all">{String(oldObj)}</span>;
};

// ─── Single log row ───────────────────────────────────────────────────────────
interface AuditLog {
  id: string; action: string; entityType?: string; entityId?: string;
  performedByName?: string; performedByEmail?: string; performedById?: string;
  oldValue?: string; newValue?: string; createdAt?: string;
}

const LogRow = ({ log }: { log: AuditLog }) => {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = !!(log.oldValue || log.newValue);
  const initials = (log.performedByName || log.performedByEmail || '?')
    .split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="border-b border-gray-100 last:border-0">
      <div
        className={`flex items-start gap-4 px-5 py-4 hover:bg-gray-50 transition-colors ${hasDetail ? 'cursor-pointer' : ''}`}
        onClick={() => hasDetail && setExpanded(e => !e)}
      >
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">
          {initials}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Who */}
              <span className="text-sm font-semibold text-gray-900">
                {log.performedByName || log.performedById || 'Unknown'}
              </span>
              {log.performedByEmail && (
                <span className="text-xs text-gray-400">{log.performedByEmail}</span>
              )}
            </div>
            {/* When */}
            <span className="text-xs text-gray-400 whitespace-nowrap shrink-0 flex items-center gap-1">
              <Clock size={11} />
              {log.createdAt ? new Date(log.createdAt).toLocaleString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              }) : '—'}
            </span>
          </div>

          {/* Action + resource */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${actionColor(log.action)}`}>
              {log.action.replace(/_/g, ' ')}
            </span>
            {log.entityType && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
                <Layers size={10} />
                {log.entityType}
                {log.entityId ? <span className="text-gray-400">#{log.entityId.slice(-6)}</span> : null}
              </span>
            )}
          </div>

          {/* Inline diff preview (collapsed) */}
          {!expanded && hasDetail && (
            <div className="mt-1.5">
              <ChangeDiff oldVal={log.oldValue} newVal={log.newValue} />
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
        <div className="px-5 pb-4 ml-12 space-y-3">
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Change Details</p>
            <ChangeDiff oldVal={log.oldValue} newVal={log.newValue} />
          </div>
          {log.oldValue && (
            <details className="text-xs text-gray-400">
              <summary className="cursor-pointer hover:text-gray-600">Raw before / after</summary>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div className="bg-red-50 rounded p-2 font-mono break-all text-red-600">{log.oldValue}</div>
                <div className="bg-green-50 rounded p-2 font-mono break-all text-green-700">{log.newValue}</div>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
};

// ─── AdminPage ────────────────────────────────────────────────────────────────
const AdminPage = () => {
  const [tab, setTab] = useState<Tab>('users');
  const [showInvite, setShowInvite] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  // Audit filters
  const [filterAction, setFilterAction] = useState('');
  const [filterEntity, setFilterEntity] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const auditParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (filterAction) p.action = filterAction;
    if (filterEntity) p.entityType = filterEntity;
    if (filterUser) p.performedBy = filterUser;
    if (filterDateFrom) p.dateFrom = filterDateFrom;
    if (filterDateTo) p.dateTo = filterDateTo + ' 23:59:59';
    return p;
  }, [filterAction, filterEntity, filterUser, filterDateFrom, filterDateTo]);

  const { data: users = [], isLoading } = useAdminUsers();
  const { data: rawLogs = [], isLoading: auditLoading, refetch: refetchLogs } =
    useAuditLogs(auditParams, tab === 'audit');
  const inviteUser = useInviteUser();
  const deactivateUser = useDeactivateUser();

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<InviteForm>({
    defaultValues: { role: 'TEAM_MEMBER' },
  });

  // Client-side search filter
  const auditLogs = useMemo(() => {
    if (!filterSearch) return rawLogs as AuditLog[];
    const q = filterSearch.toLowerCase();
    return (rawLogs as AuditLog[]).filter(l =>
      (l.performedByName || '').toLowerCase().includes(q) ||
      (l.performedByEmail || '').toLowerCase().includes(q) ||
      (l.action || '').toLowerCase().includes(q) ||
      (l.entityType || '').toLowerCase().includes(q) ||
      (l.newValue || '').toLowerCase().includes(q)
    );
  }, [rawLogs, filterSearch]);

  const onInvite = async (data: InviteForm) => {
    try {
      setInviteError(''); setInviteSuccess('');
      await inviteUser.mutateAsync(data);
      setInviteSuccess(`Invitation sent to ${data.email}. They'll receive an email to sign in.`);
      reset();
      setTimeout(() => { setShowInvite(false); setInviteSuccess(''); }, 2500);
    } catch (err: unknown) { setInviteError((err as Error).message); }
  };

  const handleDeactivate = async (userId: string) => {
    if (!window.confirm('Deactivate this user? They will lose access.')) return;
    try { await deactivateUser.mutateAsync(userId); } catch { /* */ }
  };

  const clearFilters = () => {
    setFilterAction(''); setFilterEntity(''); setFilterUser('');
    setFilterDateFrom(''); setFilterDateTo(''); setFilterSearch('');
  };
  const hasFilters = !!(filterAction || filterEntity || filterUser || filterDateFrom || filterDateTo || filterSearch);

  // Unique action types and entity types from loaded logs for filter dropdowns
  const actionOptions = useMemo(() =>
    Array.from(new Set((rawLogs as AuditLog[]).map(l => l.action).filter(Boolean))).sort(),
    [rawLogs]);
  const entityOptions = useMemo(() =>
    Array.from(new Set((rawLogs as AuditLog[]).map(l => l.entityType).filter((v): v is string => !!v))).sort(),
    [rawLogs]);
  // Build user options from loaded logs
  const userOptions = useMemo(() => {
    const map = new Map<string, string>();
    (rawLogs as AuditLog[]).forEach(l => {
      if (l.performedById) map.set(l.performedById, l.performedByName || l.performedByEmail || l.performedById);
    });
    return Array.from(map.entries());
  }, [rawLogs]);

  if (isLoading) return <Layout><PageLoader /></Layout>;

  return (
    <Layout>
      <Header title="Admin" subtitle="User management and audit trail"
        actions={tab === 'users' && <Button onClick={() => setShowInvite(true)} icon={<Plus size={16} />}>Invite User</Button>}
      />
      <div className="p-6 space-y-5">

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200">
          {(['users', 'audit'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t === 'users' ? `Users (${users.length})` : `Audit Log${rawLogs.length ? ` (${rawLogs.length})` : ''}`}
            </button>
          ))}
        </div>

        {/* ── Users tab ─────────────────────────────────────────────────────── */}
        {tab === 'users' && (
          users.length === 0 ? (
            <EmptyState title="No users" description="Invite your first team member."
              action={<Button onClick={() => setShowInvite(true)} icon={<Plus size={16} />}>Invite User</Button>} />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Name', 'Email', 'Role', 'Status', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((u: UserType) => (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size="sm" />
                          <span className="text-sm font-medium text-gray-900">{u.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600">
                          <Shield size={12} /> {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                      <td className="px-4 py-3">
                        {u.status === 'ACTIVE' && (
                          <button onClick={() => handleDeactivate(u.id)}
                            className="text-xs text-red-600 hover:underline flex items-center gap-1">
                            <UserX size={12} /> Deactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* ── Audit Log tab ──────────────────────────────────────────────────── */}
        {tab === 'audit' && (
          <div className="space-y-4">

            {/* Filter bar */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Filter size={14} className="text-gray-400 shrink-0" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filters</span>
                {hasFilters && (
                  <button onClick={clearFilters}
                    className="ml-auto text-xs text-blue-600 hover:underline flex items-center gap-1">
                    Clear all
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* Search */}
                <div className="lg:col-span-2 relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    className="form-input pl-8 text-xs w-full"
                    placeholder="Search name, action, resource…"
                    value={filterSearch}
                    onChange={e => setFilterSearch(e.target.value)}
                  />
                </div>

                {/* Who (user) */}
                <div className="relative">
                  <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <select className="form-select pl-8 text-xs w-full" value={filterUser} onChange={e => setFilterUser(e.target.value)}>
                    <option value="">All users</option>
                    {userOptions.map(([id, name]) => (
                      <option key={id} value={id}>{name}</option>
                    ))}
                  </select>
                </div>

                {/* Action */}
                <div className="relative">
                  <Tag size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <select className="form-select pl-8 text-xs w-full" value={filterAction} onChange={e => setFilterAction(e.target.value)}>
                    <option value="">All actions</option>
                    {actionOptions.map(a => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>

                {/* Entity type */}
                <div className="relative">
                  <Layers size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <select className="form-select pl-8 text-xs w-full" value={filterEntity} onChange={e => setFilterEntity(e.target.value)}>
                    <option value="">All resources</option>
                    {entityOptions.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>

                {/* Date from */}
                <div className="relative">
                  <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input type="date" className="form-input pl-8 text-xs w-full" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
                </div>

                {/* Date to */}
                <div className="relative">
                  <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input type="date" className="form-input pl-8 text-xs w-full" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Results header */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                {auditLoading ? 'Loading…' : `${auditLogs.length} event${auditLogs.length !== 1 ? 's' : ''}${hasFilters ? ' matching filters' : ''}`}
              </p>
              <button onClick={() => refetchLogs()}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                <RefreshCw size={12} /> Refresh
              </button>
            </div>

            {/* Log list */}
            {auditLoading ? (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-5 py-4">
                    <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-gray-100 rounded animate-pulse w-48" />
                      <div className="h-3 bg-gray-100 rounded animate-pulse w-32" />
                    </div>
                    <div className="h-3 bg-gray-100 rounded animate-pulse w-24" />
                  </div>
                ))}
              </div>
            ) : auditLogs.length === 0 ? (
              <EmptyState
                title={hasFilters ? 'No events match your filters' : 'No audit events yet'}
                description={hasFilters ? 'Try adjusting or clearing the filters.' : 'Activity will appear here as your team uses the platform.'}
                action={hasFilters ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button> : undefined}
              />
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {auditLogs.map((log) => <LogRow key={log.id} log={log} />)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Invite Modal */}
      <Modal open={showInvite} onClose={() => { setShowInvite(false); reset(); setInviteError(''); setInviteSuccess(''); }} title="Invite User">
        <form onSubmit={handleSubmit(onInvite)} className="space-y-4">
          {inviteError && <Alert type="error" message={inviteError} />}
          {inviteSuccess && <Alert type="success" message={inviteSuccess} />}
          <div>
            <label className="form-label">Name *</label>
            <input className="form-input" placeholder="Full name" {...register('name', { required: 'Required' })} />
            {errors.name && <p className="form-error">{errors.name.message}</p>}
          </div>
          <div>
            <label className="form-label">Email *</label>
            <input type="email" className="form-input" placeholder="user@company.com" {...register('email', { required: 'Required' })} />
            {errors.email && <p className="form-error">{errors.email.message}</p>}
          </div>
          <div>
            <label className="form-label">Role *</label>
            <select className="form-select" {...register('role', { required: 'Required' })}>
              {['TENANT_ADMIN', 'DELIVERY_LEAD', 'TEAM_MEMBER', 'PMO', 'EXEC', 'CLIENT'].map((r) => (
                <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700 space-y-1">
            <p className="font-medium">What happens when you send this invitation:</p>
            <ol className="list-decimal list-inside space-y-1 text-blue-600 text-xs">
              <li>The user is added to your Catalyst org and receives a Zoho email invite.</li>
              <li>A branded Delivery Sync invitation email is sent with a sign-in link.</li>
              <li>When they sign in, their account is automatically activated.</li>
            </ol>
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setShowInvite(false)}>Cancel</Button>
            <Button type="submit" loading={isSubmitting} icon={<UserCheck size={16} />}>Send Invitation</Button>
          </ModalActions>
        </form>
      </Modal>
    </Layout>
  );
};

export default AdminPage;
