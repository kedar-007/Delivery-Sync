import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  Clock, Plus, Edit2, Trash2, Send, RotateCcw, CheckCircle2,
  XCircle, DollarSign, CalendarDays, TrendingUp, Users, AlertCircle, Loader2, X, Hash,
  ChevronLeft, ChevronRight, Globe, User as UserIcon, Award,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, AreaChart, Area, CartesianGrid,
} from 'recharts';
import { format, startOfWeek, endOfWeek, subDays, addDays, startOfMonth, endOfMonth, eachDayOfInterval, parseISO, isValid } from 'date-fns';
import { useForm, useWatch } from 'react-hook-form';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import { useI18n } from '../contexts/I18nContext';
import Button from '../components/ui/Button';
import Card, { StatCard } from '../components/ui/Card';
import Modal, { ModalActions } from '../components/ui/Modal';
import Alert from '../components/ui/Alert';
import { useConfirm } from '../components/ui/ConfirmDialog';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { PageSkeleton, SkeletonTable } from '../components/ui/Skeleton';
import UserAvatar from '../components/ui/UserAvatar';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission, PERMISSIONS } from '../utils/permissions';
import {
  useTimeEntries, useMyWeek,
  useCreateTimeEntry, useUpdateTimeEntry, useDeleteTimeEntry,
  useSubmitTimeEntry, useRetractTimeEntry,
  useTimeApprovals, useApproveTime, useRejectTime,
  useTeamMemberEntries, useOrgAnalytics, useAllTimeEntries,
} from '../hooks/useTimeTracking';
import { useProjects } from '../hooks/useProjects';
import { useTasks } from '../hooks/useTaskSprint';
import { useTeamPeers, useTeams } from '../hooks/useTeams';
import { timeEntriesApi } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { WeeklyTimesheetTab } from './WeeklyTimesheetTab';

// ── Types ─────────────────────────────────────────────────────────────────────

type TimeEntryStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

interface TimeEntry {
  id: string;
  projectId: string;
  projectName?: string;
  taskId?: string | null;
  taskName?: string;
  description: string;
  date: string;
  hours: number;
  startTime?: string;
  endTime?: string;
  isBillable: boolean;
  status: TimeEntryStatus;
  notes?: string;
  submittedBy?: string;
  submittedByName?: string;
  submittedAt?: string;
  createdAt?: string;
  userName?: string;
  userAvatarUrl?: string;
}

interface WeekDay {
  date: string;
  label: string;
  hours: number;
  entries: Array<{ projectName: string; hours: number }>;
}

interface WeekSummary {
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  daysLogged: number;
  days: WeekDay[];
  entries: TimeEntry[];
  weekStart: string;
  weekEnd: string;
}

interface TimeApproval {
  id: string;
  timeEntryId: string;
  projectId: string;
  projectName?: string;
  taskName?: string;
  sprintName?: string;
  description: string;
  date: string;
  hours: number;
  isBillable: boolean;
  submittedByName?: string;
  submittedByAvatarUrl?: string;
  submittedById?: string;
}

interface TimeEntryFormData {
  project_id: string;
  task_id?: string;
  description: string;
  date: string;
  hours: string;
  start_time?: string;
  end_time?: string;
  is_billable: boolean;
  notes?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────


const statusVariant = (status: TimeEntryStatus) => {
  const map: Record<TimeEntryStatus, 'gray' | 'warning' | 'success' | 'danger'> = {
    DRAFT:     'gray',
    SUBMITTED: 'warning',
    APPROVED:  'success',
    REJECTED:  'danger',
  };
  return map[status] ?? 'gray';
};

const statusLabel = (status: TimeEntryStatus) => {
  const map: Record<TimeEntryStatus, string> = {
    DRAFT:     'Saved',
    SUBMITTED: 'Approval Pending',
    APPROVED:  'Approved',
    REJECTED:  'Rejected',
  };
  return map[status] ?? status;
};

const todayStr = () => format(new Date(), 'yyyy-MM-dd');

// Parse "1:30" or "1.5" → decimal hours. "1:30" = 1.5h, "0:06" = 0.1h
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

// Decimal hours → "H:MM" display: 1.5 → "1:30", 0.1 → "0:06", 2 → "2:00"
const decimalToHHMM = (h: number): string => {
  const hrs  = Math.floor(h);
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

// Decimal hours → zero-padded "HH:MM" (e.g. 9.25 → "09:15"). Used for the
// day-wise Daily Activity Summary totals in the My Logs list view.
const fmtHM = (h: number | string): string => {
  const v = typeof h === 'string' ? parseFloat(h) : h;
  const totalMin = Math.round((Number(v) || 0) * 60);
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

// Time-of-day "HH:MM[:SS]" → minutes since midnight (null if unparseable).
// Used for the time-of-day filter and per-day gap (untracked window) detection.
const timeToMin = (t?: string | null): number | null => {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t));
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};
// Minutes since midnight → "HH:MM".
const minToTime = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const safeFormat = (dateStr: string, fmt: string) => {
  try {
    // Catalyst CREATEDTIME/MODIFIEDTIME: "2026-06-23 11:51:15:839"
    // Normalise to ISO by replacing the space with T and the last colon (before ms) with a dot
    const normalised = dateStr
      .replace(' ', 'T')
      .replace(/(\d{2}):(\d{3})$/, '$1.$2');
    const d = parseISO(normalised);
    return isValid(d) ? format(d, fmt) : dateStr;
  } catch {
    return dateStr;
  }
};

// ── Log Time Modal ────────────────────────────────────────────────────────────

interface LogTimeModalProps {
  open: boolean;
  onClose: () => void;
  entry?: TimeEntry | null;
  projects: Array<{ id: string; name: string }>;
}

const LogTimeModal = ({ open, onClose, entry, projects }: LogTimeModalProps) => {
  const { t } = useI18n();
  const [error, setError] = useState('');
  const createEntry = useCreateTimeEntry();
  const updateEntry = useUpdateTimeEntry();

  // Persists new-entry draft values across close/reopen cycles so the user
  // never loses partially-entered data when they accidentally dismiss the modal.
  const draftRef = React.useRef<TimeEntryFormData | null>(null);
  const prevOpenRef = React.useRef(false);
  // Set when the modal closes due to a successful submit (vs. a dismissal) so
  // the close handler knows NOT to preserve the just-saved values as a draft.
  const justSubmittedRef = React.useRef(false);

  const { register, handleSubmit, reset, control, setValue, watch: watchForm, getValues, formState: { isSubmitting, errors } } = useForm<TimeEntryFormData>({
    defaultValues: {
      project_id: entry?.projectId ?? '',
      task_id: entry?.taskId ?? '',
      description: entry?.description ?? '',
      date: entry?.date ?? todayStr(),
      hours: entry?.hours ? decimalToHHMM(Number(entry.hours)) : '1:00',
      start_time: entry?.startTime ?? '',
      end_time: entry?.endTime ?? '',
      is_billable: entry?.isBillable ?? true,
      notes: entry?.notes ?? '',
    },
  });

  const watchedProjectId = useWatch({ control, name: 'project_id' });
  const watchedStart = watchForm('start_time');
  const watchedEnd = watchForm('end_time');

  // Auto-calculate hours from start/end time — produces HH:MM format
  React.useEffect(() => {
    if (watchedStart && watchedEnd) {
      const [sh, sm] = watchedStart.split(':').map(Number);
      const [eh, em] = watchedEnd.split(':').map(Number);
      const diff = (eh * 60 + em) - (sh * 60 + sm);
      if (diff > 0) {
        setValue('hours', decimalToHHMM(Math.round((diff / 60) * 100) / 100), { shouldValidate: false });
        setError('');
      }
    }
  }, [watchedStart, watchedEnd, setValue]);

  const { data: tasksRaw = [], isFetching: tasksFetching } = useTasks(
    watchedProjectId ? { project_id: watchedProjectId, my_only: 'true' } : undefined,
    !!watchedProjectId,
  );
  const tasks = (tasksRaw as Array<{ id: string; title: string; require_approval?: string | boolean }>).filter(Boolean);
  const tasksLoading = !!watchedProjectId && tasksFetching;

  React.useEffect(() => {
    const justOpened  = open && !prevOpenRef.current;
    const justClosed  = !open && prevOpenRef.current;

    if (justOpened) {
      if (entry) {
        // Editing an existing entry — always load that entry's data
        reset({
          project_id:  entry.projectId ? String(entry.projectId) : '',
          task_id:     entry.taskId    ? String(entry.taskId)    : '',
          description: entry.description ?? '',
          date:        entry.date ?? todayStr(),
          hours:       entry.hours ? decimalToHHMM(Number(entry.hours)) : '1:00',
          start_time:  entry.startTime ?? '',
          end_time:    entry.endTime ?? '',
          is_billable: entry.isBillable ?? true,
          notes:       entry.notes ?? '',
        });
        draftRef.current = null;
      } else if (draftRef.current) {
        // New entry and we have a saved draft — restore it
        reset(draftRef.current);
      } else {
        reset({
          project_id: '', task_id: '', description: '',
          date: todayStr(), hours: '1:00',
          start_time: '', end_time: '',
          is_billable: true, notes: '',
        });
      }
      setError('');
    }

    if (justClosed && !entry) {
      if (justSubmittedRef.current) {
        // Closed because the entry was saved — start fresh next time.
        draftRef.current = null;
        justSubmittedRef.current = false;
      } else {
        // Dismissed without saving — preserve what the user typed.
        draftRef.current = getValues();
      }
    }

    prevOpenRef.current = open;
  }, [open, entry, reset, getValues]);

  const onSubmit = async (data: TimeEntryFormData) => {
    try {
      setError('');
      if (data.start_time && data.end_time) {
        const [sh, sm] = data.start_time.split(':').map(Number);
        const [eh, em] = data.end_time.split(':').map(Number);
        if ((eh * 60 + em) - (sh * 60 + sm) <= 0) {
          setError('End time must be after start time');
          return;
        }
      }
      const selectedTask = data.task_id ? tasks.find(t => String((t as any).ROWID ?? t.id) === data.task_id) : null;
      const requireApproval = selectedTask?.require_approval === 'true' || selectedTask?.require_approval === true;
      const payload = {
        ...data,
        hours: parseHoursInput(data.hours),
        task_id: data.task_id || undefined,
        require_approval: requireApproval ? 'true' : 'false',
      };
      if (entry) {
        await updateEntry.mutateAsync({ id: entry.id, data: payload });
      } else {
        await createEntry.mutateAsync(payload);
        draftRef.current = null;          // clear draft on successful submit
        justSubmittedRef.current = true;  // tell the close handler not to re-save it
      }
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Something went wrong');
    }
  };

  // Duration banner helper
  const durationBanner = (() => {
    if (!watchedStart || !watchedEnd) return null;
    const [sh, sm] = watchedStart.split(':').map(Number);
    const [eh, em] = watchedEnd.split(':').map(Number);
    const diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff <= 0) return (
      <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg">
        <AlertCircle size={14} className="text-red-500 shrink-0" />
        <span className="text-sm text-red-700 font-medium">End time must be after start time</span>
      </div>
    );
    const hh = Math.floor(diff / 60);
    const mm = diff % 60;
    const readable = hh > 0 && mm > 0 ? `${hh}h ${mm}m` : hh > 0 ? `${hh}h` : `${mm}m`;
    return (
      <div className="flex items-center justify-between px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-lg">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-indigo-500 shrink-0" />
          <span className="text-sm text-indigo-800 font-medium">Duration: <strong>{readable}</strong></span>
        </div>
        <span className="text-xs text-indigo-500 bg-indigo-100 px-2 py-0.5 rounded-full font-medium">
          {decimalToHHMM(Math.round((diff / 60) * 100) / 100)} hrs auto-filled
        </span>
      </div>
    );
  })();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={entry ? 'Edit Time Entry' : t('timeTracking.logTime')}
      size="xl"
      closeOnBackdropClick={false}
      closeButtonVariant="danger"
    >
      <form onSubmit={handleSubmit(onSubmit as any)}>
        {error && <div className="mb-5"><Alert type="error" message={error} /></div>}

        {/* ── Section 1: Project & Task ── */}
        {/* Edit-mode info banner: show what project/task we're editing */}
        {entry && (entry.projectName || entry.taskName) && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-700">
            <span className="font-semibold shrink-0">Editing:</span>
            {entry.projectName && <span className="bg-indigo-100 px-2 py-0.5 rounded font-medium">{entry.projectName}</span>}
            {entry.taskName && <><span className="text-indigo-400">›</span><span className="bg-indigo-100 px-2 py-0.5 rounded font-medium">{entry.taskName}</span></>}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="form-label">{t('timeTracking.form.project')} *</label>
            <select className="form-select" {...register('project_id', { required: 'Project is required' })}>
              <option value="">Select project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {errors.project_id && <p className="text-xs text-red-600 mt-1">{errors.project_id.message}</p>}
          </div>

          <div>
            <label className="form-label">{t('timeTracking.form.task')} {entry ? '' : '*'}</label>
            {!watchedProjectId ? (
              <div className="form-select text-gray-400 text-sm select-none cursor-not-allowed bg-gray-50">
                Select a project first…
              </div>
            ) : tasksLoading ? (
              <div className="form-select flex items-center gap-2.5 bg-indigo-50/60 border-indigo-100 text-indigo-700 cursor-wait select-none" aria-busy="true">
                <Loader2 size={14} className="text-indigo-500 animate-spin shrink-0" />
                <span className="text-sm">Loading tasks…</span>
              </div>
            ) : (
              <select className="form-select" {...register('task_id', { required: entry ? false : 'Task is required' })}>
                <option value="">{entry ? 'Keep existing task…' : 'Select task…'}</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            )}
            {errors.task_id && <p className="text-xs text-red-600 mt-1">{(errors.task_id as any).message}</p>}
            {!tasksLoading && watchedProjectId && tasks.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">No tasks yet — ask your project lead to add some.</p>
            )}
          </div>
        </div>

