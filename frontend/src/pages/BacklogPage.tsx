import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission, PERMISSIONS } from '../utils/permissions';
import { useForm, Controller } from 'react-hook-form';
import { format, isPast, parseISO } from 'date-fns';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { StatusBadge } from '../components/ui/Badge';
import Modal, { ModalActions } from '../components/ui/Modal';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import { PageSkeleton } from '../components/ui/Skeleton';
import UserAvatar from '../components/ui/UserAvatar';
import UserPicker from '../components/ui/UserPicker';
import {
  useBacklog,
  useSprints,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
} from '../hooks/useTaskSprint';
import { useProjects } from '../hooks/useProjects';
import { useUsers } from '../hooks/useUsers';
import { useI18n } from '../contexts/I18nContext';

// ── Types ─────────────────────────────────────────────────────────────────────

type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
type TaskPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type SprintStatus = 'PLANNING' | 'ACTIVE' | 'COMPLETED';

interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: string;
  storyPoints?: number;
  dueDate?: string;
  sprintId?: string;
}

interface Sprint {
  id: string;
  name: string;
  status: SprintStatus;
  startDate?: string;
  endDate?: string;
}

interface TaskForm {
  title: string;
  description: string;
  priority: TaskPriority;
  assignee_id: string;
  story_points: string;
  due_date: string;
}

interface EditTaskForm extends TaskForm {
  status: TaskStatus;
}

