import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Clock, LogIn, LogOut, Home, Users, BarChart2, AlertTriangle, UtensilsCrossed, Coffee } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { format, parseISO, startOfWeek, endOfWeek, addDays } from 'date-fns';
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
  useBreakStart,
  useBreakEnd,
  useIpConfig,
  useAddIpConfig,
  useDeleteIpConfig,
} from '../hooks/usePeople';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission, PERMISSIONS } from '../utils/permissions';
import { attendanceApi } from '../lib/api';
import { useMyPermissions } from '../hooks/useAdmin';
import { Download, Shield, Plus, Trash2 } from 'lucide-react';

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

// Permissions that unlock manager-level attendance views
const ATTENDANCE_MANAGER_PERMS = ['ATTENDANCE_ADMIN'];

// ── Tab definitions ───────────────────────────────────────────────────────────

type Tab = 'my' | 'live' | 'records' | 'summary' | 'ip-config';

// ── IP Config Tab ─────────────────────────────────────────────────────────────
const IpConfigTab = () => {
  const { data: ips = [], isLoading } = useIpConfig();
  const addIp = useAddIpConfig();
  const deleteIp = useDeleteIpConfig();
  const [label, setLabel] = useState('');
  const [ipAddr, setIpAddr] = useState('');
  const [err, setErr] = useState('');

  const handleAdd = async () => {
    setErr('');
    if (!label.trim() || !ipAddr.trim()) { setErr('Label and IP address are required'); return; }
    try {
      await addIp.mutateAsync({ label: label.trim(), ip_address: ipAddr.trim() });
      setLabel(''); setIpAddr('');
    } catch (e: any) { setErr(e?.message ?? 'Failed to add'); }
  };

  return (
    <div className="space-y-5 max-w-xl">
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Shield size={16} className="text-indigo-600" />
          <h3 className="font-semibold text-gray-800 text-sm">Allowed IP Addresses</h3>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          When IPs are configured, employees must check in / out from one of these addresses.
          Outside these networks only WFH check-in is allowed. Supports exact IPs and CIDR notation (e.g. <code>192.168.1.0/24</code>).
        </p>

        {err && <Alert type="error" message={err} />}

        {/* Add form */}
        <div className="flex gap-2 mb-4">
          <input className="form-input flex-1 text-sm" placeholder="Label (e.g. Office)" value={label} onChange={e => setLabel(e.target.value)} />
          <input className="form-input flex-1 text-sm" placeholder="192.168.1.0/24" value={ipAddr} onChange={e => setIpAddr(e.target.value)} />
          <Button size="sm" icon={<Plus size={13} />} loading={addIp.isPending} onClick={handleAdd}>Add</Button>
        </div>

        {/* List */}
        {isLoading ? <PageSkeleton /> : (ips as any[]).length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">No IP restrictions configured — all networks allowed.</p>
        ) : (
          <div className="space-y-2">
            {(ips as any[]).map((ip: any) => (
              <div key={ip.ROWID ?? ip.id} className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-100">
                <div>
                  <p className="text-sm font-medium text-gray-800">{ip.label}</p>
                  <p className="text-xs text-gray-400 font-mono">{ip.ip_address}</p>
                </div>
                <button
                  onClick={() => deleteIp.mutate(String(ip.ROWID ?? ip.id))}
                  disabled={deleteIp.isPending}
                  className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const AttendanceStatusBadge = ({ status }: { status: string }) => (
  <Badge variant={statusVariant(status)}>
    {status.replace(/_/g, ' ')}
  </Badge>
);

const BreakCell = ({ rec }: { rec: any }) => {
  const bs = rec.breakSummary ?? rec.break_summary ?? null;
  const totalMins = parseFloat(rec.total_break_minutes ?? 0);

  if (bs) {
    const lunch = bs.lunch ?? {};
    const short = bs.short ?? {};
    const lunchMins = Math.round(lunch.used_minutes  ?? 0);
    const shortMins = Math.round(short.used_minutes  ?? 0);
    const lunchOver = Math.round(lunch.exceeded_minutes ?? 0);
    const shortOver = Math.round(short.exceeded_minutes ?? 0);
    if (lunchMins === 0 && shortMins === 0) return <span className="text-gray-300">—</span>;
    return (
      <div className="flex flex-col gap-0.5 text-xs">
        {lunchMins > 0 && (
          <span className={lunchOver > 0 ? 'text-red-600 font-medium' : 'text-gray-500'}>
            🍴 {lunchMins}m{lunchOver > 0 ? ` (+${lunchOver}m over)` : ` / 60m`}
          </span>
        )}
        {shortMins > 0 && (
          <span className={shortOver > 0 ? 'text-red-600 font-medium' : 'text-gray-500'}>
            ☕ {shortMins}m{shortOver > 0 ? ` (+${shortOver}m over)` : ` / 15m`}
          </span>
        )}
      </div>
    );
  }

  if (totalMins > 0) return <span className="text-xs text-gray-500">{Math.round(totalMins)}m total</span>;
  return <span className="text-gray-300">—</span>;
};

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

const BREAK_ALLOWANCES = { LUNCH: 60, SHORT: 15 };

const MyAttendanceTab = () => {
  const [showWfhModal, setShowWfhModal] = useState(false);
  const [actionError, setActionError] = useState('');

  const { data: record, isLoading } = useMyAttendanceRecord();
  const checkIn  = useCheckIn();
  const checkOut = useCheckOut();
  const markWfh  = useMarkWfh();
  const breakStart = useBreakStart();
  const breakEnd   = useBreakEnd();

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<WfhForm>();

  const today   = record?.today as any;
  const history: AttendanceRecord[] = record?.history ?? [];

  const breakSummary = (today as any)?.breakSummary ?? (today as any)?.break_summary ?? null;
  const lunchInfo    = breakSummary?.lunch ?? { allowance_minutes: 60, used_minutes: 0, exceeded_minutes: 0, remaining_minutes: 60, active: null };
  const shortInfo    = breakSummary?.short ?? { allowance_minutes: 15, used_minutes: 0, exceeded_minutes: 0, remaining_minutes: 15, active: null };
  const activeBreak  = lunchInfo.active ?? shortInfo.active ?? null;
  const onBreak      = !!activeBreak;

  // Live break elapsed timer
  const [breakSecs, setBreakSecs] = useState(0);
  const breakTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (breakTimerRef.current) clearInterval(breakTimerRef.current);
    if (!activeBreak?.break_start) { setBreakSecs(0); return; }
    const tick = () => setBreakSecs(Math.max(0, Math.floor((Date.now() - new Date(activeBreak.break_start.replace(' ', 'T')).getTime()) / 1000)));
    tick();
    breakTimerRef.current = setInterval(tick, 1000);
    return () => { if (breakTimerRef.current) clearInterval(breakTimerRef.current); };
  }, [activeBreak?.break_start]);

  const breakElapsedMins = Math.floor(breakSecs / 60);
  const activeAllowance  = activeBreak ? (BREAK_ALLOWANCES[activeBreak.break_type as keyof typeof BREAK_ALLOWANCES] ?? 15) : 0;
  const isOverBreak      = breakElapsedMins > activeAllowance;
  const overMins         = Math.max(0, breakElapsedMins - activeAllowance);
  const fmt2 = (n: number) => String(Math.max(0, Math.floor(n))).padStart(2, '0');

  const clientTime = () => new Date().toLocaleString('sv');
  const handleBreakStart = (type: 'LUNCH' | 'SHORT') => {
    setActionError('');
    breakStart.mutate({ client_time: clientTime(), break_type: type },
      { onError: (e: any) => setActionError(e?.message ?? 'Failed to start break') });
  };
  const handleBreakEnd = () => {
    setActionError('');
    breakEnd.mutate({ client_time: clientTime() },
      { onError: (e: any) => setActionError(e?.message ?? 'Failed to end break') });
  };

  const handleCheckIn = async () => {
    try {
      setActionError('');
      await checkIn.mutateAsync({ client_time: new Date().toLocaleString('sv') });
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  };

  const handleCheckOut = async () => {
    try {
      setActionError('');
      await checkOut.mutateAsync({ client_time: new Date().toLocaleString('sv') });
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
              <div className={`w-14 h-14 rounded-full flex items-center justify-center ${onBreak ? (isOverBreak ? 'bg-red-50' : 'bg-orange-50') : 'bg-green-50'}`}>
                {onBreak
                  ? (activeBreak?.break_type === 'LUNCH'
                      ? <UtensilsCrossed size={26} className={isOverBreak ? 'text-red-500' : 'text-orange-500'} />
                      : <Coffee size={26} className={isOverBreak ? 'text-red-500' : 'text-orange-500'} />)
                  : <Clock size={26} className="text-green-600" />}
              </div>

              {onBreak ? (
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-0.5">
                    {activeBreak?.break_type === 'LUNCH' ? 'Lunch break' : 'Short break'} in progress
                    {` · ${activeAllowance}m allowance`}
                  </p>
                  <p className={`text-3xl font-bold font-mono tabular-nums tracking-widest ${isOverBreak ? 'text-red-600' : 'text-orange-500'}`}>
                    {fmt2(Math.floor(breakSecs / 60))}:{fmt2(breakSecs % 60)}
                  </p>
                  {isOverBreak && (
                    <p className="text-xs text-red-500 mt-1 font-medium flex items-center justify-center gap-1">
                      <AlertTriangle size={11} /> Over by {overMins}m — please return to your desk
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-0.5">Time since check-in</p>
                  <p className="text-3xl font-bold text-green-600 font-mono tabular-nums tracking-widest">{elapsed}</p>
                  <p className="text-xs text-gray-400 mt-1">Checked in at {formatTime(today?.checkInTime)}</p>
                </div>
              )}
            </div>

            {/* Break allowance pills */}
            {!onBreak && (
              <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <UtensilsCrossed size={11} />
                  Lunch: {Math.round(lunchInfo.used_minutes)}m / {lunchInfo.allowance_minutes}m used
                </span>
                <span className="flex items-center gap-1">
                  <Coffee size={11} />
                  Break: {Math.round(shortInfo.used_minutes)}m / {shortInfo.allowance_minutes}m used
                </span>
              </div>
            )}

            <div className="flex gap-2 justify-center flex-wrap">
              {onBreak ? (
                <Button
                  variant="outline"
                  icon={activeBreak?.break_type === 'LUNCH' ? <UtensilsCrossed size={15} /> : <Coffee size={15} />}
                  loading={breakEnd.isPending}
                  onClick={handleBreakEnd}
                  className={isOverBreak ? 'border-red-300 text-red-600 hover:bg-red-50' : 'border-orange-300 text-orange-600 hover:bg-orange-50'}
                >
                  End {activeBreak?.break_type === 'LUNCH' ? 'Lunch' : 'Short'} Break
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    icon={<UtensilsCrossed size={15} />}
                    loading={breakStart.isPending}
                    disabled={lunchInfo.remaining_minutes === 0}
                    onClick={() => handleBreakStart('LUNCH')}
                    className="border-orange-200 text-orange-600 hover:bg-orange-50"
                  >
                    Lunch Break {lunchInfo.remaining_minutes > 0 ? `· ${lunchInfo.remaining_minutes}m left` : '· Used'}
                  </Button>
                  <Button
                    variant="outline"
                    icon={<Coffee size={15} />}
                    loading={breakStart.isPending}
                    disabled={shortInfo.remaining_minutes === 0}
                    onClick={() => handleBreakStart('SHORT')}
                    className="border-orange-200 text-orange-600 hover:bg-orange-50"
                  >
                    Short Break {shortInfo.remaining_minutes > 0 ? `· ${shortInfo.remaining_minutes}m left` : '· Used'}
                  </Button>
                </>
              )}
              <Button
                variant="danger"
                icon={<LogOut size={16} />}
                loading={checkOut.isPending}
                onClick={handleCheckOut}
              >
                Check Out
              </Button>
              {!onBreak && (
                <Button variant="outline" icon={<Home size={16} />} onClick={() => setShowWfhModal(true)}>
                  Mark as WFH
                </Button>
              )}
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
                  <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 uppercase tracking-wide">Breaks</th>
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
                    <td className="py-2.5 pr-4">
                      <BreakCell rec={rec as any} />
                    </td>
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

  // Server-side filter params (user_id drives scoped query)
  const [filterParams, setFilterParams] = useState<Record<string, string>>({
    date_from: monthAgo,
    date_to: today,
  });
  // Selected user for scoped filter
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedUserName, setSelectedUserName] = useState('');
  const [downloading, setDownloading] = useState(false);

  const { data, isLoading, error } = useAttendanceRecords(filterParams);
  const allRecords: AttendanceRecord[] = (data as AttendanceRecord[]) ?? [];

  // Build unique user list from loaded records for the dropdown
  const userOptions = React.useMemo(() => {
    const seen = new Map<string, string>();
    allRecords.forEach((r: any) => {
      if (r.user_id && r.name) seen.set(String(r.user_id), r.name);
    });
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allRecords]);

  const onFilter = (values: RecordsFilter) => {
    const params: Record<string, string> = {
      date_from: values.date_from,
      date_to: values.date_to,
    };
    if (selectedUserId) params.user_id = selectedUserId;
    setFilterParams(params);
  };

  const handleUserSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const uid = e.target.value;
    const uname = userOptions.find(([id]) => id === uid)?.[1] ?? '';
    setSelectedUserId(uid);
    setSelectedUserName(uname);
    // Re-query immediately with new user filter
    setFilterParams((prev) => {
      const next = { ...prev };
      if (uid) next.user_id = uid; else delete next.user_id;
      return next;
    });
  };

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const exportParams: Record<string, string> = { ...filterParams };
      if (selectedUserId) exportParams.user_id = selectedUserId;

      const blob = await attendanceApi.exportCsv(exportParams);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Filename: "{UserName}_attendance_{from}_to_{to}.csv" or "all_attendance_{from}_to_{to}.csv"
      const nameSlug = selectedUserName
        ? selectedUserName.replace(/\s+/g, '_')
        : 'all_users';
      a.download = `${nameSlug}_attendance_${filterParams.date_from || 'all'}_to_${filterParams.date_to || 'all'}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Export failed: ' + (e as Error).message);
    } finally {
      setDownloading(false);
    }
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
              <select
                className="form-select"
                value={selectedUserId}
                onChange={handleUserSelect}
              >
                <option value="">All members</option>
                {userOptions.map(([uid, uname]) => (
                  <option key={uid} value={uid}>{uname}</option>
                ))}
              </select>
            </div>
          )}
          <Button type="submit" size="sm">Apply</Button>
          {isManager && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={<Download size={14} />}
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? 'Exporting…' : selectedUserId ? `Export ${selectedUserName}` : 'Export All CSV'}
            </Button>
          )}
        </form>
      </Card>

      {/* Table */}
      <Card padding={false}>
        {isLoading ? (
          <div className="p-6"><PageSkeleton /></div>
        ) : allRecords.length === 0 ? (
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
                {allRecords.map((rec) => (
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

type SummaryMode = 'weekly' | 'monthly';

const SummaryTab = () => {
  const now = new Date();
  const [mode, setMode] = useState<SummaryMode>('weekly');

  // ── Monthly state ──────────────────────────────────────────────────────────
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [year, setYear] = useState(String(now.getFullYear()));
  const { data: monthData, isLoading: monthLoading, error: monthError } = useAttendanceSummary({ month, year });

  // ── Weekly state ───────────────────────────────────────────────────────────
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
  const weekEnd   = endOfWeek(now, { weekStartsOn: 1 });   // Sunday
  const weekFrom  = format(weekStart, 'yyyy-MM-dd');
  const weekTo    = format(weekEnd, 'yyyy-MM-dd');
  const { data: weekRecordsRaw, isLoading: weekLoading, error: weekError } = useAttendanceRecords({ date_from: weekFrom, date_to: weekTo });
  const weekRecords = (weekRecordsRaw as AttendanceRecord[]) ?? [];

  // Derive weekly stats from records
  const weekSummary = {
    presentCount: weekRecords.filter((r) => r.status === 'PRESENT').length,
    absentCount:  weekRecords.filter((r) => r.status === 'ABSENT').length,
    wfhCount:     weekRecords.filter((r) => r.status === 'WFH' || r.isWfh).length,
    lateCount:    weekRecords.filter((r) => r.status === 'LATE').length,
    totalHours:   weekRecords.reduce((sum, r) => sum + (r.hoursWorked ?? 0), 0),
  };

  // ── Monthly summary normalisation ──────────────────────────────────────────
  const rawSummary = (monthData as any)?.summary ?? (monthData as any);
  const monthlySummary = rawSummary ? {
    presentCount: rawSummary.present     ?? rawSummary.presentCount ?? 0,
    absentCount:  rawSummary.absent      ?? rawSummary.absentCount  ?? 0,
    wfhCount:     rawSummary.wfh         ?? rawSummary.wfhCount     ?? 0,
    lateCount:    rawSummary.late        ?? rawSummary.lateCount    ?? 0,
    totalHours:   rawSummary.total_hours ?? rawSummary.totalHours   ?? 0,
  } : null;

  const summary    = mode === 'weekly' ? weekSummary : monthlySummary;
  const isLoading  = mode === 'weekly' ? weekLoading : monthLoading;
  const error      = mode === 'weekly' ? weekError   : monthError;
  const maxDays    = mode === 'weekly' ? 7 : 31;

  const stats = [
    { label: 'Present', value: summary?.presentCount ?? 0, color: 'bg-green-500' },
    { label: 'Absent',  value: summary?.absentCount  ?? 0, color: 'bg-red-500'   },
    { label: 'WFH',     value: summary?.wfhCount     ?? 0, color: 'bg-purple-500' },
    { label: 'Late',    value: summary?.lateCount    ?? 0, color: 'bg-yellow-500' },
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

  // 7 days of current week for daily breakdown
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    const dateStr = format(d, 'yyyy-MM-dd');
    const rec = weekRecords.find((r) => r.date === dateStr);
    return { label: format(d, 'EEE'), date: dateStr, rec };
  });

  return (
    <div className="space-y-6">
      {error && <Alert type="error" message={(error as Error).message} />}

      {/* Mode toggle + controls */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Weekly / Monthly toggle */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {(['weekly', 'monthly'] as SummaryMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  mode === m
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {m === 'weekly' ? 'This Week' : 'Monthly'}
              </button>
            ))}
          </div>

          {/* Monthly controls */}
          {mode === 'monthly' && (
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
          )}

          {/* Weekly label */}
          {mode === 'weekly' && (
            <p className="text-sm text-gray-500">
              {format(weekStart, 'dd MMM')} – {format(weekEnd, 'dd MMM yyyy')}
            </p>
          )}
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
              <p className="text-2xl font-bold text-blue-700">{summary?.totalHours?.toFixed(1) ?? 0}</p>
              <p className="text-xs text-gray-400">hrs</p>
            </Card>
          </div>

          {/* Weekly: day-by-day breakdown */}
          {mode === 'weekly' && (
            <Card>
              <h3 className="text-sm font-semibold text-gray-900 mb-5">Day-by-Day Breakdown</h3>
              <div className="space-y-3">
                {weekDays.map(({ label, date, rec }) => {
                  const isToday = date === format(now, 'yyyy-MM-dd');
                  const hours = rec?.hoursWorked ?? 0;
                  const pct = hours > 0 ? Math.min(100, (hours / 8) * 100) : 0;
                  return (
                    <div key={date}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-medium w-8 ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>{label}</span>
                          <span className="text-xs text-gray-400">{format(parseISO(date), 'dd MMM')}</span>
                          {isToday && <span className="text-[10px] font-semibold bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">Today</span>}
                        </div>
                        <div className="flex items-center gap-3">
                          {rec?.status && <AttendanceStatusBadge status={rec.status} />}
                          <span className="text-sm font-medium text-gray-900 w-12 text-right">
                            {hours > 0 ? `${hours.toFixed(1)}h` : '—'}
                          </span>
                        </div>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            hours >= 8 ? 'bg-green-500' : hours > 0 ? 'bg-blue-500' : 'bg-transparent'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Monthly: bar chart */}
          {mode === 'monthly' && (
            <Card>
              <h3 className="text-sm font-semibold text-gray-900 mb-5">Breakdown</h3>
              <div className="space-y-4">
                {stats.map((s) => {
                  const pct = Math.min(100, (s.value / maxDays) * 100);
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
          )}
        </>
      )}
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const AttendancePage = () => {
  useParams<{ tenantSlug: string }>();
  const { user } = useAuth();
  const { data: myPerms } = useMyPermissions();
  const effectivePerms: string[] = myPerms?.permissions ?? [];
  const isManager   = hasPermission(user, PERMISSIONS.ATTENDANCE_ADMIN) ||
    ATTENDANCE_MANAGER_PERMS.some((p) => effectivePerms.includes(p));
  const canManageIp = hasPermission(user, PERMISSIONS.IP_CONFIG_WRITE);
  const [tab, setTab] = useState<Tab>('my');

  const tabs: { id: Tab; label: string; icon: React.ReactNode; managerOnly?: boolean; ipOnly?: boolean }[] = [
    { id: 'my',        label: 'My Attendance',  icon: <Clock size={15} /> },
    { id: 'live',      label: 'Team Live',       icon: <Users size={15} />,    managerOnly: true },
    { id: 'records',   label: 'Records',         icon: <BarChart2 size={15} /> },
    { id: 'summary',   label: 'Summary',         icon: <BarChart2 size={15} /> },
    { id: 'ip-config', label: 'IP Restrictions', icon: <Shield size={15} />,   ipOnly: true },
  ];

  const visibleTabs = tabs.filter((t) => {
    if (t.managerOnly && !isManager) return false;
    if (t.ipOnly && !canManageIp) return false;
    return true;
  });

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
        {tab === 'ip-config' && canManageIp && <IpConfigTab />}
      </div>
    </Layout>
  );
};

export default AttendancePage;
