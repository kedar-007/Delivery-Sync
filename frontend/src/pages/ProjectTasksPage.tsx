import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  Plus, Search, Filter, ChevronDown, ChevronUp, Edit2, Trash2,
  User, Clock, Tag, ArrowUpRight, CheckCircle2, Circle, AlertCircle,
  Layers, Bug, Bookmark, Zap, Timer, Check, Paperclip, X,
} from 'lucide-react';
import { format, parseISO, isPast } from 'date-fns';
import { useForm } from 'react-hook-form';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Modal, { ModalActions } from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import UserAvatar from '../components/ui/UserAvatar';
import EmptyState from '../components/ui/EmptyState';
import Alert from '../components/ui/Alert';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { PageSkeleton } from '../components/ui/Skeleton';
import { useAuth } from '../contexts/AuthContext';
import {
  useTasks, useSprints, useCreateTask, useUpdateTask, useDeleteTask,
} from '../hooks/useTaskSprint';
import { useUsers } from '../hooks/useUsers';
import { timeEntriesApi } from '../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type TaskStatus   = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
type TaskPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type TaskType     = 'TASK' | 'STORY' | 'BUG' | 'EPIC' | 'SUBTASK';

interface Task {
  id: string;
  title: string;
  description?: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: string;
  assigneeIds?: string[];
  storyPoints?: number;
  estimatedHours?: number;
  loggedHours?: number;
  dueDate?: string;
  sprintId?: string;
  labels?: string[];
  projectId: string;
}

interface User {
  id: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
}

