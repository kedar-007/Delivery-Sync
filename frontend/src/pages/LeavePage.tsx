import React, { useState ,useEffect} from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Calendar, CheckCircle, XCircle, Clock, BarChart2, Building2, Trash2, Upload } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Modal, { ModalActions } from '../components/ui/Modal';
import { PageSkeleton } from '../components/ui/Skeleton';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import UserAvatar from '../components/ui/UserAvatar';
import {
  useLeaveTypes,
  useLeaveBalance,
  useLeaveRequests,
  useLeaveCalendar,
  useApplyLeave,
  useCancelLeave,
  useApproveLeave,
  useRejectLeave,
  useCompanyCalendar,
  useCreateHoliday,
  useDeleteHoliday,
  useAllLeaveBalances,
  useSetLeaveBalance,
} from '../hooks/usePeople';
import { useAuth } from '../contexts/AuthContext';
import { useUsers } from '../hooks/useUsers';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LeaveType {
  id: string;
  name: string;
  code: string;
}

interface LeaveBalance {
  leaveTypeId: string;
  leaveTypeName: string;
  total_allocated: number;
  used: number;
  pending: number;
  total_available: number;
}

interface LeaveRequest {
  id: string;
  leaveTypeId: string;
  leaveTypeName?: string;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string;
  status: string;
  isHalfDay?: boolean;
  halfDaySession?: string;
  userId?: string;
  userName?: string;
  userAvatarUrl?: string;
}

interface CalendarEntry {
  date: string;
  userName: string;
  leaveTypeName: string;
}

interface ApplyForm {
  leave_type_id: string;
  start_date: string;
  end_date: string;
  is_half_day: boolean;
  half_day_session?: string;
  reason: string;
}

interface RejectForm {
  notes: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const leaveStatusVariant = (status: string): 'warning' | 'success' | 'danger' | 'gray' => {
  const map: Record<string, 'warning' | 'success' | 'danger' | 'gray'> = {
    PENDING: 'warning',
    APPROVED: 'success',
    REJECTED: 'danger',
    CANCELLED: 'gray',
  };
  return map[status] ?? 'gray';
};

const formatDate = (iso?: string) => {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'dd MMM yyyy'); } catch { return iso; }
};

const calcDays = (start: string, end: string) => {
  try {
    return differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
  } catch {
    return 0;
  }
};

const MANAGER_ROLES = ['TENANT_ADMIN', 'PMO', 'DELIVERY_LEAD'];
const ADMIN_ROLES = ['TENANT_ADMIN', 'PMO'];

type Tab = 'my' | 'apply' | 'team' | 'calendar' | 'balance' | 'company-calendar' | 'leave-balances';

// ── My Leaves Tab ─────────────────────────────────────────────────────────────

