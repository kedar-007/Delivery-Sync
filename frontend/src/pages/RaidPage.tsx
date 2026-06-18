import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { Plus, Lock, Pencil } from 'lucide-react'; // ✅ Added Pencil
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import { useI18n } from '../contexts/I18nContext';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';
import Modal, { ModalActions } from '../components/ui/Modal';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/Spinner';
import UserPicker from '../components/ui/UserPicker';
import {
  useRisks, useCreateRisk, useUpdateRisk,
  useIssues, useCreateIssue, useUpdateIssue,
  useDependencies, useCreateDependency, useUpdateDependency,
  useAssumptions, useCreateAssumption, useUpdateAssumption,
} from '../hooks/useRaid'; // ✅ Added update hooks
import { useProjects } from '../hooks/useProjects';
import { useUsers } from '../hooks/useUsers';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission, PERMISSIONS } from '../utils/permissions';

type Tab = 'risks' | 'issues' | 'dependencies' | 'assumptions';

const RaidPage = () => {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const preselectedProject = searchParams.get('projectId') || '';
  const [tab, setTab] = useState<Tab>('risks');
  const [filterProject, setFilterProject] = useState(preselectedProject);
  const [showCreate, setShowCreate] = useState(false);
  const [viewingItem, setViewingItem] = useState<any | null>(null);
  const [createError, setCreateError] = useState('');

  // ✅ Rename state
  const [renamingItem, setRenamingItem] = useState<{ id: string; title: string } | null>(null);
  const [renameError, setRenameError] = useState('');

  const { user: currentUser } = useAuth();
  const canWrite = hasPermission(currentUser, PERMISSIONS.RAID_WRITE);
  const { data: projects = [] } = useProjects();
  const { data: users = [] } = useUsers();
  const params: Record<string, string> = {};
  if (filterProject) params.projectId = filterProject;

  const { data: risks = [], isLoading: risksLoading } = useRisks(params);
  const { data: issues = [], isLoading: issuesLoading } = useIssues(params);
  const { data: deps = [], isLoading: depsLoading } = useDependencies(params);
  const { data: assumptions = [], isLoading: assumptionsLoading } = useAssumptions(params);

  const createRisk = useCreateRisk();
  const createIssue = useCreateIssue();
  const createDep = useCreateDependency();
  const createAssumption = useCreateAssumption();

  // ✅ Update hooks — same pattern as useUpdateProject(id)
  const updateRisk = useUpdateRisk(renamingItem?.id ?? '');
  const updateIssue = useUpdateIssue(renamingItem?.id ?? '');
  const updateDep = useUpdateDependency(renamingItem?.id ?? '');
  const updateAssumption = useUpdateAssumption(renamingItem?.id ?? '');

  const { register, handleSubmit, reset, control, formState: { errors, isSubmitting } } = useForm<Record<string, string>>({
    defaultValues: { project_id: preselectedProject, owner_user_id: '' },
    shouldUnregister: true,
  });

  // ✅ Rename form
  const {
    register: registerRename,
    handleSubmit: handleRenameSubmit,
    reset: resetRename,
    formState: { errors: renameErrors, isSubmitting: isRenaming },
  } = useForm<{ title: string }>();

  useEffect(() => {
    if (showCreate) {
      reset({
        project_id: filterProject || preselectedProject || '',
        owner_user_id: currentUser?.id ?? '',
        severity: 'MEDIUM',
        probability: 'MEDIUM',
        impact: 'MEDIUM',
        dependency_type: 'INTERNAL',
      });
    }
  }, [showCreate]); // eslint-disable-line react-hooks/exhaustive-deps

  const isLoading = risksLoading || issuesLoading || depsLoading || assumptionsLoading;

  const onSubmit = async (data: any) => {
    try {
      setCreateError('');
      if (tab === 'risks') await createRisk.mutateAsync(data);
      else if (tab === 'issues') await createIssue.mutateAsync(data);
      else if (tab === 'dependencies') await createDep.mutateAsync(data);
      else await createAssumption.mutateAsync(data);
      reset({ project_id: filterProject, owner_user_id: currentUser?.id ?? '' });
      setShowCreate(false);
    } catch (err: unknown) { setCreateError((err as Error).message); }
  };

  // ✅ Open rename — stops row click from firing detail modal
  const openRename = (e: React.MouseEvent, item: { id: string; title: string }) => {
    e.stopPropagation();
    setRenamingItem(item);
    resetRename({ title: item.title });
    setRenameError('');
  };

  // ✅ Submit rename — picks the correct update hook based on active tab
  const onRename = async (data: { title: string }) => {
    if (!renamingItem) return;
    try {
      setRenameError('');
      if (tab === 'risks') await updateRisk.mutateAsync({ title: data.title });
      else if (tab === 'issues') await updateIssue.mutateAsync({ title: data.title });
      else if (tab === 'dependencies') await updateDep.mutateAsync({ title: data.title });
      else await updateAssumption.mutateAsync({ title: data.title });
      setRenamingItem(null);
      resetRename();
    } catch (err: unknown) {
      setRenameError((err as Error).message);
    }
  };

  const TABS = [
    { key: 'risks', label: t('raid.types.risk') + 's', count: risks.length },
    { key: 'issues', label: t('raid.types.issue') + 's', count: issues.length },
    { key: 'dependencies', label: t('raid.types.dependency').replace(/y$/, 'ies'), count: deps.length },
    { key: 'assumptions', label: t('raid.types.assumption') + 's', count: assumptions.length },
  ] as const;

  if (isLoading) return <Layout><PageLoader /></Layout>;

  const currentData = tab === 'risks' ? risks : tab === 'issues' ? issues : tab === 'dependencies' ? deps : assumptions;

  // ✅ Table columns differ per tab
  const renderTableHead = () => {
    if (tab === 'risks') return (
      <tr className="border-b border-gray-100 bg-gray-50">
        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('common.title')}</th>
        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('raid.modal.probability')}</th>
        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('raid.modal.impact')}</th>
        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('common.status')}</th>
        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('raid.modal.owner')}</th>
      </tr>
    );
    if (tab === 'issues') return (
      <tr className="border-b border-gray-100 bg-gray-50">
        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('common.title')}</th>
        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('bugs.modal.severity')}</th>
        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('common.status')}</th>
        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('raid.modal.owner')}</th>
      </tr>
    );
    if (tab === 'dependencies') return (
      <tr className="border-b border-gray-100 bg-gray-50">
        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('common.title')}</th>
        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('common.type')}</th>
        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('raid.modal.itemType')}</th>
        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('common.dueDate')}</th>
        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('common.status')}</th>
      </tr>
    );
    // assumptions
    return (
      <tr className="border-b border-gray-100 bg-gray-50">
        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('common.title')}</th>
        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('common.status')}</th>
        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('raid.modal.impact')}</th>
        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('raid.modal.owner')}</th>
      </tr>
    );
  };

  const renderTableRow = (item: any) => {
    const owner = users.find((u: { id: string }) => u.id === item.ownerUserId);
    const titleCell = (
      <td className="px-4 py-3 max-w-xs">
        <div className="flex items-center gap-2 group/title">
          <span
            className="font-medium text-gray-900 truncate hover:text-blue-600 cursor-pointer"
            onClick={() => setViewingItem(item)}
          >
            {item.title}
          </span>
          {canWrite && (
            <button
              type="button"
              onClick={(e) => openRename(e, { id: item.id, title: item.title })}
              className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex-shrink-0"
              title={t('common.rename')}
            >
              <Pencil size={12} />
            </button>
          )}
        </div>
        {item.description && (
          <p className="text-xs text-gray-400 truncate mt-0.5 max-w-[220px]">{item.description}</p>
        )}
      </td>
    );

    if (tab === 'risks') return (
      <tr key={item.id} className="hover:bg-gray-50 transition-colors group cursor-pointer" onClick={() => setViewingItem(item)}>
        {titleCell}
        <td className="px-4 py-3"><StatusBadge status={item.probability} /></td>
        <td className="px-4 py-3"><StatusBadge status={item.impact} /></td>
        <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
        <td className="px-4 py-3">
          <span className="text-xs text-gray-600">{owner?.name ?? '—'}</span>
        </td>
      </tr>
    );

    if (tab === 'issues') return (
      <tr key={item.id} className="hover:bg-gray-50 transition-colors group cursor-pointer" onClick={() => setViewingItem(item)}>
        {titleCell}
        <td className="px-4 py-3"><StatusBadge status={item.severity} /></td>
        <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
        <td className="px-4 py-3">
          <span className="text-xs text-gray-600">{owner?.name ?? '—'}</span>
        </td>
      </tr>
    );

    if (tab === 'dependencies') return (
      <tr key={item.id} className="hover:bg-gray-50 transition-colors group cursor-pointer" onClick={() => setViewingItem(item)}>
        {titleCell}
        <td className="px-4 py-3">
          <span className="text-xs text-gray-600">{item.dependencyType ?? '—'}</span>
        </td>
        <td className="px-4 py-3">
          <span className="text-xs text-gray-600 truncate max-w-[140px] block">{item.dependentOn ?? '—'}</span>
        </td>
        <td className="px-4 py-3">
          <span className="text-xs text-gray-600">{item.dueDate ?? '—'}</span>
        </td>
        <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
      </tr>
    );

    // assumptions
    return (
      <tr key={item.id} className="hover:bg-gray-50 transition-colors group cursor-pointer" onClick={() => setViewingItem(item)}>
        {titleCell}
        <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
        <td className="px-4 py-3">
          <span className="text-xs text-gray-600 truncate max-w-[180px] block">{item.impactIfWrong ?? '—'}</span>
        </td>
        <td className="px-4 py-3">
          <span className="text-xs text-gray-600">{owner?.name ?? '—'}</span>
        </td>
      </tr>
    );
  };

  return (
    <Layout>
      <Header title={t('nav.raidRegister')}
        subtitle={`${t('raid.types.risk')}s, ${t('raid.types.issue')}s, ${t('raid.types.dependency').replace(/y$/, 'ies')}, ${t('raid.types.assumption')}s`}
        actions={canWrite
          ? <Button onClick={() => setShowCreate(true)} icon={<Plus size={16} />}>{t('raid.new')}</Button>
          : <span className="flex items-center gap-1.5 text-sm text-gray-400"><Lock size={14} />{t('errors.unauthorized')}</span>}
      />
      <div className="p-6 space-y-5">

        {/* Project Filter */}
        <select className="form-select max-w-xs" value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
          <option value="">{t('common.all')} {t('projects.title')}</option>
          {projects.map((p: { id: string; name: string }) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        {/* RAID Tabs */}
        <div className="flex gap-2 border-b border-gray-200">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 ${
                tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* ✅ Table Layout */}
        {currentData.length === 0 ? (
          <EmptyState title={t('raid.noItems')} description={t('common.noData')}
            action={canWrite ? <Button onClick={() => setShowCreate(true)} icon={<Plus size={16} />}>{t('raid.new')}</Button> : undefined} />
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>{renderTableHead()}</thead>
                <tbody className="divide-y divide-gray-50">
                  {currentData.map((item: any) => renderTableRow(item))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* Detail View Modal */}
      <Modal open={!!viewingItem} onClose={() => setViewingItem(null)} title={`${tab === 'risks' ? t('raid.types.risk') : tab === 'issues' ? t('raid.types.issue') : tab === 'dependencies' ? t('raid.types.dependency') : t('raid.types.assumption')} ${t('common.view')}`}>
        {viewingItem && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={viewingItem.status} />
              {viewingItem.severity && <StatusBadge status={viewingItem.severity} />}
              {viewingItem.probability && (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                  P: {viewingItem.probability} · I: {viewingItem.impact}
                </span>
              )}
            </div>
            {viewingItem.description && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{t('common.description')}</p>
                <p className="text-sm text-gray-700">{viewingItem.description}</p>
              </div>
            )}
            {viewingItem.mitigation && (
              <div className="p-3 bg-green-50 rounded-lg">
                <p className="text-xs font-medium text-green-700 mb-1">{t('raid.modal.mitigation')}</p>
                <p className="text-sm text-green-800">{viewingItem.mitigation}</p>
              </div>
            )}
            {viewingItem.impact_if_wrong && (
              <div className="p-3 bg-red-50 rounded-lg">
                <p className="text-xs font-medium text-red-700 mb-1">{t('raid.modal.impact')}</p>
                <p className="text-sm text-red-800">{viewingItem.impact_if_wrong}</p>
              </div>
            )}
            {viewingItem.dependent_on && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{t('raid.modal.itemType')}</p>
                <p className="text-sm text-gray-700">{viewingItem.dependent_on}</p>
              </div>
            )}
            {viewingItem.due_date && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{t('common.dueDate')}</p>
                <p className="text-sm text-gray-700">{viewingItem.due_date}</p>
              </div>
            )}
            {viewingItem.owner_user_id && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{t('raid.modal.owner')}</p>
                <p className="text-sm text-gray-700">{users.find((u: { id: string }) => u.id === viewingItem.owner_user_id)?.name ?? viewingItem.owner_user_id}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset(); setCreateError(''); }}
        title={t('raid.modal.createTitle')} size="lg">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {createError && <Alert type="error" message={createError} />}
          <div>
            <label className="form-label">{t('tasks.modal.project')} *</label>
            <select className="form-select" {...register('project_id', { required: t('validation.required') })}>
              <option value="">{t('common.optional2')}</option>
              {projects.map((p: { id: string; name: string }) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {errors.project_id && <p className="form-error">{errors.project_id.message}</p>}
          </div>
          <div>
            <label className="form-label">{t('raid.modal.titleLabel')} *</label>
            <input className="form-input" {...register('title', { required: t('validation.required') })} />
            {errors.title && <p className="form-error">{errors.title.message}</p>}
          </div>
          <div>
            <label className="form-label">{t('raid.modal.descLabel')}</label>
            <textarea className="form-textarea" rows={3} {...register('description')} />
          </div>
          <div>
            <label className="form-label">{t('raid.modal.owner')} *</label>
            <Controller
              name="owner_user_id"
              control={control}
              rules={{ required: t('validation.required') }}
              render={({ field }) => (
                <UserPicker users={users} value={field.value ?? ''} onChange={field.onChange} placeholder={t('common.assign')} />
              )}
            />
            {errors.owner_user_id && <p className="form-error">{errors.owner_user_id.message as string}</p>}
          </div>
          {tab === 'risks' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">{t('raid.modal.probability')} *</label>
                  <select className="form-select" {...register('probability', { required: true })}>
                    <option value="HIGH">{t('raid.impact.high')}</option>
                    <option value="MEDIUM">{t('raid.impact.medium')}</option>
                    <option value="LOW">{t('raid.impact.low')}</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">{t('raid.modal.impact')} *</label>
                  <select className="form-select" {...register('impact', { required: true })}>
                    <option value="HIGH">{t('raid.impact.high')}</option>
                    <option value="MEDIUM">{t('raid.impact.medium')}</option>
                    <option value="LOW">{t('raid.impact.low')}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="form-label">{t('raid.modal.mitigation')}</label>
                <textarea className="form-textarea" rows={2} {...register('mitigation')} />
              </div>
            </>
          )}
          {tab === 'issues' && (
            <div>
              <label className="form-label">{t('bugs.modal.severity')}</label>
              <select className="form-select" {...register('severity')}>
                <option value="CRITICAL">{t('statuses.critical')}</option>
                <option value="HIGH">{t('statuses.high')}</option>
                <option value="MEDIUM">{t('statuses.medium')}</option>
                <option value="LOW">{t('statuses.low')}</option>
              </select>
            </div>
          )}
          {tab === 'dependencies' && (
            <>
              <div>
                <label className="form-label">{t('raid.modal.itemType')}</label>
                <select className="form-select" {...register('dependency_type', { required: true })}>
                  <option value="INTERNAL">Internal</option>
                  <option value="EXTERNAL">External</option>
                </select>
              </div>
              <div>
                <label className="form-label">{t('raid.modal.descLabel')}</label>
                <input className="form-input" placeholder="Team / System / Service" {...register('dependent_on')} />
              </div>
              <div>
                <label className="form-label">{t('raid.modal.dueDate')}</label>
                <input type="date" className="form-input" {...register('due_date')} />
              </div>
            </>
          )}
          {tab === 'assumptions' && (
            <div>
              <label className="form-label">{t('raid.modal.impact')}</label>
              <textarea className="form-textarea" rows={2} {...register('impact_if_wrong')} />
            </div>
          )}
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setShowCreate(false)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={isSubmitting}>{t('raid.modal.create')}</Button>
          </ModalActions>
        </form>
      </Modal>

      {/* ✅ Rename Modal */}
      <Modal
        open={!!renamingItem}
        onClose={() => { setRenamingItem(null); resetRename(); setRenameError(''); }}
        title={t('common.rename')}
        size="sm"
      >
        <form onSubmit={handleRenameSubmit(onRename)} className="space-y-4">
          {renameError && <Alert type="error" message={renameError} />}
          <div>
            <label className="form-label">{t('raid.modal.titleLabel')} *</label>
            <input
              className="form-input"
              autoFocus
              {...registerRename('title', {
                required: t('validation.required'),
                validate: v => v.trim().length > 0 || t('validation.cannotBeBlank'),
              })}
            />
            {renameErrors.title && <p className="form-error">{renameErrors.title.message}</p>}
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => { setRenamingItem(null); resetRename(); }}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={isRenaming}>{t('raid.modal.save')}</Button>
          </ModalActions>
        </form>
      </Modal>

    </Layout>
  );
};

export default RaidPage;