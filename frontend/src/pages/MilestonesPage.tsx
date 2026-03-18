import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Plus, CheckCircle, Clock, Flag } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';
import Modal, { ModalActions } from '../components/ui/Modal';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/Spinner';
import { useProjects, useMilestones, useCreateMilestone, useUpdateMilestone } from '../hooks/useProjects';
import { Milestone } from '../types';
import { format } from 'date-fns';

interface MilestoneForm {
  title: string;
  description: string;
  due_date: string;
}

const MilestonesPage = () => {
  const [searchParams] = useSearchParams();
  const preselectedProject = searchParams.get('projectId') || '';
  const [selectedProject, setSelectedProject] = useState(preselectedProject);
  const [showCreate, setShowCreate] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [createError, setCreateError] = useState('');

  const { data: projects = [], isLoading: projectsLoading } = useProjects();
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
      <Header title="Milestones" subtitle={selectedProject ? `${milestones.length} milestones · ${overdue.length} overdue` : 'Select a project'}
        actions={selectedProject && <Button onClick={openCreate} icon={<Plus size={16} />}>Add Milestone</Button>}
      />
      <div className="p-6 space-y-5">
        <select className="form-select max-w-xs" value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}>
          <option value="">Select project…</option>
          {projects.map((p: {id: string; name: string}) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        {!selectedProject ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
            <Flag size={40} className="mx-auto text-gray-200 mb-3" />
            <p className="text-sm text-gray-500">Select a project to view its milestones</p>
          </div>
        ) : milestonesLoading ? (
          <PageLoader />
        ) : milestones.length === 0 ? (
          <EmptyState title="No milestones" description="Add milestones to track key project deliverables."
            action={<Button onClick={openCreate} icon={<Plus size={16} />}>Add Milestone</Button>} />
        ) : (
          <div className="space-y-6">
            {overdue.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Clock size={12} /> Overdue ({overdue.length})
                </h2>
                <div className="space-y-2">
                  {overdue.map((m: Milestone) => (
                    <MilestoneCard key={m.id} milestone={m} overdue onEdit={() => openEdit(m)} />
                  ))}
                </div>
              </section>
            )}
            {upcoming.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Clock size={12} /> Upcoming ({upcoming.length})
                </h2>
                <div className="space-y-2">
                  {upcoming.map((m: Milestone) => (
                    <MilestoneCard key={m.id} milestone={m} overdue={false} onEdit={() => openEdit(m)} />
                  ))}
                </div>
              </section>
            )}
            {completed.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <CheckCircle size={12} /> Completed ({completed.length})
                </h2>
                <div className="space-y-2">
                  {completed.map((m: Milestone) => (
                    <MilestoneCard key={m.id} milestone={m} overdue={false} onEdit={() => openEdit(m)} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset(); setCreateError(''); setEditingMilestone(null); }}
        title={editingMilestone ? 'Edit Milestone' : 'Add Milestone'}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {createError && <Alert type="error" message={createError} />}
          <div>
            <label className="form-label">Title *</label>
            <input className="form-input" placeholder="Milestone name" {...register('title', { required: 'Required' })} />
            {errors.title && <p className="form-error">{errors.title.message}</p>}
          </div>
          <div>
            <label className="form-label">Description</label>
            <textarea className="form-textarea" rows={2} placeholder="What does this milestone represent?" {...register('description')} />
          </div>
          <div>
            <label className="form-label">Due Date *</label>
            <input type="date" className="form-input" {...register('due_date', { required: 'Required' })} />
            {errors.due_date && <p className="form-error">{errors.due_date.message}</p>}
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" loading={isSubmitting}>{editingMilestone ? 'Save Changes' : 'Add Milestone'}</Button>
          </ModalActions>
        </form>
      </Modal>
    </Layout>
  );
};

const MilestoneCard = ({ milestone, overdue, onEdit }: { milestone: Milestone; overdue: boolean; onEdit: () => void }) => (
  <Card>
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <h3 className="text-sm font-semibold text-gray-900">{milestone.title}</h3>
          <StatusBadge status={milestone.status} />
          {overdue && <span className="text-xs text-red-600 font-medium bg-red-50 px-1.5 py-0.5 rounded">OVERDUE</span>}
        </div>
        <p className="text-xs text-gray-400">Due {milestone.dueDate}
          {milestone.completionDate && <span className="ml-2 text-green-600">· Completed {milestone.completionDate}</span>}
        </p>
        {milestone.description && <p className="text-sm text-gray-600 mt-1">{milestone.description}</p>}
      </div>
      <button onClick={onEdit} className="text-xs text-blue-600 hover:underline whitespace-nowrap">Edit</button>
    </div>
  </Card>
);

export default MilestonesPage;
