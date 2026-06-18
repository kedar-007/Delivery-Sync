import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Plus, Search, Calendar, Pencil, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import { useI18n } from '../contexts/I18nContext';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { RAGBadge, StatusBadge } from '../components/ui/Badge';
import Modal, { ModalActions } from '../components/ui/Modal';
import { PageSkeleton } from '../components/ui/Skeleton';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import { useProjectsPaginated, useSearchProjects, useCreateProject, useUpdateProject } from '../hooks/useProjects';
import Pagination from '../components/ui/Pagination';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission, PERMISSIONS } from '../utils/permissions';

interface ProjectForm {
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  rag_status: string;
}

const ProjectsPage = () => {
  const { t } = useI18n();
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { user } = useAuth();
  const canCreateProject = hasPermission(user, PERMISSIONS.PROJECT_WRITE);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [createError, setCreateError] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 18;

  // Rename State
  const [renamingProject, setRenamingProject] = useState<{ id: string; name: string } | null>(null);
  const [renameError, setRenameError] = useState('');

  // Debounce the search input — 350ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const isSearchMode = debouncedSearch.length >= 2;

  const { data: pagedData, isLoading: listLoading, error: listError } = useProjectsPaginated(
    !isSearchMode ? { page, pageSize: PAGE_SIZE } : {}
  );
  const { data: searchData, isLoading: searchLoading, error: searchError } = useSearchProjects(debouncedSearch);

  const error = isSearchMode ? searchError : listError;

  const projects = isSearchMode
    ? (searchData?.projects ?? [])
    : (pagedData?.projects ?? []);
  const total: number = isSearchMode ? (searchData?.total ?? 0) : (pagedData?.total ?? 0);
  const totalPages: number = isSearchMode ? 1 : (pagedData?.totalPages ?? 1);

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

  const filtered = projects;

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

  if (listLoading && !isSearchMode) return <Layout><PageSkeleton /></Layout>;

  return (
    <Layout>
      <Header
        title={t('nav.allProjects')}
        subtitle={isSearchMode ? `${total} ${t('common.noResults').split(' ')[0].toLowerCase()} for "${debouncedSearch}"` : `${total} ${t('nav.projects').toLowerCase()}`}
        actions={
          canCreateProject ? (
            <Button onClick={() => setShowCreate(true)} icon={<Plus size={16} />}>
              {t('projects.new')}
            </Button>
          ) : undefined
        }
      />

      <div className="p-6 space-y-5">
        {error && <Alert type="error" message={(error as Error).message} />}

        {/* Search */}
        <div className="relative max-w-sm">
          {searchLoading && isSearchMode
            ? <Loader2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500 animate-spin" />
            : <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          }
          <input
            className="form-input pl-9"
            placeholder={t('projects.searchPlaceholder')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          {isSearchMode && (
            <button
              type="button"
              onClick={() => { setSearch(''); setDebouncedSearch(''); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Projects Grid */}
        {filtered.length === 0 ? (
          <EmptyState
            title={t('projects.noProjects')}
            description={t('projects.noProjectsDesc')}
            action={canCreateProject ? <Button onClick={() => setShowCreate(true)} icon={<Plus size={16} />}>{t('projects.modal.create')}</Button> : undefined}
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
                      {canCreateProject && (
                        <button
                          type="button"
                          onClick={(e) => openRename(e, { id: project.id, name: project.name })}
                          className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title={t('projects.modal.renameTitle')}
                        >
                          <Pencil size={13} />
                        </button>
                      )}
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

        {!isSearchMode && <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />}
      </div>

      {/* Create Project Modal — DSV-010: disable backdrop dismiss so an
          accidental click outside the popup doesn't wipe entered values. */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setCreateError(''); reset(); }} title={t('projects.modal.createTitle')} size="lg" closeOnBackdropClick={false}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {createError && <Alert type="error" message={createError} />}
          <div>
            <label className="form-label">{t('projects.modal.nameLabel')} *</label>
            <input className="form-input" placeholder={t('projects.modal.namePlaceholder')} {...register('name', { required: t('validation.required') })} />
            {errors.name && <p className="form-error">{errors.name.message}</p>}
          </div>
          <div>
            <label className="form-label">{t('projects.modal.descLabel')}</label>
            <textarea className="form-textarea" rows={3} placeholder={t('projects.modal.descPlaceholder')} {...register('description')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">{t('projects.modal.startDate')} *</label>
              <input type="date" className="form-input" {...register('start_date', { required: t('validation.required') })} />
              {errors.start_date && <p className="form-error">{errors.start_date.message}</p>}
            </div>
            <div>
              <label className="form-label">{t('projects.modal.endDate')} *</label>
              <input type="date" className="form-input" {...register('end_date', { required: t('validation.required') })} />
              {errors.end_date && <p className="form-error">{errors.end_date.message}</p>}
            </div>
          </div>
          <div>
            <label className="form-label">{t('projects.modal.ragStatus')}</label>
            <select className="form-select" {...register('rag_status')}>
              <option value="GREEN">{t('projects.modal.ragGreen')}</option>
              <option value="AMBER">{t('projects.modal.ragAmber')}</option>
              <option value="RED">{t('projects.modal.ragRed')}</option>
            </select>
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setShowCreate(false)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={isSubmitting}>{t('projects.modal.create')}</Button>
          </ModalActions>
        </form>
      </Modal>

      <Modal
        open={!!renamingProject}
        onClose={() => { setRenamingProject(null); resetRename(); setRenameError(''); }}
        title={t('projects.modal.renameTitle')}
        size="sm"
      >
        <form onSubmit={handleRenameSubmit(onRename)} className="space-y-4">
          {renameError && <Alert type="error" message={renameError} />}
          <div>
            <label className="form-label">{t('projects.modal.nameLabel')} *</label>
            <input
              className="form-input"
              autoFocus
              {...registerRename('name', {
                required: t('validation.required'),
                validate: v => v.trim().length > 0 || t('validation.cannotBeBlank'),
              })}
            />
            {renameErrors.name && <p className="form-error">{renameErrors.name.message}</p>}
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => { setRenamingProject(null); resetRename(); }}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={isRenaming}>{t('common.save')}</Button>
          </ModalActions>
        </form>
      </Modal>

    </Layout>
  );
};

export default ProjectsPage;