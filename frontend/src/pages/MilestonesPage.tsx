import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Plus, CheckCircle, Clock, Flag, Globe, User } from 'lucide-react';
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
import { useProjects, useMyProjects, useMilestones, useCreateMilestone, useUpdateMilestone } from '../hooks/useProjects';
import { Milestone } from '../types';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission, PERMISSIONS } from '../utils/permissions';

interface MilestoneForm {
  title: string;
  description: string;
  due_date: string;
}

const MilestonesPage = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  // DSV-028: hide the "Add Milestone" button for users without
  // MILESTONE_WRITE — they were seeing the button, clicking it, and getting
  // a raw permission-error message instead of a clean read-only view.
  const canWrite = hasPermission(user, PERMISSIONS.MILESTONE_WRITE);
  const canViewOrgData = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN' || hasPermission(user, PERMISSIONS.PROJECT_DATA_VIEW_ALL);
  const [viewMode, setViewMode] = useState<'mine' | 'org'>('mine');
  const [searchParams] = useSearchParams();
  const preselectedProject = searchParams.get('projectId') || '';
  const [selectedProject, setSelectedProject] = useState(preselectedProject);
  const [showCreate, setShowCreate] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [createError, setCreateError] = useState('');

  const { data: allOrgProjects = [], isLoading: projectsLoading } = useProjects();
  const { data: myProjects = [] } = useMyProjects();
  const projects = canViewOrgData && viewMode === 'org' ? allOrgProjects : myProjects.length > 0 ? myProjects : allOrgProjects;
  const { data: milestones = [], isLoading: milestonesLoading } = useMilestones(selectedProject);
  const createMilestone = useCreateMilestone(selectedProject);
  const updateMilestone = useUpdateMilestone(selectedProject, editingMilestone?.id || '');

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<MilestoneForm>({
    defaultValues: { due_date: format(new Date(), 'yyyy-MM-dd') },
  });

  const openCreate = () => {
    reset({ due_date: format(new Date(), 'yyyy-MM-dd') });
    setEditingMilestone(null);
    setCreateError('');
    setShowCreate(true);
  };

  const openEdit = (m: Milestone) => {
    setEditingMilestone(m);
    setValue('title', m.title);
    setValue('description', m.description || '');
    setValue('due_date', m.dueDate);
    setCreateError('');
    setShowCreate(true);
  };

  const onSubmit = async (data: MilestoneForm) => {
    try {
      setCreateError('');
      if (editingMilestone) {
        await updateMilestone.mutateAsync(data);
      } else {
        await createMilestone.mutateAsync(data);
      }
      reset();
      setShowCreate(false);
      setEditingMilestone(null);
    } catch (err: unknown) { setCreateError((err as Error).message); }
  };

  if (projectsLoading) return <Layout><PageLoader /></Layout>;

  const today = format(new Date(), 'yyyy-MM-dd');
  const overdue = milestones.filter((m: Milestone) => m.status !== 'COMPLETED' && m.dueDate < today);
  const upcoming = milestones.filter((m: Milestone) => m.status !== 'COMPLETED' && m.dueDate >= today);
  const completed = milestones.filter((m: Milestone) => m.status === 'COMPLETED');

  return (
    <Layout>
      <Header title={t('nav.milestones')} subtitle={selectedProject ? `${milestones.length} milestones · ${overdue.length} overdue` : t('projects.searchPlaceholder')}
        actions={
          <div className="flex items-center gap-2">
            {canViewOrgData && (
              <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                <button onClick={() => setViewMode('mine')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${viewMode === 'mine' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}><User size={11} /> My Projects</button>
                <button onClick={() => setViewMode('org')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${viewMode === 'org' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}><Globe size={11} /> All Org</button>
              </div>
            )}
            {selectedProject && canWrite && <Button onClick={openCreate} icon={<Plus size={16} />}>{t('milestones.new')}</Button>}
          </div>
        }
      />
      <div className="p-6 space-y-5">
        <select className="form-select max-w-xs" value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}>
          <option value="">{t('projects.searchPlaceholder')}</option>
          {projects.map((p: {id: string; name: string}) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        {!selectedProject ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
            <Flag size={40} className="mx-auto text-gray-200 mb-3" />
            <p className="text-sm text-gray-500">{t('projects.searchPlaceholder')}</p>
          </div>
        ) : milestonesLoading ? (
          <PageLoader />
        ) : milestones.length === 0 ? (
          <EmptyState
            title={t('milestones.noMilestones')}
            description={canWrite ? t('milestones.noMilestonesDesc') : t('milestones.noMilestonesDesc')}
            action={canWrite ? <Button onClick={openCreate} icon={<Plus size={16} />}>{t('milestones.new')}</Button> : undefined}
          />
        ) : (
          <div className="space-y-6">
            {overdue.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Clock size={12} /> {t('milestones.status.overdue')} ({overdue.length})
                </h2>
                <div className="space-y-2">
                  {overdue.map((m: Milestone) => (
                    <MilestoneCard key={m.id} milestone={m} overdue onEdit={() => openEdit(m)} editLabel={t('common.edit')} overdueLabel={t('milestones.status.overdue')} dueLabel={t('milestones.dueOn')} completedLabel={t('milestones.completedOn')} />
                  ))}
                </div>
              </section>
            )}
            {upcoming.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Clock size={12} /> {t('milestones.status.inProgress')} ({upcoming.length})
                </h2>
                <div className="space-y-2">
                  {upcoming.map((m: Milestone) => (
                    <MilestoneCard key={m.id} milestone={m} overdue={false} onEdit={() => openEdit(m)} editLabel={t('common.edit')} overdueLabel={t('milestones.status.overdue')} dueLabel={t('milestones.dueOn')} completedLabel={t('milestones.completedOn')} />
                  ))}
                </div>
              </section>
            )}
            {completed.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <CheckCircle size={12} /> {t('milestones.status.completed')} ({completed.length})
                </h2>
                <div className="space-y-2">
                  {completed.map((m: Milestone) => (
                    <MilestoneCard key={m.id} milestone={m} overdue={false} onEdit={() => openEdit(m)} editLabel={t('common.edit')} overdueLabel={t('milestones.status.overdue')} dueLabel={t('milestones.dueOn')} completedLabel={t('milestones.completedOn')} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset(); setCreateError(''); setEditingMilestone(null); }}
        title={editingMilestone ? t('milestones.modal.editTitle') : t('milestones.modal.createTitle')}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {createError && <Alert type="error" message={createError} />}
          <div>
            <label className="form-label">{t('milestones.modal.titleLabel')}</label>
            <input className="form-input" placeholder={t('milestones.modal.titleLabel')} {...register('title', { required: t('validation.required') })} />
            {errors.title && <p className="form-error">{errors.title.message}</p>}
          </div>
          <div>
            <label className="form-label">{t('milestones.modal.descLabel')}</label>
            <textarea className="form-textarea" rows={2} placeholder={t('milestones.modal.descLabel')} {...register('description')} />
          </div>
          <div>
            <label className="form-label">{t('milestones.modal.dueDate')}</label>
            <input type="date" className="form-input" {...register('due_date', { required: t('validation.required') })} />
            {errors.due_date && <p className="form-error">{errors.due_date.message}</p>}
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setShowCreate(false)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={isSubmitting}>{editingMilestone ? t('milestones.modal.save') : t('milestones.modal.create')}</Button>
          </ModalActions>
        </form>
      </Modal>
    </Layout>
  );
};

const MilestoneCard = ({ milestone, overdue, onEdit, editLabel, overdueLabel, dueLabel, completedLabel }: { milestone: Milestone; overdue: boolean; onEdit: () => void; editLabel: string; overdueLabel: string; dueLabel: string; completedLabel: string }) => (
  <Card>
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <h3 className="text-sm font-semibold text-gray-900">{milestone.title}</h3>
          <StatusBadge status={milestone.status} />
          {overdue && <span className="text-xs text-red-600 font-medium bg-red-50 px-1.5 py-0.5 rounded">{overdueLabel}</span>}
        </div>
        <p className="text-xs text-gray-400">{dueLabel} {milestone.dueDate}
          {milestone.completionDate && <span className="ml-2 text-green-600">· {completedLabel} {milestone.completionDate}</span>}
        </p>
        {milestone.description && <p className="text-sm text-gray-600 mt-1">{milestone.description}</p>}
      </div>
      <button onClick={onEdit} className="text-xs text-blue-600 hover:underline whitespace-nowrap">{editLabel}</button>
    </div>
  </Card>
);

export default MilestonesPage;
