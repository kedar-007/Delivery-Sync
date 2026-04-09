import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Plus, Search, Calendar, Pencil } from 'lucide-react';
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
import { useProjectsPaginated, useCreateProject, useUpdateProject } from '../hooks/useProjects';
import Pagination from '../components/ui/Pagination';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';

interface ProjectForm {
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  rag_status: string;
}

interface RenameForm {
  name: string;
}

const ProjectsPage = () => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { user } = useAuth();
  const canCreateProject = ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'EXEC'].includes(user?.role ?? '');
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [createError, setCreateError] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 18;

  // Rename State
  const [renamingProject, setRenamingProject] = useState<{ id: string; name: string } | null>(null);
  const [renameError, setRenameError] = useState('');

  const { data: pagedData, isLoading, error } = useProjectsPaginated({ page, pageSize: PAGE_SIZE });
  const projects = pagedData?.projects ?? [];
  const total: number = pagedData?.total ?? 0;
  const totalPages: number = pagedData?.totalPages ?? 1;
  const createProject = useCreateProject();

  // Updating the project
  const updateProject = useUpdateProject(renamingProject?.id ?? '');

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ProjectForm>({
    defaultValues: { rag_status: 'GREEN' },
  });

  const {
    register: registerRename,
    handleSubmit: handleRenameSubmit,
    reset: resetRename,
    formState: { errors: renameErrors, isSubmitting: isRenaming },
  } = useForm<{ name: string }>();

  const filtered = projects.filter((p: { name: string }) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );
  // Reset to page 1 when search changes - handled in the input onChange

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

  // Rename functions
  const openRename = (e: React.MouseEvent, project: { id: string; name: string }) => {
    e.preventDefault();
    e.stopPropagation();
    setRenamingProject(project);
    resetRename({ name: project.name });
    setRenameError('');
  };

  const onRename = async (data: { name: string }) => {
    if (!renamingProject) return;
    try {
      setRenameError('');
      await updateProject.mutateAsync({ name: data.name });
      setRenamingProject(null);
      resetRename();
    } catch (err: unknown) {
      setRenameError((err as Error).message);
    }
  };

  if (isLoading) return <Layout><PageSkeleton /></Layout>;

  return (
    <Layout>
      <Header
        title="Projects"
        subtitle={`${total} project${total !== 1 ? 's' : ''}`}
        actions={
          canCreateProject ? (
            <Button onClick={() => setShowCreate(true)} icon={<Plus size={16} />}>
              New Project
            </Button>
          ) : undefined
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
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
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

                  {/* ✅ Fixed: RAGBadge and Pencil wrapped in flex div */}
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 text-sm leading-tight pr-2">{project.name}</h3>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <RAGBadge status={project.ragStatus} />
                      <button
                        type="button"
                        onClick={(e) => openRename(e, { id: project.id, name: project.name })}
                        className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Rename project"
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
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

        <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
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

      {/* ✅ Added: Rename Project Modal */}
      <Modal
        open={!!renamingProject}
        onClose={() => { setRenamingProject(null); resetRename(); setRenameError(''); }}
        title="Rename Project"
        size="sm"
      >
        <form onSubmit={handleRenameSubmit(onRename)} className="space-y-4">
          {renameError && <Alert type="error" message={renameError} />}
          <div>
            <label className="form-label">Project Name *</label>
            <input
              className="form-input"
              autoFocus
              {...registerRename('name', {
                required: 'Required',
                validate: v => v.trim().length > 0 || 'Name cannot be blank',
              })}
            />
            {renameErrors.name && <p className="form-error">{renameErrors.name.message}</p>}
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => { setRenamingProject(null); resetRename(); }}>
              Cancel
            </Button>
            <Button type="submit" loading={isRenaming}>Save</Button>
          </ModalActions>
        </form>
      </Modal>

    </Layout>
  );
};

export default ProjectsPage;