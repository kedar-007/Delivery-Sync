import React from 'react';
import { Trash2, RotateCcw, FolderOpen, GitBranch, AlertTriangle } from 'lucide-react';
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
import { projectsApi, sprintsApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface DeletedRow {
  id: string;
  name: string;
  status?: string;
  deletedAt?: string;
  deletedBy?: string;
}

function fmtDate(v?: string) {
  if (!v) return '—';
  try { return new Date(v).toLocaleString(); } catch { return v; }
}

export default function RecycleBinPage() {
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const toast = useToast();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN';

  const projects = useQuery({
    queryKey: ['recycle-bin', 'projects'],
    queryFn: () => projectsApi.recycleBin() as Promise<DeletedRow[]>,
    enabled: isAdmin,
  });
  const sprints = useQuery({
    queryKey: ['recycle-bin', 'sprints'],
    queryFn: () => sprintsApi.recycleBin() as Promise<DeletedRow[]>,
    enabled: isAdmin,
  });

  const restoreProject = useMutation({
    mutationFn: (id: string) => projectsApi.restore(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recycle-bin'] }); qc.invalidateQueries({ queryKey: ['projects'] }); toast.success('Project restored'); },
    onError: (e: Error) => toast.error(e.message || 'Restore failed'),
  });
  const purgeProject = useMutation({
    mutationFn: (id: string) => projectsApi.purge(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recycle-bin'] }); toast.success('Project permanently deleted'); },
    onError: (e: Error) => toast.error(e.message || 'Delete failed'),
  });
  const restoreSprint = useMutation({
    mutationFn: (id: string) => sprintsApi.restore(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recycle-bin'] }); qc.invalidateQueries({ queryKey: ['sprints'] }); toast.success('Sprint restored'); },
    onError: (e: Error) => toast.error(e.message || 'Restore failed'),
  });
  const purgeSprint = useMutation({
    mutationFn: (id: string) => sprintsApi.purge(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recycle-bin'] }); toast.success('Sprint permanently deleted'); },
    onError: (e: Error) => toast.error(e.message || 'Delete failed'),
  });

  const askPurge = async (label: string, fn: () => void) => {
    const ok = await confirm({
      title: 'Permanently delete?',
      message: `"${label}" will be permanently deleted. This cannot be undone.`,
      confirmText: 'Delete forever',
      variant: 'danger',
    });
    if (ok) fn();
  };

  if (!isAdmin) {
    return (
      <Layout>
        <Alert type="error" message="Recycle Bin is available to administrators only." className="m-6" />
      </Layout>
    );
  }

  if (projects.isLoading || sprints.isLoading) return <Layout><PageSkeleton /></Layout>;

  const projectRows = projects.data ?? [];
  const sprintRows = sprints.data ?? [];
  const empty = projectRows.length === 0 && sprintRows.length === 0;

  const Section = ({ title, icon, rows, onRestore, onPurge, restoring, purging }: {
    title: string;
    icon: React.ReactNode;
    rows: DeletedRow[];
    onRestore: (id: string) => void;
    onPurge: (row: DeletedRow) => void;
    restoring: boolean;
    purging: boolean;
  }) => (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 px-4 py-6 text-center">Nothing deleted.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">{r.name}</p>
                <p className="text-[11px] text-gray-400">Deleted {fmtDate(r.deletedAt)}</p>
              </div>
              <Button size="sm" variant="secondary" icon={<RotateCcw size={13} />} loading={restoring} onClick={() => onRestore(r.id)}>Restore</Button>
              <Button size="sm" variant="danger" icon={<Trash2 size={13} />} loading={purging} onClick={() => onPurge(r)}>Delete</Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );

  return (
    <Layout>
      <Header title="Recycle Bin" subtitle="Restore or permanently delete removed projects and sprint boards" />
      <div className="p-6 space-y-5">
        <Alert type="warning" message="Permanent deletion cannot be undone. Restored items return to the active workspace." />
        {empty ? (
          <EmptyState title="Recycle Bin is empty" description="Deleted projects and sprint boards will appear here." icon={<Trash2 size={32} className="text-gray-300" />} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Section
              title="Projects"
              icon={<FolderOpen size={16} className="text-indigo-500" />}
              rows={projectRows}
              onRestore={(id) => restoreProject.mutate(id)}
              onPurge={(r) => askPurge(r.name, () => purgeProject.mutate(r.id))}
              restoring={restoreProject.isPending}
              purging={purgeProject.isPending}
            />
            <Section
              title="Sprint Boards"
              icon={<GitBranch size={16} className="text-indigo-500" />}
              rows={sprintRows}
              onRestore={(id) => restoreSprint.mutate(id)}
              onPurge={(r) => askPurge(r.name, () => purgeSprint.mutate(r.id))}
              restoring={restoreSprint.isPending}
              purging={purgeSprint.isPending}
            />
          </div>
        )}
        {(projects.error || sprints.error) && (
          <Alert type="error" message={((projects.error || sprints.error) as Error).message} />
        )}
      </div>
    </Layout>
  );
}
