import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { Plus, Lock } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import UserAvatar from '../components/ui/UserAvatar';
import { StatusBadge } from '../components/ui/Badge';
import Modal, { ModalActions } from '../components/ui/Modal';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import { PageSkeleton } from '../components/ui/Skeleton';
import UserPicker from '../components/ui/UserPicker';
import { useActionsPaginated, useCreateAction, useUpdateAction } from '../hooks/useActions';
import Pagination from '../components/ui/Pagination';
import { useProjects } from '../hooks/useProjects';
import { useUsers } from '../hooks/useUsers';
import { useAuth } from '../contexts/AuthContext';
import { Action } from '../types';
import { canDo, PERMISSIONS } from '../utils/permissions';
import { useI18n } from '../contexts/I18nContext';

interface ActionForm {
  project_id: string;
  title: string;
  description: string;
  owner_user_id: string;
  due_date: string;
  priority: string;
  status?: string;
}

const ActionsPage = () => {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const preselectedProject = searchParams.get('projectId') || '';
  const [filterProject, setFilterProject] = useState(preselectedProject);
  const [filterStatus, setFilterStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingAction, setEditingAction] = useState<Action | null>(null);
  const [viewingAction, setViewingAction] = useState<Action | null>(null);
  const [createError, setCreateError] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const params: Record<string, string | number> = { page, pageSize: PAGE_SIZE };
  if (filterProject) params.projectId = filterProject;
  if (filterStatus) params.status = filterStatus;

  const { user: currentUser } = useAuth();
  const canWrite = canDo(currentUser?.role, PERMISSIONS.ACTION_WRITE);
  const { data: pagedData, isLoading } = useActionsPaginated(params);
  const actions: Action[] = pagedData?.actions ?? [];
  const total: number = pagedData?.total ?? 0;
  const totalPages: number = pagedData?.totalPages ?? 1;
  const { data: projects = [] } = useProjects();
  const { data: users = [] } = useUsers();
  const createAction = useCreateAction();
  const updateAction = useUpdateAction(editingAction?.id ?? '');

  const { register, handleSubmit, reset, setValue, control, formState: { errors, isSubmitting } } = useForm<ActionForm>({
    defaultValues: { project_id: preselectedProject, priority: 'MEDIUM', owner_user_id: currentUser?.id ?? '' },
  });

  const openEdit = (a: Action) => {
    setEditingAction(a);
    setValue('project_id', a.projectId);
    setValue('title', a.title);
    setValue('description', a.description || '');
    setValue('owner_user_id', a.ownerUserId);
    setValue('due_date', a.dueDate);
    setValue('priority', a.priority);
    setValue('status', a.status);
    setShowCreate(true);
  };

  const onSubmit = async (data: ActionForm) => {
    try {
      setCreateError('');
      if (editingAction) {
        await updateAction.mutateAsync(data);
      } else {
        await createAction.mutateAsync(data);
      }
      reset();
      setShowCreate(false);
      setEditingAction(null);
    } catch (err: unknown) {
      setCreateError((err as Error).message);
    }
  };

  if (isLoading) return <Layout><PageSkeleton /></Layout>;

  return (
    <Layout>
      <Header title={t('nav.actions')} subtitle={`${total} action${total !== 1 ? 's' : ''}`}
        actions={canWrite
          ? <Button onClick={() => { setEditingAction(null); reset({ project_id: preselectedProject, priority: 'MEDIUM' }); setShowCreate(true); }} icon={<Plus size={16} />}>{t('actions.new')}</Button>
          : <span className="flex items-center gap-1.5 text-sm text-gray-400"><Lock size={14} />{t('errors.forbidden')}</span>}
      />
      <div className="p-6 space-y-5">

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <select className="form-select w-auto" value={filterProject} onChange={(e) => { setFilterProject(e.target.value); setPage(1); }}>
            <option value="">{t('common.all')} {t('nav.projects')}</option>
            {projects.map((p: {id: string; name: string}) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="form-select w-auto" value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}>
            <option value="">{t('common.all')} {t('common.status')}</option>
            {['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {actions.length === 0 ? (
          <EmptyState title={t('actions.noActions')} description={t('actions.noActionsDesc')}
            action={canWrite ? <Button onClick={() => setShowCreate(true)} icon={<Plus size={16} />}>{t('actions.new')}</Button> : undefined} />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {[t('common.actions'), t('nav.projects'), t('actions.modal.owner'), t('common.dueDate'), t('common.priority'), t('common.status'), ''].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {actions.map((a: Action) => (
                  <tr key={a.id} className={`hover:bg-gray-50 ${a.isOverdue ? 'bg-red-50/30' : ''}`}>
                    <td className="px-4 py-3 cursor-pointer" onClick={() => setViewingAction(a)}>
                      <p className="text-sm font-medium text-gray-900 max-w-xs truncate hover:text-blue-600">{a.title}</p>
                      {a.isOverdue && <span className="text-xs text-red-500">{t('actions.status.overdue')}</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {projects.find((p: {id: string; name: string}) => p.id === a.projectId)?.name ?? a.projectId}
                    </td>
                    <td className="px-4 py-3">
                      {(() => { const u = users.find(u => u.id === a.ownerUserId); return u ? (
                        <div className="flex items-center gap-2">
                          <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size="xs" />
                          <span className="text-sm text-gray-700">{u.name}</span>
                        </div>
                      ) : <span className="text-sm text-gray-500">{a.ownerUserId}</span>; })()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{a.dueDate}</td>
                    <td className="px-4 py-3"><StatusBadge status={a.priority} /></td>
                    <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                    <td className="px-4 py-3">
                      <button onClick={() => openEdit(a)} className="text-xs text-blue-600 hover:underline">{t('common.edit')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>

      {/* Detail View Modal */}
      <Modal open={!!viewingAction} onClose={() => setViewingAction(null)} title={t('actions.viewDetail')}>
        {viewingAction && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={viewingAction.priority} />
              <StatusBadge status={viewingAction.status} />
              {viewingAction.isOverdue && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{t('actions.status.overdue')}</span>}
            </div>
            {viewingAction.description && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{t('common.description')}</p>
                <p className="text-sm text-gray-700">{viewingAction.description}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{t('common.dueDate')}</p>
                <p className="text-gray-700">{viewingAction.dueDate || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{t('actions.modal.owner')}</p>
                {(() => { const u = users.find(u => u.id === viewingAction.ownerUserId); return u ? (
                  <div className="flex items-center gap-2">
                    <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size="xs" />
                    <span className="text-sm text-gray-700">{u.name}</span>
                  </div>
                ) : <p className="text-gray-700">{viewingAction.ownerUserId}</p>; })()}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{t('actions.modal.project')}</p>
                <p className="text-gray-700">{projects.find((p: {id: string; name: string}) => p.id === viewingAction.projectId)?.name ?? viewingAction.projectId}</p>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => { openEdit(viewingAction); setViewingAction(null); }}>{t('common.edit')}</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setEditingAction(null); reset(); setCreateError(''); }}
        title={editingAction ? t('actions.modal.editTitle') : t('actions.modal.createTitle')} size="lg">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {createError && <Alert type="error" message={createError} />}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">{t('actions.modal.project')}</label>
              <select className="form-select" {...register('project_id', { required: t('validation.required') })}>
                <option value="">{t('common.searchPlaceholder')}</option>
                {projects.map((p: {id: string; name: string}) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {errors.project_id && <p className="form-error">{errors.project_id.message}</p>}
            </div>
            <div>
              <label className="form-label">{t('actions.modal.priority')}</label>
              <select className="form-select" {...register('priority')}>
                {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="form-label">{t('actions.modal.titleLabel')}</label>
            <input className="form-input" placeholder="What needs to be done?" {...register('title', { required: t('validation.required') })} />
            {errors.title && <p className="form-error">{errors.title.message}</p>}
          </div>
          <div>
            <label className="form-label">{t('actions.modal.descLabel')}</label>
            <textarea className="form-textarea" rows={2} {...register('description')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">{t('actions.modal.owner')}</label>
              <Controller
                name="owner_user_id"
                control={control}
                rules={{ required: t('validation.required') }}
                render={({ field }) => (
                  <UserPicker
                    users={users}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Assign to…"
                  />
                )}
              />
              {errors.owner_user_id && <p className="form-error">{errors.owner_user_id.message}</p>}
            </div>
            <div>
              <label className="form-label">{t('actions.modal.dueDate')}</label>
              <input type="date" className="form-input" {...register('due_date', { required: t('validation.required') })} />
              {errors.due_date && <p className="form-error">{errors.due_date.message}</p>}
            </div>
          </div>
          {editingAction && (
            <div>
              <label className="form-label">{t('actions.modal.status')}</label>
              <select className="form-select" {...register('status')}>
                {['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setShowCreate(false)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={isSubmitting}>{editingAction ? t('actions.modal.save') : t('actions.modal.create')}</Button>
          </ModalActions>
        </form>
      </Modal>
    </Layout>
  );
};

export default ActionsPage;
