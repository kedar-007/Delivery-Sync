import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import {
  Plus, Calendar, MessageSquare, ChevronRight, ChevronDown,
  AlertCircle, CheckCircle2, PlayCircle, Layers, Clock,
  Filter, Search, User, Zap, BarChart2,
  ArrowRight, Trash2, Edit2, GitBranch, Users, X, Timer, Paperclip, History,
} from 'lucide-react';
import { timeEntriesApi, aiApi } from '../lib/api';
import { format, isPast, parseISO, differenceInDays } from 'date-fns';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Modal, { ModalActions } from '../components/ui/Modal';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import { PageSkeleton } from '../components/ui/Skeleton';
import UserAvatar from '../components/ui/UserAvatar';
import {
  useSprints,
  useSprintBoard,
  useCreateSprint,
  useStartSprint,
  useCompleteSprint,
  useCreateTask,
  useUpdateTask,
  useUpdateTaskStatus,
  useDeleteTask,
  useTask,
  useTaskComments,
  useAddTaskComment,
} from '../hooks/useTaskSprint';
import { useProject } from '../hooks/useProjects';
import { useUsers } from '../hooks/useUsers';
import { useAuth } from '../contexts/AuthContext';
import SprintAnalysisModal from '../components/ui/SprintAnalysisModal';
import { useAiSprintAnalysis } from '../hooks/useAiInsights';

// ── Types ─────────────────────────────────────────────────────────────────────

type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
type TaskPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type TaskType = 'TASK' | 'STORY' | 'BUG' | 'SUBTASK' | 'EPIC';

interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  type: TaskType;
  assigneeId?: string;
  assigneeIds?: string[];
  storyPoints?: number;
  dueDate?: string;
  sprintId?: string;
  projectId?: string;
  labels?: string[];
}

interface Sprint {
  id: string;
  ROWID?: string | number; // raw Catalyst PK — always present via normaliseSprint's ...r spread
  name: string;
  status: 'PLANNING' | 'ACTIVE' | 'COMPLETED';
  startDate?: string;
  endDate?: string;
  goal?: string;
  projectId: string;
}

const COLUMNS: { key: TaskStatus; label: string; color: string; bg: string }[] = [
  { key: 'TODO',        label: 'To Do',       color: 'text-slate-500',  bg: 'bg-slate-50' },
  { key: 'IN_PROGRESS', label: 'In Progress', color: 'text-blue-600',   bg: 'bg-blue-50' },
  { key: 'IN_REVIEW',   label: 'In Review',   color: 'text-amber-600',  bg: 'bg-amber-50' },
  { key: 'DONE',        label: 'Done',        color: 'text-emerald-600', bg: 'bg-emerald-50' },
];

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; icon: string }> = {
  CRITICAL: { label: 'Critical', color: 'text-red-600 bg-red-50 border-red-200',    icon: '🔴' },
  HIGH:     { label: 'High',     color: 'text-orange-600 bg-orange-50 border-orange-200', icon: '🟠' },
  MEDIUM:   { label: 'Medium',   color: 'text-yellow-600 bg-yellow-50 border-yellow-200', icon: '🟡' },
  LOW:      { label: 'Low',      color: 'text-green-600 bg-green-50 border-green-200',   icon: '🟢' },
};

const TYPE_CONFIG: Record<TaskType, { label: string; color: string }> = {
  TASK:    { label: 'Task',    color: 'bg-blue-100 text-blue-700' },
  STORY:   { label: 'Story',   color: 'bg-purple-100 text-purple-700' },
  BUG:     { label: 'Bug',     color: 'bg-red-100 text-red-700' },
  SUBTASK: { label: 'Subtask', color: 'bg-gray-100 text-gray-700' },
  EPIC:    { label: 'Epic',    color: 'bg-indigo-100 text-indigo-700' },
};

// ── Multi-user Avatar Stack ───────────────────────────────────────────────────

function AvatarStack({ userIds, users, max = 3 }: { userIds: string[]; users: unknown[]; max?: number }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getUser = (id: string) => (users as any[]).find((u: any) => String(u.id ?? u.ROWID) === String(id));
  const visible = userIds.slice(0, max);
  const overflow = userIds.length - max;
  return (
    <div className="flex -space-x-1.5">
      {visible.map((uid) => {
        const u = getUser(uid);
        return (
          <div key={uid} className="w-6 h-6 rounded-full ring-2 ring-white overflow-hidden bg-indigo-200 flex items-center justify-center text-[10px] font-bold text-indigo-800" title={u?.name ?? uid}>
            {u?.name ? u.name[0].toUpperCase() : '?'}
          </div>
        );
      })}
      {overflow > 0 && (
        <div className="w-6 h-6 rounded-full ring-2 ring-white bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600">
          +{overflow}
        </div>
      )}
    </div>
  );
}

// ── Draggable Task Card ───────────────────────────────────────────────────────

function TaskCard({ task, users, onOpen, isDragOverlay = false }: {
  task: Task;
  users: unknown[];
  onOpen: (t: Task) => void;
  isDragOverlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  const p = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.MEDIUM;
  const t = TYPE_CONFIG[task.type] ?? TYPE_CONFIG.TASK;
  const isOverdue = task.dueDate && isPast(parseISO(task.dueDate)) && task.status !== 'DONE';

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      {...(isDragOverlay ? {} : { ...listeners, ...attributes })}
      onClick={() => onOpen(task)}
      className={[
        'bg-white rounded-xl border p-3 cursor-pointer group select-none',
        'hover:shadow-md hover:border-indigo-200 transition-all duration-150',
        isDragging ? 'opacity-30' : '',
        isDragOverlay ? 'shadow-2xl rotate-2 border-indigo-300 scale-105' : 'shadow-sm',
      ].join(' ')}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-1 mb-2">
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${t.color}`}>{t.label}</span>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${p.color}`}>{p.icon} {p.label}</span>
      </div>

      {/* Title */}
      <p className="text-sm font-medium text-gray-900 line-clamp-2 mb-2">{task.title}</p>

      {/* Labels */}
      {(task.labels ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {(task.labels ?? []).slice(0, 3).map((l) => (
            <span key={l} className="text-[10px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{l}</span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          {task.storyPoints != null && task.storyPoints > 0 && (
            <span className="text-[10px] bg-indigo-50 text-indigo-600 font-semibold rounded-full px-1.5 py-0.5">{task.storyPoints}pt</span>
          )}
          {isOverdue && (
            <span className="text-[10px] bg-red-50 text-red-600 rounded px-1.5 py-0.5 flex items-center gap-0.5">
              <AlertCircle size={9} />overdue
            </span>
          )}
          {task.dueDate && !isOverdue && task.status !== 'DONE' && (
            <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
              <Calendar size={9} />{format(parseISO(task.dueDate), 'MMM d')}
            </span>
          )}
        </div>
        {(task.assigneeIds?.length ?? 0) > 0 ? (
          <AvatarStack userIds={task.assigneeIds ?? []} users={users} />
        ) : task.assigneeId ? (
          <AvatarStack userIds={[task.assigneeId]} users={users} />
        ) : (
          <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
            <User size={10} className="text-gray-400" />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Droppable Column ──────────────────────────────────────────────────────────

function KanbanColumn({ col, tasks, users, onAddTask, onOpenTask }: {
  col: typeof COLUMNS[number];
  tasks: Task[];
  users: unknown[];
  onAddTask: (status: TaskStatus) => void;
  onOpenTask: (t: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });

  return (
    <div className="flex flex-col min-w-[270px] max-w-[270px]">
      {/* Column header */}
      <div className={`rounded-xl px-3 py-2.5 mb-3 flex items-center justify-between ${col.bg}`}>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${col.color}`}>{col.label}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-white ${col.color}`}>{tasks.length}</span>
        </div>
        <button
          onClick={() => onAddTask(col.key)}
          className={`p-1 rounded hover:bg-white/70 transition-colors ${col.color}`}
          title={`Add task to ${col.label}`}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Task list */}
      <div
        ref={setNodeRef}
        className={[
          'flex flex-col gap-2.5 min-h-[200px] p-2 rounded-xl transition-colors',
          isOver ? 'bg-indigo-50/60 ring-2 ring-indigo-200 ring-dashed' : '',
        ].join(' ')}
      >
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} users={users} onOpen={onOpenTask} />
        ))}
        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-24 rounded-lg border-2 border-dashed border-gray-200 text-gray-400 text-xs">
            Drop tasks here
          </div>
        )}
      </div>
    </div>
  );
}

