import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Plus, Pencil, CalendarDays, User, Lightbulb, Zap } from 'lucide-react'; // Added icons
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';
import Modal, { ModalActions } from '../components/ui/Modal';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/Spinner';
import { useDecisions, useCreateDecision, useUpdateDecision } from '../hooks/useDecisions'; // Added useUpdateDecision
import { useProjects } from '../hooks/useProjects';
import { Decision } from '../types';
import { format } from 'date-fns';

interface DecisionForm {
  project_id: string; title: string; description: string;
  decision_date: string; rationale: string; impact: string;
}

const DecisionsPage = () => {
  const [searchParams] = useSearchParams();
  const preselectedProject = searchParams.get('projectId') || '';
  const [filterProject, setFilterProject] = useState(preselectedProject);
  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState('');

  // Rename state
  const [renamingDecision, setRenamingDecision] = useState<{ id: string; title: string } | null>(null);
  const [renameError, setRenameError] = useState('');

  const params: Record<string, string> = {};
  if (filterProject) params.projectId = filterProject;
  const { data: decisions = [], isLoading } = useDecisions(params);
  const { data: projects = [] } = useProjects();
  const createDecision = useCreateDecision();

  // Update hook
  const updateDecision = useUpdateDecision(renamingDecision?.id ?? '');

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<DecisionForm>({
    defaultValues: { project_id: preselectedProject, decision_date: format(new Date(), 'yyyy-MM-dd') },
  });

  // Rename form
  const {
    register: registerRename,
    handleSubmit: handleRenameSubmit,
    reset: resetRename,
    formState: { errors: renameErrors, isSubmitting: isRenaming },
  } = useForm<{ title: string }>();

  const onSubmit = async (data: DecisionForm) => {
    try {
      setCreateError('');
      await createDecision.mutateAsync(data);
      reset({ project_id: filterProject, decision_date: format(new Date(), 'yyyy-MM-dd') });
      setShowCreate(false);
    } catch (err: unknown) { setCreateError((err as Error).message); }
  };

  // Open rename
  const openRename = (e: React.MouseEvent, decision: { id: string; title: string }) => {
    e.stopPropagation();
    setRenamingDecision(decision);
    resetRename({ title: decision.title });
    setRenameError('');
  };

  // Submit rename
  const onRename = async (data: { title: string }) => {
    if (!renamingDecision) return;
    try {
      setRenameError('');
      await updateDecision.mutateAsync({ title: data.title });
      setRenamingDecision(null);
      resetRename();
    } catch (err: unknown) {
      setRenameError((err as Error).message);
    }
  };

  if (isLoading) return <Layout><PageLoader /></Layout>;

  return (
    <Layout>
      <Header
        title="Decision Log"
        subtitle={`${decisions.length} decision${decisions.length !== 1 ? 's' : ''}`}
        actions={<Button onClick={() => setShowCreate(true)} icon={<Plus size={16} />}>Log Decision</Button>}
      />
      <div className="p-6 space-y-5">

        {/* Project Filter */}
        <select className="form-select max-w-xs" value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
          <option value="">All Projects</option>
          {projects.map((p: { id: string; name: string }) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        {decisions.length === 0 ? (
          <EmptyState
            title="No decisions logged"
            description="Log decisions to maintain a clear audit trail."
            action={<Button onClick={() => setShowCreate(true)} icon={<Plus size={16} />}>Log Decision</Button>}
          />
        ) : (
          // Improved card grid layout
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {decisions.map((d: Decision) => (
              <Card key={d.id} className="flex flex-col gap-0 p-0 overflow-hidden hover:shadow-md hover:border-blue-200 transition-all">

                {/* Card top accent bar — color changes by status */}
                <div className={`h-1 w-full flex-shrink-0 ${
                  d.status === 'APPROVED' ? 'bg-green-400'
                  : d.status === 'REJECTED' ? 'bg-red-400'
                  : d.status === 'PENDING' ? 'bg-amber-400'
                  : 'bg-blue-400'
                }`} />

                <div className="p-4 flex flex-col gap-3 flex-1">

                  {/* Title row + pencil + badge */}
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-gray-900 leading-snug flex-1">{d.title}</h3>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <StatusBadge status={d.status} />
                      <button
                        type="button"
                        onClick={(e) => openRename(e, { id: d.id, title: d.title })}
                        className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Rename decision"
                      >
                        <Pencil size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Meta row — date + made by */}
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    {d.decisionDate && (
                      <span className="flex items-center gap-1">
                        <CalendarDays size={11} />
                        {d.decisionDate}
                      </span>
                    )}
                    {d.madeBy && (
                      <span className="flex items-center gap-1">
                        <User size={11} />
                        {d.madeBy}
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  {d.description && (
                    <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{d.description}</p>
                  )}

                  {/* Rationale + Impact pills */}
                  {(d.rationale || d.impact) && (
                    <div className="flex flex-col gap-2 mt-auto pt-2 border-t border-gray-50">
                      {d.rationale && (
                        <div className="flex items-start gap-1.5 text-xs text-blue-700 bg-blue-50 rounded-md px-2.5 py-1.5">
                          <Lightbulb size={11} className="mt-0.5 flex-shrink-0" />
                          <span className="line-clamp-2"><span className="font-medium">Rationale: </span>{d.rationale}</span>
                        </div>
                      )}
                      {d.impact && (
                        <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-md px-2.5 py-1.5">
                          <Zap size={11} className="mt-0.5 flex-shrink-0" />
                          <span className="line-clamp-2"><span className="font-medium">Impact: </span>{d.impact}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset(); setCreateError(''); }} title="Log Decision" size="lg">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {createError && <Alert type="error" message={createError} />}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Project *</label>
              <select className="form-select" {...register('project_id', { required: 'Required' })}>
                <option value="">Select…</option>
                {projects.map((p: { id: string; name: string }) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {errors.project_id && <p className="form-error">{errors.project_id.message}</p>}
            </div>
            <div>
              <label className="form-label">Decision Date *</label>
              <input type="date" className="form-input" {...register('decision_date', { required: 'Required' })} />
            </div>
          </div>
          <div>
            <label className="form-label">Decision Title *</label>
            <input className="form-input" placeholder="What was decided?" {...register('title', { required: 'Required' })} />
            {errors.title && <p className="form-error">{errors.title.message}</p>}
          </div>
          <div>
            <label className="form-label">Description</label>
            <textarea className="form-textarea" rows={3} placeholder="Describe the decision in detail…" {...register('description')} />
          </div>
          <div>
            <label className="form-label">Rationale</label>
            <textarea className="form-textarea" rows={2} placeholder="Why was this decision made?" {...register('rationale')} />
          </div>
          <div>
            <label className="form-label">Impact</label>
            <textarea className="form-textarea" rows={2} placeholder="What is the expected impact?" {...register('impact')} />
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" loading={isSubmitting}>Log Decision</Button>
          </ModalActions>
        </form>
      </Modal>

      {/* Rename Modal */}
      <Modal
        open={!!renamingDecision}
        onClose={() => { setRenamingDecision(null); resetRename(); setRenameError(''); }}
        title="Rename Decision"
        size="sm"
      >
        <form onSubmit={handleRenameSubmit(onRename)} className="space-y-4">
          {renameError && <Alert type="error" message={renameError} />}
          <div>
            <label className="form-label">Decision Title *</label>
            <input
              className="form-input"
              autoFocus
              {...registerRename('title', {
                required: 'Required',
                validate: v => v.trim().length > 0 || 'Title cannot be blank',
              })}
            />
            {renameErrors.title && <p className="form-error">{renameErrors.title.message}</p>}
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => { setRenamingDecision(null); resetRename(); }}>
              Cancel
            </Button>
            <Button type="submit" loading={isRenaming}>Save</Button>
          </ModalActions>
        </form>
      </Modal>

    </Layout>
  );
};

export default DecisionsPage;