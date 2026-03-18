import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { Plus, Lock } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';
import Modal, { ModalActions } from '../components/ui/Modal';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/Spinner';
import UserPicker from '../components/ui/UserPicker';
import { useRisks, useCreateRisk, useIssues, useCreateIssue, useDependencies, useCreateDependency, useAssumptions, useCreateAssumption } from '../hooks/useRaid';
import { useProjects } from '../hooks/useProjects';
import { useUsers } from '../hooks/useUsers';
import { useAuth } from '../contexts/AuthContext';
import { canDo, PERMISSIONS } from '../utils/permissions';

type Tab = 'risks' | 'issues' | 'dependencies' | 'assumptions';

const RaidPage = () => {
  const [searchParams] = useSearchParams();
  const preselectedProject = searchParams.get('projectId') || '';
  const [tab, setTab] = useState<Tab>('risks');
  const [filterProject, setFilterProject] = useState(preselectedProject);
  const [showCreate, setShowCreate] = useState(false);
  const [viewingItem, setViewingItem] = useState<any | null>(null);
  const [createError, setCreateError] = useState('');

  const { user: currentUser } = useAuth();
  const canWrite = canDo(currentUser?.role, PERMISSIONS.RAID_WRITE);
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

  const { register, handleSubmit, reset, control, formState: { errors, isSubmitting } } = useForm<Record<string, string>>({
    defaultValues: { project_id: preselectedProject, owner_user_id: '' },
    shouldUnregister: true,
  });

  // Every time the create modal opens, reset form with current user as default owner
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

  const TABS = [
    { key: 'risks', label: 'Risks', count: risks.length },
    { key: 'issues', label: 'Issues', count: issues.length },
    { key: 'dependencies', label: 'Dependencies', count: deps.length },
    { key: 'assumptions', label: 'Assumptions', count: assumptions.length },
  ] as const;

  if (isLoading) return <Layout><PageLoader /></Layout>;

  const currentData = tab === 'risks' ? risks : tab === 'issues' ? issues : tab === 'dependencies' ? deps : assumptions;

  return (
    <Layout>
      <Header title="RAID Register"
        subtitle="Risks, Issues, Dependencies, Assumptions"
        actions={canWrite
          ? <Button onClick={() => setShowCreate(true)} icon={<Plus size={16} />}>New {tab.slice(0, -1)}</Button>
          : <span className="flex items-center gap-1.5 text-sm text-gray-400"><Lock size={14} />No permission to add items</span>}
      />
      <div className="p-6 space-y-5">

        {/* Project Filter */}
        <select className="form-select max-w-xs" value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
          <option value="">All Projects</option>
          {projects.map((p: {id: string; name: string}) => <option key={p.id} value={p.id}>{p.name}</option>)}
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

        {currentData.length === 0 ? (
          <EmptyState title={`No ${tab}`} description={`No ${tab} recorded yet.`}
            action={canWrite ? <Button onClick={() => setShowCreate(true)} icon={<Plus size={16} />}>Add {tab.slice(0, -1)}</Button> : undefined} />
        ) : (
          <div className="space-y-3">
            {currentData.map((item: any) => (
              <Card key={item.id}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setViewingItem(item)}>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-sm font-semibold text-gray-900 hover:text-blue-600">{item.title}</h3>
                      <StatusBadge status={item.status} />
                      {item.severity && <StatusBadge status={item.severity} />}
                      {item.probability && (
                        <span className="text-xs text-gray-500">
                          P:{item.probability} · I:{item.impact}
                        </span>
                      )}
                    </div>
                    {item.description && <p className="text-sm text-gray-600 mt-1">{item.description}</p>}
                    {item.mitigation && <p className="text-xs text-green-700 mt-1 bg-green-50 p-2 rounded"><strong>Mitigation:</strong> {item.mitigation}</p>}
                    {item.impact_if_wrong && <p className="text-xs text-red-700 mt-1 bg-red-50 p-2 rounded"><strong>Impact if wrong:</strong> {item.impactIfWrong}</p>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Detail View Modal */}
      <Modal open={!!viewingItem} onClose={() => setViewingItem(null)} title={`${tab.slice(0, -1).charAt(0).toUpperCase() + tab.slice(1, -1)} Details`}>
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
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Description</p>
                <p className="text-sm text-gray-700">{viewingItem.description}</p>
              </div>
            )}
            {viewingItem.mitigation && (
              <div className="p-3 bg-green-50 rounded-lg">
                <p className="text-xs font-medium text-green-700 mb-1">Mitigation Plan</p>
                <p className="text-sm text-green-800">{viewingItem.mitigation}</p>
              </div>
            )}
            {viewingItem.impact_if_wrong && (
              <div className="p-3 bg-red-50 rounded-lg">
                <p className="text-xs font-medium text-red-700 mb-1">Impact If Wrong</p>
                <p className="text-sm text-red-800">{viewingItem.impact_if_wrong}</p>
              </div>
            )}
            {viewingItem.dependent_on && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Dependent On</p>
                <p className="text-sm text-gray-700">{viewingItem.dependent_on}</p>
              </div>
            )}
            {viewingItem.due_date && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Due Date</p>
                <p className="text-sm text-gray-700">{viewingItem.due_date}</p>
              </div>
            )}
            {viewingItem.owner_user_id && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Owner</p>
                <p className="text-sm text-gray-700">{users.find(u => u.id === viewingItem.owner_user_id)?.name ?? viewingItem.owner_user_id}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset(); setCreateError(''); }}
        title={`Add ${tab.slice(0, -1).charAt(0).toUpperCase() + tab.slice(1, -1)}`} size="lg">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {createError && <Alert type="error" message={createError} />}
          <div>
            <label className="form-label">Project *</label>
            <select className="form-select" {...register('project_id', { required: 'Please select a project' })}>
              <option value="">Select…</option>
              {projects.map((p: {id: string; name: string}) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {errors.project_id && <p className="form-error">{errors.project_id.message}</p>}
          </div>
          <div>
            <label className="form-label">Title *</label>
            <input className="form-input" {...register('title', { required: 'Required' })} />
            {errors.title && <p className="form-error">{errors.title.message}</p>}
          </div>
          <div>
            <label className="form-label">Description</label>
            <textarea className="form-textarea" rows={3} {...register('description')} />
          </div>
          <div>
            <label className="form-label">Owner *</label>
            <Controller
              name="owner_user_id"
              control={control}
              rules={{ required: 'Please assign an owner' }}
              render={({ field }) => (
                <UserPicker
                  users={users}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Assign to…"
                />
              )}
            />
            {errors.owner_user_id && <p className="form-error">{errors.owner_user_id.message as string}</p>}
          </div>
          {tab === 'risks' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Probability *</label>
                  <select className="form-select" {...register('probability', { required: true })}>
                    {['HIGH', 'MEDIUM', 'LOW'].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Impact *</label>
                  <select className="form-select" {...register('impact', { required: true })}>
                    {['HIGH', 'MEDIUM', 'LOW'].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="form-label">Mitigation Plan</label>
                <textarea className="form-textarea" rows={2} {...register('mitigation')} />
              </div>
            </>
          )}
          {tab === 'issues' && (
            <div>
              <label className="form-label">Severity</label>
              <select className="form-select" {...register('severity')}>
                {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          {tab === 'dependencies' && (
            <>
              <div>
                <label className="form-label">Dependency Type</label>
                <select className="form-select" {...register('dependency_type', { required: true })}>
                  <option value="INTERNAL">Internal</option>
                  <option value="EXTERNAL">External</option>
                </select>
              </div>
              <div>
                <label className="form-label">Dependent On</label>
                <input className="form-input" placeholder="Team / System / Service" {...register('dependent_on')} />
              </div>
              <div>
                <label className="form-label">Due Date</label>
                <input type="date" className="form-input" {...register('due_date')} />
              </div>
            </>
          )}
          {tab === 'assumptions' && (
            <div>
              <label className="form-label">Impact If Wrong</label>
              <textarea className="form-textarea" rows={2} {...register('impact_if_wrong')} />
            </div>
          )}
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" loading={isSubmitting}>Add {tab.slice(0, -1)}</Button>
          </ModalActions>
        </form>
      </Modal>
    </Layout>
  );
};

export default RaidPage;
