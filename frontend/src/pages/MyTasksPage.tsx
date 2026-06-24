import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CheckSquare, Clock, Filter, Search, ArrowUpRight, Circle, AlertCircle,
  CheckCircle2, Layers, Bug, Bookmark, Zap, Tag, Timer, Edit2, Plus,
  Trash2, Check, X, Paperclip, User, PlayCircle, StopCircle, MessageSquare,
  Users, BarChart2, Brain, ArrowRight, Eye, Loader2, Download, Upload, FileText, Image as ImageIcon,
  Globe, Building2,
} from 'lucide-react';
import { format, parseISO, isPast, addDays, isBefore } from 'date-fns';
import { useForm } from 'react-hook-form';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import { useI18n } from '../contexts/I18nContext';
import Button from '../components/ui/Button';
import Modal, { ModalActions } from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import Alert from '../components/ui/Alert';
import { PageSkeleton } from '../components/ui/Skeleton';
import { useAuth } from '../contexts/AuthContext';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { useMyTasks, useSearchMyTasks, useUpdateTask, useCreateTask, useDeleteTask, useTask, useTaskComments, useAddTaskComment, useUpdateTaskStatus, useTasks } from '../hooks/useTaskSprint';
import { useProjects } from '../hooks/useProjects';
import { useUsers, TenantUser } from '../hooks/useUsers';
import { timeEntriesApi, tasksApi, aiApi } from '../lib/api';
import { hasPermission, PERMISSIONS } from '../utils/permissions';
import { useQuery } from '@tanstack/react-query';
import UserAvatar from '../components/ui/UserAvatar';
import MarkdownText from '../components/ui/MarkdownText';
import RichCommentEditor, { renderRichContent } from '../components/ui/RichCommentEditor';

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
  createdBy?: string;
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
  const [search, setSearch] = useState('');
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  const filtered = search.trim()
    ? users.filter((u) =>
        (u.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (u.email ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : users;

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
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users…"
          className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-400"
        />
      </div>
      <div className="flex flex-wrap gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg max-h-36 overflow-y-auto">
        {filtered.length === 0
          ? <p className="text-xs text-gray-400">{search ? `No users match "${search}"` : 'No users available.'}</p>
          : filtered.map((u) => {
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
  files, onChange, uploadProgress,
}: {
  files: File[];
  onChange: (f: File[]) => void;
  uploadProgress?: { current: number; total: number } | null;
}) {
  const [previews, setPreviews] = React.useState<string[]>([]);
  const [dragging, setDragging] = React.useState(false);

  React.useEffect(() => {
    const urls = files.map(f => f.type.startsWith('image/') ? URL.createObjectURL(f) : '');
    setPreviews(urls);
    return () => urls.forEach(u => u && URL.revokeObjectURL(u));
  }, [files]);

  const addFiles = (incoming: FileList | File[]) => {
    onChange([...files, ...Array.from(incoming)]);
  };

  const ext = (f: File) => f.name.split('.').pop()?.toUpperCase() ?? 'FILE';

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <label
        className={`flex flex-col items-center justify-center gap-2 cursor-pointer w-full border-2 border-dashed rounded-xl px-4 py-5 transition-all ${
          dragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
      >
        <Upload size={20} className={dragging ? 'text-indigo-500' : 'text-gray-400'} />
        <div className="text-center">
          <p className="text-sm font-medium text-gray-600">Drop files here or <span className="text-indigo-600">browse</span></p>
          <p className="text-xs text-gray-400 mt-0.5">Images, PDFs, documents — any format</p>
        </div>
        <input type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files ?? []); e.target.value = ''; }} />
      </label>

      {/* Queued file cards */}
      {files.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {files.map((f, i) => {
            const isImg   = f.type.startsWith('image/');
            const preview = previews[i];
            const isUploading = uploadProgress && i < uploadProgress.current;
            const isDone      = uploadProgress && i < uploadProgress.current;

            return (
              <div key={i} className="relative flex items-center gap-2.5 bg-white border border-gray-100 rounded-xl p-2.5 shadow-sm group">
                {/* Thumbnail / icon */}
                <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-gray-100 flex items-center justify-center">
                  {isImg && preview
                    ? <img src={preview} alt={f.name} className="w-full h-full object-cover" />
                    : <span className="text-[10px] font-bold text-gray-500">{ext(f)}</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{f.name}</p>
                  <p className="text-[10px] text-gray-400">{(f.size / 1024).toFixed(1)} KB</p>
                </div>
                {/* Upload status overlay */}
                {uploadProgress ? (
                  i < uploadProgress.current
                    ? <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                    : <Loader2 size={14} className="text-indigo-400 animate-spin shrink-0" />
                ) : (
                  <button
                    type="button"
                    onClick={() => onChange(files.filter((_, j) => j !== i))}
                    className="shrink-0 p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Uploading summary bar */}
      {uploadProgress && (
        <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg">
          <Loader2 size={13} className="text-indigo-500 animate-spin shrink-0" />
          <span className="text-xs text-indigo-700 font-medium">
            Uploading {uploadProgress.current}/{uploadProgress.total} file{uploadProgress.total > 1 ? 's' : ''}…
          </span>
          <div className="flex-1 h-1 bg-indigo-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
            />
          </div>
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
  const [assignees, setAssignees]             = useState<string[]>([]);
  const [attachments, setAttachments]         = useState<File[]>([]);
  const [formError, setFormError]             = useState('');
  const [requireApproval, setRequireApproval] = useState(false);
  const [uploadProgress, setUploadProgress]   = useState<{ current: number; total: number } | null>(null);
  const { user } = useAuth();
  const canManageApproval = user?.role === 'TENANT_ADMIN' || hasPermission(user, PERMISSIONS.TIME_APPROVE);
  const canAssignToOthers = user?.role === 'TENANT_ADMIN' || hasPermission(user, PERMISSIONS.TASK_ASSIGN);
  const { data: usersData = [] } = useUsers();
  const users = usersData as TenantUser[];
  const { t } = useI18n();

  // Draft persistence — preserves create-form data across close/reopen cycles
  const draftRef    = React.useRef<{ formValues: TaskFormData; assignees: string[]; requireApproval: boolean; attachments: File[] } | null>(null);
  const prevOpenRef = React.useRef(false);

  const { register, handleSubmit, reset, getValues, formState: { errors, isSubmitting } } = useForm<TaskFormData>({
    defaultValues: { type: 'TASK', priority: 'MEDIUM', status: 'TODO' },
  });

  React.useEffect(() => {
    const justOpened = open  && !prevOpenRef.current;
    const justClosed = !open && prevOpenRef.current;

    if (justOpened) {
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
        setRequireApproval((editing as any).requireApproval === true);
        setAttachments([]);
        draftRef.current = null;
      } else if (draftRef.current) {
        reset(draftRef.current.formValues);
        setAssignees(draftRef.current.assignees);
        setRequireApproval(draftRef.current.requireApproval);
        setAttachments(draftRef.current.attachments);
      } else {
        reset({ type: 'TASK', priority: 'MEDIUM', status: 'TODO', project_id: '' });
        setAssignees(user?.id ? [String(user.id)] : []);
        setRequireApproval(false);
        setAttachments([]);
      }
      setFormError('');
    }

    if (justClosed && !editing) {
      draftRef.current = { formValues: getValues(), assignees, requireApproval, attachments };
    }

    prevOpenRef.current = open;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const onSubmit = handleSubmit(async (data) => {
    setFormError('');
    try {
      const payload = {
        project_id:       data.project_id,
        title:            data.title,
        description:      data.description,
        type:             data.type,
        priority:         data.priority,
        status:           data.status,
        due_date:         data.due_date || undefined,
        labels:           JSON.stringify(data.labels?.split(',').map((s) => s.trim()).filter(Boolean) ?? []),
        assignee_ids:     JSON.stringify(assignees),
        require_approval: requireApproval ? 'true' : 'false',
      };
      const uploadFiles = async (taskId: string) => {
        if (!attachments.length) return;
        setUploadProgress({ current: 0, total: attachments.length });
        for (let i = 0; i < attachments.length; i++) {
          await tasksApi.uploadAttachment(taskId, attachments[i]);
          setUploadProgress({ current: i + 1, total: attachments.length });
        }
        setUploadProgress(null);
      };

      if (editing) {
        await updateTask.mutateAsync({ id: editing.id, data: payload });
        await uploadFiles(editing.id);
      } else {
        const created = await createTask.mutateAsync(payload) as { ROWID?: string; id?: string };
        const newId = String(created?.ROWID ?? created?.id ?? '');
        if (newId) await uploadFiles(newId);
        draftRef.current = null;
      }
      onClose();
    } catch (e: unknown) { setUploadProgress(null); setFormError((e as Error).message); }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('tasks.modal.editTitle') : t('tasks.modal.createTitle')}
      size="2xl"
      closeOnBackdropClick={false}
      closeButtonVariant="danger"
    >
      <form onSubmit={onSubmit}>
        {formError && <div className="mb-4"><Alert type="error" message={formError} /></div>}

        {/* Two-column layout */}
        <div className="flex gap-6 overflow-y-auto max-h-[70vh]">

          {/* ── Left: main content (60%) ── */}
          <div className="flex-[3] min-w-0 space-y-5">

            <div>
              <label className="form-label text-sm font-semibold text-gray-700">{t('tasks.modal.titleLabel')} *</label>
              <input
                className="form-input text-base font-medium"
                placeholder="What needs to be done?"
                {...register('title', { required: t('validation.required') })}
              />
              {errors.title && <p className="text-xs text-red-600 mt-1">{errors.title.message}</p>}
            </div>

            <div>
              <label className="form-label">{t('tasks.modal.descLabel')}</label>
              <textarea
                className="form-textarea"
                rows={5}
                placeholder="Add more detail — steps, context, acceptance criteria…"
                {...register('description')}
              />
            </div>

            <div>
              <label className="form-label flex items-center gap-1.5">
                <User size={13} className="text-gray-400" /> Assignees
              </label>
              {canAssignToOthers ? (
                <AssigneeMultiSelect users={users} value={assignees} onChange={setAssignees} />
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500">
                  <User size={13} className="text-gray-400" />
                  <span>Assigned to you — contact your lead to reassign</span>
                </div>
              )}
            </div>

            <div>
              <label className="form-label">Labels <span className="text-gray-400 font-normal">(comma-separated)</span></label>
              <input className="form-input" placeholder="frontend, urgent, qa…" {...register('labels')} />
            </div>

            <div>
              <label className="form-label flex items-center gap-1.5">
                <Paperclip size={13} className="text-gray-400" /> Attachments
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <AttachmentPicker files={attachments} onChange={setAttachments} uploadProgress={uploadProgress} />
            </div>
          </div>

          {/* ── Right: attributes sidebar (40%) ── */}
          <div className="flex-[2] min-w-0 space-y-4">

            {/* Properties */}
            <div className="rounded-xl border border-gray-100 bg-gray-50 divide-y divide-gray-100 overflow-hidden">
              <p className="px-4 py-2.5 text-[11px] font-bold text-gray-400 uppercase tracking-widest bg-gray-100/60">
                Properties
              </p>

              <div className="px-4 py-3 space-y-3">
                <div>
                  <label className="form-label text-[11px]">Type</label>
                  <select className="form-select text-sm" {...register('type')}>
                    <option value="TASK">📋  Task</option>
                    <option value="STORY">📖  Story</option>
                    <option value="BUG">🐛  Bug</option>
                    <option value="EPIC">⚡  Epic</option>
                    <option value="SUBTASK">↳  Subtask</option>
                  </select>
                </div>

                <div>
                  <label className="form-label text-[11px]">{t('tasks.modal.priority')}</label>
                  <select className="form-select text-sm" {...register('priority')}>
                    <option value="CRITICAL">🔴  Critical</option>
                    <option value="HIGH">🟠  High</option>
                    <option value="MEDIUM">🟡  Medium</option>
                    <option value="LOW">🟢  Low</option>
                  </select>
                </div>

                <div>
                  <label className="form-label text-[11px]">{t('tasks.modal.status')}</label>
                  <select className="form-select text-sm" {...register('status')}>
                    <option value="TODO">{t('tasks.status.todo')}</option>
                    <option value="IN_PROGRESS">{t('tasks.status.inProgress')}</option>
                    <option value="IN_REVIEW">{t('tasks.status.inReview')}</option>
                    <option value="DONE">{t('tasks.status.done')}</option>
                  </select>
                </div>

                <div>
                  <label className="form-label text-[11px]">{t('tasks.modal.project')}</label>
                  <select className="form-select text-sm" {...register('project_id')}>
                    <option value="">No project</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="form-label text-[11px]">{t('tasks.modal.dueDate')} *</label>
                  <input
                    type="date"
                    className="form-input text-sm"
                    min={new Date().toISOString().split('T')[0]}
                    {...register('due_date', { required: t('validation.required') })}
                  />
                  {errors.due_date && <p className="text-xs text-red-600 mt-1">{errors.due_date.message as string}</p>}
                </div>
              </div>
            </div>

            {/* Approval toggle */}
            {canManageApproval && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
                <p className="px-4 py-2.5 text-[11px] font-bold text-amber-500 uppercase tracking-widest bg-amber-100/60">
                  Settings
                </p>
                <div className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-amber-900">Time approval</p>
                    <p className="text-xs text-amber-600 mt-0.5 leading-snug">
                      Time entries will need your sign-off
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRequireApproval((v) => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${requireApproval ? 'bg-amber-500' : 'bg-gray-300'}`}
                    role="switch"
                    aria-checked={requireApproval}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${requireApproval ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <ModalActions>
          <Button variant="secondary" type="button" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" loading={isSubmitting || createTask.isPending || updateTask.isPending}>
            {editing ? 'Save Changes' : t('tasks.modal.create')}
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
  mentionedIds, setMentionedIds,
  timerRunning, timerDisplay, onStartTimer, onStopTimer,
  taskTimeEntries, timeEntriesLoading,
  logTimeHours, setLogTimeHours,
  logTimeDate, setLogTimeDate,
  logTimeDesc, setLogTimeDesc,
  logTimeBillable, setLogTimeBillable,
  logTimeStartTime, setLogTimeStartTime,
  logTimeEndTime, setLogTimeEndTime,
  logTimePending, logTimeError, onLogTime,
  editingEntry, onStartEditEntry, onResetLogTimeForm, currentUserId,
  aiInsight, aiLoading,
  onEdit,
  canEdit,
  taskAttachments,
  onUploadAttachment,
  fullTaskData,
}: {
  task: Task;
  onClose: () => void;
  allUsers: TenantUser[];
  projects: Project[];
  detailTab: 'comments' | 'time' | 'attachments' | 'ai' | 'audit_logs';
  setDetailTab: (t: 'comments' | 'time' | 'attachments' | 'ai' | 'audit_logs') => void;
  taskAttachments: any[];
  onUploadAttachment: (file: File) => void;
  taskComments: any[];
  detailComment: string;
  setDetailComment: (v: string) => void;
  onAddComment: () => void;
  addCommentPending: boolean;
  mentionedIds: string[];
  setMentionedIds: (ids: string[]) => void;
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
  onLogTime: () => void;
  editingEntry: any | null;
  onStartEditEntry: (e: any) => void;
  onResetLogTimeForm: () => void;
  currentUserId: string;
  aiInsight: string | null;
  aiLoading: boolean;
  onEdit: (t: Task) => void;
  canEdit: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fullTaskData?: any;
}) {
  const priCfg     = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.MEDIUM;
  const stCfg      = STATUS_CONFIG[task.status];
  const project    = projects.find((p) => p.id === task.projectId);
  const assigneeIds = task.assigneeIds ?? (task.assigneeId ? [task.assigneeId] : []);

  // Attachment upload state — local to this panel
  const [attUploading, setAttUploading] = useState(false);
  const [attUploadErr, setAttUploadErr] = useState('');
  const [previewAtt, setPreviewAtt]     = useState<{ url: string; name: string } | null>(null);

  const handleAttachFile = async (file: File) => {
    setAttUploading(true);
    setAttUploadErr('');
    try {
      await onUploadAttachment(file);
    } catch (err: any) {
      setAttUploadErr(err?.message || 'Upload failed');
    } finally {
      setAttUploading(false);
    }
  };

  return (
    <>
      {/* Backdrop — no click-to-close; use the red X button to dismiss */}
      <div className="fixed inset-0 bg-black/20 z-40" />

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
              {/* Edit sits with metadata — far from the close button to prevent accidental clicks */}
              {canEdit && (
                <button onClick={() => onEdit(task)}
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                  title="Edit task">
                  <Edit2 size={11} /> Edit
                </button>
              )}
            </div>
          </div>
          {/* Close button — top-right, red to be clearly intentional */}
          <button onClick={onClose}
            className="p-1.5 rounded text-white bg-red-500 hover:bg-red-600 transition-colors shrink-0"
            title="Close">
            <X size={15} />
          </button>
        </div>

        {/* ── Meta row (assignees, points, labels) — compact ── */}
        <div className="px-6 py-1.5 border-b border-gray-100 flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <Users size={11} className="text-gray-400" />
            {assigneeIds.length === 0 ? (
              <span className="text-gray-300 italic text-[11px]">Unassigned</span>
            ) : (
              <div className="flex items-center gap-1">
                <div className="flex -space-x-1">
                  {assigneeIds.slice(0, 4).map((id) => {
                    const u = allUsers.find((x) => String(x.id) === id);
                    const label = u?.name ?? u?.email ?? id;
                    return u?.avatarUrl ? (
                      <img key={id} src={u.avatarUrl} alt={label} title={label}
                        className="w-5 h-5 rounded-full object-cover ring-1 ring-white" />
                    ) : (
                      <span key={id} title={label}
                        className="w-5 h-5 rounded-full bg-indigo-500 text-white text-[9px] font-bold flex items-center justify-center ring-1 ring-white">
                        {label[0]?.toUpperCase()}
                      </span>
                    );
                  })}
                  {assigneeIds.length > 4 && (
                    <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-600 text-[9px] font-bold flex items-center justify-center ring-1 ring-white">
                      +{assigneeIds.length - 4}
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-gray-500 ml-0.5">
                  {assigneeIds.length === 1
                    ? (allUsers.find((x) => String(x.id) === assigneeIds[0])?.name ?? 'Assigned')
                    : `${assigneeIds.length} assignees`}
                </span>
              </div>
            )}
          </div>

          {task.storyPoints != null && (
            <div className="flex items-center gap-0.5">
              <BarChart2 size={11} className="text-gray-400" />
              <span>{task.storyPoints} pts</span>
            </div>
          )}

          {(task.labels ?? []).map((l) => (
            <span key={l} className="inline-flex items-center gap-0.5 bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 text-[10px]">
              <Tag size={8} /> {l}
            </span>
          ))}
        </div>

        {/* ── Timer bar ── */}
        <div className="px-6 py-1.5 border-b border-gray-100 bg-indigo-50/50 flex items-center gap-3">
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
            { key: 'comments',    label: 'Comments',    icon: <MessageSquare size={12} />  },
            { key: 'time',        label: 'Time Log',    icon: <Timer size={12} />          },
            { key: 'attachments', label: 'Files',       icon: <Paperclip size={12} />      },
            { key: 'ai',          label: 'AI Insights', icon: <Brain size={12} />          },
            { key: 'audit_logs',  label: 'Audit Logs',  icon: <ArrowRight size={12} />     },
          ] as { key: 'comments' | 'time' | 'attachments' | 'ai' | 'audit_logs'; label: string; icon: React.ReactNode }[]).map(({ key, label, icon }) => (
            <button key={key} onClick={() => setDetailTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${detailTab === key ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {icon} {label}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Comments tab */}
          {detailTab === 'comments' && (
            <div className="p-4 space-y-3">
              {/* Add comment */}
              <div className="space-y-2">
                <RichCommentEditor
                  value={detailComment}
                  onChange={setDetailComment}
                  onMentionsChange={setMentionedIds}
                  users={allUsers.map((u) => ({ id: String(u.id), name: u.name, email: u.email, avatarUrl: u.avatarUrl }))}
                  taskMemberIds={[...assigneeIds, task.createdBy].filter((id): id is string => Boolean(id)).map(String)}
                  placeholder="Add a comment… Type @ to mention someone"
                  minHeight={80}
                  onCtrlEnter={() => { if (detailComment.replace(/<[^>]*>/g, '').trim()) onAddComment(); }}
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">⌘+Enter to post • @ to mention</span>
                  <button
                    disabled={!detailComment.replace(/<[^>]*>/g, '').trim() || addCommentPending}
                    onClick={onAddComment}
                    className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                    {addCommentPending ? 'Posting…' : 'Post'}
                  </button>
                </div>
              </div>

              {/* Comments list */}
              {taskComments.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8">No comments yet. Be the first to comment!</p>
              ) : (
                taskComments.map((c: any, i: number) => {
                  const commenter = allUsers.find((u: TenantUser) => String(u.id) === String(c.user_id));
                  const commenterName = commenter?.name ?? c.authorName ?? c.author ?? c.user ?? 'User';
                  const commenterAvatar = commenter?.avatarUrl;
                  const commentBody: string = c.content ?? c.text ?? c.body ?? '';
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
                        <span className="text-xs font-semibold text-gray-700">{commenterName}</span>
                        {c.createdAt && (
                          <span className="text-[10px] text-gray-400">{safeFmt(c.createdAt, 'MMM d, h:mm a')}</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600 leading-relaxed">
                        {renderRichContent(commentBody, allUsers)}
                      </div>
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
              <div id="detail-log-time-form" className={`rounded-xl p-4 space-y-3 border ${editingEntry ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-center justify-between">
                  <h4 className={`text-xs font-semibold uppercase tracking-wide ${editingEntry ? 'text-amber-700' : 'text-gray-700'}`}>
                    {editingEntry ? '✏️ Edit Time Entry' : 'Log Time'}
                  </h4>
                  {editingEntry && (
                    <button onClick={onResetLogTimeForm} className="text-[11px] text-amber-700 hover:text-amber-900 font-medium flex items-center gap-1">
                      <X size={11} /> Cancel Edit
                    </button>
                  )}
                </div>
                {logTimeError && <Alert type="error" message={logTimeError} />}
                {/* Start / End first — they drive the Hours field */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Start Time <span className="text-gray-400 font-normal text-[10px]">(optional)</span></label>
                    <input type="time" className="form-input"
                      value={logTimeStartTime} onChange={(e) => setLogTimeStartTime(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">End Time <span className="text-gray-400 font-normal text-[10px]">(optional)</span></label>
                    <input type="time" className="form-input"
                      value={logTimeEndTime} onChange={(e) => setLogTimeEndTime(e.target.value)} />
                  </div>
                </div>
                {/* Prominent duration banner */}
                {logTimeStartTime && logTimeEndTime && (() => {
                  const [sh, sm] = logTimeStartTime.split(':').map(Number);
                  const [eh, em] = logTimeEndTime.split(':').map(Number);
                  const diff = (eh * 60 + em) - (sh * 60 + sm);
                  if (diff <= 0) return (
                    <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg -mt-1">
                      <AlertCircle size={13} className="text-red-500 shrink-0" />
                      <span className="text-sm text-red-700 font-medium">End time must be after start time</span>
                    </div>
                  );
                  const hh = Math.floor(diff / 60);
                  const mm = diff % 60;
                  const readable = hh > 0 && mm > 0 ? `${hh}h ${mm}m` : hh > 0 ? `${hh}h` : `${mm} min`;
                  const decimal = Math.round((diff / 60) * 100) / 100;
                  return (
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg -mt-1">
                      <span className="text-sm text-blue-800">
                        Duration: <strong>{readable}</strong>
                        <span className="text-blue-400 ml-1.5 text-xs">→ Hours auto-filled as <strong className="text-blue-600">{decimalToHHMM(decimal)}</strong></span>
                      </span>
                    </div>
                  );
                })()}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">
                      Hours *
                      {logTimeStartTime && logTimeEndTime && (
                        <span className="ml-1.5 text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded uppercase">auto</span>
                      )}
                    </label>
                    <input type="text" inputMode="text" className={`form-input font-mono ${logTimeStartTime && logTimeEndTime ? 'bg-blue-50 border-blue-300 text-blue-800 font-medium' : ''}`}
                      placeholder="1:30" value={logTimeHours} onChange={(e) => setLogTimeHours(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Date *</label>
                    <input type="date" className={`form-input ${editingEntry ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`}
                      value={logTimeDate} readOnly={!!editingEntry}
                      onChange={(e) => !editingEntry && setLogTimeDate(e.target.value)} />
                    {editingEntry && <p className="text-[10px] text-amber-600 mt-0.5">Date cannot be changed when editing</p>}
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

                <div className="flex items-center justify-end gap-2">
                  {editingEntry && (
                    <Button size="sm" variant="secondary" onClick={onResetLogTimeForm}>Cancel</Button>
                  )}
                  <Button size="sm" variant={editingEntry ? 'outline' : 'primary'}
                    className={editingEntry ? '!border-amber-400 !text-amber-700 hover:!bg-amber-50' : ''}
                    loading={logTimePending} disabled={!logTimeHours} onClick={onLogTime}>
                    {editingEntry ? 'Update Entry' : 'Save Entry'}
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
                  {taskTimeEntries.map((e: any, i: number) => {
                    const entryId = String(e.ROWID ?? e.id ?? '');
                    const isOwn = String(e.user_id ?? e.userId ?? '') === currentUserId;
                    const editable = isOwn && ['DRAFT','REJECTED','SUBMITTED',undefined,null,''].includes(e.status);
                    const isBeingEdited = editingEntry && String(editingEntry.ROWID ?? editingEntry.id ?? '') === entryId;
                    return (
                    <div key={entryId || i} className={`rounded-xl px-3 py-3 shadow-sm space-y-1.5 border transition-colors ${isBeingEdited ? 'bg-amber-50 border-amber-300' : 'bg-white border-gray-100'}`}>
                      {/* Top row: user + hours + date + edit */}
                      <div className="flex items-center gap-2">
                        <UserAvatar
                          name={e.user_name || e.userName || '?'}
                          avatarUrl={e.user_avatar_url || e.userAvatarUrl}
                          size="xs"
                        />
                        <span className="text-xs font-medium text-gray-700 flex-1 truncate">
                          {e.user_name || e.userName || 'Unknown'}
                        </span>
                        <span className="text-xs font-bold text-indigo-700 shrink-0">{fmtH(e.hours)}</span>
                        <span className="text-[11px] text-gray-400 shrink-0">
                          {safeFmt(e.entry_date, 'MMM d')}
                        </span>
                        {e.is_billable && (
                          <span className="text-green-600 font-semibold shrink-0 text-xs" title="Billable">$</span>
                        )}
                        {editable && !isBeingEdited && (
                          <button
                            onClick={() => onStartEditEntry(e)}
                            className="p-1 rounded-md text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors shrink-0"
                            title="Edit this entry"
                          >
                            <Edit2 size={12} />
                          </button>
                        )}
                        {isBeingEdited && (
                          <span className="text-[10px] font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded shrink-0">editing</span>
                        )}
                      </div>
                      {/* Description + time range */}
                      <div className="flex items-center gap-2 pl-7 flex-wrap">
                        {e.description && (
                          <span className="text-[11px] text-gray-500 flex-1 truncate min-w-0">{e.description}</span>
                        )}
                        {(e.start_time || e.startTime) && (e.end_time || e.endTime) && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-md shrink-0">
                            <Clock size={8} />
                            {(e.start_time || e.startTime).slice(0, 5)} – {(e.end_time || e.endTime).slice(0, 5)}
                          </span>
                        )}
                      </div>
                    </div>
                    );
                  })}
                  <div className="text-right text-xs text-gray-500 pt-1">
                    Total: <span className="font-semibold text-gray-700">
                      {fmtH(taskTimeEntries.reduce((sum: number, e: any) => sum + (parseFloat(e.hours) || 0), 0))}
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
                  <MarkdownText text={aiInsight} className="text-sm text-gray-700" accent="indigo" />
                </div>
              ) : (
                <p className="text-xs text-gray-400 text-center py-8">No insights available.</p>
              )}
            </div>
          )}

          {/* Attachments tab */}
          {detailTab === 'attachments' && (
            <div className="p-6 space-y-4">
              {/* Image preview lightbox */}
              {previewAtt && (
                <div
                  className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4"
                  onClick={() => setPreviewAtt(null)}
                >
                  <div className="relative max-w-4xl max-h-[90vh] w-full" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setPreviewAtt(null)}
                      className="absolute -top-3 -right-3 z-10 w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg"
                    >
                      <X size={14} />
                    </button>
                    <img
                      src={previewAtt.url}
                      alt={previewAtt.name}
                      className="w-full h-full object-contain rounded-xl shadow-2xl max-h-[85vh]"
                    />
                    <p className="text-center text-white/70 text-xs mt-2 truncate">{previewAtt.name}</p>
                  </div>
                </div>
              )}

              {/* Upload button */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">{taskAttachments.length} file{taskAttachments.length !== 1 ? 's' : ''}</p>
                <label className={`flex items-center gap-2 cursor-pointer px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  attUploading
                    ? 'bg-indigo-100 text-indigo-400 cursor-wait'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}>
                  {attUploading
                    ? <><Loader2 size={13} className="animate-spin" /> Uploading…</>
                    : <><Upload size={13} /> Attach File</>
                  }
                  <input
                    type="file"
                    className="hidden"
                    disabled={attUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) { handleAttachFile(file); e.target.value = ''; }
                    }}
                  />
                </label>
              </div>

              {attUploadErr && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  <AlertCircle size={13} className="shrink-0" /> {attUploadErr}
                </div>
              )}

              {/* File list */}
              {taskAttachments.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                    <Paperclip size={24} className="text-gray-300" />
                  </div>
                  <p className="text-sm font-medium text-gray-400">No attachments yet</p>
                  <p className="text-xs text-gray-300 mt-1">Upload files using the button above</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {taskAttachments.map((a: any, i: number) => {
                    const name    = a.file_name ?? a.fileName ?? a.name ?? `File ${i + 1}`;
                    const url     = a.file_url  ?? a.fileUrl  ?? a.url  ?? null;
                    const size    = a.file_size ?? a.fileSize ?? null;
                    const ext     = name.split('.').pop()?.toLowerCase() ?? '';
                    const isImage = ['png','jpg','jpeg','gif','webp','svg'].includes(ext);
                    const isDoc   = ['pdf','doc','docx','xls','xlsx','csv','txt'].includes(ext);

                    return (
                      <div key={a.ROWID ?? i} className="group flex items-center gap-3 border border-gray-100 rounded-xl bg-white hover:border-indigo-200 hover:bg-indigo-50/30 transition-all p-3">
                        {/* Thumbnail / icon */}
                        <div
                          className={`w-12 h-12 rounded-xl overflow-hidden shrink-0 flex items-center justify-center ${isImage ? 'cursor-pointer' : 'bg-gray-100'}`}
                          onClick={() => isImage && url && setPreviewAtt({ url, name })}
                        >
                          {isImage && url ? (
                            <img src={url} alt={name} className="w-full h-full object-cover" />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center ${isDoc ? 'bg-blue-50' : 'bg-gray-100'}`}>
                              {isDoc
                                ? <FileText size={20} className="text-blue-400" />
                                : <Paperclip size={20} className="text-gray-400" />
                              }
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {size && <span className="text-[11px] text-gray-400">{(size / 1024).toFixed(1)} KB</span>}
                            <span className="text-[11px] text-gray-300 font-mono uppercase">{ext}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          {isImage && url && (
                            <button
                              onClick={() => setPreviewAtt({ url, name })}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                              title="Preview"
                            >
                              <Eye size={14} />
                            </button>
                          )}
                          {url && (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                              title="Download"
                            >
                              <Download size={14} />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Audit Logs tab */}
          {detailTab === 'audit_logs' && (
            <div className="p-6">
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {((fullTaskData ?? task as any)?.history ?? []).length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    <ArrowRight size={20} className="mx-auto mb-2 opacity-30" />
                    <p className="text-xs">No status changes yet.</p>
                  </div>
                ) : (
                  ((fullTaskData ?? task as any)?.history ?? []).map((h: any, i: number) => (
                    <div key={`h-${h.ROWID ?? i}`} className="flex items-center gap-2 text-xs py-1.5 px-3 bg-gray-50 border border-gray-100 rounded-lg">
                      <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                        <ArrowRight size={9} className="text-amber-600" />
                      </div>
                      <span className="text-gray-500">Status:</span>
                      <span className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-500 text-[11px] font-medium">{h.from_status || '—'}</span>
                      <ArrowRight size={9} className="text-gray-400 shrink-0" />
                      <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[11px] font-semibold">{h.to_status}</span>
                      <span className="ml-auto text-[10px] text-gray-400 shrink-0">{h.CREATEDTIME ? safeFmt(h.CREATEDTIME, 'MMM d, h:mm a') : ''}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MyTasksPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const canCreateTask = user?.role === 'TENANT_ADMIN' || hasPermission(user, PERMISSIONS.TASK_WRITE);
  const canViewOrgTasks = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN' || hasPermission(user, PERMISSIONS.PROJECT_DATA_VIEW_ALL);
  const canEditTask = (task: Task) => {
    if (!user) return false;
    if (user.role === 'TENANT_ADMIN' || user.role === 'SUPER_ADMIN') return true;
    return task.createdBy != null && String(task.createdBy) === String(user.id);
  };

  const [viewMode, setViewMode] = useState<'mine' | 'org'>('mine');
  const [orgFilterStatus, setOrgFilterStatus]   = useState('');
  const [orgFilterProject, setOrgFilterProject] = useState('');
  const [orgFilterAssignee, setOrgFilterAssignee] = useState('');
  const [orgSearch, setOrgSearch]               = useState('');

  const { data: rawTasks, isLoading, error } = useMyTasks();
  const { data: rawProjects } = useProjects();
  const updateTaskStatus = useUpdateTaskStatus(); // status-only path — allowed for non-creators
  const deleteTask = useDeleteTask();

  const projects: Project[] = useMemo(() => {
    const arr = Array.isArray(rawProjects) ? rawProjects : [];
    return arr as Project[];
  }, [rawProjects]);

  const allMyTasks: Task[] = useMemo(() => {
    const arr = Array.isArray(rawTasks) ? rawTasks : (rawTasks as any)?.data ?? [];
    return arr as Task[];
  }, [rawTasks]);

  // ── Org Tasks (PROJECT_DATA_VIEW_ALL) ──
  const { data: rawOrgTasks, isLoading: orgLoading } = useTasks({}, viewMode === 'org' && canViewOrgTasks);
  const allOrgTasks: Task[] = useMemo(() => {
    const arr = Array.isArray(rawOrgTasks) ? rawOrgTasks : (rawOrgTasks as any)?.data ?? [];
    return arr as Task[];
  }, [rawOrgTasks]);
  const filteredOrgTasks = useMemo(() => {
    const q = orgSearch.trim().toLowerCase();
    return allOrgTasks.filter((t) => {
      if (orgFilterStatus  && t.status    !== orgFilterStatus)  return false;
      if (orgFilterProject && t.projectId !== orgFilterProject) return false;
      if (orgFilterAssignee) {
        try {
          const ids = (t as any).assigneeIds ?? JSON.parse((t as any).assignee_ids || '[]');
          if (!ids.map(String).includes(orgFilterAssignee)) return false;
        } catch { return false; }
      }
      if (q && !t.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allOrgTasks, orgFilterStatus, orgFilterProject, orgFilterAssignee, orgSearch]);

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

  // Debounced server-side text search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);
  const isSearchMode = debouncedSearch.length >= 2;
  const { data: rawSearchTasks, isLoading: searchLoading } = useSearchMyTasks(debouncedSearch);

  const now            = new Date();
  const dueSoonCutoff  = addDays(now, 7);

  // When search mode is active, use Catalyst Search results as the base list
  const baseTaskList: Task[] = useMemo(() => {
    if (isSearchMode) {
      const arr = Array.isArray(rawSearchTasks) ? rawSearchTasks : (rawSearchTasks as any)?.data ?? [];
      return arr as Task[];
    }
    return allMyTasks;
  }, [isSearchMode, rawSearchTasks, allMyTasks]);

  const tabFiltered = useMemo(() => {
    if (activeTab === 'in_progress') return baseTaskList.filter((t) => t.status === 'IN_PROGRESS');
    if (activeTab === 'due_soon') return baseTaskList.filter((t) => {
      if (!t.dueDate || t.status === 'DONE') return false;
      return isBefore(parseISO(t.dueDate), dueSoonCutoff);
    });
    return baseTaskList;
  }, [baseTaskList, activeTab, dueSoonCutoff]);

  const filtered = useMemo(() => tabFiltered.filter((t) => {
    // Text search is now server-side — only apply dropdown filters here
    if (filterStatus   && t.status    !== filterStatus)   return false;
    if (filterPriority && t.priority  !== filterPriority) return false;
    if (filterProject  && t.projectId !== filterProject)  return false;
    return true;
  }), [tabFiltered, filterStatus, filterPriority, filterProject]);

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
  // Use the dedicated status endpoint (PATCH /tasks/:id/status) so that
  // assignees (non-creators) can mark a task as DONE / IN_PROGRESS without
  // being blocked by the creator-only `update` permission check.
  const handleStatusChange = (t: Task, status: string) =>
    updateTaskStatus.mutate({ id: t.id, data: { status } });

  // ── Delete ──
  const handleDelete = async (t: Task) => {
    const ok = await confirm({ title: 'Delete Task', message: `"${t.title}" will be permanently deleted.`, confirmText: 'Delete', variant: 'danger' });
    if (!ok) return;
    deleteTask.mutate(t.id);
  };

  // ── Task Detail ──
  const [taskDetailId, setTaskDetailId]           = useState<string | null>(null);

  // Deep-link support: if the URL is /my-tasks?taskId=XYZ (e.g. user clicked
  // a notification for an assigned task), auto-open that task's detail panel.
  // The query param is cleared after opening so a refresh doesn't re-open it
  // when the user has manually navigated away inside the page.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const t = searchParams.get('taskId');
    if (t) {
      setTaskDetailId(t);
      // Strip ?taskId from the URL so back/refresh behaves naturally
      const next = new URLSearchParams(searchParams);
      next.delete('taskId');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [detailTab, setDetailTab]                 = useState<'comments' | 'time' | 'attachments' | 'ai' | 'audit_logs'>('comments');
  const [taskTimeEntries, setTaskTimeEntries]     = useState<any[]>([]);
  const [timeEntriesLoading, setTimeEntriesLoading] = useState(false);
  const [timerRunning, setTimerRunning]           = useState(false);
  const [timerStart, setTimerStart]               = useState<number | null>(null);
  const [timerDisplay, setTimerDisplay]           = useState('00:00:00');
  const [aiInsight, setAiInsight]                 = useState<string | null>(null);
  const [aiLoading, setAiLoading]                 = useState(false);
  const [detailComment, setDetailComment]         = useState('');
  const [mentionedIds, setMentionedIds]           = useState<string[]>([]);
  const [logTimeHours, setLogTimeHours]           = useState('');
  const [logTimeDate, setLogTimeDate]             = useState(new Date().toISOString().slice(0, 10));
  const [logTimeDesc, setLogTimeDesc]             = useState('');
  const [logTimeBillable, setLogTimeBillable]     = useState(false);
  const [logTimeStartTime, setLogTimeStartTime]   = useState('');
  const [editingEntry, setEditingEntry]           = useState<any | null>(null);
  const [logTimeEndTime, setLogTimeEndTime]       = useState('');
  const [logTimePending, setLogTimePending]       = useState(false);
  const [logTimeError, setLogTimeError]           = useState('');

  // Auto-calculate hours when start/end time changes — output in HH:MM format
  useEffect(() => {
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

  const { data: fullTask }              = useTask(taskDetailId ?? '');
  const { data: taskComments = [] }     = useTaskComments(taskDetailId ?? '');
  const addComment                      = useAddTaskComment(taskDetailId ?? '');
  // updateTaskStatus already declared above at the top of this component.
  const { data: detailUsers = [] }      = useUsers();
  const allDetailUsers                  = detailUsers as TenantUser[];
  const [taskAttachments, setTaskAttachments] = useState<any[]>([]);

  const detailTask: Task | null = useMemo(() => {
    if (!taskDetailId) return null;
    const fromList = allMyTasks.find((t) => t.id === taskDetailId) ?? allOrgTasks.find((t) => t.id === taskDetailId);
    if (fromList) return fromList;
    if (fullTask && (fullTask as any).id) return fullTask as unknown as Task;
    return null;
  }, [taskDetailId, allMyTasks, allOrgTasks, fullTask]);

  // Restore timer from localStorage when opening a task
  useEffect(() => {
    if (!taskDetailId) return;
    const stored = localStorage.getItem(`ds_timer_${taskDetailId}`);
    if (stored) {
      const start = parseInt(stored, 10);
      setTimerStart(start);
      setTimerRunning(true);
      const d = new Date(start);
      setLogTimeStartTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    } else {
      setTimerRunning(false);
      setTimerStart(null);
      setTimerDisplay('00:00:00');
      setLogTimeStartTime('');
      setLogTimeEndTime('');
    }
    setDetailTab('comments');
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

  const fmtHHMM = (ts: number) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const handleStartTimer = () => {
    const ts = Date.now();
    localStorage.setItem(`ds_timer_${taskDetailId}`, String(ts));
    setTimerStart(ts);
    setTimerRunning(true);
    setLogTimeStartTime(fmtHHMM(ts));
    setLogTimeEndTime('');
  };

  const handleStopTimer = () => {
    if (!timerStart) return;
    const endTs = Date.now();
    const elapsed = (endTs - timerStart) / 3600000;
    localStorage.removeItem(`ds_timer_${taskDetailId}`);
    setTimerRunning(false); setTimerStart(null); setTimerDisplay('00:00:00');
    setLogTimeHours(Math.max(0.01, Math.round(elapsed * 100) / 100).toFixed(2));
    setLogTimeEndTime(fmtHHMM(endTs));
    setDetailTab('time');
  };

  const resetLogTimeForm = () => {
    setLogTimeHours(''); setLogTimeDesc(''); setLogTimeBillable(false);
    setLogTimeStartTime(''); setLogTimeEndTime('');
    setLogTimeDate(new Date().toISOString().slice(0, 10));
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
    setLogTimeDate(raw ? raw.split('T')[0].split(' ')[0] : new Date().toISOString().slice(0, 10));
    setLogTimeError('');
    // Scroll form into view
    document.getElementById('detail-log-time-form')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const handleDetailLogTime = async () => {
    if (!taskDetailId || !logTimeHours || !detailTask) return;
    if (logTimeStartTime && logTimeEndTime) {
      const [sh, sm] = logTimeStartTime.split(':').map(Number);
      const [eh, em] = logTimeEndTime.split(':').map(Number);
      if ((eh * 60 + em) - (sh * 60 + sm) <= 0) {
        setLogTimeError('End time must be after start time');
        return;
      }
    }
    setLogTimePending(true); setLogTimeError('');
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
          project_id:       detailTask.projectId,
          task_id:          taskDetailId,
          entry_date:       logTimeDate,
          hours:            parseHoursInput(logTimeHours),
          description:      logTimeDesc || detailTask.title,
          is_billable:      logTimeBillable,
          require_approval: (detailTask as any).requireApproval === true ? 'true' : 'false',
          ...(logTimeStartTime ? { start_time: logTimeStartTime } : {}),
          ...(logTimeEndTime   ? { end_time:   logTimeEndTime   } : {}),
        });
      }
      resetLogTimeForm();
      const r: any = await timeEntriesApi.list({ task_id: taskDetailId });
      setTaskTimeEntries(Array.isArray(r) ? r : r?.data ?? []);
    } catch (e: unknown) { setLogTimeError((e as Error).message); }
    finally { setLogTimePending(false); }
  };

  const handleAddComment = async () => {
    if (!detailComment.trim() || !taskDetailId) return;
    await addComment.mutateAsync({ content: detailComment, mentionedUserIds: mentionedIds });
    setDetailComment('');
    setMentionedIds([]);
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
        project_id:       logTimeTask.projectId,
        task_id:          logTimeTask.id,
        entry_date:       logDate,
        hours:            parseHoursInput(logHours),
        description:      logDesc || logTimeTask.title,
        is_billable:      logBillable,
        require_approval: (logTimeTask as any).requireApproval === true ? 'true' : 'false',
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
        title={viewMode === 'org' ? 'All Org Tasks' : t('nav.myTasks')}
        subtitle={viewMode === 'org'
          ? `${allOrgTasks.length} task${allOrgTasks.length !== 1 ? 's' : ''} across the organisation`
          : `${allMyTasks.length} task${allMyTasks.length !== 1 ? 's' : ''} assigned to you`}
        actions={
          <div className="flex items-center gap-2">
            {canViewOrgTasks && (
              <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                <button onClick={() => setViewMode('mine')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === 'mine' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                  My Tasks
                </button>
                <button onClick={() => setViewMode('org')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${viewMode === 'org' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                  <Globe size={11} /> Org Tasks
                </button>
              </div>
            )}
            {canCreateTask && (
              <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={openCreate}>
                {t('tasks.new')}
              </Button>
            )}
          </div>
        }
      />

      <div className="p-6 space-y-4">
        {/* Org Tasks view */}
        {viewMode === 'org' && canViewOrgTasks && (
          <OrgTasksView
            tasks={filteredOrgTasks}
            allTasks={allOrgTasks}
            projects={projects}
            users={allDetailUsers}
            loading={orgLoading}
            filterStatus={orgFilterStatus}
            setFilterStatus={setOrgFilterStatus}
            filterProject={orgFilterProject}
            setFilterProject={setOrgFilterProject}
            filterAssignee={orgFilterAssignee}
            setFilterAssignee={setOrgFilterAssignee}
            search={orgSearch}
            setSearch={setOrgSearch}
            onOpen={(t) => setTaskDetailId(t.id)}
            onStatusChange={handleStatusChange}
          />
        )}

        {/* My Tasks view */}
        {viewMode === 'mine' && (
        <>
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
            {searchLoading && isSearchMode
              ? <svg className="absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-indigo-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              : <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            }
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
              <option value="TODO">{t('tasks.status.todo')}</option>
              <option value="IN_PROGRESS">{t('tasks.status.inProgress')}</option>
              <option value="IN_REVIEW">{t('tasks.status.inReview')}</option>
              <option value="DONE">{t('tasks.status.done')}</option>
            </select>
            <select className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none" value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
              <option value="">All Priorities</option>
              <option value="CRITICAL">{t('tasks.priority.critical')}</option>
              <option value="HIGH">{t('tasks.priority.high')}</option>
              <option value="MEDIUM">{t('tasks.priority.medium')}</option>
              <option value="LOW">{t('tasks.priority.low')}</option>
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
            title={t('tasks.noTasks')}
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
                  canEditTask={canEditTask}
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
                {t('common.previous')}
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
                {t('common.next')}
              </button>
            </div>
          </div>
        )}
        </>
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
              <input type="number" step="0.01" min="0.01" className="form-input" placeholder="1.5"
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
          mentionedIds={mentionedIds}
          setMentionedIds={setMentionedIds}
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
          onLogTime={handleDetailLogTime}
          editingEntry={editingEntry}
          onStartEditEntry={startEditEntry}
          onResetLogTimeForm={resetLogTimeForm}
          currentUserId={String((user as any)?.id ?? '')}
          aiInsight={aiInsight}
          aiLoading={aiLoading}
          onEdit={openEdit}
          canEdit={canEditTask(detailTask)}
          fullTaskData={fullTask}
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

// ── Org Tasks View ────────────────────────────────────────────────────────────

function OrgTasksView({
  tasks, allTasks, projects, users, loading,
  filterStatus, setFilterStatus,
  filterProject, setFilterProject,
  filterAssignee, setFilterAssignee,
  search, setSearch,
  onOpen, onStatusChange,
}: {
  tasks: Task[]; allTasks: Task[]; projects: Project[]; users: TenantUser[]; loading: boolean;
  filterStatus: string; setFilterStatus: (v: string) => void;
  filterProject: string; setFilterProject: (v: string) => void;
  filterAssignee: string; setFilterAssignee: (v: string) => void;
  search: string; setSearch: (v: string) => void;
  onOpen: (t: Task) => void;
  onStatusChange: (t: Task, s: string) => void;
}) {
  const [orgPage, setOrgPage] = useState(1);
  const PAGE = 25;
  const paginated = tasks.slice((orgPage - 1) * PAGE, orgPage * PAGE);
  const totalPages = Math.ceil(tasks.length / PAGE);

  const statusCount = (s: string) => allTasks.filter((t) => t.status === s).length;

  const getProject = (id: string) => projects.find((p) => p.id === id);
  const getUser    = (id: string) => users.find((u) => String((u as any).id ?? (u as any).ROWID) === String(id));

  const hasFilters = !!(filterStatus || filterProject || filterAssignee || search);

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
      <Loader2 size={18} className="animate-spin" />
      <span className="text-sm">Loading org tasks…</span>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 items-center">
        {(['TODO','IN_PROGRESS','IN_REVIEW','DONE'] as const).map((s) => {
          const cfg = STATUS_CONFIG[s];
          return (
            <button key={s} onClick={() => setFilterStatus(filterStatus === s ? '' : s)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                filterStatus === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
              }`}>
              {cfg.icon}
              {cfg.label}
              <span className="ml-0.5 font-bold">{statusCount(s)}</span>
            </button>
          );
        })}
        <span className="ml-auto text-xs text-gray-400">{allTasks.length} total</span>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none"
            placeholder="Search org tasks…" value={search} onChange={(e) => { setSearch(e.target.value); setOrgPage(1); }} />
        </div>
        <select className="text-sm border border-gray-200 rounded-lg px-2 py-2 outline-none min-w-32"
          value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setOrgPage(1); }}>
          <option value="">All Statuses</option>
          <option value="TODO">To Do</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="IN_REVIEW">In Review</option>
          <option value="DONE">Done</option>
        </select>
        <select className="text-sm border border-gray-200 rounded-lg px-2 py-2 outline-none min-w-40"
          value={filterProject} onChange={(e) => { setFilterProject(e.target.value); setOrgPage(1); }}>
          <option value="">All Projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="text-sm border border-gray-200 rounded-lg px-2 py-2 outline-none min-w-40"
          value={filterAssignee} onChange={(e) => { setFilterAssignee(e.target.value); setOrgPage(1); }}>
          <option value="">All Assignees</option>
          {users.map((u) => {
            const uid = String((u as any).id ?? (u as any).ROWID ?? '');
            return <option key={uid} value={uid}>{(u as any).name ?? (u as any).email}</option>;
          })}
        </select>
        {hasFilters && (
          <button onClick={() => { setFilterStatus(''); setFilterProject(''); setFilterAssignee(''); setSearch(''); setOrgPage(1); }}
            className="text-xs text-red-500 hover:text-red-700 font-medium">
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      {paginated.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Building2 size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">{hasFilters ? 'No tasks match these filters.' : 'No tasks in the organisation yet.'}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {/* Header row */}
          <div className="grid text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-2.5 bg-gray-50 border-b border-gray-100"
            style={{ gridTemplateColumns: '2fr 100px 90px 80px 160px 80px 110px' }}>
            <span>Title</span>
            <span>Status</span>
            <span>Priority</span>
            <span>Type</span>
            <span>Project</span>
            <span>Assignees</span>
            <span>Due Date</span>
          </div>
          {paginated.map((task, i) => {
            const proj = getProject(task.projectId ?? '');
            const STATUS_CFG: Record<string, { label: string; cls: string }> = {
              TODO:        { label: 'To Do',       cls: 'bg-gray-100 text-gray-600' },
              IN_PROGRESS: { label: 'In Progress', cls: 'bg-blue-100 text-blue-700' },
              IN_REVIEW:   { label: 'In Review',   cls: 'bg-amber-100 text-amber-700' },
              DONE:        { label: 'Done',         cls: 'bg-green-100 text-green-700' },
            };
            const PRIO_CFG: Record<string, string> = {
              CRITICAL: 'text-red-600 font-bold',
              HIGH:     'text-orange-500 font-semibold',
              MEDIUM:   'text-yellow-600',
              LOW:      'text-gray-400',
            };
            const TYPE_ICONS: Record<string, React.ReactNode> = {
              BUG:   <Bug size={12} className="text-red-500" />,
              STORY: <Bookmark size={12} className="text-violet-500" />,
              EPIC:  <Zap size={12} className="text-amber-500" />,
              TASK:  <CheckSquare size={12} className="text-indigo-500" />,
            };
            let assigneeIds: string[] = [];
            try { assigneeIds = JSON.parse((task as any).assignee_ids || '[]').map(String); } catch { /* */ }
            const sCfg = STATUS_CFG[task.status] ?? STATUS_CFG.TODO;
            return (
              <div key={task.id}
                onClick={() => onOpen(task)}
                className={`grid items-center px-4 py-3 cursor-pointer hover:bg-indigo-50/40 transition-colors ${i > 0 ? 'border-t border-gray-100' : ''}`}
                style={{ gridTemplateColumns: '2fr 100px 90px 80px 160px 80px 110px' }}>
                <div className="flex items-center gap-2 min-w-0 pr-3">
                  {TYPE_ICONS[task.type] ?? <CheckSquare size={12} className="text-gray-400" />}
                  <span className="text-sm text-gray-800 font-medium truncate">{task.title}</span>
                </div>
                <div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${sCfg.cls}`}>{sCfg.label}</span>
                </div>
                <div className={`text-xs ${PRIO_CFG[task.priority ?? ''] ?? 'text-gray-400'}`}>
                  {task.priority ?? '—'}
                </div>
                <div className="text-xs text-gray-500">{task.type}</div>
                <div className="text-xs text-gray-600 truncate">{proj?.name ?? '—'}</div>
                <div className="flex -space-x-1">
                  {assigneeIds.slice(0, 3).map((id) => {
                    const u = getUser(id);
                    return <UserAvatar key={id} name={(u as any)?.name ?? (u as any)?.email ?? ''} avatarUrl={(u as any)?.avatarUrl} size="xs" />;
                  })}
                  {assigneeIds.length > 3 && (
                    <span className="w-5 h-5 rounded-full bg-gray-200 text-[9px] text-gray-500 flex items-center justify-center font-semibold">
                      +{assigneeIds.length - 3}
                    </span>
                  )}
                  {assigneeIds.length === 0 && <span className="text-xs text-gray-300">—</span>}
                </div>
                <div className="text-xs text-gray-500">
                  {task.dueDate ? safeFmt(task.dueDate, 'MMM d, yyyy') : '—'}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
          <span>Showing {(orgPage - 1) * PAGE + 1}–{Math.min(orgPage * PAGE, tasks.length)} of {tasks.length}</span>
          <div className="flex gap-1">
            <button onClick={() => setOrgPage((p) => Math.max(1, p - 1))} disabled={orgPage === 1}
              className="px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40">Prev</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map((pg) => (
              <button key={pg} onClick={() => setOrgPage(pg)}
                className={`px-2.5 py-1 rounded border ${pg === orgPage ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 hover:bg-gray-50'}`}>
                {pg}
              </button>
            ))}
            <button onClick={() => setOrgPage((p) => Math.min(totalPages, p + 1))} disabled={orgPage >= totalPages}
              className="px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Status Group ──────────────────────────────────────────────────────────────

function StatusGroup({
  status, tasks, projects, taskHoursMap, onStatusChange, onLogTime, onEdit, onDelete, onOpen, canEditTask,
}: {
  status: TaskStatus; tasks: Task[]; projects: Project[];
  taskHoursMap: Record<string, number>;
  onStatusChange: (t: Task, s: string) => void;
  onLogTime:      (t: Task) => void;
  onEdit:         (t: Task) => void;
  onDelete:       (t: Task) => void;
  onOpen:         (t: Task) => void;
  canEditTask:    (t: Task) => boolean;
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
                  canEdit={canEditTask(t)}
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
  task, projects, hoursLogged, onStatusChange, onLogTime, onEdit, onDelete, onOpen, canEdit,
}: {
  task: Task; projects: Project[];
  hoursLogged: number;
  onStatusChange: (t: Task, s: string) => void;
  onLogTime:      (t: Task) => void;
  onEdit:         (t: Task) => void;
  onDelete:       (t: Task) => void;
  onOpen:         (t: Task) => void;
  canEdit:        boolean;
}) {
  const { t } = useI18n();
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
            {fmtH(hoursLogged)}
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
          <option value="TODO">{t('tasks.status.todo')}</option>
          <option value="IN_PROGRESS">{t('tasks.status.inProgress')}</option>
          <option value="IN_REVIEW">{t('tasks.status.inReview')}</option>
          <option value="DONE">{t('tasks.status.done')}</option>
        </select>
      </td>

      <td className="px-3 py-3">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button className="p-1 rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
            title="Log Time" onClick={(e) => { e.stopPropagation(); onLogTime(task); }}>
            <Timer size={13} />
          </button>
          {canEdit && (
            <button className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"
              title="Edit" onClick={(e) => { e.stopPropagation(); onEdit(task); }}>
              <Edit2 size={13} />
            </button>
          )}
          {canEdit && (
            <button className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
              title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(task); }}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
