import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  Clock, Plus, Edit2, Trash2, Send, RotateCcw, CheckCircle2,
  XCircle, DollarSign, CalendarDays, ChevronDown, ChevronUp,
} from 'lucide-react';
import { format, startOfWeek, addDays, parseISO, isValid } from 'date-fns';
import { useForm, useWatch } from 'react-hook-form';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Card, { StatCard } from '../components/ui/Card';
import Modal, { ModalActions } from '../components/ui/Modal';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { PageSkeleton, SkeletonTable } from '../components/ui/Skeleton';
import UserAvatar from '../components/ui/UserAvatar';
import { useAuth } from '../contexts/AuthContext';
import {
  useTimeEntries, useMyWeek, useTimeSummary,
  useCreateTimeEntry, useUpdateTimeEntry, useDeleteTimeEntry,
  useSubmitTimeEntry, useRetractTimeEntry,
  useTimeApprovals, useApproveTime, useRejectTime,
} from '../hooks/useTimeTracking';
import { useProjects } from '../hooks/useProjects';
import { useTasks } from '../hooks/useTaskSprint';

// ── Types ─────────────────────────────────────────────────────────────────────

type TimeEntryStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

interface TimeEntry {
  id: string;
  projectId: string;
  projectName?: string;
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
}

interface TimeApproval {
  id: string;
  timeEntryId: string;
  projectId: string;
  projectName?: string;
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
  hours: number;
  start_time?: string;
  end_time?: string;
  is_billable: boolean;
  notes?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MANAGER_ROLES = ['TENANT_ADMIN', 'PMO', 'DELIVERY_LEAD'];

const statusVariant = (status: TimeEntryStatus) => {
  const map: Record<TimeEntryStatus, 'gray' | 'warning' | 'success' | 'danger'> = {
    DRAFT: 'gray',
    SUBMITTED: 'warning',
    APPROVED: 'success',
    REJECTED: 'danger',
  };
  return map[status] ?? 'gray';
};

const todayStr = () => format(new Date(), 'yyyy-MM-dd');

const safeFormat = (dateStr: string, fmt: string) => {
  try {
    const d = parseISO(dateStr);
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
  const [error, setError] = useState('');
  const createEntry = useCreateTimeEntry();
  const updateEntry = useUpdateTimeEntry();

  const { register, handleSubmit, reset, control, setValue, watch: watchForm, formState: { isSubmitting, errors } } = useForm<TimeEntryFormData>({
    defaultValues: {
      project_id: entry?.projectId ?? '',
      task_id: '',
      description: entry?.description ?? '',
      date: entry?.date ?? todayStr(),
      hours: entry?.hours ?? 1,
      start_time: entry?.startTime ?? '',
      end_time: entry?.endTime ?? '',
      is_billable: entry?.isBillable ?? true,
      notes: entry?.notes ?? '',
    },
  });

  // Watch the selected project so we can load tasks for it
  const watchedProjectId = useWatch({ control, name: 'project_id' });
  const watchedStart = watchForm('start_time');
  const watchedEnd = watchForm('end_time');

  // Auto-calculate hours from start/end time
  React.useEffect(() => {
    if (watchedStart && watchedEnd) {
      const [sh, sm] = watchedStart.split(':').map(Number);
      const [eh, em] = watchedEnd.split(':').map(Number);
      const diff = (eh * 60 + em) - (sh * 60 + sm);
      if (diff > 0) setValue('hours', Math.round(diff / 30) * 0.5 || 0.5);
    }
  }, [watchedStart, watchedEnd, setValue]);

  // Load tasks whenever a project is selected
  const { data: tasksRaw = [] } = useTasks(
    watchedProjectId ? { project_id: watchedProjectId } : undefined,
  );
  const tasks = (tasksRaw as Array<{ id: string; title: string }>).filter(Boolean);

  React.useEffect(() => {
    if (open) {
      reset({
        project_id: entry?.projectId ?? '',
        task_id: '',
        description: entry?.description ?? '',
        date: entry?.date ?? todayStr(),
        hours: entry?.hours ?? 1,
        start_time: entry?.startTime ?? '',
        end_time: entry?.endTime ?? '',
        is_billable: entry?.isBillable ?? true,
        notes: entry?.notes ?? '',
      });
      setError('');
    }
  }, [open, entry, reset]);

  const onSubmit = async (data: TimeEntryFormData) => {
    try {
      setError('');
      const payload = {
        ...data,
        task_id: data.task_id || undefined,
      };
      if (entry) {
        await updateEntry.mutateAsync({ id: entry.id, data: payload });
      } else {
        await createEntry.mutateAsync(payload);
      }
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Something went wrong');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={entry ? 'Edit Time Entry' : 'Log Time'} size="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && <Alert type="error" message={error} />}

        {/* Project selector */}
        <div>
          <label className="form-label">Project *</label>
          <select className="form-select" {...register('project_id', { required: 'Project is required' })}>
            <option value="">Select project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {errors.project_id && <p className="text-xs text-red-600 mt-1">{errors.project_id.message}</p>}
        </div>

        {/* Task selector — only shown once a project is chosen */}
        {watchedProjectId && (
          <div>
            <label className="form-label">
              Task <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select className="form-select" {...register('task_id')}>
              <option value="">No specific task</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>
        )}

        {/* Description */}
        <div>
          <label className="form-label">Description / What did you work on? *</label>
          <input
            className="form-input"
            placeholder="What did you work on?"
            {...register('description', { required: 'Description is required' })}
          />
          {errors.description && <p className="text-xs text-red-600 mt-1">{errors.description.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Date *</label>
            <input
              type="date"
              className="form-input"
              {...register('date', { required: 'Date is required' })}
            />
          </div>
          <div>
            <label className="form-label">Hours *</label>
            <input
              type="number"
              step="0.5"
              min="0.5"
              max="24"
              className="form-input"
              {...register('hours', {
                required: 'Hours is required',
                min: { value: 0.5, message: 'Min 0.5h' },
                max: { value: 24, message: 'Max 24h' },
                valueAsNumber: true,
              })}
            />
            {errors.hours && <p className="text-xs text-red-600 mt-1">{errors.hours.message}</p>}
          </div>
        </div>

        {/* Start / End Time (optional — auto-calculates hours) */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Start Time <span className="text-gray-400 font-normal">(optional)</span></label>
            <input type="time" className="form-input" {...register('start_time')} />
          </div>
          <div>
            <label className="form-label">End Time <span className="text-gray-400 font-normal">(optional)</span></label>
            <input type="time" className="form-input" {...register('end_time')} />
          </div>
        </div>
        {watchedStart && watchedEnd && (
          <p className="text-xs text-blue-600 -mt-2">
            Hours auto-calculated from time range.
          </p>
        )}

        <div className="flex items-center gap-3">
          <input
            id="is_billable"
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            {...register('is_billable')}
          />
          <label htmlFor="is_billable" className="text-sm text-gray-700 font-medium cursor-pointer">
            Billable hours
          </label>
        </div>

        <div>
          <label className="form-label">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
          <textarea
            className="form-textarea"
            rows={3}
            placeholder="Additional context…"
            {...register('notes')}
          />
        </div>

        <ModalActions>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting} icon={<Clock size={16} />}>
            {entry ? 'Save Changes' : 'Log Time'}
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
        <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
        <Button variant="danger" onClick={handleConfirm} loading={loading} icon={<XCircle size={16} />}>
          Reject
        </Button>
      </ModalActions>
    </Modal>
  );
};

// ── My Time Log Tab ───────────────────────────────────────────────────────────

interface MyTimeLogTabProps {
  projects: Array<{ id: string; name: string }>;
}

const PAGE_SIZE = 20;

const MyTimeLogTab = ({ projects }: MyTimeLogTabProps) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);

  // Secondary view filter (project + task, applied client-side after fetch)
  const [viewProject, setViewProject] = useState('');
  const [viewTask, setViewTask] = useState('');

  // Load tasks for the currently selected view-filter project
  const { data: viewTasksRaw = [] } = useTasks(
    viewProject ? { project_id: viewProject } : undefined,
  );
  const viewTasks = (viewTasksRaw as Array<{ id: string; title: string }>).filter(Boolean);

  const filterParams = useMemo(() => {
    setPage(1);
    const p: Record<string, string> = {};
    if (filterDateFrom) p.date_from = filterDateFrom;
    if (filterDateTo) p.date_to = filterDateTo;
    if (filterProject) p.project_id = filterProject;
    if (filterStatus) p.status = filterStatus;
    return p;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDateFrom, filterDateTo, filterProject, filterStatus]);

  const { data: entriesRaw = [], isLoading, error } = useTimeEntries(filterParams);
  const deleteEntry = useDeleteTimeEntry();
  const submitEntry = useSubmitTimeEntry();
  const retractEntry = useRetractTimeEntry();

  // Client-side secondary filter
  const filteredEntries = useMemo(() => {
    let list = entriesRaw as TimeEntry[];
    if (viewProject) list = list.filter((e) => e.projectId === viewProject);
    // task_id may be present on the raw entry object from the backend
    if (viewTask) list = list.filter((e) => (e as unknown as Record<string, unknown>).task_id === viewTask);
    return list;
  }, [entriesRaw, viewProject, viewTask]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const entries = filteredEntries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this time entry?')) return;
    try { await deleteEntry.mutateAsync(id); } catch { /* noop */ }
  };

  const handleSubmit = async (id: string) => {
    try { await submitEntry.mutateAsync(id); } catch { /* noop */ }
  };

  const handleRetract = async (id: string) => {
    if (!window.confirm('Retract this submission?')) return;
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

  return (
    <div className="space-y-4">
      {/* Date / Status Filters */}
      <Card>
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
            <label className="form-label">Project</label>
            <select className="form-select" value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Status</label>
            <select className="form-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
        </div>
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
            Log Time
          </Button>
        </div>

        {isLoading ? (
          <SkeletonTable rows={5} />
        ) : error ? (
          <Alert type="error" message={(error as Error).message} className="m-5" />
        ) : entries.length === 0 ? (
          <EmptyState
            icon={<Clock size={36} />}
            title="No time entries"
            description="Start tracking your time by logging an entry."
            action={
              <Button size="sm" icon={<Plus size={14} />} onClick={() => setModalOpen(true)}>
                Log Time
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  {['Date', 'Project', 'Task Description', 'Time', 'Hours', 'Billable', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(entries as TimeEntry[]).map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                      {safeFormat(entry.date, 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                      {entry.projectName ?? entry.projectId}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate" title={entry.description}>
                      {entry.description}
                      {entry.userName && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <UserAvatar name={entry.userName} avatarUrl={entry.userAvatarUrl} size="xs" />
                          <span className="text-xs text-gray-400">{entry.userName}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {entry.startTime && entry.endTime
                        ? `${entry.startTime.slice(0, 5)} – ${entry.endTime.slice(0, 5)}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                      {entry.hours}h
                    </td>
                    <td className="px-4 py-3 text-center">
                      {entry.isBillable
                        ? <DollarSign size={15} className="text-green-600 mx-auto" />
                        : <span className="text-xs text-gray-400">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(entry.status)}>
                        {entry.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {(entry.status === 'DRAFT' || entry.status === 'REJECTED') && (
                          <button
                            onClick={() => openEdit(entry)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors rounded"
                            title="Edit"
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
        )}
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-gray-500">
            Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filteredEntries.length)} of {filteredEntries.length} entries
          </p>
          <div className="flex items-center gap-1">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-2.5 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
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
                  <span key={`ellipsis-${i}`} className="px-1 text-gray-400 text-sm">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    className={`px-2.5 py-1 text-sm border rounded-lg ${
                      page === p
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-2.5 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              →
            </button>
          </div>
        </div>
      )}

      <LogTimeModal
        open={modalOpen}
        onClose={closeModal}
        entry={editEntry}
        projects={projects}
      />
    </div>
  );
};

// ── This Week Tab ─────────────────────────────────────────────────────────────

const ThisWeekTab = () => {
  const { data: weekData, isLoading, error } = useMyWeek();
  const { data: summary } = useTimeSummary();

  const week = weekData as WeekSummary | undefined;
  const maxHours = useMemo(() => {
    if (!week?.days) return 8;
    return Math.max(8, ...week.days.map((d) => d.hours));
  }, [week]);

  if (isLoading) return <PageSkeleton />;
  if (error) return <Alert type="error" message={(error as Error).message} className="m-5" />;

  const totalHours = (summary as WeekSummary | undefined)?.totalHours ?? week?.totalHours ?? 0;
  const billableHours = (summary as WeekSummary | undefined)?.billableHours ?? week?.billableHours ?? 0;
  const nonBillableHours = (summary as WeekSummary | undefined)?.nonBillableHours ?? week?.nonBillableHours ?? 0;
  const daysLogged = (summary as WeekSummary | undefined)?.daysLogged ?? week?.daysLogged ?? 0;

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const dayLabels = Array.from({ length: 7 }, (_, i) => ({
    label: format(addDays(weekStart, i), 'EEE'),
    date: format(addDays(weekStart, i), 'yyyy-MM-dd'),
  }));

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Hours" value={`${totalHours}h`} icon={<Clock size={20} />} color="blue" />
        <StatCard label="Billable" value={`${billableHours}h`} icon={<DollarSign size={20} />} color="green" />
        <StatCard label="Non-Billable" value={`${nonBillableHours}h`} icon={<Clock size={20} />} color="amber" />
        <StatCard label="Days Logged" value={daysLogged} icon={<CalendarDays size={20} />} color="purple" />
      </div>

      {/* Day-by-day breakdown */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-5">Week Overview</h3>
        <div className="space-y-4">
          {dayLabels.map(({ label, date }) => {
            const dayData = week?.days?.find((d) => d.date === date);
            const hours = dayData?.hours ?? 0;
            const pct = maxHours > 0 ? (hours / maxHours) * 100 : 0;
            const isToday = date === todayStr();

            return (
              <div key={date}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium w-8 ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>
                      {label}
                    </span>
                    <span className="text-xs text-gray-400">{safeFormat(date, 'MMM d')}</span>
                    {isToday && (
                      <Badge variant="default" className="text-[10px] py-0">Today</Badge>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{hours > 0 ? `${hours}h` : '—'}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      hours >= 8 ? 'bg-green-500' : hours > 0 ? 'bg-blue-500' : 'bg-transparent'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {dayData?.entries && dayData.entries.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {dayData.entries.map((e, idx) => (
                      <span key={idx} className="text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">
                        {e.projectName} · {e.hours}h
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};

// ── Approvals Tab ─────────────────────────────────────────────────────────────

const ApprovalsTab = () => {
  const { data: approvals = [], isLoading, error } = useTimeApprovals({ status: 'SUBMITTED' });
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
            Approve Selected
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
                  <th className="pl-4 pr-2 py-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={selected.size === (approvals as TimeApproval[]).length && (approvals as TimeApproval[]).length > 0}
                      onChange={toggleAll}
                    />
                  </th>
                  {['Submitted By', 'Project', 'Description', 'Date', 'Hours', 'Billable', 'Actions'].map((h) => (
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
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                      {approval.projectName ?? approval.projectId}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate" title={approval.description}>
                      {approval.description}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                      {safeFormat(approval.date, 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                      {approval.hours}h
                    </td>
                    <td className="px-4 py-3 text-center">
                      {approval.isBillable
                        ? <DollarSign size={15} className="text-green-600 mx-auto" />
                        : <span className="text-xs text-gray-400">—</span>
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
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-300 hover:bg-red-50"
                          icon={<XCircle size={14} />}
                          onClick={() => setRejectTarget(approval.id)}
                        >
                          Reject
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

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'my-log' | 'this-week' | 'approvals';

const TimeTrackingPage = () => {
  const { user } = useAuth();
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('my-log');

  const isManager = user?.role ? MANAGER_ROLES.includes(user.role) : false;

  const { data: projects = [] } = useProjects();

  const tabs: Array<{ id: Tab; label: string; managerOnly?: boolean }> = [
    { id: 'my-log', label: 'My Time Log' },
    { id: 'this-week', label: 'This Week' },
    { id: 'approvals', label: 'Approvals', managerOnly: true },
  ];

  const visibleTabs = tabs.filter((t) => !t.managerOnly || isManager);

  return (
    <Layout>
      <Header
        title="Time Tracking"
        subtitle="Log and manage your time entries"
      />

      <div className="p-6 space-y-5">
        {/* Tab bar */}
        <div className="flex gap-1 border-b border-gray-200">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab.id
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'my-log' && <MyTimeLogTab projects={projects as Array<{ id: string; name: string }>} />}
        {activeTab === 'this-week' && <ThisWeekTab />}
        {activeTab === 'approvals' && isManager && <ApprovalsTab />}
      </div>
    </Layout>
  );
};

export default TimeTrackingPage;