        {/* ── Section 2: Description ── */}
        <div className="mb-5">
          <label className="form-label">{t('timeTracking.form.description')} *</label>
          <input
            className="form-input"
            placeholder="What did you work on?"
            {...register('description', { required: 'Description is required' })}
          />
          {errors.description && <p className="text-xs text-red-600 mt-1">{errors.description.message}</p>}
        </div>

        {/* ── Section 3: Time & Date grid ── */}
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 mb-5 space-y-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Time Details</p>

          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="form-label">Start Time <span className="text-gray-400 font-normal text-[11px]">(opt)</span></label>
              <input type="time" className="form-input" {...register('start_time')} />
            </div>
            <div>
              <label className="form-label">End Time <span className="text-gray-400 font-normal text-[11px]">(opt)</span></label>
              <input type="time" className="form-input" {...register('end_time')} />
            </div>
            <div>
              <label className="form-label">{t('timeTracking.form.date')} *</label>
              <input type="date" className="form-input" {...register('date', { required: 'Date is required' })} />
            </div>
            <div>
              <label className="form-label">
                {t('timeTracking.form.hours')} *
                {watchedStart && watchedEnd && (
                  <span className="ml-1.5 text-[9px] font-bold text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded uppercase tracking-wide">auto</span>
                )}
              </label>
              <input
                type="text"
                inputMode="text"
                placeholder="1:30"
                className={`form-input font-mono ${watchedStart && watchedEnd ? 'bg-indigo-50 border-indigo-300 text-indigo-800 font-semibold' : ''}`}
                {...register('hours', {
                  required: 'Hours is required',
                  validate: (v) => {
                    const parsed = parseHoursInput(String(v));
                    if (!parsed || parsed <= 0) return 'Enter H:MM or decimal (e.g. 1:30 or 1.5)';
                    if (parsed > 24) return 'Max 24h';
                    return true;
                  },
                })}
              />
              {errors.hours && <p className="text-xs text-red-600 mt-1">{errors.hours.message}</p>}
            </div>
          </div>

          {durationBanner}
        </div>

        {/* ── Section 4: Billable + Notes ── */}
        <div className="grid grid-cols-2 gap-4 mb-2">
          <div>
            <label className="form-label">{t('common.notes')} <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="Additional context…"
              {...register('notes')}
            />
          </div>
          <div className="flex flex-col justify-start pt-6">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                id="is_billable"
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                {...register('is_billable')}
              />
              <div>
                <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                  {t('timeTracking.billable')} hours
                </span>
                <p className="text-xs text-gray-400 mt-0.5">Mark this entry as billable to the client</p>
              </div>
            </label>
          </div>
        </div>

        <ModalActions>
          <Button variant="outline" type="button" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" loading={isSubmitting} icon={<Clock size={16} />}>
            {entry ? 'Save Changes' : t('timeTracking.logTime')}
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
};

// ── Reject Notes Modal ────────────────────────────────────────────────────────

interface RejectModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (notes: string) => Promise<void>;
  title?: string;
}

const RejectModal = ({ open, onClose, onConfirm, title = 'Reject Entry' }: RejectModalProps) => {
  const { t } = useI18n();
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (open) { setNotes(''); setError(''); }
  }, [open]);

  const handleConfirm = async () => {
    try {
      setLoading(true);
      setError('');
      await onConfirm(notes);
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to reject');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      {error && <Alert type="error" message={error} className="mb-3" />}
      <div>
        <label className="form-label">Reason for rejection</label>
        <textarea
          className="form-textarea"
          rows={3}
          placeholder="Explain why this entry is being rejected…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <ModalActions>
        <Button variant="outline" type="button" onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="danger" onClick={handleConfirm} loading={loading} icon={<XCircle size={16} />}>
          {t('common.reject')}
        </Button>
      </ModalActions>
    </Modal>
  );
};

// ── My Time Log Tab ───────────────────────────────────────────────────────────

interface MyTimeLogTabProps {
  projects: Array<{ id: string; name: string }>;
}