const MyLeavesTab = () => {
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState('');

  // Always pass mine=true so managers/admins only see their own leaves here
  const { data, isLoading, error } = useLeaveRequests({ mine: 'true' });
  const cancelLeave = useCancelLeave();

  const requests: LeaveRequest[] = (data as LeaveRequest[]) ?? [];

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      setCancelError('');
      await cancelLeave.mutateAsync(cancelTarget);
      setCancelTarget(null);
    } catch (err: unknown) {
      setCancelError((err as Error).message);
    }
  };

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-5">
      {error && <Alert type="error" message={(error as Error).message} />}

      <Card padding={false}>
        {requests.length === 0 ? (
          <EmptyState title="No leave requests" description="Your leave applications will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Dates</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Days</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Reason</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {requests.map((req) => (
                  <tr key={req.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{req.leaveTypeName ?? 'Leave'}</td>
                    <td className="px-4 py-3 text-gray-600">
                      <div className="flex items-center gap-1 text-xs">
                        <Calendar size={12} className="text-gray-400" />
                        <span>{formatDate(req.startDate)}</span>
                        {req.startDate !== req.endDate && (
                          <><span className="text-gray-400">→</span><span>{formatDate(req.endDate)}</span></>
                        )}
                      </div>
                      {req.isHalfDay && (
                        <span className="text-xs text-purple-600 mt-0.5 block">Half Day – {req.halfDaySession}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{req.days}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs">
                      <p className="truncate text-xs">{req.reason ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={leaveStatusVariant(req.status)}>
                        {req.status.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {req.status === 'PENDING' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCancelTarget(req.id)}
                        >
                          Cancel
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Cancel Confirm Modal */}
      <Modal
        open={!!cancelTarget}
        onClose={() => { setCancelTarget(null); setCancelError(''); }}
        title="Cancel Leave Request"
        size="sm"
      >
        <div className="space-y-4">
          {cancelError && <Alert type="error" message={cancelError} />}
          <p className="text-sm text-gray-600">Are you sure you want to cancel this leave request? This action cannot be undone.</p>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setCancelTarget(null)}>Keep Request</Button>
            <Button variant="danger" loading={cancelLeave.isPending} onClick={handleCancel}>
              Yes, Cancel Leave
            </Button>
          </ModalActions>
        </div>
      </Modal>
    </div>
  );
};

// ── Apply Tab ─────────────────────────────────────────────────────────────────

const ApplyTab = () => {
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  const { data: typesData } = useLeaveTypes();
  const leaveTypes: LeaveType[] = (typesData as LeaveType[]) ?? [];

  const { register, handleSubmit, watch, reset, setValue, formState: { errors, isSubmitting } } =
    useForm<ApplyForm>({ defaultValues: { is_half_day: false } });

  const selectedTypeId = watch('leave_type_id');
  const isHalfDay = watch('is_half_day');
  const startDate = watch('start_date');
  const endDate = watch('end_date');

  const { data: balanceData } = useLeaveBalance();
  const balances: LeaveBalance[] = (balanceData as LeaveBalance[]) ?? [];

  const selectedType = leaveTypes.find((t) => t.id === selectedTypeId);
  const selectedBalance = balances.find(
    (b) => b.leaveTypeId === selectedTypeId || b.leaveTypeName === selectedType?.name
  );

  //  When half day is checked, lock end_date = start_date
  useEffect(() => {
    if (isHalfDay && startDate) setValue('end_date', startDate);
  }, [isHalfDay, startDate, setValue]);

  const applyLeave = useApplyLeave();

  const onSubmit = async (formData: ApplyForm) => {
    try {
      setSubmitError('');
      setSubmitSuccess('');

      //  Always send numeric ROWID — selectedType.id is already the ROWID string
      // but we explicitly pick it from the resolved leaveTypes to be safe
      const resolvedTypeId = selectedType?.id ?? formData.leave_type_id;

      await applyLeave.mutateAsync({
        ...formData,
        leave_type_id: resolvedTypeId,   // sends "17682000001085127" (ROWID), never the name
      });

      setSubmitSuccess('Leave request submitted successfully.');
      reset();
    } catch (err: unknown) {
      setSubmitError((err as Error).message);
    }
  };

  //  Show 0.5 for half day instead of full day count
  const previewDays = isHalfDay ? 0.5 : (startDate && endDate ? calcDays(startDate, endDate) : 0);

  return (
    <div className="max-w-xl space-y-5">
      {submitError && <Alert type="error" message={submitError} />}
      {submitSuccess && <Alert type="success" message={submitSuccess} />}

      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Apply for Leave</h3>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

          {/* Leave Type */}
          <div>
            <label className="form-label">Leave Type *</label>
            <select className="form-select" {...register('leave_type_id', { required: 'Required' })}>
              <option value="">Select leave type…</option>
              {leaveTypes.map((t) => (
                //  value={t.id} sends the ROWID, t.name is display only
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {errors.leave_type_id && <p className="form-error">{errors.leave_type_id.message}</p>}
          </div>

          {/* Balance Preview */}
          {selectedBalance && (
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-between">
              <span className="text-sm text-blue-700 font-medium">{selectedBalance.leaveTypeName} Balance</span>
              <span className="text-sm text-blue-900 font-bold">{selectedBalance.total_available} days remaining</span>
            </div>
          )}

          {/* Dates — no min restriction, allow past dates for backdated applications */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Start Date *</label>
              <input
                type="date"
                className="form-input"
                {...register('start_date', { required: 'Required' })}
              />
              {errors.start_date && <p className="form-error">{errors.start_date.message}</p>}
            </div>
            <div>
              <label className="form-label">End Date *</label>
              <input
                type="date"
                className={`form-input ${isHalfDay ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                disabled={isHalfDay}   //  locked to start_date when half day
                {...register('end_date', {
                  required: 'Required',
                  validate: (v) => !startDate || v >= startDate || 'End date must be on or after start date',
                })}
              />
              {errors.end_date && <p className="form-error">{errors.end_date.message}</p>}
            </div>
          </div>

          {/* Duration Preview */}
          {previewDays > 0 && (
            <p className="text-xs text-gray-500">
              Duration:{' '}
              <span className="font-medium text-gray-700">
                {previewDays} day{previewDays !== 1 ? 's' : ''}
              </span>
            </p>
          )}

          {/* Half Day */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_half_day"
              className="rounded border-gray-300"
              {...register('is_half_day')}
            />
            <label htmlFor="is_half_day" className="text-sm text-gray-700 cursor-pointer">
              Half Day
            </label>
          </div>

          {isHalfDay && (
            <div>
              <label className="form-label">Session</label>
              <select className="form-select" {...register('half_day_session')}>
                <option value="MORNING">Morning</option>
                <option value="AFTERNOON">Afternoon</option>
              </select>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="form-label">Reason *</label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="Briefly explain the reason for leave…"
              {...register('reason', { required: 'Reason is required' })}
            />
            {errors.reason && <p className="form-error">{errors.reason.message}</p>}
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" loading={isSubmitting} icon={<Plus size={15} />}>
              Submit Request
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

// ── Team Requests Tab ─────────────────────────────────────────────────────────

const TeamRequestsTab = () => {
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectError, setRejectError] = useState('');
  const [actionError, setActionError] = useState('');
  const [statusFilter, setStatusFilter] = useState('PENDING');

  const params: Record<string, string> = statusFilter ? { status: statusFilter } : {};
  const { data, isLoading, error } = useLeaveRequests(params);
  const requests: LeaveRequest[] = (data as LeaveRequest[]) ?? [];

  const approveLeave = useApproveLeave();
  const rejectLeave = useRejectLeave();

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<RejectForm>();

  const handleApprove = async (id: string) => {
    try {
      setActionError('');
      await approveLeave.mutateAsync({ id });
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  };

  const handleReject = async (data: RejectForm) => {
    if (!rejectTarget) return;
    try {
      setRejectError('');
      await rejectLeave.mutateAsync({ id: rejectTarget, data: { notes: data.notes } });
      setRejectTarget(null);
      reset();
    } catch (err: unknown) {
      setRejectError((err as Error).message);
    }
  };

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-5">
      {error && <Alert type="error" message={(error as Error).message} />}
      {actionError && <Alert type="error" message={actionError} />}

      {/* Status Filter */}
      <div className="flex items-center gap-2">
        {['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', ''].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${statusFilter === s
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      <Card padding={false}>
        {requests.length === 0 ? (
          <EmptyState title="No requests" description="No leave requests match this filter." />
        ) : (
          <div className="divide-y divide-gray-50">
            {requests.map((req) => (
              <div key={req.id} className="flex items-start gap-4 px-4 py-4 hover:bg-gray-50">
                <UserAvatar name={req.userName ?? ''} avatarUrl={req.userAvatarUrl} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium text-gray-900">{req.userName ?? 'Unknown'}</p>
                    <Badge variant={leaveStatusVariant(req.status)}>{req.status.replace(/_/g, ' ')}</Badge>
                  </div>
                  <p className="text-sm text-gray-600">{req.leaveTypeName ?? 'Leave'}</p>
                  <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                    <Calendar size={11} />
                    <span>{formatDate(req.startDate)}</span>
                    {req.startDate !== req.endDate && (
                      <><span>→</span><span>{formatDate(req.endDate)}</span></>
                    )}
                    <span className="text-gray-400 ml-1">({req.days} day{req.days !== 1 ? 's' : ''})</span>
                  </div>
                  {req.reason && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{req.reason}</p>
                  )}
                </div>
                {req.status === 'PENDING' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white"
                      icon={<CheckCircle size={13} />}
                      loading={approveLeave.isPending}
                      onClick={() => handleApprove(req.id)}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<XCircle size={13} />}
                      onClick={() => { setRejectTarget(req.id); setRejectError(''); }}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Reject Modal */}
      <Modal
        open={!!rejectTarget}
        onClose={() => { setRejectTarget(null); reset(); setRejectError(''); }}
        title="Reject Leave Request"
        size="sm"
      >
        <form onSubmit={handleSubmit(handleReject)} className="space-y-4">
          {rejectError && <Alert type="error" message={rejectError} />}
          <div>
            <label className="form-label">Rejection Notes *</label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="Provide a reason for rejection…"
              {...register('notes', { required: 'Notes are required' })}
            />
            {errors.notes && <p className="form-error">{errors.notes.message}</p>}
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => { setRejectTarget(null); reset(); }}>Cancel</Button>
            <Button variant="danger" type="submit" loading={isSubmitting}>Reject Request</Button>
          </ModalActions>
        </form>
      </Modal>
    </div>
  );
};

// ── Calendar Tab ──────────────────────────────────────────────────────────────

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const CalendarTab = () => {
  const now = new Date();
  const [viewDate, setViewDate] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [view, setView] = useState<'calendar' | 'list'>('calendar');

  const yr  = viewDate.getFullYear();
  const mo  = viewDate.getMonth(); // 0-indexed
  const moStr  = String(mo + 1).padStart(2, '0');
  const yrStr  = String(yr);
  const daysInMonth = new Date(yr, mo + 1, 0).getDate();
  const firstDow    = new Date(yr, mo, 1).getDay(); // 0=Sun
  const dateFrom = `${yrStr}-${moStr}-01`;
  const dateTo   = `${yrStr}-${moStr}-${String(daysInMonth).padStart(2, '0')}`;
  const todayStr = format(now, 'yyyy-MM-dd');

  const { data: leaveData, isLoading, error } = useLeaveCalendar({ date_from: dateFrom, date_to: dateTo });
  const { data: holidayData } = useCompanyCalendar({ year: yrStr });
  const entries: CalendarEntry[] = (leaveData as CalendarEntry[]) ?? [];
  const holidays: Holiday[] = (holidayData as Holiday[]) ?? [];

  // Map by date
  const leaveByDate = entries.reduce<Record<string, CalendarEntry[]>>((acc, e) => {
    const d = e.date ?? '';
    if (!acc[d]) acc[d] = [];
    acc[d].push(e);
    return acc;
  }, {});

  const holidayByDate = holidays.reduce<Record<string, string>>((acc, h) => {
    if (h.holiday_date) acc[h.holiday_date] = h.name;
    return acc;
  }, {});

  const prevMonth = () => setViewDate(new Date(yr, mo - 1, 1));
  const nextMonth = () => setViewDate(new Date(yr, mo + 1, 1));

  // Build calendar cells (blanks + days)
  const cells: Array<{ day: number | null; dateStr: string | null }> = [];
  for (let i = 0; i < firstDow; i++) cells.push({ day: null, dateStr: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, dateStr: `${yrStr}-${moStr}-${String(d).padStart(2, '0')}` });
  }

  const sortedLeaveDates = Object.keys(leaveByDate).sort();

  return (
    <div className="space-y-4">
      {error && <Alert type="error" message={(error as Error).message} />}

      {/* Header — nav + view toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
            <span className="text-gray-600 text-sm leading-none">‹</span>
          </button>
          <h3 className="text-base font-semibold text-gray-900 w-40 text-center">
            {MONTH_NAMES[mo]} {yr}
          </h3>
          <button onClick={nextMonth} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
            <span className="text-gray-600 text-sm leading-none">›</span>
          </button>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setView('calendar')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${view === 'calendar' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Calendar
          </button>
          <button
            onClick={() => setView('list')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${view === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            List
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-200 border border-green-300 inline-block" />Leave</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-100 border border-red-200 inline-block" />Holiday</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-100 border border-blue-200 inline-block" />Today</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-gray-100 inline-block" />Weekend</span>
      </div>

      {isLoading ? (
        <PageSkeleton />
      ) : view === 'calendar' ? (
        <Card padding={false}>
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-gray-100">
            {WEEK_DAYS.map((d) => (
              <div key={d} className="py-2.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">
                {d}
              </div>
            ))}
          </div>
          {/* Calendar grid */}
          <div className="grid grid-cols-7 divide-x divide-gray-50">
            {cells.map((cell, idx) => {
              if (!cell.day || !cell.dateStr) {
                return <div key={`blank-${idx}`} className="min-h-[80px] bg-gray-50/40" />;
              }
              const ds = cell.dateStr;
              const dayOfWeek = (firstDow + cell.day - 1) % 7;
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
              const isToday = ds === todayStr;
              const leavesOnDay = leaveByDate[ds] ?? [];
              const holiday = holidayByDate[ds];

              return (
                <div
                  key={ds}
                  className={`min-h-[80px] p-1.5 border-b border-gray-100 transition-colors
                    ${isToday ? 'bg-blue-50' : isWeekend ? 'bg-gray-50/60' : holiday ? 'bg-red-50/40' : 'bg-white'}
                  `}
                >
                  {/* Day number */}
                  <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold mb-1
                    ${isToday ? 'bg-blue-600 text-white' : isWeekend ? 'text-gray-400' : 'text-gray-700'}
                  `}>
                    {cell.day}
                  </div>

                  {/* Holiday chip */}
                  {holiday && (
                    <div className="text-[9px] font-medium text-red-700 bg-red-100 px-1 py-0.5 rounded truncate mb-0.5" title={holiday}>
                      {holiday}
                    </div>
                  )}

                  {/* Leave chips (max 2 + overflow) */}
                  {leavesOnDay.slice(0, 2).map((e, i) => (
                    <div key={i} className="flex items-center gap-1 mb-0.5" title={`${e.userName} — ${e.leaveTypeName}`}>
                      <UserAvatar name={e.userName} size="xs" />
                      <span className="text-[9px] text-gray-600 truncate leading-tight">{e.userName.split(' ')[0]}</span>
                    </div>
                  ))}
                  {leavesOnDay.length > 2 && (
                    <div className="text-[9px] text-blue-600 font-medium">+{leavesOnDay.length - 2} more</div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        /* List View */
        <div className="space-y-3">
          {/* Holidays this month */}
          {holidays.length > 0 && (
            <Card>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Building2 size={13} className="text-red-500" /> Public Holidays
              </h4>
              <div className="space-y-2">
                {holidays.map((h) => (
                  <div key={h.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-2">
                      <Calendar size={13} className="text-red-400 shrink-0" />
                      <span className="text-sm font-medium text-gray-800">{h.name}</span>
                      {(h.is_optional === 'true' || h.is_optional === true) && (
                        <span className="text-xs px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded">Optional</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">{formatDate(h.holiday_date)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Leave entries */}
          {sortedLeaveDates.length === 0 ? (
            <EmptyState title="No approved leaves" description="No team leaves in this period." />
          ) : (
            <Card>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                <CheckCircle size={13} className="text-green-500" /> Team Leaves
              </h4>
              <div className="space-y-3">
                {sortedLeaveDates.map((date) => (
                  <div key={date} className="flex items-start gap-4 py-2.5 border-b border-gray-50 last:border-0">
                    <div className="w-24 shrink-0">
                      <p className="text-xs font-semibold text-gray-900">{formatDate(date)}</p>
                      <p className="text-xs text-gray-400">{format(parseISO(date), 'EEEE')}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {leaveByDate[date].map((e, i) => (
                        <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-green-50 border border-green-100 rounded-lg text-xs">
                          <UserAvatar name={e.userName} size="xs" />
                          <span className="font-medium text-gray-700">{e.userName}</span>
                          <span className="text-gray-400">·</span>
                          <span className="text-green-700">{e.leaveTypeName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

// ── Balance Tab ───────────────────────────────────────────────────────────────

const BalanceTab = () => {
  const { data, isLoading, error } = useLeaveBalance();
  const balances: LeaveBalance[] = (data as LeaveBalance[]) ?? [];

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-5">
      {error && <Alert type="error" message={(error as Error).message} />}

      {balances.length === 0 ? (
        <EmptyState title="No balance data" description="Leave balance information will appear here." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {balances.map((b) => {
            const usedPct = b.total_allocated > 0 ? Math.min(100, ((b.used + b.pending) / b.total_allocated) * 100) : 0;
            return (
              <Card key={b.leaveTypeId}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">{b.leaveTypeName}</h3>
                  <span className="text-lg font-bold text-blue-700">{b.total_available}</span>
                </div>
                <p className="text-xs text-gray-500 mb-3">days remaining</p>

                {/* Progress bar */}
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${usedPct}%` }}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{b.total_allocated}</p>
                    <p className="text-xs text-gray-400">Allocated</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-green-700">{b.used}</p>
                    <p className="text-xs text-gray-400">Used</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-yellow-600">{b.pending}</p>
                    <p className="text-xs text-gray-400">Pending</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Company Calendar Tab ──────────────────────────────────────────────────────

interface Holiday {
  id: string;
  name: string;
  holiday_date: string;
  is_optional?: string | boolean;
}

interface HolidayForm {
  name: string;
  holiday_date: string;
  is_optional: boolean;
}

const CompanyCalendarTab = () => {
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState('');

  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const years = Array.from({ length: 3 }, (_, i) => String(now.getFullYear() - 1 + i));

  const { data: raw = [], isLoading, error } = useCompanyCalendar({ year });
  const holidays: Holiday[] = (raw as Holiday[]).sort((a, b) => (a.holiday_date ?? '').localeCompare(b.holiday_date ?? ''));

  const createHoliday = useCreateHoliday();
  const deleteHoliday = useDeleteHoliday();

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<HolidayForm>({
    defaultValues: { is_optional: false },
  });

  const onAdd = async (data: HolidayForm) => {
    try {
      setSubmitError('');
      await createHoliday.mutateAsync({ ...data, year: data.holiday_date.slice(0, 4) });
      reset({ is_optional: false });
      setAddOpen(false);
    } catch (err: unknown) {
      setSubmitError((err as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteHoliday.mutateAsync(deleteTarget);
      setDeleteTarget(null);
    } catch { /* noop */ }
  };

  const isOptional = (h: Holiday) => h.is_optional === true || h.is_optional === 'true';

  return (
    <div className="space-y-5">
      {error && <Alert type="error" message={(error as Error).message} />}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <label className="form-label">Year</label>
            <select className="form-select" value={year} onChange={(e) => setYear(e.target.value)}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <Button icon={<Plus size={15} />} onClick={() => setAddOpen(true)}>Add Holiday</Button>
      </div>

      {/* Weekend policy info banner */}
      <Card>
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Calendar size={16} className="text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-800">Weekend Policy</p>
            <p className="text-xs text-gray-500 mt-0.5">Saturday &amp; Sunday are non-working days by default. Public holidays listed below are additional company-wide off days.</p>
          </div>
        </div>
      </Card>

      <Card padding={false}>
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Holidays &amp; Company Off Days — {year}</h3>
        </div>
        {isLoading ? (
          <PageSkeleton />
        ) : holidays.length === 0 ? (
          <EmptyState title="No holidays configured" description="Add public holidays and company off days." />
        ) : (
          <div className="divide-y divide-gray-50">
            {holidays.map((h) => (
              <div key={h.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50">
                <div className="w-24 shrink-0">
                  <p className="text-sm font-medium text-gray-900">{formatDate(h.holiday_date)}</p>
                  <p className="text-xs text-gray-400">{h.holiday_date ? format(parseISO(h.holiday_date), 'EEEE') : ''}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{h.name}</p>
                </div>
                <Badge variant={isOptional(h) ? 'warning' : 'success'}>
                  {isOptional(h) ? 'Optional' : 'Public Holiday'}
                </Badge>
                <button
                  onClick={() => setDeleteTarget(h.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded"
                  title="Delete holiday"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Add Holiday Modal */}
      <Modal open={addOpen} onClose={() => { setAddOpen(false); reset({ is_optional: false }); }} title="Add Holiday" size="sm">
        <form onSubmit={handleSubmit(onAdd)} className="space-y-4">
          {submitError && <Alert type="error" message={submitError} />}
          <div>
            <label className="form-label">Holiday Name *</label>
            <input className="form-input" placeholder="e.g. Republic Day" {...register('name', { required: 'Required' })} />
            {errors.name && <p className="form-error">{errors.name.message}</p>}
          </div>
          <div>
            <label className="form-label">Date *</label>
            <input type="date" className="form-input" {...register('holiday_date', { required: 'Required' })} />
            {errors.holiday_date && <p className="form-error">{errors.holiday_date.message}</p>}
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_optional" className="rounded border-gray-300" {...register('is_optional')} />
            <label htmlFor="is_optional" className="text-sm text-gray-700 cursor-pointer">Optional Holiday (employee can choose to take or not)</label>
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="submit" loading={isSubmitting} icon={<Plus size={14} />}>Add Holiday</Button>
          </ModalActions>
        </form>
      </Modal>

      {/* Delete Confirm */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Holiday" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Are you sure you want to delete this holiday?</p>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" loading={deleteHoliday.isPending} onClick={handleDelete}>Delete</Button>
          </ModalActions>
        </div>
      </Modal>
    </div>
  );
};

// ── Leave Balances Admin Tab ───────────────────────────────────────────────────

interface BalanceRecord {
  id: string;
  userId: string;
  leaveTypeId: string;
  leaveTypeName: string;
  allocated: number;
  used: number;
  pending: number;
  remaining: number;
  userName?: string;
  userAvatarUrl?: string;
}

interface SetBalanceForm {
  user_id: string;
  leave_type_id: string;
  allocated_days: number;
  carry_forward_days?: number;
}

const LeaveBalancesTab = () => {
  const [setOpen, setSetOpen] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [filterUser, setFilterUser] = useState('');

  const { data: raw = [], isLoading, error } = useAllLeaveBalances();
  const { data: typesData } = useLeaveTypes();
  const { data: usersData = [] } = useUsers();
  const leaveTypes: Array<{ id: string; name: string }> = (typesData as Array<{ id: string; name: string }>) ?? [];
  const allUsers = usersData as Array<{ id: string; name: string; email: string }>;

  const setBalance = useSetLeaveBalance();

  const balances: BalanceRecord[] = (raw as BalanceRecord[]);

  // Get unique users from balances for the filter
  const userNames = Array.from(new Set(balances.map((b) => b.userName).filter(Boolean))).sort() as string[];

  const filtered = filterUser
    ? balances.filter((b) => b.userName === filterUser)
    : balances;

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<SetBalanceForm>({
    defaultValues: { allocated_days: 0, carry_forward_days: 0 },
  });

  const onSet = async (data: SetBalanceForm) => {
    try {
      setSubmitError('');
      await setBalance.mutateAsync(data);
      reset({ allocated_days: 0, carry_forward_days: 0 });
      setSetOpen(false);
    } catch (err: unknown) {
      setSubmitError((err as Error).message);
    }
  };

  // Group by user
  const byUser = filtered.reduce<Record<string, BalanceRecord[]>>((acc, b) => {
    const key = b.userName ?? b.userId;
    if (!acc[key]) acc[key] = [];
    acc[key].push(b);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {error && <Alert type="error" message={(error as Error).message} />}

      <div className="flex items-center justify-between">
        <div>
          <label className="form-label">Filter by Employee</label>
          <select className="form-select" value={filterUser} onChange={(e) => setFilterUser(e.target.value)}>
            <option value="">All employees</option>
            {userNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <Button icon={<Upload size={15} />} onClick={() => setSetOpen(true)}>Set Balance</Button>
      </div>

      {isLoading ? (
        <PageSkeleton />
      ) : Object.keys(byUser).length === 0 ? (
        <EmptyState title="No balances found" description="Set leave balances for employees to get started." />
      ) : (
        <div className="space-y-4">
          {Object.entries(byUser).map(([userName, userBalances]) => (
            <Card key={userName} padding={false}>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                <UserAvatar name={userName} avatarUrl={userBalances[0]?.userAvatarUrl} size="sm" />
                <p className="text-sm font-semibold text-gray-900">{userName}</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
                {userBalances.map((b) => (
                  <div key={b.leaveTypeId} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <p className="text-xs font-medium text-gray-600 mb-2 truncate">{b.leaveTypeName}</p>
                    <div className="grid grid-cols-2 gap-1 text-center">
                      <div>
                        <p className="text-sm font-bold text-blue-700">{b.allocated}</p>
                        <p className="text-xs text-gray-400">Total</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-green-700">{b.remaining}</p>
                        <p className="text-xs text-gray-400">Left</p>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${b.allocated > 0 ? Math.min(100, ((b.used + b.pending) / b.allocated) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Set Balance Modal */}
      <Modal open={setOpen} onClose={() => { setSetOpen(false); reset(); }} title="Set Leave Balance" size="sm">
        <form onSubmit={handleSubmit(onSet)} className="space-y-4">
          {submitError && <Alert type="error" message={submitError} />}
          <div>
            <label className="form-label">Employee *</label>
            <select className="form-select" {...register('user_id', { required: 'Required' })}>
              <option value="">Select employee…</option>
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
            {errors.user_id && <p className="form-error">{errors.user_id.message}</p>}
          </div>
          <div>
            <label className="form-label">Leave Type *</label>
            <select className="form-select" {...register('leave_type_id', { required: 'Required' })}>
              <option value="">Select leave type…</option>
              {leaveTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {errors.leave_type_id && <p className="form-error">{errors.leave_type_id.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Allocated Days *</label>
              <input
                type="number"
                min="0"
                step="0.5"
                className="form-input"
                {...register('allocated_days', { required: 'Required', valueAsNumber: true, min: 0 })}
              />
              {errors.allocated_days && <p className="form-error">{errors.allocated_days.message}</p>}
            </div>
            <div>
              <label className="form-label">Carry Forward <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                type="number"
                min="0"
                step="0.5"
                className="form-input"
                {...register('carry_forward_days', { valueAsNumber: true, min: 0 })}
              />
            </div>
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setSetOpen(false)}>Cancel</Button>
            <Button type="submit" loading={isSubmitting} icon={<Upload size={14} />}>Set Balance</Button>
          </ModalActions>
        </form>
      </Modal>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const LeavePage = () => {
  useParams<{ tenantSlug: string }>();
  const { user } = useAuth();
  const isManager = MANAGER_ROLES.includes(user?.role ?? '');
  const isAdmin = ADMIN_ROLES.includes(user?.role ?? '');
  const [tab, setTab] = useState<Tab>('my');

  const tabs: { id: Tab; label: string; icon: React.ReactNode; managerOnly?: boolean; adminOnly?: boolean }[] = [
    { id: 'my', label: 'My Leaves', icon: <Clock size={15} /> },
    { id: 'apply', label: 'Apply', icon: <Plus size={15} /> },
    { id: 'team', label: 'Team Requests', icon: <CheckCircle size={15} />, managerOnly: true },
    { id: 'calendar', label: 'Calendar', icon: <Calendar size={15} /> },
    { id: 'balance', label: 'My Balance', icon: <BarChart2 size={15} /> },
    { id: 'company-calendar', label: 'Company Calendar', icon: <Building2 size={15} />, managerOnly: true },
    { id: 'leave-balances', label: 'Manage Balances', icon: <Upload size={15} />, adminOnly: true },
  ];

  const visibleTabs = tabs.filter((t) => {
    if (t.managerOnly && !isManager) return false;
    if (t.adminOnly && !isAdmin) return false;
    return true;
  });

  return (
    <Layout>
      <Header
        title="Leave Management"
        subtitle="Apply for leave and track your team's time off"
        actions={
          <Button onClick={() => setTab('apply')} icon={<Plus size={16} />}>
            Apply Leave
          </Button>
        }
      />

      <div className="p-6 space-y-5">
        {/* Tab Bar */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex gap-1">
            {visibleTabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {tab === 'my' && <MyLeavesTab />}
        {tab === 'apply' && <ApplyTab />}
        {tab === 'team' && isManager && <TeamRequestsTab />}
        {tab === 'calendar' && <CalendarTab />}
        {tab === 'balance' && <BalanceTab />}
        {tab === 'company-calendar' && isManager && <CompanyCalendarTab />}
        {tab === 'leave-balances' && isAdmin && <LeaveBalancesTab />}
      </div>
    </Layout>
  );
};

export default LeavePage;
