import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Clock, LogIn, LogOut, Home, Users, BarChart2, AlertTriangle, CheckCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { format, parseISO } from 'date-fns';
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
  useMyAttendanceRecord,
  useAttendanceLive,
  useAttendanceRecords,
  useAttendanceSummary,
  useAttendanceAnomalies,
  useCheckIn,
  useCheckOut,
  useMarkWfh,
} from '../hooks/usePeople';
import { useAuth } from '../contexts/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AttendanceRecord {
  id: string;
  date: string;
  status: string;
  checkInTime?: string;
  checkOutTime?: string;
  hoursWorked?: number;
  isWfh?: boolean;
  userId?: string;
  userName?: string;
}

interface LiveUser {
  id: string;
  name: string;
  avatarUrl?: string;
  checkInTime: string;
}

interface AnomalyUser {
  id: string;
  name: string;
  avatarUrl?: string;
}

interface AttendanceSummary {
  presentCount: number;
  absentCount: number;
  wfhCount: number;
  lateCount: number;
  totalHours: number;
}

interface WfhForm {
  reason: string;
}

interface RecordsFilter {
  date_from: string;
  date_to: string;
  name_filter?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'WFH' | 'LATE' | string;

const statusVariant = (status: AttendanceStatus) => {
  const map: Record<string, 'success' | 'danger' | 'info' | 'warning' | 'gray'> = {
    PRESENT: 'success',
    ABSENT: 'danger',
    WFH: 'info',
    LATE: 'warning',
  };
  return map[status] ?? 'gray';
};

const formatTime = (iso?: string) => {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'hh:mm a');
  } catch {
    return iso;
  }
};

const formatDate = (iso?: string) => {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'dd MMM yyyy');
  } catch {
    return iso ?? '—';
  }
};

const MANAGER_ROLES = ['TENANT_ADMIN', 'PMO', 'DELIVERY_LEAD'];

// ── Tab definitions ───────────────────────────────────────────────────────────

type Tab = 'my' | 'live' | 'records' | 'summary';

// ── Sub-components ────────────────────────────────────────────────────────────

const AttendanceStatusBadge = ({ status }: { status: string }) => (
  <Badge variant={statusVariant(status)}>
    {status.replace(/_/g, ' ')}
  </Badge>
);

// ── My Attendance Tab ─────────────────────────────────────────────────────────

// ── Running Timer ─────────────────────────────────────────────────────────────

function useElapsedTimer(startIso?: string) {
  const [elapsed, setElapsed] = useState('');
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!startIso) { setElapsed(''); return; }
    const calc = () => {
      const start = new Date(startIso).getTime();
      const diff = Math.max(0, Date.now() - start);
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setElapsed(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    calc();
    ref.current = setInterval(calc, 1000);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [startIso]);

  return elapsed;
}

// ── My Attendance Tab ─────────────────────────────────────────────────────────