interface MoveToSprintForm {
  sprint_id: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRIORITY_VARIANT: Record<TaskPriority, 'danger' | 'warning' | 'default' | 'gray'> = {
  CRITICAL: 'danger',
  HIGH: 'warning',
  MEDIUM: 'default',
  LOW: 'gray',
};

const fmtDate = (d?: string) => {
  if (!d) return '—';
  try { return format(parseISO(d), 'MMM d, yyyy'); } catch { return d; }
};

const isOverdue = (d?: string, status?: TaskStatus) => {
  if (!d || status === 'DONE') return false;
  try { return isPast(parseISO(d)); } catch { return false; }
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const BacklogPage = () => {
  const { t } = useI18n();
  const { projectId = '' } = useParams<{ tenantSlug: string; projectId?: string }>();
  const { user } = useAuth();
  const canManageApproval = user?.role === 'TENANT_ADMIN' || hasPermission(user, PERMISSIONS.TIME_APPROVE);

  // When accessed via /projects/:projectId/backlog the project is fixed from the URL.
  // When accessed via /backlog (no context) the user must select a project first.
  const [selectedProjectId, setSelectedProjectId] = useState(projectId);

  // Filters
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | TaskStatus>('');
  const [filterPriority, setFilterPriority] = useState<'' | TaskPriority>('');

  // Approval toggle state for create / edit forms
  const [createRequireApproval, setCreateRequireApproval] = useState(false);
  const [editRequireApproval, setEditRequireApproval]     = useState(false);

  // Modal state
  const [showCreate, setShowCreate] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [movingTask, setMovingTask] = useState<Task | null>(null);

  // Error state
  const [createError, setCreateError] = useState('');
  const [editError, setEditError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [moveError, setMoveError] = useState('');

  // Data
  const { data: allProjects = [] } = useProjects();
  const { data: backlogTasks = [], isLoading, error } = useBacklog(selectedProjectId);
  const { data: sprints = [] } = useSprints(selectedProjectId);
  const { data: users = [] } = useUsers();

  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const moveTaskMutation = useUpdateTask();

  // Forms
  const createForm = useForm<TaskForm>({ defaultValues: { priority: 'MEDIUM' } });
  const {
    register: registerEdit,
    handleSubmit: handleEditSubmit,
    reset: resetEdit,
    control: editControl,
    formState: { errors: editErrors, isSubmitting: isEditSubmitting },
  } = useForm<EditTaskForm>();

  const moveForm = useForm<MoveToSprintForm>();

  // Available sprints for moving (PLANNING or ACTIVE only)
  const availableSprints = (sprints as Sprint[]).filter(
    (s) => s.status === 'PLANNING' || s.status === 'ACTIVE'
  );

  // Status and priority options built with translations
  const STATUS_OPTIONS: { value: '' | TaskStatus; label: string }[] = [
    { value: '', label: t('common.all') + ' ' + t('common.status') },
    { value: 'TODO', label: t('tasks.status.todo') },
    { value: 'IN_PROGRESS', label: t('tasks.status.inProgress') },
    { value: 'IN_REVIEW', label: t('tasks.status.inReview') },
    { value: 'DONE', label: t('tasks.status.done') },
  ];

  const PRIORITY_OPTIONS: { value: '' | TaskPriority; label: string }[] = [
    { value: '', label: t('common.all') + ' ' + t('common.priority') },
    { value: 'CRITICAL', label: t('tasks.priority.critical') },
    { value: 'HIGH', label: t('tasks.priority.high') },
    { value: 'MEDIUM', label: t('tasks.priority.medium') },
    { value: 'LOW', label: t('tasks.priority.low') },
  ];

  // Filtered tasks
  const filtered = useMemo(() => {
    return (backlogTasks as Task[]).filter((t) => {
      if (filterStatus && t.status !== filterStatus) return false;
      if (filterPriority && t.priority !== filterPriority) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [backlogTasks, filterStatus, filterPriority, search]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const onCreateTask = async (data: TaskForm) => {
    try {
      setCreateError('');
      if (!selectedProjectId) {
        setCreateError(t('errors.generic'));
        return;
      }
      await createTask.mutateAsync({
        title: data.title,
        description: data.description,
        priority: data.priority,
        assignee_id: data.assignee_id || undefined,
        story_points: data.story_points ? Number(data.story_points) : undefined,
        due_date: data.due_date || undefined,
        project_id: selectedProjectId,
        status: 'TODO',
        sprint_id: null,
        require_approval: createRequireApproval ? 'true' : 'false',
      });
      createForm.reset({ priority: 'MEDIUM' });
      setCreateRequireApproval(false);
      setShowCreate(false);
    } catch (err: unknown) {
      setCreateError((err as Error).message);
    }
  };

  const openEdit = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    setEditingTask(task);
    setEditRequireApproval((task as any).requireApproval === true);
    resetEdit({
      title: task.title,
      description: task.description ?? '',
      status: task.status,
      priority: task.priority,
      assignee_id: task.assigneeId ?? '',
      story_points: task.storyPoints != null ? String(task.storyPoints) : '',
      due_date: task.dueDate ? task.dueDate.slice(0, 10) : '',
    });
    setEditError('');
  };

  const onEditTask = async (data: EditTaskForm) => {
    try {
      setEditError('');
      await updateTask.mutateAsync({
        id: editingTask!.id,
        data: {
          title: data.title,
          description: data.description,
          status: data.status,
          priority: data.priority,
          assignee_id: data.assignee_id || undefined,
          story_points: data.story_points ? Number(data.story_points) : undefined,
          due_date: data.due_date || undefined,
          require_approval: editRequireApproval ? 'true' : 'false',
        },
      });
      setEditingTask(null);
    } catch (err: unknown) {
      setEditError((err as Error).message);
    }
  };

  const openDelete = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    setDeletingTask(task);
    setDeleteError('');
  };

  const onDeleteTask = async () => {
    if (!deletingTask) return;
    try {
      setDeleteError('');
      await deleteTask.mutateAsync(deletingTask.id);
      setDeletingTask(null);
    } catch (err: unknown) {
      setDeleteError((err as Error).message);
    }
  };

  const openMove = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    setMovingTask(task);
    moveForm.reset();
    setMoveError('');
  };

  const onMoveToSprint = async (data: MoveToSprintForm) => {
    if (!movingTask) return;
    try {
      setMoveError('');
      await moveTaskMutation.mutateAsync({ id: movingTask.id, data: { sprint_id: data.sprint_id } });
      setMovingTask(null);
    } catch (err: unknown) {
      setMoveError((err as Error).message);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (isLoading) return <Layout><PageSkeleton /></Layout>;

  return (
    <Layout>
      <Header
        title={t('nav.backlog')}
        subtitle={
          selectedProjectId
            ? `${(backlogTasks as Task[]).length} task${(backlogTasks as Task[]).length !== 1 ? 's' : ''} not in a sprint`
            : t('sprints.backlog')
        }
        actions={
          <Button onClick={() => setShowCreate(true)} disabled={!selectedProjectId}>
            {t('tasks.new')}
          </Button>
        }
      />

      <div className="p-6 space-y-5">
        {error && <Alert type="error" message={(error as Error).message} />}

        {/* Project picker — shown when not locked to a URL-based project */}
        {!projectId && (
          <div className="flex items-center gap-2">
            <select
              className="form-select w-64"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
            >
              <option value="">{t('projects.searchPlaceholder')}</option>
              {(allProjects as { id: string; name: string }[]).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {!selectedProjectId && (
              <span className="text-sm text-amber-600">{t('sprints.backlog')}</span>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="form-input w-56"
            placeholder={t('common.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="form-select w-auto"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as '' | TaskStatus)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            className="form-select w-auto"
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as '' | TaskPriority)}
          >
            {PRIORITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {(search || filterStatus || filterPriority) && (
            <button
              type="button"
              className="text-xs text-gray-500 hover:text-gray-700 underline"
              onClick={() => { setSearch(''); setFilterStatus(''); setFilterPriority(''); }}
            >
              {t('common.clear')}
            </button>
          )}
        </div>

        {/* Task Table */}
        {filtered.length === 0 ? (
          <EmptyState
            title={(backlogTasks as Task[]).length === 0 ? t('tasks.noTasks') : t('common.noResults')}
            description={
              (backlogTasks as Task[]).length === 0
                ? t('tasks.noTasksDesc')
                : t('common.tryAgain')
            }
            action={
              (backlogTasks as Task[]).length === 0 ? (
                <Button onClick={() => setShowCreate(true)}>{t('tasks.new')}</Button>
              ) : undefined
            }
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('common.priority')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('common.title')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('common.status')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('tasks.modal.assignee')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('sprints.velocity')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('common.dueDate')}</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((task: Task) => {
                    const assignee = users.find((u) => u.id === task.assigneeId);
                    const overdue = isOverdue(task.dueDate, task.status);
                    return (
                      <tr key={task.id} className="hover:bg-gray-50 transition-colors group">

                        {/* Priority */}
                        <td className="px-4 py-3">
                          <Badge variant={PRIORITY_VARIANT[task.priority]} className="text-xs">
                            {task.priority}
                          </Badge>
                        </td>

                        {/* Title */}
                        <td className="px-4 py-3 max-w-xs">
                          <span className="font-medium text-gray-900 truncate block">{task.title}</span>
                          {task.description && (
                            <p className="text-xs text-gray-400 truncate mt-0.5 max-w-[280px]">
                              {task.description}
                            </p>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <StatusBadge status={task.status} />
                        </td>

                        {/* Assignee */}
                        <td className="px-4 py-3">
                          {assignee ? (
                            <div className="flex items-center gap-1.5">
                              <UserAvatar name={assignee.name} avatarUrl={assignee.avatarUrl} size="xs" />
                              <span className="text-xs text-gray-600 truncate max-w-[100px]">{assignee.name}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">{t('common.na')}</span>
                          )}
                        </td>

                        {/* Story Points */}
                        <td className="px-4 py-3">
                          {task.storyPoints != null ? (
                            <span className="text-xs text-gray-600 bg-gray-100 rounded-full px-2 py-0.5">
                              {task.storyPoints} pts
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>

                        {/* Due Date */}
                        <td className="px-4 py-3">
                          {task.dueDate ? (
                            <span className={`text-xs ${overdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                              {overdue && <span className="mr-1">!</span>}
                              {fmtDate(task.dueDate)}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              title={t('sprints.addTask')}
                              onClick={(e) => openMove(e, task)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors text-xs font-medium"
                            >
                              {t('common.assign')}
                            </button>
                            <button
                              type="button"
                              title={t('common.edit')}
                              onClick={(e) => openEdit(e, task)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors text-xs font-medium"
                            >
                              {t('common.edit')}
                            </button>
                            <button
                              type="button"
                              title={t('common.delete')}
                              onClick={(e) => openDelete(e, task)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors text-xs font-medium"
                            >
                              {t('common.delete')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* Create Task Modal */}
      <Modal
        open={showCreate}
        onClose={() => { setShowCreate(false); createForm.reset({ priority: 'MEDIUM' }); setCreateError(''); }}
        title={t('tasks.modal.createTitle')}
        size="lg"
      >
        <form onSubmit={createForm.handleSubmit(onCreateTask)} className="space-y-4">
          {createError && <Alert type="error" message={createError} />}

          {/* Project selection is mandatory; locked to URL project when available */}
          <div>
            <label className="form-label">{t('tasks.modal.project')}</label>
            {projectId ? (
              <div className="form-input bg-gray-50 text-gray-600 cursor-not-allowed">
                {(allProjects as { id: string; name: string }[]).find((p) => p.id === projectId)?.name ?? projectId}
              </div>
            ) : (
              <select
                className="form-select"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                required
              >
                <option value="">{t('projects.searchPlaceholder')}</option>
                {(allProjects as { id: string; name: string }[]).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="form-label">{t('tasks.modal.titleLabel')}</label>
            <input
              className="form-input"
              placeholder={t('common.searchPlaceholder')}
              {...createForm.register('title', { required: t('validation.required') })}
            />
            {createForm.formState.errors.title && (
              <p className="form-error">{createForm.formState.errors.title.message}</p>
            )}
          </div>
          <div>
            <label className="form-label">{t('tasks.modal.descLabel')}</label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder={t('common.optional')}
              {...createForm.register('description')}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">{t('tasks.modal.priority')}</label>
              <select className="form-select" {...createForm.register('priority')}>
                {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as TaskPriority[]).map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">{t('tasks.modal.assignee')}</label>
              <Controller
                name="assignee_id"
                control={createForm.control}
                defaultValue=""
                render={({ field }) => (
                  <UserPicker
                    users={users.map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatarUrl }))}
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    placeholder={t('common.na')}
                    allowEmpty
                  />
                )}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">{t('sprints.velocity')}</label>
              <input
                type="number"
                min={0}
                max={100}
                className="form-input"
                placeholder="e.g. 3"
                {...createForm.register('story_points')}
              />
            </div>
            <div>
              <label className="form-label">{t('tasks.modal.dueDate')}</label>
              <input
                type="date"
                className="form-input"
                min={new Date().toISOString().split('T')[0]}
                {...createForm.register('due_date', { required: t('validation.required') })}
              />
              {createForm.formState.errors.due_date && (
                <p className="form-error">{createForm.formState.errors.due_date.message as string}</p>
              )}
            </div>
          </div>
          {canManageApproval && (
            <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-amber-900">{t('timeTracking.title')}</p>
                <p className="text-xs text-amber-600 mt-0.5">Time entries will be sent to <strong>you</strong> ({user?.name ?? 'task owner'}) for approval</p>
              </div>
              <button
                type="button"
                onClick={() => setCreateRequireApproval((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${createRequireApproval ? 'bg-amber-500' : 'bg-gray-300'}`}
                role="switch"
                aria-checked={createRequireApproval}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${createRequireApproval ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          )}
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setShowCreate(false)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={createForm.formState.isSubmitting}>{t('tasks.modal.create')}</Button>
          </ModalActions>
        </form>
      </Modal>

      {/* Edit Task Modal */}
      <Modal
        open={!!editingTask}
        onClose={() => { setEditingTask(null); setEditError(''); }}
        title={t('tasks.modal.editTitle')}
        size="lg"
      >
        <form onSubmit={handleEditSubmit(onEditTask)} className="space-y-4">
          {editError && <Alert type="error" message={editError} />}
          <div>
            <label className="form-label">{t('tasks.modal.titleLabel')}</label>
            <input className="form-input" {...registerEdit('title', { required: t('validation.required') })} />
            {editErrors.title && <p className="form-error">{editErrors.title.message}</p>}
          </div>
          <div>
            <label className="form-label">{t('tasks.modal.descLabel')}</label>
            <textarea className="form-textarea" rows={3} {...registerEdit('description')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">{t('tasks.modal.status')}</label>
              <select className="form-select" {...registerEdit('status')}>
                {(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as TaskStatus[]).map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">{t('tasks.modal.priority')}</label>
              <select className="form-select" {...registerEdit('priority')}>
                {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as TaskPriority[]).map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">{t('tasks.modal.assignee')}</label>
              <Controller
                name="assignee_id"
                control={editControl}
                defaultValue=""
                render={({ field }) => (
                  <UserPicker
                    users={users.map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatarUrl }))}
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    placeholder={t('common.na')}
                    allowEmpty
                  />
                )}
              />
            </div>
            <div>
              <label className="form-label">{t('sprints.velocity')}</label>
              <input type="number" min={0} max={100} className="form-input" {...registerEdit('story_points')} />
            </div>
          </div>
          <div>
            <label className="form-label">{t('tasks.modal.dueDate')}</label>
            <input type="date" className="form-input" {...registerEdit('due_date')} />
          </div>
          {canManageApproval && (
            <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-amber-900">{t('timeTracking.title')}</p>
                <p className="text-xs text-amber-600 mt-0.5">Time entries logged on this task will be sent to the task owner for approval</p>
              </div>
              <button
                type="button"
                onClick={() => setEditRequireApproval((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${editRequireApproval ? 'bg-amber-500' : 'bg-gray-300'}`}
                role="switch"
                aria-checked={editRequireApproval}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editRequireApproval ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          )}
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setEditingTask(null)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={isEditSubmitting}>{t('tasks.modal.save')}</Button>
          </ModalActions>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deletingTask}
        onClose={() => { setDeletingTask(null); setDeleteError(''); }}
        title={t('common.confirmDeleteTitle')}
        size="sm"
      >
        <div className="space-y-4">
          {deleteError && <Alert type="error" message={deleteError} />}
          <p className="text-sm text-gray-600">
            {t('common.confirmDeleteDesc')}{' '}
            <span className="font-semibold text-gray-900">"{deletingTask?.title}"</span>?
          </p>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setDeletingTask(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" loading={deleteTask.isPending} onClick={onDeleteTask}>
              {t('common.delete')}
            </Button>
          </ModalActions>
        </div>
      </Modal>

      {/* Move to Sprint Modal */}
      <Modal
        open={!!movingTask}
        onClose={() => { setMovingTask(null); setMoveError(''); }}
        title={t('sprints.addTask')}
        size="sm"
      >
        <form onSubmit={moveForm.handleSubmit(onMoveToSprint)} className="space-y-4">
          {moveError && <Alert type="error" message={moveError} />}
          <p className="text-sm text-gray-600 font-medium truncate">"{movingTask?.title}"</p>
          {availableSprints.length === 0 ? (
            <Alert type="warning" message={t('sprints.noSprints')} />
          ) : (
            <div>
              <label className="form-label">{t('sprints.title')}</label>
              <select
                className="form-select"
                {...moveForm.register('sprint_id', { required: t('validation.required') })}
              >
                <option value="">{t('sprints.title')}…</option>
                {availableSprints.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
                ))}
              </select>
              {moveForm.formState.errors.sprint_id && (
                <p className="form-error">{moveForm.formState.errors.sprint_id.message}</p>
              )}
            </div>
          )}
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setMovingTask(null)}>{t('common.cancel')}</Button>
            <Button
              type="submit"
              loading={moveTaskMutation.isPending}
              disabled={availableSprints.length === 0}
            >
              {t('sprints.addTask')}
            </Button>
          </ModalActions>
        </form>
      </Modal>
    </Layout>
  );
};

export default BacklogPage;
