import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
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
  AlertCircle, CheckCircle2, PlayCircle, Clock,
  Filter, Search, User, Zap, BarChart2,
  ArrowRight, Trash2, Edit2, GitBranch, Users, X, Timer, Paperclip,
  Send, DollarSign, Ban,
} from 'lucide-react';
import { timeEntriesApi, aiApi, tasksApi, sprintsApi } from '../lib/api';
import { useSubmitTimeEntry } from '../hooks/useTimeTracking';
import { format, isPast, parseISO, differenceInDays } from 'date-fns';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Modal, { ModalActions } from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import { PageSkeleton } from '../components/ui/Skeleton';
import MarkdownText from '../components/ui/MarkdownText';
import { useConfirm } from '../components/ui/ConfirmDialog';
import {
  useSprints,
  useSprintBoard,
  useCreateSprint,
  useUpdateSprint,
  useStartSprint,
  useCompleteSprint,
  useCreateTask,
  useUpdateTask,
  useUpdateTaskStatus,
  useDeleteTask,
  useTask,
  useSprint,
  useTaskComments,
  useAddTaskComment,
} from '../hooks/useTaskSprint';
import { useProject } from '../hooks/useProjects';
import { useUsers } from '../hooks/useUsers';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { hasPermission, PERMISSIONS } from '../utils/permissions';
import SprintAnalysisModal from '../components/ui/SprintAnalysisModal';
import { useAiSprintAnalysis } from '../hooks/useAiInsights';
import RichCommentEditor, { renderRichContent } from '../components/ui/RichCommentEditor';

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

// ── Time helpers: HH:MM ↔ decimal hours ──────────────────────────────────────
const parseHoursInput = (val: string): number => {
  const v = String(val ?? '').trim();
  if (v.includes(':')) {
    const parts = v.split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return Math.round((h + m / 60) * 100) / 100;
  }
  return Math.round(parseFloat(v) * 100) / 100 || 0;
};
const decimalToHHMM = (h: number): string => {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}:${String(mins).padStart(2, '0')}`;
};
const fmtH = (h: number | string): string => {
  const v = typeof h === 'string' ? parseFloat(h) : h;
  if (!v || isNaN(v)) return '—';
  const totalMin = Math.round(v * 60);
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h`;
  return `${mins}m`;
};

const COLUMNS: { key: TaskStatus; label: string; color: string; bg: string }[] = [
  { key: 'TODO', label: 'To Do', color: 'text-slate-500', bg: 'bg-slate-50' },
  { key: 'IN_PROGRESS', label: 'In Progress', color: 'text-blue-600', bg: 'bg-blue-50' },
  { key: 'IN_REVIEW', label: 'In Review', color: 'text-amber-600', bg: 'bg-amber-50' },
  { key: 'DONE', label: 'Done', color: 'text-emerald-600', bg: 'bg-emerald-50' },
];

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; icon: string }> = {
  CRITICAL: { label: 'Critical', color: 'text-red-600 bg-red-50 border-red-200', icon: '🔴' },
  HIGH: { label: 'High', color: 'text-orange-600 bg-orange-50 border-orange-200', icon: '🟠' },
  MEDIUM: { label: 'Medium', color: 'text-yellow-600 bg-yellow-50 border-yellow-200', icon: '🟡' },
  LOW: { label: 'Low', color: 'text-green-600 bg-green-50 border-green-200', icon: '🟢' },
};