interface TaskFormData {
  title: string;
  description: string;
  type: TaskType;
  priority: TaskPriority;
  story_points: number;
  estimated_hours: number;
  due_date: string;
  sprint_id: string;
  labels: string;
  status: TaskStatus;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; dot: string }> = {
  CRITICAL: { label: 'Critical', color: 'text-red-700 bg-red-50 border-red-200',    dot: 'bg-red-500'    },
  HIGH:     { label: 'High',     color: 'text-orange-700 bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
  MEDIUM:   { label: 'Medium',   color: 'text-yellow-700 bg-yellow-50 border-yellow-200', dot: 'bg-yellow-500' },
  LOW:      { label: 'Low',      color: 'text-gray-600 bg-gray-50 border-gray-200',  dot: 'bg-gray-400'   },
};

const STATUS_CONFIG: Record<TaskStatus, { label: string; icon: React.ReactNode; color: string }> = {
  TODO:        { label: 'To Do',       icon: <Circle size={14} />,        color: 'text-gray-500 bg-gray-50 border-gray-200'    },
  IN_PROGRESS: { label: 'In Progress', icon: <ArrowUpRight size={14} />,  color: 'text-blue-700 bg-blue-50 border-blue-200'    },
  IN_REVIEW:   { label: 'In Review',   icon: <AlertCircle size={14} />,   color: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
  DONE:        { label: 'Done',        icon: <CheckCircle2 size={14} />,  color: 'text-green-700 bg-green-50 border-green-200'  },
};

const TYPE_ICON: Record<TaskType, React.ReactNode> = {
  TASK:    <Layers size={13} className="text-blue-500" />,
  STORY:   <Bookmark size={13} className="text-green-500" />,
  BUG:     <Bug size={13} className="text-red-500" />,
  EPIC:    <Zap size={13} className="text-purple-500" />,
  SUBTASK: <Layers size={13} className="text-gray-400" />,
};

function Avatar({ userId, users }: { userId: string; users: User[] }) {
  const u = users.find((x) => String(x.id) === String(userId));
  return (
    <div title={u?.name ?? u?.email ?? userId}>
      <UserAvatar name={u?.name ?? u?.email ?? userId} avatarUrl={u?.avatarUrl} size="xs" />
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProjectTasksPage() {
  const { projectId, tenantSlug } = useParams<{ projectId: string; tenantSlug: string }>();
  const { user } = useAuth();
  const { confirm } = useConfirm();

  const isAdmin = ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO'].includes(user?.role ?? '');

  // ── Data ──
  const { data: rawTasks, isLoading, error } = useTasks({ project_id: projectId! });
  const { data: rawSprints = [] } = useSprints(projectId!);
  const { data: users = [] } = useUsers();

  const tasks: Task[] = useMemo(() => {
    const arr = Array.isArray(rawTasks) ? rawTasks : (rawTasks as { data?: Task[] })?.data ?? [];
    return arr as Task[];
  }, [rawTasks]);

  const sprints = useMemo(() => {
    return Array.isArray(rawSprints) ? rawSprints : [];
  }, [rawSprints]);

  // ── Filters ──
  const [search, setSearch]         = useState('');
  const [filterStatus, setFilterStatus]   = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterType, setFilterType]     = useState('');
  const [filterSprint, setFilterSprint]   = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [showFilters, setShowFilters]   = useState(false);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterStatus && t.status !== filterStatus) return false;
      if (filterPriority && t.priority !== filterPriority) return false;
      if (filterType && t.type !== filterType) return false;
      if (filterSprint && t.sprintId !== filterSprint) return false;
      if (filterAssignee && !t.assigneeIds?.includes(filterAssignee)) return false;
      return true;
    });
  }, [tasks, search, filterStatus, filterPriority, filterType, filterSprint, filterAssignee]);

  // ── Mutations ──
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  // ── Create / Edit Modal ──
  const [showCreate, setShowCreate] = useState(false);
  const [editTask, setEditTask]     = useState<Task | null>(null);
  const [formError, setFormError]   = useState('');

  // ── Assignee state (managed outside react-hook-form) ──
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<TaskFormData>({
    defaultValues: {
      type: 'TASK', priority: 'MEDIUM', status: 'TODO',
      story_points: 0, estimated_hours: 0,
    },
  });

  const openCreate = () => {
    reset({ type: 'TASK', priority: 'MEDIUM', status: 'TODO', story_points: 0, estimated_hours: 0 });
    setSelectedAssignees([]);
    setFormError('');
    setShowCreate(true);
  };

  const openEdit = (t: Task) => {
    reset({
      title: t.title,
      description: t.description ?? '',
      type: t.type,
      priority: t.priority,
      status: t.status,
      story_points: t.storyPoints ?? 0,
      estimated_hours: t.estimatedHours ?? 0,
      due_date: t.dueDate ?? '',
      sprint_id: t.sprintId ?? '',
      labels: (t.labels ?? []).join(', '),
    });
    setSelectedAssignees(t.assigneeIds ?? [t.assigneeId].filter(Boolean) as string[]);
    setFormError('');
    setEditTask(t);
  };

  const onSubmitCreate = handleSubmit(async (data) => {
    try {
      setFormError('');
      await createTask.mutateAsync({
        project_id:      projectId,
        title:           data.title,
        description:     data.description,
        type:            data.type,
        priority:        data.priority,
        status:          data.status,
        story_points:    data.story_points || undefined,
        estimated_hours: data.estimated_hours || undefined,
        due_date:        data.due_date || undefined,
        sprint_id:       data.sprint_id || undefined,
        assignee_id:     selectedAssignees[0] ?? undefined,
        labels:          JSON.stringify(data.labels?.split(',').map((s) => s.trim()).filter(Boolean) ?? []),
      });
      setShowCreate(false);
    } catch (e: unknown) { setFormError((e as Error).message); }
  });

  const onSubmitEdit = handleSubmit(async (data) => {
    if (!editTask) return;
    try {
      setFormError('');
      await updateTask.mutateAsync({
        id: editTask.id,
        data: {
          title:           data.title,
          description:     data.description,
          type:            data.type,
          priority:        data.priority,
          status:          data.status,
          story_points:    data.story_points || undefined,
          estimated_hours: data.estimated_hours || undefined,
          due_date:        data.due_date || undefined,
          sprint_id:       data.sprint_id || undefined,
          assignee_id:     selectedAssignees[0] ?? undefined,
          labels:          JSON.stringify(data.labels?.split(',').map((s) => s.trim()).filter(Boolean) ?? []),
        },
      });
      setEditTask(null);
    } catch (e: unknown) { setFormError((e as Error).message); }
  });

  const handleDelete = async (t: Task) => {
    const ok = await confirm({ title: 'Delete Task', message: `"${t.title}" will be permanently deleted.`, confirmText: 'Delete', variant: 'danger' });
    if (!ok) return;
    await deleteTask.mutateAsync(t.id);
  };

  // ── Quick status update ──
  const handleStatusChange = (t: Task, status: string) => {
    updateTask.mutate({ id: t.id, data: { status } });
  };

  // ── Log Time ──
  const [logTimeTask, setLogTimeTask] = useState<Task | null>(null);
  const [logHours, setLogHours]       = useState('');
  const [logDate, setLogDate]         = useState(new Date().toISOString().slice(0, 10));
  const [logDesc, setLogDesc]         = useState('');
  const [logBillable, setLogBillable] = useState(false);
  const [logPending, setLogPending]   = useState(false);
  const [logError, setLogError]       = useState('');

  const handleLogTime = async () => {
    if (!logTimeTask || !logHours) return;
    setLogPending(true); setLogError('');
    try {
      await timeEntriesApi.create({
        project_id:  logTimeTask.projectId,
        task_id:     logTimeTask.id,
        entry_date:  logDate,
        hours:       parseFloat(logHours),
        description: logDesc || logTimeTask.title,
        is_billable: logBillable,
      });
      setLogTimeTask(null);
      setLogHours(''); setLogDesc('');
    } catch (e: unknown) {
      setLogError((e as Error).message);
    } finally { setLogPending(false); }
  };

  // ── Grouping ──
  const groupedByStatus = useMemo(() => {
    const groups: Record<string, Task[]> = { TODO: [], IN_PROGRESS: [], IN_REVIEW: [], DONE: [] };
    for (const t of filtered) {
      if (groups[t.status]) groups[t.status].push(t);
      else groups[t.status] = [t];
    }
    return groups;
  }, [filtered]);

  // ── Render ──
  if (isLoading) return <Layout><PageSkeleton /></Layout>;
  if (error) return <Layout><Alert type="error" message={(error as Error).message} className="m-6" /></Layout>;

  const activeSprint = sprints.find((s: { status: string }) => s.status === 'ACTIVE');

  return (
    <Layout>
      <Header
        title="Project Tasks"
        subtitle={`${filtered.length} task${filtered.length !== 1 ? 's' : ''}${activeSprint ? ` • Active: ${(activeSprint as { name: string }).name}` : ''}`}
        actions={
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={openCreate}>
            New Task
          </Button>
        }
      />

      <div className="p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none"
              placeholder="Search tasks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            size="sm" variant="secondary"
            icon={<Filter size={13} />}
            onClick={() => setShowFilters((v) => !v)}
          >
            Filters {(filterStatus || filterPriority || filterType || filterSprint || filterAssignee) ? '●' : ''}
          </Button>
        </div>

        {/* Filter bar */}
        {showFilters && (
          <div className="flex flex-wrap gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <select className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-200"
              value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="TODO">To Do</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="IN_REVIEW">In Review</option>
              <option value="DONE">Done</option>
            </select>
            <select className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-200"
              value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
              <option value="">All Priorities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
            <select className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-200"
              value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">All Types</option>
              <option value="TASK">Task</option>
              <option value="STORY">Story</option>
              <option value="BUG">Bug</option>
              <option value="EPIC">Epic</option>
              <option value="SUBTASK">Subtask</option>
            </select>
            <select className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-200"
              value={filterSprint} onChange={(e) => setFilterSprint(e.target.value)}>
              <option value="">All Sprints</option>
              <option value="__backlog__">Backlog (no sprint)</option>
              {sprints.map((s: { id: string; name: string }) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-200"
              value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)}>
              <option value="">All Assignees</option>
              {(users as User[]).map((u) => (
                <option key={u.id} value={String(u.id)}>{u.name ?? u.email ?? u.id}</option>
              ))}
            </select>
            {(filterStatus || filterPriority || filterType || filterSprint || filterAssignee) && (
              <button className="text-xs text-red-500 hover:text-red-700"
                onClick={() => { setFilterStatus(''); setFilterPriority(''); setFilterType(''); setFilterSprint(''); setFilterAssignee(''); }}>
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Summary bar */}
        <div className="flex gap-4 text-xs text-gray-500">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <span key={key} className="flex items-center gap-1">
              {cfg.icon}
              <span className="font-medium text-gray-700">{groupedByStatus[key]?.length ?? 0}</span> {cfg.label}
            </span>
          ))}
        </div>

        {/* Task list per status group */}
        {filtered.length === 0 ? (
          <EmptyState
            title="No tasks found"
            description={search || filterStatus || filterPriority ? 'Try adjusting your filters.' : 'Create your first task to get started.'}
            icon={<Layers size={32} className="text-gray-300" />}
            action={<Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={openCreate}>Create Task</Button>}
          />
        ) : (
          <div className="space-y-6">
            {(Object.entries(groupedByStatus) as [TaskStatus, Task[]][])
              .filter(([, list]) => list.length > 0)
              .map(([status, list]) => (
                <StatusGroup
                  key={status}
                  status={status}
                  tasks={list}
                  users={users as User[]}
                  sprints={sprints as { id: string; name: string }[]}
                  isAdmin={isAdmin}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onStatusChange={handleStatusChange}
                  onLogTime={(t) => { setLogTimeTask(t); setLogHours(''); setLogDesc(''); setLogDate(new Date().toISOString().slice(0, 10)); }}
                />
              ))}
          </div>
        )}
      </div>

      {/* ── Create Task Modal ──────────────────────────────────────────────── */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create Task"
        size="lg"
      >
        <form onSubmit={onSubmitCreate} className="space-y-4">
          {formError && <Alert type="error" message={formError} />}
          <TaskFormFields
            register={register}
            errors={errors}
            sprints={sprints as { id: string; name: string }[]}
            users={users as User[]}
            selectedAssignees={selectedAssignees}
            onAssigneesChange={setSelectedAssignees}
            onAttachmentChange={() => {}}
          />
          <ModalActions>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={createTask.isPending}>Create Task</Button>
          </ModalActions>
        </form>
      </Modal>

      {/* ── Edit Task Modal ────────────────────────────────────────────────── */}
      <Modal
        open={!!editTask}
        onClose={() => setEditTask(null)}
        title="Edit Task"
        size="lg"
      >
        {editTask && (
          <form onSubmit={onSubmitEdit} className="space-y-4">
            {formError && <Alert type="error" message={formError} />}
            <TaskFormFields
              register={register}
              errors={errors}
              sprints={sprints as { id: string; name: string }[]}
              users={users as User[]}
              selectedAssignees={selectedAssignees}
              onAssigneesChange={setSelectedAssignees}
              onAttachmentChange={() => {}}
            />
            <ModalActions>
              <Button variant="secondary" onClick={() => setEditTask(null)}>Cancel</Button>
              <Button type="submit" variant="primary" loading={updateTask.isPending}>Save Changes</Button>
            </ModalActions>
          </form>
        )}
      </Modal>

      {/* ── Log Time Modal ─────────────────────────────────────────────────── */}
      <Modal
        open={!!logTimeTask}
        onClose={() => setLogTimeTask(null)}
        title={`Log Time — ${logTimeTask?.title ?? ''}`}
        size="sm"
      >
        <div className="space-y-4">
          {logError && <Alert type="error" message={logError} />}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Hours *</label>
              <input type="number" step="0.25" min="0.25" className="form-input"
                placeholder="1.5" value={logHours} onChange={(e) => setLogHours(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Date *</label>
              <input type="date" className="form-input" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="form-label">Description</label>
            <input className="form-input" placeholder="What did you work on?"
              value={logDesc} onChange={(e) => setLogDesc(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={logBillable} onChange={(e) => setLogBillable(e.target.checked)} className="rounded" />
            Billable
          </label>
          <ModalActions>
            <Button variant="secondary" onClick={() => setLogTimeTask(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={logPending}
              disabled={!logHours || !logDate}
              onClick={handleLogTime}
            >
              Save Entry
            </Button>
          </ModalActions>
        </div>
      </Modal>
    </Layout>
  );
}

// ── Status Group ──────────────────────────────────────────────────────────────

function StatusGroup({
  status, tasks, users, sprints, isAdmin,
  onEdit, onDelete, onStatusChange, onLogTime,
}: {
  status: TaskStatus;
  tasks: Task[];
  users: User[];
  sprints: { id: string; name: string }[];
  isAdmin: boolean;
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
  onStatusChange: (t: Task, status: string) => void;
  onLogTime: (t: Task) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const cfg = STATUS_CONFIG[status];

  return (
    <div>
      <button
        className="flex items-center gap-2 w-full text-left mb-2 group"
        onClick={() => setCollapsed((v) => !v)}
      >
        <span className={`text-xs font-semibold px-2 py-0.5 rounded border inline-flex items-center gap-1 ${cfg.color}`}>
          {cfg.icon} {cfg.label}
        </span>
        <span className="text-xs text-gray-400 font-medium">{tasks.length}</span>
        <span className="ml-auto text-gray-400 group-hover:text-gray-600">
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </span>
      </button>

      {!collapsed && (
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 w-8"></th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Title</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 hidden md:table-cell">Priority</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 hidden lg:table-cell">Sprint</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 hidden lg:table-cell">Assignees</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 hidden xl:table-cell">Due</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 hidden xl:table-cell">Points</th>
                <th className="px-3 py-2 text-xs font-semibold text-gray-500 w-28">Status</th>
                <th className="px-3 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  users={users}
                  sprints={sprints}
                  isAdmin={isAdmin}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onStatusChange={onStatusChange}
                  onLogTime={onLogTime}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Task Row ──────────────────────────────────────────────────────────────────

function TaskRow({
  task, users, sprints, isAdmin, onEdit, onDelete, onStatusChange, onLogTime,
}: {
  task: Task;
  users: User[];
  sprints: { id: string; name: string }[];
  isAdmin: boolean;
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
  onStatusChange: (t: Task, status: string) => void;
  onLogTime: (t: Task) => void;
}) {
  const priCfg = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.MEDIUM;
  const sprint = sprints.find((s) => s.id === task.sprintId);
  const isDue  = task.dueDate && isPast(parseISO(task.dueDate)) && task.status !== 'DONE';

  return (
    <tr className="hover:bg-gray-50 transition-colors group">
      {/* Type icon */}
      <td className="px-4 py-3">{TYPE_ICON[task.type] ?? TYPE_ICON.TASK}</td>

      {/* Title + labels */}
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900 text-sm leading-snug">{task.title}</div>
        {(task.labels ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {(task.labels ?? []).map((l) => (
              <span key={l} className="inline-flex items-center gap-0.5 text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">
                <Tag size={9} /> {l}
              </span>
            ))}
          </div>
        )}
      </td>

      {/* Priority */}
      <td className="px-3 py-3 hidden md:table-cell">
        <span className={`text-xs px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${priCfg.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${priCfg.dot}`} />
          {priCfg.label}
        </span>
      </td>

      {/* Sprint */}
      <td className="px-3 py-3 hidden lg:table-cell text-xs text-gray-500">
        {sprint ? sprint.name : <span className="text-gray-300">Backlog</span>}
      </td>

      {/* Assignees */}
      <td className="px-3 py-3 hidden lg:table-cell">
        {(task.assigneeIds?.length ?? 0) > 0 ? (
          <div className="flex -space-x-1">
            {(task.assigneeIds ?? []).slice(0, 4).map((uid) => (
              <Avatar key={uid} userId={uid} users={users} />
            ))}
            {(task.assigneeIds?.length ?? 0) > 4 && (
              <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500 border border-white">
                +{(task.assigneeIds?.length ?? 0) - 4}
              </div>
            )}
          </div>
        ) : (
          <span className="text-xs text-gray-300 flex items-center gap-1"><User size={11} /> Unassigned</span>
        )}
      </td>

      {/* Due date */}
      <td className="px-3 py-3 hidden xl:table-cell">
        {task.dueDate ? (
          <span className={`text-xs flex items-center gap-1 ${isDue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
            <Clock size={11} />
            {format(parseISO(task.dueDate), 'MMM d')}
          </span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>

      {/* Story points */}
      <td className="px-3 py-3 hidden xl:table-cell text-xs text-indigo-600 font-semibold">
        {task.storyPoints ? `${task.storyPoints} pts` : <span className="text-gray-300">—</span>}
      </td>

      {/* Status dropdown */}
      <td className="px-3 py-3">
        <select
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
          value={task.status}
          onChange={(e) => onStatusChange(task, e.target.value)}
        >
          <option value="TODO">To Do</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="IN_REVIEW">In Review</option>
          <option value="DONE">Done</option>
        </select>
      </td>

      {/* Actions */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            className="p-1 rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            title="Log Time"
            onClick={() => onLogTime(task)}
          >
            <Timer size={13} />
          </button>
          <button
            className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="Edit"
            onClick={() => onEdit(task)}
          >
            <Edit2 size={13} />
          </button>
          {isAdmin && (
            <button
              className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Delete"
              onClick={() => onDelete(task)}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Assignee Multi-Select ─────────────────────────────────────────────────────

function AssigneeMultiSelect({
  users,
  value,
  onChange,
}: {
  users: User[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  if (users.length === 0) {
    return (
      <p className="text-xs text-gray-400 py-2">No users available.</p>
    );
  }

  return (
    <div className="space-y-2">
      {/* Selected chips summary */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((id) => {
            const u = users.find((x) => String(x.id) === String(id));
            const label = u?.name ?? u?.email ?? id;
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 text-xs font-medium bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-full pl-1.5 pr-1 py-0.5"
              >
                <UserAvatar name={label} avatarUrl={u?.avatarUrl} size="xs" />
                {label}
                <button
                  type="button"
                  className="ml-0.5 text-indigo-400 hover:text-indigo-700 transition-colors"
                  onClick={() => toggle(id)}
                >
                  <X size={10} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Clickable user chips grid */}
      <div className="flex flex-wrap gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg max-h-44 overflow-y-auto">
        {users.map((u) => {
          const id = String(u.id);
          const label = u.name ?? u.email ?? id;
          const selected = value.includes(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1.5 border transition-all select-none ${
                selected
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50'
              }`}
            >
              <UserAvatar name={label} avatarUrl={u.avatarUrl} size="xs" />
              {label}
              {selected && <Check size={10} className="ml-0.5 flex-shrink-0" />}
            </button>
          );
        })}
      </div>

      {value.length === 0 && (
        <p className="text-xs text-gray-400">Click a teammate above to assign them.</p>
      )}
    </div>
  );
}

// ── Task Form Fields ──────────────────────────────────────────────────────────

function TaskFormFields({
  register, errors, sprints, users, selectedAssignees, onAssigneesChange, onAttachmentChange,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: any;
  sprints: { id: string; name: string }[];
  users: User[];
  selectedAssignees: string[];
  onAssigneesChange: (ids: string[]) => void;
  onAttachmentChange: (files: File[]) => void;
}) {
  const [attachments, setAttachments] = useState<File[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files ?? []);
    const merged = [...attachments, ...newFiles];
    setAttachments(merged);
    onAttachmentChange(merged);
    // reset input so same file can be re-added if removed
    e.target.value = '';
  };

  const removeAttachment = (index: number) => {
    const updated = attachments.filter((_, i) => i !== index);
    setAttachments(updated);
    onAttachmentChange(updated);
  };

  return (
    <>
      <div>
        <label className="form-label">Title *</label>
        <input className="form-input" placeholder="Task title" {...register('title', { required: 'Title is required' })} />
        {errors.title && <p className="text-xs text-red-600 mt-1">{errors.title.message}</p>}
      </div>
      <div>
        <label className="form-label">Description</label>
        <textarea className="form-textarea" rows={3} placeholder="Describe the task…" {...register('description')} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="form-label">Type</label>
          <select className="form-select" {...register('type')}>
            <option value="TASK">Task</option>
            <option value="STORY">Story</option>
            <option value="BUG">Bug</option>
            <option value="EPIC">Epic</option>
            <option value="SUBTASK">Subtask</option>
          </select>
        </div>
        <div>
          <label className="form-label">Priority</label>
          <select className="form-select" {...register('priority')}>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
        <div>
          <label className="form-label">Status</label>
          <select className="form-select" {...register('status')}>
            <option value="TODO">To Do</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="IN_REVIEW">In Review</option>
            <option value="DONE">Done</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="form-label">Story Points</label>
          <input type="number" step="0.5" min="0" className="form-input" placeholder="0"
            {...register('story_points', { valueAsNumber: true })} />
        </div>
        <div>
          <label className="form-label">Est. Hours</label>
          <input type="number" step="0.25" min="0" className="form-input" placeholder="0"
            {...register('estimated_hours', { valueAsNumber: true })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="form-label">Due Date</label>
          <input type="date" className="form-input" {...register('due_date')} />
        </div>
        <div>
          <label className="form-label">Sprint</label>
          <select className="form-select" {...register('sprint_id')}>
            <option value="">Backlog (no sprint)</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="form-label">
          Assignees
          {selectedAssignees.length > 0 && (
            <span className="ml-2 text-xs font-normal text-indigo-600">
              {selectedAssignees.length} selected
            </span>
          )}
        </label>
        <AssigneeMultiSelect
          users={users}
          value={selectedAssignees}
          onChange={onAssigneesChange}
        />
      </div>
      <div>
        <label className="form-label">Labels <span className="text-gray-400 font-normal">(comma separated)</span></label>
        <input className="form-input" placeholder="frontend, urgent, blocked" {...register('labels')} />
      </div>

      {/* ── Attachments ── */}
      <div>
        <label className="form-label flex items-center gap-1.5">
          <Paperclip size={13} className="text-gray-400" />
          Attachments
          <span className="text-gray-400 font-normal text-xs">(optional)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer w-full border border-dashed border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
          <Paperclip size={14} />
          <span>Click to attach files</span>
          <input
            type="file"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
        </label>
        {attachments.length > 0 && (
          <ul className="mt-2 space-y-1">
            {attachments.map((file, i) => (
              <li
                key={`${file.name}-${i}`}
                className="flex items-center justify-between text-xs bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5"
              >
                <span className="flex items-center gap-1.5 text-gray-700 truncate">
                  <Paperclip size={11} className="text-gray-400 flex-shrink-0" />
                  <span className="truncate">{file.name}</span>
                  <span className="text-gray-400 flex-shrink-0">
                    ({(file.size / 1024).toFixed(1)} KB)
                  </span>
                </span>
                <button
                  type="button"
                  className="ml-2 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                  onClick={() => removeAttachment(i)}
                  title="Remove"
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