const MyAttendanceTab = () => {
  const [showWfhModal, setShowWfhModal] = useState(false);
  const [actionError, setActionError] = useState('');

  const { data: record, isLoading } = useMyAttendanceRecord();
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();
  const markWfh = useMarkWfh();

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<WfhForm>();

  const today = record?.today as AttendanceRecord | null | undefined;
  const history: AttendanceRecord[] = record?.history ?? [];

  const handleCheckIn = async () => {
    try {
      setActionError('');
      await checkIn.mutateAsync({});
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  };

  const handleCheckOut = async () => {
    try {
      setActionError('');
      await checkOut.mutateAsync({});
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  };

  const handleWfh = async (data: WfhForm) => {
    try {
      setActionError('');
      await markWfh.mutateAsync(data);
      reset();
      setShowWfhModal(false);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  };

  const isCheckedIn = !!today?.checkInTime;
  const isCheckedOut = !!today?.checkOutTime;
  const isDone = isCheckedIn && isCheckedOut;

  // Live timer — only ticks while checked in and not yet checked out
  const elapsed = useElapsedTimer(isCheckedIn && !isCheckedOut ? today?.checkInTime : undefined);

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      {actionError && <Alert type="error" message={actionError} />}

      {/* Today's Status Card */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Today's Attendance</h3>
            <p className="text-sm text-gray-500">{format(new Date(), 'EEEE, dd MMMM yyyy')}</p>
          </div>
          {today?.status && <AttendanceStatusBadge status={today.status} />}
        </div>

        {!isCheckedIn && (
          <div className="flex flex-col items-center py-8 gap-4">
            <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
              <LogIn size={28} className="text-green-600" />
            </div>
            <p className="text-sm text-gray-500">You haven't checked in today</p>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 text-base"
              icon={<LogIn size={18} />}
              loading={checkIn.isPending}
              onClick={handleCheckIn}
            >
              Check In
            </Button>
          </div>
        )}

        {isCheckedIn && !isCheckedOut && (
          <div className="space-y-4">
            <div className="flex flex-col items-center py-4 gap-2">
              <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
                <Clock size={26} className="text-green-600" />
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-0.5">Time since check-in</p>
                <p className="text-3xl font-bold text-green-600 font-mono tabular-nums tracking-widest">{elapsed}</p>
                <p className="text-xs text-gray-400 mt-1">Checked in at {formatTime(today?.checkInTime)}</p>
              </div>
            </div>
            <div className="flex gap-3 justify-center">
              <Button
                variant="danger"
                icon={<LogOut size={16} />}
                loading={checkOut.isPending}
                onClick={handleCheckOut}
              >
                Check Out
              </Button>
              <Button
                variant="outline"
                icon={<Home size={16} />}
                onClick={() => setShowWfhModal(true)}
              >
                Mark as WFH
              </Button>
            </div>
          </div>
        )}

        {isDone && (
          <div className="grid grid-cols-3 gap-4">
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-xs text-gray-500 mb-1">Check In</p>
              <p className="font-semibold text-gray-900 text-sm">{formatTime(today?.checkInTime)}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-xs text-gray-500 mb-1">Check Out</p>
              <p className="font-semibold text-gray-900 text-sm">{formatTime(today?.checkOutTime)}</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg text-center">
              <p className="text-xs text-gray-500 mb-1">Hours Worked</p>
              <p className="font-semibold text-blue-700 text-sm">{today?.hoursWorked?.toFixed(1) ?? '—'}h</p>
            </div>
          </div>
        )}
      </Card>

      {/* Recent History */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Recent History (Last 7 Days)</h3>
        {history.length === 0 ? (
          <EmptyState title="No records yet" description="Your attendance history will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 uppercase tracking-wide">Check In</th>
                  <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 uppercase tracking-wide">Check Out</th>
                  <th className="text-left py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {history.map((rec) => (
                  <tr key={rec.id} className="hover:bg-gray-50">
                    <td className="py-2.5 pr-4 text-gray-700">{formatDate(rec.date)}</td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-1.5">
                        <AttendanceStatusBadge status={rec.status} />
                        {rec.isWfh && <Badge variant="info">WFH</Badge>}
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-gray-600">{formatTime(rec.checkInTime)}</td>
                    <td className="py-2.5 pr-4 text-gray-600">{formatTime(rec.checkOutTime)}</td>
                    <td className="py-2.5 text-gray-600">{rec.hoursWorked?.toFixed(1) ?? '—'}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* WFH Modal */}
      <Modal open={showWfhModal} onClose={() => { setShowWfhModal(false); reset(); }} title="Mark as Work From Home" size="sm">
        <form onSubmit={handleSubmit(handleWfh)} className="space-y-4">
          <div>
            <label className="form-label">Reason</label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="Briefly explain why you're working from home…"
              {...register('reason', { required: 'Reason is required' })}
            />
            {errors.reason && <p className="form-error">{errors.reason.message}</p>}
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => { setShowWfhModal(false); reset(); }}>Cancel</Button>
            <Button type="submit" loading={isSubmitting}>Confirm WFH</Button>
          </ModalActions>
        </form>
      </Modal>
    </div>
  );
};

// ── Team Live Tab ─────────────────────────────────────────────────────────────

const TeamLiveTab = () => {
  const { data, isLoading, error } = useAttendanceLive();
  const { data: anomaliesData } = useAttendanceAnomalies();

  const liveUsers: LiveUser[] = Array.isArray(data) ? (data as unknown as LiveUser[]) : [];
  const anomalies: AnomalyUser[] = (anomaliesData as AnomalyUser[]) ?? [];

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      {error && <Alert type="error" message={(error as Error).message} />}

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Currently Checked In</h3>
          <Badge variant="success">{liveUsers.length} online</Badge>
        </div>

        {liveUsers.length === 0 ? (
          <EmptyState title="No one checked in yet" description="Team members who check in will appear here." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {liveUsers.map((u) => (
              <div key={u.id} className="flex items-center gap-3 p-3 bg-green-50 border border-green-100 rounded-lg">
                <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size="md" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Clock size={11} />
                    <span>{formatTime(u.checkInTime)}</span>
                  </div>
                </div>
                <span className="ml-auto w-2 h-2 rounded-full bg-green-500 shrink-0" />
              </div>
            ))}
          </div>
        )}
      </Card>

      {anomalies.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} className="text-red-500" />
            <h3 className="text-sm font-semibold text-gray-900">Absent Today</h3>
            <Badge variant="danger">{anomalies.length}</Badge>
          </div>
          <div className="divide-y divide-gray-50">
            {anomalies.map((u) => (
              <div key={u.id} className="flex items-center gap-3 py-2.5">
                <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size="sm" />
                <p className="text-sm text-gray-700">{u.name}</p>
                <Badge variant="danger" className="ml-auto">ABSENT</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

// ── Records Tab ───────────────────────────────────────────────────────────────

const RecordsTab = ({ isManager }: { isManager: boolean }) => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const monthAgo = format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');

  const { register, handleSubmit } = useForm<RecordsFilter>({
    defaultValues: { date_from: monthAgo, date_to: today, name_filter: '' },
  });

  const [filterParams, setFilterParams] = useState<Record<string, string>>({
    date_from: monthAgo,
    date_to: today,
  });
  const [nameFilter, setNameFilter] = useState('');

  const { data, isLoading, error } = useAttendanceRecords(filterParams);
  const allRecords: AttendanceRecord[] = (data as AttendanceRecord[]) ?? [];
  const records = nameFilter
    ? allRecords.filter((r: any) => (r.name ?? '').toLowerCase().includes(nameFilter.toLowerCase()))
    : allRecords;

  const onFilter = (values: RecordsFilter) => {
    setFilterParams({ date_from: values.date_from, date_to: values.date_to });
    setNameFilter(values.name_filter?.trim() ?? '');
  };

  return (
    <div className="space-y-5">
      {error && <Alert type="error" message={(error as Error).message} />}

      {/* Filter Row */}
      <Card>
        <form onSubmit={handleSubmit(onFilter)} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="form-label">From</label>
            <input type="date" className="form-input" {...register('date_from')} />
          </div>
          <div>
            <label className="form-label">To</label>
            <input type="date" className="form-input" {...register('date_to')} />
          </div>
          {isManager && (
            <div>
              <label className="form-label">Team Member</label>
              <input className="form-input" placeholder="Search by name…" {...register('name_filter')} />
            </div>
          )}
          <Button type="submit" size="sm">Apply</Button>
        </form>
      </Card>

      {/* Table */}
      <Card padding={false}>
        {isLoading ? (
          <div className="p-6"><PageSkeleton /></div>
        ) : records.length === 0 ? (
          <EmptyState title="No records found" description="Try adjusting your date range or filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50">
                <tr>
                  {isManager && <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">User</th>}
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Check In</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Check Out</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Hours</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">WFH</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.map((rec) => (
                  <tr key={rec.id} className="hover:bg-gray-50">
                    {isManager && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <UserAvatar name={(rec as any).name ?? ''} avatarUrl={(rec as any).avatarUrl} size="xs" />
                          <span className="text-sm text-gray-700">{(rec as any).name || rec.userName || '—'}</span>
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-3 text-gray-700">{formatDate(rec.date)}</td>
                    <td className="px-4 py-3"><AttendanceStatusBadge status={rec.status} /></td>
                    <td className="px-4 py-3 text-gray-600">{formatTime(rec.checkInTime)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatTime(rec.checkOutTime)}</td>
                    <td className="px-4 py-3 text-gray-600">{rec.hoursWorked?.toFixed(1) ?? '—'}h</td>
                    <td className="px-4 py-3">
                      {rec.isWfh ? <Badge variant="info">WFH</Badge> : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

// ── Summary Tab ───────────────────────────────────────────────────────────────

const SummaryTab = () => {
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [year, setYear] = useState(String(now.getFullYear()));

  const { data, isLoading, error } = useAttendanceSummary({ month, year });
  // Backend returns { summary: { present, absent, wfh, late, total_hours }, records }
  const rawSummary = (data as any)?.summary ?? data as any;
  const summary = rawSummary ? {
    presentCount:  rawSummary.present       ?? rawSummary.presentCount       ?? 0,
    absentCount:   rawSummary.absent        ?? rawSummary.absentCount        ?? 0,
    wfhCount:      rawSummary.wfh           ?? rawSummary.wfhCount           ?? 0,
    lateCount:     rawSummary.late          ?? rawSummary.lateCount          ?? 0,
    totalHours:    rawSummary.total_hours   ?? rawSummary.totalHours         ?? 0,
  } : null;

  const stats = [
    { label: 'Present', value: summary?.presentCount ?? 0, color: 'bg-green-500', max: 31 },
    { label: 'Absent', value: summary?.absentCount ?? 0, color: 'bg-red-500', max: 31 },
    { label: 'WFH', value: summary?.wfhCount ?? 0, color: 'bg-purple-500', max: 31 },
    { label: 'Late', value: summary?.lateCount ?? 0, color: 'bg-yellow-500', max: 31 },
  ];

  const months = [
    { value: '01', label: 'January' }, { value: '02', label: 'February' },
    { value: '03', label: 'March' }, { value: '04', label: 'April' },
    { value: '05', label: 'May' }, { value: '06', label: 'June' },
    { value: '07', label: 'July' }, { value: '08', label: 'August' },
    { value: '09', label: 'September' }, { value: '10', label: 'October' },
    { value: '11', label: 'November' }, { value: '12', label: 'December' },
  ];

  const years = Array.from({ length: 3 }, (_, i) => String(now.getFullYear() - i));

  return (
    <div className="space-y-6">
      {error && <Alert type="error" message={(error as Error).message} />}

      {/* Month / Year Selector */}
      <Card>
        <div className="flex items-center gap-3">
          <div>
            <label className="form-label">Month</label>
            <select className="form-select" value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Year</label>
            <select className="form-select" value={year} onChange={(e) => setYear(e.target.value)}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <PageSkeleton />
      ) : (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {stats.map((s) => (
              <Card key={s.label}>
                <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-400">days</p>
              </Card>
            ))}
            <Card>
              <p className="text-xs text-gray-500 mb-1">Total Hours</p>
              <p className="text-2xl font-bold text-blue-700">{summary?.totalHours?.toFixed(0) ?? 0}</p>
              <p className="text-xs text-gray-400">hrs</p>
            </Card>
          </div>

          {/* Bar Chart Visual */}
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 mb-5">Breakdown</h3>
            <div className="space-y-4">
              {stats.map((s) => {
                const pct = Math.min(100, (s.value / s.max) * 100);
                return (
                  <div key={s.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-gray-700">{s.label}</span>
                      <span className="text-sm font-medium text-gray-900">{s.value} days</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${s.color}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const AttendancePage = () => {
  useParams<{ tenantSlug: string }>();
  const { user } = useAuth();
  const isManager = MANAGER_ROLES.includes(user?.role ?? '');
  const [tab, setTab] = useState<Tab>('my');

  const tabs: { id: Tab; label: string; icon: React.ReactNode; managerOnly?: boolean }[] = [
    { id: 'my', label: 'My Attendance', icon: <Clock size={15} /> },
    { id: 'live', label: 'Team Live', icon: <Users size={15} />, managerOnly: true },
    { id: 'records', label: 'Records', icon: <BarChart2 size={15} /> },
    { id: 'summary', label: 'Summary', icon: <BarChart2 size={15} /> },
  ];

  const visibleTabs = tabs.filter((t) => !t.managerOnly || isManager);

  return (
    <Layout>
      <Header title="Attendance" subtitle="Track daily attendance and team presence" />

      <div className="p-6 space-y-5">
        {/* Tab Bar */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex gap-1">
            {visibleTabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.id
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
        {tab === 'my' && <MyAttendanceTab />}
        {tab === 'live' && isManager && <TeamLiveTab />}
        {tab === 'records' && <RecordsTab isManager={isManager} />}
        {tab === 'summary' && <SummaryTab />}
      </div>
    </Layout>
  );
};

export default AttendancePage;