const TYPE_CONFIG: Record<TaskType, { label: string; color: string }> = {
  TASK: { label: 'Task', color: 'bg-blue-100 text-blue-700' },
  STORY: { label: 'Story', color: 'bg-purple-100 text-purple-700' },
  BUG: { label: 'Bug', color: 'bg-red-100 text-red-700' },
  SUBTASK: { label: 'Subtask', color: 'bg-ds-border text-ds-text' },
  EPIC: { label: 'Epic', color: 'bg-indigo-100 text-indigo-700' },
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
        <div className="w-6 h-6 rounded-full ring-2 ring-white bg-gray-200 flex items-center justify-center text-[10px] font-bold text-ds-text-muted">
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
  const typeCfg = TYPE_CONFIG[task.type] ?? TYPE_CONFIG.TASK;
  const isOverdue = task.dueDate && isPast(parseISO(task.dueDate)) && task.status !== 'DONE';

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      {...(isDragOverlay ? {} : { ...listeners, ...attributes })}
      onClick={() => onOpen(task)}
      className={[
        'bg-ds-surface rounded-xl border border-ds-border p-3 cursor-pointer group select-none',
        'hover:shadow-md hover:border-indigo-200 transition-all duration-150',
        isDragging ? 'opacity-30' : '',
        isDragOverlay ? 'shadow-2xl rotate-2 border-indigo-300 scale-105' : 'shadow-sm',
      ].join(' ')}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-1 mb-2">
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${typeCfg.color}`}>{typeCfg.label}</span>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${p.color}`}>{p.icon} {p.label}</span>
      </div>

      {/* Title */}
      <p className="text-sm font-medium text-ds-text line-clamp-2 mb-2">{task.title}</p>

      {/* Labels */}
      {(task.labels ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {(task.labels ?? []).slice(0, 3).map((l) => (
            <span key={l} className="text-[10px] bg-ds-border text-ds-text-muted rounded px-1.5 py-0.5">{l}</span>
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
            <span className="text-[10px] text-ds-text-muted flex items-center gap-0.5">
              <Calendar size={9} />{format(parseISO(task.dueDate), 'MMM d')}
            </span>
          )}
        </div>
        {(task.assigneeIds?.length ?? 0) > 0 ? (
          <AvatarStack userIds={task.assigneeIds ?? []} users={users} />
        ) : task.assigneeId ? (
          <AvatarStack userIds={[task.assigneeId]} users={users} />
        ) : (
          <div className="w-5 h-5 rounded-full bg-ds-border flex items-center justify-center">
            <User size={10} className="text-ds-text-muted" />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Droppable Column ──────────────────────────────────────────────────────────

function KanbanColumn({ col, tasks, users, onAddTask, onOpenTask, canAddTask = true }: {
  col: typeof COLUMNS[number];
  tasks: Task[];
  users: unknown[];
  onAddTask: (status: TaskStatus) => void;
  onOpenTask: (t: Task) => void;
  canAddTask?: boolean;
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
        {canAddTask && (
          <button
            onClick={() => onAddTask(col.key)}
            className={`p-1 rounded hover:bg-white/70 transition-colors ${col.color}`}
            title={`Add task to ${col.label}`}
          >
            <Plus size={14} />
          </button>
        )}
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
          <div className="flex items-center justify-center h-24 rounded-lg border-2 border-dashed border-ds-border text-ds-text-muted text-xs">
            Drop tasks here
          </div>
        )}
      </div>
    </div>
  );
}

// ── Multi-Select Users ────────────────────────────────────────────────────────

function MultiUserSelect({ value, onChange, users, label, isLoading = false }: {
  value: string[];
  onChange: (ids: string[]) => void;
  users: unknown[];
  label: string;
  isLoading?: boolean;
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
  // Try both the id field and ROWID, and also handle numeric vs string mismatch
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getUser = (id: string) => allUsers.find((u: any) => {
    const uid = String(u.id ?? u.ROWID ?? '');
    return uid === id || uid === String(Number(id));
  });

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
        {value.length === 0 && <span className="text-ds-text-muted text-sm">Select assignees…</span>}
        {value.map((id) => {
          const u = getUser(id);
          const stillLoading = !u && (isLoading || allUsers.length === 0);
          const name = u?.name ?? u?.email ?? (stillLoading ? '…' : id.slice(0, 8) + '…');
          return (
            <span key={id} className={`flex items-center gap-1 text-xs rounded-full px-2 py-0.5 ${stillLoading ? 'bg-gray-100 text-gray-400 animate-pulse' : 'bg-indigo-100 text-indigo-700'}`}>
              <span className={`w-4 h-4 rounded-full text-white text-[9px] font-bold flex items-center justify-center ${stillLoading ? 'bg-gray-300' : 'bg-indigo-400'}`}>{name[0]?.toUpperCase()}</span>
              {name}
              <button type="button" onClick={(e) => { e.stopPropagation(); toggle(id); }} className="hover:text-red-600 ml-0.5">
                <X size={10} />
              </button>
            </span>
          );
        })}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-ds-surface border border-ds-border rounded-xl shadow-xl max-h-56 overflow-auto">
          <div className="p-2 border-b border-ds-border sticky top-0 bg-ds-surface">
            <input
              className="w-full text-sm border border-ds-border rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="Search users…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          </div>
          {filtered.length === 0 && <p className="text-xs text-ds-text-muted text-center py-3">No users found</p>}
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
                  {u.email && u.name && <div className="text-[10px] text-ds-text-muted truncate">{u.email}</div>}
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
  const { confirm } = useConfirm();
  // Split per-capability flags so the right permission gates the right control.
  // The old single `isAdmin` (gated everything on SPRINT_WRITE) was over-broad —
  // it was hiding the task-create flow from users who only had TASK_WRITE, and
  // exposing the time-approval toggle to people who didn't have TIME_APPROVE.
  const isTenantAdmin = user?.role === 'TENANT_ADMIN';
  const canManageSprint = isTenantAdmin || hasPermission(user, PERMISSIONS.SPRINT_WRITE);    // new / start / complete sprint
  const canCreateTask = isTenantAdmin || hasPermission(user, PERMISSIONS.TASK_WRITE);      // + Add Task buttons + delete
  const canConfigureApproval = isTenantAdmin || hasPermission(user, PERMISSIONS.TIME_APPROVE); // require-time-entry-approval toggle
  const canAssignToOthers = isTenantAdmin || hasPermission(user, PERMISSIONS.TASK_ASSIGN);
  // Kept for backwards compat with any remaining `isAdmin` reference; aliased
  // to canManageSprint since those are the truly sprint-gated controls.
  const isAdmin = canManageSprint;
  const { t } = useI18n();

  const [activeSprint, setActiveSprint] = useState<Sprint | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);       // dragging
  const [taskDetailId, setTaskDetailId] = useState<string | null>(null); // detail modal
  const [showCreateSprint, setShowCreateSprint] = useState(false);
  const [sprintMemberIds, setSprintMemberIds] = useState<string[]>([]);
  const [editSprintId, setEditSprintId] = useState<string | null>(null);
  const [editSprintMemberIds, setEditSprintMemberIds] = useState<string[]>([]);
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
  const [mentionedIds, setMentionedIds] = useState<string[]>([]);
  // time logging
  const [logTimeHours, setLogTimeHours] = useState('');
  const [logTimeDesc, setLogTimeDesc] = useState('');
  const [logTimeDate, setLogTimeDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [logTimeBillable, setLogTimeBillable] = useState(true);
  const [logTimePending, setLogTimePending] = useState(false);
  const [logTimeStartTime, setLogTimeStartTime] = useState('');
  const [logTimeEndTime, setLogTimeEndTime] = useState('');
  const [logTimeError, setLogTimeError] = useState('');
  const [editingEntry, setEditingEntry] = useState<any | null>(null);
  const [submittingEntryId, setSubmittingEntryId] = useState<string | null>(null);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [createTaskRequireApproval, setCreateTaskRequireApproval] = useState(false);
  const [editTaskRequireApproval, setEditTaskRequireApproval] = useState(false);
  // task detail tabs / timer / AI
  const [detailTab, setDetailTab] = useState<'comments' | 'time' | 'attachments' | 'ai' | 'audit_logs'>('comments');
  const [taskTimeEntries, setTaskTimeEntries] = useState<any[]>([]);
  const [timeEntriesLoading, setTimeEntriesLoading] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [timerDisplay, setTimerDisplay] = useState('00:00:00');
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [taskAttachments, setTaskAttachments] = useState<any[]>([]);

  // Auto-calculate hours when start/end time changes — output in HH:MM format
  React.useEffect(() => {
    if (logTimeStartTime && logTimeEndTime) {
      const [sh, sm] = logTimeStartTime.split(':').map(Number);
      const [eh, em] = logTimeEndTime.split(':').map(Number);
      const diff = (eh * 60 + em) - (sh * 60 + sm);
      if (diff > 0) {
        setLogTimeHours(decimalToHHMM(Math.round((diff / 60) * 100) / 100));
        setLogTimeError('');
      }
    }
  }, [logTimeStartTime, logTimeEndTime]);

  const { data: project } = useProject(projectId ?? '');
  const { data: sprints, isLoading: sprintsLoading } = useSprints(projectId ?? '');
  // Resolve sprint ID: prefer raw ROWID (always set by Catalyst) over normalised id
  const activeSprintId = activeSprint
    ? String(activeSprint.ROWID ?? activeSprint.id ?? '')
    : '';
  const { data: board, isLoading: boardLoading } = useSprintBoard(activeSprintId);
  const { data: usersData, isLoading: usersLoading } = useUsers();
  const { data: fullTask } = useTask(taskDetailId ?? '');
  const { data: comments } = useTaskComments(taskDetailId ?? '');
  const addComment = useAddTaskComment(taskDetailId ?? '');
  const submitTimeEntry = useSubmitTimeEntry();

  const createSprint = useCreateSprint();
  const updateSprintMutation = useUpdateSprint(editSprintId ?? '');
  const startSprint = useStartSprint();
  const completeSprint = useCompleteSprint();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const updateStatus = useUpdateTaskStatus();
  const deleteTask = useDeleteTask();
  const { data: editSprintDetail } = useSprint(editSprintId ?? '');

  const sprintList: Sprint[] = useMemo(() => Array.isArray(sprints) ? sprints : (sprints as any)?.data ?? [], [sprints]);
  const users: unknown[] = Array.isArray(usersData) ? usersData : (usersData as any)?.data ?? [];

  // Auto-select active sprint
  React.useEffect(() => {
    if (sprintList.length > 0 && !activeSprint) {
      const active = sprintList.find((s) => s.status === 'ACTIVE') ?? sprintList[0];
      setActiveSprint(active);
    }
  }, [sprintList, activeSprint]);

  // Populate edit sprint form when detail loads
  React.useEffect(() => {
    if (!editSprintDetail || !editSprintId) return;
    const s = editSprintDetail as any;
    editSprintForm.reset({
      name:            s.name            ?? '',
      goal:            s.goal            ?? '',
      start_date:      s.start_date      ?? s.startDate      ?? '',
      end_date:        s.end_date        ?? s.endDate        ?? '',
      capacity_points: s.capacity_points ?? s.capacityPoints ?? 0,
    });
    setEditSprintMemberIds(s.memberIds ?? []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSprintDetail, editSprintId]);

  // Reset detail state when task changes; restore any running timer
  React.useEffect(() => {
    if (!taskDetailId) {
      setTimerRunning(false); setTimerStart(null); setTimerDisplay('00:00:00');
      return;
    }
    setDetailTab('audit_logs'); setAiInsight(null); setTaskTimeEntries([]); setTaskAttachments([]);
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
      setTimerDisplay(`${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(iv);
  }, [timerRunning, timerStart]);

  // Populate attachments from fullTask when it loads
  React.useEffect(() => {
    if (!fullTask) return;
    const atts = (fullTask as any)?.attachments;
    if (Array.isArray(atts)) setTaskAttachments(atts);
  }, [fullTask]);

  // Load time entries when time tab opens
  React.useEffect(() => {
    if (detailTab !== 'time' || !taskDetailId) return;
    setTimeEntriesLoading(true);
    timeEntriesApi.list({ task_id: taskDetailId })
      .then((d: unknown) => setTaskTimeEntries(Array.isArray(d) ? d : []))
      .catch(() => setTaskTimeEntries([]))
      .finally(() => setTimeEntriesLoading(false));
  }, [detailTab, taskDetailId]);


  const boardData = useMemo(() =>
    (board && typeof board === 'object' && !Array.isArray(board))
      ? board as Record<string, Task[]>
      : { TODO: [], IN_PROGRESS: [], IN_REVIEW: [], DONE: [] },
  [board]);

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

  // Stats — DSV-027: only count tasks in the columns we actually render.
  // `boardData` can include statuses we don't show (CANCELLED, BACKLOG, etc.)
  // and flattening all keys was inflating the Total Tasks count past what
  // was visible on the board.
  const allTasks = COLUMNS.flatMap((col) => boardData[col.key] ?? []);
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

  const handleDragEnd = async (e: DragEndEvent) => {
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

    // Find current task status + the moved task itself (for the confirm copy)
    let fromStatus: TaskStatus | undefined;
    let movedTask: Task | undefined;
    for (const col of COLUMNS) {
      const hit = (boardData[col.key] ?? []).find((t) => t.id === String(active.id));
      if (hit) { fromStatus = col.key; movedTask = hit; break; }
    }
    if (!fromStatus || fromStatus === toStatus) return;

    // Confirm before mutating — moves are not undoable on the board side.
    const fromLabel = COLUMNS.find((c) => c.key === fromStatus)?.label ?? fromStatus;
    const toLabel = COLUMNS.find((c) => c.key === toStatus)?.label ?? toStatus;
    const ok = await confirm({
      title: 'Move task?',
      message: `Move "${movedTask?.title ?? 'this task'}" from ${fromLabel} → ${toLabel}? This can't be undone from the board — you'd have to drag it back manually.`,
      confirmText: `Move to ${toLabel}`,
      cancelText: 'Cancel',
      variant: 'warning',
    });
    if (!ok) return;
    updateStatus.mutate({ id: String(active.id), data: { status: toStatus } });
  };

  // Sprint form
  const sprintForm = useForm<SprintForm>();
  const editSprintForm = useForm<SprintForm>();

  const onCreateSprint = sprintForm.handleSubmit((data) => {
    createSprint.mutate({
      project_id: projectId,
      name: data.name,
      goal: data.goal,
      start_date: data.start_date,
      end_date: data.end_date,
      capacity_points: data.capacity_points,
      member_ids: sprintMemberIds,
    }, {
      onSuccess: () => { setShowCreateSprint(false); sprintForm.reset(); setSprintMemberIds([]); },
    });
  });

  const onSaveEditSprint = editSprintForm.handleSubmit(async (data) => {
    if (!editSprintId) return;
    await updateSprintMutation.mutateAsync({
      name: data.name, goal: data.goal,
      start_date: data.start_date, end_date: data.end_date,
      capacity_points: data.capacity_points,
    });
    const original: string[] = (editSprintDetail as any)?.memberIds ?? [];
    const added   = editSprintMemberIds.filter((id) => !original.includes(id));
    const removed = original.filter((id) => !editSprintMemberIds.includes(id));
    await Promise.all([
      ...added.map((uid) => sprintsApi.addMember(editSprintId, { user_id: uid })),
      ...removed.map((uid) => sprintsApi.removeMember(editSprintId, uid)),
    ]);
    setEditSprintId(null);
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
      require_approval: createTaskRequireApproval ? 'true' : 'false',
    }, {
      onSuccess: () => { setShowCreateTask(false); taskForm.reset(); setAssigneeIds([]); setCreateTaskRequireApproval(false); },
    });
  });

  const resetLogTimeForm = () => {
    setLogTimeHours(''); setLogTimeDesc('');
    setLogTimeStartTime(''); setLogTimeEndTime('');
    setLogTimeDate(format(new Date(), 'yyyy-MM-dd'));
    setLogTimeError(''); setEditingEntry(null);
  };

  const startEditEntry = (e: any) => {
    setEditingEntry(e);
    setLogTimeHours(String(e.hours ?? ''));
    setLogTimeDesc(e.description ?? '');
    setLogTimeBillable(e.is_billable === true || e.is_billable === 'true');
    setLogTimeStartTime(e.start_time ?? e.startTime ?? '');
    setLogTimeEndTime(e.end_time ?? e.endTime ?? '');
    const raw = e.entry_date ?? e.date ?? '';
    setLogTimeDate(raw ? raw.split('T')[0].split(' ')[0] : format(new Date(), 'yyyy-MM-dd'));
    setLogTimeError('');
    document.getElementById('sprint-log-time-form')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  // Log time against task
  const handleLogTime = async () => {
    if (!detailTask || !logTimeHours) return;
    // Validate start/end time
    if (logTimeStartTime && logTimeEndTime) {
      const [sh, sm] = logTimeStartTime.split(':').map(Number);
      const [eh, em] = logTimeEndTime.split(':').map(Number);
      if ((eh * 60 + em) - (sh * 60 + sm) <= 0) {
        setLogTimeError('End time must be after start time');
        return;
      }
    }
    setLogTimeError('');
    setLogTimePending(true);
    try {
      if (editingEntry) {
        const entryId = String(editingEntry.ROWID ?? editingEntry.id ?? '');
        await timeEntriesApi.update(entryId, {
          hours:       parseHoursInput(logTimeHours),
          description: logTimeDesc,
          is_billable: logTimeBillable,
          start_time:  logTimeStartTime || '',
          end_time:    logTimeEndTime   || '',
        });
      } else {
        await timeEntriesApi.create({
          project_id: detailTask.projectId ?? projectId,
          task_id: detailTask.id,
          entry_date: logTimeDate,
          hours: parseHoursInput(logTimeHours),
          description: logTimeDesc || detailTask.title,
          is_billable: logTimeBillable,
          require_approval: (detailTask as any).requireApproval === true ? 'true' : 'false',
          ...(logTimeStartTime ? { start_time: logTimeStartTime } : {}),
          ...(logTimeEndTime ? { end_time: logTimeEndTime } : {}),
        });
      }
      resetLogTimeForm();
      // Refresh time entries list
      if (taskDetailId) {
        setTimeEntriesLoading(true);
        timeEntriesApi.list({ task_id: taskDetailId })
          .then((d: unknown) => setTaskTimeEntries(Array.isArray(d) ? d : []))
          .catch(() => { }).finally(() => setTimeEntriesLoading(false));
      }
    } finally {
      setLogTimePending(false);
    }
  };


  const handleSubmitEntry = async (entryId: string) => {
    setTimeError(null);
    setSubmittingEntryId(entryId);
    try {
      await submitTimeEntry.mutateAsync(entryId);
      if (taskDetailId) {
        setTimeEntriesLoading(true);
        timeEntriesApi.list({ task_id: taskDetailId })
          .then((d: unknown) => setTaskTimeEntries(Array.isArray(d) ? d : []))
          .catch(() => { }).finally(() => setTimeEntriesLoading(false));
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Failed to submit entry';
      setTimeError(msg);
    } finally {
      setSubmittingEntryId(null);
    }
  };

  // Format a JS timestamp as a zero-padded HH:MM string for <input type="time">
  const fmtHHMM = (ts: number) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const handleStartTimer = () => {
    if (!taskDetailId) return;
    const ts = Date.now();
    localStorage.setItem(`ds_timer_${taskDetailId}`, String(ts));
    setTimerStart(ts);
    setTimerRunning(true);
    // Auto-fill the Start Time field with "now" so the user doesn't have to
    // type it manually. End time will be filled when the timer stops, and
    // Hours will auto-calculate from the pair (existing effect on the
    // start/end fields handles that).
    setLogTimeStartTime(fmtHHMM(ts));
    setLogTimeEndTime('');
    // Also pre-set today's date so the entry is dated to when the work happens.
    setLogTimeDate(format(new Date(), 'yyyy-MM-dd'));
    // Surface the form immediately so the user sees the captured start time.
    setDetailTab('time');
  };

  const handleStopTimer = () => {
    if (!timerStart || !taskDetailId) return;
    const endTs = Date.now();
    const elapsed = (endTs - timerStart) / 3600000;
    localStorage.removeItem(`ds_timer_${taskDetailId}`);
    setTimerRunning(false); setTimerStart(null); setTimerDisplay('00:00:00');
    // Fill Hours with the precise elapsed value (2-decimal precision so even
    // a 1-minute entry shows as 0.02h — was previously rounded to 0.25 which
    // dropped sub-15-minute entries to zero).
    setLogTimeHours(Math.max(0.01, Math.round(elapsed * 100) / 100).toFixed(2));
    // Auto-fill End Time so the start/end pair is complete and the
    // "→ Hours auto-filled" indicator activates next to the Hours field.
    setLogTimeEndTime(fmtHHMM(endTs));
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
      title: detailTask.title,
      description: (detailTask as any).description || '',
      status: detailTask.status,
      priority: detailTask.priority,
      dueDate: detailTask.dueDate || undefined,
      taskId: detailTask.id,
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
        require_approval: editTaskRequireApproval ? 'true' : 'false',
      },
    }, { onSuccess: () => setEditTask(null) });
  });

  const openEdit = (task: Task) => {
    setEditTask(task);
    setEditAssigneeIds(task.assigneeIds ?? (task.assigneeId ? [task.assigneeId] : []));
    setEditTaskRequireApproval((task as any).requireApproval === true);
    editForm.reset({
      title: task.title,
      description: task.description,
      type: task.type,
      priority: task.priority,
      story_points: task.storyPoints ?? undefined,
      estimated_hours: (task as any).estimatedHours ?? (task as any).estimated_hours ?? undefined,
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
        <div className={`flex-shrink-0 transition-all duration-200 ${sidebarCollapsed ? 'w-12' : 'w-64'} bg-ds-surface border-r border-ds-border flex flex-col overflow-hidden`}>
          <div className="flex items-center justify-between px-3 py-3 border-b border-ds-border">
            {!sidebarCollapsed && <span className="text-xs font-semibold text-ds-text-muted uppercase tracking-wider">Sprints</span>}
            <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="p-1 rounded hover:bg-ds-border text-ds-text-muted">
              {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          {!sidebarCollapsed && (
            <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
              {sprintList.length === 0 ? (
                <div className="text-center py-6 text-ds-text-muted text-xs">No sprints yet</div>
              ) : (
                sprintList.map((sprint) => {
                  const isActive = activeSprint?.id === sprint.id;
                  const statusColors: Record<string, string> = {
                    PLANNING: 'bg-slate-100 text-slate-600',
                    ACTIVE: 'bg-green-100 text-green-700',
                    COMPLETED: 'bg-ds-border text-ds-text-muted',
                  };
                  return (
                    <div
                      key={sprint.id}
                      className={[
                        'w-full text-left px-3 py-2.5 rounded-xl transition-all group',
                        isActive ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-ds-surface-hover',
                      ].join(' ')}
                    >
                      <div
                        className="cursor-pointer"
                        onClick={() => setActiveSprint(sprint)}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-medium truncate ${isActive ? 'text-indigo-700' : 'text-ds-text'}`}>
                            {sprint.name}
                          </span>
                          <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColors[sprint.status] ?? statusColors.PLANNING}`}>
                              {sprint.status}
                            </span>
                            {canManageSprint && (
                              <button
                                type="button"
                                title="Edit sprint"
                                onClick={(e) => { e.stopPropagation(); setEditSprintId(sprint.id); }}
                                className="w-6 h-6 rounded-lg flex items-center justify-center bg-white border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 shadow-sm opacity-0 group-hover:opacity-100 transition-all"
                              >
                                <Edit2 size={11} />
                              </button>
                            )}
                          </div>
                        </div>
                        {sprint.startDate && (
                          <div className="text-[10px] text-ds-text-muted">
                            {format(parseISO(sprint.startDate), 'MMM d')} →{' '}
                            {sprint.endDate ? format(parseISO(sprint.endDate), 'MMM d') : '?'}
                          </div>
                        )}
                        {sprint.goal && (
                          <p className="text-[10px] text-ds-text-muted line-clamp-1 mt-0.5">{sprint.goal}</p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Sprint stats */}
          {!sidebarCollapsed && activeSprint && (
            <div className="border-t border-ds-border px-3 py-3 bg-ds-surface-hover/50">
              <div className="text-[10px] text-ds-text-muted font-medium mb-2">SPRINT PROGRESS</div>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                  <div
                    className="bg-indigo-500 h-1.5 rounded-full transition-all"
                    style={{ width: totalCount > 0 ? `${(doneCount / totalCount) * 100}%` : '0%' }}
                  />
                </div>
                <span className="text-[10px] text-ds-text-muted">{doneCount}/{totalCount}</span>
              </div>
              {activeSprint.endDate && (
                <div className="text-[10px] text-ds-text-muted">
                  {differenceInDays(parseISO(activeSprint.endDate), new Date())} days left
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Board Area ────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-ds-surface-hover">
          {/* Toolbar */}
          <div className="flex items-center gap-3 px-5 py-3 bg-ds-surface border-b border-ds-border flex-shrink-0">
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ds-text-muted" />
              <input
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-ds-border rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none"
                placeholder="Search tasks…"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-ds-text-muted" />
              <select
                className="text-sm border border-ds-border rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-200"
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
                className="text-sm border border-ds-border rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-200"
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
              {/* Add Task is gated by TASK_WRITE (not SPRINT_WRITE) so anyone
                  who can create tasks in the project can add them to a sprint
                  even if they don't have permission to manage the sprint
                  itself. The backend route only requires TASK_WRITE. */}
              {canCreateTask && (
                <Button size="sm" icon={<Plus size={14} />} onClick={() => { setCreateTaskStatus('TODO'); setShowCreateTask(true); }}>
                  Add Task
                </Button>
              )}
            </div>
          </div>

          {/* Kanban */}
          {!activeSprint ? (
            <EmptyState title="No sprint selected" description="Select or create a sprint from the sidebar" icon={<GitBranch size={32} className="text-ds-border" />} />
          ) : boardLoading ? (
            <div className="flex-1 flex items-center justify-center text-ds-text-muted">{t('common.loading')}</div>
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
                      canAddTask={canCreateTask}
                    />
                  ))}
                </div>
              </div>
              <DragOverlay>
                {activeTask && (
                  <TaskCard task={activeTask} users={users} onOpen={() => { }} isDragOverlay />
                )}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </div>

      {/* ── Create Sprint Modal ──────────────────────────────────────────────── */}
      <Modal
        open={showCreateSprint}
        onClose={() => {}}
        closeOnBackdropClick={false}
        size="lg"
      >
        <form onSubmit={onCreateSprint} className="space-y-4">
          {/* Custom header with red close button */}
          <div className="flex items-center justify-between -mt-1 mb-1">
            <h3 className="text-base font-semibold text-ds-text">{t('sprints.modal.createTitle')}</h3>
            <button
              type="button"
              onClick={() => { setShowCreateSprint(false); sprintForm.reset(); setSprintMemberIds([]); }}
              className="p-1.5 rounded-lg text-white bg-red-500 hover:bg-red-600 transition-colors"
              title="Close"
            >
              <X size={15} />
            </button>
          </div>
          <div>
            <label className="form-label">{t('sprints.modal.nameLabel')} *</label>
            <input className="form-input" placeholder="e.g., Sprint 1" {...sprintForm.register('name', { required: true })} />
          </div>
          <div>
            <label className="form-label">{t('sprints.modal.goal')}</label>
            <textarea className="form-textarea" rows={2} placeholder="What do you aim to achieve?" {...sprintForm.register('goal')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">{t('sprints.modal.startDate')} *</label>
              <input type="date" className="form-input" {...sprintForm.register('start_date', { required: true })} />
            </div>
            <div>
              <label className="form-label">{t('sprints.modal.endDate')} *</label>
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

          <MultiUserSelect
            label="Members"
            value={sprintMemberIds}
            onChange={setSprintMemberIds}
            users={users}
          />

          <ModalActions>
            <Button variant="secondary" onClick={() => { setShowCreateSprint(false); sprintForm.reset(); setSprintMemberIds([]); }}>{t('common.cancel')}</Button>
            <Button type="submit" variant="primary" loading={createSprint.isPending}>{t('sprints.modal.create')}</Button>
          </ModalActions>
        </form>
      </Modal>

      {/* ── Edit Sprint Modal ───────────────────────────────────────────────── */}
      <Modal
        open={!!editSprintId}
        onClose={() => {}}
        closeOnBackdropClick={false}
        size="lg"
      >
        <form onSubmit={onSaveEditSprint} className="space-y-4">
          <div className="flex items-center justify-between -mt-1 mb-1">
            <h3 className="text-base font-semibold text-ds-text">Edit Sprint</h3>
            <button
              type="button"
              onClick={() => setEditSprintId(null)}
              className="p-1.5 rounded-lg text-white bg-red-500 hover:bg-red-600 transition-colors"
              title="Close"
            >
              <X size={15} />
            </button>
          </div>
          <div>
            <label className="form-label">Sprint Name *</label>
            <input className="form-input" placeholder="e.g., Sprint 1" {...editSprintForm.register('name', { required: true })} />
          </div>
          <div>
            <label className="form-label">Goal</label>
            <textarea className="form-textarea" rows={2} placeholder="What do you aim to achieve?" {...editSprintForm.register('goal')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Start Date *</label>
              <input type="date" className="form-input" {...editSprintForm.register('start_date', { required: true })} />
            </div>
            <div>
              <label className="form-label">End Date *</label>
              <input type="date" className="form-input" {...editSprintForm.register('end_date', { required: true })} />
            </div>
          </div>
          <div>
            <label className="form-label">Capacity (Story Points)</label>
            <input type="number" className="form-input" placeholder="40" {...editSprintForm.register('capacity_points', { valueAsNumber: true })} />
          </div>
          <MultiUserSelect
            label="Members"
            value={editSprintMemberIds}
            onChange={setEditSprintMemberIds}
            users={users}
            isLoading={usersLoading}
          />
          <ModalActions>
            <Button variant="secondary" onClick={() => setEditSprintId(null)}>{t('common.cancel')}</Button>
            <Button type="submit" variant="primary" loading={updateSprintMutation.isPending}>Save Changes</Button>
          </ModalActions>
        </form>
      </Modal>

      {/* ── Create Task Modal ────────────────────────────────────────────────── */}
      <Modal
        open={showCreateTask}
        onClose={() => { setShowCreateTask(false); taskForm.reset(); setAssigneeIds([]); }}
        title={t('tasks.modal.createTitle')}
        size="lg"
      >
        <form onSubmit={onCreateTask} className="space-y-4">
          <div>
            <label className="form-label">{t('tasks.modal.titleLabel')} *</label>
            <input className="form-input" placeholder="Task title" {...taskForm.register('title', { required: true })} />
          </div>
          <div>
            <label className="form-label">{t('tasks.modal.descLabel')}</label>
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
              <label className="form-label">{t('common.priority')}</label>
              <select className="form-select" {...taskForm.register('priority')}>
                <option value="CRITICAL">{t('tasks.priority.critical')}</option>
                <option value="HIGH">{t('tasks.priority.high')}</option>
                <option value="MEDIUM">{t('tasks.priority.medium')}</option>
                <option value="LOW">{t('tasks.priority.low')}</option>
              </select>
            </div>
            <div>
              <label className="form-label">Story Points</label>
              <input type="number" className="form-input" placeholder="0" step="0.5" {...taskForm.register('story_points', { valueAsNumber: true })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">{t('tasks.modal.dueDate')} *</label>
              <input
                type="date"
                className="form-input"
                min={new Date().toISOString().split('T')[0]}
                {...taskForm.register('due_date', { required: 'Due date is required' })}
              />
              {taskForm.formState.errors.due_date && (
                <p className="form-error">{taskForm.formState.errors.due_date.message as string}</p>
              )}
            </div>
            <div>
              <label className="form-label">Est. Hours</label>
              <input type="number" className="form-input" placeholder="0" step="0.25" {...taskForm.register('estimated_hours', { valueAsNumber: true })} />
            </div>
          </div>
          {canAssignToOthers ? (
            <MultiUserSelect
              label="Assignees"
              value={assigneeIds}
              onChange={setAssigneeIds}
              users={users}
            />
          ) : (
            <div>
              <label className="form-label">Assignees</label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-ds-border bg-ds-surface-hover text-sm text-ds-text-muted">
                <User size={13} className="text-ds-text-muted" />
                <span>Assigned to you — contact your lead to reassign</span>
              </div>
            </div>
          )}
          <div>
            <label className="form-label">Labels <span className="text-ds-text-muted font-normal">(comma separated)</span></label>
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
          {canConfigureApproval && (
            <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-amber-900">Require time entry approval</p>
                <p className="text-xs text-amber-600 mt-0.5">Time entries will be sent to <strong>you</strong> ({user?.name ?? 'task owner'}) for approval</p>
              </div>
              <button
                type="button"
                onClick={() => setCreateTaskRequireApproval((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${createTaskRequireApproval ? 'bg-amber-500' : 'bg-gray-300'}`}
                role="switch"
                aria-checked={createTaskRequireApproval}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${createTaskRequireApproval ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          )}
          <ModalActions>
            <Button variant="secondary" onClick={() => { setShowCreateTask(false); taskForm.reset(); setAssigneeIds([]); setCreateTaskRequireApproval(false); }}>{t('common.cancel')}</Button>
            <Button type="submit" variant="primary" loading={createTask.isPending}>{t('tasks.modal.create')}</Button>
          </ModalActions>
        </form>
      </Modal>

      {/* ── Task Detail Slide-over ─────────────────────────────────────────── */}
      {!!taskDetailId && detailTask && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/20 z-40"
            onClick={() => { setTaskDetailId(null); setCommentText(''); setDetailTab('audit_logs'); setAiInsight(null); }}
          />

          {/* Slide-over panel */}
          <div className="fixed top-0 right-0 h-full w-full max-w-4xl bg-ds-surface shadow-2xl z-50 flex flex-col overflow-hidden">

            {/* ── Header ── */}
            <div className="flex items-start gap-3 px-6 py-4 border-b border-ds-border bg-ds-surface-hover shrink-0">
              <span className={`mt-1 text-[11px] px-2 py-0.5 rounded-md font-semibold shrink-0 ${TYPE_CONFIG[detailTask.type]?.color ?? 'bg-ds-border text-ds-text'}`}>
                {TYPE_CONFIG[detailTask.type]?.label}
              </span>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-ds-text leading-snug mb-2">{detailTask.title}</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${PRIORITY_CONFIG[detailTask.priority]?.color ?? ''}`}>
                    {PRIORITY_CONFIG[detailTask.priority]?.icon} {PRIORITY_CONFIG[detailTask.priority]?.label}
                  </span>
                  {detailTask.dueDate && (
                    <span className={`text-xs flex items-center gap-1 font-medium ${isPast(parseISO(detailTask.dueDate)) && detailTask.status !== 'DONE' ? 'text-red-600' : 'text-ds-text-muted'}`}>
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
                  <Button size="sm" variant="secondary" icon={<Edit2 size={12} />} onClick={() => { openEdit(detailTask); setTaskDetailId(null); }}>Edit</Button>
                  {canCreateTask && (
                    <Button size="sm" variant="danger" icon={<Trash2 size={12} />} loading={deleteTask.isPending}
                      onClick={async () => {
                        const ok = await confirm({ title: 'Delete Task', message: `"${detailTask.title}" will be permanently deleted.`, confirmText: 'Delete', variant: 'danger' });
                        if (!ok) return;
                        deleteTask.mutate(detailTask.id);
                        setTaskDetailId(null);
                      }}>Delete</Button>
                  )}
                </div>
              </div>
              <button
                onClick={() => { setTaskDetailId(null); setCommentText(''); setDetailTab('audit_logs'); setAiInsight(null); }}
                className="p-1.5 rounded-lg text-white bg-red-500 hover:bg-red-600 transition-colors shrink-0"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* ── Scrollable body ── */}
            <div className="flex-1 overflow-y-auto">
            <div className="flex gap-6 p-6">
              {/* Left — main content */}
              <div className="flex-1 min-w-0 space-y-5">

                {/* Description */}
                <div className="bg-ds-surface-hover rounded-xl p-4">
                  <div className="text-[11px] font-bold text-ds-text-muted uppercase tracking-wider mb-2">Description</div>
                  {(detailTask as any).description
                    ? <p className="text-sm text-ds-text whitespace-pre-wrap leading-relaxed">{(detailTask as any).description}</p>
                    : <p className="text-sm text-ds-text-muted italic">No description provided.</p>}
                </div>

                {/* Assignees — compact avatar row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold text-ds-text-muted uppercase tracking-wider flex items-center gap-1">
                    <Users size={11} /> Assignees:
                  </span>
                  {((fullTask as any)?.assigneeIds?.length ?? detailTask.assigneeIds?.length ?? 0) > 0 ? (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {((fullTask as any)?.assigneeIds ?? detailTask.assigneeIds ?? []).map((uid: string) => {
                        const u = (users as any[]).find((x: any) => String(x.id ?? x.ROWID) === String(uid));
                        const name = u?.name ?? 'Unknown';
                        const avatar = u?.avatarUrl ?? '';
                        return (
                          <div key={uid} className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 rounded-full pl-0.5 pr-2.5 py-0.5">
                            <div className="w-5 h-5 rounded-full bg-indigo-200 flex items-center justify-center text-[9px] font-bold text-indigo-800 shrink-0 overflow-hidden">
                              {avatar ? <img src={avatar} alt={name} className="w-5 h-5 object-cover rounded-full" /> : name[0]?.toUpperCase()}
                            </div>
                            <span className="text-[11px] font-medium text-gray-700 truncate max-w-[90px]">{name}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-xs text-ds-text-muted italic">No one assigned</span>
                  )}
                </div>

                {/* ── Tabs: Comments | Time Logs | Files | AI Insights | Audit Logs ── */}
                <div>
                  <div className="flex border-b border-ds-border mb-4 overflow-x-auto">
                    {([
                      { key: 'comments',    label: 'Comments',    icon: <MessageSquare size={12} /> },
                      { key: 'time',        label: 'Time Logs',   icon: <Clock size={12} /> },
                      { key: 'attachments', label: 'Files',       icon: <Paperclip size={12} /> },
                      { key: 'ai',          label: 'AI Insights', icon: <Zap size={12} /> },
                      { key: 'audit_logs',  label: 'Audit Logs',  icon: <ArrowRight size={12} /> },
                    ] as { key: 'comments' | 'time' | 'attachments' | 'ai' | 'audit_logs'; label: string; icon: React.ReactNode }[]).map(({ key, label, icon }) => (
                      <button key={key} onClick={() => setDetailTab(key)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors -mb-px whitespace-nowrap ${detailTab === key ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-ds-text-muted hover:text-ds-text hover:border-ds-border'}`}>
                        {icon}{label}
                      </button>
                    ))}
                  </div>

                  {/* Audit Logs Tab */}
                  {detailTab === 'audit_logs' && (
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {((fullTask as any)?.history ?? []).length === 0 ? (
                        <div className="text-center py-10 text-ds-text-muted">
                          <ArrowRight size={20} className="mx-auto mb-2 opacity-30" />
                          <p className="text-xs">No status changes yet.</p>
                        </div>
                      ) : (
                        ((fullTask as any)?.history ?? []).map((h: any, i: number) => (
                          <div key={`h-${h.ROWID ?? i}`} className="flex items-center gap-2 text-xs py-1.5 px-3 bg-ds-surface-hover rounded-lg">
                            <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                              <ArrowRight size={9} className="text-amber-600" />
                            </div>
                            <span className="text-ds-text-muted">Status:</span>
                            <span className="px-1.5 py-0.5 bg-gray-200 rounded text-ds-text-muted text-[11px] font-medium">{h.from_status || '—'}</span>
                            <ArrowRight size={9} className="text-ds-text-muted shrink-0" />
                            <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[11px] font-semibold">{h.to_status}</span>
                            <span className="ml-auto text-[10px] text-ds-text-muted shrink-0">{h.CREATEDTIME ? format(new Date(h.CREATEDTIME), 'MMM d, h:mm a') : ''}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Comments Tab */}
                  {detailTab === 'comments' && (
                    <div className="space-y-3">
                      {/* Comments list */}
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {(Array.isArray(comments) ? comments : []).length === 0 ? (
                          <div className="text-center py-8 text-ds-text-muted">
                            <MessageSquare size={20} className="mx-auto mb-2 opacity-40" />
                            <p className="text-xs">No comments yet. Be the first!</p>
                          </div>
                        ) : (
                          (Array.isArray(comments) ? comments : []).map((c: any) => {
                            const u = users.find((x: any) => String(x.id ?? x.ROWID) === String(c.userId ?? c.user_id));
                            const name = (u as any)?.name ?? (u as any)?.email ?? 'User';
                            const avatarUrl = (u as any)?.avatarUrl;
                            return (
                              <div key={c.id ?? c.ROWID} className="flex gap-3">
                                {avatarUrl ? (
                                  <img src={avatarUrl} alt={name} className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5" />
                                ) : (
                                  <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-0.5">
                                    {name[0]?.toUpperCase()}
                                  </div>
                                )}
                                <div className="flex-1 bg-ds-surface border border-ds-border rounded-xl px-3 py-2.5 shadow-sm">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-semibold text-gray-800">{name}</span>
                                    <span className="text-[10px] text-ds-text-muted">{c.createdAt ? format(new Date(c.createdAt), 'MMM d, h:mm a') : ''}</span>
                                  </div>
                                  <div className="text-sm text-ds-text leading-snug">
                                    {renderRichContent(c.content ?? '', users as any[])}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                      {/* Add comment */}
                      <div className="pt-2 border-t border-ds-border space-y-2">
                        <RichCommentEditor
                          value={commentText}
                          onChange={setCommentText}
                          onMentionsChange={setMentionedIds}
                          users={(users as any[]).map((u: any) => ({ id: String(u.id ?? u.ROWID), name: u.name ?? u.email ?? 'User', email: u.email, avatarUrl: u.avatarUrl }))}
                          taskMemberIds={[
                            ...(detailTask.assigneeIds ?? (detailTask.assigneeId ? [detailTask.assigneeId] : [])),
                            (detailTask as any).createdBy,
                          ].filter((id): id is string => Boolean(id)).map(String)}
                          placeholder="Add a comment… Type @ to mention someone"
                          minHeight={80}
                          onCtrlEnter={() => {
                            if (commentText.replace(/<[^>]*>/g, '').trim()) {
                              addComment.mutate({ content: commentText, mentionedUserIds: mentionedIds });
                              setCommentText(''); setMentionedIds([]);
                            }
                          }}
                        />
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-ds-text-muted">⌘+Enter to post • @ to mention</span>
                          <Button size="sm" disabled={!commentText.replace(/<[^>]*>/g, '').trim()} loading={addComment.isPending}
                            onClick={() => {
                              if (commentText.replace(/<[^>]*>/g, '').trim()) {
                                addComment.mutate({ content: commentText, mentionedUserIds: mentionedIds });
                                setCommentText(''); setMentionedIds([]);
                              }
                            }}>
                            Post
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Files / Attachments Tab */}
                  {detailTab === 'attachments' && (
                    <div className="space-y-4">
                      {/* Upload button */}
                      <label className="flex items-center gap-2 cursor-pointer w-fit px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors">
                        <Paperclip size={13} />
                        Attach File
                        <input
                          type="file"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file || !taskDetailId) return;
                            e.target.value = '';
                            try {
                              await tasksApi.uploadAttachment(taskDetailId, file);
                              const updated = await tasksApi.get(taskDetailId);
                              const atts = (updated as any)?.attachments;
                              if (Array.isArray(atts)) setTaskAttachments(atts);
                            } catch { /* silent */ }
                          }}
                        />
                      </label>

                      {/* File list */}
                      {taskAttachments.length === 0 ? (
                        <div className="text-center py-10">
                          <Paperclip size={28} className="mx-auto mb-2 text-gray-300" />
                          <p className="text-xs text-ds-text-muted">No attachments yet.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {taskAttachments.map((a: any, i: number) => {
                            const name = a.file_name ?? a.fileName ?? a.name ?? `File ${i + 1}`;
                            const url  = a.file_url  ?? a.fileUrl  ?? a.url  ?? null;
                            const size = a.file_size ?? a.fileSize ?? null;
                            const ext  = name.split('.').pop()?.toLowerCase() ?? '';
                            const isImage = ['png','jpg','jpeg','gif','webp','svg'].includes(ext);
                            return (
                              <div key={a.ROWID ?? i} className="flex items-center gap-3 border border-ds-border rounded-xl px-3 py-2.5 bg-ds-surface hover:bg-ds-surface-hover transition-colors">
                                <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center shrink-0 text-[10px] font-bold uppercase">
                                  {isImage ? '🖼' : ext || '📎'}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-ds-text truncate">{name}</p>
                                  {size && <p className="text-[10px] text-ds-text-muted">{(size / 1024).toFixed(1)} KB</p>}
                                </div>
                                {url && (
                                  <a href={url} target="_blank" rel="noopener noreferrer"
                                    className="text-indigo-600 hover:text-indigo-800 text-xs font-medium shrink-0">
                                    Download
                                  </a>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Time Logs Tab */}
                  {detailTab === 'time' && (
                    <div className="space-y-4">
                      {/* Error banner */}
                      {timeError && (
                        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2.5 text-xs">
                          <AlertCircle size={13} className="shrink-0 mt-0.5" />
                          <span className="flex-1">{timeError}</span>
                          <button onClick={() => setTimeError(null)} className="shrink-0 text-red-400 hover:text-red-600"><X size={12} /></button>
                        </div>
                      )}

                      {/* Entries list */}
                      {timeEntriesLoading ? (
                        <div className="flex items-center justify-center py-6 text-ds-text-muted text-xs gap-2">
                          <Clock size={14} className="animate-spin" /> Loading entries…
                        </div>
                      ) : taskTimeEntries.length > 0 ? (
                        <div className="space-y-2.5 max-h-56 overflow-y-auto pr-0.5">
                          {taskTimeEntries.map((e: any) => {
                            const entryId = String(e.ROWID ?? e.id ?? '');
                            const status: string = e.status ?? 'DRAFT';
                            const isOwnEntry = String(e.user_id ?? e.userId ?? '') === String((user as any)?.id ?? '');
                            const isDraft = (status === 'DRAFT' || status === 'REJECTED') && isOwnEntry;
                            const isBillable = e.is_billable === true || e.is_billable === 'true';
                            const statusLabel = status === 'DRAFT' ? 'Saved' : status === 'SUBMITTED' ? 'Approval Pending' : status === 'APPROVED' ? 'Approved' : status === 'REJECTED' ? 'Rejected' : status;
                            const statusColor = status === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                              : status === 'SUBMITTED'
                                ? 'bg-amber-100 text-amber-700 border-amber-200'
                                : status === 'REJECTED'
                                  ? 'bg-red-100 text-red-600 border-red-200'
                                  : 'bg-slate-100 text-slate-500 border-slate-200';
                            const statusDot = status === 'APPROVED' ? 'bg-emerald-500' : status === 'SUBMITTED' ? 'bg-amber-500' : status === 'REJECTED' ? 'bg-red-500' : 'bg-slate-400';
                            const isOwn = String(e.user_id ?? e.userId ?? '') === String((user as any)?.id ?? '');
                            const editable = isOwn && ['DRAFT','REJECTED','SUBMITTED',undefined,null,''].includes(status);
                            const isBeingEdited = editingEntry && String(editingEntry.ROWID ?? editingEntry.id ?? '') === entryId;
                            return (
                              <div key={entryId} className={`border rounded-2xl shadow-sm overflow-hidden transition-colors ${isBeingEdited ? 'bg-amber-50 border-amber-300' : 'bg-ds-surface border-ds-border'}`}>
                                {/* Top row */}
                                <div className="flex items-center gap-3 px-3.5 pt-3 pb-2">
                                  {/* Hours pill */}
                                  <div className="flex items-center justify-center bg-indigo-600 text-white rounded-xl px-3 py-1.5 shrink-0">
                                    <Clock size={11} className="mr-1 opacity-80" />
                                    <span className="text-sm font-bold">{fmtH(e.hours ?? 0)}</span>
                                  </div>
                                  {/* Description + date + time range */}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-gray-800 truncate leading-tight">{e.description || 'No description'}</p>
                                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                      <p className="text-[10px] text-ds-text-muted">{e.entry_date ? format(parseISO(e.entry_date), 'MMM d, yyyy') : ''}</p>
                                      {(e.start_time || e.startTime) && (e.end_time || e.endTime) && (
                                        <span className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-md">
                                          <Clock size={8} />
                                          {(e.start_time || e.startTime).slice(0, 5)} – {(e.end_time || e.endTime).slice(0, 5)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {/* Edit + Billable */}
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {editable && !isBeingEdited && (
                                      <button
                                        onClick={() => startEditEntry(e)}
                                        className="p-1.5 rounded-lg text-ds-text-muted hover:text-amber-600 hover:bg-amber-50 transition-colors"
                                        title="Edit this entry"
                                      >
                                        <Edit2 size={12} />
                                      </button>
                                    )}
                                    {isBeingEdited && (
                                      <span className="text-[10px] font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">editing</span>
                                    )}
                                    <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg border ${isBillable ? 'bg-green-50 text-green-700 border-green-200' : 'bg-ds-surface-hover text-ds-text-muted border-ds-border'}`}>
                                      {isBillable ? <DollarSign size={9} /> : <Ban size={9} />}
                                      {isBillable ? 'Billable' : 'Non-billable'}
                                    </span>
                                  </div>
                                </div>
                                {/* Bottom row — status + action */}
                                <div className="flex items-center justify-between px-3.5 pb-3 gap-2">
                                  <span className={`flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-lg border ${statusColor}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`} />
                                    {statusLabel}
                                  </span>
                                  {isDraft && entryId && (
                                    <button
                                      disabled={submittingEntryId === entryId}
                                      onClick={() => handleSubmitEntry(entryId)}
                                      className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                                    >
                                      {submittingEntryId === entryId
                                        ? <><Clock size={10} className="animate-spin" /> Submitting…</>
                                        : <><Send size={10} /> Submit for Approval</>}
                                    </button>
                                  )}
                                  {status === 'SUBMITTED' && (
                                    <span className="text-[10px] text-amber-600 font-medium">Awaiting manager review</span>
                                  )}
                                  {status === 'APPROVED' && (
                                    <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium"><CheckCircle2 size={10} /> Approved</span>
                                  )}
                                  {status === 'REJECTED' && (
                                    <span className="text-[10px] text-red-500 font-medium">Re-submit after editing</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-6 text-ds-text-muted">
                          <Timer size={20} className="mx-auto mb-2 opacity-40" />
                          <p className="text-xs">No time logged yet. Use the timer or log below.</p>
                        </div>
                      )}

                      {/* Log time form */}
                      <div id="sprint-log-time-form" className={`rounded-2xl p-4 space-y-3 border ${editingEntry ? 'bg-amber-50 border-amber-300' : 'bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-200'}`}>
                        <div className="flex items-center justify-between">
                          <div className={`text-xs font-bold flex items-center gap-1.5 ${editingEntry ? 'text-amber-700' : 'text-indigo-700'}`}>
                            {editingEntry ? <><Edit2 size={13} /> Edit Time Entry</> : <><Timer size={13} /> Log New Time Entry</>}
                          </div>
                          {editingEntry && (
                            <button onClick={resetLogTimeForm} className="text-[11px] text-amber-700 hover:text-amber-900 font-medium flex items-center gap-1">
                              <X size={11} /> Cancel Edit
                            </button>
                          )}
                        </div>
                        {logTimeError && (
                          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                            <AlertCircle size={13} className="text-red-500 shrink-0" />
                            <span className="text-xs text-red-700 font-medium">{logTimeError}</span>
                          </div>
                        )}
                        {/* Start / End first — drives Hours auto-fill */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] text-ds-text-muted font-medium block mb-1">Start Time <span className="text-ds-text-muted font-normal">(optional)</span></label>
                            <input type="time" className="form-input text-sm" value={logTimeStartTime} onChange={(e) => setLogTimeStartTime(e.target.value)} />
                          </div>
                          <div>
                            <label className="text-[11px] text-ds-text-muted font-medium block mb-1">End Time <span className="text-ds-text-muted font-normal">(optional)</span></label>
                            <input type="time" className="form-input text-sm" value={logTimeEndTime} onChange={(e) => setLogTimeEndTime(e.target.value)} />
                          </div>
                        </div>
                        {/* Prominent duration banner */}
                        {logTimeStartTime && logTimeEndTime && (() => {
                          const [sh, sm] = logTimeStartTime.split(':').map(Number);
                          const [eh, em] = logTimeEndTime.split(':').map(Number);
                          const diff = (eh * 60 + em) - (sh * 60 + sm);
                          if (diff <= 0) return (
                            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl">
                              <AlertCircle size={13} className="text-red-500 shrink-0" />
                              <span className="text-sm text-red-700 font-medium">End time must be after start time</span>
                            </div>
                          );
                          const hh = Math.floor(diff / 60);
                          const mm = diff % 60;
                          const readable = hh > 0 && mm > 0 ? `${hh}h ${mm}m` : hh > 0 ? `${hh}h` : `${mm} min`;
                          const decimal = Math.round((diff / 60) * 100) / 100;
                          return (
                            <div className="flex items-center gap-2 px-3 py-2 bg-white/70 border border-indigo-200 rounded-xl">
                              <span className="text-sm text-indigo-800">
                                Duration: <strong>{readable}</strong>
                                <span className="text-indigo-400 ml-1.5 text-xs">→ Hours auto-filled as <strong className="text-indigo-600">{decimalToHHMM(decimal)}</strong></span>
                              </span>
                            </div>
                          );
                        })()}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] text-ds-text-muted font-medium block mb-1">
                              Hours *
                              {logTimeStartTime && logTimeEndTime && (
                                <span className="ml-1.5 text-[9px] font-bold text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded uppercase">auto</span>
                              )}
                            </label>
                            <input type="text" inputMode="text"
                              className={`form-input text-sm font-mono ${logTimeStartTime && logTimeEndTime ? 'bg-indigo-50 border-indigo-300 text-indigo-800 font-medium' : ''}`}
                              placeholder="1:30" value={logTimeHours} onChange={(e) => setLogTimeHours(e.target.value)} />
                          </div>
                          <div>
                            <label className="text-[11px] text-ds-text-muted font-medium block mb-1">Date *</label>
                            <input type="date" className={`form-input text-sm ${editingEntry ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`}
                              value={logTimeDate} readOnly={!!editingEntry}
                              onChange={(e) => !editingEntry && setLogTimeDate(e.target.value)} />
                            {editingEntry && <p className="text-[10px] text-amber-600 mt-0.5">Date cannot be changed when editing</p>}
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] text-ds-text-muted font-medium block mb-1">Description</label>
                          <input className="form-input text-sm" placeholder="What did you work on?"
                            value={logTimeDesc} onChange={(e) => setLogTimeDesc(e.target.value)} />
                        </div>
                        {/* Billable toggle */}
                        <div className="flex gap-3">
                          <label className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border-2 cursor-pointer transition-all text-xs font-semibold ${logTimeBillable ? 'border-green-400 bg-green-50 text-green-700' : 'border-ds-border bg-ds-surface text-ds-text-muted'}`}>
                            <input type="radio" name="detail_billable" checked={logTimeBillable} onChange={() => setLogTimeBillable(true)} className="hidden" />
                            💰 Billable
                          </label>
                          <label className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border-2 cursor-pointer transition-all text-xs font-semibold ${!logTimeBillable ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-ds-border bg-ds-surface text-ds-text-muted'}`}>
                            <input type="radio" name="detail_billable" checked={!logTimeBillable} onChange={() => setLogTimeBillable(false)} className="hidden" />
                            🔧 Non-billable
                          </label>
                        </div>
                        <div className="flex gap-2">
                          {editingEntry && (
                            <Button size="sm" variant="secondary" onClick={resetLogTimeForm} className="flex-1">
                              Cancel
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant={editingEntry ? 'outline' : 'primary'}
                            className={editingEntry ? 'flex-1 !border-amber-400 !text-amber-700 hover:!bg-amber-50' : 'flex-1'}
                            loading={logTimePending}
                            disabled={!logTimeHours || !logTimeDate}
                            onClick={handleLogTime}
                          >
                            {editingEntry ? 'Update Entry' : 'Save Time Entry'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* AI Insights Tab */}
                  {detailTab === 'ai' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-ds-text-muted">AI-powered analysis, risk assessment & next-step suggestions</p>
                        <Button size="sm" variant="secondary" icon={<Zap size={11} />} loading={aiLoading}
                          onClick={() => { setAiInsight(null); }}>
                          Regenerate
                        </Button>
                      </div>
                      {aiLoading ? (
                        <div className="space-y-3 p-4">
                          {[90, 75, 60, 80].map((w, i) => (
                            <div key={i} className="h-3 bg-indigo-100 dark:bg-indigo-900/40 rounded-full animate-pulse" style={{ width: `${w}%` }} />
                          ))}
                        </div>
                      ) : aiInsight ? (
                        <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 dark:from-indigo-950/40 dark:via-purple-950/40 dark:to-pink-950/40 rounded-2xl p-5 border border-indigo-100 dark:border-indigo-900/50">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
                              <Zap size={14} className="text-white" />
                            </div>
                            <span className="text-sm font-bold text-indigo-800 dark:text-indigo-200">AI Analysis</span>
                          </div>
                          <MarkdownText text={aiInsight} className="text-sm text-ds-text" accent="indigo" />
                        </div>
                      ) : (
                        <div className="text-center py-10">
                          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/40 dark:to-purple-900/40 flex items-center justify-center mx-auto mb-3">
                            <Zap size={24} className="text-indigo-400" />
                          </div>
                          <p className="text-sm font-semibold text-ds-text mb-1">AI Task Insights</p>
                          <p className="text-xs text-ds-text-muted mb-4">Get smart suggestions, risk analysis & next steps</p>
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
                  <div className="text-[11px] font-bold text-ds-text-muted uppercase tracking-wider mb-1.5">Status</div>
                  <select className="w-full text-sm border border-ds-border rounded-xl px-3 py-2 bg-ds-surface text-ds-text focus:ring-2 focus:ring-indigo-200 outline-none"
                    value={detailTask.status}
                    onChange={async (e) => {
                      const next = e.target.value as TaskStatus;
                      if (next === detailTask.status) return;
                      const fromLabel = COLUMNS.find((c) => c.key === detailTask.status)?.label ?? detailTask.status;
                      const toLabel = COLUMNS.find((c) => c.key === next)?.label ?? next;
                      const ok = await confirm({
                        title: 'Change status?',
                        message: `Move "${detailTask.title}" from ${fromLabel} → ${toLabel}? This can't be undone.`,
                        confirmText: `Move to ${toLabel}`,
                        cancelText: 'Cancel',
                        variant: 'warning',
                      });
                      // Reset the <select> back to the real value if the user cancelled —
                      // otherwise the dropdown shows the un-saved option.
                      if (!ok) { e.target.value = detailTask.status; return; }
                      updateStatus.mutate({ id: detailTask.id, data: { status: next } });
                    }}>
                    {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>

                {/* Meta card */}
                <div className="bg-ds-surface-hover rounded-2xl p-4 space-y-3 border border-ds-border">
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
                      <span className={`text-xs font-medium ${isPast(parseISO(detailTask.dueDate)) && detailTask.status !== 'DONE' ? 'text-red-600' : 'text-ds-text'}`}>
                        {format(parseISO(detailTask.dueDate), 'MMM d, yyyy')}
                      </span>
                    </MetaRow>
                  )}
                  {((detailTask as any).estimatedHours ?? 0) > 0 && (
                    <MetaRow label="Est. Hours">
                      <span className="text-xs text-ds-text-muted">{(detailTask as any).estimatedHours}h estimated</span>
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
                <div className={`rounded-2xl p-4 border transition-all ${timerRunning ? 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200' : 'bg-ds-surface-hover border-ds-border'}`}>
                  <div className={`text-[11px] font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5 ${timerRunning ? 'text-emerald-700' : 'text-ds-text-muted'}`}>
                    <Timer size={11} /> Work Timer
                  </div>
                  <div className={`text-3xl font-mono font-black text-center py-2 tracking-widest ${timerRunning ? 'text-emerald-600' : 'text-ds-border'}`}>
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
            </div>{/* end scrollable body */}
          </div>{/* end slide-over panel */}
        </>
      )}

      {/* ── Edit Task Modal ────────────────────────────────────────────────── */}
      <Modal
        open={!!editTask}
        onClose={() => setEditTask(null)}
        title={t('tasks.modal.editTitle')}
        size="2xl"
        closeOnBackdropClick={false}
        closeButtonVariant="danger"
      >
        {editTask && (
          <form onSubmit={onSaveEdit}>
            <div className="flex gap-5 overflow-y-auto max-h-[72vh]">
              {/* ── Left panel: content ── */}
              <div className="flex-[3] space-y-4 min-w-0">
                <div>
                  <label className="form-label">{t('tasks.modal.titleLabel')} *</label>
                  <input className="form-input" {...editForm.register('title', { required: true })} />
                </div>
                <div>
                  <label className="form-label">{t('tasks.modal.descLabel')}</label>
                  <textarea className="form-textarea" rows={4} {...editForm.register('description')} />
                </div>
                {canAssignToOthers ? (
                  <MultiUserSelect label="Assignees" value={editAssigneeIds} onChange={setEditAssigneeIds} users={users} />
                ) : (
                  <div>
                    <label className="form-label">Assignees</label>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-ds-border bg-ds-surface-hover text-sm text-ds-text-muted">
                      <User size={13} className="text-ds-text-muted" />
                      <span>Assigned to you — contact your lead to reassign</span>
                    </div>
                  </div>
                )}
                <div>
                  <label className="form-label">Labels <span className="text-ds-text-muted font-normal">(comma separated)</span></label>
                  <input className="form-input" placeholder="frontend, urgent" {...editForm.register('labels')} />
                </div>
              </div>

              {/* ── Right panel: properties ── */}
              <div className="flex-[2] space-y-3 min-w-0">
                {/* Properties card */}
                <div className="rounded-xl border border-ds-border bg-ds-surface-hover p-4 space-y-3">
                  <p className="text-[11px] font-semibold text-ds-text-muted uppercase tracking-wider">Properties</p>
                  <div>
                    <label className="form-label">⚡ Type</label>
                    <select className="form-select" {...editForm.register('type')}>
                      <option value="TASK">🔷 Task</option>
                      <option value="STORY">📖 Story</option>
                      <option value="BUG">🐛 Bug</option>
                      <option value="EPIC">🚀 Epic</option>
                      <option value="SUBTASK">🔹 Subtask</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">🔥 Priority</label>
                    <select className="form-select" {...editForm.register('priority')}>
                      <option value="CRITICAL">🔴 {t('tasks.priority.critical')}</option>
                      <option value="HIGH">🟠 {t('tasks.priority.high')}</option>
                      <option value="MEDIUM">🟡 {t('tasks.priority.medium')}</option>
                      <option value="LOW">🟢 {t('tasks.priority.low')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">📅 {t('tasks.modal.dueDate')}</label>
                    <input
                      type="date"
                      className="form-input"
                      {...editForm.register('due_date', { required: 'Due date is required' })}
                    />
                    {editForm.formState.errors.due_date && (
                      <p className="form-error">{editForm.formState.errors.due_date.message as string}</p>
                    )}
                  </div>
                </div>

                {/* Estimates card */}
                <div className="rounded-xl border border-ds-border bg-ds-surface-hover p-4 space-y-3">
                  <p className="text-[11px] font-semibold text-ds-text-muted uppercase tracking-wider">Estimates</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">🎯 Story Points</label>
                      <input type="number" step="0.5" className="form-input" {...editForm.register('story_points', { valueAsNumber: true })} />
                    </div>
                    <div>
                      <label className="form-label">⏱ Est. Hours</label>
                      <input type="number" step="0.25" className="form-input" {...editForm.register('estimated_hours', { valueAsNumber: true })} />
                    </div>
                  </div>
                </div>

                {/* Approval settings */}
                {canConfigureApproval && (
                  <div className="flex items-center justify-between rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-amber-900">Require time entry approval</p>
                      <p className="text-xs text-amber-600 mt-0.5">Time entries logged on this task need manager approval</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditTaskRequireApproval((v) => !v)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none shrink-0 ${editTaskRequireApproval ? 'bg-amber-500' : 'bg-gray-300'}`}
                      role="switch"
                      aria-checked={editTaskRequireApproval}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editTaskRequireApproval ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <ModalActions>
              <Button variant="secondary" onClick={() => setEditTask(null)}>{t('common.cancel')}</Button>
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
      <div className="text-[10px] font-semibold text-ds-text-muted uppercase tracking-wide mb-1">{label}</div>
      <div>{children}</div>
    </div>
  );
}
