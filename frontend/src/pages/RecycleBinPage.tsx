import React, { useState } from 'react';
import { Trash2, RotateCcw, Search, User as UserIcon } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import { PageSkeleton } from '../components/ui/Skeleton';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { useToast } from '../components/ui/Toast';
import { adminApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission, PERMISSIONS } from '../utils/permissions';

interface TrashItem {
  id: string;
  module: string;
  moduleLabel: string;
  name: string;
  subLabel?: string;
  projectId?: string | null;
  projectName?: string | null;
  deletedAt?: string;
  deletedById?: string | null;
  deletedByName?: string;
  deletedByEmail?: string;
}

interface TrashResponse {
  items: TrashItem[];
  total: number;
  page: number;
  pageSize: number;
  modules: { key: string; label: string }[];
}

const PAGE_SIZE = 50;

function fmtDate(v?: string) {
  if (!v) return '—';
  try { return new Date(v.replace(' ', 'T')).toLocaleString(); } catch { return v; }
}

export default function RecycleBinPage() {
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const toast = useToast();
  const qc = useQueryClient();

  const canView    = hasPermission(user, PERMISSIONS.ADMIN_TRASH_VIEW) || hasPermission(user, PERMISSIONS.ADMIN_USERS);
  const canRestore = hasPermission(user, PERMISSIONS.ADMIN_TRASH_RESTORE) || hasPermission(user, PERMISSIONS.ADMIN_USERS);
  const canPurge   = hasPermission(user, PERMISSIONS.ADMIN_TRASH_PURGE)   || hasPermission(user, PERMISSIONS.ADMIN_USERS);

  const [module, setModule] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const params: Record<string, string> = { page: String(page), pageSize: String(PAGE_SIZE) };
  if (module) params.module = module;
  if (q.trim()) params.q = q.trim();

  const trash = useQuery({
    queryKey: ['admin', 'trash', module, q.trim(), page],
    queryFn: () => adminApi.getTrash(params) as Promise<TrashResponse>,
    enabled: canView,
  });

  // Optimistically drop a row from every cached Trash page so it vanishes
  // instantly, without waiting for a refetch round-trip.
  const dropFromCache = (i: TrashItem) => {
    qc.setQueriesData<TrashResponse>({ queryKey: ['admin', 'trash'] }, (old) => {
      if (!old?.items) return old;
      const items = old.items.filter((x) => !(x.module === i.module && x.id === i.id));
      if (items.length === old.items.length) return old;
      return { ...old, items, total: Math.max(0, old.total - 1) };
    });
  };

  // Source-module query keys to refresh when a record returns to the workspace.
  const MODULE_KEYS: Record<string, string[][]> = {
    task: [['tasks'], ['sprints']], task_comment: [['tasks']],
    sprint: [['sprints']], project: [['projects']],
    action: [['actions']], decision: [['decisions']],
  };

  const restore = useMutation({
    mutationFn: (i: TrashItem) => adminApi.restoreTrash(i.module, i.id),
    onSuccess: (_d, i) => {
      dropFromCache(i);
      (MODULE_KEYS[i.module] || []).forEach((k) => qc.invalidateQueries({ queryKey: k }));
      toast.success('Restored');
    },
    onError: (e: Error) => { qc.invalidateQueries({ queryKey: ['admin', 'trash'] }); toast.error(e.message || 'Restore failed'); },
  });
  const purge = useMutation({
    mutationFn: (i: TrashItem) => adminApi.purgeTrash(i.module, i.id),
    onSuccess: (_d, i) => { dropFromCache(i); toast.success('Permanently deleted'); },
    onError: (e: Error) => { qc.invalidateQueries({ queryKey: ['admin', 'trash'] }); toast.error(e.message || 'Delete failed'); },
  });

  const askPurge = async (i: TrashItem) => {
    const ok = await confirm({
      title: 'Permanently delete?',
      message: `"${i.name}" (${i.moduleLabel}) will be permanently deleted. This cannot be undone.`,
      confirmText: 'Delete forever',
      variant: 'danger',
    });
    if (ok) purge.mutate(i);
  };

  if (!canView) {
    return (
      <Layout>
        <Alert type="error" message="The Trash is available to administrators only." className="m-6" />
      </Layout>
    );
  }

  const data = trash.data;
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const modules = data?.modules ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Layout>
      <Header title="Trash" subtitle="Soft-deleted records across every module — restore or permanently remove" />
      <div className="p-6 space-y-5">
        <Alert type="warning" message="Permanent deletion cannot be undone. Restored items return to the active workspace." />

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder="Search by name…"
              className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <select
            value={module}
            onChange={(e) => { setModule(e.target.value); setPage(1); }}
            className="py-2 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="">All modules</option>
            {modules.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <span className="text-xs text-gray-500">{total} item{total === 1 ? '' : 's'}</span>
        </div>

        {trash.isLoading ? (
          <PageSkeleton />
        ) : items.length === 0 ? (
          <EmptyState title="Trash is empty" description="Deleted records will appear here with who removed them." icon={<Trash2 size={32} className="text-gray-300" />} />
        ) : (
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <th className="px-4 py-2.5 font-semibold">Module</th>
                    <th className="px-4 py-2.5 font-semibold">Name</th>
                    <th className="px-4 py-2.5 font-semibold">Deleted by</th>
                    <th className="px-4 py-2.5 font-semibold">Deleted at</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map((i) => (
                    <tr key={`${i.module}:${i.id}`} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{i.moduleLabel}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800 truncate max-w-md">{i.name}</p>
                        {(i.subLabel || i.projectName) && (
                          <p className="text-[11px] text-gray-400 truncate max-w-md">
                            {[i.projectName, i.subLabel].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-gray-600">
                          <UserIcon size={12} className="text-gray-400" />
                          {i.deletedByName || 'Unknown'}
                        </span>
                        {i.deletedByEmail && <p className="text-[11px] text-gray-400">{i.deletedByEmail}</p>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500 text-xs">{fmtDate(i.deletedAt)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <div className="inline-flex gap-2">
                          {canRestore && (
                            <Button size="sm" variant="secondary" icon={<RotateCcw size={13} />}
                              loading={restore.isPending && restore.variables?.id === i.id}
                              onClick={() => restore.mutate(i)}>Restore</Button>
                          )}
                          {canPurge && (
                            <Button size="sm" variant="danger" icon={<Trash2 size={13} />}
                              loading={purge.isPending && purge.variables?.id === i.id}
                              onClick={() => askPurge(i)}>Delete</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
            <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        )}

        {trash.error && <Alert type="error" message={(trash.error as Error).message} />}
      </div>
    </Layout>
  );
}
