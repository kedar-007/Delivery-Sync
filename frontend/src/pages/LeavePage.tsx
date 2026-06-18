import React, { useState ,useEffect} from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Plus, Calendar, CheckCircle, XCircle, Clock, BarChart2, Building2, Trash2, Upload, LayoutGrid, LayoutList, MapPin, Pencil, Users, Save, ChevronDown, ChevronUp, Settings2, AlertTriangle, Info } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { format, parseISO, differenceInCalendarDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays } from 'date-fns';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import { useI18n } from '../contexts/I18nContext';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Modal, { ModalActions } from '../components/ui/Modal';
import { PageSkeleton } from '../components/ui/Skeleton';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import Pagination from '../components/ui/Pagination';
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
  useUpdateHoliday,
  useDeleteHoliday,
  useCalendarConfig,
  useAllLeaveBalances,
  useSetLeaveBalance,
  useDeleteLeaveBalance,
  useLeavePolicy,
  useSaveLeavePolicy,
} from '../hooks/usePeople';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission, PERMISSIONS } from '../utils/permissions';
import { useUsers } from '../hooks/useUsers';
import UserPicker from '../components/ui/UserPicker';

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
  remaining: number;
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

// Per-person color palette for calendar chips.
// Index 0 (blue) is reserved for "You" (own leave) — teammates get indices 1–7.
const PERSON_PALETTE = [
  { bg: 'bg-blue-100 dark:bg-blue-900/40',     border: 'border-blue-300 dark:border-blue-700',     text: 'text-blue-800 dark:text-blue-200'     },
  { bg: 'bg-emerald-100 dark:bg-emerald-900/40', border: 'border-emerald-300 dark:border-emerald-700', text: 'text-emerald-800 dark:text-emerald-200' },
  { bg: 'bg-violet-100 dark:bg-violet-900/40',  border: 'border-violet-300 dark:border-violet-700',  text: 'text-violet-800 dark:text-violet-200'  },
  { bg: 'bg-amber-100 dark:bg-amber-900/40',    border: 'border-amber-300 dark:border-amber-700',    text: 'text-amber-800 dark:text-amber-200'    },
  { bg: 'bg-rose-100 dark:bg-rose-900/40',      border: 'border-rose-300 dark:border-rose-700',      text: 'text-rose-800 dark:text-rose-200'      },
  { bg: 'bg-cyan-100 dark:bg-cyan-900/40',      border: 'border-cyan-300 dark:border-cyan-700',      text: 'text-cyan-800 dark:text-cyan-200'      },
  { bg: 'bg-orange-100 dark:bg-orange-900/40',  border: 'border-orange-300 dark:border-orange-700',  text: 'text-orange-800 dark:text-orange-200'  },
  { bg: 'bg-teal-100 dark:bg-teal-900/40',      border: 'border-teal-300 dark:border-teal-700',      text: 'text-teal-800 dark:text-teal-200'      },
];