// ── Multi-Select Users ────────────────────────────────────────────────────────

function MultiUserSelect({ value, onChange, users, label }: {
  value: string[];
  onChange: (ids: string[]) => void;
  users: unknown[];
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = React.useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allUsers = users as any[];
  const filtered = allUsers.filter((u: any) =>
    (u.name ?? u.email ?? '').toLowerCase().includes(q.toLowerCase())
  );
  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getUser = (id: string) => allUsers.find((u: any) => String(u.id ?? u.ROWID) === id);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <label className="form-label">{label}</label>
      <div
        className="form-input min-h-[38px] cursor-pointer flex flex-wrap gap-1 items-center"
        onClick={() => setOpen((v) => !v)}
      >
        {value.length === 0 && <span className="text-gray-400 text-sm">Select assignees…</span>}
        {value.map((id) => {
          const u = getUser(id);
          const name = u?.name ?? u?.email ?? id;
          return (
            <span key={id} className="flex items-center gap-1 bg-indigo-100 text-indigo-700 text-xs rounded-full px-2 py-0.5">
              <span className="w-4 h-4 rounded-full bg-indigo-400 text-white text-[9px] font-bold flex items-center justify-center">{name[0]?.toUpperCase()}</span>
              {name}
              <button type="button" onClick={(e) => { e.stopPropagation(); toggle(id); }} className="hover:text-red-600 ml-0.5">
                <X size={10} />
              </button>
            </span>
          );
        })}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl max-h-56 overflow-auto">
          <div className="p-2 border-b sticky top-0 bg-white">
            <input
              className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="Search users…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          </div>
          {filtered.length === 0 && <p className="text-xs text-gray-400 text-center py-3">No users found</p>}
          {filtered.map((u: any) => {
            const uid = String(u.id ?? u.ROWID);
            const checked = value.includes(uid);
            const name = u.name ?? u.email ?? uid;
            return (
              <div
                key={uid}
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); toggle(uid); }}
                className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors hover:bg-indigo-50 ${checked ? 'bg-indigo-50' : ''}`}
              >
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${checked ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                  {checked && <CheckCircle2 size={10} className="text-white" />}
                </div>
                <div className="w-7 h-7 rounded-full bg-indigo-200 flex items-center justify-center text-[10px] font-bold text-indigo-800 shrink-0">
                  {u.avatarUrl ? <img src={u.avatarUrl} alt={name} className="w-7 h-7 rounded-full object-cover" /> : name[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{name}</div>
                  {u.email && u.name && <div className="text-[10px] text-gray-400 truncate">{u.email}</div>}
                </div>
              </div>
            );
          })}
          {value.length > 0 && (
            <div className="px-3 py-2 border-t bg-indigo-50">
              <p className="text-[11px] text-indigo-600 font-medium">{value.length} user{value.length !== 1 ? 's' : ''} selected · click to deselect</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sprint Creation Form ──────────────────────────────────────────────────────

interface SprintForm {
  name: string;
  goal: string;
  start_date: string;
  end_date: string;
  capacity_points: number;
}

// ── Task Form ─────────────────────────────────────────────────────────────────

interface TaskForm {
  title: string;
  description: string;
  type: TaskType;
  priority: TaskPriority;
  story_points: number;
  estimated_hours: number;
  due_date: string;
  labels: string;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SprintBoardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === 'TENANT_ADMIN' || user?.role === 'DELIVERY_LEAD' || user?.role === 'PMO';

  const [activeSprint, setActiveSprint] = useState<Sprint | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);       // dragging
  const [taskDetailId, setTaskDetailId] = useState<string | null>(null); // detail modal
  const [showCreateSprint, setShowCreateSprint] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showAIAnalysis, setShowAIAnalysis] = useState(false);
  const sprintAnalysis = useAiSprintAnalysis();
  const [createTaskStatus, setCreateTaskStatus] = useState<TaskStatus>('TODO');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [editAssigneeIds, setEditAssigneeIds] = useState<string[]>([]);
  const [filterPriority, setFilterPriority] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [searchQ, setSearchQ] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commentText, setCommentText] = useState('');
  // time logging
  const [showLogTime, setShowLogTime] = useState(false);
  const [logTimeHours, setLogTimeHours] = useState('');
  const [logTimeDesc, setLogTimeDesc] = useState('');
  const [logTimeDate, setLogTimeDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [logTimeBillable, setLogTimeBillable] = useState(true);
  const [logTimePending, setLogTimePending] = useState(false);
  // task detail tabs / timer / AI
  const [detailTab, setDetailTab] = useState<'activity' | 'time' | 'ai'>('activity');
  const [taskTimeEntries, setTaskTimeEntries] = useState<any[]>([]);
  const [timeEntriesLoading, setTimeEntriesLoading] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [timerDisplay, setTimerDisplay] = useState('00:00:00');
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const { data: project } = useProject(projectId ?? '');
  const { data: sprints, isLoading: sprintsLoading } = useSprints(projectId ?? '');
  // Resolve sprint ID: prefer raw ROWID (always set by Catalyst) over normalised id
  const activeSprintId = activeSprint
    ? String(activeSprint.ROWID ?? activeSprint.id ?? '')
    : '';
  const { data: board, isLoading: boardLoading } = useSprintBoard(activeSprintId);
  const { data: usersData } = useUsers();
  const { data: fullTask } = useTask(taskDetailId ?? '');
  const { data: comments } = useTaskComments(taskDetailId ?? '');
  const addComment = useAddTaskComment(taskDetailId ?? '');

  const createSprint = useCreateSprint();
  const startSprint = useStartSprint();
  const completeSprint = useCompleteSprint();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const updateStatus = useUpdateTaskStatus();
  const deleteTask = useDeleteTask();

  const sprintList: Sprint[] = Array.isArray(sprints) ? sprints : (sprints as any)?.data ?? [];
  const users: unknown[] = Array.isArray(usersData) ? usersData : (usersData as any)?.data ?? [];

  // Auto-select active sprint
  React.useEffect(() => {
    if (sprintList.length > 0 && !activeSprint) {
      const active = sprintList.find((s) => s.status === 'ACTIVE') ?? sprintList[0];
      setActiveSprint(active);
    }
  }, [sprintList]);

  // Reset detail state when task changes; restore any running timer
  React.useEffect(() => {
    if (!taskDetailId) {
      setTimerRunning(false); setTimerStart(null); setTimerDisplay('00:00:00');
      return;
    }
    setDetailTab('activity'); setAiInsight(null); setTaskTimeEntries([]);
    const saved = localStorage.getItem(`ds_timer_${taskDetailId}`);
    if (saved) {
      const start = parseInt(saved, 10);
      setTimerStart(start); setTimerRunning(true);
    } else {
      setTimerRunning(false); setTimerStart(null); setTimerDisplay('00:00:00');
    }
  }, [taskDetailId]);

  // Timer tick every second
  React.useEffect(() => {
    if (!timerRunning || !timerStart) return;
    const iv = setInterval(() => {
      const s = Math.floor((Date.now() - timerStart) / 1000);
      setTimerDisplay(`${String(Math.floor(s / 3600)).padStart(2,'0')}:${String(Math.floor((s % 3600) / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`);
    }, 1000);
    return () => clearInterval(iv);
  }, [timerRunning, timerStart]);

  // Load time entries when time tab opens
  React.useEffect(() => {
    if (detailTab !== 'time' || !taskDetailId) return;
    setTimeEntriesLoading(true);
    timeEntriesApi.list({ task_id: taskDetailId })
      .then((d: unknown) => setTaskTimeEntries(Array.isArray(d) ? d : []))
      .catch(() => setTaskTimeEntries([]))
      .finally(() => setTimeEntriesLoading(false));
  }, [detailTab, taskDetailId]);


  const boardData = (board && typeof board === 'object' && !Array.isArray(board))
    ? board as Record<string, Task[]>
    : { TODO: [], IN_PROGRESS: [], IN_REVIEW: [], DONE: [] };

  // Filter tasks
  const filteredBoard = useMemo(() => {
    const filtered: Record<string, Task[]> = {};
    for (const col of COLUMNS) {
      const tasks: Task[] = boardData[col.key] ?? [];
      filtered[col.key] = tasks.filter((t) => {
        if (filterPriority && t.priority !== filterPriority) return false;
        if (filterType && t.type !== filterType) return false;
        if (searchQ && !t.title.toLowerCase().includes(searchQ.toLowerCase())) return false;
        return true;
      });
    }
    return filtered;
  }, [boardData, filterPriority, filterType, searchQ]);

  // Stats
  const allTasks = Object.values(boardData).flat();
  const doneCount = (boardData['DONE'] ?? []).length;
  const totalCount = allTasks.length;

  // DnD sensors
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragStart = (e: DragStartEvent) => {
    for (const tasks of Object.values(boardData)) {
      const t = tasks.find((task) => task.id === String(e.active.id));
      if (t) { setActiveTask(t); break; }
    }
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = e;
    if (!over || !activeSprint) return;

    const validCols = COLUMNS.map((c) => c.key) as string[];
    let toStatus: TaskStatus;

    // over.id is either a column key (droppable) or a task id (dragged over another card)
    if (validCols.includes(String(over.id))) {
      toStatus = String(over.id) as TaskStatus;
    } else {
      // Find which column the hovered task belongs to
      let found: TaskStatus | undefined;
      for (const col of COLUMNS) {
        if ((boardData[col.key] ?? []).find((t) => t.id === String(over.id))) {
          found = col.key;
          break;
        }
      }
      if (!found) return;
      toStatus = found;
    }

    // Find current task status
    let fromStatus: TaskStatus | undefined;
    for (const col of COLUMNS) {
      if ((boardData[col.key] ?? []).find((t) => t.id === String(active.id))) {
        fromStatus = col.key;
        break;
      }
    }
    if (!fromStatus || fromStatus === toStatus) return;
    updateStatus.mutate({ id: String(active.id), data: { status: toStatus } });
  };

  // Sprint form
  const sprintForm = useForm<SprintForm>();
  const onCreateSprint = sprintForm.handleSubmit((data) => {
    createSprint.mutate({
      project_id: projectId,
      name: data.name,
      goal: data.goal,
      start_date: data.start_date,
      end_date: data.end_date,
      capacity_points: data.capacity_points,
    }, {
      onSuccess: () => { setShowCreateSprint(false); sprintForm.reset(); },
    });
  });

  // Task form
  const taskForm = useForm<TaskForm>({ defaultValues: { type: 'TASK', priority: 'MEDIUM' } });
  const onCreateTask = taskForm.handleSubmit((data) => {
    createTask.mutate({
      title: data.title,
      description: data.description,
      type: data.type,
      priority: data.priority,
      story_points: data.story_points || null,
      estimated_hours: data.estimated_hours || null,
      due_date: data.due_date || null,
      labels: data.labels ? JSON.stringify(data.labels.split(',').map((l) => l.trim()).filter(Boolean)) : '[]',
      project_id: projectId,
      sprint_id: activeSprint?.id ?? null,
      status: createTaskStatus,
      assignee_ids: JSON.stringify(assigneeIds),
    }, {
      onSuccess: () => { setShowCreateTask(false); taskForm.reset(); setAssigneeIds([]); },
    });
  });

  // Log time against task
  const handleLogTime = async () => {
    if (!detailTask || !logTimeHours) return;
    setLogTimePending(true);
    try {
      await timeEntriesApi.create({
        project_id: detailTask.projectId ?? projectId,
        task_id: detailTask.id,
        entry_date: logTimeDate,
        hours: parseFloat(logTimeHours),
        description: logTimeDesc || detailTask.title,
        is_billable: logTimeBillable,
      });
      setLogTimeHours(''); setLogTimeDesc('');
      // Refresh time entries list
      if (taskDetailId) {
        setTimeEntriesLoading(true);
        timeEntriesApi.list({ task_id: taskDetailId })
          .then((d: unknown) => setTaskTimeEntries(Array.isArray(d) ? d : []))
          .catch(() => {}).finally(() => setTimeEntriesLoading(false));
      }
    } finally {
      setLogTimePending(false);
    }
  };

  const handleStartTimer = () => {
    if (!taskDetailId) return;
    const now = Date.now();
    localStorage.setItem(`ds_timer_${taskDetailId}`, String(now));
    setTimerStart(now); setTimerRunning(true);
  };

  const handleStopTimer = () => {
    if (!timerStart || !taskDetailId) return;
    const elapsed = (Date.now() - timerStart) / 3600000;
    localStorage.removeItem(`ds_timer_${taskDetailId}`);
    setTimerRunning(false); setTimerStart(null); setTimerDisplay('00:00:00');
    setLogTimeHours(Math.max(0.25, Math.round(elapsed * 4) / 4).toFixed(2));
    setDetailTab('time');
  };

  // Task detail — prefer board data (instant), fall back to useTask API response
  const detailTask: Task | null = useMemo(() => {
    if (!taskDetailId) return null;
    for (const tasks of Object.values(boardData)) {
      const t = tasks.find((task) => task.id === taskDetailId);
      if (t) return t;
    }
    // Task may not be on current board (e.g. just created / different sprint)
    if (fullTask && (fullTask as any).id) return fullTask as unknown as Task;
    return null;
  }, [taskDetailId, boardData, fullTask]);

  // Load AI insights when AI tab opens (once per task)
  React.useEffect(() => {
    if (detailTab !== 'ai' || !taskDetailId || !detailTask || aiInsight !== null) return;
    setAiLoading(true);
    aiApi.taskInsight({
      title:       detailTask.title,
      description: (detailTask as any).description || '',
      status:      detailTask.status,
      priority:    detailTask.priority,
      dueDate:     detailTask.dueDate || undefined,
      taskId:      detailTask.id,
    })
      .then((r: any) => setAiInsight(r?.data?.insight ?? r?.insight ?? 'Insights ready.'))
      .catch(() => setAiInsight('Unable to generate AI insights at this time.'))
      .finally(() => setAiLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailTab, taskDetailId, detailTask, aiInsight]);

  // Edit task form
  const editForm = useForm<Partial<TaskForm>>();
  const onSaveEdit = editForm.handleSubmit((data) => {
    if (!editTask) return;
    updateTask.mutate({
      id: editTask.id,
      data: {
        title: data.title,
        description: data.description,
        type: data.type,
        priority: data.priority,
        story_points: data.story_points || null,
        estimated_hours: data.estimated_hours || null,
        due_date: data.due_date || null,
        labels: data.labels ? JSON.stringify((data.labels as string).split(',').map(l => l.trim()).filter(Boolean)) : '[]',
        assignee_ids: JSON.stringify(editAssigneeIds),
      },
    }, { onSuccess: () => setEditTask(null) });
  });

  const openEdit = (task: Task) => {
    setEditTask(task);
    setEditAssigneeIds(task.assigneeIds ?? (task.assigneeId ? [task.assigneeId] : []));
    editForm.reset({
      title: task.title,
      description: task.description,
      type: task.type,
      priority: task.priority,
      story_points: task.storyPoints ?? undefined,
      due_date: task.dueDate ? task.dueDate.split('T')[0] : '',
      labels: (task.labels ?? []).join(', '),
    });
  };

  if (sprintsLoading) return <PageSkeleton />;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <Header
        title={project?.name ? `${project.name} — Sprint Board` : 'Sprint Board'}
        subtitle={activeSprint ? `${activeSprint.name} · ${activeSprint.status}` : 'Select a sprint'}
        actions={
          <div className="flex items-center gap-2">
            {activeSprint && activeSprintId && (
              <Button size="sm" variant="secondary" icon={<BarChart2 size={15} />} onClick={() => {
                sprintAnalysis.reset();
                sprintAnalysis.mutate({ sprintId: activeSprintId });
                setShowAIAnalysis(true);
              }}>
                Analyze
              </Button>
            )}
            {isAdmin && (
              <Button size="sm" variant="secondary" icon={<Plus size={15} />} onClick={() => setShowCreateSprint(true)}>
                New Sprint
              </Button>
            )}
            {activeSprint?.status === 'PLANNING' && isAdmin && (
              <Button size="sm" variant="primary" icon={<PlayCircle size={15} />}
                onClick={() => startSprint.mutate(String(activeSprint.ROWID ?? activeSprint.id ?? ''))}
                loading={startSprint.isPending}
              >
                Start Sprint
              </Button>
            )}
            {activeSprint?.status === 'ACTIVE' && isAdmin && (
              <Button size="sm" variant="secondary" icon={<CheckCircle2 size={15} />}
                onClick={() => completeSprint.mutate(String(activeSprint.ROWID ?? activeSprint.id ?? ''))}
                loading={completeSprint.isPending}
              >
                Complete
              </Button>
            )}
          </div>
        }
      />

      <div className="flex h-[calc(100vh-130px)] overflow-hidden">
        {/* ── Sprint Sidebar ───────────────────────────────────────────────── */}
        <div className={`flex-shrink-0 transition-all duration-200 ${sidebarCollapsed ? 'w-12' : 'w-64'} bg-white border-r border-gray-100 flex flex-col overflow-hidden`}>
          <div className="flex items-center justify-between px-3 py-3 border-b border-gray-100">
            {!sidebarCollapsed && <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sprints</span>}
            <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="p-1 rounded hover:bg-gray-100 text-gray-400">
              {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          {!sidebarCollapsed && (
            <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
              {sprintList.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-xs">No sprints yet</div>
              ) : (
                sprintList.map((sprint) => {
                  const isActive = activeSprint?.id === sprint.id;
                  const statusColors: Record<string, string> = {
                    PLANNING: 'bg-slate-100 text-slate-600',
                    ACTIVE:   'bg-green-100 text-green-700',
                    COMPLETED:'bg-gray-100 text-gray-500',
                  };
                  return (
                    <button
                      key={sprint.id}
                      onClick={() => setActiveSprint(sprint)}
                      className={[
                        'w-full text-left px-3 py-2.5 rounded-xl transition-all',
                        isActive ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-medium truncate ${isActive ? 'text-indigo-700' : 'text-gray-700'}`}>
                          {sprint.name}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ml-1 ${statusColors[sprint.status] ?? statusColors.PLANNING}`}>
                          {sprint.status}
                        </span>
                      </div>
                      {sprint.startDate && (
                        <div className="text-[10px] text-gray-400">
                          {format(parseISO(sprint.startDate), 'MMM d')} →{' '}
                          {sprint.endDate ? format(parseISO(sprint.endDate), 'MMM d') : '?'}
                        </div>
                      )}
                      {sprint.goal && (
                        <p className="text-[10px] text-gray-500 line-clamp-1 mt-0.5">{sprint.goal}</p>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* Sprint stats */}
          {!sidebarCollapsed && activeSprint && (
            <div className="border-t border-gray-100 px-3 py-3 bg-gray-50/50">
              <div className="text-[10px] text-gray-500 font-medium mb-2">SPRINT PROGRESS</div>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                  <div
                    className="bg-indigo-500 h-1.5 rounded-full transition-all"
                    style={{ width: totalCount > 0 ? `${(doneCount / totalCount) * 100}%` : '0%' }}
                  />
                </div>
                <span className="text-[10px] text-gray-500">{doneCount}/{totalCount}</span>
              </div>
              {activeSprint.endDate && (
                <div className="text-[10px] text-gray-400">
                  {differenceInDays(parseISO(activeSprint.endDate), new Date())} days left
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Board Area ────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
          {/* Toolbar */}
          <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-gray-100 flex-shrink-0">
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none"
                placeholder="Search tasks…"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-gray-400" />
              <select
                className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-200"
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
              >
                <option value="">All Priorities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
              <select
                className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-200"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="">All Types</option>
                <option value="TASK">Task</option>
                <option value="STORY">Story</option>
                <option value="BUG">Bug</option>
                <option value="EPIC">Epic</option>
                <option value="SUBTASK">Subtask</option>
              </select>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" icon={<Plus size={14} />} onClick={() => { setCreateTaskStatus('TODO'); setShowCreateTask(true); }}>
                Add Task
              </Button>
            </div>
          </div>

          {/* Kanban */}
          {!activeSprint ? (
            <EmptyState title="No sprint selected" description="Select or create a sprint from the sidebar" icon={<GitBranch size={32} className="text-gray-300" />} />
          ) : boardLoading ? (
            <div className="flex-1 flex items-center justify-center text-gray-400">Loading board…</div>
          ) : (
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <div className="flex-1 overflow-x-auto">
                <div className="flex gap-4 p-5 min-w-max h-full">
                  {COLUMNS.map((col) => (
                    <KanbanColumn
                      key={col.key}
                      col={col}
                      tasks={filteredBoard[col.key] ?? []}
                      users={users}
                      onAddTask={(status) => { setCreateTaskStatus(status); setShowCreateTask(true); }}
                      onOpenTask={(t) => setTaskDetailId(t.id)}
                    />
                  ))}
                </div>
              </div>
              <DragOverlay>
                {activeTask && (
                  <TaskCard task={activeTask} users={users} onOpen={() => {}} isDragOverlay />
                )}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </div>

      {/* ── Create Sprint Modal ──────────────────────────────────────────────── */}
      <Modal
        open={showCreateSprint}
        onClose={() => { setShowCreateSprint(false); sprintForm.reset(); }}
        title="Create New Sprint"
        size="lg"
      >
        <form onSubmit={onCreateSprint} className="space-y-4">
          <div>
            <label className="form-label">Sprint Name *</label>
            <input className="form-input" placeholder="e.g., Sprint 1" {...sprintForm.register('name', { required: true })} />
          </div>
          <div>
            <label className="form-label">Sprint Goal</label>
            <textarea className="form-textarea" rows={2} placeholder="What do you aim to achieve?" {...sprintForm.register('goal')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Start Date *</label>
              <input type="date" className="form-input" {...sprintForm.register('start_date', { required: true })} />
            </div>
            <div>
              <label className="form-label">End Date *</label>
              <input type="date" className="form-input" {...sprintForm.register('end_date', { required: true })} />
            </div>
          </div>
          <div>
            <label className="form-label">Capacity (Story Points)</label>
            <input type="number" className="form-input" placeholder="40" {...sprintForm.register('capacity_points', { valueAsNumber: true })} />
          </div>

          {/* Visual sprint timeline preview */}
          {sprintForm.watch('start_date') && sprintForm.watch('end_date') && (
            <div className="bg-indigo-50 rounded-xl p-3 text-sm text-indigo-700">
              <div className="font-medium mb-1">Sprint Duration Preview</div>
              <div className="flex items-center gap-2">
                <span>{format(new Date(sprintForm.watch('start_date')), 'MMM d, yyyy')}</span>
                <ArrowRight size={14} />
                <span>{format(new Date(sprintForm.watch('end_date')), 'MMM d, yyyy')}</span>
                <span className="text-indigo-500">
                  ({differenceInDays(new Date(sprintForm.watch('end_date')), new Date(sprintForm.watch('start_date')))} days)
                </span>
              </div>
            </div>
          )}

          <ModalActions>
            <Button variant="secondary" onClick={() => { setShowCreateSprint(false); sprintForm.reset(); }}>Cancel</Button>
            <Button type="submit" variant="primary" loading={createSprint.isPending}>Create Sprint</Button>
          </ModalActions>
        </form>
      </Modal>

      {/* ── Create Task Modal ────────────────────────────────────────────────── */}
      <Modal
        open={showCreateTask}
        onClose={() => { setShowCreateTask(false); taskForm.reset(); setAssigneeIds([]); }}
        title="Create Task"
        size="lg"
      >
        <form onSubmit={onCreateTask} className="space-y-4">
          <div>
            <label className="form-label">Title *</label>
            <input className="form-input" placeholder="Task title" {...taskForm.register('title', { required: true })} />
          </div>
          <div>
            <label className="form-label">Description</label>
            <textarea className="form-textarea" rows={3} placeholder="Describe the task…" {...taskForm.register('description')} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="form-label">Type</label>
              <select className="form-select" {...taskForm.register('type')}>
                <option value="TASK">Task</option>
                <option value="STORY">Story</option>
                <option value="BUG">Bug</option>
                <option value="EPIC">Epic</option>
                <option value="SUBTASK">Subtask</option>
              </select>
            </div>
            <div>
              <label className="form-label">Priority</label>
              <select className="form-select" {...taskForm.register('priority')}>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
            <div>
              <label className="form-label">Story Points</label>
              <input type="number" className="form-input" placeholder="0" step="0.5" {...taskForm.register('story_points', { valueAsNumber: true })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Due Date</label>
              <input type="date" className="form-input" {...taskForm.register('due_date')} />
            </div>
            <div>
              <label className="form-label">Est. Hours</label>
              <input type="number" className="form-input" placeholder="0" step="0.25" {...taskForm.register('estimated_hours', { valueAsNumber: true })} />
            </div>
          </div>
          <MultiUserSelect
            label="Assignees"
            value={assigneeIds}
            onChange={setAssigneeIds}
            users={users}
          />
          <div>
            <label className="form-label">Labels <span className="text-gray-400 font-normal">(comma separated)</span></label>
            <input className="form-input" placeholder="frontend, urgent, blocked" {...taskForm.register('labels')} />
          </div>
          <div>
            <label className="form-label">Status</label>
            <select
              className="form-select"
              value={createTaskStatus}
              onChange={(e) => setCreateTaskStatus(e.target.value as TaskStatus)}
            >
              {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <ModalActions>
            <Button variant="secondary" onClick={() => { setShowCreateTask(false); taskForm.reset(); setAssigneeIds([]); }}>Cancel</Button>
            <Button type="submit" variant="primary" loading={createTask.isPending}>Create Task</Button>
          </ModalActions>
        </form>
      </Modal>

      {/* ── Task Detail Modal ────────────────────────────────────────────────── */}
      {/* ── Task Detail Modal — rich view ─────────────────────────────── */}
      <Modal
        open={!!taskDetailId}
        onClose={() => { setTaskDetailId(null); setCommentText(''); setDetailTab('activity'); setAiInsight(null); }}
        title=""
        size="2xl"
      >
        {detailTask && (
          <div className="-mt-2">
            {/* ── Header ── */}
            <div className="flex items-start gap-3 mb-5 pb-4 border-b border-gray-100">
              <span className={`mt-1 text-[11px] px-2 py-0.5 rounded-md font-semibold shrink-0 ${TYPE_CONFIG[detailTask.type]?.color ?? 'bg-gray-100 text-gray-700'}`}>
                {TYPE_CONFIG[detailTask.type]?.label}
              </span>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-gray-900 leading-snug mb-2">{detailTask.title}</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${PRIORITY_CONFIG[detailTask.priority]?.color ?? ''}`}>
                    {PRIORITY_CONFIG[detailTask.priority]?.icon} {PRIORITY_CONFIG[detailTask.priority]?.label}
                  </span>
                  {detailTask.dueDate && (
                    <span className={`text-xs flex items-center gap-1 font-medium ${isPast(parseISO(detailTask.dueDate)) && detailTask.status !== 'DONE' ? 'text-red-600' : 'text-gray-500'}`}>
                      <Calendar size={11} /> {format(parseISO(detailTask.dueDate), 'MMM d, yyyy')}
                    </span>
                  )}
                  {(detailTask.storyPoints ?? 0) > 0 && (
                    <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{detailTask.storyPoints} pts</span>
                  )}
                  {timerRunning && (
                    <span className="text-xs flex items-center gap-1.5 text-emerald-700 font-mono font-semibold bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full animate-pulse">
                      <Clock size={11} /> {timerDisplay}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="secondary" icon={<Edit2 size={12} />} onClick={() => { openEdit(detailTask); setTaskDetailId(null); }}>Edit</Button>
                {isAdmin && (
                  <Button size="sm" variant="danger" icon={<Trash2 size={12} />} loading={deleteTask.isPending}
                    onClick={() => { deleteTask.mutate(detailTask.id); setTaskDetailId(null); }}>Delete</Button>
                )}
                <button
                  onClick={() => { setTaskDetailId(null); setCommentText(''); setDetailTab('activity'); setAiInsight(null); }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors ml-1"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* ── Two-column body ── */}
            <div className="flex gap-6">
              {/* Left — main content */}
              <div className="flex-1 min-w-0 space-y-5">

                {/* Description */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Description</div>
                  {(detailTask as any).description
                    ? <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{(detailTask as any).description}</p>
                    : <p className="text-sm text-gray-400 italic">No description provided.</p>}
                </div>

                {/* Assignees — user profile cards */}
                <div>
                  <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Users size={11} /> Assigned To
                  </div>
                  {((fullTask as any)?.assigneeIds?.length ?? detailTask.assigneeIds?.length ?? 0) > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {((fullTask as any)?.assigneeIds ?? detailTask.assigneeIds ?? []).map((uid: string) => {
                        const u = (users as any[]).find((x: any) => String(x.id ?? x.ROWID) === String(uid));
                        const name  = u?.name  ?? 'Unknown';
                        const email = u?.email ?? '';
                        const role  = u?.role  ?? '';
                        const avatar = u?.avatarUrl ?? '';
                        return (
                          <div key={uid} className="flex items-center gap-2.5 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl px-3 py-2.5">
                            <div className="w-9 h-9 rounded-xl bg-indigo-200 flex items-center justify-center text-sm font-bold text-indigo-800 shrink-0 overflow-hidden">
                              {avatar
                                ? <img src={avatar} alt={name} className="w-9 h-9 object-cover rounded-xl" />
                                : name[0]?.toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-gray-800 truncate">{name}</div>
                              {email && <div className="text-[10px] text-gray-500 truncate">{email}</div>}
                              {role && <div className="text-[10px] text-indigo-500 font-medium">{role.replace(/_/g, ' ')}</div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-xl px-3 py-2.5">
                      <User size={13} className="text-gray-300" /> No one assigned yet
                    </div>
                  )}
                </div>

                {/* Attachments */}
                {((fullTask as any)?.attachments?.length ?? 0) > 0 && (
                  <div>
                    <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Paperclip size={11} /> Attachments
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {((fullTask as any).attachments as any[]).map((a: any) => (
                        <a key={a.ROWID ?? a.id ?? a.file_url} href={a.file_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2.5 text-xs bg-white border border-gray-200 rounded-xl px-3 py-2.5 hover:border-indigo-300 hover:bg-indigo-50 transition-all group">
                          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                            <Paperclip size={13} className="text-indigo-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold text-gray-700 group-hover:text-indigo-600">{a.file_name}</div>
                            <div className="text-[10px] text-gray-400 mt-0.5">{a.file_size_kb ? `${a.file_size_kb} KB` : 'File'}</div>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Tabs: Activity | Time Logs | AI ── */}
                <div>
                  <div className="flex border-b border-gray-200 mb-4 -mx-0">
                    {(['activity', 'time', 'ai'] as const).map((tab) => (
                      <button key={tab} onClick={() => setDetailTab(tab)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors -mb-px ${detailTab === tab ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-200'}`}>
                        {tab === 'activity' && <><MessageSquare size={12} />Activity</>}
                        {tab === 'time' && <><Clock size={12} />Time Logs</>}
                        {tab === 'ai' && <><Zap size={12} />AI Insights</>}
                      </button>
                    ))}
                  </div>

                  {/* Activity Tab */}
                  {detailTab === 'activity' && (
                    <div className="space-y-3">
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {/* Status history items */}
                        {((fullTask as any)?.history ?? []).map((h: any, i: number) => (
                          <div key={`h-${h.ROWID ?? i}`} className="flex items-center gap-2 text-xs py-1.5 px-3 bg-gray-50 rounded-lg">
                            <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                              <ArrowRight size={9} className="text-amber-600" />
                            </div>
                            <span className="text-gray-500">Status: </span>
                            <span className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600 text-[11px] font-medium">{h.from_status || '—'}</span>
                            <ArrowRight size={9} className="text-gray-400 shrink-0" />
                            <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[11px] font-semibold">{h.to_status}</span>
                            <span className="ml-auto text-[10px] text-gray-400 shrink-0">{h.CREATEDTIME ? format(new Date(h.CREATEDTIME), 'MMM d, h:mm a') : ''}</span>
                          </div>
                        ))}
                        {/* Comments */}
                        {(Array.isArray(comments) ? comments : []).map((c: any) => {
                          const u = users.find((x: any) => String(x.id ?? x.ROWID) === String(c.userId ?? c.user_id));
                          const name = (u as any)?.name ?? (u as any)?.email ?? 'User';
                          return (
                            <div key={c.id ?? c.ROWID} className="flex gap-3">
                              <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-0.5">
                                {name[0]?.toUpperCase()}
                              </div>
                              <div className="flex-1 bg-white border border-gray-100 rounded-xl px-3 py-2.5 shadow-sm">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-semibold text-gray-800">{name}</span>
                                  <span className="text-[10px] text-gray-400">{c.createdAt ? format(new Date(c.createdAt), 'MMM d, h:mm a') : ''}</span>
                                </div>
                                <p className="text-sm text-gray-700 leading-snug">{c.content}</p>
                              </div>
                            </div>
                          );
                        })}
                        {((fullTask as any)?.history ?? []).length === 0 && (Array.isArray(comments) ? comments : []).length === 0 && (
                          <div className="text-center py-8 text-gray-400">
                            <MessageSquare size={20} className="mx-auto mb-2 opacity-40" />
                            <p className="text-xs">No activity yet.</p>
                          </div>
                        )}
                      </div>
                      {/* Add comment */}
                      <div className="flex gap-2.5 pt-2 border-t border-gray-100">
                        <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                          {(user?.name ?? user?.email ?? 'U')[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 flex gap-2">
                          <input
                            className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-200 outline-none bg-gray-50 focus:bg-white transition-colors"
                            placeholder="Write a comment… (Enter to post)"
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && commentText.trim()) { addComment.mutate({ content: commentText.trim() }); setCommentText(''); } }}
                          />
                          <Button size="sm" disabled={!commentText.trim()} loading={addComment.isPending}
                            onClick={() => { if (commentText.trim()) { addComment.mutate({ content: commentText.trim() }); setCommentText(''); } }}>
                            Post
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Time Logs Tab */}
                  {detailTab === 'time' && (
                    <div className="space-y-4">
                      {/* Entries list */}
                      {timeEntriesLoading ? (
                        <div className="flex items-center justify-center py-6 text-gray-400 text-xs gap-2">
                          <Clock size={14} className="animate-spin" /> Loading entries…
                        </div>
                      ) : taskTimeEntries.length > 0 ? (
                        <div className="space-y-2 max-h-44 overflow-y-auto">
                          {taskTimeEntries.map((e: any) => (
                            <div key={e.ROWID ?? e.id} className="flex items-center gap-3 text-xs bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
                              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                                <Clock size={13} className="text-blue-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-gray-800">{parseFloat(e.hours ?? 0).toFixed(2)}h</div>
                                <div className="text-[10px] text-gray-400 truncate">{e.description || 'No description'}</div>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${(e.is_billable === true || e.is_billable === 'true') ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                  {(e.is_billable === true || e.is_billable === 'true') ? '$ Billable' : 'Non-billable'}
                                </span>
                                <span className="text-[10px] text-gray-400">{e.entry_date ? format(parseISO(e.entry_date), 'MMM d') : ''}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-6 text-gray-400">
                          <Timer size={20} className="mx-auto mb-2 opacity-40" />
                          <p className="text-xs">No time logged yet. Use the timer or log below.</p>
                        </div>
                      )}

                      {/* Log time form */}
                      <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-2xl p-4 space-y-3">
                        <div className="text-xs font-bold text-indigo-700 flex items-center gap-1.5">
                          <Timer size={13} /> Log Time Entry
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] text-gray-500 font-medium block mb-1">Hours *</label>
                            <input type="number" step="0.25" min="0.25" className="form-input text-sm"
                              placeholder="1.5" value={logTimeHours} onChange={(e) => setLogTimeHours(e.target.value)} />
                          </div>
                          <div>
                            <label className="text-[11px] text-gray-500 font-medium block mb-1">Date *</label>
                            <input type="date" className="form-input text-sm" value={logTimeDate} onChange={(e) => setLogTimeDate(e.target.value)} />
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] text-gray-500 font-medium block mb-1">Description</label>
                          <input className="form-input text-sm" placeholder="What did you work on?"
                            value={logTimeDesc} onChange={(e) => setLogTimeDesc(e.target.value)} />
                        </div>
                        {/* Billable toggle */}
                        <div className="flex gap-3">
                          <label className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border-2 cursor-pointer transition-all text-xs font-semibold ${logTimeBillable ? 'border-green-400 bg-green-50 text-green-700' : 'border-gray-200 bg-white text-gray-400'}`}>
                            <input type="radio" name="detail_billable" checked={logTimeBillable} onChange={() => setLogTimeBillable(true)} className="hidden" />
                            💰 Billable
                          </label>
                          <label className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border-2 cursor-pointer transition-all text-xs font-semibold ${!logTimeBillable ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-400'}`}>
                            <input type="radio" name="detail_billable" checked={!logTimeBillable} onChange={() => setLogTimeBillable(false)} className="hidden" />
                            🔧 Non-billable
                          </label>
                        </div>
                        <Button size="sm" variant="primary" loading={logTimePending} disabled={!logTimeHours || !logTimeDate} onClick={handleLogTime} className="w-full">
                          Save Time Entry
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* AI Insights Tab */}
                  {detailTab === 'ai' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-400">AI-powered analysis, risk assessment & next-step suggestions</p>
                        <Button size="sm" variant="secondary" icon={<Zap size={11} />} loading={aiLoading}
                          onClick={() => { setAiInsight(null); }}>
                          Regenerate
                        </Button>
                      </div>
                      {aiLoading ? (
                        <div className="space-y-3 p-4">
                          {[90, 75, 60, 80].map((w, i) => (
                            <div key={i} className="h-3 bg-indigo-100 rounded-full animate-pulse" style={{ width: `${w}%` }} />
                          ))}
                        </div>
                      ) : aiInsight ? (
                        <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-2xl p-5 border border-indigo-100">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
                              <Zap size={14} className="text-white" />
                            </div>
                            <span className="text-sm font-bold text-indigo-800">AI Analysis</span>
                          </div>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{aiInsight}</p>
                        </div>
                      ) : (
                        <div className="text-center py-10">
                          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center mx-auto mb-3">
                            <Zap size={24} className="text-indigo-400" />
                          </div>
                          <p className="text-sm font-semibold text-gray-600 mb-1">AI Task Insights</p>
                          <p className="text-xs text-gray-400 mb-4">Get smart suggestions, risk analysis & next steps</p>
                          <Button variant="primary" icon={<Zap size={13} />} loading={aiLoading}
                            onClick={() => { setAiLoading(true); aiApi.taskInsight({ title: detailTask.title, description: (detailTask as any).description || '', status: detailTask.status, priority: detailTask.priority, dueDate: detailTask.dueDate || undefined, taskId: detailTask.id }).then((r: any) => setAiInsight(r?.data?.insight ?? r?.insight ?? 'Insights ready.')).catch(() => setAiInsight('Unable to generate AI insights at this time.')).finally(() => setAiLoading(false)); }}>
                            Generate AI Insights
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Right sidebar ── */}
              <div className="w-60 flex-shrink-0 space-y-4">
                {/* Status */}
                <div>
                  <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Status</div>
                  <select className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-200 outline-none"
                    value={detailTask.status}
                    onChange={(e) => updateStatus.mutate({ id: detailTask.id, data: { status: e.target.value } })}>
                    {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>

                {/* Meta card */}
                <div className="bg-gray-50 rounded-2xl p-4 space-y-3 border border-gray-100">
                  <MetaRow label="Priority">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${PRIORITY_CONFIG[detailTask.priority]?.color ?? ''}`}>
                      {PRIORITY_CONFIG[detailTask.priority]?.icon} {PRIORITY_CONFIG[detailTask.priority]?.label}
                    </span>
                  </MetaRow>
                  <MetaRow label="Type">
                    <span className={`text-xs px-2 py-0.5 rounded-md font-semibold ${TYPE_CONFIG[detailTask.type]?.color ?? ''}`}>
                      {TYPE_CONFIG[detailTask.type]?.label}
                    </span>
                  </MetaRow>
                  {(detailTask.storyPoints ?? 0) > 0 && (
                    <MetaRow label="Story Points">
                      <span className="text-sm font-bold text-indigo-600">{detailTask.storyPoints} pts</span>
                    </MetaRow>
                  )}
                  {detailTask.dueDate && (
                    <MetaRow label="Due Date">
                      <span className={`text-xs font-medium ${isPast(parseISO(detailTask.dueDate)) && detailTask.status !== 'DONE' ? 'text-red-600' : 'text-gray-700'}`}>
                        {format(parseISO(detailTask.dueDate), 'MMM d, yyyy')}
                      </span>
                    </MetaRow>
                  )}
                  {((detailTask as any).estimatedHours ?? 0) > 0 && (
                    <MetaRow label="Est. Hours">
                      <span className="text-xs text-gray-600">{(detailTask as any).estimatedHours}h estimated</span>
                    </MetaRow>
                  )}
                  {(detailTask.labels ?? []).length > 0 && (
                    <MetaRow label="Labels">
                      <div className="flex flex-wrap gap-1">
                        {(detailTask.labels ?? []).map((l) => (
                          <span key={l} className="text-[10px] bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-full px-2 py-0.5 font-medium">{l}</span>
                        ))}
                      </div>
                    </MetaRow>
                  )}
                </div>

                {/* ── Work Timer ── */}
                <div className={`rounded-2xl p-4 border transition-all ${timerRunning ? 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200' : 'bg-gray-50 border-gray-100'}`}>
                  <div className={`text-[11px] font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5 ${timerRunning ? 'text-emerald-700' : 'text-gray-400'}`}>
                    <Timer size={11} /> Work Timer
                  </div>
                  <div className={`text-3xl font-mono font-black text-center py-2 tracking-widest ${timerRunning ? 'text-emerald-600' : 'text-gray-300'}`}>
                    {timerDisplay}
                  </div>
                  {!timerRunning ? (
                    <button onClick={handleStartTimer}
                      className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors">
                      <PlayCircle size={16} /> Start Timer
                    </button>
                  ) : (
                    <button onClick={handleStopTimer}
                      className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors">
                      <Clock size={16} /> Stop &amp; Log
                    </button>
                  )}
                  {timerRunning && <p className="text-[10px] text-emerald-600 text-center mt-2 font-medium">⏳ Timer running — stop to auto-fill hours</p>}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Edit Task Modal ────────────────────────────────────────────────── */}
      <Modal
        open={!!editTask}
        onClose={() => setEditTask(null)}
        title="Edit Task"
        size="lg"
      >
        {editTask && (
          <form onSubmit={onSaveEdit} className="space-y-4">
            <div>
              <label className="form-label">Title *</label>
              <input className="form-input" {...editForm.register('title', { required: true })} />
            </div>
            <div>
              <label className="form-label">Description</label>
              <textarea className="form-textarea" rows={3} {...editForm.register('description')} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="form-label">Type</label>
                <select className="form-select" {...editForm.register('type')}>
                  <option value="TASK">Task</option>
                  <option value="STORY">Story</option>
                  <option value="BUG">Bug</option>
                  <option value="EPIC">Epic</option>
                  <option value="SUBTASK">Subtask</option>
                </select>
              </div>
              <div>
                <label className="form-label">Priority</label>
                <select className="form-select" {...editForm.register('priority')}>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>
              <div>
                <label className="form-label">Story Points</label>
                <input type="number" step="0.5" className="form-input" {...editForm.register('story_points', { valueAsNumber: true })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">Due Date</label>
                <input type="date" className="form-input" {...editForm.register('due_date')} />
              </div>
              <div>
                <label className="form-label">Est. Hours</label>
                <input type="number" step="0.25" className="form-input" {...editForm.register('estimated_hours', { valueAsNumber: true })} />
              </div>
            </div>
            <MultiUserSelect label="Assignees" value={editAssigneeIds} onChange={setEditAssigneeIds} users={users} />
            <div>
              <label className="form-label">Labels <span className="text-gray-400 font-normal">(comma separated)</span></label>
              <input className="form-input" placeholder="frontend, urgent" {...editForm.register('labels')} />
            </div>
            <ModalActions>
              <Button variant="secondary" onClick={() => setEditTask(null)}>Cancel</Button>
              <Button type="submit" variant="primary" loading={updateTask.isPending}>Save Changes</Button>
            </ModalActions>
          </form>
        )}
      </Modal>

      {showAIAnalysis && activeSprint && activeSprintId && (
        <SprintAnalysisModal
          open={showAIAnalysis}
          onClose={() => setShowAIAnalysis(false)}
          sprintId={activeSprintId}
          title={`Sprint Analysis — ${activeSprint.name}`}
          isPending={sprintAnalysis.isPending}
          data={sprintAnalysis.data}
          error={sprintAnalysis.error as Error | null}
          onRetry={() => sprintAnalysis.mutate({ sprintId: activeSprintId })}
        />
      )}
    </Layout>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</div>
      <div>{children}</div>
    </div>
  );
}
