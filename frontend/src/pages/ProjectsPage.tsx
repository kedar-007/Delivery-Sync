import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Plus, Search, Calendar } from 'lucide-react';
import { useForm } from 'react-hook-form';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { RAGBadge, StatusBadge } from '../components/ui/Badge';
import Modal, { ModalActions } from '../components/ui/Modal';
import { PageSkeleton } from '../components/ui/Skeleton';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import { useProjects, useCreateProject } from '../hooks/useProjects';
import { format } from 'date-fns';

interface ProjectForm {
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  rag_status: string;
}

const ProjectsPage = () => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [createError, setCreateError] = useState('');

  const { data: projects = [], isLoading, error } = useProjects();
  const createProject = useCreateProject();

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ProjectForm>({
    defaultValues: { rag_status: 'GREEN' },
  });

  const filtered = projects.filter((p: {name: string}) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const onSubmit = async (data: ProjectForm) => {
    try {
      setCreateError('');
      await createProject.mutateAsync(data);
      reset();
      setShowCreate(false);
    } catch (err: unknown) {
      setCreateError((err as Error).message);
    }
  };

  if (isLoading) return <Layout><PageSkeleton /></Layout>;

  return (
    <Layout>
      <Header
        title="Projects"
        subtitle={`${projects.length} project${projects.length !== 1 ? 's' : ''}`}
        actions={
          <Button onClick={() => setShowCreate(true)} icon={<Plus size={16} />}>
            New Project
          </Button>
        }
      />

      <div className="p-6 space-y-5">
        {error && <Alert type="error" message={(error as Error).message} />}

        {/* Search */}
        <div className="relative max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="form-input pl-9"
            placeholder="Search projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Projects Grid */}
        {filtered.length === 0 ? (
          <EmptyState
            title="No projects found"
            description="Create your first project to get started."
            action={<Button onClick={() => setShowCreate(true)} icon={<Plus size={16} />}>Create Project</Button>}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((project: {
              id: string; name: string; description?: string;
              ragStatus: string; status: string; startDate: string; endDate: string;
            }) => (
              <Link key={project.id} to={`/${tenantSlug}/projects/${project.id}`}>
                <Card className="hover:border-blue-300 hover:shadow-md transition-all cursor-pointer h-full">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 text-sm leading-tight pr-2">{project.name}</h3>
                    <RAGBadge status={project.ragStatus} />
                  </div>
                  {project.description && (
                    <p className="text-xs text-gray-500 mb-3 line-clamp-2">{project.description}</p>
                  )}
                  <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-50">
                    <StatusBadge status={project.status} />
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <Calendar size={12} />
                      <span>{project.endDate}</span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Create Project Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setCreateError(''); reset(); }} title="Create New Project" size="lg">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {createError && <Alert type="error" message={createError} />}
          <div>
            <label className="form-label">Project Name *</label>
            <input className="form-input" placeholder="e.g. Customer Portal v2" {...register('name', { required: 'Required' })} />
            {errors.name && <p className="form-error">{errors.name.message}</p>}
          </div>
          <div>
            <label className="form-label">Description</label>
            <textarea className="form-textarea" rows={3} placeholder="Brief project overview…" {...register('description')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Start Date *</label>
              <input type="date" className="form-input" {...register('start_date', { required: 'Required' })} />
              {errors.start_date && <p className="form-error">{errors.start_date.message}</p>}
            </div>
            <div>
              <label className="form-label">End Date *</label>
              <input type="date" className="form-input" {...register('end_date', { required: 'Required' })} />
              {errors.end_date && <p className="form-error">{errors.end_date.message}</p>}
            </div>
          </div>
          <div>
            <label className="form-label">Initial RAG Status</label>
            <select className="form-select" {...register('rag_status')}>
              <option value="GREEN">Green</option>
              <option value="AMBER">Amber</option>
              <option value="RED">Red</option>
            </select>
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" loading={isSubmitting}>Create Project</Button>
          </ModalActions>
        </form>
      </Modal>
    </Layout>
  );
};

export default ProjectsPage;
