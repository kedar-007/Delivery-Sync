import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
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
import { useBlockers, useCreateBlocker, useResolveBlocker, useUpdateBlocker } from '../hooks/useBlockers';
import { useProjects } from '../hooks/useProjects';
import { useUsers } from '../hooks/useUsers';
import { useAuth } from '../contexts/AuthContext';
import { Blocker } from '../types';
import { canDo, PERMISSIONS } from '../utils/permissions';

interface BlockerForm {
  project_id: string;
  title: string;
  description: string;
  severity: string;
  owner_user_id: string;
}

interface ResolveForm {
  resolution: string;
}

interface RenameForm {
  title: string;
}

const BlockersPage = () => {
  const [searchParams] = useSearchParams();
  const preselectedProject = searchParams.get('projectId') || '';
  const [filterProject, setFilterProject] = useState(preselectedProject);
  const [filterStatus, setFilterStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [resolvingBlocker, setResolvingBlocker] = useState<Blocker | null>(null);
  const [viewingBlocker, setViewingBlocker] = useState<Blocker | null>(null);
  const [createError, setCreateError] = useState('');

  const [renamingBlocker, setRenamingBlocker] = useState<Blocker | null>(null);
  const [renameError, setRenameError] = useState('');

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

  // ✅ No ID at hook level anymore
  const updateBlocker = useUpdateBlocker();

  const createForm = useForm<BlockerForm>({
    defaultValues: {
      project_id: preselectedProject,
      severity: 'MEDIUM',
      owner_user_id: currentUser?.id ?? '',
    },
  });
  const resolveForm = useForm<ResolveForm>();

  const {
    register: registerRename,
    handleSubmit: handleRenameSubmit,
    reset: resetRename,
    formState: { errors: renameErrors, isSubmitting: isRenaming },
  } = useForm<RenameForm>();

  const onCreateSubmit = async (data: BlockerForm) => {
    try {
      setCreateError('');
      await createBlocker.mutateAsync(data);
      createForm.reset();
      setShowCreate(false);
    } catch (err: unknown) {
      setCreateError((err as Error).message);
    }
  };

  const onResolveSubmit = async (data: ResolveForm) => {
    if (!resolvingBlocker) return;
    try {
      await resolveBlocker.mutateAsync({ id: resolvingBlocker.id, resolution: data.resolution });
      resolveForm.reset();
      setResolvingBlocker(null);
    } catch (err: unknown) {
      setCreateError((err as Error).message);
    }
  };

  const openRename = (e: React.MouseEvent, blocker: Blocker) => {
    e.stopPropagation();
    setRenamingBlocker(blocker);
    resetRename({ title: blocker.title });
    setRenameError('');
  };

  // ✅ ID passed inside mutateAsync payload
  const onRename = async (data: RenameForm) => {
    if (!renamingBlocker) return;
    try {
      setRenameError('');
      await updateBlocker.mutateAsync({ id: renamingBlocker.id, data: { title: data.title } });
      setRenamingBlocker(null);
      resetRename();
    } catch (err: unknown) {
      setRenameError((err as Error).message);
    }
  };

  if (isLoading) return <Layout><PageSkeleton /></Layout>;

  const openBlockers = blockers.filter((b: Blocker) => b.status !== 'RESOLVED');
  const resolvedBlockers = blockers.filter((b: Blocker) => b.status === 'RESOLVED');

  return (
    <Layout>
      <Header
        title="Blockers"
        subtitle={`${openBlockers.length} open · ${resolvedBlockers.length} resolved`}
        actions={
          canWrite ? (
            <Button onClick={() => setShowCreate(true)}>New Blocker</Button>
          ) : (
            <span className="text-sm text-gray-400">No permission to raise blockers</span>
          )
        }
      />

      <div className="p-6 space-y-5">

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <select
            className="form-select w-auto"
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
          >
            <option value="">All Projects</option>
            {projects.map((p: { id: string; name: string }) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            className="form-select w-auto"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">All Statuses</option>
            {['OPEN', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        {blockers.length === 0 ? (
          <EmptyState
            title="No blockers"
            description="No blockers at the moment."
            action={
              canWrite ? (
                <Button onClick={() => setShowCreate(true)}>Raise Blocker</Button>
              ) : undefined
            }
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Title</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Severity</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Owner</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Age</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {blockers.map((b: Blocker) => {
                    const owner = users.find((u: { id: string }) => u.id === b.ownerUserId);
                    return (
                      <tr
                        key={b.id}
                        className="hover:bg-gray-50 transition-colors cursor-pointer group"
                        onClick={() => setViewingBlocker(b)}
                      >
                        {/* Title + rename button */}
                        <td className="px-4 py-3 max-w-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 truncate hover:text-blue-600">
                              {b.title}
                            </span>
                            {canWrite && (
                              <button
                                type="button"
                                onClick={(e) => openRename(e, b)}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex-shrink-0 text-xs"
                                title="Rename blocker"
                              >
                                ✎
                              </button>
                            )}
                          </div>
                          {b.description && (
                            <p className="text-xs text-gray-400 truncate mt-0.5 max-w-[240px]">
                              {b.description}
                            </p>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <StatusBadge status={b.severity} />
                        </td>

                        <td className="px-4 py-3">
                          <StatusBadge status={b.status} />
                        </td>

                        <td className="px-4 py-3">
                          {owner ? (
                            <div className="flex items-center gap-1.5">
                              <UserAvatar name={owner.name} avatarUrl={owner.avatarUrl} size="xs" />
                              <span className="text-xs text-gray-600">{owner.name}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {b.ageDays !== undefined && b.status !== 'RESOLVED' ? (
                            <span className="text-xs text-gray-500">{b.ageDays}d</span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right">
                          {b.status !== 'RESOLVED' && canWrite && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); setResolvingBlocker(b); }}
                            >
                              Resolve
                            </Button>
                          )}
                          {b.resolution && (
                            <span className="text-xs text-green-600 font-medium">Resolved</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* Detail Modal */}
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
            {viewingBlocker.ownerUserId && (() => {
              const u = users.find((u: { id: string }) => u.id === viewingBlocker.ownerUserId);
              return u ? (
                <div className="flex items-center gap-2">
                  <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size="sm" />
                  <div>
                    <p className="text-xs text-gray-500">Owner</p>
                    <p className="text-sm font-medium text-gray-800">{u.name}</p>
                  </div>
                </div>
              ) : null;
            })()}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Description</p>
              <p className="text-sm text-gray-700">{viewingBlocker.description || '—'}</p>
            </div>
            {viewingBlocker.resolution && (
              <div className="p-3 bg-green-50 rounded-lg">
                <p className="text-xs font-medium text-green-700 mb-1">Resolution</p>
                <p className="text-sm text-green-800">{viewingBlocker.resolution}</p>
                {viewingBlocker.resolvedDate && (
                  <p className="text-xs text-green-500 mt-1">{viewingBlocker.resolvedDate}</p>
                )}
              </div>
            )}
            {viewingBlocker.status !== 'RESOLVED' && (
              <div className="flex justify-end pt-2">
                <Button onClick={() => { setResolvingBlocker(viewingBlocker); setViewingBlocker(null); }}>
                  Resolve
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Create Modal */}
      <Modal
        open={showCreate}
        onClose={() => { setShowCreate(false); createForm.reset(); setCreateError(''); }}
        title="Raise Blocker"
        size="lg"
      >
        <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
          {createError && <Alert type="error" message={createError} />}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Project *</label>
              <select className="form-select" {...createForm.register('project_id', { required: 'Required' })}>
                <option value="">Select…</option>
                {projects.map((p: { id: string; name: string }) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Severity</label>
              <select className="form-select" {...createForm.register('severity')}>
                {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="form-label">Blocker Title *</label>
            <input
              className="form-input"
              placeholder="What is blocked?"
              {...createForm.register('title', { required: 'Required' })}
            />
          </div>
          <div>
            <label className="form-label">Description</label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="Provide context and impact…"
              {...createForm.register('description')}
            />
          </div>
          <div>
            <label className="form-label">Owner *</label>
            <Controller
              name="owner_user_id"
              control={createForm.control}
              rules={{ required: 'Required' }}
              render={({ field }) => (
                <UserPicker users={users} value={field.value} onChange={field.onChange} placeholder="Assign to…" />
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
      <Modal
        open={!!resolvingBlocker}
        onClose={() => setResolvingBlocker(null)}
        title="Resolve Blocker"
      >
        <p className="text-sm text-gray-600 mb-4 font-medium">{resolvingBlocker?.title}</p>
        <form onSubmit={resolveForm.handleSubmit(onResolveSubmit)} className="space-y-4">
          <div>
            <label className="form-label">Resolution *</label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="How was this resolved?"
              {...resolveForm.register('resolution', { required: 'Required' })}
            />
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setResolvingBlocker(null)}>Cancel</Button>
            <Button type="submit" loading={resolveForm.formState.isSubmitting} variant="primary">Mark Resolved</Button>
          </ModalActions>
        </form>
      </Modal>

      {/* Rename Modal */}
      <Modal
        open={!!renamingBlocker}
        onClose={() => { setRenamingBlocker(null); resetRename(); setRenameError(''); }}
        title="Rename Blocker"
        size="sm"
      >
        <form onSubmit={handleRenameSubmit(onRename)} className="space-y-4">
          {renameError && <Alert type="error" message={renameError} />}
          <div>
            <label className="form-label">Blocker Title *</label>
            <input
              className="form-input"
              autoFocus
              {...registerRename('title', {
                required: 'Required',
                validate: (v) => v.trim().length > 0 || 'Title cannot be blank',
              })}
            />
            {renameErrors.title && (
              <p className="form-error">{renameErrors.title.message}</p>
            )}
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => { setRenamingBlocker(null); resetRename(); }}>
              Cancel
            </Button>
            <Button type="submit" loading={isRenaming}>Save</Button>
          </ModalActions>
        </form>
      </Modal>

    </Layout>
  );
};

export default BlockersPage;