const MyTimeLogTab = ({ projects }: MyTimeLogTabProps) => {
  const { t } = useI18n();
  const { confirm: openConfirm } = useConfirm();
  const { user } = useAuth();

  // View mode: 'list' = paginated table, 'weekly' = spreadsheet grid
  const [viewMode, setViewMode] = useState<'list' | 'weekly'>('list');

  // Build id→name map for instant project name lookup
  const projectMap = useMemo(() => {
    const m: Record<string, string> = {};
    (projects as Array<{ id: string; name: string }>).forEach((p) => { m[p.id] = p.name; });
    return m;
  }, [projects]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  // Time-of-day window (HH:MM). Filters entries to those overlapping the window
  // AND defines the working window used to surface per-day "no log" gaps.
  const [filterTimeFrom, setFilterTimeFrom] = useState('');
  const [filterTimeTo, setFilterTimeTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Secondary view filter — pushed down to backend as project_id / task_id
  const [viewProject, setViewProject] = useState('');
  const [viewTask, setViewTask] = useState('');

  // Reset all filters (top-row + secondary). Resets to page 1 implicitly
  // via the existing useEffect that watches every filter dependency.
  const clearAllFilters = () => {
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterProject('');
    setFilterStatus('');
    setFilterTimeFrom('');
    setFilterTimeTo('');
    setViewProject('');
    setViewTask('');
  };

  // True when any filter is non-default — used to show/hide the Clear button.
  const hasAnyFilter = Boolean(
    filterDateFrom || filterDateTo || filterProject || filterStatus ||
    filterTimeFrom || filterTimeTo || viewProject || viewTask
  );

  // Load tasks for the currently selected view-filter project
  const { data: viewTasksRaw = [] } = useTasks(
    viewProject ? { project_id: viewProject } : undefined,
  );
  const viewTasks = (viewTasksRaw as Array<{ id: string; title: string }>).filter(Boolean);

  // Reset to page 1 whenever any filter (top or secondary) or pageSize changes —
  // must be useEffect, not inside useMemo
  useEffect(() => {
    setPage(1);
  }, [filterDateFrom, filterDateTo, filterProject, filterStatus, filterTimeFrom, filterTimeTo, viewProject, viewTask, pageSize]);

  // Build query params for the backend. We now push viewProject / viewTask
  // down to the server too (was previously client-side filtered after fetch).
  // That makes the server-side pagination counts accurate.
  const filterParams = useMemo(() => {
    const p: Record<string, string> = {};
    // Always scope to the current user's own entries in this tab
    if (user?.id) p.user_id = String(user.id);
    if (filterDateFrom) p.date_from = filterDateFrom;
    if (filterDateTo) p.date_to = filterDateTo;
    // Secondary "View by" project beats the top filter when both are set
    // (the user just changed the more-specific dropdown).
    const effectiveProject = viewProject || filterProject;
    if (effectiveProject) p.project_id = effectiveProject;
    if (viewTask)        p.task_id    = viewTask;
    if (filterStatus)    p.status     = filterStatus;
    p.page     = String(page);
    p.pageSize = String(pageSize);
    return p;
  }, [user?.id, filterDateFrom, filterDateTo, filterProject, filterStatus, viewProject, viewTask, page, pageSize]);

  const { data: result, isLoading, error } = useTimeEntries(filterParams);
  const allEntries  = (result?.data ?? []) as TimeEntry[];
  const pagination  = result?.pagination ?? null;
  // When the backend is paginated (`pagination` returned), `allEntries` is
  // already the current page — display it as-is. When the backend isn't yet
  // rebuilt (legacy array shape, no `pagination`), we slice client-side so
  // pagination still works visually. Either way the UI is consistent.
  const entries     = pagination
    ? allEntries
    : allEntries.slice((page - 1) * pageSize, page * pageSize);
  const totalCount  = pagination?.total ?? allEntries.length;
  const totalPages  = Math.max(1, pagination?.totalPages ?? Math.ceil(allEntries.length / pageSize));

  // Apply the time-of-day window (client-side, on the current page). An entry is
  // kept when its [start, end] overlaps the window. Untimed entries are dropped
  // only while the time filter is active (they can't be placed on a timeline).
  const filteredEntries = useMemo(() => {
    const fromMin = timeToMin(filterTimeFrom);
    const toMin   = timeToMin(filterTimeTo);
    if (fromMin == null && toMin == null) return entries as TimeEntry[];
    return (entries as TimeEntry[]).filter((e) => {
      const s = timeToMin(e.startTime);
      if (s == null) return false;
      const end = timeToMin(e.endTime) ?? s;
      if (fromMin != null && end <= fromMin) return false; // entirely before window
      if (toMin != null && s >= toMin) return false;       // entirely after window
      return true;
    });
  }, [entries, filterTimeFrom, filterTimeTo]);

  // Group the displayed entries by calendar day so the list reads as a daily
  // work log: each day shows its entries, a Daily Activity Summary (billable /
  // non-billable / total) and the GAPS — time windows with no log — so the user
  // can see when they forgot to track. Newest day first.
  const dayGroups = useMemo(() => {
    const winStart = timeToMin(filterTimeFrom);
    const winEnd   = timeToMin(filterTimeTo);

    const groups = new Map<string, TimeEntry[]>();
    for (const e of filteredEntries) {
      const key = String(e.date || '').slice(0, 10);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }
    return Array.from(groups.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => {
        let billable = 0;
        let nonBillable = 0;
        for (const it of items) {
          const h = Number(it.hours) || 0;
          if (it.isBillable) billable += h; else nonBillable += h;
        }

        // Build the covered timeline from entries that have a real start+end,
        // merge overlaps, then derive the uncovered gaps between them. When a
        // working window (from/to time) is set, also flag the leading/trailing
        // gaps so a day that starts late / ends early is visible too.
        const timed = items
          .map((it) => ({ s: timeToMin(it.startTime), e: timeToMin(it.endTime) }))
          .filter((x): x is { s: number; e: number } => x.s != null && x.e != null && x.e > x.s)
          .sort((a, b) => a.s - b.s);
        const merged: Array<[number, number]> = [];
        for (const { s, e } of timed) {
          const last = merged[merged.length - 1];
          if (!last || s > last[1]) merged.push([s, e]);
          else last[1] = Math.max(last[1], e);
        }
        const gaps: Array<{ start: number; end: number }> = [];
        if (merged.length > 0) {
          if (winStart != null && winStart < merged[0][0]) gaps.push({ start: winStart, end: merged[0][0] });
          for (let i = 1; i < merged.length; i++) {
            if (merged[i][0] > merged[i - 1][1]) gaps.push({ start: merged[i - 1][1], end: merged[i][0] });
          }
          if (winEnd != null && winEnd > merged[merged.length - 1][1]) {
            gaps.push({ start: merged[merged.length - 1][1], end: winEnd });
          }
        } else if (winStart != null && winEnd != null && winEnd > winStart) {
          // No timed entries at all that day, but a window is set → the whole window is a gap.
          gaps.push({ start: winStart, end: winEnd });
        }
        const untrackedMin = gaps.reduce((sum, g) => sum + (g.end - g.start), 0);

        return { date, items, billable, nonBillable, total: billable + nonBillable, gaps, untrackedMin };
      });
  }, [filteredEntries, filterTimeFrom, filterTimeTo]);

  const deleteEntry = useDeleteTimeEntry();
  const submitEntry = useSubmitTimeEntry();
  const retractEntry = useRetractTimeEntry();

  const handleDelete = async (id: string) => {
    const ok = await openConfirm({ title: 'Delete Time Entry', message: 'This time entry will be permanently deleted.', confirmText: 'Delete', variant: 'danger' });
    if (!ok) return;
    try { await deleteEntry.mutateAsync(id); } catch { /* noop */ }
  };

  const handleSubmit = async (id: string) => {
    try { await submitEntry.mutateAsync(id); } catch { /* noop */ }
  };

  const handleRetract = async (id: string) => {
    const ok = await openConfirm({ title: 'Retract Submission', message: 'This will move the entry back to draft. You can re-submit it later.', confirmText: 'Retract', variant: 'warning' });
    if (!ok) return;
    try { await retractEntry.mutateAsync(id); } catch { /* noop */ }
  };

  const openEdit = (entry: TimeEntry) => {
    setEditEntry(entry);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditEntry(null);
  };

  // Quick-pick date presets. The "active" chip is whichever preset matches
  // the current from/to values exactly — null means "Custom" (no preset
  // selected). Keeping it derived rather than stored avoids the from/to and
  // preset getting out of sync when the user nudges a date manually.
  const applyDatePreset = (preset: 'today' | 'yesterday' | 'week' | 'all') => {
    const today = new Date();
    if (preset === 'all') {
      setFilterDateFrom('');
      setFilterDateTo('');
      return;
    }
    if (preset === 'today') {
      const d = format(today, 'yyyy-MM-dd');
      setFilterDateFrom(d); setFilterDateTo(d);
      return;
    }
    if (preset === 'yesterday') {
      const d = format(subDays(today, 1), 'yyyy-MM-dd');
      setFilterDateFrom(d); setFilterDateTo(d);
      return;
    }
    if (preset === 'week') {
      // Monday-anchored — matches the rest of the app's week boundaries.
      setFilterDateFrom(format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
      setFilterDateTo  (format(endOfWeek  (today, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
      return;
    }
  };
  const activePreset = useMemo<'today' | 'yesterday' | 'week' | 'all' | 'custom'>(() => {
    const today = new Date();
    const t  = format(today, 'yyyy-MM-dd');
    const y  = format(subDays(today, 1), 'yyyy-MM-dd');
    const ws = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const we = format(endOfWeek  (today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    if (!filterDateFrom && !filterDateTo)                                  return 'all';
    if (filterDateFrom === t  && filterDateTo === t)                       return 'today';
    if (filterDateFrom === y  && filterDateTo === y)                       return 'yesterday';
    if (filterDateFrom === ws && filterDateTo === we)                      return 'week';
    return 'custom';
  }, [filterDateFrom, filterDateTo]);

  const PRESETS: Array<{ key: 'today' | 'yesterday' | 'week' | 'all'; label: string }> = [
    { key: 'today',     label: t('common.today') },
    { key: 'yesterday', label: t('common.yesterday') },
    { key: 'week',      label: t('common.thisWeek') },
    { key: 'all',       label: 'All Time' },
  ];

  // When the selected date range sits inside a single Mon–Sun week, expose that
  // week's days as quick chips so the user can jump straight to one day instead
  // of scrolling the whole week. Derived from the range, so the chips stay
  // visible after a day is picked (picking a day narrows from/to to that day).
  const weekChips = useMemo(() => {
    if (!filterDateFrom) return null;
    const fromD = parseISO(filterDateFrom);
    if (!isValid(fromD)) return null;
    const wsStr = format(startOfWeek(fromD, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const weStr = format(endOfWeek(fromD, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    // Only show when the whole current range stays within this one week.
    const toStr = filterDateTo || filterDateFrom;
    if (toStr > weStr) return null;
    const days = eachDayOfInterval({ start: parseISO(wsStr), end: parseISO(weStr) }).map((d) => ({
      date: format(d, 'yyyy-MM-dd'),
      dow:  format(d, 'EEE'),
      dom:  format(d, 'd'),
    }));
    return { wsStr, weStr, days };
  }, [filterDateFrom, filterDateTo]);
  const wholeWeekActive = Boolean(weekChips && filterDateFrom === weekChips.wsStr && filterDateTo === weekChips.weStr);

  // When weekly view is active, hand off entirely to the weekly grid
  if (viewMode === 'weekly') {
    return (
      <div className="space-y-4">
        {/* View toggle */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
            <button
              onClick={() => setViewMode('list')}
              className="px-4 py-1.5 text-sm font-medium rounded-md transition-colors text-gray-500 hover:text-gray-700"
            >
              List View
            </button>
            <button
              className="px-4 py-1.5 text-sm font-medium rounded-md transition-colors bg-white shadow text-gray-900"
            >
              Weekly View
            </button>
          </div>
          <Button size="sm" icon={<Plus size={14} />} onClick={() => { setEditEntry(null); setModalOpen(true); }}>
            {t('timeTracking.logTime')}
          </Button>
        </div>

        <WeeklyTimesheetTab />

        <LogTimeModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditEntry(null); }}
          entry={editEntry}
          projects={projects}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* View toggle */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          <button
            className="px-4 py-1.5 text-sm font-medium rounded-md transition-colors bg-white shadow text-gray-900"
          >
            List View
          </button>
          <button
            onClick={() => setViewMode('weekly')}
            className="px-4 py-1.5 text-sm font-medium rounded-md transition-colors text-gray-500 hover:text-gray-700"
          >
            Weekly View
          </button>
        </div>
      </div>

      {/* Date / Status Filters */}
      <Card>
        {/* Quick date presets + Clear filters. Active preset is highlighted;
            "Custom" appears automatically when the user edits From/To to a
            non-preset range. The Clear button is rendered only when at least
            one filter is set. */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyDatePreset(p.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                activePreset === p.key
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {p.label}
            </button>
          ))}
          {activePreset === 'custom' && (
            <span className="px-3 py-1.5 text-xs font-medium rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              Custom
            </span>
          )}
          {hasAnyFilter && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="ml-auto px-3 py-1.5 text-xs font-medium rounded-full border border-red-200 text-red-600 bg-white hover:bg-red-50 transition-colors flex items-center gap-1"
              title="Clear all filters"
            >
              <X size={12} /> Clear filters
            </button>
          )}
        </div>

        {/* Weekday quick-jump — shown when the range sits within one week so the
            user can hop to a single day instead of scrolling the whole week. */}
        {weekChips && (
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <span className="text-xs font-medium text-gray-500 mr-1">Jump to day:</span>
            <button
              type="button"
              onClick={() => { setFilterDateFrom(weekChips.wsStr); setFilterDateTo(weekChips.weStr); }}
              className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                wholeWeekActive
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Whole week
            </button>
            {weekChips.days.map((d) => {
              const active = filterDateFrom === d.date && filterDateTo === d.date;
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => { setFilterDateFrom(d.date); setFilterDateTo(d.date); }}
                  className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors tabular-nums ${
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                  title={d.date}
                >
                  {d.dow} {d.dom}
                </button>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="form-label">From</label>
            <input
              type="date"
              className="form-input"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">To</label>
            <input
              type="date"
              className="form-input"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">{t('timeTracking.form.project')}</label>
            <select className="form-select" value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">{t('common.status')}</label>
            <select className="form-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          <div>
            <label className="form-label">Start time (from)</label>
            <input
              type="time"
              className="form-input"
              value={filterTimeFrom}
              onChange={(e) => setFilterTimeFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">End time (to)</label>
            <input
              type="time"
              className="form-input"
              value={filterTimeTo}
              onChange={(e) => setFilterTimeTo(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
          <AlertCircle size={12} />
          Set a start/end time to filter entries by time of day and highlight the windows you haven't logged.
        </p>
      </Card>

      {/* Secondary view filter — by project + task */}
      <div className="flex flex-wrap items-end gap-3 px-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">View by:</span>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="form-label text-xs">Filter Project</label>
            <select
              className="form-select text-sm py-1.5"
              value={viewProject}
              onChange={(e) => { setViewProject(e.target.value); setViewTask(''); }}
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          {viewProject && (
            <div>
              <label className="form-label text-xs">Filter Task</label>
              <select
                className="form-select text-sm py-1.5"
                value={viewTask}
                onChange={(e) => setViewTask(e.target.value)}
              >
                <option value="">All tasks</option>
                {viewTasks.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>
          )}
          {(viewProject || viewTask) && (
            <button
              type="button"
              onClick={() => { setViewProject(''); setViewTask(''); }}
              className="text-xs text-gray-500 hover:text-red-500 transition-colors pb-1.5"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <Card padding={false}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">My Time Entries</h3>
          <Button
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => { setEditEntry(null); setModalOpen(true); }}
          >
            {t('timeTracking.logTime')}
          </Button>
        </div>

        {isLoading ? (
          <SkeletonTable rows={5} />
        ) : error ? (
          <Alert type="error" message={(error as Error).message} className="m-5" />
        ) : filteredEntries.length === 0 ? (
          <EmptyState
            icon={<Clock size={36} />}
            title={(filterTimeFrom || filterTimeTo) ? 'No entries in this time window' : 'No time entries'}
            description={(filterTimeFrom || filterTimeTo)
              ? 'No logs fall within the selected start/end time on this page. Try widening the time window or clearing it.'
              : 'Start tracking your time by logging an entry.'}
            action={
              <Button size="sm" icon={<Plus size={14} />} onClick={() => setModalOpen(true)}>
                {t('timeTracking.logTime')}
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto divide-y divide-gray-100">
            {dayGroups.map((group) => (
              <div key={group.date}>
                {/* ── Day header + Daily Activity Summary ── */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-gray-50/70">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
                      <CalendarDays size={18} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">
                        {safeFormat(group.date, 'EEEE, MMM d, yyyy')}
                      </div>
                      <div className="text-xs text-gray-500">
                        {group.items.length} {group.items.length === 1 ? 'entry' : 'entries'} · Daily Activity Summary
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 sm:gap-5">
                    <div className="text-center">
                      <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{t('timeTracking.billable')}</div>
                      <span className="inline-block mt-0.5 px-2 py-0.5 rounded-md text-xs font-semibold bg-green-50 text-green-700 tabular-nums">
                        {fmtHM(group.billable)}
                      </span>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Non-Billable</div>
                      <span className="inline-block mt-0.5 px-2 py-0.5 rounded-md text-xs font-semibold bg-orange-50 text-orange-700 tabular-nums">
                        {fmtHM(group.nonBillable)}
                      </span>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Total Effort</div>
                      <span className="inline-block mt-0.5 px-2 py-0.5 rounded-md text-xs font-semibold bg-gray-900 text-white tabular-nums">
                        {fmtHM(group.total)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ── Untracked windows (no log) for the day ── */}
                {group.gaps.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 px-5 py-2 bg-amber-50/70 border-t border-amber-100">
                    <span className="flex items-center gap-1 text-xs font-semibold text-amber-700">
                      <AlertCircle size={13} /> No logs
                    </span>
                    {group.gaps.map((g, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-md text-xs font-medium bg-white text-amber-700 border border-amber-200 tabular-nums"
                        title="No time entry covers this window"
                      >
                        {minToTime(g.start)}–{minToTime(g.end)}
                      </span>
                    ))}
                    <span className="ml-auto text-xs font-medium text-amber-600 tabular-nums">
                      {fmtH(group.untrackedMin / 60)} untracked
                    </span>
                  </div>
                )}

                {/* ── Day entries ── */}
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-white">
                    <tr>
                      {[t('timeTracking.form.project'), t('timeTracking.form.task'), 'Start Time', 'End Time', t('timeTracking.form.hours'), t('timeTracking.billable'), t('common.status'), 'Created', t('common.actions')].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {group.items.map((entry) => (
                      <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                          {entry.projectName || projectMap[entry.projectId] || entry.projectId}
                        </td>
                        <td className="px-4 py-3 text-sm max-w-xs">
                          {entry.taskName ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium text-gray-900 truncate" title={entry.taskName}>
                                {entry.taskName}
                              </span>
                              {entry.description && (
                                <span className="text-xs text-gray-500 truncate" title={entry.description}>
                                  {entry.description}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-600 truncate block" title={entry.description}>
                              {entry.description || <span className="text-gray-300">—</span>}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {entry.startTime ? entry.startTime.slice(0, 5) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {entry.endTime ? entry.endTime.slice(0, 5) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                          {fmtH(entry.hours)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {entry.isBillable
                            ? <CheckCircle2 size={15} className="text-green-600 mx-auto" />
                            : <XCircle size={15} className="text-gray-300 mx-auto" />
                          }
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={statusVariant(entry.status)}>
                            {statusLabel(entry.status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {entry.createdAt ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs text-gray-700">{safeFormat(entry.createdAt, 'MMM d, yyyy')}</span>
                              <span className="text-xs text-gray-400">{safeFormat(entry.createdAt, 'h:mm a')}</span>
                            </div>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {(entry.status === 'DRAFT' || entry.status === 'REJECTED' || entry.status === 'SUBMITTED') && (
                              <button
                                onClick={() => openEdit(entry)}
                                className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors rounded"
                                title={entry.status === 'SUBMITTED' ? 'Edit (retracts submission)' : 'Edit'}
                              >
                                <Edit2 size={14} />
                              </button>
                            )}
                            {entry.status === 'DRAFT' && (
                              <>
                                <button
                                  onClick={() => handleSubmit(entry.id)}
                                  className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors rounded"
                                  title="Submit for approval"
                                >
                                  <Send size={14} />
                                </button>
                                <button
                                  onClick={() => handleDelete(entry.id)}
                                  className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded"
                                  title="Delete"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                            {entry.status === 'SUBMITTED' && (
                              <button
                                onClick={() => handleRetract(entry.id)}
                                className="p-1.5 text-gray-400 hover:text-amber-600 transition-colors rounded"
                                title="Retract submission"
                              >
                                <RotateCcw size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        {/* Pagination footer — sits INSIDE the table Card so it's always
            visible next to the rows (no chance of being below the fold).
            Renders unconditionally when any entries exist; the prev/next
            page buttons only appear when there's more than one page. */}
        {entries.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-gray-100 bg-gray-50">
            <div className="flex items-center gap-4 text-xs text-gray-600">
              <span>
                Showing <strong>{((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, totalCount)}</strong> of <strong>{totalCount}</strong> entries
              </span>
              <span className="flex items-center gap-1.5">
                <label htmlFor="time-page-size" className="text-gray-500">Rows per page:</label>
                <select
                  id="time-page-size"
                  value={pageSize}
                  onChange={(e) => setPageSize(parseInt(e.target.value, 10) || 5)}
                  className="text-xs border border-gray-300 rounded px-1.5 py-0.5 bg-white"
                >
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                disabled={page === 1}
                onClick={() => setPage(1)}
                className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                title="First page"
              >
                «
              </button>
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                title="Previous page"
              >
                ←
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce<(number | '...')[]>((acc, p, i, arr) => {
                  if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === '...' ? (
                    <span key={`ellipsis-${i}`} className="px-1 text-gray-400 text-xs">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p as number)}
                      className={`min-w-[28px] px-2 py-1 text-xs border rounded ${
                        page === p
                          ? 'bg-indigo-600 text-white border-indigo-600 font-semibold'
                          : 'border-gray-200 hover:bg-white'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                title="Next page"
              >
                →
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(totalPages)}
                className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                title="Last page"
              >
                »
              </button>
            </div>
          </div>
        )}
      </Card>

      <LogTimeModal
        open={modalOpen}
        onClose={closeModal}
        entry={editEntry}
        projects={projects}
      />
    </div>
  );
};

// ── Analytics Tab (Week / Month / Overall) ────────────────────────────────────

type AnalyticsPeriod = 'week' | 'month' | 'overall';

interface AnalyticsTabProps {
  projects: Array<{ id: string; name: string }>;
}

const AnalyticsTab = ({ projects }: AnalyticsTabProps) => {
  const { t } = useI18n();
  const { user } = useAuth();
  const [period, setPeriod] = useState<AnalyticsPeriod>('week');

  const projectMap = useMemo(() => {
    const m: Record<string, string> = {};
    projects.forEach((p) => { m[p.id] = p.name; });
    return m;
  }, [projects]);

  // Date ranges
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now        = useMemo(() => new Date(), []);
  const weekStart  = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const weekEnd    = format(addDays(startOfWeek(now, { weekStartsOn: 1 }), 6), 'yyyy-MM-dd');
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd   = format(endOfMonth(now), 'yyyy-MM-dd');

  const params = useMemo((): Record<string, string> => {
    // Scope to the current user — otherwise an admin (who can see all entries)
    // would aggregate the whole tenant in their personal "My Analytics".
    const uid: Record<string, string> = user?.id ? { user_id: String(user.id) } : {};
    if (period === 'week')    return { ...uid, date_from: weekStart, date_to: weekEnd };
    if (period === 'month')   return { ...uid, date_from: monthStart, date_to: monthEnd };
    return uid;
  }, [period, user?.id, weekStart, weekEnd, monthStart, monthEnd]);

  const { data: weekData, isLoading: weekLoading } = useMyWeek();
  // Month / Overall: walk every page so totals & breakdowns cover the whole
  // period (the non-paginated list caps at 200 rows and would under-count).
  const { data: entriesResult, isLoading: entriesLoading } = useAllTimeEntries(
    params, period !== 'week',
  );

  const isLoading = period === 'week' ? weekLoading : entriesLoading;

  // For week period use the pre-computed myWeek shape; for others compute from entries
  const week = weekData as WeekSummary | undefined;

  const entries: TimeEntry[] = useMemo(() => {
    if (period === 'week') return (week?.entries ?? []) as TimeEntry[];
    return (entriesResult?.data ?? []) as TimeEntry[];
  }, [period, week, entriesResult]);

  // Aggregate stats
  const totalHours       = useMemo(() => period === 'week' && week ? week.totalHours       : entries.reduce((s, e) => s + (parseFloat(String(e.hours)) || 0), 0), [period, week, entries]);
  const billableHours    = useMemo(() => period === 'week' && week ? week.billableHours    : entries.filter((e) => e.isBillable).reduce((s, e) => s + (parseFloat(String(e.hours)) || 0), 0), [period, week, entries]);
  const nonBillableHours = useMemo(() => Math.round((totalHours - billableHours) * 100) / 100, [totalHours, billableHours]);

  // Days with at least one entry
  const daysLogged = useMemo(() => {
    if (period === 'week' && week) return week.daysLogged;
    return new Set(entries.map((e) => e.date)).size;
  }, [period, week, entries]);

  // Per-day breakdown for week / month
  const dayBreakdown = useMemo(() => {
    if (period === 'week' && week?.days) return week.days;

    const dateRange = period === 'month'
      ? eachDayOfInterval({ start: startOfMonth(now), end: endOfMonth(now) }).map((d) => format(d, 'yyyy-MM-dd'))
      : Array.from({ length: 7 }, (_, i) => format(addDays(startOfWeek(now, { weekStartsOn: 1 }), i), 'yyyy-MM-dd'));

    const byDate: Record<string, TimeEntry[]> = {};
    for (const e of entries) { const d = e.date ?? ''; if (!byDate[d]) byDate[d] = []; byDate[d].push(e); }

    return dateRange.map((date) => {
      const dayEntries = byDate[date] ?? [];
      const hours = Math.round(dayEntries.reduce((s, e) => s + (parseFloat(String(e.hours)) || 0), 0) * 100) / 100;
      return {
        date,
        label: date,
        hours,
        entries: dayEntries.map((e) => ({
          projectName: e.projectName || projectMap[e.projectId] || e.projectId || '',
          hours: parseFloat(String(e.hours)) || 0,
          description: e.description,
          status: e.status,
          id: e.id,
        })),
      };
    });
  }, [period, week, entries, projectMap, now]);

  // Per-project breakdown
  const byProject = useMemo(() => {
    const m: Record<string, { name: string; total: number; billable: number; count: number }> = {};
    for (const e of entries) {
      const pid = e.projectId ?? '';
      if (!m[pid]) m[pid] = { name: (e as any).projectName || projectMap[pid] || pid, total: 0, billable: 0, count: 0 };
      const h = parseFloat(String(e.hours)) || 0;
      m[pid].total    += h;
      m[pid].billable += e.isBillable ? h : 0;
      m[pid].count    += 1;
    }
    return Object.values(m).sort((a, b) => b.total - a.total);
  }, [entries, projectMap]);

  const maxDayHours = useMemo(() => Math.max(8, ...dayBreakdown.map((d) => d.hours)), [dayBreakdown]);
  const maxProjHours = useMemo(() => Math.max(1, ...byProject.map((p) => p.total)), [byProject]);

  const entryCount = entries.length;

  // Overall-only: monthly hours trend
  const monthlyTrend = useMemo(() => {
    if (period !== 'overall') return [];
    const m: Record<string, { month: string; label: string; hours: number; billable: number; count: number }> = {};
    for (const e of entries) {
      const key = (e.date ?? '').substring(0, 7);
      if (!key) continue;
      if (!m[key]) m[key] = { month: key, label: '', hours: 0, billable: 0, count: 0 };
      const h = parseFloat(String(e.hours)) || 0;
      m[key].hours    += h;
      m[key].billable += e.isBillable ? h : 0;
      m[key].count    += 1;
    }
    return Object.values(m)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((item) => ({
        ...item,
        hours:    Math.round(item.hours * 10) / 10,
        billable: Math.round(item.billable * 10) / 10,
        label:    isValid(parseISO(item.month + '-01')) ? format(parseISO(item.month + '-01'), 'MMM yy') : item.month,
      }));
  }, [period, entries]);

  // Overall-only: entry counts by approval status
  const statusBreakdown = useMemo(() => {
    if (period !== 'overall') return [];
    const counts: Record<string, number> = {};
    for (const e of entries) counts[e.status] = (counts[e.status] ?? 0) + 1;
    return [
      { name: 'Approved',  value: counts['APPROVED']  ?? 0, color: '#22c55e' },
      { name: 'Submitted', value: counts['SUBMITTED'] ?? 0, color: '#3b82f6' },
      { name: 'Draft',     value: counts['DRAFT']     ?? 0, color: '#94a3b8' },
      { name: 'Rejected',  value: counts['REJECTED']  ?? 0, color: '#ef4444' },
    ].filter((s) => s.value > 0);
  }, [period, entries]);

  const periodLabel = period === 'week' ? t('timeTracking.thisWeek') : period === 'month' ? format(now, 'MMMM yyyy') : 'All Time';

  // Today's data — always derived from the week snapshot regardless of selected period
  const todayData = week?.days?.find((d) => d.date === todayStr());
  const todayHours = Math.round((todayData?.hours ?? 0) * 100) / 100;
  const todayEntryCount = todayData?.entries?.length ?? 0;
  const todayProjects = todayData?.entries ?? [];
  const todayBillable = useMemo(() => {
    if (!week?.entries) return 0;
    return Math.round(
      week.entries
        .filter((e) => e.date === todayStr() && (e as TimeEntry).isBillable)
        .reduce((s, e) => s + (parseFloat(String((e as TimeEntry).hours)) || 0), 0) * 100
    ) / 100;
  }, [week]);
  const todayPct = Math.min((todayHours / 8) * 100, 100);
  const todayFull = todayHours >= 8;

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-5">
      {/* Today at a Glance */}
      <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 via-indigo-50 to-white p-4 shadow-sm">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-[11px] font-semibold text-blue-500 uppercase tracking-widest mb-0.5">Today</p>
            <p className="text-xs text-gray-500">{format(new Date(), 'EEEE, MMMM d')}</p>
          </div>
          <div className="text-right">
            <p className={`text-3xl font-bold leading-none ${todayFull ? 'text-green-600' : 'text-blue-700'}`}>
              {todayHours}<span className="text-lg font-medium">h</span>
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">logged today</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-blue-100 rounded-full overflow-hidden mb-3">
          <div
            className={`h-full rounded-full transition-all duration-500 ${todayFull ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: `${todayPct}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-gray-500 mb-3">
          <span>{todayEntryCount} entr{todayEntryCount !== 1 ? 'ies' : 'y'}</span>
          <div className="flex items-center gap-3">
            {todayBillable > 0 && (
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                {todayBillable}h billable
              </span>
            )}
            {todayHours - todayBillable > 0 && (
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
                {Math.round((todayHours - todayBillable) * 100) / 100}h non-billable
              </span>
            )}
          </div>
        </div>

        {/* Per-project pills */}
        {todayProjects.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {todayProjects.map((p, idx) => (
              <span
                key={idx}
                className="text-[11px] bg-white border border-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full shadow-sm font-medium"
              >
                {p.projectName || '—'} · {fmtH(p.hours)}
              </span>
            ))}
          </div>
        ) : weekLoading ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : (
          <p className="text-xs text-gray-400 italic">No time logged yet today. Go make it count!</p>
        )}
      </div>

      {/* Sub-tab switcher */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(['week', 'month', 'overall'] as AnalyticsPeriod[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              period === p ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {p === 'week' ? t('timeTracking.thisWeek') : p === 'month' ? t('timeTracking.thisMonth') : 'Overall'}
          </button>
        ))}
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label={t('timeTracking.totalHours')}     value={`${Math.round(totalHours * 10) / 10}h`}       icon={<Clock size={20} />}        color="blue"   />
        <StatCard label={t('timeTracking.billable')}        value={`${Math.round(billableHours * 10) / 10}h`}    icon={<DollarSign size={20} />}   color="green"  />
        <StatCard label={t('timeTracking.nonBillable')}    value={`${Math.round(nonBillableHours * 10) / 10}h`} icon={<Clock size={20} />}        color="amber"  />
        <StatCard label="Days Logged"     value={daysLogged}                                    icon={<CalendarDays size={20} />} color="purple" />
        <StatCard label="Time Entries"    value={entryCount}                                    icon={<Hash size={20} />}         color="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Day-by-day bar chart */}
        <Card className="lg:col-span-3">
          <h3 className="text-sm font-semibold text-gray-900 mb-5">{periodLabel} — Day Breakdown</h3>
          <div
            className={`space-y-${period === 'month' ? '2' : '4'} ${period === 'month' ? 'overflow-y-auto pr-1' : ''}`}
            style={period === 'month' ? { maxHeight: '420px' } : undefined}
          >
            {dayBreakdown.map(({ date, hours, entries: de }) => {
              const pct    = maxDayHours > 0 ? (hours / maxDayHours) * 100 : 0;
              const isToday = date === todayStr();
              const dayFmt  = period === 'month' ? safeFormat(date, 'd EEE') : safeFormat(date, 'EEE, MMM d');
              return (
                <div key={date}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium w-16 ${isToday ? 'text-blue-600' : 'text-gray-600'}`}>{dayFmt}</span>
                      {isToday && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">Today</span>}
                    </div>
                    <span className="text-xs font-semibold text-gray-800">{hours > 0 ? fmtH(hours) : '—'}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${hours >= 8 ? 'bg-green-500' : hours > 0 ? 'bg-blue-500' : 'bg-transparent'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {de.length > 0 && period !== 'month' && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {de.map((e, idx) => (
                        <span key={idx} className="text-[11px] text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">
                          {e.projectName || '—'} · {fmtH(e.hours)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Per-project breakdown */}
        <Card className="lg:col-span-2 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <TrendingUp size={15} className="text-blue-500" /> By Project
            </h3>
            {byProject.length > 0 && (
              <span className="text-[11px] text-gray-400">{byProject.length} project{byProject.length !== 1 ? 's' : ''}</span>
            )}
          </div>
          {byProject.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No entries for this period</p>
          ) : (
            <div className="overflow-y-auto pr-1" style={{ maxHeight: '420px' }}>
              <div className="space-y-3">
                {byProject.map((p) => {
                  const pct = maxProjHours > 0 ? (p.total / maxProjHours) * 100 : 0;
                  const billPct = p.total > 0 ? Math.round((p.billable / p.total) * 100) : 0;
                  return (
                    <div key={p.name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-700 truncate max-w-[140px]" title={p.name}>
                          {p.name || 'Unknown'}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-400">{billPct}% billable</span>
                          <span className="text-xs font-semibold text-gray-800">{Math.round(p.total * 10) / 10}h</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">{p.count} entr{p.count === 1 ? 'y' : 'ies'}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Billable ratio summary */}
          {totalHours > 0 && (
            <div className="mt-5 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                <span>Billable ratio</span>
                <span className="font-semibold text-gray-700">{Math.round((billableHours / totalHours) * 100)}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: `${(billableHours / totalHours) * 100}%` }} />
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Overall: Analytics charts */}
      {period === 'overall' && entries.length > 0 && (
        <div className="space-y-5">
          {/* Monthly hours trend */}
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <TrendingUp size={15} className="text-blue-500" /> Monthly Hours Trend
            </h3>
            <p className="text-xs text-gray-400 mb-4">Total vs billable hours per month across all time</p>
            {monthlyTrend.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyTrend} barCategoryGap="35%" barGap={2}>
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} unit="h" width={36} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                    formatter={(val: number, name: string) => [`${val}h`, name === 'hours' ? 'Total' : 'Billable']}
                    labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                  />
                  <Legend
                    formatter={(val) => <span style={{ fontSize: 11, color: '#6b7280' }}>{val === 'hours' ? 'Total' : 'Billable'}</span>}
                    iconSize={8}
                    iconType="circle"
                  />
                  <Bar dataKey="hours"    name="hours"    fill="#bfdbfe" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="billable" name="billable" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Entry status breakdown */}
            <Card>
              <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
                <Hash size={15} className="text-indigo-500" /> Entry Status Breakdown
              </h3>
              <p className="text-xs text-gray-400 mb-4">How your {entryCount} time entr{entryCount === 1 ? 'y has' : 'ies have'} been processed</p>
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie
                      data={statusBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={72}
                      dataKey="value"
                      strokeWidth={2}
                    >
                      {statusBreakdown.map((s, i) => (
                        <Cell key={i} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                      formatter={(val: number) => [val, 'entries']}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2.5">
                  {statusBreakdown.map((s) => (
                    <div key={s.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                        <span className="text-xs text-gray-600">{s.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-semibold text-gray-800">{s.value}</span>
                        <span className="text-[10px] text-gray-400 ml-1">
                          ({Math.round((s.value / entryCount) * 100)}%)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Consistency & summary metrics */}
            <Card>
              <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <CalendarDays size={15} className="text-purple-500" /> Productivity Insights
              </h3>
              <div className="space-y-4">
                {/* Avg hours per active day */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-gray-500">Avg hours / active day</span>
                    <span className="text-sm font-semibold text-gray-800">
                      {daysLogged > 0 ? `${Math.round((totalHours / daysLogged) * 10) / 10}h` : '—'}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full"
                      style={{ width: `${daysLogged > 0 ? Math.min((totalHours / daysLogged / 8) * 100, 100) : 0}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">Target: 8h/day</p>
                </div>

                {/* Avg entries per active day */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-gray-500">Avg entries / active day</span>
                    <span className="text-sm font-semibold text-gray-800">
                      {daysLogged > 0 ? Math.round((entryCount / daysLogged) * 10) / 10 : '—'}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${daysLogged > 0 ? Math.min((entryCount / daysLogged / 5) * 100, 100) : 0}%` }}
                    />
                  </div>
                </div>

                {/* Best month */}
                {monthlyTrend.length > 0 && (() => {
                  const best = [...monthlyTrend].sort((a, b) => b.hours - a.hours)[0];
                  return (
                    <div className="flex items-center justify-between py-2 border-t border-gray-100">
                      <div>
                        <p className="text-xs text-gray-500">Best month</p>
                        <p className="text-sm font-semibold text-gray-800 mt-0.5">{best.label}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-purple-600">{best.hours}h</p>
                        <p className="text-[10px] text-gray-400">{best.count} entr{best.count === 1 ? 'y' : 'ies'}</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Billable ratio bar */}
                {totalHours > 0 && (
                  <div className="py-2 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-gray-500">Overall billable ratio</span>
                      <span className="text-sm font-semibold text-green-600">
                        {Math.round((billableHours / totalHours) * 100)}%
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
                      <div className="h-full bg-green-500 rounded-l-full" style={{ width: `${(billableHours / totalHours) * 100}%` }} />
                      <div className="h-full bg-amber-400 rounded-r-full" style={{ width: `${((totalHours - billableHours) / totalHours) * 100}%` }} />
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="flex items-center gap-1 text-[10px] text-gray-500">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        {Math.round(billableHours * 10) / 10}h billable
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-gray-500">
                        <span className="w-2 h-2 rounded-full bg-amber-400" />
                        {Math.round(nonBillableHours * 10) / 10}h non-billable
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Org Time Tab (full org-wide view for PROJECT_DATA_VIEW_ALL / TENANT_ADMIN / SUPER_ADMIN) ──

const ORG_DATE_PRESETS = [
  { key: 'today',     label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week',      label: 'This Week' },
  { key: 'month',     label: 'This Month' },
  { key: 'custom',    label: 'Custom' },
] as const;
type OrgDatePreset = typeof ORG_DATE_PRESETS[number]['key'];

const OrgTimeTab = () => {
  const { t } = useI18n();

  const [subTab,         setSubTab]         = useState<'analytics' | 'entries'>('analytics');
  const [datePreset, setDatePreset] = useState<OrgDatePreset>('week');
  const [customFrom, setCustomFrom] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [customTo,   setCustomTo]   = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [filterProject,  setFilterProject]  = useState('');
  const [filterUser,     setFilterUser]     = useState('');
  const [filterTeam,     setFilterTeam]     = useState('');
  const [filterBillable, setFilterBillable] = useState<'' | 'true' | 'false'>('');
  const [filterStatus,   setFilterStatus]   = useState('');
  const [memberSearch,   setMemberSearch]   = useState('');
  const [memberDropOpen, setMemberDropOpen] = useState(false);
  const [teamSearch,     setTeamSearch]     = useState('');
  const [teamDropOpen,   setTeamDropOpen]   = useState(false);
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const memberDropRef = useRef<HTMLDivElement>(null);
  const teamDropRef   = useRef<HTMLDivElement>(null);

  const { data: allProjects = [] } = useProjects();
  const { data: teamPeers   = [] } = useTeamPeers();
  const { data: allTeams    = [] } = useTeams();

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (memberDropRef.current && !memberDropRef.current.contains(e.target as Node)) setMemberDropOpen(false);
      if (teamDropRef.current   && !teamDropRef.current.contains(e.target as Node))   setTeamDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Compute date range from preset
  const { dateFrom, dateTo } = useMemo(() => {
    const now = new Date();
    if (datePreset === 'today')     { const d = format(now, 'yyyy-MM-dd'); return { dateFrom: d, dateTo: d }; }
    if (datePreset === 'yesterday') { const d = format(subDays(now, 1), 'yyyy-MM-dd'); return { dateFrom: d, dateTo: d }; }
    if (datePreset === 'week')  return { dateFrom: format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'), dateTo: format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd') };
    if (datePreset === 'month') return { dateFrom: format(startOfMonth(now), 'yyyy-MM-dd'), dateTo: format(endOfMonth(now), 'yyyy-MM-dd') };
    return { dateFrom: customFrom, dateTo: customTo };
  }, [datePreset, customFrom, customTo]);

  const dateError = useMemo(() =>
    datePreset === 'custom' && customFrom && customTo && customFrom > customTo
      ? 'Start date must be before end date' : '',
    [datePreset, customFrom, customTo]);

  useEffect(() => { setPage(1); }, [dateFrom, dateTo, filterProject, filterUser, filterTeam, filterBillable, filterStatus, pageSize]);

  // The org Team filter is a client-side roster lookup turned into a member-id
  // list the server filters on — so both analytics and the entries list scope
  // and paginate server-side instead of capping rows client-side.
  const teamUserIdsCsv = useMemo(() => {
    if (!filterTeam) return '';
    const team = (allTeams as Array<{ id: string; members: Array<{ id: string }> }>).find(t => t.id === filterTeam);
    return (team?.members ?? []).map(m => m.id).join(',');
  }, [filterTeam, allTeams]);

  // Analytics: server-side ZCQL GROUP BY aggregation over the FULL date range.
  // Every active filter is sent as a query param so the cards, charts and the
  // entries list all reflect the same combined result (the "standard" behaviour
  // — selecting one filter narrows the rest rather than producing stale totals).
  const orgParams = useMemo(() => {
    if (dateError) return undefined;
    const p: Record<string, string> = {};
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo)   p.date_to   = dateTo;
    if (filterProject)  p.project_id  = filterProject;
    if (filterUser)     p.user_id     = filterUser;
    if (teamUserIdsCsv) p.user_ids    = teamUserIdsCsv;
    if (filterBillable) p.is_billable = filterBillable;
    if (filterStatus)   p.status      = filterStatus;
    return p;
  }, [dateFrom, dateTo, filterProject, filterUser, teamUserIdsCsv, filterBillable, filterStatus, dateError]);

  const { data: org, isLoading: analyticsLoading } = useOrgAnalytics(orgParams, subTab === 'analytics' && !!orgParams);

  // Entries tab: server-side pagination with the same filter set.
  const entriesParams = useMemo(() => {
    if (dateError) return undefined;
    const p: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo)   p.date_to   = dateTo;
    if (filterProject)  p.project_id  = filterProject;
    if (filterUser)     p.user_id     = filterUser;
    if (teamUserIdsCsv) p.user_ids    = teamUserIdsCsv;
    if (filterStatus)   p.status      = filterStatus;
    if (filterBillable) p.is_billable = filterBillable;
    return p;
  }, [dateFrom, dateTo, filterProject, filterUser, teamUserIdsCsv, filterStatus, filterBillable, page, pageSize, dateError]);

  const { data: entriesResult, isLoading: entriesLoading } = useTimeEntries(
    subTab === 'entries' ? (entriesParams ?? undefined) : undefined,
  );

  const pageEntries = useMemo(() => (entriesResult?.data ?? []) as TimeEntry[], [entriesResult]);
  const pagination  = entriesResult?.pagination ?? null;
  const totalCount  = pagination?.total ?? pageEntries.length;
  const totalPages  = Math.max(1, pagination?.totalPages ?? (Math.ceil(pageEntries.length / pageSize) || 1));

  // ── Analytics aggregates (from the server GROUP BY payload) ─────────────────
  const totalEntries     = org?.summary.total_entries ?? 0;
  const totalHours       = org?.summary.total_hours ?? 0;
  const billableHours    = org?.summary.billable_hours ?? 0;
  const nonBillableHours = org?.summary.non_billable_hours ?? Math.round((totalHours - billableHours) * 100) / 100;
  const uniqueMembers    = org?.by_user.length ?? 0;
  const uniqueProjects   = org?.by_project.length ?? 0;
  const activeDays       = org?.by_day.length ?? 0;
  const billableRatioPct = totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0;
  const avgHoursPerDay    = activeDays    > 0 ? Math.round((totalHours / activeDays)    * 10) / 10 : 0;
  const avgHoursPerMember = uniqueMembers > 0 ? Math.round((totalHours / uniqueMembers) * 10) / 10 : 0;

  const byUser = useMemo(() => (org?.by_user ?? []).map(u => ({
    userId:      u.user_id,
    name:        u.user_name,
    avatarUrl:   u.user_avatar_url,
    total:       u.total_hours,
    billable:    u.billable_hours,
    nonBillable: Math.round((u.total_hours - u.billable_hours) * 100) / 100,
    count:       u.entries_count,
  })), [org]);

  const byProject = useMemo(() => (org?.by_project ?? []).map(p => ({
    name:        p.project_name,
    total:       p.total_hours,
    billable:    p.billable_hours,
    count:       p.entries_count,
    memberCount: p.member_count,
  })), [org]);

  const byTask = useMemo(() => (org?.by_task ?? []).map(t => ({
    name:        t.task_name,
    total:       t.total_hours,
    billable:    t.billable_hours,
    count:       t.entries_count,
    projectName: t.project_name,
  })), [org]);

  const dailyData = useMemo(() => (org?.by_day ?? []).map(d => ({
    date:     d.date,
    total:    Math.round(d.total_hours * 10) / 10,
    billable: Math.round(d.billable_hours * 10) / 10,
    count:    d.entries_count,
    label:    safeFormat(d.date, 'MMM d'),
  })), [org]);

  // Day-of-week breakdown derived from the daily series (Mon=0 … Sun=6)
  const byDayOfWeek = useMemo(() => {
    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const totals = [0, 0, 0, 0, 0, 0, 0];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (const d of org?.by_day ?? []) {
      const dt = parseISO(d.date);
      if (!isValid(dt)) continue;
      const dow = (dt.getDay() + 6) % 7;
      totals[dow] += d.total_hours;
      counts[dow] += d.entries_count;
    }
    return DAYS.map((name, i) => ({
      name,
      total: Math.round(totals[i] * 10) / 10,
      avg:   counts[i] > 0 ? Math.round((totals[i] / counts[i]) * 10) / 10 : 0,
      count: counts[i],
    }));
  }, [org]);

  const statusBreakdown = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of org?.by_status ?? []) c[s.status] = s.entries_count;
    return [
      { name: 'Approved',  value: c['APPROVED']  ?? 0, color: '#22c55e' },
      { name: 'Submitted', value: c['SUBMITTED'] ?? 0, color: '#3b82f6' },
      { name: 'Draft',     value: c['DRAFT']     ?? 0, color: '#94a3b8' },
      { name: 'Rejected',  value: c['REJECTED']  ?? 0, color: '#ef4444' },
    ].filter(s => s.value > 0);
  }, [org]);

  const maxTaskHours = useMemo(() => Math.max(1, ...byTask.map(t => t.total)),    [byTask]);
  const maxUserHours = useMemo(() => Math.max(1, ...byUser.map(u => u.total)),    [byUser]);
  const maxProjHours = useMemo(() => Math.max(1, ...byProject.map(p => p.total)), [byProject]);

  // userId → { teamId, teamName } lookup built from org team roster
  const teamByUser = useMemo(() => {
    const m = new Map<string, { teamId: string; teamName: string }>();
    for (const team of allTeams as Array<{ id: string; name: string; members: Array<{ id: string }> }>) {
      for (const member of team.members ?? []) {
        if (!m.has(member.id)) m.set(member.id, { teamId: team.id, teamName: team.name });
      }
    }
    return m;
  }, [allTeams]);

  // Team comparison derived from per-user hours + the team roster
  const byTeam = useMemo(() => {
    const m = new Map<string, { teamId: string; teamName: string; total: number; billable: number; nonBillable: number; count: number; memberSet: Set<string> }>();
    for (const u of byUser) {
      const info = teamByUser.get(u.userId);
      const key  = info?.teamId   ?? '__none__';
      const name = info?.teamName ?? 'No Team';
      if (!m.has(key)) m.set(key, { teamId: key, teamName: name, total: 0, billable: 0, nonBillable: 0, count: 0, memberSet: new Set() });
      const rec = m.get(key)!;
      rec.total       += u.total;
      rec.billable    += u.billable;
      rec.nonBillable += u.nonBillable;
      rec.count       += u.count;
      if (u.userId) rec.memberSet.add(u.userId);
    }
    return Array.from(m.values())
      .map(r => ({ ...r, billable: Math.round(r.billable * 10) / 10, nonBillable: Math.round(r.nonBillable * 10) / 10, total: Math.round(r.total * 10) / 10, memberCount: r.memberSet.size }))
      .sort((a, b) => b.total - a.total);
  }, [byUser, teamByUser]);

  const maxTeamHours = useMemo(() => Math.max(1, ...byTeam.map(t => t.total)), [byTeam]);

  const hasAnyFilter = !!(filterProject || filterUser || filterTeam || filterBillable || filterStatus);
  const clearFilters = () => { setFilterProject(''); setFilterUser(''); setFilterTeam(''); setFilterBillable(''); setFilterStatus(''); };
  const selectedTeam = filterTeam
    ? (allTeams as Array<{ id: string; name: string; description?: string; memberCount?: number; leadName?: string }>).find(t => t.id === filterTeam)
    : null;

  const Pagination = () => (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-gray-100 bg-gray-50">
      <div className="flex items-center gap-4 text-xs text-gray-600">
        <span>Showing <strong>{((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, totalCount)}</strong> of <strong>{totalCount.toLocaleString()}</strong> entries</span>
        <span className="flex items-center gap-1.5">
          <label className="text-gray-500">Rows:</label>
          <select value={pageSize} onChange={e => setPageSize(parseInt(e.target.value, 10) || 20)} className="text-xs border border-gray-300 rounded px-1.5 py-0.5 bg-white">
            {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button disabled={page === 1} onClick={() => setPage(1)} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">«</button>
        <button disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">←</button>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
          .reduce<(number | '...')[]>((acc, p, i, arr) => {
            if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('...');
            acc.push(p); return acc;
          }, [])
          .map((p, i) => p === '...' ? (
            <span key={`oe-${i}`} className="px-1 text-gray-400 text-xs">…</span>
          ) : (
            <button key={p} onClick={() => setPage(p as number)} className={`min-w-[28px] px-2 py-1 text-xs border rounded ${page === p ? 'bg-blue-600 text-white border-blue-600 font-semibold' : 'border-gray-200 hover:bg-white'}`}>{p}</button>
          ))}
        <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">→</button>
        <button disabled={page >= totalPages} onClick={() => setPage(totalPages)} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">»</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">

      {/* ── Summary line ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3 min-h-[28px]">
        {analyticsLoading && <Loader2 size={14} className="animate-spin text-gray-400" />}
        {!analyticsLoading && totalEntries > 0 && (
          <span className="text-xs text-gray-500">{totalEntries.toLocaleString()} entries · <strong>{fmtH(totalHours)}</strong> · {billableRatioPct}% billable</span>
        )}
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <Card>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {ORG_DATE_PRESETS.map(({ key, label }) => (
            <button key={key} type="button" onClick={() => setDatePreset(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                datePreset === key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}>
              {label}
            </button>
          ))}
          {hasAnyFilter && (
            <button type="button" onClick={clearFilters}
              className="ml-auto px-3 py-1.5 text-xs font-medium rounded-full border border-red-200 text-red-600 bg-white hover:bg-red-50 transition-colors flex items-center gap-1">
              <X size={11} /> Clear filters
            </button>
          )}
        </div>

        <div className="grid gap-3 grid-cols-2 md:grid-cols-6">
          {datePreset === 'custom' ? (
            <>
              <div>
                <label className="form-label">From</label>
                <input type="date" className={`form-input ${dateError ? 'border-red-400' : ''}`} value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
              </div>
              <div>
                <label className="form-label">To</label>
                <input type="date" className={`form-input ${dateError ? 'border-red-400' : ''}`} value={customTo} onChange={e => setCustomTo(e.target.value)} />
              </div>
            </>
          ) : (
            <div className="col-span-2 flex items-center">
              <span className="text-sm text-gray-600 font-medium">
                {safeFormat(dateFrom, 'MMM d, yyyy')} → {safeFormat(dateTo, 'MMM d, yyyy')}
              </span>
            </div>
          )}
          <div>
            <label className="form-label">Project</label>
            <select className="form-select" value={filterProject} onChange={e => { setFilterProject(e.target.value); setPage(1); }}>
              <option value="">All Projects</option>
              {(allProjects as Array<{ id: string; name: string }>).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div ref={memberDropRef} className="relative">
            <label className="form-label">Member</label>
            <button
              type="button"
              onClick={() => { setMemberDropOpen(o => !o); setMemberSearch(''); }}
              className="form-select w-full text-left flex items-center justify-between gap-2"
            >
              <span className={filterUser ? 'text-gray-900' : 'text-gray-400'}>
                {filterUser
                  ? (teamPeers as Array<{ id: string; name: string }>).find(p => p.id === filterUser)?.name ?? 'Member'
                  : 'All Members'}
              </span>
              <ChevronRight size={13} className={`text-gray-400 transition-transform ${memberDropOpen ? 'rotate-90' : ''}`} />
            </button>
            {memberDropOpen && (
              <div className="absolute z-50 mt-1 w-full min-w-[200px] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                <div className="p-2 border-b border-gray-100">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search members…"
                    value={memberSearch}
                    onChange={e => setMemberSearch(e.target.value)}
                    className="w-full text-sm px-2.5 py-1.5 border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                  />
                </div>
                <ul className="max-h-52 overflow-y-auto py-1">
                  {[{ id: '', name: 'All Members' }, ...(teamPeers as Array<{ id: string; name: string }>)]
                    .filter(p => !memberSearch || p.name.toLowerCase().includes(memberSearch.toLowerCase()))
                    .map(p => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => { setFilterUser(p.id); setPage(1); setMemberDropOpen(false); setMemberSearch(''); }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors flex items-center gap-2 ${filterUser === p.id ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700'}`}
                        >
                          {p.id && <UserAvatar name={p.name} size="xs" />}
                          {p.name}
                        </button>
                      </li>
                    ))}
                </ul>
                {(teamPeers as Array<{ id: string; name: string }>).filter(p => memberSearch && p.name.toLowerCase().includes(memberSearch.toLowerCase())).length === 0 && memberSearch && (
                  <p className="text-xs text-gray-400 text-center py-3">No members match "{memberSearch}"</p>
                )}
              </div>
            )}
          </div>

          {/* Team searchable dropdown */}
          <div ref={teamDropRef} className="relative">
            <label className="form-label">Team</label>
            <button
              type="button"
              onClick={() => { setTeamDropOpen(o => !o); setTeamSearch(''); }}
              className={`form-select w-full text-left flex items-center justify-between gap-2 ${filterTeam ? 'border-blue-400 ring-1 ring-blue-100' : ''}`}
            >
              <span className={filterTeam ? 'text-gray-900 font-medium' : 'text-gray-400'}>
                {filterTeam
                  ? (allTeams as Array<{ id: string; name: string }>).find(t => t.id === filterTeam)?.name ?? 'Team'
                  : 'All Teams'}
              </span>
              <ChevronRight size={13} className={`text-gray-400 transition-transform ${teamDropOpen ? 'rotate-90' : ''}`} />
            </button>
            {teamDropOpen && (
              <div className="absolute z-50 mt-1 w-full min-w-[200px] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                <div className="p-2 border-b border-gray-100">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search teams…"
                    value={teamSearch}
                    onChange={e => setTeamSearch(e.target.value)}
                    className="w-full text-sm px-2.5 py-1.5 border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                  />
                </div>
                <ul className="max-h-52 overflow-y-auto py-1">
                  {[{ id: '', name: 'All Teams' }, ...(allTeams as Array<{ id: string; name: string; memberCount?: number }>)]
                    .filter(t => !teamSearch || t.name.toLowerCase().includes(teamSearch.toLowerCase()))
                    .map(t => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => { setFilterTeam(t.id); setPage(1); setTeamDropOpen(false); setTeamSearch(''); }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors flex items-center justify-between ${filterTeam === t.id ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700'}`}
                        >
                          <span>{t.name}</span>
                          {t.id && t.memberCount !== undefined && (
                            <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full shrink-0">{t.memberCount}m</span>
                          )}
                        </button>
                      </li>
                    ))}
                </ul>
                {(allTeams as Array<{ name: string }>).filter(t => teamSearch && t.name.toLowerCase().includes(teamSearch.toLowerCase())).length === 0 && teamSearch && (
                  <p className="text-xs text-gray-400 text-center py-3">No teams match "{teamSearch}"</p>
                )}
              </div>
            )}
          </div>

          {/* Billable toggle */}
          <div>
            <label className="form-label">Billable</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden" style={{ height: '36px' }}>
              {([['', 'All'], ['true', 'Bill.'], ['false', 'Non-bill.']] as [string, string][]).map(([val, lbl]) => (
                <button key={val} type="button" onClick={() => { setFilterBillable(val as any); setPage(1); }}
                  className={`flex-1 text-xs font-medium transition-colors border-r last:border-r-0 border-gray-200 ${filterBillable === val ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Date validation error */}
        {dateError && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle size={12} /> {dateError}
          </div>
        )}
      </Card>

      {/* ── Sub-tab switcher ───────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {(['analytics', 'entries'] as const).map(st => (
          <button key={st} onClick={() => setSubTab(st)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${subTab === st ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            {st === 'analytics' ? 'Analytics' : 'All Entries'}
          </button>
        ))}
      </div>

      {/* ── Analytics sub-tab ─────────────────────────────────────────────── */}
      {subTab === 'analytics' && (
        analyticsLoading ? <PageSkeleton /> : dateError ? (
          <div className="flex items-center justify-center h-40 text-sm text-red-500 gap-2"><AlertCircle size={16} /> {dateError}</div>
        ) : (
          <div className="space-y-5">
            {/* Team context banner */}
            {selectedTeam && (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Users size={16} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-blue-900">{selectedTeam.name}</p>
                    <p className="text-xs text-blue-600">
                      {selectedTeam.memberCount ?? '?'} member{(selectedTeam.memberCount ?? 0) !== 1 ? 's' : ''}
                      {selectedTeam.leadName ? ` · Lead: ${selectedTeam.leadName}` : ''}
                      {selectedTeam.description ? ` · ${selectedTeam.description}` : ''}
                    </p>
                  </div>
                </div>
                <button type="button" onClick={() => setFilterTeam('')}
                  className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-100 transition-colors">
                  <X size={11} /> Clear
                </button>
              </div>
            )}

            {/* Summary stat cards — 8 cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total Hours"    value={`${Math.round(totalHours * 10) / 10}h`}       icon={<Clock size={20} />}        color="blue"   />
              <StatCard label="Billable Hours" value={`${Math.round(billableHours * 10) / 10}h`}    icon={<DollarSign size={20} />}   color="green"  />
              <StatCard label="Non-Billable"   value={`${Math.round(nonBillableHours * 10) / 10}h`} icon={<Clock size={20} />}        color="amber"  />
              <StatCard label="Billable %"     value={`${billableRatioPct}%`}                       icon={<Award size={20} />}        color="green"  />
              <StatCard label="Active Members" value={uniqueMembers}         icon={<Users size={20} />}        color="purple" />
              <StatCard label="Projects"      value={uniqueProjects}         icon={<TrendingUp size={20} />}   color="blue"   />
              <StatCard label="Avg h/Day"     value={`${avgHoursPerDay}h`}  icon={<CalendarDays size={20} />} color="purple" />
              <StatCard label="Avg h/Member"  value={`${avgHoursPerMember}h`} icon={<UserIcon size={20} />}   color="blue"   />
            </div>

            {totalEntries === 0 ? (
              <EmptyState icon={<Clock size={36} />} title="No time entries" description="No entries found for the selected period and filters." />
            ) : (
              <>
                {/* Daily trend — Area chart with gradient fills */}
                <Card>
                  <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
                    <TrendingUp size={15} className="text-blue-500" /> Daily Hours Trend
                  </h3>
                  <p className="text-xs text-gray-400 mb-4">Total vs billable hours per day</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={dailyData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.18} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradBillable" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.22} />
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} unit="h" width={30} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                        formatter={(val: number, name: string) => [`${val}h`, name === 'total' ? 'Total' : 'Billable']} />
                      <Legend formatter={val => <span style={{ fontSize: 11, color: '#6b7280' }}>{val === 'total' ? 'Total' : 'Billable'}</span>} iconSize={8} iconType="circle" />
                      <Area type="monotone" dataKey="total"    name="total"    stroke="#3b82f6" strokeWidth={2} fill="url(#gradTotal)"    dot={false} activeDot={{ r: 4 }} />
                      <Area type="monotone" dataKey="billable" name="billable" stroke="#22c55e" strokeWidth={2} fill="url(#gradBillable)" dot={false} activeDot={{ r: 4 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>

                {/* Day-of-week + Top tasks */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <Card>
                    <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
                      <CalendarDays size={15} className="text-indigo-500" /> Hours by Day of Week
                    </h3>
                    <p className="text-xs text-gray-400 mb-4">Average hours logged per weekday</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={byDayOfWeek} barCategoryGap="25%">
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} unit="h" width={28} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                          formatter={(val: number, _name: string, payload: any) => {
                            const d = payload?.payload;
                            return [`${val}h avg · ${d?.count ?? 0} entries`, 'Hours'];
                          }} />
                        <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                          {byDayOfWeek.map((_entry, idx) => (
                            <Cell key={idx} fill={idx >= 5 ? '#f59e0b' : '#6366f1'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="flex gap-4 mt-2 text-[10px] text-gray-400">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />Weekday</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Weekend</span>
                    </div>
                  </Card>

                  <Card>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <Award size={15} className="text-amber-500" /> Top Tasks
                      </h3>
                      <span className="text-[11px] text-gray-400">by hours logged</span>
                    </div>
                    {byTask.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-6">No task data available</p>
                    ) : (
                      <div className="space-y-2.5 overflow-y-auto pr-1" style={{ maxHeight: 320 }}>
                        {byTask.slice(0, 8).map((t, idx) => {
                          const billPct = t.total > 0 ? Math.round((t.billable / t.total) * 100) : 0;
                          const barPct  = maxTaskHours > 0 ? (t.total / maxTaskHours) * 100 : 0;
                          return (
                            <div key={idx}>
                              <div className="flex items-center justify-between mb-1">
                                <div className="min-w-0 flex-1 mr-2">
                                  <span className="text-xs font-medium text-gray-700 truncate block">{t.name}</span>
                                  {t.projectName && <span className="text-[10px] text-gray-400 truncate block">{t.projectName}</span>}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[10px] text-gray-400">{billPct}% bill.</span>
                                  <span className="text-xs font-semibold text-gray-800">{t.total}h</span>
                                </div>
                              </div>
                              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden flex" style={{ width: `${barPct}%` }}>
                                <div className="h-full bg-green-500" style={{ width: `${billPct}%` }} />
                                <div className="h-full bg-amber-400" style={{ width: `${100 - billPct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Top members by hours — split billable/non-billable bar */}
                  <Card>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <Users size={15} className="text-indigo-500" /> Members by Hours
                      </h3>
                      <span className="text-[11px] text-gray-400">{byUser.length} member{byUser.length !== 1 ? 's' : ''}</span>
                    </div>
                    {byUser.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-6">No member data</p>
                    ) : (
                      <div className="overflow-y-auto space-y-3 pr-1" style={{ maxHeight: 360 }}>
                        {byUser.map(u => {
                          const barPct  = maxUserHours > 0 ? (u.total / maxUserHours) * 100 : 0;
                          const billPct = u.total > 0 ? Math.round((u.billable / u.total) * 100) : 0;
                          return (
                            <div key={u.name}>
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2 min-w-0">
                                  <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size="xs" />
                                  <span className="text-xs font-medium text-gray-700 truncate max-w-[140px]">{u.name}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[10px] text-gray-400">{billPct}% billable</span>
                                  <span className="text-xs font-semibold text-gray-800">{Math.round(u.total * 10) / 10}h</span>
                                </div>
                              </div>
                              {/* Split billable / non-billable progress bar */}
                              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden flex" style={{ width: `${barPct}%` }}>
                                {u.total > 0 && (
                                  <>
                                    <div className="h-full bg-green-500" style={{ width: `${(u.billable / u.total) * 100}%` }} />
                                    <div className="h-full bg-amber-400" style={{ width: `${(u.nonBillable / u.total) * 100}%` }} />
                                  </>
                                )}
                              </div>
                              <p className="text-[10px] text-gray-400 mt-0.5">{u.count} entr{u.count === 1 ? 'y' : 'ies'}</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>

                  {/* Projects */}
                  <Card>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <TrendingUp size={15} className="text-blue-500" /> Projects
                      </h3>
                      <span className="text-[11px] text-gray-400">{byProject.length} project{byProject.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="overflow-y-auto space-y-3 pr-1" style={{ maxHeight: 360 }}>
                      {byProject.map(p => {
                        const pct     = maxProjHours > 0 ? (p.total / maxProjHours) * 100 : 0;
                        const billPct = p.total > 0 ? Math.round((p.billable / p.total) * 100) : 0;
                        return (
                          <div key={p.name}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-gray-700 truncate max-w-[160px]">{p.name || 'Unknown'}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-gray-400">{p.memberCount}m · {billPct}% bill.</span>
                                <span className="text-xs font-semibold text-gray-800">{Math.round(p.total * 10) / 10}h</span>
                              </div>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <p className="text-[10px] text-gray-400 mt-0.5">{p.count} entr{p.count === 1 ? 'y' : 'ies'}</p>
                          </div>
                        );
                      })}
                    </div>
                    {/* Billable ratio summary */}
                    {totalHours > 0 && (
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                          <span>Org billable ratio</span>
                          <span className="font-semibold text-gray-700">{Math.round((billableHours / totalHours) * 100)}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
                          <div className="h-full bg-green-500 rounded-l-full" style={{ width: `${(billableHours / totalHours) * 100}%` }} />
                          <div className="h-full bg-amber-400 rounded-r-full" style={{ width: `${((totalHours - billableHours) / totalHours) * 100}%` }} />
                        </div>
                        <div className="flex gap-4 mt-1.5 text-[10px] text-gray-500">
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />{Math.round(billableHours * 10) / 10}h billable</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />{Math.round(nonBillableHours * 10) / 10}h non-billable</span>
                        </div>
                      </div>
                    )}
                  </Card>
                </div>

                {/* Team analytics — shown when no specific team is selected */}
                {!filterTeam && byTeam.length > 0 && (
                  <Card>
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <Users size={15} className="text-blue-500" /> Team Comparison
                      </h3>
                      <span className="text-[11px] text-gray-400">{byTeam.length} team{byTeam.length !== 1 ? 's' : ''}</span>
                    </div>
                    <p className="text-xs text-gray-400 mb-5">Billable vs non-billable hours per team for the selected period</p>

                    {/* Stacked bar chart */}
                    <ResponsiveContainer width="100%" height={Math.max(160, byTeam.length * 44)}>
                      <BarChart data={byTeam.map(t => ({ name: t.teamName, billable: t.billable, nonBillable: t.nonBillable, total: t.total }))}
                        layout="vertical" barCategoryGap="30%" barGap={0} margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
                        <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} unit="h" />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} width={100} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                          formatter={(val: number, name: string) => [`${val}h`, name === 'billable' ? 'Billable' : 'Non-Billable']} />
                        <Legend formatter={val => <span style={{ fontSize: 11, color: '#6b7280' }}>{val === 'billable' ? 'Billable' : 'Non-Billable'}</span>} iconSize={8} iconType="circle" />
                        <Bar dataKey="billable"    name="billable"    stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="nonBillable" name="nonBillable" stackId="a" fill="#f59e0b" radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>

                    {/* Team rows with billable ratio */}
                    <div className="mt-5 space-y-3 border-t border-gray-100 pt-4">
                      {byTeam.map(team => {
                        const billPct = team.total > 0 ? Math.round((team.billable / team.total) * 100) : 0;
                        const widthPct = maxTeamHours > 0 ? (team.total / maxTeamHours) * 100 : 0;
                        return (
                          <div key={team.teamId}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-gray-800 truncate max-w-[180px]">{team.teamName}</span>
                                <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{team.memberCount}m</span>
                              </div>
                              <div className="flex items-center gap-3 text-xs">
                                <span className="text-green-600 font-medium">{team.billable}h</span>
                                <span className="text-amber-500 font-medium">{team.nonBillable}h</span>
                                <span className="text-gray-500 w-14 text-right">{billPct}% bill.</span>
                              </div>
                            </div>
                            {/* Stacked progress bar */}
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex" style={{ width: `${widthPct}%` }}>
                              {team.total > 0 && (
                                <>
                                  <div className="h-full bg-green-500 rounded-l-full" style={{ width: `${(team.billable / team.total) * 100}%` }} />
                                  <div className="h-full bg-amber-400 rounded-r-full" style={{ width: `${(team.nonBillable / team.total) * 100}%` }} />
                                </>
                              )}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-0.5">{team.count} entr{team.count === 1 ? 'y' : 'ies'} · {team.total}h total</p>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                )}

                {/* Status breakdown */}
                {statusBreakdown.length > 0 && (
                  <Card>
                    <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
                      <Hash size={15} className="text-indigo-500" /> Entry Status Breakdown
                    </h3>
                    <p className="text-xs text-gray-400 mb-4">Across all {totalEntries.toLocaleString()} entries for this period</p>
                    <div className="flex items-center gap-8">
                      <ResponsiveContainer width={160} height={160}>
                        <PieChart>
                          <Pie data={statusBreakdown} cx="50%" cy="50%" innerRadius={46} outerRadius={68} dataKey="value" strokeWidth={2}>
                            {statusBreakdown.map((s, i) => <Cell key={i} fill={s.color} />)}
                          </Pie>
                          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} formatter={(val: number) => [val.toLocaleString(), 'entries']} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex-1 space-y-3">
                        {statusBreakdown.map(s => (
                          <div key={s.name} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                              <span className="text-sm text-gray-600">{s.name}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-semibold text-gray-800">{s.value.toLocaleString()}</span>
                              <span className="text-[10px] text-gray-400 ml-1.5">({totalEntries > 0 ? Math.round((s.value / totalEntries) * 100) : 0}%)</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>
                )}
              </>
            )}
          </div>
        )
      )}

      {/* ── Entries sub-tab ────────────────────────────────────────────────── */}
      {subTab === 'entries' && (
        <div className="space-y-3">
          {/* Status filter (entries-only) */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500">Status:</label>
            {['', 'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'].map(s => (
              <button key={s} type="button" onClick={() => { setFilterStatus(s); setPage(1); }}
                className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                  filterStatus === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}>
                {s || 'All'}
              </button>
            ))}
          </div>

          <Card padding={false}>
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Org Time Entries</h3>
              {pagination && (
                <span className="text-xs text-gray-500">{totalCount.toLocaleString()} total entr{totalCount !== 1 ? 'ies' : 'y'}</span>
              )}
            </div>

            {entriesLoading ? (
              <SkeletonTable rows={10} />
            ) : pageEntries.length === 0 ? (
              <EmptyState icon={<Clock size={32} />} title="No entries" description="No time entries match the selected filters." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Date', 'Member', 'Project', 'Task / Description', 'Start', 'End', 'Hours', 'Billable', 'Status'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pageEntries.map(entry => (
                      <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{safeFormat(entry.date, 'MMM d, yyyy')}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {(entry as any).userName ? (
                            <div className="flex items-center gap-2">
                              <UserAvatar name={(entry as any).userName} avatarUrl={(entry as any).userAvatarUrl} size="sm" />
                              <span className="text-sm text-gray-700">{(entry as any).userName}</span>
                            </div>
                          ) : <span className="text-xs text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 max-w-[140px] truncate whitespace-nowrap">{entry.projectName || entry.projectId || '—'}</td>
                        <td className="px-4 py-3 text-sm max-w-xs">
                          {entry.taskName ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium text-gray-900 truncate">{entry.taskName}</span>
                              {entry.description && <span className="text-xs text-gray-500 truncate">{entry.description}</span>}
                            </div>
                          ) : <span className="text-gray-600 truncate block">{entry.description || '—'}</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{entry.startTime ? entry.startTime.slice(0, 5) : <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{entry.endTime   ? entry.endTime.slice(0, 5)   : <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 whitespace-nowrap">{fmtH(entry.hours)}</td>
                        <td className="px-4 py-3 text-center">
                          {entry.isBillable ? <CheckCircle2 size={15} className="text-green-600 mx-auto" /> : <XCircle size={15} className="text-gray-300 mx-auto" />}
                        </td>
                        <td className="px-4 py-3"><Badge variant={statusVariant(entry.status)}>{statusLabel(entry.status)}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {pageEntries.length > 0 && <Pagination />}
          </Card>
        </div>
      )}
    </div>
  );
};

// ── Approvals Tab ─────────────────────────────────────────────────────────────

const ApprovalsTab = () => {
  const { t } = useI18n();
  const { data: approvals = [], isLoading, error } = useTimeApprovals({ status: 'PENDING' });
  const approveTime = useApproveTime();
  const rejectTime = useRejectTime();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [bulkApproving, setBulkApproving] = useState(false);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === (approvals as TimeApproval[]).length) {
      setSelected(new Set());
    } else {
      setSelected(new Set((approvals as TimeApproval[]).map((a) => a.id)));
    }
  };

  const handleApprove = async (id: string) => {
    try { await approveTime.mutateAsync({ id }); } catch { /* noop */ }
  };

  const handleReject = async (notes: string) => {
    if (!rejectTarget) return;
    await rejectTime.mutateAsync({ id: rejectTarget, data: { notes } });
    setRejectTarget(null);
  };

  const handleBulkApprove = async () => {
    setBulkApproving(true);
    try {
      await Promise.all(Array.from(selected).map((id) => approveTime.mutateAsync({ id })));
      setSelected(new Set());
    } finally {
      setBulkApproving(false);
    }
  };

  if (isLoading) return <SkeletonTable rows={5} />;
  if (error) return <Alert type="error" message={(error as Error).message} className="m-5" />;

  return (
    <div className="space-y-4">
      {selected.size > 0 && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <span className="text-sm text-blue-700 font-medium">{selected.size} entr{selected.size === 1 ? 'y' : 'ies'} selected</span>
          <Button
            size="sm"
            icon={<CheckCircle2 size={14} />}
            onClick={handleBulkApprove}
            loading={bulkApproving}
          >
            {t('common.approve')} Selected
          </Button>
        </div>
      )}

      <Card padding={false}>
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Pending Approvals</h3>
        </div>

        {(approvals as TimeApproval[]).length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 size={36} />}
            title="All caught up"
            description="No time entries are awaiting approval."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  {/* DSV-016: text-left aligns the Select-All checkbox with
                      the row checkboxes — by default <th> centers content
                      while <td> left-aligns, causing visible misalignment. */}
                  <th className="pl-4 pr-2 py-3 text-left">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={selected.size === (approvals as TimeApproval[]).length && (approvals as TimeApproval[]).length > 0}
                      onChange={toggleAll}
                    />
                  </th>
                  {['Submitted By', t('timeTracking.form.project'), t('common.description'), t('timeTracking.form.date'), t('timeTracking.form.hours'), t('timeTracking.billable'), t('common.actions')].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(approvals as TimeApproval[]).map((approval) => (
                  <tr key={approval.id} className="hover:bg-gray-50 transition-colors">
                    <td className="pl-4 pr-2 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={selected.has(approval.id)}
                        onChange={() => toggleSelect(approval.id)}
                      />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <UserAvatar
                          name={approval.submittedByName ?? ''}
                          avatarUrl={approval.submittedByAvatarUrl}
                          size="sm"
                        />
                        <span className="text-sm font-medium text-gray-900">
                          {approval.submittedByName || '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {approval.projectName || approval.projectId}
                        </span>
                        {approval.taskName && (
                          <span className="text-xs text-gray-500 truncate">
                            Task: {approval.taskName}
                          </span>
                        )}
                        {approval.sprintName && (
                          <span className="text-xs text-blue-500 truncate">
                            Sprint: {approval.sprintName}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate" title={approval.description}>
                      {approval.description}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                      {safeFormat(approval.date, 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                      {fmtH(approval.hours)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {approval.isBillable
                        ? <CheckCircle2 size={15} className="text-green-600 mx-auto" />
                        : <XCircle size={15} className="text-gray-300 mx-auto" />
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-600 border-green-300 hover:bg-green-50"
                          icon={<CheckCircle2 size={14} />}
                          onClick={() => handleApprove(approval.id)}
                          loading={approveTime.isPending}
                        >
                          {t('common.approve')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-300 hover:bg-red-50"
                          icon={<XCircle size={14} />}
                          onClick={() => setRejectTarget(approval.id)}
                        >
                          {t('common.reject')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <RejectModal
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleReject}
        title="Reject Time Entry"
      />
    </div>
  );
};

// ── Team Time Log Tab ─────────────────────────────────────────────────────────

type TeamDateMode = 'today' | 'yesterday' | 'custom';

interface UserGroup {
  userId: string;
  userName: string;
  userAvatarUrl: string;
  totalHours: number;
  billableHours: number;
  entries: TimeEntry[];
}

const TeamTimeLogTab = () => {
  const { t } = useI18n();
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd');

  const [dateMode, setDateMode] = useState<TeamDateMode>('today');
  const [customFrom, setCustomFrom] = useState(todayStr);
  const [customTo, setCustomTo]     = useState(todayStr);
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  // Team peer list — used to populate the user selector
  const { data: teamPeers = [] } = useTeamPeers();

  const { dateFrom, dateTo } = useMemo(() => {
    if (dateMode === 'today')     return { dateFrom: todayStr,     dateTo: todayStr };
    if (dateMode === 'yesterday') return { dateFrom: yesterdayStr, dateTo: yesterdayStr };
    return { dateFrom: customFrom, dateTo: customTo };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateMode, customFrom, customTo]);

  const queryEnabled = Boolean(dateFrom && dateTo);
  const queryParams = useMemo(() => {
    if (!queryEnabled) return undefined;
    const p: Record<string, string> = { date_from: dateFrom, date_to: dateTo };
    if (selectedUserId) p.user_id = selectedUserId;
    return p;
  }, [queryEnabled, dateFrom, dateTo, selectedUserId]);

  // Single fetch — backend team scope returns only this lead's team members' entries
  const { data: result, isLoading, error } = useTeamMemberEntries(queryParams, queryEnabled);
  const allEntries = useMemo(() => (result?.data ?? []) as TimeEntry[], [result]);

  // Group entries by user — maintain insertion order so backend sort is preserved
  const userGroups = useMemo((): UserGroup[] => {
    const map = new Map<string, UserGroup>();
    for (const e of allEntries) {
      const uid = String((e as any).userId ?? (e as any).user_id ?? '');
      if (!map.has(uid)) {
        map.set(uid, {
          userId:        uid,
          userName:      (e as any).userName      || (e as any).user_name      || 'Unknown',
          userAvatarUrl: (e as any).userAvatarUrl || (e as any).user_avatar_url || '',
          totalHours:    0,
          billableHours: 0,
          entries:       [],
        });
      }
      const g = map.get(uid)!;
      const hrs = parseFloat(String(e.hours)) || 0;
      g.totalHours    += hrs;
      if (e.isBillable) g.billableHours += hrs;
      g.entries.push(e);
    }
    return Array.from(map.values()).sort((a, b) => a.userName.localeCompare(b.userName));
  }, [allEntries]);

  // Summary — derived from allEntries so no second request needed
  const totalHours    = useMemo(() => Math.round(allEntries.reduce((s, e) => s + (parseFloat(String(e.hours)) || 0), 0) * 100) / 100, [allEntries]);
  const billableHours = useMemo(() => Math.round(allEntries.filter((e) => e.isBillable).reduce((s, e) => s + (parseFloat(String(e.hours)) || 0), 0) * 100) / 100, [allEntries]);

  const dateLabel = useMemo(() => {
    if (dateMode === 'today')     return `Today — ${safeFormat(todayStr, 'EEEE, MMM d')}`;
    if (dateMode === 'yesterday') return `Yesterday — ${safeFormat(yesterdayStr, 'EEEE, MMM d')}`;
    if (dateFrom === dateTo)      return safeFormat(dateFrom, 'MMM d, yyyy');
    return `${safeFormat(dateFrom, 'MMM d')} → ${safeFormat(dateTo, 'MMM d, yyyy')}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateMode, dateFrom, dateTo]);

  return (
    <div className="space-y-5">
      {/* Date selector bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
          {(['today', 'yesterday', 'custom'] as TeamDateMode[]).map((m, i) => (
            <button
              key={m}
              onClick={() => setDateMode(m)}
              className={`px-4 py-2 transition-colors capitalize ${
                i > 0 ? 'border-l border-gray-200' : ''
              } ${
                dateMode === m
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {m === 'today' ? t('common.today') : m === 'yesterday' ? t('common.yesterday') : 'Custom Range'}
            </button>
          ))}
        </div>

        {dateMode === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              max={customTo || todayStr}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="form-input text-xs py-1.5 px-2.5 h-8"
            />
            <span className="text-xs text-gray-400">→</span>
            <input
              type="date"
              value={customTo}
              min={customFrom}
              max={todayStr}
              onChange={(e) => setCustomTo(e.target.value)}
              className="form-input text-xs py-1.5 px-2.5 h-8"
            />
          </div>
        )}

        {/* User filter */}
        <div className="flex items-center gap-2">
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="form-select text-sm py-1.5 h-8 min-w-[160px]"
          >
            <option value="">All Members</option>
            {(teamPeers as Array<{ id: string; name: string }>).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {selectedUserId && (
            <button
              onClick={() => setSelectedUserId('')}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Clear filter"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {!isLoading && allEntries.length > 0 && (
          <span className="ml-auto text-xs text-gray-400">
            {userGroups.length} member{userGroups.length !== 1 ? 's' : ''} · {allEntries.length} entr{allEntries.length !== 1 ? 'ies' : 'y'}
          </span>
        )}
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label={t('timeTracking.totalHours')}    value={fmtH(totalHours)}           icon={<Clock size={18} className="text-indigo-500" />} />
        <StatCard label={t('timeTracking.billable') + ' Hours'} value={fmtH(billableHours)}        icon={<DollarSign size={18} className="text-green-500" />} />
        <StatCard label="Members Logged" value={String(userGroups.length)}  icon={<Users size={18} className="text-blue-500" />} />
        <StatCard label="Entries Today"  value={String(allEntries.length)}  icon={<TrendingUp size={18} className="text-purple-500" />} />
      </div>

      {/* Per-member entry cards */}
      {isLoading ? (
        <SkeletonTable rows={6} />
      ) : error ? (
        <Alert type="error" message={(error as Error).message} />
      ) : !queryEnabled ? (
        <EmptyState icon={<CalendarDays size={36} />} title="Select a date range" description="Choose a period above to view your team's time logs." />
      ) : userGroups.length === 0 ? (
        <EmptyState
          icon={<Clock size={36} />}
          title="No entries logged"
          description={`No team members have logged time for ${dateLabel}.`}
        />
      ) : (
        <div className="space-y-3">
          {userGroups.map((group) => (
            <Card key={group.userId} padding={false}>
              {/* Member header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/60">
                <div className="flex items-center gap-3">
                  <UserAvatar name={group.userName} avatarUrl={group.userAvatarUrl} size="sm" />
                  <span className="text-sm font-semibold text-gray-900">{group.userName}</span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-gray-500">
                    <span className="font-semibold text-gray-900">{fmtH(group.totalHours)}</span> total
                  </span>
                  {group.billableHours > 0 && (
                    <span className="text-green-700">
                      <span className="font-semibold">{fmtH(group.billableHours)}</span> billable
                    </span>
                  )}
                  <span className="text-gray-400">
                    {group.entries.length} entr{group.entries.length !== 1 ? 'ies' : 'y'}
                  </span>
                </div>
              </div>

              {/* Entries table */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-50">
                  <thead>
                    <tr className="bg-white">
                      {(dateFrom !== dateTo ? [t('timeTracking.form.date'), t('timeTracking.form.project'), t('timeTracking.form.task'), t('common.description'), t('timeTracking.form.hours'), t('timeTracking.billable'), t('common.status')] : [t('timeTracking.form.project'), t('timeTracking.form.task'), t('common.description'), t('timeTracking.form.hours'), t('timeTracking.billable'), t('common.status')]).map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {group.entries.map((e) => (
                      <tr key={e.id} className="hover:bg-gray-50/50 transition-colors">
                        {dateFrom !== dateTo && (
                          <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                            {safeFormat(e.date, 'EEE, MMM d')}
                          </td>
                        )}
                        <td className="px-4 py-2.5 text-sm text-gray-700 max-w-[160px] truncate" title={e.projectName || e.projectId}>
                          {e.projectName || e.projectId || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-gray-500 max-w-[140px] truncate" title={e.taskName}>
                          {e.taskName || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-gray-600 max-w-[220px] truncate" title={(e as any).description}>
                          {(e as any).description || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-sm font-semibold text-gray-900 whitespace-nowrap">
                          {fmtH(e.hours)}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {e.isBillable
                            ? <CheckCircle2 size={14} className="text-green-500 mx-auto" />
                            : <XCircle      size={14} className="text-gray-300 mx-auto" />}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant={statusVariant(e.status)}>{statusLabel(e.status)}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};



// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'my-log' | 'this-week' | 'team' | 'approvals';

const TimeTrackingPage = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  useParams<{ tenantSlug: string }>();
  const [viewMode, setViewMode] = useState<'my' | 'org'>('my');
  const [activeTab, setActiveTab] = useState<Tab>('my-log');

  const isManager   = hasPermission(user, PERMISSIONS.TIME_APPROVE);
  const isOrgWide   = hasPermission(user, PERMISSIONS.PROJECT_DATA_VIEW_ALL)
                   || user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN';
  const canTeamView = hasPermission(user, PERMISSIONS.TIME_TEAM_VIEW)
                   || hasPermission(user, PERMISSIONS.TIME_ANALYTICS)
                   || isOrgWide;
  // team tab for leads who don't have full org-wide access (org-wide users get the richer OrgTimeTab)
  const isTeamLeadOnly = canTeamView && !isOrgWide;

  const { data: projects = [] } = useProjects();
  const { data: pendingApprovals = [] } = useTimeApprovals({ status: 'SUBMITTED' }, isManager);
  const pendingCount = (pendingApprovals as TimeApproval[]).length;

  const tabs: Array<{ id: Tab; label: string; hidden?: boolean; badge?: number }> = [
    { id: 'my-log',    label: t('timeTracking.tabs.myLogs') },
    { id: 'this-week', label: 'My Analytics' },
    { id: 'team',      label: t('timeTracking.tabs.team'), hidden: !isTeamLeadOnly },
    { id: 'approvals', label: 'Approvals', hidden: !isManager, badge: pendingCount },
  ];

  const visibleTabs = tabs.filter((t) => !t.hidden);

  return (
    <Layout>
      <Header
        title={viewMode === 'org' ? 'Org Time & Analytics' : t('timeTracking.title')}
        subtitle={viewMode === 'org' ? 'Organisation-wide time entries and insights' : 'Log and manage your time entries'}
        actions={
          isOrgWide ? (
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('my')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === 'my' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              >
                My Time
              </button>
              <button
                onClick={() => setViewMode('org')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${viewMode === 'org' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Globe size={11} /> Org Time
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="p-6 space-y-5">
        {viewMode === 'org' && isOrgWide ? (
          <OrgTimeTab />
        ) : (
          <>
            {/* Tab bar */}
            <div className="flex gap-1 border-b border-gray-200">
              {visibleTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2 ${
                    activeTab === tab.id
                      ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {tab.label}
                  {tab.badge && tab.badge > 0 ? (
                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-red-500 text-white">
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {activeTab === 'my-log'    && <MyTimeLogTab projects={projects as Array<{ id: string; name: string }>} />}
            {activeTab === 'this-week' && <AnalyticsTab projects={projects as Array<{ id: string; name: string }>} />}
            {activeTab === 'team'      && isTeamLeadOnly && <TeamTimeLogTab />}
            {activeTab === 'approvals' && isManager && <ApprovalsTab />}
          </>
        )}
      </div>
    </Layout>
  );
};

export default TimeTrackingPage;