// Counts working days between two ISO date strings, excluding weekends (per
// the supplied policy) and any dates in the holidaySet.
function calcWorkingDays(start: string, end: string, policy: string, holidaySet: Set<string>): number {
  const s = new Date(start);
  const e = new Date(end);
  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const dow = cur.getDay();
    const yr  = cur.getFullYear();
    const mo  = cur.getMonth();
    const d   = cur.getDate();
    const ds  = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (!isWeekendOff(dow, yr, mo, d, policy) && !holidaySet.has(ds)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function personColor(userId: string, isOwn: boolean) {
  if (isOwn) return PERSON_PALETTE[0];
  let h = 0;
  const s = String(userId || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
  return PERSON_PALETTE[(h % (PERSON_PALETTE.length - 1)) + 1];
}

// Colors calendar chips by leave type so the same leave type always gets the
// same shade across the grid. Own leave stays blue for quick self-identification.
function leaveTypeColor(leaveTypeId: string, leaveTypeName: string, isOwn: boolean) {
  if (isOwn) return PERSON_PALETTE[0];
  let h = 0;
  const s = String(leaveTypeId || leaveTypeName || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
  return PERSON_PALETTE[(h % (PERSON_PALETTE.length - 1)) + 1];
}

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


type Tab = 'my' | 'apply' | 'team' | 'who-is-off' | 'calendar' | 'balance';

// ── My Leaves Tab ─────────────────────────────────────────────────────────────

const MyLeavesTab = ({ highlightId = '' }: { highlightId?: string }) => {
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState('');
  const { t } = useI18n();

  // Always pass mine=true so managers/admins only see their own leaves here
  const { data, isLoading, error } = useLeaveRequests({ mine: 'true' });
  const cancelLeave = useCancelLeave();

  const requests: LeaveRequest[] = (data as LeaveRequest[]) ?? [];

  // Scroll the row matching ?requestId= into view when arriving from a
  // notification click. Same UX pattern as the WFH tab.
  const highlightRef = React.useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    if (!highlightId || isLoading) return;
    const t = setTimeout(() => {
      highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
    return () => clearTimeout(t);
  }, [highlightId, isLoading]);

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
          <EmptyState title={t('leave.noLeave')} description="Your leave applications will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{t('leave.form.leaveType')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Dates</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{t('common.days')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{t('leave.form.reason')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{t('common.status')}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {requests.map((req) => {
                  const isHighlight = highlightId && String(req.id) === String(highlightId);
                  return (
                  <tr
                    key={req.id}
                    ref={isHighlight ? highlightRef : undefined}
                    className={`transition-all ${
                      isHighlight
                        ? 'bg-blue-50 ring-2 ring-blue-300 ring-inset animate-pulse'
                        : 'hover:bg-gray-50'
                    }`}
                  >
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
                          {t('common.cancel')}
                        </Button>
                      )}
                    </td>
                  </tr>
                  );
                })}
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
  const { t } = useI18n();

  const { user } = useAuth();
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

  // Load calendar config + holidays for working-day preview
  const { data: calConfig } = useCalendarConfig();
  const previewYear = startDate ? startDate.slice(0, 4) : String(new Date().getFullYear());
  const holidayParams: Record<string, string> = { year: previewYear };
  if (user?.officeLocationId) holidayParams.locationId = user.officeLocationId;
  const { data: holidayData } = useCompanyCalendar(holidayParams);

  // Also fetch holidays for end year if the leave spans a year boundary
  const endYear = endDate ? endDate.slice(0, 4) : previewYear;
  const endHolidayParams: Record<string, string> = { year: endYear };
  if (user?.officeLocationId) endHolidayParams.locationId = user.officeLocationId;
  const { data: endHolidayData } = useCompanyCalendar(endYear !== previewYear ? endHolidayParams : holidayParams);

  const wpConfig: { default: string; perLocation: Record<string, string> } =
    (calConfig as any)?.weekendPolicy ?? { default: 'all_off', perLocation: {} };
  const userPolicy = user?.officeLocationId
    ? (wpConfig.perLocation?.[user.officeLocationId] ?? wpConfig.default)
    : wpConfig.default;

  // Build holiday set (non-optional holidays only)
  const holidaySet = React.useMemo(() => {
    const s = new Set<string>();
    const allHols: any[] = [
      ...((holidayData as any[]) ?? []),
      ...((endYear !== previewYear ? (endHolidayData as any[]) : []) ?? []),
    ];
    allHols.forEach((h) => {
      if (h.holiday_date && h.is_optional !== true && h.is_optional !== 'true') s.add(h.holiday_date);
    });
    return s;
  }, [holidayData, endHolidayData, endYear, previewYear]);

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

  // Working days preview (excludes weekends + non-optional public holidays)
  const calendarDays = startDate && endDate ? calcDays(startDate, endDate) : 0;
  const workingDays  = startDate && endDate ? calcWorkingDays(startDate, endDate, userPolicy, holidaySet) : 0;
  const previewDays  = isHalfDay ? 0.5 : workingDays;
  const skippedDays  = isHalfDay ? 0 : Math.max(0, calendarDays - workingDays);

  return (
    <div className="max-w-xl space-y-5">
      {submitError && <Alert type="error" message={submitError} />}
      {submitSuccess && <Alert type="success" message={submitSuccess} />}

      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('leave.apply')}</h3>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

          {/* Leave Type */}
          <div>
            <label className="form-label">{t('leave.form.leaveType')} *</label>
            <select className="form-select" {...register('leave_type_id', { required: t('validation.required') })}>
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
              <span className="text-sm text-blue-900 font-bold">{selectedBalance.remaining ?? selectedBalance.total_available} days remaining</span>
            </div>
          )}

          {/* Dates — no min restriction, allow past dates for backdated applications */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">{t('leave.form.startDate')} *</label>
              <input
                type="date"
                className="form-input"
                {...register('start_date', { required: t('validation.required') })}
              />
              {errors.start_date && <p className="form-error">{errors.start_date.message}</p>}
            </div>
            <div>
              {/* DSV-026: when Half Day is checked, the field is disabled and
                  the value is auto-locked to start_date, so the `*` and
                  required-error are meaningless to the user. Hide both. */}
              <label className="form-label">
                {t('leave.form.endDate')} {!isHalfDay && <span className="text-red-500">*</span>}
              </label>
              <input
                type="date"
                className={`form-input ${isHalfDay ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                disabled={isHalfDay}
                {...register('end_date', {
                  required: isHalfDay ? false : t('validation.required'),
                  validate: (v) => isHalfDay || !startDate || v >= startDate || 'End date must be on or after start date',
                })}
              />
              {!isHalfDay && errors.end_date && <p className="form-error">{errors.end_date.message}</p>}
            </div>
          </div>

          {/* Duration Preview */}
          {previewDays > 0 && (
            <div className="p-3 bg-gray-50 border border-gray-100 rounded-lg space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Working days deducted</span>
                <span className="text-sm font-bold text-gray-900">
                  {previewDays} day{previewDays !== 1 ? 's' : ''}
                </span>
              </div>
              {!isHalfDay && skippedDays > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Weekends / holidays skipped</span>
                  <span className="text-xs text-green-600 font-medium">−{skippedDays} day{skippedDays !== 1 ? 's' : ''}</span>
                </div>
              )}
              {!isHalfDay && calendarDays > 0 && (
                <div className="flex items-center justify-between border-t border-gray-100 pt-1">
                  <span className="text-xs text-gray-400">Calendar span</span>
                  <span className="text-xs text-gray-400">{calendarDays} calendar day{calendarDays !== 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
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
              {t('leave.form.halfDay')}
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
            <label className="form-label">{t('leave.form.reason')} *</label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="Briefly explain the reason for leave…"
              {...register('reason', { required: t('validation.required') })}
            />
            {errors.reason && <p className="form-error">{errors.reason.message}</p>}
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" loading={isSubmitting} icon={<Plus size={15} />}>
              {t('leave.form.submit')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

// ── Team Requests Tab ─────────────────────────────────────────────────────────

const TEAM_REQ_PAGE_SIZE = 15;

const TeamRequestsTab = ({ highlightId = '' }: { highlightId?: string }) => {
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectError, setRejectError] = useState('');
  const [actionError, setActionError] = useState('');
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [userFilter, setUserFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const { t } = useI18n();

  const params: Record<string, string> = { team: 'true', ...(statusFilter ? { status: statusFilter } : {}) };
  const { data, isLoading, error } = useLeaveRequests(params);
  const requests: LeaveRequest[] = React.useMemo(() => (data as LeaveRequest[]) ?? [], [data]);

  // Unique users for the filter dropdown
  const userOptions = React.useMemo(() => {
    const seen = new Map<string, string>();
    requests.forEach((r) => {
      if (r.userId && r.userName) seen.set(r.userId, r.userName);
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [requests]);

  // Client-side filtering by user and date range
  const filtered = React.useMemo(() => {
    return requests.filter((r) => {
      if (userFilter && r.userId !== userFilter) return false;
      if (dateFrom && r.startDate < dateFrom) return false;
      if (dateTo && r.endDate > dateTo) return false;
      return true;
    });
  }, [requests, userFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / TEAM_REQ_PAGE_SIZE));
  const pagedRequests = filtered.slice((page - 1) * TEAM_REQ_PAGE_SIZE, page * TEAM_REQ_PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [statusFilter, userFilter, dateFrom, dateTo]);

  // If the manager arrived from a notification but the matching request
  // isn't in the current filter (e.g. an approved leave while filter is
  // PENDING), broaden the filter to "all" so the row becomes visible.
  useEffect(() => {
    if (!highlightId || isLoading) return;
    const found = requests.some((r) => String(r.id) === String(highlightId));
    if (!found && statusFilter !== '') { setStatusFilter(''); setUserFilter(''); setDateFrom(''); setDateTo(''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, isLoading, requests.length]);

  // Jump to the page containing the highlighted row
  useEffect(() => {
    if (!highlightId || isLoading || filtered.length === 0) return;
    const idx = filtered.findIndex((r) => String(r.id) === String(highlightId));
    if (idx !== -1) setPage(Math.ceil((idx + 1) / TEAM_REQ_PAGE_SIZE));
  }, [highlightId, isLoading, filtered]);

  // Scroll the highlighted row into view once it's present.
  const highlightRef = React.useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    if (!highlightId || isLoading) return;
    const t = setTimeout(() => {
      highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
    return () => clearTimeout(t);
  }, [highlightId, isLoading, page]);

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
    <div className="space-y-4">
      {error && <Alert type="error" message={(error as Error).message} />}
      {actionError && <Alert type="error" message={actionError} />}

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Status chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', ''].map((s) => (
            <button
              key={s || 'all'}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${statusFilter === s
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-ds-surface text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-blue-300'
              }`}
            >
              {s || t('common.all')}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* User filter */}
        <div className="w-52">
          <UserPicker
            users={userOptions}
            value={userFilter}
            onChange={(id) => setUserFilter(id)}
            placeholder="All employees"
            allowEmpty
          />
        </div>

        {/* Date range */}
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 bg-ds-surface text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-400">–</span>
          <input
            type="date"
            value={dateTo}
            min={dateFrom}
            onChange={(e) => setDateTo(e.target.value)}
            className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 bg-ds-surface text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="text-xs text-gray-400 hover:text-gray-600 px-1"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <Card padding={false}>
        {filtered.length === 0 ? (
          <EmptyState title="No requests" description="No leave requests match this filter." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Employee</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{t('leave.form.leaveType')}</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{t('leave.from')}</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{t('leave.to')}</th>
                    <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{t('common.days')}</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{t('common.status')}</th>
                    <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {pagedRequests.map((req) => {
                    const isHighlight = highlightId && String(req.id) === String(highlightId);
                    return (
                      <tr
                        key={req.id}
                        ref={isHighlight ? highlightRef : undefined}
                        className={`transition-all ${
                          isHighlight
                            ? 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-300 ring-inset animate-pulse'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <UserAvatar name={req.userName ?? ''} avatarUrl={req.userAvatarUrl} size="sm" />
                            <span className="font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                              {req.userName ?? 'Unknown'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {req.leaveTypeName ?? '—'}
                          {req.isHalfDay && (
                            <span className="ml-1.5 text-xs text-gray-400">({req.halfDaySession ?? 'half day'})</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{formatDate(req.startDate)}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{formatDate(req.endDate)}</td>
                        <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300 font-medium">{req.days}</td>
                        <td className="px-4 py-3">
                          <Badge variant={leaveStatusVariant(req.status)}>{req.status.replace(/_/g, ' ')}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          {req.status === 'PENDING' ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 text-white"
                                icon={<CheckCircle size={13} />}
                                loading={approveLeave.isPending}
                                onClick={() => handleApprove(req.id)}
                              >
                                {t('common.approve')}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                icon={<XCircle size={13} />}
                                onClick={() => { setRejectTarget(req.id); setRejectError(''); }}
                              >
                                {t('common.reject')}
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400 block text-right">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={filtered.length}
              pageSize={TEAM_REQ_PAGE_SIZE}
              onPageChange={setPage}
              className="px-4 py-3 border-t border-gray-100 dark:border-gray-700"
            />
          </>
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
              {...register('notes', { required: t('validation.required') })}
            />
            {errors.notes && <p className="form-error">{errors.notes.message}</p>}
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => { setRejectTarget(null); reset(); }}>{t('common.cancel')}</Button>
            <Button variant="danger" type="submit" loading={isSubmitting}>Reject Request</Button>
          </ModalActions>
        </form>
      </Modal>
    </div>
  );
};

// ── Team On Leave Tab ─────────────────────────────────────────────────────────

const TeamOnLeaveTab = ({ canViewOrg }: { canViewOrg: boolean }) => {
  const { t } = useI18n();
  const now = new Date();
  const todayStr = format(now, 'yyyy-MM-dd');
  const [filter, setFilter] = useState<'today' | 'week' | 'month'>('today');
  const [scope, setScope] = useState<'team' | 'org'>('team');

  const dateFrom =
    filter === 'today' ? todayStr
    : filter === 'week' ? format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    : format(startOfMonth(now), 'yyyy-MM-dd');
  const dateTo =
    filter === 'today' ? todayStr
    : filter === 'week' ? format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    : format(endOfMonth(now), 'yyyy-MM-dd');

  const { data: leaveData, isLoading } = useLeaveCalendar({ date_from: dateFrom, date_to: dateTo, scope });
  const rawEntries: any[] = (leaveData as any[]) ?? [];

  // Expand multi-day leaves and group by userId
  const byUserId: Record<string, { name: string; avatarUrl: string; userId: string; groups: { leaveTypeName: string; dates: string[] }[] }> = {};
  rawEntries.forEach((e: any) => {
    const uid = String(e.userId ?? e.user_id ?? e.userName ?? '');
    const start = parseISO(e.startDate || e.start_date || e.date || '');
    const end   = parseISO(e.endDate   || e.end_date   || e.date || '');
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;
    if (!byUserId[uid]) byUserId[uid] = { name: e.userName ?? '', avatarUrl: e.userAvatarUrl ?? '', userId: uid, groups: [] };
    const person = byUserId[uid];
    let cur = start;
    while (cur <= end) {
      const ds = format(cur, 'yyyy-MM-dd');
      const grp = person.groups.find((g) => g.leaveTypeName === e.leaveTypeName);
      if (grp) { if (!grp.dates.includes(ds)) grp.dates.push(ds); }
      else person.groups.push({ leaveTypeName: e.leaveTypeName, dates: [ds] });
      cur = addDays(cur, 1);
    }
  });

  const people = Object.values(byUserId).map((p) => {
    const allDates = p.groups.flatMap((g) => g.dates).sort();
    return { ...p, startDate: allDates[0], endDate: allDates[allDates.length - 1], totalDays: allDates.length };
  }).sort((a, b) => a.startDate.localeCompare(b.startDate));

  const filterLabel = filter === 'today' ? 'today' : filter === 'week' ? 'this week' : 'this month';
  const scopeLabel  = scope === 'org' ? 'across the org' : 'in your team';

  return (
    <div className="space-y-5">
      {/* Controls row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            {scope === 'org' ? 'Org' : 'Team'} on Leave
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {isLoading ? 'Loading…' : people.length > 0
              ? `${people.length} ${scope === 'org' ? 'employee' : 'team member'}${people.length === 1 ? '' : 's'} on leave ${filterLabel}`
              : `Nobody on leave ${filterLabel} ${scopeLabel}`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Scope toggle — only for users with org-view access */}
          {canViewOrg && (
            <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden bg-ds-surface">
              <button
                onClick={() => setScope('team')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${scope === 'team' ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              >
                <Users size={12} /> My Team
              </button>
              <button
                onClick={() => setScope('org')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${scope === 'org' ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              >
                <Building2 size={12} /> Whole Org
              </button>
            </div>
          )}

          {/* Time filter */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700/50 p-1 rounded-lg">
            {(['today', 'week', 'month'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  filter === f ? 'bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {f === 'today' ? t('common.today') : f === 'week' ? t('common.thisWeek') : t('common.thisMonth')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <PageSkeleton />
      ) : people.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mb-3">
            <CheckCircle size={26} className="text-green-400" />
          </div>
          <p className="text-sm font-medium text-gray-700">All hands on deck!</p>
          <p className="text-xs text-gray-400 mt-1">
            Nobody is on leave {filterLabel} {scopeLabel}.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {people.map((person) => {
            const col = personColor(person.userId, false);
            return (
              <div
                key={person.userId}
                className="bg-ds-surface border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-3">
                  <UserAvatar name={person.name} avatarUrl={person.avatarUrl} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{person.name}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {person.groups.map((g, i) => (
                        <span key={i} className={`inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${col.bg} ${col.border} ${col.text}`}>
                          {g.leaveTypeName}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-500">
                      <Calendar size={11} className="shrink-0" />
                      <span>
                        {person.startDate === person.endDate
                          ? formatDate(person.startDate)
                          : `${formatDate(person.startDate)} – ${formatDate(person.endDate)}`}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {person.totalDays} day{person.totalDays !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Returns which Nth Saturday (1–5) a given date is within its month.
function getNthSaturday(year: number, month: number, date: number): number {
  let count = 0;
  for (let d = 1; d <= date; d++) {
    if (new Date(year, month, d).getDay() === 6) count++;
  }
  return count;
}

// Returns true if the given day (0=Sun,6=Sat) falls on a non-working day per policy.
function isWeekendOff(dayOfWeek: number, year: number, month: number, date: number, policy: string): boolean {
  if (policy === 'all_on') return false;
  if (dayOfWeek === 0) return true; // Sunday always off (for all except all_on)
  if (dayOfWeek !== 6) return false;
  // Saturday logic
  if (policy === 'all_off') return true;
  const nth = getNthSaturday(year, month, date);
  if (policy === '1st_3rd_off')     return nth === 1 || nth === 3;
  if (policy === '2nd_4th_off')     return nth === 2 || nth === 4;
  if (policy === '2nd_4th_5th_off') return nth === 2 || nth === 4 || nth === 5;
  if (policy === 'alternate_off')   return nth % 2 === 1;
  // All Saturdays off EXCEPT the 5th Saturday (quarterly), which is a working day
  if (policy === '5th_sat_working') return nth !== 5; // 5th Sat → working; 1st–4th → off
  return true; // default: all_off
}

// Returns true if this is the 5th Saturday in the month AND policy treats it as a working day
function is5thSatWorking(dayOfWeek: number, year: number, month: number, date: number, policy: string): boolean {
  return policy === '5th_sat_working' && dayOfWeek === 6 && getNthSaturday(year, month, date) === 5;
}


// ── Planning Tab (Team + Org calendar, merged) ────────────────────────────────

const PLAN_PAGE_SIZE = 7;

const PlanningTab = ({ canViewOrg }: { canViewOrg: boolean }) => {
  const { user } = useAuth();
  const now = new Date();
  const [scope, setScope] = useState<'team' | 'org'>('team');
  const [viewDate, setViewDate] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  // List-view sub-state
  const [listTab, setListTab] = useState<'leaves' | 'holidays'>('leaves');
  const [listPage, setListPage] = useState(0);
  const [listFilterUser, setListFilterUser] = useState('all');
  const [listFilterType, setListFilterType] = useState('all');
  const [listSearch, setListSearch] = useState('');
  const [listDateFrom, setListDateFrom] = useState('');
  const [listDateTo, setListDateTo] = useState('');

  const resetListFilters = () => {
    setListFilterUser('all');
    setListFilterType('all');
    setListSearch('');
    setListDateFrom('');
    setListDateTo('');
    setListPage(0);
  };

  // Reset list filters when switching scope or month
  useEffect(() => {
    setSelectedUser('all');
    resetListFilters();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, viewDate]);

  const yr     = viewDate.getFullYear();
  const mo     = viewDate.getMonth();
  const moStr  = String(mo + 1).padStart(2, '0');
  const yrStr  = String(yr);
  const daysInMonth = new Date(yr, mo + 1, 0).getDate();
  const firstDow    = new Date(yr, mo, 1).getDay();
  const dateFrom = `${yrStr}-${moStr}-01`;
  const dateTo   = `${yrStr}-${moStr}-${String(daysInMonth).padStart(2, '0')}`;
  const todayStr = format(now, 'yyyy-MM-dd');

  const { data: leaveData, isLoading, error } = useLeaveCalendar({ date_from: dateFrom, date_to: dateTo, scope });
  const { data: calConfig } = useCalendarConfig();
  const holidayParams: Record<string, string> = { year: yrStr };
  if (user?.officeLocationId) holidayParams.locationId = user.officeLocationId;
  const { data: holidayData } = useCompanyCalendar(holidayParams);

  const rawEntries: any[] = (leaveData as any[]) ?? [];
  const holidays: Holiday[] = (holidayData as Holiday[]) ?? [];

  const weekendPolicy: { default: string; perLocation: Record<string, string> } =
    (calConfig as any)?.weekendPolicy ?? { default: 'all_off', perLocation: {} };
  const userPolicy = user?.officeLocationId
    ? (weekendPolicy.perLocation?.[user.officeLocationId] ?? weekendPolicy.default)
    : weekendPolicy.default;

  // Collect unique team members from leave data
  const teamMembers = Array.from(
    new Map(rawEntries.map((e: any) => [String(e.userId ?? e.user_id ?? ''), e.userName ?? e.user_name ?? '']))
      .entries()
  ).filter(([id, name]) => id && name).map(([id, name]) => ({ id, name }));

  // Expand multi-day leaves into per-date entries, optionally filtered by user
  const leaveByDate: Record<string, any[]> = {};
  rawEntries.forEach((e: any) => {
    if (selectedUser !== 'all' && String(e.userId ?? e.user_id ?? '') !== selectedUser) return;
    const start = parseISO(e.startDate || e.start_date || e.date || '');
    const end   = parseISO(e.endDate   || e.end_date   || e.date || '');
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;
    let cur = start;
    while (cur <= end) {
      const ds = format(cur, 'yyyy-MM-dd');
      if (!leaveByDate[ds]) leaveByDate[ds] = [];
      leaveByDate[ds].push({ ...e, date: ds, isOwn: String(e.userId ?? e.user_id ?? '') === String(user?.id ?? '') });
      cur = addDays(cur, 1);
    }
  });

  const holidayByDate = holidays.reduce<Record<string, string>>((acc, h) => {
    if (h.holiday_date) acc[h.holiday_date] = h.name;
    return acc;
  }, {});

  const cells: Array<{ day: number | null; dateStr: string | null }> = [];
  for (let i = 0; i < firstDow; i++) cells.push({ day: null, dateStr: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, dateStr: `${yrStr}-${moStr}-${String(d).padStart(2, '0')}` });
  }

  // Total unique people on leave this month
  const uniqueOnLeave = new Set(rawEntries.map((e: any) => String(e.userId ?? e.user_id ?? ''))).size;

  // List-view: unique leave types for filter dropdown
  const uniqueLeaveTypes = Array.from(new Set(rawEntries.map((e: any) => e.leaveTypeName ?? e.leave_type_name ?? '').filter(Boolean)));

  // List-view: filtered + paginated leave records
  const filteredLeaves = rawEntries
    .map((e: any) => ({ ...e, isOwn: String(e.userId ?? e.user_id ?? '') === String(user?.id ?? '') }))
    .filter((e: any) => {
      if (listFilterUser !== 'all' && String(e.userId ?? e.user_id ?? '') !== listFilterUser) return false;
      if (listFilterType !== 'all' && (e.leaveTypeName ?? e.leave_type_name ?? '') !== listFilterType) return false;
      if (listSearch.trim()) {
        const name = (e.userName ?? e.user_name ?? '').toLowerCase();
        if (!name.includes(listSearch.trim().toLowerCase())) return false;
      }
      // Date range overlap: leave overlaps [listDateFrom, listDateTo] if start <= to && end >= from
      const leaveStart = e.startDate || e.start_date || '';
      const leaveEnd   = e.endDate   || e.end_date   || leaveStart;
      if (listDateFrom && leaveEnd < listDateFrom) return false;
      if (listDateTo   && leaveStart > listDateTo)   return false;
      return true;
    })
    .sort((a: any, b: any) => (a.startDate || a.start_date || '').localeCompare(b.startDate || b.start_date || ''));

  const totalListPages = Math.max(1, Math.ceil(filteredLeaves.length / PLAN_PAGE_SIZE));
  const safeListPage   = Math.min(listPage, totalListPages - 1);
  const pagedLeaves    = filteredLeaves.slice(safeListPage * PLAN_PAGE_SIZE, (safeListPage + 1) * PLAN_PAGE_SIZE);

  return (
    <div className="space-y-4">
      {error && <Alert type="error" message={(error as Error).message} />}

      {/* Scope toggle (only visible to users with org view permission) */}
      {canViewOrg && (
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700/50 p-1 rounded-lg w-fit">
          <button
            onClick={() => setScope('team')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${scope === 'team' ? 'bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
          >
            <Users size={13} /> Team
          </button>
          <button
            onClick={() => setScope('org')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${scope === 'org' ? 'bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
          >
            <Building2 size={13} /> Org-wide
          </button>
        </div>
      )}

      {/* Summary banner */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${scope === 'org' ? 'bg-purple-50' : 'bg-blue-50'}`}>
              <Users size={16} className={scope === 'org' ? 'text-purple-600' : 'text-blue-600'} />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{uniqueOnLeave}</p>
              <p className="text-xs text-gray-500">{scope === 'org' ? 'People on leave this month' : 'Team members on leave'}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
              <Calendar size={16} className="text-green-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{rawEntries.length}</p>
              <p className="text-xs text-gray-500">{scope === 'org' ? 'Approved leaves (org-wide)' : 'Approved leaves this month'}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
              <Building2 size={16} className="text-red-500" />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{holidays.length}</p>
              <p className="text-xs text-gray-500">Public holidays</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => setViewDate(new Date(yr, mo - 1, 1))} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
            <span className="text-gray-600 text-sm leading-none">‹</span>
          </button>
          <h3 className="text-base font-semibold text-gray-900 w-40 text-center">
            {MONTH_NAMES[mo]} {yr}
          </h3>
          <button onClick={() => setViewDate(new Date(yr, mo + 1, 1))} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
            <span className="text-gray-600 text-sm leading-none">›</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Member filter — only in team scope */}
          {scope === 'team' && teamMembers.length > 0 && (
            <select
              className="form-select text-xs py-1.5 pr-8"
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
            >
              <option value="all">All members</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          )}
          {/* View toggle */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700/50 p-1 rounded-lg">
            <button
              onClick={() => setView('calendar')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${view === 'calendar' ? 'bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
            >
              Calendar
            </button>
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${view === 'list' ? 'bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center flex-wrap gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-100 border border-blue-300 inline-block" />You</span>
        <span className="flex items-center gap-1.5">
          <span className="flex gap-0.5">
            {[PERSON_PALETTE[1], PERSON_PALETTE[2], PERSON_PALETTE[3]].map((p, i) => (
              <span key={i} className={`w-3 h-3 rounded-sm ${p.bg} ${p.border} inline-block border`} />
            ))}
          </span>
          Team (colour per leave type)
        </span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-100 border border-red-200 inline-block" />Holiday</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-50 border border-blue-200 inline-block" />Today</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-rose-50 border border-rose-200 inline-block" />Weekend off</span>
      </div>

      {isLoading ? (
        <PageSkeleton />
      ) : view === 'calendar' ? (
        <Card padding={false}>
          <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-700">
            {WEEK_DAYS.map((d) => (
              <div key={d} className="py-2.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 divide-x divide-gray-50 dark:divide-gray-700">
            {cells.map((cell, idx) => {
              if (!cell.day || !cell.dateStr) {
                return <div key={`blank-${idx}`} className="min-h-[80px] bg-gray-50/40 dark:bg-gray-800/20" />;
              }
              const ds = cell.dateStr;
              const dayOfWeek = (firstDow + cell.day - 1) % 7;
              const isDayOff = isWeekendOff(dayOfWeek, yr, mo, cell.day, userPolicy);
              const isWorkingSat = dayOfWeek === 6 && !isDayOff;
              const isQuarterlySat = is5thSatWorking(dayOfWeek, yr, mo, cell.day, userPolicy);
              const isToday = ds === todayStr;
              const leavesOnDay = leaveByDate[ds] ?? [];
              const holiday = holidayByDate[ds];
              const ownLeaveToday = leavesOnDay.some((e: any) => e.isOwn);

              const hasEvents = leavesOnDay.length > 0 || !!holiday;
              const popoverRight = dayOfWeek >= 4;
              const popoverUp   = idx >= cells.length - 7;

              return (
                <div
                  key={ds}
                  className={`relative min-h-[80px] p-1.5 border-b border-gray-100 dark:border-gray-700 transition-colors
                    ${isToday ? 'bg-blue-50 dark:bg-blue-950/40' : holiday ? 'bg-red-50/50 dark:bg-red-950/25' : isDayOff ? 'bg-rose-50/70 dark:bg-rose-950/30' : ownLeaveToday ? 'bg-blue-50/40 dark:bg-blue-950/20' : 'bg-white dark:bg-transparent'}
                    ${hasEvents ? 'cursor-pointer' : ''}
                  `}
                  onMouseEnter={() => hasEvents && setHoveredDate(ds)}
                  onMouseLeave={() => setHoveredDate(null)}
                >
                  <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold mb-1
                    ${isToday ? 'bg-blue-600 text-white' : (isDayOff && !holiday) ? 'text-rose-400' : holiday ? 'text-red-500' : (isWorkingSat || isQuarterlySat) ? 'text-orange-500' : 'text-gray-700'}
                  `}>
                    {cell.day}
                  </div>

                  {isDayOff && !holiday && (
                    <div className="text-[9px] font-medium text-rose-600 bg-rose-100 border border-rose-200 px-1 py-0.5 rounded truncate mb-0.5">
                      {dayOfWeek === 0 ? 'Sunday' : 'Saturday'}
                    </div>
                  )}
                  {(isWorkingSat || isQuarterlySat) && !holiday && (
                    <div className="text-[9px] font-medium text-orange-600 bg-orange-50 border border-orange-200 px-1 py-0.5 rounded truncate mb-0.5">
                      {isQuarterlySat ? 'Working (5th)' : 'Working'}
                    </div>
                  )}
                  {holiday && (
                    <div className="text-[9px] font-medium text-red-700 bg-red-100 border border-red-200 px-1 py-0.5 rounded truncate mb-0.5" title={holiday}>
                      {holiday}
                    </div>
                  )}

                  {leavesOnDay.slice(0, 3).map((e: any, i: number) => {
                    const col = leaveTypeColor(String(e.leaveTypeId ?? e.leave_type_id ?? ''), e.leaveTypeName ?? '', e.isOwn);
                    return (
                      <div key={i} className={`flex items-center gap-1 mb-0.5 px-1 py-0.5 rounded border ${col.bg} ${col.border}`}>
                        <UserAvatar name={e.userName} avatarUrl={e.userAvatarUrl} size="xs" />
                        <div className="min-w-0">
                          <div className={`text-[9px] truncate leading-tight font-medium ${col.text}`}>
                            {e.isOwn ? 'You' : e.userName.split(' ')[0]}
                          </div>
                          <div className={`text-[8px] truncate leading-tight opacity-75 ${col.text}`}>
                            {e.leaveTypeName}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {leavesOnDay.length > 3 && (
                    <div className="text-[9px] text-gray-400 font-medium px-1">+{leavesOnDay.length - 3} more</div>
                  )}

                  {/* Hover popover */}
                  {hoveredDate === ds && hasEvents && (
                    <div
                      className={`absolute z-50 w-72 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-3
                        ${popoverRight ? 'right-0' : 'left-0'}
                        ${popoverUp   ? 'bottom-full mb-1' : 'top-full mt-1'}
                      `}
                      onMouseEnter={() => setHoveredDate(ds)}
                      onMouseLeave={() => setHoveredDate(null)}
                    >
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-xs font-semibold text-gray-800 dark:text-gray-100">
                          {format(parseISO(ds), 'EEE, MMM d')}
                        </span>
                        {leavesOnDay.length > 0 && (
                          <span className="text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                            {leavesOnDay.length} on leave
                          </span>
                        )}
                      </div>
                      {holiday && (
                        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100 dark:border-gray-700">
                          <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                          <span className="text-xs font-medium text-red-600">{holiday}</span>
                          <span className="ml-auto text-[10px] text-gray-400">Holiday</span>
                        </div>
                      )}
                      {leavesOnDay.length > 0 && (
                        <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                          {leavesOnDay.map((e: any, i: number) => {
                            const col = leaveTypeColor(String(e.leaveTypeId ?? e.leave_type_id ?? ''), e.leaveTypeName ?? '', e.isOwn);
                            return (
                              <div key={i} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border ${col.bg} ${col.border}`}>
                                <UserAvatar name={e.userName} avatarUrl={e.userAvatarUrl} size="sm" />
                                <div className="flex-1 min-w-0">
                                  <div className={`text-xs font-semibold truncate ${col.text}`}>
                                    {e.userName}{e.isOwn ? ' (You)' : ''}
                                  </div>
                                  <div className={`text-[10px] opacity-80 ${col.text}`}>{e.leaveTypeName}</div>
                                </div>
                                {e.isHalfDay && (
                                  <span className="text-[9px] bg-white/60 dark:bg-gray-800/60 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200 shrink-0">½ day</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        /* ── List view — Employee Leaves / Holidays sub-tabs ── */
        <div className="space-y-3">

          {/* Sub-tab bar */}
          <div className="flex items-center border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => { setListTab('leaves'); setListPage(0); }}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${listTab === 'leaves' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              <Users size={14} />
              {scope === 'org' ? 'All Employee Leaves' : 'Team Leaves'}
              {rawEntries.length > 0 && (
                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${listTab === 'leaves' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                  {rawEntries.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setListTab('holidays')}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${listTab === 'holidays' ? 'border-red-500 text-red-500' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              <Building2 size={14} />
              Public Holidays
              {holidays.length > 0 && (
                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${listTab === 'holidays' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                  {holidays.length}
                </span>
              )}
            </button>
          </div>

          {listTab === 'leaves' ? (
            <Card padding={false}>
              {/* Filter bar */}
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 space-y-2">
                {/* Row 1: search + dropdowns */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Name search */}
                  <div className="relative min-w-[160px] flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    </span>
                    <input
                      type="text"
                      placeholder="Search by name…"
                      value={listSearch}
                      onChange={e => { setListSearch(e.target.value); setListPage(0); }}
                      className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <select
                    value={listFilterUser}
                    onChange={e => { setListFilterUser(e.target.value); setListPage(0); }}
                    className="form-select text-xs py-1.5 pr-7 min-w-[130px]"
                  >
                    <option value="all">All people</option>
                    {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <select
                    value={listFilterType}
                    onChange={e => { setListFilterType(e.target.value); setListPage(0); }}
                    className="form-select text-xs py-1.5 pr-7 min-w-[140px]"
                  >
                    <option value="all">All leave types</option>
                    {uniqueLeaveTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                {/* Row 2: date range + record count + clear */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-500 shrink-0">Date:</span>
                  <input
                    type="date"
                    value={listDateFrom}
                    max={listDateTo || undefined}
                    onChange={e => { setListDateFrom(e.target.value); setListPage(0); }}
                    className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="text-xs text-gray-400">to</span>
                  <input
                    type="date"
                    value={listDateTo}
                    min={listDateFrom || undefined}
                    onChange={e => { setListDateTo(e.target.value); setListPage(0); }}
                    className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {(listFilterUser !== 'all' || listFilterType !== 'all' || listSearch || listDateFrom || listDateTo) && (
                    <button
                      onClick={resetListFilters}
                      className="text-xs text-blue-500 hover:text-blue-700 font-medium"
                    >
                      Clear all
                    </button>
                  )}
                  <span className="ml-auto text-xs text-gray-400">
                    {filteredLeaves.length} record{filteredLeaves.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Table */}
              {isLoading ? (
                <div className="px-5 py-8"><PageSkeleton /></div>
              ) : pagedLeaves.length === 0 ? (
                <div className="px-5 py-8">
                  <EmptyState
                    title="No leaves found"
                    description={listFilterUser !== 'all' || listFilterType !== 'all' ? 'Try adjusting your filters.' : scope === 'org' ? 'No approved leaves across the org this period.' : 'No approved team leaves this period.'}
                  />
                </div>
              ) : (
                <div className="overflow-x-auto overflow-y-auto max-h-[420px]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 z-10">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Person</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Leave Type</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">From</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">To</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Days</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                      {pagedLeaves.map((e: any, i: number) => {
                        const col = personColor(String(e.userId ?? e.user_id ?? ''), e.isOwn);
                        const days = calcDays(e.startDate || e.start_date || '', e.endDate || e.end_date || '');
                        return (
                          <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <UserAvatar name={e.userName} avatarUrl={e.userAvatarUrl} size="sm" />
                                <span className={`text-sm font-medium ${col.text}`}>
                                  {e.isOwn ? `${e.userName} (You)` : e.userName}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{e.leaveTypeName}</td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatDate(e.startDate || e.start_date)}</td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatDate(e.endDate || e.end_date)}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${col.bg} ${col.text} border ${col.border}`}>
                                {days} day{days !== 1 ? 's' : ''}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {totalListPages > 1 && (() => {
                const WIN = 5;
                const half = Math.floor(WIN / 2);
                let start = Math.max(0, safeListPage - half);
                let end   = Math.min(totalListPages - 1, start + WIN - 1);
                if (end - start < WIN - 1) start = Math.max(0, end - WIN + 1);
                const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);
                return (
                  <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs text-gray-500">
                      Showing {safeListPage * PLAN_PAGE_SIZE + 1}–{Math.min((safeListPage + 1) * PLAN_PAGE_SIZE, filteredLeaves.length)} of {filteredLeaves.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        disabled={safeListPage === 0}
                        onClick={() => setListPage(p => p - 1)}
                        className="px-2.5 py-1 text-xs border border-gray-200 rounded-md disabled:opacity-40 hover:bg-gray-50 transition-colors"
                      >
                        ‹ Prev
                      </button>
                      {start > 0 && (
                        <>
                          <button onClick={() => setListPage(0)} className="w-7 h-7 text-xs rounded-md border border-gray-200 hover:bg-gray-50 transition-colors">1</button>
                          {start > 1 && <span className="text-xs text-gray-400 px-0.5">…</span>}
                        </>
                      )}
                      {pages.map(p => (
                        <button
                          key={p}
                          onClick={() => setListPage(p)}
                          className={`w-7 h-7 text-xs rounded-md border transition-colors ${p === safeListPage ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 hover:bg-gray-50'}`}
                        >
                          {p + 1}
                        </button>
                      ))}
                      {end < totalListPages - 1 && (
                        <>
                          {end < totalListPages - 2 && <span className="text-xs text-gray-400 px-0.5">…</span>}
                          <button onClick={() => setListPage(totalListPages - 1)} className="w-7 h-7 text-xs rounded-md border border-gray-200 hover:bg-gray-50 transition-colors">{totalListPages}</button>
                        </>
                      )}
                      <button
                        disabled={safeListPage === totalListPages - 1}
                        onClick={() => setListPage(p => p + 1)}
                        className="px-2.5 py-1 text-xs border border-gray-200 rounded-md disabled:opacity-40 hover:bg-gray-50 transition-colors"
                      >
                        Next ›
                      </button>
                    </div>
                  </div>
                );
              })()}
            </Card>
          ) : (
            /* ── Holidays sub-tab ── */
            <Card padding={false}>
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                <Building2 size={14} className="text-red-500" />
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Public Holidays — {MONTH_NAMES[mo]} {yr}</h4>
                <span className="ml-auto text-xs text-gray-400">{holidays.length} holiday{holidays.length !== 1 ? 's' : ''}</span>
              </div>
              {holidays.length === 0 ? (
                <div className="px-5 py-8">
                  <EmptyState title="No public holidays" description="No holidays have been added for this month." />
                </div>
              ) : (
                <div className="divide-y divide-gray-50 dark:divide-gray-700">
                  {[...holidays]
                    .sort((a, b) => (a.holiday_date ?? '').localeCompare(b.holiday_date ?? ''))
                    .map((h) => (
                    <div key={h.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                      <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 flex flex-col items-center justify-center shrink-0">
                        <span className="text-[9px] font-semibold text-red-600 uppercase leading-none">
                          {h.holiday_date ? format(parseISO(h.holiday_date), 'MMM') : ''}
                        </span>
                        <span className="text-sm font-bold text-red-700 leading-none">
                          {h.holiday_date ? format(parseISO(h.holiday_date), 'd') : ''}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{h.name}</p>
                        <p className="text-xs text-gray-400">
                          {h.holiday_date ? format(parseISO(h.holiday_date), 'EEEE, dd MMMM yyyy') : ''}
                        </p>
                      </div>
                      {(h.is_optional === true || h.is_optional === 'true') && (
                        <span className="text-xs px-2 py-0.5 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-400 rounded-full shrink-0">
                          Optional
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

// ── Balance Tab ───────────────────────────────────────────────────────────────

const BalanceTab = () => {
  const { t } = useI18n();
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
                  <span className="text-lg font-bold text-blue-700">{b.remaining ?? b.total_available}</span>
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
                    <p className="text-xs text-gray-400">{t('leave.balance.used')}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-yellow-600">{b.pending}</p>
                    <p className="text-xs text-gray-400">{t('leave.balance.pending')}</p>
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

interface HolidayExtended extends Holiday {
  source?: 'org' | 'location';
  locationId?: string;
  locationName?: string;
}

interface HolidayForm {
  name: string;
  holiday_date: string;
  is_optional: boolean;
}

interface HolidayFormExtended extends HolidayForm {
  location_id?: string;
}

interface OrgLocation {
  id: string;
  name: string;
  country?: string;
  timezone?: string;
}



export const CompanyCalendarTab = () => {
  const { user } = useAuth();
  const canManage = hasPermission(user, PERMISSIONS.LEAVE_ADMIN);
  const { t } = useI18n();

  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const years = Array.from({ length: 3 }, (_, i) => String(now.getFullYear() - 1 + i));

  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; locationId?: string } | null>(null);
  const [editTarget, setEditTarget] = useState<HolidayExtended | null>(null);
  const [submitError, setSubmitError] = useState('');
  const [editError, setEditError] = useState('');
  // Multi-location selection for Add Holiday
  const [addLocIds, setAddLocIds] = useState<string[]>([]);
  const [addOrgWide, setAddOrgWide] = useState(false);

  // Calendar config (locations only — for holiday filtering)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: config } = useCalendarConfig() as { data: any };
  const locations: OrgLocation[] = config?.locations ?? [];

  // Holidays — pass locationId for specific tabs so backend merges org-wide + location
  const calParams: Record<string, string> = { year };
  if (selectedLocation !== 'all') calParams.locationId = selectedLocation;
  const { data: raw = [], isLoading, error } = useCompanyCalendar(calParams);

  const holidays: HolidayExtended[] = (raw as HolidayExtended[]).sort(
    (a, b) => (a.holiday_date ?? '').localeCompare(b.holiday_date ?? '')
  );

  const createHoliday = useCreateHoliday();
  const updateHoliday = useUpdateHoliday();
  const deleteHoliday = useDeleteHoliday();

  // Add holiday form
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<HolidayFormExtended>({
    defaultValues: { is_optional: false },
  });

  // Edit holiday form
  const { register: regEdit, handleSubmit: handleEditSubmit, reset: resetEdit, formState: { isSubmitting: editSubmitting } } = useForm<HolidayFormExtended>();

  const openEdit = (h: HolidayExtended) => {
    setEditTarget(h);
    setEditError('');
    resetEdit({
      name: h.name,
      holiday_date: h.holiday_date,
      is_optional: h.is_optional === true || h.is_optional === 'true',
      location_id: h.locationId ?? '',
    });
  };

  const openAdd = () => {
    reset({ is_optional: false });
    // Pre-select the current location tab, or nothing for "all"
    if (selectedLocation !== 'all') {
      setAddLocIds([selectedLocation]);
      setAddOrgWide(false);
    } else {
      setAddLocIds([]);
      setAddOrgWide(locations.length === 0); // if no locations, default org-wide
    }
    setSubmitError('');
    setAddOpen(true);
  };

  const toggleAddLoc = (locId: string) => {
    setAddLocIds((prev) =>
      prev.includes(locId) ? prev.filter((id) => id !== locId) : [...prev, locId]
    );
  };

  const onAdd = async (data: HolidayFormExtended) => {
    try {
      setSubmitError('');
      const base = { name: data.name, holiday_date: data.holiday_date, is_optional: data.is_optional, year: data.holiday_date.slice(0, 4) };
      if (addOrgWide || addLocIds.length === 0) {
        await createHoliday.mutateAsync(base);
      } else {
        for (const locId of addLocIds) {
          await createHoliday.mutateAsync({ ...base, location_id: locId });
        }
      }
      reset({ is_optional: false });
      setAddLocIds([]);
      setAddOrgWide(false);
      setAddOpen(false);
    } catch (err: unknown) {
      setSubmitError((err as Error).message);
    }
  };

  const onEdit = async (data: HolidayFormExtended) => {
    if (!editTarget) return;
    try {
      setEditError('');
      await updateHoliday.mutateAsync({
        id: editTarget.id,
        locationId: editTarget.locationId,
        data: { name: data.name, holiday_date: data.holiday_date, is_optional: data.is_optional },
      });
      setEditTarget(null);
    } catch (err: unknown) {
      setEditError((err as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteHoliday.mutateAsync(deleteTarget);
      setDeleteTarget(null);
    } catch { /* noop */ }
  };

  const isOptional = (h: HolidayExtended) => h.is_optional === true || h.is_optional === 'true';
  const getLocationName = (locId?: string) => locations.find((l) => l.id === locId)?.name ?? locId ?? '';

  return (
    <div className="space-y-5">
      {error && <Alert type="error" message={(error as Error).message} />}

      {/* Holiday Calendar */}
      <Card padding={false}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-900">Holidays &amp; Company Off Days</h3>
            <div className="flex items-center gap-2">
              <select className="form-select text-sm py-1.5" value={year} onChange={(e) => setYear(e.target.value)}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              {canManage && (
                <Button size="sm" icon={<Plus size={14} />} onClick={openAdd}>
                  Add Holiday
                </Button>
              )}
            </div>
          </div>

          {/* Location filter tabs — All + each location (no "Org-wide" tab) */}
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {[{ id: 'all', name: 'All' }, ...locations].map((loc) => (
              <button
                key={loc.id}
                onClick={() => setSelectedLocation(loc.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  selectedLocation === loc.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {loc.name}
              </button>
            ))}
          </div>
        </div>

        {/* Holiday list */}
        {isLoading ? (
          <PageSkeleton />
        ) : holidays.length === 0 ? (
          <EmptyState title="No holidays configured" description={selectedLocation === 'all' ? 'Add public holidays and company off days.' : `No holidays for this location yet.`} />
        ) : (
          <div className="divide-y divide-gray-50">
            {holidays.map((h) => (
              <div key={h.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/70 group">
                {/* Date column */}
                <div className="w-[90px] shrink-0">
                  <p className="text-sm font-semibold text-gray-900">{formatDate(h.holiday_date)}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{h.holiday_date ? format(parseISO(h.holiday_date), 'EEEE') : ''}</p>
                </div>

                {/* Name + location badge */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{h.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {h.locationId ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                        <MapPin size={9} />{getLocationName(h.locationId)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
                        All locations
                      </span>
                    )}
                    {isOptional(h) && (
                      <span className="inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-100">
                        Optional
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions — only shown to admins, visible on hover */}
                {canManage && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => openEdit(h)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors rounded"
                      title="Edit holiday"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget({ id: h.id, locationId: h.locationId })}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors rounded"
                      title="Delete holiday"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Add Holiday Modal */}
      <Modal open={addOpen} onClose={() => { setAddOpen(false); reset({ is_optional: false }); setAddLocIds([]); setAddOrgWide(false); }} title="Add Holiday" size="sm">
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

          {/* Multi-location selection */}
          {locations.length > 0 && (
            <div>
              <label className="form-label">Apply to Locations</label>
              <div className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
                {/* All locations option */}
                <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-blue-600"
                    checked={addOrgWide}
                    onChange={(e) => {
                      setAddOrgWide(e.target.checked);
                      if (e.target.checked) setAddLocIds([]);
                    }}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-800">All locations</p>
                    <p className="text-xs text-gray-400">Common holiday — applies org-wide</p>
                  </div>
                </label>

                {/* Individual locations */}
                {locations.map((loc) => (
                  <label
                    key={loc.id}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${addOrgWide ? 'opacity-40 pointer-events-none' : 'hover:bg-gray-50'}`}
                  >
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-blue-600"
                      checked={addLocIds.includes(loc.id)}
                      onChange={() => toggleAddLoc(loc.id)}
                      disabled={addOrgWide}
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-800">{loc.name}</p>
                      {loc.country && <p className="text-xs text-gray-400">{loc.country}</p>}
                    </div>
                  </label>
                ))}
              </div>
              {!addOrgWide && addLocIds.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">Select at least one location, or choose "All locations".</p>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <input type="checkbox" id="is_optional" className="rounded border-gray-300" {...register('is_optional')} />
            <label htmlFor="is_optional" className="text-sm text-gray-700 cursor-pointer">Optional holiday <span className="text-gray-400">(employee can choose to take it)</span></label>
          </div>

          <ModalActions>
            <Button variant="outline" type="button" onClick={() => { setAddOpen(false); setAddLocIds([]); setAddOrgWide(false); }}>{t('common.cancel')}</Button>
            <Button
              type="submit"
              loading={isSubmitting}
              disabled={locations.length > 0 && !addOrgWide && addLocIds.length === 0}
              icon={<Plus size={14} />}
            >
              {addLocIds.length > 1 ? `Add to ${addLocIds.length} locations` : 'Add Holiday'}
            </Button>
          </ModalActions>
        </form>
      </Modal>

      {/* Edit Holiday Modal */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Holiday" size="sm">
        <form onSubmit={handleEditSubmit(onEdit)} className="space-y-4">
          {editError && <Alert type="error" message={editError} />}
          <div>
            <label className="form-label">Holiday Name *</label>
            <input className="form-input" placeholder="e.g. Republic Day" {...regEdit('name', { required: 'Required' })} />
          </div>
          <div>
            <label className="form-label">Date *</label>
            <input type="date" className="form-input" {...regEdit('holiday_date', { required: 'Required' })} />
          </div>
          {/* Location is not editable — shown read-only */}
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 flex items-center gap-2">
            <MapPin size={13} className="text-gray-400 shrink-0" />
            <span className="text-sm text-gray-600">
              {editTarget?.locationId ? getLocationName(editTarget.locationId) : 'All locations'}
            </span>
            <span className="text-xs text-gray-400 ml-1">(location cannot be changed)</span>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="edit_optional" className="rounded border-gray-300" {...regEdit('is_optional')} />
            <label htmlFor="edit_optional" className="text-sm text-gray-700 cursor-pointer">Optional holiday</label>
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setEditTarget(null)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={editSubmitting} icon={<Pencil size={14} />}>Save Changes</Button>
          </ModalActions>
        </form>
      </Modal>

      {/* Delete Confirm */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Holiday" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Are you sure you want to delete this holiday?</p>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" loading={deleteHoliday.isPending} onClick={handleDelete}>{t('common.delete')}</Button>
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

const LEAVE_COLORS = [
  { bg: 'bg-blue-50',   border: 'border-blue-200',   num: 'text-blue-700',   bar: 'bg-blue-500',   pill: 'bg-blue-100 text-blue-700 border-blue-200'   },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', num: 'text-emerald-700', bar: 'bg-emerald-500', pill: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { bg: 'bg-amber-50',  border: 'border-amber-200',  num: 'text-amber-700',  bar: 'bg-amber-500',  pill: 'bg-amber-100 text-amber-700 border-amber-200'  },
  { bg: 'bg-purple-50', border: 'border-purple-200', num: 'text-purple-700', bar: 'bg-purple-500', pill: 'bg-purple-100 text-purple-700 border-purple-200' },
  { bg: 'bg-rose-50',   border: 'border-rose-200',   num: 'text-rose-700',   bar: 'bg-rose-500',   pill: 'bg-rose-100 text-rose-700 border-rose-200'   },
];

const getLeaveColor = (idx: number) => LEAVE_COLORS[idx % LEAVE_COLORS.length];

export const LeaveBalancesTab = () => {
  const [setOpen, setSetOpen] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const { t } = useI18n();

  const { data: raw = [], isLoading, error } = useAllLeaveBalances();
  const { data: typesData } = useLeaveTypes();
  const { data: usersData = [] } = useUsers();
  const leaveTypes: Array<{ id: string; name: string }> = (typesData as Array<{ id: string; name: string }>) ?? [];
  const allUsers = usersData as Array<{ id: string; name: string; email: string }>;

  const setBalance = useSetLeaveBalance();
  const deleteBalance = useDeleteLeaveBalance();
  const balances: BalanceRecord[] = raw as BalanceRecord[];

  const handleDelete = (b: BalanceRecord) => {
    if (!window.confirm(`Delete ${b.leaveTypeName} balance for ${b.userName ?? b.userId}? This cannot be undone.`)) return;
    deleteBalance.mutate(b.id);
  };

  // Use || not ?? so empty-string userName falls back to userId
  const getUserKey = (b: BalanceRecord) => b.userName || b.userId || 'Unknown';

  const userKeys = Array.from(
    new Set(balances.map(getUserKey).filter(Boolean))
  ).sort() as string[];

  const filtered = filterUser
    ? balances.filter((b) => getUserKey(b) === filterUser)
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

  // Group by user key for card view
  const byUser = filtered.reduce<Record<string, BalanceRecord[]>>((acc, b) => {
    const key = getUserKey(b);
    if (!acc[key]) acc[key] = [];
    acc[key].push(b);
    return acc;
  }, {});

  const usedPct = (b: BalanceRecord) =>
    b.allocated > 0 ? Math.min(100, ((b.used + b.pending) / b.allocated) * 100) : 0;

  return (
    <div className="space-y-5">
      {error && <Alert type="error" message={(error as Error).message} />}

      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <label className="form-label">Filter by Employee</label>
          <select
            className="form-select"
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
          >
            <option value="">All employees</option>
            {userKeys.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2">
          {/* Card / List toggle */}
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-600 bg-ds-surface overflow-hidden">
            <button
              onClick={() => setViewMode('card')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                viewMode === 'card' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <LayoutGrid size={14} /> Cards
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <LayoutList size={14} /> List
            </button>
          </div>
          <Button icon={<Upload size={15} />} onClick={() => setSetOpen(true)}>
            Set Balance
          </Button>
        </div>
      </div>

      {isLoading ? (
        <PageSkeleton />
      ) : Object.keys(byUser).length === 0 ? (
        <EmptyState
          title="No balances found"
          description="Set leave balances for employees to get started."
        />
      ) : viewMode === 'card' ? (
        /* ── Card View ─────────────────────────────────────────────────────── */
        <div className="space-y-4">
          {Object.entries(byUser).map(([userKey, userBalances]) => {
            const displayName = userBalances[0]?.userName ?? userKey;
            const avatarUrl = userBalances[0]?.userAvatarUrl;
            return (
              <div
                key={userKey}
                className="bg-ds-surface rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm"
              >
                {/* Employee header */}
                <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800/60 dark:to-gray-700/30 border-b border-gray-100 dark:border-gray-700">
                  <UserAvatar name={displayName} avatarUrl={avatarUrl} size="md" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{displayName}</p>
                    <p className="text-xs text-gray-400">
                      {userBalances.length} leave type{userBalances.length !== 1 ? 's' : ''} configured
                    </p>
                  </div>
                </div>

                {/* Leave type cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
                  {userBalances.map((b, idx) => {
                    const col = getLeaveColor(idx);
                    const pct = usedPct(b);
                    return (
                      <div
                        key={b.leaveTypeId}
                        className={`p-3.5 rounded-xl border ${col.bg} ${col.border} flex flex-col gap-2`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-xs font-semibold text-gray-700 truncate">{b.leaveTypeName}</p>
                          <button
                            onClick={() => handleDelete(b)}
                            className="p-0.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                            title="Delete balance"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>

                        <div className="flex items-end justify-between">
                          <div>
                            <p className={`text-2xl font-bold leading-none ${col.num}`}>{b.remaining}</p>
                            <p className="text-xs text-gray-400 mt-0.5">remaining</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-gray-700">{b.allocated}</p>
                            <p className="text-xs text-gray-400">allocated</p>
                          </div>
                        </div>

                        {/* Usage bar */}
                        <div className="h-1.5 bg-white dark:bg-gray-700/60 rounded-full overflow-hidden border border-gray-200 dark:border-gray-600">
                          <div
                            className={`h-full ${col.bar} rounded-full transition-all`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>

                        <div className="flex justify-between text-xs text-gray-400">
                          <span>{b.used} used</span>
                          {b.pending > 0 && (
                            <span className="text-amber-500 font-medium">{b.pending} pending</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── List / Table View ─────────────────────────────────────────────── */
        <div className="bg-ds-surface rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    Employee
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    Leave Type
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    Allocated
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    Used
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    Pending
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    Remaining
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider w-36">
                    Usage
                  </th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {Object.entries(byUser).flatMap(([userKey, userBalances]) =>
                  userBalances.map((b, idx) => {
                    const displayName = b.userName ?? userKey;
                    const col = getLeaveColor(idx);
                    const pct = usedPct(b);
                    return (
                      <tr
                        key={`${b.userId}-${b.leaveTypeId}`}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        {/* Employee — show only on first leave type row per user */}
                        <td className="px-4 py-3">
                          {idx === 0 ? (
                            <div className="flex items-center gap-2.5">
                              <UserAvatar
                                name={displayName}
                                avatarUrl={b.userAvatarUrl}
                                size="sm"
                              />
                              <div>
                                <p className="font-semibold text-gray-900">{displayName}</p>
                              </div>
                            </div>
                          ) : (
                            <div className="pl-10 text-gray-300 text-xs">↳</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${col.pill}`}
                          >
                            {b.leaveTypeName}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">
                          {b.allocated}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">{b.used}</td>
                        <td className="px-4 py-3 text-right">
                          {b.pending > 0 ? (
                            <span className="text-amber-600 font-medium">{b.pending}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-green-700">
                          {b.remaining}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${col.bar} rounded-full`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-400 w-8 text-right shrink-0">
                              {Math.round(pct)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleDelete(b)}
                            className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Delete balance"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Set Balance Modal */}
      <Modal
        open={setOpen}
        onClose={() => { setSetOpen(false); reset(); }}
        title="Set Leave Balance"
        size="sm"
      >
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
              <label className="form-label">
                Carry Forward{' '}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
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
            <Button variant="outline" type="button" onClick={() => setSetOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={isSubmitting} icon={<Upload size={14} />}>
              Set Balance
            </Button>
          </ModalActions>
        </form>
      </Modal>
    </div>
  );
};

// ── Leave Accrual Policy Tab ──────────────────────────────────────────────────

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

interface LeaveTypePolicy {
  accrualMethod: 'none' | 'monthly' | 'yearly';
  monthlyAmount?: number;
  skipMonths?: number[];
  carryForwardEnabled?: boolean;
  maxCarryForwardDays?: number;
}

interface LeavePolicyData {
  accrualEnabled: boolean;
  probationMonths: number;
  leaveTypes: Record<string, LeaveTypePolicy>;
}

const DEFAULT_TYPE_POLICY: LeaveTypePolicy = {
  accrualMethod: 'none',
  monthlyAmount: 1.25,
  skipMonths: [],
  carryForwardEnabled: false,
  maxCarryForwardDays: 0,
};

export const LeaveAccrualPolicyTab = () => {
  const { data: typesData, isLoading: typesLoading } = useLeaveTypes();
  const leaveTypes: { id: string; name: string; code: string }[] = (typesData as any[]) ?? [];
  const { data: policyData, isLoading: policyLoading } = useLeavePolicy();
  const savePolicy = useSaveLeavePolicy();

  const { t } = useI18n();
  const [policy, setPolicy] = React.useState<LeavePolicyData>({
    accrualEnabled: false,
    probationMonths: 3,
    leaveTypes: {},
  });
  const [savedEnabled, setSavedEnabled] = React.useState(false); // track what's actually saved in DB
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = React.useState('');
  const [showEnableConfirm, setShowEnableConfirm] = React.useState(false);

  React.useEffect(() => {
    if (policyData) {
      const pd = policyData as LeavePolicyData;
      setPolicy(pd);
      setSavedEnabled(!!pd.accrualEnabled);
    }
  }, [policyData]);

  const typePol = (id: string): LeaveTypePolicy =>
    policy.leaveTypes[id] ?? { ...DEFAULT_TYPE_POLICY };

  const setTypePol = (id: string, patch: Partial<LeaveTypePolicy>) => {
    setPolicy((p) => ({
      ...p,
      leaveTypes: { ...p.leaveTypes, [id]: { ...typePol(id), ...patch } },
    }));
  };

  const toggleSkipMonth = (typeId: string, month: number) => {
    const current = typePol(typeId).skipMonths ?? [];
    const next = current.includes(month)
      ? current.filter((m) => m !== month)
      : [...current, month].sort((a, b) => a - b);
    setTypePol(typeId, { skipMonths: next });
  };

  const handleToggleAccrual = (enabled: boolean) => {
    if (enabled && !savedEnabled) {
      // Turning ON from saved-OFF state — require confirmation
      setShowEnableConfirm(true);
    } else {
      setPolicy((p) => ({ ...p, accrualEnabled: enabled }));
    }
  };

  const confirmEnableAccrual = () => {
    setPolicy((p) => ({ ...p, accrualEnabled: true }));
    setShowEnableConfirm(false);
  };

  const handleSave = async () => {
    try {
      setSaveError('');
      await savePolicy.mutateAsync(policy);
      setSavedEnabled(policy.accrualEnabled);
    } catch (err: unknown) {
      setSaveError((err as Error).message);
    }
  };

  if (typesLoading || policyLoading) return <PageSkeleton />;

  return (
    <div className="space-y-5 max-w-2xl">
      {saveError && <Alert type="error" message={saveError} />}

      {/* Info banner */}
      <div className="flex items-start gap-2.5 p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
        <Info size={14} className="mt-0.5 flex-shrink-0" />
        <span>
          Saving this policy only stores the configuration.{' '}
          <strong>Leave balances are only updated when the monthly accrual cron runs</strong>{' '}
          (scheduled for the 1st of each month). Saving this form will not immediately change any employee's balance.
        </span>
      </div>

      {/* Global toggle */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Leave Accrual</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Automatically accrue leave balance for active employees each month.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={policy.accrualEnabled}
              onChange={(e) => handleToggleAccrual(e.target.checked)}
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
          </label>
        </div>

        {policy.accrualEnabled && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <label className="form-label">Probation Period (months)</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                min={0}
                max={24}
                className="form-input w-24"
                value={policy.probationMonths}
                onChange={(e) => setPolicy((p) => ({ ...p, probationMonths: Number(e.target.value) }))}
              />
              <span className="text-xs text-gray-500">
                New employees will not accrue leave during probation.
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* Enable accrual confirmation modal */}
      <Modal
        open={showEnableConfirm}
        onClose={() => setShowEnableConfirm(false)}
        title="Enable Leave Accrual?"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-800">
              When the monthly accrual cron runs, it will automatically <strong>add days to every active employee's leave balance</strong> based on the amounts configured below. This affects live data — make sure your settings are correct before the cron runs.
            </p>
          </div>
          <p className="text-sm text-gray-600">
            You can configure the amounts per leave type below before saving. The cron only runs on the 1st of each month, so you have time to review.
          </p>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setShowEnableConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={confirmEnableAccrual}>
              Enable Accrual
            </Button>
          </ModalActions>
        </div>
      </Modal>

      {/* Per leave-type settings */}
      {policy.accrualEnabled && leaveTypes.map((lt) => {
        const ltp   = typePol(lt.id);
        const isExp = expanded[lt.id] ?? false;

        return (
          <Card key={lt.id} padding={false}>
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
              onClick={() => setExpanded((e) => ({ ...e, [lt.id]: !isExp }))}
            >
              <div className="flex items-center gap-3">
                <Settings2 size={15} className="text-gray-400" />
                <div className="text-left">
                  <span className="text-sm font-medium text-gray-900">{lt.name}</span>
                  <span className="ml-2 text-xs text-gray-400 font-mono">{lt.code}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  ltp.accrualMethod === 'monthly' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {ltp.accrualMethod === 'monthly' ? `${ltp.monthlyAmount ?? 0} days/mo` : 'No accrual'}
                </span>
              </div>
              {isExp ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
            </button>

            {isExp && (
              <div className="px-4 pb-4 pt-1 border-t border-gray-100 space-y-4">

                {/* Accrual method */}
                <div>
                  <label className="form-label">Accrual Method</label>
                  <select
                    className="form-select"
                    value={ltp.accrualMethod}
                    onChange={(e) => setTypePol(lt.id, { accrualMethod: e.target.value as any })}
                  >
                    <option value="none">No Accrual</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                {ltp.accrualMethod === 'monthly' && (
                  <>
                    {/* Monthly amount */}
                    <div>
                      <label className="form-label">Days per Month</label>
                      <input
                        type="number"
                        min={0.25}
                        max={5}
                        step={0.25}
                        className="form-input w-28"
                        value={ltp.monthlyAmount ?? 1.25}
                        onChange={(e) => setTypePol(lt.id, { monthlyAmount: parseFloat(e.target.value) })}
                      />
                    </div>

                    {/* Skip months */}
                    <div>
                      <label className="form-label mb-1.5">Skip Accrual in Months</label>
                      <div className="flex flex-wrap gap-1.5">
                        {MONTH_LABELS.map((label, idx) => {
                          const month = idx + 1;
                          const skipped = (ltp.skipMonths ?? []).includes(month);
                          return (
                            <button
                              key={month}
                              type="button"
                              onClick={() => toggleSkipMonth(lt.id, month)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                                skipped
                                  ? 'bg-red-50 border-red-200 text-red-700'
                                  : 'bg-ds-surface border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {(ltp.skipMonths ?? []).length === 0
                          ? 'Accruing all 12 months'
                          : `Skipping ${(ltp.skipMonths ?? []).map((m) => MONTH_LABELS[m - 1]).join(', ')} — ${12 - (ltp.skipMonths ?? []).length} months/year`}
                      </p>
                    </div>
                  </>
                )}

                {/* Carry-forward */}
                <div className="pt-1 border-t border-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-800">Carry Forward</p>
                      <p className="text-xs text-gray-500">Allow unused balance to roll over to next year.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={ltp.carryForwardEnabled ?? false}
                        onChange={(e) => setTypePol(lt.id, { carryForwardEnabled: e.target.checked })}
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                    </label>
                  </div>
                  {ltp.carryForwardEnabled && (
                    <div className="mt-3 flex items-center gap-2">
                      <label className="text-xs text-gray-600 whitespace-nowrap">Max carry-forward days:</label>
                      <input
                        type="number"
                        min={0}
                        max={30}
                        step={0.5}
                        className="form-input w-20"
                        value={ltp.maxCarryForwardDays ?? 0}
                        onChange={(e) => setTypePol(lt.id, { maxCarryForwardDays: parseFloat(e.target.value) })}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        );
      })}

      {/* Save */}
      <div className="flex justify-end">
        <Button
          icon={<Save size={15} />}
          loading={savePolicy.isPending}
          onClick={handleSave}
        >
          Save Accrual Policy
        </Button>
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const LeavePage = () => {
  const { t } = useI18n();
  useParams<{ tenantSlug: string }>();
  const { user } = useAuth();
  const isManager        = hasPermission(user, PERMISSIONS.LEAVE_APPROVE);
  const isAdminRole      = user?.role === 'SUPER_ADMIN' || user?.role === 'TENANT_ADMIN';
  const canViewOrgLeaves = isAdminRole || hasPermission(user, PERMISSIONS.LEAVE_ORG_VIEW);

  // Deep-link support: ?requestId=X (e.g. clicked a leave notification in the
  // bell). Default to the My Leaves tab; if the manager has both manager
  // rights AND the request is pending, jumping to Team Requests would make
  // more sense — but we can't know server-side which list owns the request
  // without an extra fetch, so we land on My Leaves and let the highlight
  // pulse on whichever tab actually contains it.
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFocusId = searchParams.get('requestId') || '';
  const [tab, setTab] = useState<Tab>(
    (searchParams.get('tab') as Tab) || 'my'
  );
  const [highlightLeaveId] = useState<string>(initialFocusId);

  useEffect(() => {
    if (searchParams.get('tab') || searchParams.get('requestId')) {
      const next = new URLSearchParams(searchParams);
      next.delete('tab');
      next.delete('requestId');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabs: { id: Tab; label: string; icon: React.ReactNode; managerOnly?: boolean }[] = [
    { id: 'my',          label: 'My Leaves',      icon: <Clock size={15} /> },
    { id: 'apply',       label: 'Apply',           icon: <Plus size={15} /> },
    { id: 'team',        label: 'Team Requests',   icon: <CheckCircle size={15} />, managerOnly: true },
    { id: 'who-is-off',  label: 'Who\'s Off',      icon: <Users size={15} /> },
    { id: 'calendar',    label: 'Calendar',         icon: <Calendar size={15} /> },
    { id: 'balance',     label: 'My Balance',       icon: <BarChart2 size={15} /> },
  ];

  const visibleTabs = tabs.filter((t) => {
    if (t.managerOnly && !isManager) return false;
    return true;
  });

  return (
    <Layout>
      <Header
        title={t('nav.leave')}
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
        {tab === 'my' && <MyLeavesTab highlightId={highlightLeaveId} />}
        {tab === 'apply' && <ApplyTab />}
        {tab === 'team' && isManager && <TeamRequestsTab highlightId={highlightLeaveId} />}
        {tab === 'who-is-off' && <TeamOnLeaveTab canViewOrg={canViewOrgLeaves} />}
        {tab === 'calendar' && <PlanningTab canViewOrg={canViewOrgLeaves} />}
        {tab === 'balance' && <BalanceTab />}
      </div>
    </Layout>
  );
};

export default LeavePage;
