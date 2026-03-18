import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { Plus, CheckCircle, Lock } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import UserAvatar from '../components/ui/UserAvatar';
import { StatusBadge } from '../components/ui/Badge';
import Modal, { ModalActions } from '../components/ui/Modal';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import UserPicker from '../components/ui/UserPicker';
import { PageSkeleton } from '../components/ui/Skeleton';
import { useBlockers, useCreateBlocker, useResolveBlocker } from '../hooks/useBlockers';
import { useProjects } from '../hooks/useProjects';
import { useUsers } from '../hooks/useUsers';
import { useAuth } from '../contexts/AuthContext';
import { Blocker } from '../types';
import { canDo, PERMISSIONS } from '../utils/permissions';

interface BlockerForm {
  project_id: string; title: string; description: string; severity: string; owner_user_id: string;
}

interface ResolveForm { resolution: string; }

const BlockersPage = () => {
  const [searchParams] = useSearchParams();
  const preselectedProject = searchParams.get('projectId') || '';
  const [filterProject, setFilterProject] = useState(preselectedProject);
  const [filterStatus, setFilterStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [resolvingBlocker, setResolvingBlocker] = useState<Blocker | null>(null);
  const [viewingBlocker, setViewingBlocker] = useState<Blocker | null>(null);
  const [createError, setCreateError] = useState('');

  const params: Record<string, string> = {};
  if (filterProject) params.projectId = filterProject;
  if (filterStatus) params.status = filterStatus;

  const { user: currentUser } = useAuth();
  const canWrite = canDo(currentUser?.role, PERMISSIONS.BLOCKER_WRITE);
  const { data: blockers = [], isLoading } = useBlockers(params);
  const { data: projects = [] } = useProjects();
  const { data: users = [] } = useUsers();
  const createBlocker = useCreateBlocker();
  const resolveBlocker = useResolveBlocker();

  const createForm = useForm<BlockerForm>({ defaultValues: { project_id: preselectedProject, severity: 'MEDIUM', owner_user_id: currentUser?.id ?? '' } });
  const resolveForm = useForm<ResolveForm>();

  const onCreateSubmit = async (data: BlockerForm) => {
    try {
      setCreateError('');
      await createBlocker.mutateAsync(data);
      createForm.reset();
      setShowCreate(false);
    } catch (err: unknown) { setCreateError((err as Error).message); }
  };

  const onResolveSubmit = async (data: ResolveForm) => {
    if (!resolvingBlocker) return;
    try {
      await resolveBlocker.mutateAsync({ id: resolvingBlocker.id, resolution: data.resolution });
      resolveForm.reset();
      setResolvingBlocker(null);
    } catch (err: unknown) { setCreateError((err as Error).message); }
  };

  if (isLoading) return <Layout><PageSkeleton /></Layout>;

  const openBlockers = blockers.filter((b: Blocker) => b.status !== 'RESOLVED');
  const resolvedBlockers = blockers.filter((b: Blocker) => b.status === 'RESOLVED');

  return (
    <Layout>
      <Header title="Blockers"
        subtitle={`${openBlockers.length} open · ${resolvedBlockers.length} resolved`}
        actions={canWrite
          ? <Button onClick={() => setShowCreate(true)} icon={<Plus size={16} />}>New Blocker</Button>
          : <span className="flex items-center gap-1.5 text-sm text-gray-400"><Lock size={14} />No permission to raise blockers</span>}
      />
      <div className="p-6 space-y-5">

        <div className="flex flex-wrap gap-3">
          <select className="form-select w-auto" value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
            <option value="">All Projects</option>
            {projects.map((p: {id: string; name: string}) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="form-select w-auto" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {['OPEN', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {blockers.length === 0 ? (
          <EmptyState title="No blockers" description="No blockers at the moment."
            action={canWrite ? <Button onClick={() => setShowCreate(true)} icon={<Plus size={16} />}>Raise Blocker</Button> : undefined} />
        ) : (
          <div className="space-y-3">
            {blockers.map((b: Blocker) => (
              <Card key={b.id}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setViewingBlocker(b)}>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-sm font-semibold text-gray-900 hover:text-blue-600">{b.title}</h3>
                      <StatusBadge status={b.severity} />
                      <StatusBadge status={b.status} />
                      {b.ageDays !== undefined && b.status !== 'RESOLVED' && (
                        <span className="text-xs text-gray-400">Age: {b.ageDays}d</span>
                      )}
                    </div>
                    {b.description && <p className="text-sm text-gray-600 mt-1">{b.description}</p>}
                    {b.ownerUserId && (() => { const u = users.find(u => u.id === b.ownerUserId); return u ? (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size="xs" />
                        <span className="text-xs text-gray-500">{u.name}</span>
                      </div>
                    ) : null; })()}
                    {b.resolution && (
                      <div className="mt-2 p-2 bg-green-50 rounded text-xs text-green-700">
                        <strong>Resolution:</strong> {b.resolution}
                        {b.resolvedDate && <span className="ml-2 text-green-500">({b.resolvedDate})</span>}
                      </div>
                    )}
                  </div>
                  {b.status !== 'RESOLVED' && (
                    <Button variant="outline" size="sm" icon={<CheckCircle size={14} />}
                      onClick={() => setResolvingBlocker(b)}>
                      Resolve
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Detail View Modal */}
      <Modal open={!!viewingBlocker} onClose={() => setViewingBlocker(null)} title="Blocker Details">
        {viewingBlocker && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={viewingBlocker.severity} />
              <StatusBadge status={viewingBlocker.status} />
              {viewingBlocker.ageDays !== undefined && viewingBlocker.status !== 'RESOLVED' && (
                <span className="text-xs text-gray-400">Age: {viewingBlocker.ageDays}d</span>
              )}
            </div>
            {viewingBlocker.ownerUserId && (() => { const u = users.find(u => u.id === viewingBlocker.ownerUserId); return u ? (
              <div className="flex items-center gap-2">
                <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size="sm" />
                <div>
                  <p className="text-xs text-gray-500">Owner</p>
                  <p className="text-sm font-medium text-gray-800">{u.name}</p>
                </div>
              </div>
            ) : null; })()}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Description</p>
              <p className="text-sm text-gray-700">{viewingBlocker.description || '—'}</p>
            </div>
            {viewingBlocker.resolution && (
              <div className="p-3 bg-green-50 rounded-lg">
                <p className="text-xs font-medium text-green-700 mb-1">Resolution</p>
                <p className="text-sm text-green-800">{viewingBlocker.resolution}</p>
                {viewingBlocker.resolvedDate && <p className="text-xs text-green-500 mt-1">{viewingBlocker.resolvedDate}</p>}
              </div>
            )}
            {viewingBlocker.status !== 'RESOLVED' && (
              <div className="flex justify-end pt-2">
                <Button icon={<CheckCircle size={14} />} onClick={() => { setResolvingBlocker(viewingBlocker); setViewingBlocker(null); }}>
                  Resolve
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Create Blocker Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); createForm.reset(); setCreateError(''); }} title="Raise Blocker" size="lg">
        <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
          {createError && <Alert type="error" message={createError} />}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Project *</label>
              <select className="form-select" {...createForm.register('project_id', { required: 'Required' })}>
                <option value="">Select…</option>
                {projects.map((p: {id: string; name: string}) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Severity</label>
              <select className="form-select" {...createForm.register('severity')}>
                {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="form-label">Blocker Title *</label>
            <input className="form-input" placeholder="What is blocked?" {...createForm.register('title', { required: 'Required' })} />
          </div>
          <div>
            <label className="form-label">Description</label>
            <textarea className="form-textarea" rows={3} placeholder="Provide context and impact…" {...createForm.register('description')} />
          </div>
          <div>
            <label className="form-label">Owner *</label>
            <Controller
              name="owner_user_id"
              control={createForm.control}
              rules={{ required: 'Required' }}
              render={({ field }) => (
                <UserPicker
                  users={users}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Assign to…"
                />
              )}
            />
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" loading={createForm.formState.isSubmitting} variant="danger">Raise Blocker</Button>
          </ModalActions>
        </form>
      </Modal>

      {/* Resolve Modal */}
      <Modal open={!!resolvingBlocker} onClose={() => setResolvingBlocker(null)} title="Resolve Blocker">
        <p className="text-sm text-gray-600 mb-4 font-medium">{resolvingBlocker?.title}</p>
        <form onSubmit={resolveForm.handleSubmit(onResolveSubmit)} className="space-y-4">
          <div>
            <label className="form-label">Resolution *</label>
            <textarea className="form-textarea" rows={3} placeholder="How was this resolved?"
              {...resolveForm.register('resolution', { required: 'Required' })} />
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setResolvingBlocker(null)}>Cancel</Button>
            <Button type="submit" loading={resolveForm.formState.isSubmitting} variant="primary">Mark Resolved</Button>
          </ModalActions>
        </form>
      </Modal>
    </Layout>
  );
};

export default BlockersPage;
