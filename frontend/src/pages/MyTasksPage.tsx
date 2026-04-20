import React, { useState, useMemo, useEffect } from 'react';
import {
  CheckSquare, Clock, Filter, Search, ArrowUpRight, Circle, AlertCircle,
  CheckCircle2, Layers, Bug, Bookmark, Zap, Tag, Timer, Edit2, Plus,
  Trash2, Check, X, Paperclip, User, PlayCircle, StopCircle, MessageSquare,
  Users, BarChart2, Brain,
} from 'lucide-react';
import { format, parseISO, isPast, addDays, isBefore } from 'date-fns';
import { useForm } from 'react-hook-form';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Modal, { ModalActions } from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import Alert from '../components/ui/Alert';
import { PageSkeleton } from '../components/ui/Skeleton';
import { useAuth } from '../contexts/AuthContext';
import { useMyTasks, useUpdateTask, useCreateTask, useDeleteTask, useTask, useTaskComments, useAddTaskComment, useUpdateTaskStatus } from '../hooks/useTaskSprint';
import { useProjects } from '../hooks/useProjects';
import { useUsers, TenantUser } from '../hooks/useUsers';
import { timeEntriesApi, tasksApi, aiApi } from '../lib/api';
import { useQuery } from '@tanstack/react-query';
import UserAvatar from '../components/ui/UserAvatar';

// ── Safe date formatter (Catalyst returns non-ISO strings) ────────────────────
function safeFmt(val: string | undefined | null, fmt: string, fallback = ''): string {
  if (!val) return fallback;
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return fallback;
    return format(d, fmt);
  } catch { return fallback; }
}

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
  dueDate?: string;
  sprintId?: string;
  projectId?: string;
  labels?: string[];
}

interface Project { id: string; name: string }

// ── Form shape ────────────────────────────────────────────────────────────────

