import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  Plus, Search, Calendar, Trash2, Pencil, MoveRight,
  Star, AlertCircle, User, Layers,
} from 'lucide-react';
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
import {
  useBacklog,
  useSprints,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
} from '../hooks/useTaskSprint';
import { useUsers } from '../hooks/useUsers';

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

const STATUS_OPTIONS: { value: '' | TaskStatus; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'TODO', label: 'To Do' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'IN_REVIEW', label: 'In Review' },
  { value: 'DONE', label: 'Done' },
];

const PRIORITY_OPTIONS: { value: '' | TaskPriority; label: string }[] = [
  { value: '', label: 'All Priorities' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

// ── Main Page ─────────────────────────────────────────────────────────────────

const BacklogPage = () => {
  const { projectId = '' } = useParams<{ tenantSlug: string; projectId?: string }>();

  // Filters
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | TaskStatus>('');
  const [filterPriority, setFilterPriority] = useState<'' | TaskPriority>('');

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
  const { data: backlogTasks = [], isLoading, error } = useBacklog(projectId);
  const { data: sprints = [] } = useSprints(projectId);
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
    formState: { errors: editErrors, isSubmitting: isEditSubmitting },
  } = useForm<EditTaskForm>();

  const moveForm = useForm<MoveToSprintForm>();

  // Available sprints for moving (PLANNING or ACTIVE only)
  const availableSprints = (sprints as Sprint[]).filter(
    (s) => s.status === 'PLANNING' || s.status === 'ACTIVE'
  );

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
      await createTask.mutateAsync({
        title: data.title,
        description: data.description,
        priority: data.priority,
        assignee_id: data.assignee_id || undefined,
        story_points: data.story_points ? Number(data.story_points) : undefined,
        due_date: data.due_date || undefined,
        project_id: projectId,
        status: 'TODO',
        sprint_id: null,
      });
      createForm.reset({ priority: 'MEDIUM' });
      setShowCreate(false);
    } catch (err: unknown) {
      setCreateError((err as Error).message);
    }
  };

  const openEdit = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    setEditingTask(task);
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
      await moveTaskMutation.mutateAsync({ id: movingTask!.id, data: { sprint_id: data.sprint_id } });
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
        title="Backlog"
        subtitle={`${(backlogTasks as Task[]).length} task${(backlogTasks as Task[]).length !== 1 ? 's' : ''} not in a sprint`}
        actions={
          <Button onClick={() => setShowCreate(true)} icon={<Plus size={16} />}>
            New Task
          </Button>
        }
      />

      <div className="p-6 space-y-5">
        {error && <Alert type="error" message={(error as Error).message} />}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="form-input pl-9 w-56"
              placeholder="Search tasks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
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
              Clear filters
            </button>
          )}
        </div>

        {/* Task Table */}
        {filtered.length === 0 ? (
          <EmptyState
            title={(backlogTasks as Task[]).length === 0 ? 'Backlog is empty' : 'No tasks match your filters'}
            description={
              (backlogTasks as Task[]).length === 0
                ? 'Add tasks to the backlog to start planning sprints.'
                : 'Try adjusting your search or filters.'
            }
            icon={<Layers size={40} />}
            action={
              (backlogTasks as Task[]).length === 0 ? (
                <Button onClick={() => setShowCreate(true)} icon={<Plus size={16} />}>
                  Add First Task
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-8">
                      Priority
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Title
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Status
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Assignee
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Points
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Due Date
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Actions
                    </th>
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
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 truncate">{task.title}</span>
                          </div>
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
                            <div className="flex items-center gap-1 text-gray-400">
                              <User size={13} />
                              <span className="text-xs">Unassigned</span>
                            </div>
                          )}
                        </td>

                        {/* Story Points */}
                        <td className="px-4 py-3">
                          {task.storyPoints != null ? (
                            <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-100 rounded-full px-2 py-0.5">
                              <Star size={10} />
                              {task.storyPoints}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>

                        {/* Due Date */}
                        <td className="px-4 py-3">
                          {task.dueDate ? (
                            <span
                              className={`inline-flex items-center gap-1 text-xs ${
                                overdue ? 'text-red-600 font-medium' : 'text-gray-500'
                              }`}
                            >
                              {overdue && <AlertCircle size={11} />}
                              <Calendar size={11} />
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
                              title="Move to Sprint"
                              onClick={(e) => openMove(e, task)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            >
                              <MoveRight size={14} />
                            </button>
                            <button
                              type="button"
                              title="Edit task"
                              onClick={(e) => openEdit(e, task)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              title="Delete task"
                              onClick={(e) => openDelete(e, task)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 size={14} />
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
        title="Add Task to Backlog"
        size="lg"
      >
        <form onSubmit={createForm.handleSubmit(onCreateTask)} className="space-y-4">
          {createError && <Alert type="error" message={createError} />}
          <div>
            <label className="form-label">Title *</label>
            <input
              className="form-input"
              placeholder="What needs to be done?"
              {...createForm.register('title', { required: 'Required' })}
            />
            {createForm.formState.errors.title && (
              <p className="form-error">{createForm.formState.errors.title.message}</p>
            )}
          </div>
          <div>
            <label className="form-label">Description</label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="Details, acceptance criteria…"
              {...createForm.register('description')}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Priority</label>
              <select className="form-select" {...createForm.register('priority')}>
                {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as TaskPriority[]).map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Assignee</label>
              <select className="form-select" {...createForm.register('assignee_id')}>
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Story Points</label>
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
              <label className="form-label">Due Date</label>
              <input type="date" className="form-input" {...createForm.register('due_date')} />
            </div>
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createForm.formState.isSubmitting} icon={<Plus size={14} />}>
              Add to Backlog
            </Button>
          </ModalActions>
        </form>
      </Modal>

      {/* Edit Task Modal */}
      <Modal
        open={!!editingTask}
        onClose={() => { setEditingTask(null); setEditError(''); }}
        title="Edit Task"
        size="lg"
      >
        <form onSubmit={handleEditSubmit(onEditTask)} className="space-y-4">
          {editError && <Alert type="error" message={editError} />}
          <div>
            <label className="form-label">Title *</label>
            <input
              className="form-input"
              {...registerEdit('title', { required: 'Required' })}
            />
            {editErrors.title && <p className="form-error">{editErrors.title.message}</p>}
          </div>
          <div>
            <label className="form-label">Description</label>
            <textarea className="form-textarea" rows={3} {...registerEdit('description')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Status</label>
              <select className="form-select" {...registerEdit('status')}>
                {(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as TaskStatus[]).map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Priority</label>
              <select className="form-select" {...registerEdit('priority')}>
                {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as TaskPriority[]).map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Assignee</label>
              <select className="form-select" {...registerEdit('assignee_id')}>
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Story Points</label>
              <input type="number" min={0} max={100} className="form-input" {...registerEdit('story_points')} />
            </div>
          </div>
          <div>
            <label className="form-label">Due Date</label>
            <input type="date" className="form-input" {...registerEdit('due_date')} />
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setEditingTask(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={isEditSubmitting}>
              Save Changes
            </Button>
          </ModalActions>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deletingTask}
        onClose={() => { setDeletingTask(null); setDeleteError(''); }}
        title="Delete Task"
        size="sm"
      >
        <div className="space-y-4">
          {deleteError && <Alert type="error" message={deleteError} />}
          <p className="text-sm text-gray-600">
            Are you sure you want to delete{' '}
            <span className="font-semibold text-gray-900">"{deletingTask?.title}"</span>?
            This action cannot be undone.
          </p>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setDeletingTask(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={deleteTask.isPending}
              icon={<Trash2 size={14} />}
              onClick={onDeleteTask}
            >
              Delete Task
            </Button>
          </ModalActions>
        </div>
      </Modal>

      {/* Move to Sprint Modal */}
      <Modal
        open={!!movingTask}
        onClose={() => { setMovingTask(null); setMoveError(''); }}
        title="Move to Sprint"
        size="sm"
      >
        <form onSubmit={moveForm.handleSubmit(onMoveToSprint)} className="space-y-4">
          {moveError && <Alert type="error" message={moveError} />}
          <p className="text-sm text-gray-600 font-medium truncate">
            "{movingTask?.title}"
          </p>
          {availableSprints.length === 0 ? (
            <Alert
              type="warning"
              message="No active or planning sprints available. Create a sprint first."
            />
          ) : (
            <div>
              <label className="form-label">Select Sprint *</label>
              <select
                className="form-select"
                {...moveForm.register('sprint_id', { required: 'Required' })}
              >
                <option value="">Select a sprint…</option>
                {availableSprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.status})
                  </option>
                ))}
              </select>
              {moveForm.formState.errors.sprint_id && (
                <p className="form-error">{moveForm.formState.errors.sprint_id.message}</p>
              )}
            </div>
          )}
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setMovingTask(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={moveTaskMutation.isPending}
              disabled={availableSprints.length === 0}
              icon={<MoveRight size={14} />}
            >
              Move to Sprint
            </Button>
          </ModalActions>
        </form>
      </Modal>
    </Layout>
  );
};

export default BacklogPage;
