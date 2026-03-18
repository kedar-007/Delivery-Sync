import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Plus } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';
import Modal, { ModalActions } from '../components/ui/Modal';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/Spinner';
import { useDecisions, useCreateDecision } from '../hooks/useDecisions';
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

  const params: Record<string, string> = {};
  if (filterProject) params.projectId = filterProject;
  const { data: decisions = [], isLoading } = useDecisions(params);
  const { data: projects = [] } = useProjects();
  const createDecision = useCreateDecision();

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<DecisionForm>({
    defaultValues: { project_id: preselectedProject, decision_date: format(new Date(), 'yyyy-MM-dd') },
  });

  const onSubmit = async (data: DecisionForm) => {
    try {
      setCreateError('');
      await createDecision.mutateAsync(data);
      reset({ project_id: filterProject, decision_date: format(new Date(), 'yyyy-MM-dd') });
      setShowCreate(false);
    } catch (err: unknown) { setCreateError((err as Error).message); }
  };

  if (isLoading) return <Layout><PageLoader /></Layout>;

  return (
    <Layout>
      <Header title="Decision Log" subtitle={`${decisions.length} decision${decisions.length !== 1 ? 's' : ''}`}
        actions={<Button onClick={() => setShowCreate(true)} icon={<Plus size={16} />}>Log Decision</Button>}
      />
      <div className="p-6 space-y-5">
        <select className="form-select max-w-xs" value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
          <option value="">All Projects</option>
          {projects.map((p: {id: string; name: string}) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        {decisions.length === 0 ? (
          <EmptyState title="No decisions logged" description="Log decisions to maintain a clear audit trail."
            action={<Button onClick={() => setShowCreate(true)} icon={<Plus size={16} />}>Log Decision</Button>} />
        ) : (
          <div className="space-y-3">
            {decisions.map((d: Decision) => (
              <Card key={d.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-gray-900">{d.title}</h3>
                      <StatusBadge status={d.status} />
                    </div>
                    <p className="text-xs text-gray-400 mb-2">
                      {d.decisionDate} {d.madeBy && `· Made by ${d.madeBy}`}
                    </p>
                    {d.description && <p className="text-sm text-gray-600 mb-2">{d.description}</p>}
                    {d.rationale && (
                      <div className="p-2 bg-blue-50 rounded text-xs text-blue-700">
                        <strong>Rationale:</strong> {d.rationale}
                      </div>
                    )}
                    {d.impact && (
                      <div className="mt-2 p-2 bg-amber-50 rounded text-xs text-amber-700">
                        <strong>Impact:</strong> {d.impact}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset(); setCreateError(''); }} title="Log Decision" size="lg">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {createError && <Alert type="error" message={createError} />}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Project *</label>
              <select className="form-select" {...register('project_id', { required: 'Required' })}>
                <option value="">Select…</option>
                {projects.map((p: {id: string; name: string}) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
    </Layout>
  );
};

export default DecisionsPage;