interface TaskFormData {
  title:       string;
  description: string;
  project_id:  string;
  type:        TaskType;
  priority:    TaskPriority;
  status:      TaskStatus;
  due_date:    string;
  labels:      string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; dot: string }> = {
  CRITICAL: { label: 'Critical', color: 'text-red-700 bg-red-50 border-red-200',          dot: 'bg-red-500'    },
  HIGH:     { label: 'High',     color: 'text-orange-700 bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
  MEDIUM:   { label: 'Medium',   color: 'text-yellow-700 bg-yellow-50 border-yellow-200', dot: 'bg-yellow-500' },
  LOW:      { label: 'Low',      color: 'text-gray-600 bg-gray-50 border-gray-200',       dot: 'bg-gray-400'   },
};

const STATUS_CONFIG: Record<TaskStatus, { label: string; icon: React.ReactNode; color: string }> = {
  TODO:        { label: 'To Do',       icon: <Circle size={14} />,       color: 'text-gray-500 bg-gray-50 border-gray-200'       },
  IN_PROGRESS: { label: 'In Progress', icon: <ArrowUpRight size={14} />, color: 'text-blue-700 bg-blue-50 border-blue-200'       },
  IN_REVIEW:   { label: 'In Review',   icon: <AlertCircle size={14} />,  color: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
  DONE:        { label: 'Done',        icon: <CheckCircle2 size={14} />, color: 'text-green-700 bg-green-50 border-green-200'    },
};

const TYPE_ICON: Record<TaskType, React.ReactNode> = {
  TASK:    <Layers size={13} className="text-blue-500" />,
  STORY:   <Bookmark size={13} className="text-green-500" />,
  BUG:     <Bug size={13} className="text-red-500" />,
  EPIC:    <Zap size={13} className="text-purple-500" />,
  SUBTASK: <Layers size={13} className="text-gray-400" />,
};

type TabFilter = 'all' | 'in_progress' | 'due_soon';

// ── Assignee Multi-Select ─────────────────────────────────────────────────────

function AssigneeMultiSelect({
  users, value, onChange,
}: { users: TenantUser[]; value: string[]; onChange: (ids: string[]) => void }) {
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => {
            const u = users.find((x) => String(x.id) === id);
            const label = u?.name ?? u?.email ?? id;
            return (
              <span key={id} className="inline-flex items-center gap-1 text-xs font-medium bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-full pl-1.5 pr-1 py-0.5">
                <UserAvatar name={label} avatarUrl={u?.avatarUrl} size="xs" />
                {label}
                <button type="button" onClick={() => toggle(id)} className="ml-0.5 text-indigo-400 hover:text-indigo-700"><X size={10} /></button>
              </span>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg max-h-36 overflow-y-auto">
        {users.length === 0
          ? <p className="text-xs text-gray-400">No users available.</p>
          : users.map((u) => {
              const id = String(u.id);
              const selected = value.includes(id);
              return (
                <button key={id} type="button" onClick={() => toggle(id)}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1.5 border transition-all ${selected ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-200 hover:border-indigo-400 hover:text-indigo-600'}`}>
                  <UserAvatar name={u.name ?? u.email ?? id} avatarUrl={u.avatarUrl} size="xs" />
                  {u.name ?? u.email}
                  {selected && <Check size={10} />}
                </button>
              );
            })}
      </div>
      {value.length === 0 && <p className="text-xs text-gray-400">Click to assign teammates.</p>}
    </div>
  );
}

// ── Attachment Picker ─────────────────────────────────────────────────────────

function AttachmentPicker({
  files, onChange,
}: { files: File[]; onChange: (f: File[]) => void }) {
  const handleAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files ?? []);
    onChange([...files, ...newFiles]);
    e.target.value = '';
  };
  return (
    <div className="space-y-2">
      <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-indigo-600 hover:text-indigo-800 transition-colors">
        <Paperclip size={14} />
        <span>Add attachments</span>
        <input type="file" multiple className="hidden" onChange={handleAdd} />
      </label>
      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1">
              <Paperclip size={11} className="text-gray-400 shrink-0" />
              <span className="truncate flex-1 text-gray-700">{f.name}</span>
              <span className="text-gray-400 shrink-0">{(f.size / 1024).toFixed(1)}KB</span>
              <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 shrink-0"><X size={11} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Task Form (Create / Edit) ─────────────────────────────────────────────────

function TaskFormModal({
  open, onClose, editing, projects,
}: {
  open: boolean;
  onClose: () => void;
  editing: Task | null;
  projects: Project[];
}) {
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const [assignees, setAssignees]     = useState<string[]>([]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [formError, setFormError]     = useState('');
  const { user } = useAuth();
  const { data: usersData = [] } = useUsers();
  const users = usersData as TenantUser[];

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<TaskFormData>({
    defaultValues: { type: 'TASK', priority: 'MEDIUM', status: 'TODO' },
  });

  React.useEffect(() => {
    if (open) {
      if (editing) {
        reset({
          title:       editing.title,
          description: editing.description ?? '',
          project_id:  editing.projectId ?? '',
          type:        editing.type,
          priority:    editing.priority,
          status:      editing.status,
          due_date:    editing.dueDate ?? '',
          labels:      (editing.labels ?? []).join(', '),
        });
        setAssignees(editing.assigneeIds ?? (editing.assigneeId ? [editing.assigneeId] : []));
      } else {
        reset({ type: 'TASK', priority: 'MEDIUM', status: 'TODO', project_id: '' });
        setAssignees(user?.id ? [String(user.id)] : []);
      }
      setAttachments([]);
      setFormError('');
    }
  }, [open, editing, reset, user?.id]);

  const onSubmit = handleSubmit(async (data) => {
    setFormError('');
    try {
      const payload = {
        project_id:   data.project_id,
        title:        data.title,
        description:  data.description,
        type:         data.type,
        priority:     data.priority,
        status:       data.status,
        due_date:     data.due_date || undefined,
        labels:       JSON.stringify(data.labels?.split(',').map((s) => s.trim()).filter(Boolean) ?? []),
        assignee_ids: JSON.stringify(assignees),
      };
      if (editing) {
        await updateTask.mutateAsync({ id: editing.id, data: payload });
        for (const file of attachments) await tasksApi.uploadAttachment(editing.id, file);
      } else {
        const created = await createTask.mutateAsync(payload) as { ROWID?: string; id?: string };
        const newId = String(created?.ROWID ?? created?.id ?? '');
        if (newId) for (const file of attachments) await tasksApi.uploadAttachment(newId, file);
      }
      onClose();
    } catch (e: unknown) { setFormError((e as Error).message); }
  });

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit Task' : 'New Task'} size="lg">
      <form onSubmit={onSubmit} className="space-y-4">
        {formError && <Alert type="error" message={formError} />}

        <div>
          <label className="form-label">Title *</label>
          <input className="form-input" placeholder="Task title" {...register('title', { required: 'Title is required' })} />
          {errors.title && <p className="text-xs text-red-600 mt-1">{errors.title.message}</p>}
        </div>

        <div>
          <label className="form-label">Description</label>
          <textarea className="form-textarea" rows={3} placeholder="Describe what needs to be done…" {...register('description')} />
        </div>

        <div>
          <label className="form-label">Project *</label>
          <select className="form-select" {...register('project_id', { required: 'Project is required' })}>
            <option value="">Select project…</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {errors.project_id && <p className="text-xs text-red-600 mt-1">{errors.project_id.message}</p>}
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

        <div>
          <label className="form-label">Due Date <span className="text-gray-400 font-normal">(optional)</span></label>
          <input type="date" className="form-input" {...register('due_date')} />
        </div>

        <div>
          <label className="form-label">Labels <span className="text-gray-400 font-normal">(comma-separated)</span></label>
          <input className="form-input" placeholder="frontend, urgent, qa…" {...register('labels')} />
        </div>

        <div>
          <label className="form-label flex items-center gap-1.5"><User size={13} /> Assignees</label>
          <AssigneeMultiSelect users={users} value={assignees} onChange={setAssignees} />
        </div>

        <div>
          <label className="form-label flex items-center gap-1.5"><Paperclip size={13} /> Attachments <span className="text-gray-400 font-normal">(optional)</span></label>
          <AttachmentPicker files={attachments} onChange={setAttachments} />
        </div>

        <ModalActions>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={isSubmitting || createTask.isPending || updateTask.isPending}>
            {editing ? 'Save Changes' : 'Create Task'}
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
}

// ── Task Detail Panel ─────────────────────────────────────────────────────────

function TaskDetailPanel({
  task, onClose, allUsers, projects,
  detailTab, setDetailTab,
  taskComments, detailComment, setDetailComment, onAddComment, addCommentPending,
  timerRunning, timerDisplay, onStartTimer, onStopTimer,
  taskTimeEntries, timeEntriesLoading,
  logTimeHours, setLogTimeHours,
  logTimeDate, setLogTimeDate,
  logTimeDesc, setLogTimeDesc,
  logTimeBillable, setLogTimeBillable,
  logTimeStartTime, setLogTimeStartTime,
  logTimeEndTime, setLogTimeEndTime,
  logTimePending, logTimeError, logTimeSendForApproval, setLogTimeSendForApproval, onLogTime,
  aiInsight, aiLoading,
  onEdit,
  taskAttachments,
  onUploadAttachment,
}: {
  task: Task;
  onClose: () => void;
  allUsers: TenantUser[];
  projects: Project[];
  detailTab: 'activity' | 'time' | 'ai' | 'attachments';
  setDetailTab: (t: 'activity' | 'time' | 'ai' | 'attachments') => void;
  taskAttachments: any[];
  onUploadAttachment: (file: File) => void;
  taskComments: any[];
  detailComment: string;
  setDetailComment: (v: string) => void;
  onAddComment: () => void;
  addCommentPending: boolean;
  timerRunning: boolean;
  timerDisplay: string;
  onStartTimer: () => void;
  onStopTimer: () => void;
  taskTimeEntries: any[];
  timeEntriesLoading: boolean;
  logTimeHours: string;      setLogTimeHours:      (v: string) => void;
  logTimeDate: string;       setLogTimeDate:       (v: string) => void;
  logTimeDesc: string;       setLogTimeDesc:       (v: string) => void;
  logTimeBillable: boolean;  setLogTimeBillable:   (v: boolean) => void;
  logTimeStartTime: string;  setLogTimeStartTime:  (v: string) => void;
  logTimeEndTime: string;    setLogTimeEndTime:    (v: string) => void;
  logTimePending: boolean;
  logTimeError: string;
  logTimeSendForApproval: boolean; setLogTimeSendForApproval: (v: boolean) => void;
  onLogTime: () => void;
  aiInsight: string | null;
  aiLoading: boolean;
  onEdit: (t: Task) => void;
}) {
  const priCfg     = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.MEDIUM;
  const stCfg      = STATUS_CONFIG[task.status];
  const project    = projects.find((p) => p.id === task.projectId);
  const assigneeIds = task.assigneeIds ?? (task.assigneeId ? [task.assigneeId] : []);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Slide-over panel */}
      <div className="fixed top-0 right-0 h-full w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-start gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50/80">
          <div className="mt-0.5 shrink-0">{TYPE_ICON[task.type] ?? TYPE_ICON.TASK}</div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 leading-snug">{task.title}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <span className={`text-xs px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${stCfg.color}`}>
                {stCfg.icon} {stCfg.label}
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${priCfg.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${priCfg.dot}`} />{priCfg.label}
              </span>
              {project && (
                <span className="text-xs text-indigo-600 font-medium">{project.name}</span>
              )}
              {task.dueDate && (
                <span className={`text-xs flex items-center gap-1 ${isPast(new Date(task.dueDate)) && task.status !== 'DONE' ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                  <Clock size={11} /> Due {safeFmt(task.dueDate, 'MMM d, yyyy')}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => onEdit(task)}
              className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              title="Edit task">
              <Edit2 size={15} />
            </button>
            <button onClick={onClose}
              className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title="Close">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* ── Meta row (assignees, points, labels) ── */}
        <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap items-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <Users size={12} className="text-gray-400" />
            {assigneeIds.length === 0 ? (
              <span className="text-gray-300 italic">Unassigned</span>
            ) : (
              <div className="flex -space-x-1">
                {assigneeIds.slice(0, 5).map((id) => {
                  const u = allUsers.find((x) => String(x.id) === id);
                  const label = u?.name ?? u?.email ?? id;
                  return u?.avatarUrl ? (
                    <img key={id} src={u.avatarUrl} alt={label} title={label}
                      className="w-6 h-6 rounded-full object-cover ring-2 ring-white" />
                  ) : (
                    <span key={id} title={label}
                      className="w-6 h-6 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                      {label[0]?.toUpperCase()}
                    </span>
                  );
                })}
                {assigneeIds.length > 5 && (
                  <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                    +{assigneeIds.length - 5}
                  </span>
                )}
              </div>
            )}
          </div>

          {task.storyPoints != null && (
            <div className="flex items-center gap-1">
              <BarChart2 size={12} className="text-gray-400" />
              <span>{task.storyPoints} pts</span>
            </div>
          )}

          {(task.labels ?? []).map((l) => (
            <span key={l} className="inline-flex items-center gap-0.5 bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">
              <Tag size={9} /> {l}
            </span>
          ))}
        </div>

        {/* ── Timer bar ── */}
        <div className="px-6 py-2.5 border-b border-gray-100 bg-indigo-50/50 flex items-center gap-3">
          <div className="font-mono text-sm font-semibold text-indigo-700 tracking-widest w-24 tabular-nums">
            {timerDisplay}
          </div>
          {timerRunning ? (
            <button onClick={onStopTimer}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg transition-colors">
              <StopCircle size={13} /> Stop &amp; Log
            </button>
          ) : (
            <button onClick={onStartTimer}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg transition-colors">
              <PlayCircle size={13} /> Start Timer
            </button>
          )}
          <span className="text-xs text-gray-400 ml-auto">Track time on this task</span>
        </div>

        {/* ── Description ── */}
        {task.description && (
          <div className="px-6 py-3 border-b border-gray-100">
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{task.description}</p>
          </div>
        )}

        {/* ── Tab nav ── */}
        <div className="flex border-b border-gray-100 px-6 bg-white shrink-0">
          {([
            { key: 'activity',    label: 'Activity',    icon: <MessageSquare size={12} /> },
            { key: 'attachments', label: 'Files',        icon: <Paperclip size={12} />     },
            { key: 'time',        label: 'Time Log',    icon: <Timer size={12} />          },
            { key: 'ai',          label: 'AI Insights', icon: <Brain size={12} />          },
          ] as { key: 'activity' | 'attachments' | 'time' | 'ai'; label: string; icon: React.ReactNode }[]).map(({ key, label, icon }) => (
            <button key={key} onClick={() => setDetailTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${detailTab === key ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {icon} {label}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Activity tab */}
          {detailTab === 'activity' && (
            <div className="p-6 space-y-4">
              {/* Add comment */}
              <div className="flex gap-2">
                <textarea
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
                  rows={2}
                  placeholder="Add a comment…"
                  value={detailComment}
                  onChange={(e) => setDetailComment(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onAddComment(); }}
                />
                <button
                  disabled={!detailComment.trim() || addCommentPending}
                  onClick={onAddComment}
                  className="self-end px-3 py-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                  Post
                </button>
              </div>

              {/* Comments list */}
              {taskComments.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8">No comments yet. Be the first to comment!</p>
              ) : (
                taskComments.map((c: any, i: number) => {
                  const commenter = allUsers.find((u: TenantUser) => String(u.id) === String(c.user_id));
                  const commenterName = commenter?.name ?? c.authorName ?? c.author ?? c.user ?? 'User';
                  const commenterAvatar = commenter?.avatarUrl;
                  return (
                  <div key={c.id ?? i} className="flex gap-3">
                    {commenterAvatar ? (
                      <img src={commenterAvatar} alt={commenterName} className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5" />
                    ) : (
                      <span className="w-7 h-7 rounded-full bg-indigo-500 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {commenterName[0]?.toUpperCase()}
                      </span>
                    )}
                    <div className="flex-1 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-gray-700">
                          {commenterName}
                        </span>
                        {c.createdAt && (
                          <span className="text-[10px] text-gray-400">
                            {safeFmt(c.createdAt, 'MMM d, h:mm a')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed">{c.content ?? c.text ?? c.body}</p>
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          )}

          {/* Time Log tab */}
          {detailTab === 'time' && (
            <div className="p-6 space-y-5">
              {/* Log form */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Log Time</h4>
                {logTimeError && <Alert type="error" message={logTimeError} />}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Hours *</label>
                    <input type="number" step="0.25" min="0.25" className="form-input"
                      placeholder="1.5" value={logTimeHours} onChange={(e) => setLogTimeHours(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Date *</label>
                    <input type="date" className="form-input"
                      value={logTimeDate} onChange={(e) => setLogTimeDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Start Time</label>
                    <input type="time" className="form-input"
                      value={logTimeStartTime} onChange={(e) => setLogTimeStartTime(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">End Time</label>
                    <input type="time" className="form-input"
                      value={logTimeEndTime} onChange={(e) => setLogTimeEndTime(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="form-label">Description</label>
                  <input className="form-input" placeholder="What did you work on?"
                    value={logTimeDesc} onChange={(e) => setLogTimeDesc(e.target.value)} />
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                    <input type="checkbox" checked={logTimeBillable}
                      onChange={(e) => setLogTimeBillable(e.target.checked)} className="rounded" />
                    Billable
                  </label>
                </div>

                {/* Send for approval toggle */}
                <div className="flex items-center justify-between rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5">
                  <div>
                    <p className="text-xs font-medium text-blue-900">Send for approval</p>
                    <p className="text-[11px] text-blue-500 mt-0.5">Manager will be notified to review</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLogTimeSendForApproval(!logTimeSendForApproval)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${logTimeSendForApproval ? 'bg-blue-600' : 'bg-gray-300'}`}
                    role="switch"
                    aria-checked={logTimeSendForApproval}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${logTimeSendForApproval ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
                  </button>
                </div>

                <div className="flex justify-end">
                  <Button size="sm" variant="primary" loading={logTimePending} disabled={!logTimeHours} onClick={onLogTime}>
                    {logTimeSendForApproval ? 'Log & Send for Approval' : 'Save Entry'}
                  </Button>
                </div>
              </div>

              {/* Entries list */}
              {timeEntriesLoading ? (
                <p className="text-xs text-gray-400 text-center py-4">Loading entries…</p>
              ) : taskTimeEntries.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No time logged yet.</p>
              ) : (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">History</h4>
                  {taskTimeEntries.map((e: any, i: number) => (
                    <div key={e.id ?? i} className="bg-white border border-gray-100 rounded-xl px-3 py-3 shadow-sm space-y-1.5">
                      {/* Top row: user + hours + date */}
                      <div className="flex items-center gap-2">
                        <UserAvatar
                          name={e.user_name || e.userName || '?'}
                          avatarUrl={e.user_avatar_url || e.userAvatarUrl}
                          size="xs"
                        />
                        <span className="text-xs font-medium text-gray-700 flex-1 truncate">
                          {e.user_name || e.userName || 'Unknown'}
                        </span>
                        <span className="text-xs font-bold text-indigo-700 shrink-0">{e.hours}h</span>
                        <span className="text-[11px] text-gray-400 shrink-0">
                          {safeFmt(e.entry_date, 'MMM d')}
                        </span>
                        {e.is_billable && (
                          <span className="text-green-600 font-semibold shrink-0 text-xs" title="Billable">$</span>
                        )}
                      </div>
                      {/* Description + time range */}
                      <div className="flex items-center gap-2 pl-7">
                        {e.description && (
                          <span className="text-[11px] text-gray-500 flex-1 truncate">{e.description}</span>
                        )}
                        {(e.start_time || e.startTime) && (e.end_time || e.endTime) && (
                          <span className="text-[11px] text-gray-400 shrink-0">
                            {(e.start_time || e.startTime).slice(0, 5)} – {(e.end_time || e.endTime).slice(0, 5)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="text-right text-xs text-gray-500 pt-1">
                    Total: <span className="font-semibold text-gray-700">
                      {taskTimeEntries.reduce((sum: number, e: any) => sum + (parseFloat(e.hours) || 0), 0).toFixed(2)}h
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AI Insights tab */}
          {detailTab === 'ai' && (
            <div className="p-6">
              {aiLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
                  <Brain size={16} className="animate-pulse text-indigo-400" />
                  Generating insights…
                </div>
              ) : aiInsight ? (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Brain size={15} className="text-indigo-500" />
                    <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">AI Insights</span>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{aiInsight}</p>
                </div>
              ) : (
                <p className="text-xs text-gray-400 text-center py-8">No insights available.</p>
              )}
            </div>
          )}

          {/* Attachments tab */}
          {detailTab === 'attachments' && (
            <div className="p-6 space-y-4">
              {/* Upload button */}
              <label className="flex items-center gap-2 cursor-pointer w-fit px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors">
                <Paperclip size={13} />
                Attach File
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) { onUploadAttachment(file); e.target.value = ''; }
                  }}
                />
              </label>

              {/* File list */}
              {taskAttachments.length === 0 ? (
                <div className="text-center py-10">
                  <Paperclip size={28} className="mx-auto mb-2 text-gray-200" />
                  <p className="text-xs text-gray-400">No attachments yet.</p>
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
                      <div key={a.ROWID ?? i} className="flex items-center gap-3 border border-gray-100 rounded-xl px-3 py-2.5 bg-white hover:bg-gray-50 transition-colors">
                        <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center shrink-0 text-[10px] font-bold uppercase">
                          {isImage ? '🖼' : ext || '📎'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-800 truncate">{name}</p>
                          {size && <p className="text-[10px] text-gray-400">{(size / 1024).toFixed(1)} KB</p>}
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

        </div>
      </div>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MyTasksPage() {
  const { user } = useAuth();

  const { data: rawTasks, isLoading, error } = useMyTasks();
  const { data: rawProjects } = useProjects();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const projects: Project[] = useMemo(() => {
    const arr = Array.isArray(rawProjects) ? rawProjects : [];
    return arr as Project[];
  }, [rawProjects]);

  const allMyTasks: Task[] = useMemo(() => {
    const arr = Array.isArray(rawTasks) ? rawTasks : (rawTasks as any)?.data ?? [];
    return arr as Task[];
  }, [rawTasks]);

  // Fetch all time entries for the current user once and build a taskId → totalHours map
  const { data: rawTimeEntries = [] } = useQuery({
    queryKey: ['myTimeEntries'],
    queryFn: () => timeEntriesApi.list(),
    staleTime: 60_000,
    retry: 1,
  });
  const taskHoursMap = useMemo(() => {
    const map: Record<string, number> = {};
    const entries = Array.isArray(rawTimeEntries) ? rawTimeEntries : (rawTimeEntries as any)?.data ?? [];
    for (const e of entries as any[]) {
      const tid = String(e.task_id ?? '');
      if (!tid || tid === '0') continue;
      map[tid] = (map[tid] ?? 0) + (parseFloat(e.hours) || 0);
    }
    return map;
  }, [rawTimeEntries]);

  // ── Pagination ──
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);

  // ── Tabs / Filters ──
  const [activeTab, setActiveTab]           = useState<TabFilter>('all');
  const [search, setSearch]                 = useState('');
  const [filterStatus, setFilterStatus]     = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterProject, setFilterProject]   = useState('');
  const [showFilters, setShowFilters]       = useState(false);

  const now            = new Date();
  const dueSoonCutoff  = addDays(now, 7);

  const tabFiltered = useMemo(() => {
    if (activeTab === 'in_progress') return allMyTasks.filter((t) => t.status === 'IN_PROGRESS');
    if (activeTab === 'due_soon') return allMyTasks.filter((t) => {
      if (!t.dueDate || t.status === 'DONE') return false;
      return isBefore(parseISO(t.dueDate), dueSoonCutoff);
    });
    return allMyTasks;
  }, [allMyTasks, activeTab, dueSoonCutoff]);

  const filtered = useMemo(() => tabFiltered.filter((t) => {
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus   && t.status    !== filterStatus)   return false;
    if (filterPriority && t.priority  !== filterPriority) return false;
    if (filterProject  && t.projectId !== filterProject)  return false;
    return true;
  }), [tabFiltered, search, filterStatus, filterPriority, filterProject]);

  // Reset page when filters change
  useEffect(() => setPage(1), [search, filterStatus, filterPriority, filterProject]);

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const groupedByStatus = useMemo(() => {
    const groups: Record<string, Task[]> = { TODO: [], IN_PROGRESS: [], IN_REVIEW: [], DONE: [] };
    for (const t of paginated) {
      if (groups[t.status]) groups[t.status].push(t);
      else groups[t.status] = [t];
    }
    return groups;
  }, [paginated]);

  const inProgressCount = allMyTasks.filter((t) => t.status === 'IN_PROGRESS').length;
  const dueSoonCount    = allMyTasks.filter((t) =>
    t.dueDate && !isBefore(parseISO(t.dueDate), now) &&
    isBefore(parseISO(t.dueDate), dueSoonCutoff) && t.status !== 'DONE'
  ).length;
  const hasActiveFilters = !!(filterStatus || filterPriority || filterProject || search);

  // ── Modals ──
  const [taskModal, setTaskModal]     = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const openCreate = () => { setEditingTask(null); setTaskModal(true); };
  const openEdit   = (t: Task) => { setEditingTask(t); setTaskModal(true); };
  const closeModal = () => { setTaskModal(false); setEditingTask(null); };

  // ── Quick status ──
  const handleStatusChange = (t: Task, status: string) =>
    updateTask.mutate({ id: t.id, data: { status } });

  // ── Delete ──
  const handleDelete = (t: Task) => {
    if (!window.confirm(`Delete "${t.title}"?`)) return;
    deleteTask.mutate(t.id);
  };

  // ── Task Detail ──
  const [taskDetailId, setTaskDetailId]           = useState<string | null>(null);
  const [detailTab, setDetailTab]                 = useState<'activity' | 'time' | 'ai' | 'attachments'>('activity');
  const [taskTimeEntries, setTaskTimeEntries]     = useState<any[]>([]);
  const [timeEntriesLoading, setTimeEntriesLoading] = useState(false);
  const [timerRunning, setTimerRunning]           = useState(false);
  const [timerStart, setTimerStart]               = useState<number | null>(null);
  const [timerDisplay, setTimerDisplay]           = useState('00:00:00');
  const [aiInsight, setAiInsight]                 = useState<string | null>(null);
  const [aiLoading, setAiLoading]                 = useState(false);
  const [detailComment, setDetailComment]         = useState('');
  const [logTimeHours, setLogTimeHours]           = useState('');
  const [logTimeDate, setLogTimeDate]             = useState(new Date().toISOString().slice(0, 10));
  const [logTimeDesc, setLogTimeDesc]             = useState('');
  const [logTimeBillable, setLogTimeBillable]     = useState(false);
  const [logTimeStartTime, setLogTimeStartTime]   = useState('');
  const [logTimeEndTime, setLogTimeEndTime]       = useState('');
  const [logTimePending, setLogTimePending]       = useState(false);
  const [logTimeError, setLogTimeError]           = useState('');
  const [logTimeSendForApproval, setLogTimeSendForApproval] = useState(false);

  const { data: fullTask }              = useTask(taskDetailId ?? '');
  const { data: taskComments = [] }     = useTaskComments(taskDetailId ?? '');
  const addComment                      = useAddTaskComment(taskDetailId ?? '');
  const updateTaskStatus                = useUpdateTaskStatus();
  const { data: detailUsers = [] }      = useUsers();
  const allDetailUsers                  = detailUsers as TenantUser[];
  const [taskAttachments, setTaskAttachments] = useState<any[]>([]);

  const detailTask: Task | null = useMemo(() => {
    if (!taskDetailId) return null;
    const fromList = allMyTasks.find((t) => t.id === taskDetailId);
    if (fromList) return fromList;
    if (fullTask && (fullTask as any).id) return fullTask as unknown as Task;
    return null;
  }, [taskDetailId, allMyTasks, fullTask]);

  // Restore timer from localStorage when opening a task
  useEffect(() => {
    if (!taskDetailId) return;
    const stored = localStorage.getItem(`ds_timer_${taskDetailId}`);
    if (stored) {
      const start = parseInt(stored, 10);
      setTimerStart(start);
      setTimerRunning(true);
    } else {
      setTimerRunning(false);
      setTimerStart(null);
      setTimerDisplay('00:00:00');
    }
    setDetailTab('activity');
    setAiInsight(null);
    setTaskTimeEntries([]);
    setTaskAttachments([]);
    setDetailComment('');
    setLogTimeHours('');
    setLogTimeDesc('');
    setLogTimeBillable(false);
    setLogTimeStartTime('');
    setLogTimeEndTime('');
    setLogTimeError('');
  }, [taskDetailId]);

  // Populate attachments from fullTask when it loads
  useEffect(() => {
    if (!fullTask) return;
    const atts = (fullTask as any)?.attachments;
    if (Array.isArray(atts)) setTaskAttachments(atts);
  }, [fullTask]);

  // Timer tick
  useEffect(() => {
    if (!timerRunning || timerStart === null) return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - timerStart) / 1000);
      const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
      const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
      const s = String(elapsed % 60).padStart(2, '0');
      setTimerDisplay(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [timerRunning, timerStart]);

  // Load time entries when switching to time tab
  useEffect(() => {
    if (detailTab !== 'time' || !taskDetailId) return;
    setTimeEntriesLoading(true);
    timeEntriesApi.list({ task_id: taskDetailId })
      .then((r: any) => setTaskTimeEntries(Array.isArray(r) ? r : r?.data ?? []))
      .catch(() => setTaskTimeEntries([]))
      .finally(() => setTimeEntriesLoading(false));
  }, [detailTab, taskDetailId]);

  // Load AI insights when switching to ai tab
  useEffect(() => {
    if (detailTab !== 'ai' || !taskDetailId || !detailTask) return;
    setAiLoading(true); setAiInsight(null);
    aiApi.taskInsight({
      taskId:      taskDetailId,
      title:       detailTask.title,
      description: detailTask.description ?? '',
      status:      detailTask.status,
      priority:    detailTask.priority,
      dueDate:     detailTask.dueDate ?? undefined,
    })
      .then((r: any) => setAiInsight(r?.data?.insight ?? r?.insight ?? 'No insights available.'))
      .catch(() => setAiInsight('Unable to load AI insights.'))
      .finally(() => setAiLoading(false));
  }, [detailTab, taskDetailId, detailTask]);

  const handleStartTimer = () => {
    const ts = Date.now();
    localStorage.setItem(`ds_timer_${taskDetailId}`, String(ts));
    setTimerStart(ts); setTimerRunning(true);
  };

  const handleStopTimer = () => {
    if (!timerStart) return;
    const elapsed = (Date.now() - timerStart) / 3600000;
    localStorage.removeItem(`ds_timer_${taskDetailId}`);
    setTimerRunning(false); setTimerStart(null); setTimerDisplay('00:00:00');
    setLogTimeHours(Math.max(0.25, Math.round(elapsed * 4) / 4).toFixed(2));
    setDetailTab('time');
  };

  const handleDetailLogTime = async () => {
    if (!taskDetailId || !logTimeHours || !detailTask) return;
    setLogTimePending(true); setLogTimeError('');
    try {
      const created: any = await timeEntriesApi.create({
        project_id:  detailTask.projectId,
        task_id:     taskDetailId,
        entry_date:  logTimeDate,
        hours:       parseFloat(logTimeHours),
        description: logTimeDesc || detailTask.title,
        is_billable: logTimeBillable,
        ...(logTimeStartTime ? { start_time: logTimeStartTime } : {}),
        ...(logTimeEndTime   ? { end_time:   logTimeEndTime   } : {}),
      });
      if (logTimeSendForApproval) {
        const newId = String(created?.id ?? created?.ROWID ?? '');
        if (newId) await timeEntriesApi.submit(newId);
      }
      setLogTimeHours(''); setLogTimeDesc(''); setLogTimeBillable(false);
      setLogTimeStartTime(''); setLogTimeEndTime(''); setLogTimeSendForApproval(false);
      const r: any = await timeEntriesApi.list({ task_id: taskDetailId });
      setTaskTimeEntries(Array.isArray(r) ? r : r?.data ?? []);
    } catch (e: unknown) { setLogTimeError((e as Error).message); }
    finally { setLogTimePending(false); }
  };

  const handleAddComment = async () => {
    if (!detailComment.trim() || !taskDetailId) return;
    await addComment.mutateAsync({ content: detailComment });
    setDetailComment('');
  };

  // ── Quick Log Time (from row icon) ──
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
      setLogTimeTask(null); setLogHours(''); setLogDesc('');
    } catch (e: unknown) { setLogError((e as Error).message); }
    finally { setLogPending(false); }
  };

  if (isLoading) return <Layout><PageSkeleton /></Layout>;
  if (error)     return <Layout><Alert type="error" message={(error as Error).message} className="m-6" /></Layout>;

  return (
    <Layout>
      <Header
        title="My Tasks"
        subtitle={`${allMyTasks.length} task${allMyTasks.length !== 1 ? 's' : ''} assigned to you`}
        actions={
          <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={openCreate}>
            New Task
          </Button>
        }
      />

      <div className="p-6 space-y-4">
        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-100">
          {([
            { key: 'all',         label: 'All',         count: allMyTasks.length },
            { key: 'in_progress', label: 'In Progress', count: inProgressCount   },
            { key: 'due_soon',    label: 'Due Soon',    count: dueSoonCount      },
          ] as { key: TabFilter; label: string; count: number }[]).map(({ key, label, count }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === key ? 'border-indigo-500 text-indigo-600 bg-indigo-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
              {label}
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-semibold ${activeTab === key ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>{count}</span>
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none"
              placeholder="Search my tasks…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button size="sm" variant="secondary" icon={<Filter size={13} />} onClick={() => setShowFilters((v) => !v)}>
            Filters {hasActiveFilters ? '●' : ''}
          </Button>
        </div>

        {/* Filter bar */}
        {showFilters && (
          <div className="flex flex-wrap gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <select className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="TODO">To Do</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="IN_REVIEW">In Review</option>
              <option value="DONE">Done</option>
            </select>
            <select className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none" value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
              <option value="">All Priorities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
            <select className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none" value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
              <option value="">All Projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {hasActiveFilters && (
              <button className="text-xs text-red-500 hover:text-red-700"
                onClick={() => { setFilterStatus(''); setFilterPriority(''); setFilterProject(''); setSearch(''); }}>
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

        {/* Task list */}
        {filtered.length === 0 ? (
          <EmptyState
            title="No tasks found"
            description={
              hasActiveFilters          ? 'Try adjusting your filters.'
              : activeTab === 'due_soon'    ? 'No tasks due in the next 7 days.'
              : activeTab === 'in_progress' ? 'No tasks currently in progress.'
              : 'No tasks assigned to you yet.'
            }
            icon={<CheckSquare size={32} className="text-gray-300" />}
            action={<Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={openCreate}>Create Task</Button>}
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
                  projects={projects}
                  taskHoursMap={taskHoursMap}
                  onStatusChange={handleStatusChange}
                  onLogTime={(t) => {
                    setLogTimeTask(t);
                    setLogHours('');
                    setLogDesc('');
                    setLogDate(new Date().toISOString().slice(0, 10));
                    setLogError('');
                  }}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onOpen={(t) => setTaskDetailId(t.id)}
                />
              ))}
          </div>
        )}

        {/* Pagination */}
        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Showing {(page-1)*PAGE_SIZE + 1}–{Math.min(page*PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p-1))}
                disabled={page === 1}
                className="px-2.5 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              {Array.from({ length: Math.min(5, Math.ceil(filtered.length/PAGE_SIZE)) }, (_, i) => {
                const pg = i + 1;
                return (
                  <button key={pg} onClick={() => setPage(pg)}
                    className={`px-2.5 py-1 text-xs rounded border ${pg === page ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 hover:bg-gray-50'}`}>
                    {pg}
                  </button>
                );
              })}
              <button
                onClick={() => setPage(p => Math.min(Math.ceil(filtered.length/PAGE_SIZE), p+1))}
                disabled={page >= Math.ceil(filtered.length/PAGE_SIZE)}
                className="px-2.5 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Task Create/Edit Modal ── */}
      <TaskFormModal open={taskModal} onClose={closeModal} editing={editingTask} projects={projects} />

      {/* ── Quick Log Time Modal (from row timer icon) ── */}
      <Modal open={!!logTimeTask} onClose={() => setLogTimeTask(null)} title={`Log Time — ${logTimeTask?.title ?? ''}`} size="sm">
        <div className="space-y-4">
          {logError && <Alert type="error" message={logError} />}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Hours *</label>
              <input type="number" step="0.25" min="0.25" className="form-input" placeholder="1.5"
                value={logHours} onChange={(e) => setLogHours(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Date *</label>
              <input type="date" className="form-input"
                value={logDate} onChange={(e) => setLogDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="form-label">Description</label>
            <input className="form-input" placeholder="What did you work on?"
              value={logDesc} onChange={(e) => setLogDesc(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input type="checkbox" checked={logBillable}
              onChange={(e) => setLogBillable(e.target.checked)} className="rounded" />
            Billable
          </label>
          <ModalActions>
            <Button variant="secondary" onClick={() => setLogTimeTask(null)}>Cancel</Button>
            <Button variant="primary" loading={logPending} disabled={!logHours || !logDate} onClick={handleLogTime}>
              Save Entry
            </Button>
          </ModalActions>
        </div>
      </Modal>

      {/* ── Task Detail Panel ── */}
      {taskDetailId && detailTask && (
        <TaskDetailPanel
          task={detailTask}
          onClose={() => setTaskDetailId(null)}
          allUsers={allDetailUsers}
          projects={projects}
          detailTab={detailTab}
          setDetailTab={setDetailTab}
          taskComments={taskComments as any[]}
          detailComment={detailComment}
          setDetailComment={setDetailComment}
          onAddComment={handleAddComment}
          addCommentPending={addComment.isPending}
          timerRunning={timerRunning}
          timerDisplay={timerDisplay}
          onStartTimer={handleStartTimer}
          onStopTimer={handleStopTimer}
          taskTimeEntries={taskTimeEntries}
          timeEntriesLoading={timeEntriesLoading}
          logTimeHours={logTimeHours}
          setLogTimeHours={setLogTimeHours}
          logTimeDate={logTimeDate}
          setLogTimeDate={setLogTimeDate}
          logTimeDesc={logTimeDesc}
          setLogTimeDesc={setLogTimeDesc}
          logTimeBillable={logTimeBillable}
          setLogTimeBillable={setLogTimeBillable}
          logTimeStartTime={logTimeStartTime}
          setLogTimeStartTime={setLogTimeStartTime}
          logTimeEndTime={logTimeEndTime}
          setLogTimeEndTime={setLogTimeEndTime}
          logTimePending={logTimePending}
          logTimeError={logTimeError}
          logTimeSendForApproval={logTimeSendForApproval}
          setLogTimeSendForApproval={setLogTimeSendForApproval}
          onLogTime={handleDetailLogTime}
          aiInsight={aiInsight}
          aiLoading={aiLoading}
          onEdit={openEdit}
          taskAttachments={taskAttachments}
          onUploadAttachment={async (file) => {
            if (!taskDetailId) return;
            try {
              await tasksApi.uploadAttachment(taskDetailId, file);
              const updated = await tasksApi.get(taskDetailId);
              const atts = (updated as any)?.attachments;
              if (Array.isArray(atts)) setTaskAttachments(atts);
            } catch { /* silent */ }
          }}
        />
      )}
    </Layout>
  );
}

// ── Status Group ──────────────────────────────────────────────────────────────

function StatusGroup({
  status, tasks, projects, taskHoursMap, onStatusChange, onLogTime, onEdit, onDelete, onOpen,
}: {
  status: TaskStatus; tasks: Task[]; projects: Project[];
  taskHoursMap: Record<string, number>;
  onStatusChange: (t: Task, s: string) => void;
  onLogTime:      (t: Task) => void;
  onEdit:         (t: Task) => void;
  onDelete:       (t: Task) => void;
  onOpen:         (t: Task) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const cfg = STATUS_CONFIG[status];

  return (
    <div>
      <button className="flex items-center gap-2 w-full text-left mb-2 group"
        onClick={() => setCollapsed((v) => !v)}>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded border inline-flex items-center gap-1 ${cfg.color}`}>
          {cfg.icon} {cfg.label}
        </span>
        <span className="text-xs text-gray-400 font-medium">{tasks.length}</span>
        <span className="ml-auto text-gray-400 group-hover:text-gray-600">{collapsed ? '▼' : '▲'}</span>
      </button>
      {!collapsed && (
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 w-8"></th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Title</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 hidden md:table-cell">Priority</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 hidden lg:table-cell">Project</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 hidden xl:table-cell">Due</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 hidden xl:table-cell">Pts</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 hidden xl:table-cell">Time Logged</th>
                <th className="px-3 py-2 text-xs font-semibold text-gray-500 w-28">Status</th>
                <th className="px-3 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  projects={projects}
                  hoursLogged={taskHoursMap[t.id] ?? 0}
                  onStatusChange={onStatusChange}
                  onLogTime={onLogTime}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onOpen={onOpen}
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
  task, projects, hoursLogged, onStatusChange, onLogTime, onEdit, onDelete, onOpen,
}: {
  task: Task; projects: Project[];
  hoursLogged: number;
  onStatusChange: (t: Task, s: string) => void;
  onLogTime:      (t: Task) => void;
  onEdit:         (t: Task) => void;
  onDelete:       (t: Task) => void;
  onOpen:         (t: Task) => void;
}) {
  const priCfg  = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.MEDIUM;
  const project = projects.find((p) => p.id === task.projectId);
  const isDue   = task.dueDate && isPast(new Date(task.dueDate)) && task.status !== 'DONE';

  return (
    <tr className="hover:bg-gray-50 transition-colors group">
      <td className="px-4 py-3">{TYPE_ICON[task.type] ?? TYPE_ICON.TASK}</td>

      {/* Clicking title/description opens detail panel */}
      <td className="px-4 py-3 cursor-pointer" onClick={() => onOpen(task)}>
        <div className="font-medium text-gray-900 text-sm leading-snug hover:text-indigo-700 transition-colors">
          {task.title}
        </div>
        {task.description && (
          <p className="text-xs text-gray-400 truncate max-w-xs mt-0.5">{task.description}</p>
        )}
        {(task.labels ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {(task.labels ?? []).map((l) => (
              <span key={l} className="inline-flex items-center gap-0.5 text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">
                <Tag size={9} />{l}
              </span>
            ))}
          </div>
        )}
      </td>

      <td className="px-3 py-3 hidden md:table-cell">
        <span className={`text-xs px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${priCfg.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${priCfg.dot}`} />{priCfg.label}
        </span>
      </td>

      <td className="px-3 py-3 hidden lg:table-cell text-xs text-gray-500">
        {project
          ? <span className="font-medium text-indigo-600">{project.name}</span>
          : <span className="text-gray-300">—</span>}
      </td>

      <td className="px-3 py-3 hidden xl:table-cell">
        {task.dueDate
          ? <span className={`text-xs flex items-center gap-1 ${isDue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
              <Clock size={11} />{safeFmt(task.dueDate, 'MMM d')}
            </span>
          : <span className="text-xs text-gray-300">—</span>}
      </td>

      <td className="px-3 py-3 hidden xl:table-cell text-xs text-indigo-600 font-semibold">
        {task.storyPoints ? `${task.storyPoints}` : <span className="text-gray-300">—</span>}
      </td>

      <td className="px-3 py-3 hidden xl:table-cell">
        {hoursLogged > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 font-medium">
            <Timer size={10} />
            {hoursLogged % 1 === 0 ? hoursLogged : hoursLogged.toFixed(1)}h
          </span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>

      <td className="px-3 py-3">
        <select
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
          value={task.status}
          onChange={(e) => onStatusChange(task, e.target.value)}
          onClick={(e) => e.stopPropagation()}>
          <option value="TODO">To Do</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="IN_REVIEW">In Review</option>
          <option value="DONE">Done</option>
        </select>
      </td>

      <td className="px-3 py-3">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button className="p-1 rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
            title="Log Time" onClick={(e) => { e.stopPropagation(); onLogTime(task); }}>
            <Timer size={13} />
          </button>
          <button className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"
            title="Edit" onClick={(e) => { e.stopPropagation(); onEdit(task); }}>
            <Edit2 size={13} />
          </button>
          <button className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
            title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(task); }}>
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}
