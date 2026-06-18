import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle, CheckSquare, Clock, FolderKanban,
  LogIn, LogOut, CheckCircle2, Circle, ArrowUpRight, Timer,
  Layers, ChevronRight, Calendar, Zap, Users,
  AlertCircle, Star, Bell, Award, TrendingUp, TrendingDown,
  Activity, ShieldAlert, ClipboardList, Briefcase,
  Target, BarChart, Flame, Coffee, CheckCheck, Home, MapPin,
} from 'lucide-react';
import {
  ResponsiveContainer, PieChart, Pie, Cell,
  AreaChart, Area, BarChart as ReBarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { format, parseISO, isPast, addDays, isWithinInterval, startOfDay, endOfDay, differenceInDays, formatDistanceToNow } from 'date-fns';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import { RAGBadge, StatusBadge } from '../components/ui/Badge';
import { PageLoader } from '../components/ui/Spinner';
import Alert from '../components/ui/Alert';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import { useDashboardSummary } from '../hooks/useDashboard';
import { useExecSummary } from '../hooks/useExecDashboard';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission, PERMISSIONS, Permission } from '../utils/permissions';
import {
  useMyAttendanceRecord, useCheckIn, useCheckOut,
  useLeaveBalance, useLeaveRequests, useAttendanceSummary,
  useAttendanceLive, useAttendanceNotCheckedIn,
  useAnnouncements, useWfhRequests,
} from '../hooks/usePeople';
import UserAvatar from '../components/ui/UserAvatar';
import { useTasks, useMyTasks } from '../hooks/useTaskSprint';
import { useTimeSummary } from '../hooks/useTimeTracking';
import { useProjects } from '../hooks/useProjects';
import { useMyProfile } from '../hooks/useBadgeProfile';
import { useMyWeek, useTeamAnalytics } from '../hooks/useTimeTracking';
import { useI18n } from '../contexts/I18nContext';

// ── Live Timer ────────────────────────────────────────────────────────────────

function useElapsedTimer(startIso?: string) {
  const [elapsed, setElapsed] = useState('');
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!startIso) { setElapsed(''); return; }
    const calc = () => {
      const diff = Math.max(0, Date.now() - new Date(startIso).getTime());
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setElapsed(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    calc();
    ref.current = setInterval(calc, 1_000);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [startIso]);
  return elapsed;
}

// ── Check-in Widget ───────────────────────────────────────────────────────────

function CheckInWidget() {
  const { t } = useI18n();
  const { data: attendance } = useMyAttendanceRecord();
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();
  const [error, setError] = useState('');

  const today = attendance?.today as { checkInTime?: string; checkOutTime?: string; status?: string; hoursWorked?: number } | null | undefined;
  const isCheckedIn  = !!today?.checkInTime;
  const isCheckedOut = !!today?.checkOutTime;
  const isDone = isCheckedIn && isCheckedOut;

  const elapsed = useElapsedTimer(isCheckedIn && !isCheckedOut ? today?.checkInTime : undefined);

  const todayStr = new Date().toISOString().slice(0, 10);
  const { data: myWfhRequests = [] } = useWfhRequests({ mine: 'true' });
  const todayApprovedRemote = (myWfhRequests as any[]).find((r: any) => {
    if (r.status !== 'APPROVED') return false;
    const from = r.wfhDate ?? r.wfh_date ?? '';
    const to   = r.wfhDateTo ?? r.wfh_date_to ?? from;
    return from <= todayStr && todayStr <= (to || from);
  });

  const getGpsCoords = (): Promise<{ coords: { latitude: number; longitude: number } | null; errorCode: number }> => {
    return new Promise((resolve) => {
      console.warn('[GPS] ── starting location request ──────────────────────');
      console.log('[GPS] protocol:', window.location.protocol, '| host:', window.location.host);
      console.log('[GPS] geolocation API:', !!navigator?.geolocation ? 'available' : 'NOT AVAILABLE');
      if (!navigator?.geolocation) {
        console.error('[GPS] navigator.geolocation undefined — not HTTPS or unsupported browser');
        resolve({ coords: null, errorCode: 2 });
        return;
      }
      if (navigator.permissions) {
        navigator.permissions.query({ name: 'geolocation' }).then((s) => {
          console.warn('[GPS] permission state:', s.state, s.state === 'denied' ? '← BLOCKED — go to site settings to allow' : '');
        }).catch(() => {});
      }
      const onSuccess = (pos: GeolocationPosition) => {
        const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        console.warn('[GPS] ✓ position obtained — lat:', coords.latitude, 'lon:', coords.longitude, '| accuracy:', pos.coords.accuracy, 'm | cache age:', Math.round((Date.now() - pos.timestamp) / 1000), 's');
        resolve({ coords, errorCode: 0 });
      };
      console.warn('[GPS] attempt 1 — timeout=15s maxAge=5min …');
      navigator.geolocation.getCurrentPosition(
        onSuccess,
        (err) => {
          const r: Record<number, string> = { 1: 'PERMISSION_DENIED', 2: 'POSITION_UNAVAILABLE', 3: 'TIMEOUT' };
          console.warn('[GPS] attempt 1 failed:', r[err.code] ?? err.message, '(code', err.code + ')');
          if (err.code === 1) {
            console.error('[GPS] location access blocked — go to browser site settings and allow location');
            resolve({ coords: null, errorCode: 1 });
            return;
          }
          console.warn('[GPS] attempt 2 — using any cached position (maxAge=Infinity) …');
          navigator.geolocation.getCurrentPosition(
            onSuccess,
            (err2) => {
              console.error('[GPS] attempt 2 failed:', r[err2.code] ?? err2.message, '(code', err2.code + ')');
              resolve({ coords: null, errorCode: err.code ?? 2 });
            },
            { timeout: 5000, maximumAge: Infinity, enableHighAccuracy: false },
          );
        },
        { timeout: 15000, maximumAge: 300000, enableHighAccuracy: false },
      );
    });
  };

  const handleCheckIn = async () => {
    // If there's an approved remote-work request for today, skip GPS and use that approval
    if (todayApprovedRemote) { handleRemoteCheckIn(); return; }
    try {
      setError('');
      console.warn('[CheckIn] ── check-in button clicked (dashboard widget) ──────────────────────');
      const { coords, errorCode } = await getGpsCoords();
      const payload: Record<string, unknown> = { client_time: new Date().toLocaleString('sv'), ...(coords ?? {}) };
      if (!coords) payload.gps_error_code = errorCode;
      if (coords) {
        console.warn('[CheckIn] GPS coords included in payload → server validates against geo-zones');
      } else {
        console.warn('[CheckIn] no GPS coords (error code', errorCode, ') → server falls back to IP-geo');
      }
      console.warn('[CheckIn] payload sent to server:', JSON.stringify(payload));
      await checkIn.mutateAsync(payload);
    } catch (e: unknown) { setError((e as Error).message); }
  };

  const handleRemoteCheckIn = async () => {
    try {
      setError('');
      const reqType = (todayApprovedRemote?.request_type ?? todayApprovedRemote?.requestType ?? 'WFH').toUpperCase();
      const isLegacyWfh = reqType === 'WFH' || reqType === '';
      await checkIn.mutateAsync({
        client_time:  new Date().toLocaleString('sv'),
        is_wfh:       true,
        remote_type:  isLegacyWfh ? undefined : reqType,
        wfh_reason:   todayApprovedRemote?.reason ?? '',
      });
    } catch (e: unknown) { setError((e as Error).message); }
  };

  const handleCheckOut = async () => {
    try { setError(''); await checkOut.mutateAsync({ client_time: new Date().toLocaleString('sv') }); } catch (e: unknown) { setError((e as Error).message); }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isCheckedIn && !isCheckedOut ? 'bg-green-100' : isDone ? 'bg-blue-100' : 'bg-gray-100'}`}>
            <Clock size={14} className={isCheckedIn && !isCheckedOut ? 'text-green-600' : isDone ? 'text-blue-600' : 'text-gray-500'} />
          </div>
          <span className="text-sm font-semibold text-gray-800">{t('dashboard.attendance.title')}</span>
        </div>
        {today?.status && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${today.status === 'PRESENT' ? 'bg-green-100 text-green-700' : today.status === 'WFH' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
            {today.status}
          </span>
        )}
      </div>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      {!isCheckedIn && (
        <div className="flex flex-col items-center py-3 gap-3">
          <div className="flex flex-col items-center gap-1">
            <Coffee size={22} className="text-gray-300" />
            <p className="text-xs text-gray-500">{t('dashboard.attendance.notCheckedIn')}</p>
          </div>
          <div className="flex gap-2 w-full">
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white flex-1 justify-center"
              icon={<LogIn size={14} />}
              loading={checkIn.isPending}
              onClick={handleCheckIn}
            >
              {t('dashboard.attendance.checkInNow')}
            </Button>
            {todayApprovedRemote && (() => {
              const reqType = (todayApprovedRemote.request_type ?? todayApprovedRemote.requestType ?? 'WFH').toUpperCase();
              const isClientVisit = reqType === 'CLIENT_VISIT';
              const isFieldWork   = reqType === 'FIELD_WORK';
              const isOffsite     = reqType === 'OFFSITE';
              const Icon  = isClientVisit ? Briefcase : isFieldWork || isOffsite ? MapPin : Home;
              const label = isClientVisit ? 'Client Visit' : isFieldWork ? 'Field Work' : isOffsite ? 'Offsite' : 'WFH';
              const style = isClientVisit
                ? 'bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700'
                : isFieldWork || isOffsite
                  ? 'bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700'
                  : 'bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700';
              return (
                <button
                  onClick={handleRemoteCheckIn}
                  disabled={checkIn.isPending}
                  title={`${label}: ${todayApprovedRemote.reason}`}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-60 ${style}`}
                >
                  <Icon size={13} />
                  {label}
                </button>
              );
            })()}
          </div>
        </div>
      )}

      {isCheckedIn && !isCheckedOut && (
        <div className="space-y-3">
          <div className="text-center bg-green-50 rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-0.5">{t('dashboard.attendance.timeSinceCheckIn')}</p>
            <p className="text-2xl font-bold text-green-600 font-mono tabular-nums tracking-widest">{elapsed}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {t('dashboard.attendance.checkedInAt')} {today?.checkInTime ? format(new Date(today.checkInTime), 'hh:mm a') : ''}
            </p>
          </div>
          <Button
            size="sm"
            variant="danger"
            icon={<LogOut size={13} />}
            loading={checkOut.isPending}
            onClick={handleCheckOut}
            className="w-full justify-center"
          >
            {t('dashboard.attendance.checkOut')}
          </Button>
        </div>
      )}

      {isDone && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-gray-50 rounded-lg p-2">
            <p className="text-[10px] text-gray-400 mb-0.5">{t('dashboard.attendance.labelIn')}</p>
            <p className="text-xs font-semibold text-gray-700">{today?.checkInTime ? format(new Date(today.checkInTime), 'hh:mm a') : '—'}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <p className="text-[10px] text-gray-400 mb-0.5">{t('dashboard.attendance.labelOut')}</p>
            <p className="text-xs font-semibold text-gray-700">{today?.checkOutTime ? format(new Date(today.checkOutTime), 'hh:mm a') : '—'}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-2">
            <p className="text-[10px] text-gray-400 mb-0.5">{t('dashboard.attendance.labelHours')}</p>
            <p className="text-xs font-semibold text-blue-700">{today?.hoursWorked?.toFixed(1) ?? '—'}h</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── KPI Hero Card ──────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  iconBg: string;
  valueCls?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
  to?: string;
}

function KpiCard({ label, value, sub, icon, iconBg, valueCls = 'text-gray-900', trend, trendLabel, to }: KpiCardProps) {
  const accent = iconBg.includes('red') ? 'bg-red-400'
    : iconBg.includes('green')  ? 'bg-green-400'
    : iconBg.includes('amber')  ? 'bg-amber-400'
    : iconBg.includes('blue')   ? 'bg-blue-400'
    : iconBg.includes('indigo') ? 'bg-indigo-400'
    : iconBg.includes('purple') ? 'bg-purple-400'
    : iconBg.includes('orange') ? 'bg-orange-400'
    : iconBg.includes('teal')   ? 'bg-teal-400'
    : 'bg-gray-200';

  const inner = (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-all group h-full flex flex-col">
      <div className={`h-1 w-full ${accent}`} />
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-center justify-between">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg} transition-transform group-hover:scale-105`}>
            {icon}
          </div>
          {trend && (
            <span className={`flex items-center gap-0.5 text-xs font-medium px-2 py-0.5 rounded-full ${
              trend === 'up'   ? 'text-green-700 bg-green-50' :
              trend === 'down' ? 'text-red-600 bg-red-50'     : 'text-gray-400'
            }`}>
              {trend === 'up' ? <TrendingUp size={11} /> : trend === 'down' ? <TrendingDown size={11} /> : null}
              {trendLabel && <span className="ml-0.5">{trendLabel}</span>}
            </span>
          )}
        </div>
        <div>
          <p className={`text-2xl font-bold leading-none ${valueCls}`}>{value}</p>
          <p className="text-xs font-semibold text-gray-500 mt-1">{label}</p>
          {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  );
  if (to) return <Link to={to}>{inner}</Link>;
  return inner;
}

// ── My Tasks Widget ───────────────────────────────────────────────────────────

function MyTasksWidget({ userId, tenantSlug }: { userId: string; tenantSlug: string }) {
  const { t } = useI18n();
  const { data: rawTasks } = useTasks();
  const { data: projects = [] } = useProjects();

  const tasks = useMemo(() => {
    const arr = Array.isArray(rawTasks) ? rawTasks : (rawTasks as { data?: unknown[] })?.data ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (arr as any[]).filter((t) =>
      t.assigneeIds?.includes(String(userId)) || String(t.assigneeId) === String(userId) || String(t.createdBy) === String(userId)
    );
  }, [rawTasks, userId]);

  const done       = tasks.filter((t) => t.status === 'DONE');
  const inProgress = tasks.filter((t) => t.status === 'IN_PROGRESS');
  const todo       = tasks.filter((t) => t.status === 'TODO');

  const dueSoon = tasks.filter((t) => {
    if (!t.dueDate || t.status === 'DONE') return false;
    try {
      const due = parseISO(t.dueDate);
      return isWithinInterval(due, { start: startOfDay(new Date()), end: endOfDay(addDays(new Date(), 7)) });
    } catch { return false; }
  });
  const overdue = tasks.filter((t) => {
    if (!t.dueDate || t.status === 'DONE') return false;
    try { return isPast(parseISO(t.dueDate)); } catch { return false; }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getProject = (projectId: string) => (projects as any[]).find((p) => String(p.id) === String(projectId));

  const overdueIds = new Set(overdue.map((t) => t.id));

  const PRIORITY_PILL: Record<string, string> = {
    CRITICAL: 'bg-red-100 text-red-700',
    HIGH:     'bg-orange-100 text-orange-700',
    MEDIUM:   'bg-yellow-100 text-yellow-700',
    LOW:      'bg-gray-100 text-gray-500',
  };
  const STATUS_ICON: Record<string, React.ReactNode> = {
    TODO:        <Circle size={13} className="text-gray-400" />,
    IN_PROGRESS: <ArrowUpRight size={13} className="text-blue-500" />,
    IN_REVIEW:   <AlertCircle size={13} className="text-yellow-500" />,
    DONE:        <CheckCircle2 size={13} className="text-green-500" />,
  };

  const totalActive    = tasks.filter((t) => t.status !== 'DONE').length;
  const completionPct  = tasks.length > 0 ? Math.round((done.length / tasks.length) * 100) : 0;

  // Display order: overdue first, then non-overdue in-progress, then todo
  const displayTasks = [
    ...overdue,
    ...inProgress.filter((t) => !overdueIds.has(t.id)),
    ...todo.filter((t) => !overdueIds.has(t.id)),
  ].slice(0, 8);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CheckSquare size={15} className="text-indigo-600" />
            <span className="text-sm font-semibold text-gray-900">{t('dashboard.myTasks.title')}</span>
            <span className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium">{t('dashboard.myTasks.active', { count: totalActive })}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {overdue.length > 0 && (
              <span className="flex items-center gap-1 text-red-600 font-semibold bg-red-50 px-2 py-0.5 rounded-full">
                <AlertTriangle size={10} /> {t('dashboard.myTasks.overdue', { count: overdue.length })}
              </span>
            )}
            {dueSoon.length > 0 && overdue.length === 0 && (
              <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{t('dashboard.myTasks.dueSoon', { count: dueSoon.length })}</span>
            )}
            <Link to={`/${tenantSlug}/my-tasks`} className="text-indigo-600 hover:underline flex items-center gap-0.5">
              {t('dashboard.myTasks.viewAll')} <ChevronRight size={11} />
            </Link>
          </div>
        </div>

        {/* Task status donut chart */}
        {tasks.length > 0 && (() => {
          const chartData = [
            { name: 'Done',        value: done.length,                                           color: '#22c55e' },
            { name: 'In Progress', value: inProgress.filter(t => !overdueIds.has(t.id)).length,  color: '#6366f1' },
            { name: 'Todo',        value: todo.filter(t => !overdueIds.has(t.id)).length,         color: '#d1d5db' },
            { name: 'Overdue',     value: overdue.length,                                         color: '#ef4444' },
          ].filter(d => d.value > 0);
          return (
            <div className="flex items-center gap-4">
              <div className="w-[72px] h-[72px] flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={chartData} cx="50%" cy="50%" innerRadius={22} outerRadius={34}
                      paddingAngle={2} dataKey="value" strokeWidth={0}>
                      {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1.5">
                {chartData.map(entry => (
                  <div key={entry.name} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: entry.color }} />
                    <span className="text-[11px] text-gray-500 flex-1">{entry.name}</span>
                    <span className="text-[11px] font-bold" style={{ color: entry.color }}>{entry.value}</span>
                  </div>
                ))}
                <div className="col-span-2 mt-0.5">
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${completionPct}%` }} />
                    </div>
                    <span className="text-[11px] font-semibold text-gray-600 shrink-0">{t('dashboard.myTasks.donePct', { pct: completionPct })}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Task list */}
      {tasks.length === 0 ? (
        <div className="py-8 text-center">
          <CheckCheck size={28} className="mx-auto text-green-300 mb-2" />
          <p className="text-sm font-medium text-gray-500">{t('dashboard.myTasks.allCaughtUp')}</p>
          <p className="text-xs text-gray-400 mt-0.5">{t('dashboard.myTasks.noTasks')}</p>
        </div>
      ) : (
        <>
          {/* Overdue section header */}
          {overdue.length > 0 && (
            <div className="px-4 py-1.5 bg-red-50 border-b border-red-100 flex items-center gap-1.5">
              <AlertTriangle size={11} className="text-red-500" />
              <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider">{t('dashboard.myTasks.overdueSection', { count: overdue.length })}</span>
            </div>
          )}
          <div className="divide-y divide-gray-50">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {displayTasks.map((task: any) => {
              const isOv = overdueIds.has(task.id);
              const daysOv = isOv && task.dueDate
                ? Math.max(1, differenceInDays(new Date(), parseISO(task.dueDate)))
                : 0;
              return (
                <div
                  key={task.id}
                  className={`px-4 py-2.5 flex items-center gap-3 transition-colors ${
                    isOv ? 'bg-red-50/40 hover:bg-red-50/70 border-l-2 border-l-red-400' : 'hover:bg-gray-50'
                  }`}
                >
                  <span className="flex-shrink-0">{STATUS_ICON[task.status] ?? <Circle size={13} />}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isOv ? 'text-red-900' : 'text-gray-800'}`}>{task.title}</p>
                    <p className="text-[10px] text-gray-400 truncate">{getProject(task.projectId)?.name ?? ''}</p>
                  </div>
                  {task.priority && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${PRIORITY_PILL[task.priority] ?? 'bg-gray-100 text-gray-500'}`}>
                      {task.priority.charAt(0) + task.priority.slice(1).toLowerCase()}
                    </span>
                  )}
                  {isOv ? (
                    <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded shrink-0">
                      {t('tasks.daysOverdue', { count: daysOv })}
                    </span>
                  ) : task.dueDate ? (
                    <span className="text-[10px] text-gray-400 shrink-0">{format(parseISO(task.dueDate), 'MMM d')}</span>
                  ) : null}
                </div>
              );
            })}
          </div>
          {totalActive > 8 && (
            <div className="px-4 py-2 border-t border-gray-50">
              <Link to={`/${tenantSlug}/my-tasks`} className="text-xs text-indigo-600 hover:underline">
                {t('dashboard.myTasks.moreTasks', { count: totalActive - 8 })}
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Quick Actions ─────────────────────────────────────────────────────────────

function QuickActions({ tenantSlug, user }: { tenantSlug: string; user: ReturnType<typeof useAuth>['user'] }) {
  const { t } = useI18n();
  const allActions: { label: string; to: string; icon: React.ReactNode; bg: string; permission: Permission | null }[] = [
    { label: t('nav.submitStandup'), to: `/${tenantSlug}/standup`,       icon: <Clock size={15} />,         bg: 'bg-blue-50 text-blue-700 hover:bg-blue-100',      permission: PERMISSIONS.STANDUP_SUBMIT },
    { label: t('nav.submitEod'),     to: `/${tenantSlug}/eod`,           icon: <CheckSquare size={15} />,   bg: 'bg-green-50 text-green-700 hover:bg-green-100',   permission: PERMISSIONS.EOD_SUBMIT },
    { label: t('nav.timeTracking'),  to: `/${tenantSlug}/time-tracking`, icon: <Timer size={15} />,         bg: 'bg-purple-50 text-purple-700 hover:bg-purple-100', permission: PERMISSIONS.TIME_WRITE },
    { label: t('nav.myTasks'),       to: `/${tenantSlug}/my-tasks`,      icon: <Layers size={15} />,        bg: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100', permission: PERMISSIONS.TASK_READ },
    { label: t('blockers.new'),      to: `/${tenantSlug}/blockers`,      icon: <AlertTriangle size={15} />, bg: 'bg-red-50 text-red-700 hover:bg-red-100',          permission: PERMISSIONS.BLOCKER_READ },
    { label: t('leave.apply'),       to: `/${tenantSlug}/leave`,         icon: <Calendar size={15} />,      bg: 'bg-amber-50 text-amber-700 hover:bg-amber-100',    permission: PERMISSIONS.LEAVE_READ },
    { label: t('nav.projects'),      to: `/${tenantSlug}/projects`,      icon: <FolderKanban size={15} />,  bg: 'bg-sky-50 text-sky-700 hover:bg-sky-100',          permission: PERMISSIONS.PROJECT_READ },
    { label: t('nav.sprintBoards'),  to: `/${tenantSlug}/sprints`,       icon: <Activity size={15} />,      bg: 'bg-violet-50 text-violet-700 hover:bg-violet-100', permission: PERMISSIONS.SPRINT_READ },
    { label: t('nav.directory'),     to: `/${tenantSlug}/directory`,     icon: <Users size={15} />,         bg: 'bg-teal-50 text-teal-700 hover:bg-teal-100',        permission: null },
    { label: t('nav.aiInsights'),    to: `/${tenantSlug}/ai-insights`,   icon: <Zap size={15} />,           bg: 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100', permission: PERMISSIONS.AI_INSIGHTS },
  ];

  const actions = allActions.filter((a) => !a.permission || hasPermission(user, a.permission));

  if (actions.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 h-full">
      <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <Star size={14} className="text-indigo-500" /> {t('dashboard.quickActions.title')}
      </h3>
      <div className="grid grid-cols-4 gap-2">
        {actions.slice(0, 8).map((a) => (
          <Link key={a.label} to={a.to}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl text-xs font-medium transition-colors text-center ${a.bg}`}>
            {a.icon}
            <span className="leading-tight">{a.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Leave Balance Widget ──────────────────────────────────────────────────────

function LeaveBalanceWidget({ tenantSlug }: { tenantSlug: string }) {
  const { t } = useI18n();
  const { data: rawBalances } = useLeaveBalance();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const balances: any[] = Array.isArray(rawBalances) ? rawBalances : [];
  if (balances.length === 0) return null;

  const totalRemaining = balances.reduce((s: number, b: any) => s + (Number(b.remaining) || 0), 0);
  const lowBalances    = balances.filter((b: any) => b.remaining <= 2 && b.allocated > 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar size={15} className="text-amber-600" />
          <span className="text-sm font-semibold text-gray-900">{t('dashboard.leaveBalance.title')}</span>
          {lowBalances.length > 0 && (
            <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-1">
              <AlertTriangle size={9} /> {t('dashboard.leaveBalance.low', { count: lowBalances.length })}
            </span>
          )}
        </div>
        <Link to={`/${tenantSlug}/leave`} className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
          {t('dashboard.leaveBalance.applyLeave')} <ChevronRight size={11} />
        </Link>
      </div>

      {/* Total headline */}
      <div className="px-4 pt-3 pb-2 flex items-baseline gap-2">
        <span className="text-3xl font-bold text-gray-900">{totalRemaining}</span>
        <span className="text-sm text-gray-400">{t('dashboard.leaveBalance.daysRemaining')}</span>
      </div>

      <div className="px-4 pb-4 grid grid-cols-2 gap-2.5">
        {balances.slice(0, 6).map((b: any) => {
          const used      = Number(b.used ?? 0);
          const pending   = Number(b.pending ?? 0);
          const allocated = Number(b.allocated ?? 0);
          const remaining = Number(b.remaining ?? 0);
          const usedPct   = allocated > 0 ? Math.min(100, ((used + pending) / allocated) * 100) : 0;
          const isLow     = remaining <= 2 && allocated > 0;
          const isPending = pending > 0;

          return (
            <div key={b.leaveTypeId ?? b.id}
              className={`p-3 rounded-xl border-2 transition-colors ${
                isLow
                  ? 'bg-red-50 border-red-200'
                  : isPending
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-gray-50 border-gray-100'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <p className="text-[11px] font-semibold text-gray-500 truncate leading-tight">{b.leaveTypeName}</p>
                {isLow && <AlertTriangle size={10} className="text-red-500 flex-shrink-0 mt-0.5" />}
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-bold leading-none ${isLow ? 'text-red-600' : 'text-gray-800'}`}>
                  {remaining}
                </span>
                <span className="text-[11px] text-gray-400">/ {allocated}d</span>
              </div>
              {isPending && (
                <p className="text-[10px] text-amber-600 mt-0.5">{t('dashboard.leaveBalance.pending', { count: pending })}</p>
              )}
              <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${isLow ? 'bg-red-400' : isPending ? 'bg-amber-400' : 'bg-blue-500'}`}
                  style={{ width: `${100 - usedPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Pending Leave Requests Widget (for managers) ──────────────────────────────

function PendingLeavesWidget({ tenantSlug }: { tenantSlug: string }) {
  const { t } = useI18n();
  const { data: raw } = useLeaveRequests({ status: 'PENDING' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requests: any[] = Array.isArray(raw) ? raw : [];
  if (requests.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={15} className="text-amber-500" />
          <span className="text-sm font-semibold text-gray-900">{t('dashboard.pendingLeaves.title')}</span>
          <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">{requests.length}</span>
        </div>
        <Link to={`/${tenantSlug}/leave`} className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
          {t('dashboard.pendingLeaves.review')} <ChevronRight size={11} />
        </Link>
      </div>
      <div className="divide-y divide-gray-50">
        {requests.slice(0, 4).map((r: any) => (
          <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
            <UserAvatar name={r.userName ?? ''} avatarUrl={r.userAvatarUrl} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{r.userName ?? 'Unknown'}</p>
              <p className="text-xs text-gray-500">{r.leaveTypeName} · {r.startDate} {r.startDate !== r.endDate ? `→ ${r.endDate}` : ''}</p>
            </div>
            <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full shrink-0">{r.days}d</span>
          </div>
        ))}
        {requests.length > 4 && (
          <div className="px-4 py-2">
            <Link to={`/${tenantSlug}/leave`} className="text-xs text-indigo-600 hover:underline">
              {t('dashboard.pendingLeaves.morePending', { count: requests.length - 4 })}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Team Attendance Widget (for managers) ─────────────────────────────────────

function TeamAttendanceWidget({ tenantSlug }: { tenantSlug: string }) {
  const { t } = useI18n();
  const { data: liveData }         = useAttendanceLive();
  const { data: notCheckedInData } = useAttendanceNotCheckedIn();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const liveUsers: any[]     = Array.isArray(liveData) ? liveData : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notCheckedIn: any[]  = Array.isArray(notCheckedInData) ? notCheckedInData : [];

  // Deduplicate: live endpoint only returns records still open (not checked out),
  // but the not-checked-in endpoint already excludes anyone with a check-in record today.
  const liveUserIds = new Set(liveUsers.map((u) => String(u.userId ?? u.user_id ?? u.id)));
  const filteredNotIn = notCheckedIn.filter((u) => !liveUserIds.has(String(u.userId ?? u.id)));

  const present = liveUsers.length;           // currently in office (not checked out yet)
  const notIn   = filteredNotIn.length;       // not checked in at all today
  const total   = present + notIn || 1;
  const attendanceRate = Math.round((present / total) * 100);
  const isHealthy = attendanceRate >= 70;

  // Compute WFH count from live users
  const wfh  = liveUsers.filter((u) => u.is_wfh === 'true' || u.status === 'WFH').length;
  const inOffice = present - wfh;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className={`h-1 w-full ${isHealthy ? 'bg-green-400' : attendanceRate >= 50 ? 'bg-amber-400' : 'bg-red-400'}`} />

      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={15} className="text-teal-600" />
          <span className="text-sm font-semibold text-gray-900">{t('dashboard.teamAttendance.title')}</span>
        </div>
        <Link to={`/${tenantSlug}/attendance`} className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
          {t('dashboard.teamAttendance.fullView')} <ChevronRight size={11} />
        </Link>
      </div>

      <div className="p-4">
        {/* Headline + donut chart side by side */}
        <div className="flex items-center gap-4 mb-4">
          <div className="w-24 h-24 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'In Office', value: inOffice,        fill: '#22c55e' },
                    { name: 'WFH',       value: wfh,             fill: '#60a5fa' },
                    { name: 'Not In',    value: notIn,           fill: '#fca5a5' },
                  ].filter(d => d.value > 0)}
                  cx="50%" cy="50%"
                  innerRadius={28} outerRadius={42}
                  paddingAngle={2}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {[
                    { fill: '#22c55e' }, { fill: '#60a5fa' }, { fill: '#fca5a5' },
                  ].map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1">
            <p className={`text-4xl font-bold leading-none ${isHealthy ? 'text-green-600' : attendanceRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
              {attendanceRate}%
            </p>
            <p className="text-xs text-gray-400 mt-1">{t('dashboard.teamAttendance.teamMembers', { count: total })}</p>
            <div className="flex flex-wrap gap-3 mt-2">
              <span className="flex items-center gap-1 text-[11px] text-gray-600">
                <span className="w-2.5 h-2.5 rounded bg-green-500 inline-block" />{t('dashboard.teamAttendance.office', { count: inOffice })}
              </span>
              {wfh > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-gray-600">
                  <span className="w-2.5 h-2.5 rounded bg-blue-400 inline-block" />{t('dashboard.teamAttendance.wfh', { count: wfh })}
                </span>
              )}
              {notIn > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-red-500 font-semibold">
                  <span className="w-2.5 h-2.5 rounded bg-red-300 inline-block" />{t('dashboard.teamAttendance.notIn', { count: notIn })}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stacked progress bar */}
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex mb-3">
          <div className="h-full bg-green-500 transition-all" style={{ width: `${(inOffice / total) * 100}%` }} />
          <div className="h-full bg-blue-400  transition-all" style={{ width: `${(wfh     / total) * 100}%` }} />
          <div className="h-full bg-red-300   transition-all" style={{ width: `${(notIn   / total) * 100}%` }} />
        </div>

        {/* Currently in office avatars */}
        {liveUsers.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">{t('dashboard.teamAttendance.currentlyIn')}</p>
            <div className="flex flex-wrap gap-1.5">
              {liveUsers.slice(0, 8).map((u: any) => (
                <div key={u.id ?? u.userId} className="flex items-center gap-1.5 bg-green-50 border border-green-100 rounded-full px-2 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                  <span className="text-[11px] text-gray-700 font-medium">{u.name ?? 'Team member'}</span>
                </div>
              ))}
              {liveUsers.length > 8 && (
                <span className="text-[11px] text-gray-400 px-2 py-0.5">+{liveUsers.length - 8} more</span>
              )}
            </div>
          </div>
        )}

        {/* Not yet checked in */}
        {filteredNotIn.length > 0 && (
          <div className="bg-red-50 rounded-xl p-3">
            <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider mb-2">
              {t('dashboard.teamAttendance.notYetCheckedIn', { count: filteredNotIn.length })}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {filteredNotIn.slice(0, 6).map((u: any) => (
                <span key={u.id ?? u.userId}
                  className="text-[11px] bg-white border border-red-200 text-red-700 px-2 py-0.5 rounded-full font-medium">
                  {u.name ?? 'Team member'}
                </span>
              ))}
              {filteredNotIn.length > 6 && (
                <span className="text-[11px] text-red-500">+{filteredNotIn.length - 6} more</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── My Badges Widget ──────────────────────────────────────────────────────────

function MyBadgesWidget({ tenantSlug }: { tenantSlug: string }) {
  const { t } = useI18n();
  const { data: profile } = useMyProfile();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const badges: any[] = Array.isArray((profile as any)?.badges) ? (profile as any).badges : [];
  if (badges.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award size={15} className="text-amber-500" />
          <span className="text-sm font-semibold text-gray-900">{t('dashboard.badges.title')}</span>
          <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">{badges.length}</span>
        </div>
        <Link to={`/${tenantSlug}/directory`} className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
          {t('dashboard.badges.viewProfile')} <ChevronRight size={11} />
        </Link>
      </div>
      <div className="p-4 flex flex-wrap gap-2">
        {badges.slice(0, 8).map((b: any) => {
          const def = b.badge ?? {};
          const logoUrl = def.logo_url ?? '';
          const emoji = def.icon_emoji ?? '🏅';
          const name = def.name ?? 'Badge';
          return (
            <div key={b.ROWID ?? b.id} title={name}
              className="flex flex-col items-center gap-1 p-2 bg-amber-50 border border-amber-100 rounded-xl w-16 text-center">
              {logoUrl ? (
                <img src={logoUrl} alt={name} className="w-8 h-8 rounded-full object-cover border border-amber-200"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <span className="text-xl leading-none">{emoji}</span>
              )}
              <p className="text-[10px] text-gray-600 leading-tight truncate w-full">{name}</p>
            </div>
          );
        })}
        {badges.length > 8 && (
          <div className="flex flex-col items-center justify-center p-2 bg-gray-50 border border-gray-100 rounded-xl w-16 text-center">
            <span className="text-sm font-bold text-gray-500">+{badges.length - 8}</span>
            <p className="text-[10px] text-gray-400">{t('common.showMore')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Announcements Widget ──────────────────────────────────────────────────────

function AnnouncementsWidget({ tenantSlug }: { tenantSlug: string }) {
  const { t } = useI18n();
  const { data: raw } = useAnnouncements();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = Array.isArray(raw) ? raw.slice(0, 4) : [];
  if (items.length === 0) return null;

  const relativeDate = (dateStr: string) => {
    try {
      const d = new Date(String(dateStr ?? '').replace(' ', 'T'));
      if (isNaN(d.getTime())) return '';
      return formatDistanceToNow(d, { addSuffix: true });
    } catch { return ''; }
  };

  const PRIORITY_STYLE: Record<string, string> = {
    HIGH:   'bg-red-100 text-red-700',
    MEDIUM: 'bg-amber-100 text-amber-700',
    LOW:    'bg-gray-100 text-gray-500',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={15} className="text-purple-600" />
          <span className="text-sm font-semibold text-gray-900">{t('dashboard.announcements.title')}</span>
          <span className="text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">{items.length}</span>
        </div>
        <Link to={`/${tenantSlug}/announcements`} className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
          {t('dashboard.announcements.viewAll')} <ChevronRight size={11} />
        </Link>
      </div>
      <div className="divide-y divide-gray-50">
        {items.map((a: any) => {
          const priority = a.priority ?? a.importance ?? '';
          const priorityCls = PRIORITY_STYLE[priority] ?? '';
          return (
            <div key={a.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
              <div className="flex items-start gap-2">
                {priorityCls && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0 mt-0.5 ${priorityCls}`}>
                    {priority}
                  </span>
                )}
                <p className="text-sm font-medium text-gray-800 leading-snug flex-1">{a.title}</p>
              </div>
              {a.content && (
                <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{a.content}</p>
              )}
              <p className="text-[10px] text-gray-400 mt-1.5">{relativeDate(a.createdAt ?? a.created_at ?? '')}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Projects RAG Widget ───────────────────────────────────────────────────────

function ProjectsWidget({ summary, tenantSlug }: { summary: any; tenantSlug: string }) {
  const { t } = useI18n();
  const red   = summary?.ragSummary?.RED   ?? 0;
  const amber = summary?.ragSummary?.AMBER ?? 0;
  const green = summary?.ragSummary?.GREEN ?? 0;
  const total = red + amber + green || 1;

  const RAG_LEFT: Record<string, string> = {
    RED:   'border-l-red-400   bg-red-50/30',
    AMBER: 'border-l-amber-400 bg-amber-50/20',
    GREEN: 'border-l-green-400 bg-transparent',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <FolderKanban size={14} className="text-blue-500" /> {t('dashboard.projects.title')}
        </h3>
        <Link to={`/${tenantSlug}/projects`} className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
          {t('dashboard.projects.viewAll')} <ChevronRight size={11} />
        </Link>
      </div>

      {/* RAG scorecard bar */}
      <div className="px-4 pt-3 pb-3 border-b border-gray-50">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden flex">
            <div className="h-full bg-red-500"   style={{ width: `${(red   / total) * 100}%` }} />
            <div className="h-full bg-amber-400" style={{ width: `${(amber / total) * 100}%` }} />
            <div className="h-full bg-green-500" style={{ width: `${(green / total) * 100}%` }} />
          </div>
          <span className="text-xs font-semibold text-gray-500 shrink-0">{total}</span>
        </div>
        <div className="flex gap-3 text-[10px]">
          {red   > 0 && <span className="flex items-center gap-1 text-red-600 font-semibold"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{t('dashboard.projects.atRisk', { count: red })}</span>}
          {amber > 0 && <span className="flex items-center gap-1 text-amber-600"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />{t('dashboard.projects.caution', { count: amber })}</span>}
          {green > 0 && <span className="flex items-center gap-1 text-green-700"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />{t('dashboard.projects.healthy', { count: green })}</span>}
        </div>
      </div>

      {/* Project rows */}
      <div className="divide-y divide-gray-50">
        {(!summary?.projects || summary.projects.length === 0)
          ? <EmptyState title={t('dashboard.projects.noProjects')} description={t('dashboard.projects.noProjectsDesc')} />
          : summary.projects.slice(0, 7).map((p: { id: string; name: string; ragStatus: string; status?: string }) => {
              const rag = p.ragStatus ?? 'GREEN';
              const leftCls = RAG_LEFT[rag] ?? '';
              return (
                <Link
                  key={p.id}
                  to={`/${tenantSlug}/projects/${p.id}`}
                  className={`flex items-center gap-3 px-4 py-3 border-l-2 hover:bg-gray-50 transition-colors group ${leftCls}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 font-medium truncate group-hover:text-indigo-600 transition-colors">{p.name}</p>
                    {p.status && (
                      <p className="text-[10px] text-gray-400 mt-0.5 capitalize">{p.status.toLowerCase().replace('_', ' ')}</p>
                    )}
                  </div>
                  <RAGBadge status={rag} />
                </Link>
              );
            })
        }
      </div>

      {summary?.projects?.length > 7 && (
        <div className="px-4 py-2 border-t border-gray-50">
          <Link to={`/${tenantSlug}/projects`} className="text-xs text-indigo-600 hover:underline">
            {t('dashboard.projects.viewAllCount', { count: summary.projects.length })}
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Activity Trend Widget (managers) ─────────────────────────────────────────────

function ActivityTrendWidget({ tenantSlug, enabled = true }: { tenantSlug: string; enabled?: boolean }) {
  const { t } = useI18n();
  const { data: exec } = useExecSummary(enabled);

  if (!exec?.activityTrend?.length) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2">
          <Activity size={15} className="text-indigo-600" />
          <span className="text-sm font-semibold text-gray-900">{t('dashboard.activityTrend.title')}</span>
        </div>
        <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
          <Activity size={28} className="text-gray-200" />
          <p className="text-sm text-gray-400 font-medium">{t('dashboard.activityTrend.noActivity')}</p>
          <p className="text-xs text-gray-300">{t('dashboard.activityTrend.noActivityDesc')}</p>
        </div>
      </div>
    );
  }

  const chartData = exec.activityTrend.map((d) => ({
    date: format(parseISO(d.date), 'MMM d'),
    Standups: d.standups,
    EODs: d.eods,
  }));

  const submittedToday = exec.standups?.submittedToday ?? 0;
  const eodToday       = exec.eods?.submittedToday ?? 0;
  const last7Total     = exec.standups?.last7DaysTotal ?? 0;
  const rate           = exec.standups?.submissionRateLast7d ?? 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-indigo-600" />
          <span className="text-sm font-semibold text-gray-900">{t('dashboard.activityTrend.title')}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {t('dashboard.activityTrend.submissionRate')}{' '}
            <span className={`font-semibold ${rate >= 70 ? 'text-green-600' : 'text-amber-600'}`}>
              {Math.round(rate)}%
            </span>
          </span>
          <Link to={`/${tenantSlug}/standup`} className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
            {t('dashboard.activityTrend.view')} <ChevronRight size={11} />
          </Link>
        </div>
      </div>

      <div className="p-4">
        {/* Stat chips */}
        <div className="flex items-center gap-6 mb-4">
          <div className="bg-indigo-50 rounded-xl px-3 py-2 text-center">
            <p className="text-xl font-bold text-indigo-700">{submittedToday}</p>
            <p className="text-[10px] text-indigo-500 font-medium">{t('dashboard.activityTrend.standupsToday')}</p>
          </div>
          <div className="bg-green-50 rounded-xl px-3 py-2 text-center">
            <p className="text-xl font-bold text-green-700">{eodToday}</p>
            <p className="text-[10px] text-green-600 font-medium">{t('dashboard.activityTrend.eodsToday')}</p>
          </div>
          <div className="bg-gray-50 rounded-xl px-3 py-2 text-center">
            <p className="text-xl font-bold text-gray-700">{last7Total}</p>
            <p className="text-[10px] text-gray-400 font-medium">{t('dashboard.activityTrend.standups7d')}</p>
          </div>
          <div className={`rounded-xl px-3 py-2 text-center ml-auto ${rate >= 70 ? 'bg-green-50' : 'bg-amber-50'}`}>
            <p className={`text-xl font-bold ${rate >= 70 ? 'text-green-700' : 'text-amber-700'}`}>{Math.round(rate)}%</p>
            <p className={`text-[10px] font-medium ${rate >= 70 ? 'text-green-500' : 'text-amber-600'}`}>{t('dashboard.activityTrend.rate7d')}</p>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="gradStandups" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gradEods" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }} />
            <Area type="monotone" dataKey="Standups" stroke="#6366f1" strokeWidth={2} fill="url(#gradStandups)" dot={false} activeDot={{ r: 4 }} />
            <Area type="monotone" dataKey="EODs"     stroke="#22c55e" strokeWidth={2} fill="url(#gradEods)"     dot={false} activeDot={{ r: 4 }} />
          </AreaChart>
        </ResponsiveContainer>

        <div className="flex items-center gap-5 mt-2 justify-center">
          <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className="w-4 h-0.5 bg-indigo-500 inline-block rounded" />Standups
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className="w-4 h-0.5 bg-green-500 inline-block rounded" />EODs
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Blocker Breakdown Widget (managers) ───────────────────────────────────────

function BlockerBreakdownWidget({ tenantSlug, enabled = true }: { tenantSlug: string; enabled?: boolean }) {
  const { t } = useI18n();
  const { data: exec } = useExecSummary(enabled);

  if (!exec?.blockers || exec.blockers.open === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm h-full">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2">
          <ShieldAlert size={15} className="text-red-400" />
          <span className="text-sm font-semibold text-gray-900">{t('dashboard.blockerSeverity.title')}</span>
        </div>
        <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
          <CheckCircle2 size={28} className="text-green-300" />
          <p className="text-sm text-green-600 font-semibold">{t('dashboard.blockerSeverity.noBlockers')}</p>
          <p className="text-xs text-gray-300">{t('dashboard.blockerSeverity.teamClean')}</p>
          <Link to={`/${tenantSlug}/blockers`} className="mt-2 text-xs text-indigo-500 hover:underline">{t('dashboard.blockerSeverity.viewBoard')}</Link>
        </div>
      </div>
    );
  }

  const { critical, high, medium, low, open } = exec.blockers;

  const data = [
    { name: 'Critical', value: critical, color: '#ef4444' },
    { name: 'High',     value: high,     color: '#f97316' },
    { name: 'Medium',   value: medium,   color: '#f59e0b' },
    { name: 'Low',      value: low,      color: '#6b7280' },
  ].filter((d) => d.value > 0);

  const topBlockers = exec.topBlockers ?? [];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert size={15} className="text-red-500" />
          <span className="text-sm font-semibold text-gray-900">{t('dashboard.blockerSeverity.title')}</span>
          <span className="text-xs bg-red-50 text-red-700 px-1.5 py-0.5 rounded-full font-medium">{t('dashboard.blockerSeverity.open', { count: open })}</span>
        </div>
        <Link to={`/${tenantSlug}/blockers`} className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
          {t('dashboard.blockerSeverity.viewAll')} <ChevronRight size={11} />
        </Link>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-4 mb-4">
          {/* Donut */}
          <div className="w-24 h-24 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} cx="50%" cy="50%" innerRadius={28} outerRadius={42}
                  paddingAngle={3} dataKey="value" strokeWidth={0}>
                  {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v: number, name: string) => [v, name]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Severity breakdown bars */}
          <div className="flex-1 space-y-2">
            {data.map((entry) => (
              <div key={entry.name} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: entry.color }} />
                <span className="text-[11px] text-gray-600 w-14">{entry.name}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${(entry.value / open) * 100}%`, background: entry.color }} />
                </div>
                <span className="text-xs font-bold w-5 text-right" style={{ color: entry.color }}>{entry.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top blockers list */}
        {topBlockers.length > 0 && (
          <div className="space-y-1.5 border-t border-gray-50 pt-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">{t('dashboard.blockerSeverity.topBlockers')}</p>
            {topBlockers.slice(0, 3).map((b: any) => {
              const sev = b.severity;
              const sevColor = sev === 'CRITICAL' ? '#ef4444' : sev === 'HIGH' ? '#f97316' : sev === 'MEDIUM' ? '#f59e0b' : '#6b7280';
              return (
                <div key={b.id} className="flex items-center gap-2 py-1">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: sevColor }} />
                  <p className="text-xs text-gray-700 truncate flex-1">{b.title}</p>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: `${sevColor}18`, color: sevColor }}>
                    {sev?.charAt(0) + (sev ?? '').slice(1).toLowerCase()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Project Health Panel (PMO / delivery lead) ────────────────────────────────

function ProjectHealthPanel({ tenantSlug, enabled = true }: { tenantSlug: string; enabled?: boolean }) {
  const { t } = useI18n();
  const { data: exec } = useExecSummary(enabled);

  if (!exec?.projects?.length) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2">
          <Target size={15} className="text-purple-600" />
          <span className="text-sm font-semibold text-gray-900">{t('dashboard.projectHealth.title')}</span>
        </div>
        <div className="flex flex-col items-center justify-center py-14 text-center gap-2">
          <FolderKanban size={32} className="text-gray-200" />
          <p className="text-sm text-gray-400 font-medium">{t('dashboard.projectHealth.noProjects')}</p>
          <p className="text-xs text-gray-300">{t('dashboard.projectHealth.noProjectsDesc')}</p>
          <Link to={`/${tenantSlug}/projects`} className="mt-2 text-xs text-indigo-500 hover:underline">{t('dashboard.projectHealth.createProject')}</Link>
        </div>
      </div>
    );
  }

  const topProjects = [...exec.projects]
    .sort((a, b) => b.healthScore - a.healthScore)
    .slice(0, 6);

  const chartData = topProjects.map((p) => ({
    name: p.name.length > 18 ? p.name.slice(0, 16) + '…' : p.name,
    health: Math.round(p.healthScore),
    fill: p.healthScore >= 70 ? '#22c55e' : p.healthScore >= 40 ? '#f59e0b' : '#ef4444',
  }));

  const { active, completed, byRag } = exec.portfolio;
  const avgHealth = Math.round(exec.portfolio.healthScore);
  const milestones = exec.milestones;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target size={15} className="text-purple-600" />
          <span className="text-sm font-semibold text-gray-900">{t('dashboard.projectHealth.title')}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
            avgHealth >= 70 ? 'bg-green-50 text-green-700' : avgHealth >= 40 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
          }`}>
            {t('dashboard.projectHealth.portfolioAvg', { pct: avgHealth })}
          </span>
        </div>
        <Link to={`/${tenantSlug}/projects`} className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
          {t('dashboard.projectHealth.viewProjects')} <ChevronRight size={11} />
        </Link>
      </div>

      <div className="p-4">
        {/* Portfolio stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-blue-700">{active}</p>
            <p className="text-[10px] text-blue-500 font-medium">{t('dashboard.projectHealth.active')}</p>
          </div>
          <div className="bg-red-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{byRag.RED}</p>
            <p className="text-[10px] text-red-400 font-medium">{t('dashboard.projectHealth.atRisk')}</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{byRag.AMBER}</p>
            <p className="text-[10px] text-amber-500 font-medium">{t('dashboard.projectHealth.caution')}</p>
          </div>
          <div className="bg-green-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{byRag.GREEN}</p>
            <p className="text-[10px] text-green-500 font-medium">{t('dashboard.projectHealth.healthy')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Health bar chart */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">{t('dashboard.projectHealth.healthByProject')}</p>
            <ResponsiveContainer width="100%" height={Math.max(120, chartData.length * 32)}>
              <ReBarChart data={chartData} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: '#9ca3af' }}
                  axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#374151' }}
                  axisLine={false} tickLine={false} width={80} />
                <Tooltip formatter={(v: number) => [`${v}%`, 'Health']}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Bar dataKey="health" radius={[0, 4, 4, 0]} maxBarSize={14}>
                  {chartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </ReBarChart>
            </ResponsiveContainer>
          </div>

          {/* Milestones + actions stats */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500">{t('dashboard.projectHealth.deliveryHealth')}</p>
            {[
              { label: t('dashboard.projectHealth.milestonesCompleted'), value: milestones.completed, total: milestones.total, color: '#22c55e' },
              { label: t('dashboard.projectHealth.milestonesOverdue'),   value: milestones.overdue,   total: milestones.total, color: '#ef4444' },
              { label: t('dashboard.projectHealth.dueIn7Days'),          value: milestones.upcoming7days, total: milestones.total, color: '#6366f1' },
            ].map(({ label, value, total, color }) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-gray-500">{label}</span>
                  <span className="text-xs font-bold" style={{ color }}>{value}<span className="text-gray-400 font-normal"> / {total}</span></span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${total > 0 ? (value / total) * 100 : 0}%`, background: color }} />
                </div>
              </div>
            ))}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-gray-700">{exec.actions.completionRate.toFixed(0)}%</p>
                <p className="text-[10px] text-gray-400">{t('dashboard.projectHealth.actionCompletion')}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-gray-700">{completed}</p>
                <p className="text-[10px] text-gray-400">{t('dashboard.projectHealth.projectsDone')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Blockers & Actions Widgets ─────────────────────────────────────────────────

function BlockersActionsRow({
  summary,
  tenantSlug,
  showBlockers,
  showActions,
}: {
  summary: any;
  tenantSlug: string;
  showBlockers: boolean;
  showActions: boolean;
}) {
  const { t } = useI18n();
  if (!showBlockers && !showActions) return null;
  const bothCols = showBlockers && showActions;

  return (
    <div className={`grid grid-cols-1 ${bothCols ? 'lg:grid-cols-2' : ''} gap-5`}>
      {/* Overdue Actions */}
      {showActions && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <ClipboardList size={14} className="text-orange-500" /> {t('dashboard.overdueActions.title')}
              {summary?.overdueActions?.length > 0 && (
                <span className="text-xs bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded-full">{summary.overdueActions.length}</span>
              )}
            </h3>
            <Link to={`/${tenantSlug}/actions`} className="text-xs text-indigo-600 hover:underline">{t('dashboard.overdueActions.viewAll')}</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {(!summary?.overdueActions || summary.overdueActions.length === 0)
              ? <div className="py-6 text-center"><CheckCircle2 size={20} className="mx-auto text-green-300 mb-1" /><p className="text-xs text-gray-400">{t('dashboard.overdueActions.allClear')}</p></div>
              : summary.overdueActions.slice(0, 5).map((a: { id: string; title: string; dueDate: string; priority: string }) => (
                <div key={a.id} className="px-4 py-2.5 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 font-medium truncate">{a.title}</p>
                    <p className="text-xs text-red-500 mt-0.5">{t('dashboard.overdueActions.due', { date: a.dueDate })}</p>
                  </div>
                  <StatusBadge status={a.priority} />
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* Critical Blockers */}
      {showBlockers && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <ShieldAlert size={14} className="text-red-500" /> {t('dashboard.criticalBlockers.title')}
              {summary?.criticalBlockers?.length > 0 && (
                <span className="text-xs bg-red-50 text-red-700 px-1.5 py-0.5 rounded-full">{summary.criticalBlockers.length}</span>
              )}
            </h3>
            <Link to={`/${tenantSlug}/blockers`} className="text-xs text-indigo-600 hover:underline">{t('dashboard.criticalBlockers.viewAll')}</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {(!summary?.criticalBlockers || summary.criticalBlockers.length === 0)
              ? <div className="py-6 text-center"><CheckCircle2 size={20} className="mx-auto text-green-300 mb-1" /><p className="text-xs text-gray-400">{t('dashboard.criticalBlockers.noCritical')}</p></div>
              : summary.criticalBlockers.slice(0, 5).map((b: { id: string; title: string; severity: string; status: string }) => (
                <div key={b.id} className="px-4 py-2.5">
                  <p className="text-sm text-gray-800 font-medium truncate">{b.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge status={b.severity} />
                    <StatusBadge status={b.status} />
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ── Attention Required Strip ──────────────────────────────────────────────────

interface AttentionAlert {
  id: string;
  level: 'red' | 'amber' | 'blue';
  message: string;
  action: string;
  to: string;
}

function AttentionStrip({
  summary,
  tasks,
  userId,
  tenantSlug,
  pendingLeaves,
  attendanceToday,
}: {
  summary: any;
  tasks: any[];
  userId: string;
  tenantSlug: string;
  pendingLeaves: any[];
  attendanceToday: any;
}) {
  const { user } = useAuth();
  const { t } = useI18n();
  const hour = new Date().getHours();

  const alerts: AttentionAlert[] = useMemo(() => {
    const list: AttentionAlert[] = [];

    if (hasPermission(user, PERMISSIONS.TASK_READ)) {
      const myOverdue = tasks.filter((t) => {
        if (
          !(t.assigneeIds?.includes(String(userId)) ||
            String(t.assigneeId) === String(userId) ||
            String(t.createdBy) === String(userId))
        ) return false;
        if (!t.dueDate || t.status === 'DONE') return false;
        try { return isPast(parseISO(t.dueDate)); } catch { return false; }
      });
      if (myOverdue.length > 0) {
        const projects = Array.from(new Set(myOverdue.map((t) => t.projectId)));
        list.push({
          id: 'overdue-tasks',
          level: 'red',
          message: `${myOverdue.length} overdue task${myOverdue.length > 1 ? 's' : ''} across ${projects.length} project${projects.length > 1 ? 's' : ''}`,
          action: t('nav.myTasks'),
          to: `/${tenantSlug}/my-tasks`,
        });
      }
    }

    if (hasPermission(user, PERMISSIONS.BLOCKER_READ) && (summary?.criticalBlockers?.length ?? 0) > 0) {
      const count = summary.criticalBlockers.length;
      list.push({
        id: 'critical-blockers',
        level: 'red',
        message: `${count} critical blocker${count > 1 ? 's' : ''} need${count === 1 ? 's' : ''} immediate attention`,
        action: t('nav.blockers'),
        to: `/${tenantSlug}/blockers`,
      });
    }

    if (
      hasPermission(user, PERMISSIONS.ATTENDANCE_WRITE) &&
      hour >= 8 &&
      attendanceToday !== undefined &&
      !attendanceToday?.checkInTime
    ) {
      list.push({
        id: 'not-checked-in',
        level: 'amber',
        message: t('dashboard.alerts.notCheckedIn'),
        action: t('dashboard.attendance.checkInNow'),
        to: `/${tenantSlug}/attendance`,
      });
    }

    if (hasPermission(user, PERMISSIONS.LEAVE_APPROVE) && pendingLeaves.length > 0) {
      list.push({
        id: 'pending-leaves',
        level: 'amber',
        message: `${pendingLeaves.length} pending leave approval${pendingLeaves.length > 1 ? 's' : ''} awaiting review`,
        action: t('common.approve'),
        to: `/${tenantSlug}/leave`,
      });
    }

    if (
      hasPermission(user, PERMISSIONS.STANDUP_TEAM_VIEW) &&
      (summary?.stats?.missingStandupsCount ?? 0) > 0
    ) {
      const count = summary.stats.missingStandupsCount;
      list.push({
        id: 'missing-standups',
        level: 'blue',
        message: `${count} team member${count > 1 ? 's' : ''} yet to submit standup today`,
        action: t('common.view'),
        to: `/${tenantSlug}/standup`,
      });
    }

    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, userId, summary, pendingLeaves, attendanceToday, user, tenantSlug]);

  if (alerts.length === 0) return null;

  const cfg = {
    red:   { bar: 'border-l-red-400',    bg: 'bg-red-50',    text: 'text-red-800',    dot: 'bg-red-500',    btn: 'text-red-700 bg-red-100 hover:bg-red-200' },
    amber: { bar: 'border-l-amber-400',  bg: 'bg-amber-50',  text: 'text-amber-800',  dot: 'bg-amber-500',  btn: 'text-amber-700 bg-amber-100 hover:bg-amber-200' },
    blue:  { bar: 'border-l-blue-400',   bg: 'bg-blue-50',   text: 'text-blue-800',   dot: 'bg-blue-500',   btn: 'text-blue-700 bg-blue-100 hover:bg-blue-200' },
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
        <AlertCircle size={13} className="text-gray-500" />
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Needs Attention
        </span>
        <span className="ml-auto text-xs text-gray-400">
          {alerts.length} item{alerts.length > 1 ? 's' : ''}
        </span>
      </div>
      <div className="divide-y divide-gray-50">
        {alerts.map((alert) => {
          const c = cfg[alert.level];
          return (
            <div
              key={alert.id}
              className={`flex items-center gap-3 px-4 py-2.5 ${c.bg} border-l-4 ${c.bar}`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
              <p className={`flex-1 text-sm font-medium ${c.text}`}>{alert.message}</p>
              <Link
                to={alert.to}
                className={`text-xs font-semibold px-2.5 py-1 rounded-lg flex-shrink-0 transition-colors ${c.btn}`}
              >
                {alert.action} →
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Portfolio Snapshot Widget (PROJECT_READ — all users) ─────────────────────

function PortfolioSnapshotWidget({ summary, tenantSlug }: { summary: any; tenantSlug: string }) {
  const { t } = useI18n();
  const rag = summary?.ragSummary ?? { RED: 0, AMBER: 0, GREEN: 0 };
  const stats = summary?.stats ?? {};
  const projects: any[] = Array.isArray(summary?.projects) ? summary.projects : [];
  const total = (rag.RED + rag.AMBER + rag.GREEN) || 1;

  const pieData = [
    { name: 'At Risk',  value: rag.RED,   color: '#ef4444' },
    { name: 'Caution',  value: rag.AMBER, color: '#f59e0b' },
    { name: 'Healthy',  value: rag.GREEN, color: '#22c55e' },
  ].filter(d => d.value > 0);

  const healthPct  = total > 1 ? Math.round((rag.GREEN / (total)) * 100) : 0;
  const atRiskPct  = total > 1 ? Math.round((rag.RED   / (total)) * 100) : 0;

  const statusCounts: Record<string, number> = {};
  projects.forEach((p: any) => {
    const s = p.status ?? 'ACTIVE';
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderKanban size={15} className="text-indigo-600" />
          <span className="text-sm font-semibold text-gray-900">{t('nav.portfolio')}</span>
          <span className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium">
            {total - 1 > 0 ? total - 1 : stats.totalProjects ?? 0} projects
          </span>
        </div>
        <Link to={`/${tenantSlug}/projects`} className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
          {t('dashboard.projectHealth.viewProjects')} <ChevronRight size={11} />
        </Link>
      </div>

      {total <= 1 && projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
          <FolderKanban size={28} className="text-gray-200" />
          <p className="text-sm text-gray-400 font-medium">{t('dashboard.projectHealth.noProjects')}</p>
          <Link to={`/${tenantSlug}/projects`} className="mt-1 text-xs text-indigo-500 hover:underline">{t('dashboard.projectHealth.createProject')}</Link>
        </div>
      ) : (
        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* RAG donut */}
          <div className="flex items-center gap-4">
            <div className="w-32 h-32 flex-shrink-0 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData.length ? pieData : [{ name: 'No data', value: 1, color: '#e5e7eb' }]}
                    cx="50%" cy="50%" innerRadius={36} outerRadius={56}
                    paddingAngle={3} dataKey="value" strokeWidth={0}>
                    {(pieData.length ? pieData : [{ color: '#e5e7eb' }]).map((d: any, i: number) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number, n: string) => [v, n]}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className={`text-xl font-bold ${healthPct >= 60 ? 'text-green-600' : healthPct >= 30 ? 'text-amber-600' : 'text-red-600'}`}>
                  {healthPct}%
                </span>
                <span className="text-[10px] text-gray-400">{t('dashboard.projectHealth.healthy')}</span>
              </div>
            </div>
            <div className="space-y-2.5">
              {[
                { label: t('dashboard.projectHealth.healthy'),  count: rag.GREEN, pct: Math.round((rag.GREEN/total)*100), color: 'text-green-600',  dot: 'bg-green-500' },
                { label: t('dashboard.projectHealth.caution'),  count: rag.AMBER, pct: Math.round((rag.AMBER/total)*100), color: 'text-amber-600',  dot: 'bg-amber-500' },
                { label: t('dashboard.projectHealth.atRisk'),   count: rag.RED,   pct: atRiskPct,                          color: 'text-red-600',    dot: 'bg-red-500' },
              ].map(r => (
                <div key={r.label} className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${r.dot}`} />
                  <span className="text-[11px] text-gray-600 w-14">{r.label}</span>
                  <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: r.dot.replace('bg-', '#').replace('-500','') }} />
                  </div>
                  <span className={`text-xs font-bold w-4 ${r.color}`}>{r.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: t('dashboard.overdueActions.title'),    value: stats.overdueActionsCount ?? 0,  icon: <AlertCircle size={14} />, bg: 'bg-red-50',    text: 'text-red-600' },
              { label: t('dashboard.criticalBlockers.title'),  value: stats.criticalBlockersCount ?? 0, icon: <ShieldAlert size={14} />, bg: 'bg-orange-50', text: 'text-orange-600' },
              { label: t('nav.standup'),   value: stats.missingStandupsCount ?? 0,  icon: <Bell size={14} />,       bg: 'bg-amber-50',  text: 'text-amber-600' },
              { label: t('projects.title'),     value: stats.totalProjects ?? projects.length, icon: <Briefcase size={14} />, bg: 'bg-indigo-50', text: 'text-indigo-600' },
            ].map(card => (
              <div key={card.label} className={`${card.bg} rounded-xl p-3`}>
                <div className={`flex items-center gap-1.5 ${card.text} mb-1`}>
                  {card.icon}
                  <span className="text-[10px] font-medium opacity-70">{card.label}</span>
                </div>
                <p className={`text-2xl font-bold ${card.text}`}>{card.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Org Pulse Widget (managers only — risks, decisions, dependencies) ─────────

function OrgPulseWidget({ tenantSlug, enabled = true }: { tenantSlug: string; enabled?: boolean }) {
  const { t } = useI18n();
  const { data: exec } = useExecSummary(enabled);
  if (!exec) return null;

  const { risks, decisions, dependencies, teams, actions, milestones, portfolio } = exec;

  const metrics = [
    {
      label:   t('raid.types.risk'),
      value:   risks.open,
      sub:     `${risks.critical} ${t('common.critical').toLowerCase()} · ${risks.high} ${t('common.high').toLowerCase()}`,
      icon:    <Flame size={18} />,
      bg:      risks.critical > 0 ? 'bg-red-50 border-red-100' : 'bg-orange-50 border-orange-100',
      text:    risks.critical > 0 ? 'text-red-600' : 'text-orange-600',
      subText: risks.critical > 0 ? 'text-red-400' : 'text-orange-400',
    },
    {
      label:   t('nav.actions'),
      value:   actions.open,
      sub:     `${actions.overdue} ${t('tasks.overdue').toLowerCase()} · ${actions.completionRate.toFixed(0)}% done`,
      icon:    <ClipboardList size={18} />,
      bg:      actions.overdue > 0 ? 'bg-amber-50 border-amber-100' : 'bg-green-50 border-green-100',
      text:    actions.overdue > 0 ? 'text-amber-700' : 'text-green-600',
      subText: actions.overdue > 0 ? 'text-amber-400' : 'text-green-400',
    },
    {
      label:   t('nav.decisions'),
      value:   decisions.total,
      sub:     `${decisions.thisMonth} ${t('common.thisMonth').toLowerCase()}`,
      icon:    <CheckCheck size={18} />,
      bg:      'bg-blue-50 border-blue-100',
      text:    'text-blue-600',
      subText: 'text-blue-400',
    },
    {
      label:   t('raid.types.dependency'),
      value:   dependencies.open,
      sub:     'blocked by external',
      icon:    <Activity size={18} />,
      bg:      dependencies.open > 0 ? 'bg-purple-50 border-purple-100' : 'bg-gray-50 border-gray-100',
      text:    dependencies.open > 0 ? 'text-purple-700' : 'text-gray-500',
      subText: 'text-gray-400',
    },
    {
      label:   t('nav.teams'),
      value:   teams.total,
      sub:     `${teams.memberCount} ${t('teams.membersLabel').toLowerCase()}`,
      icon:    <Users size={18} />,
      bg:      'bg-teal-50 border-teal-100',
      text:    'text-teal-600',
      subText: 'text-teal-400',
    },
    {
      label:   t('nav.portfolio'),
      value:   `${portfolio.healthScore.toFixed(0)}%`,
      sub:     `${portfolio.active} ${t('common.active').toLowerCase()} · ${portfolio.completed} ${t('statuses.done').toLowerCase()}`,
      icon:    <TrendingUp size={18} />,
      bg:      portfolio.healthScore >= 70 ? 'bg-green-50 border-green-100' : portfolio.healthScore >= 40 ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100',
      text:    portfolio.healthScore >= 70 ? 'text-green-600' : portfolio.healthScore >= 40 ? 'text-amber-600' : 'text-red-600',
      subText: portfolio.healthScore >= 70 ? 'text-green-400' : 'text-amber-400',
    },
  ];

  // Milestone progress bar data
  const milestoneData = [
    { name: 'Completed', value: milestones.completed, fill: '#22c55e' },
    { name: 'Overdue',   value: milestones.overdue,   fill: '#ef4444' },
    { name: 'Upcoming',  value: milestones.upcoming7days, fill: '#6366f1' },
  ].filter(d => d.value > 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target size={15} className="text-purple-600" />
          <span className="text-sm font-semibold text-gray-900">Org Pulse</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
            portfolio.healthScore >= 70 ? 'bg-green-50 text-green-700' :
            portfolio.healthScore >= 40 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
          }`}>
            {portfolio.healthScore.toFixed(0)}% {t('dashboard.projectHealth.healthy').toLowerCase()}
          </span>
        </div>
        <Link to={`/${tenantSlug}/projects`} className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
          {t('nav.portfolio')} <ChevronRight size={11} />
        </Link>
      </div>

      <div className="p-4">
        {/* Metrics grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
          {metrics.map(m => (
            <div key={m.label} className={`rounded-xl border p-3 ${m.bg}`}>
              <div className={`flex items-center gap-1.5 mb-1 ${m.text}`}>
                {m.icon}
                <span className="text-[10px] font-medium opacity-70">{m.label}</span>
              </div>
              <p className={`text-2xl font-bold leading-none ${m.text}`}>{m.value}</p>
              <p className={`text-[10px] mt-1 ${m.subText}`}>{m.sub}</p>
            </div>
          ))}
        </div>

        {/* Milestone progress */}
        {milestones.total > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500">{t('sprints.progress')} ({t('milestones.title')})</span>
              <span className="text-xs text-gray-400">
                {milestones.completed}/{milestones.total} · {milestones.completionRate.toFixed(0)}% {t('statuses.completed').toLowerCase()}
              </span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
              {milestoneData.map((d) => (
                <div
                  key={d.name}
                  className="h-full transition-all first:rounded-l-full last:rounded-r-full"
                  style={{ width: `${(d.value / milestones.total) * 100}%`, background: d.fill }}
                  title={`${d.name}: ${d.value}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-4 mt-1.5">
              {milestoneData.map(d => (
                <span key={d.name} className="flex items-center gap-1 text-[10px] text-gray-500">
                  <span className="w-2 h-2 rounded-sm inline-block" style={{ background: d.fill }} />
                  {d.name}: {d.value}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── My Upcoming Leaves Widget ────────────────────────────────────────────────

function MyUpcomingLeavesWidget({ tenantSlug }: { tenantSlug: string }) {
  const { t } = useI18n();
  const { data: raw } = useLeaveRequests({ mine: 'true', status: 'APPROVED' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: any[] = Array.isArray(raw) ? raw : [];
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const upcoming = all
    .filter((r: any) => (r.startDate ?? r.start_date ?? '') >= todayStr)
    .sort((a: any, b: any) => (a.startDate ?? a.start_date ?? '').localeCompare(b.startDate ?? b.start_date ?? ''))
    .slice(0, 5);

  const past = all
    .filter((r: any) => (r.startDate ?? r.start_date ?? '') < todayStr)
    .length;

  const LEAVE_COLORS = [
    'bg-blue-50 border-blue-200 text-blue-700',
    'bg-purple-50 border-purple-200 text-purple-700',
    'bg-teal-50 border-teal-200 text-teal-700',
    'bg-green-50 border-green-200 text-green-700',
    'bg-amber-50 border-amber-200 text-amber-700',
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm h-full">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar size={15} className="text-teal-600" />
          <span className="text-sm font-semibold text-gray-900">{t('leave.title')}</span>
          {upcoming.length > 0 && (
            <span className="text-xs bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded-full font-medium">
              {upcoming.length}
            </span>
          )}
        </div>
        <Link to={`/${tenantSlug}/leave`} className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
          {t('common.viewAll')} <ChevronRight size={11} />
        </Link>
      </div>

      {upcoming.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
          <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center mb-2">
            <CheckCircle2 size={20} className="text-green-500" />
          </div>
          <p className="text-sm font-medium text-gray-600">{t('leave.noLeave')}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {past > 0 ? `${past} leave${past > 1 ? 's' : ''} taken this year` : t('leave.apply')}
          </p>
          <Link to={`/${tenantSlug}/leave`}
            className="mt-3 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
            {t('leave.apply')} →
          </Link>
        </div>
      ) : (
        <div className="p-4 space-y-2.5">
          {upcoming.map((r: any, idx: number) => {
            const startDate = r.startDate ?? r.start_date ?? '';
            const endDate   = r.endDate   ?? r.end_date   ?? '';
            const days      = Number(r.days ?? r.totalDays ?? 1);
            const typeName  = r.leaveTypeName ?? r.leaveType ?? r.leave_type_name ?? 'Leave';
            const colorCls  = LEAVE_COLORS[idx % LEAVE_COLORS.length];

            let daysUntil = '';
            try {
              const diff = differenceInDays(parseISO(startDate), new Date());
              daysUntil = diff === 0 ? t('common.today') : diff === 1 ? 'Tomorrow' : `In ${diff} days`;
            } catch { /* empty */ }

            return (
              <div key={r.id ?? r.ROWID} className={`flex items-center gap-3 p-3 rounded-xl border ${colorCls.split(' ').slice(0, 2).join(' ')} bg-opacity-40`}>
                <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0 border ${colorCls}`}>
                  <span className="text-xs font-bold leading-none">
                    {startDate ? format(parseISO(startDate), 'd') : '—'}
                  </span>
                  <span className="text-[9px] font-medium leading-none mt-0.5">
                    {startDate ? format(parseISO(startDate), 'MMM') : ''}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{typeName}</p>
                  <p className="text-[11px] text-gray-500">
                    {startDate !== endDate
                      ? `${format(parseISO(startDate), 'MMM d')} – ${format(parseISO(endDate), 'MMM d')}`
                      : format(parseISO(startDate), 'MMM d, yyyy')}
                    {' · '}{days} day{days > 1 ? 's' : ''}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${colorCls}`}>
                    {daysUntil}
                  </span>
                </div>
              </div>
            );
          })}
          {past > 0 && (
            <p className="text-[10px] text-gray-400 text-center pt-1">
              {past} leave{past > 1 ? 's' : ''} already taken this year
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Time Histogram Widget (team view OR personal project breakdown) ────────────

function TimeHistogramWidget({ showTeamView, tenantSlug }: { showTeamView: boolean; tenantSlug: string }) {
  const { t } = useI18n();
  const { data: teamData } = useTeamAnalytics({ period: 'month' }, showTeamView);
  const { data: myWeek }   = useMyWeek();

  if (showTeamView) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const members: any[] = (teamData as any)?.members ?? [];
    if (members.length === 0) {
      return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-4 border-b border-gray-100 flex items-center gap-2">
            <Users size={15} className="text-indigo-600" />
            <span className="text-sm font-semibold text-gray-900">{t('timeTracking.thisMonth')}</span>
          </div>
          <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
            <Timer size={28} className="text-gray-200" />
            <p className="text-sm text-gray-400 font-medium">{t('timeTracking.noLogs')}</p>
            <p className="text-xs text-gray-300">Team members' hours will appear here once time is logged</p>
          </div>
        </div>
      );
    }

    const top = members.slice(0, 10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const summary: any = (teamData as any)?.summary ?? {};
    const period: any  = (teamData as any)?.period  ?? {};

    const chartData = top.map((m: any) => ({
      name:      (m.user_name ?? 'Unknown').split(' ')[0],
      fullName:  m.user_name ?? 'Unknown',
      Total:     Math.round(m.total_hours * 10) / 10,
      Billable:  Math.round(m.billable_hours * 10) / 10,
      NonBill:   Math.round(m.non_billable_hours * 10) / 10,
    }));

    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={15} className="text-indigo-600" />
            <span className="text-sm font-semibold text-gray-900">{t('timeTracking.thisMonth')}</span>
            {period.from && (
              <span className="text-xs text-gray-400">
                {format(parseISO(period.from), 'MMM d')} – {format(parseISO(period.to), 'MMM d')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              {t('common.total')}: <span className="font-semibold text-indigo-700">{summary.total_hours?.toFixed(1) ?? 0}h</span>
              <span className="text-gray-400"> · {t('timeTracking.billable')}: </span>
              <span className="font-semibold text-green-600">{summary.billable_hours?.toFixed(1) ?? 0}h</span>
            </span>
            <Link to={`/${tenantSlug}/time-tracking`} className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
              {t('nav.timeTracking')} <ChevronRight size={11} />
            </Link>
          </div>
        </div>

        <div className="p-4">
          {/* Summary chips */}
          <div className="flex flex-wrap gap-3 mb-4">
            {[
              { label: t('nav.teams'), value: members.length,                       color: 'bg-indigo-50 text-indigo-700' },
              { label: t('timeTracking.totalHours'),  value: `${summary.total_hours?.toFixed(1)}h`, color: 'bg-blue-50 text-blue-700' },
              { label: t('timeTracking.billable'),     value: `${summary.billable_hours?.toFixed(1)}h (${summary.billable_pct?.toFixed(0)}%)`, color: 'bg-green-50 text-green-700' },
              { label: t('timeTracking.nonBillable'), value: `${summary.non_billable_hours?.toFixed(1)}h`, color: 'bg-gray-50 text-gray-600' },
            ].map(chip => (
              <div key={chip.label} className={`px-3 py-1.5 rounded-xl text-xs font-medium ${chip.color}`}>
                <span className="text-gray-400 font-normal">{chip.label}: </span>{chip.value}
              </div>
            ))}
          </div>

          <ResponsiveContainer width="100%" height={Math.max(180, top.length * 34)}>
            <ReBarChart data={chartData} layout="vertical" margin={{ top: 0, right: 60, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                axisLine={false} tickLine={false}
                tickFormatter={(v) => `${v}h`}
              />
              <YAxis
                type="category" dataKey="name"
                tick={{ fontSize: 11, fill: '#374151' }}
                axisLine={false} tickLine={false}
                width={60}
              />
              <Tooltip
                formatter={(v: number, name: string) => [`${v}h`, name === 'NonBill' ? 'Non-Billable' : name]}
                labelFormatter={(label: string, payload: any[]) => payload?.[0]?.payload?.fullName ?? label}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
              />
              <Bar dataKey="Billable"  stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} maxBarSize={18} />
              <Bar dataKey="NonBill"   stackId="a" fill="#c7d2fe" radius={[0, 4, 4, 0]} maxBarSize={18} />
            </ReBarChart>
          </ResponsiveContainer>

          <div className="flex items-center gap-5 mt-2 justify-end">
            <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <span className="w-3 h-2.5 rounded-sm bg-green-500 inline-block" />{t('timeTracking.billable')}
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <span className="w-3 h-2.5 rounded-sm bg-indigo-200 inline-block" />{t('timeTracking.nonBillable')}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ── Personal project breakdown (personal TIME_WRITE view) ──────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const days: any[] = (myWeek as any)?.days ?? [];
  const projectMap: Record<string, { total: number; billable: number }> = {};
  days.forEach((d: any) => {
    (d.entries ?? []).forEach((e: any) => {
      const name = e.projectName || 'No Project';
      if (!projectMap[name]) projectMap[name] = { total: 0, billable: 0 };
      projectMap[name].total += e.hours ?? 0;
    });
  });
  const projectEntries = Object.entries(projectMap)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 8);

  if (projectEntries.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2">
          <BarChart size={15} className="text-indigo-600" />
          <span className="text-sm font-semibold text-gray-900">{t('timeTracking.thisWeek')}</span>
        </div>
        <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
          <Timer size={28} className="text-gray-200" />
          <p className="text-sm text-gray-400 font-medium">{t('timeTracking.noLogs')}</p>
          <Link to={`/${tenantSlug}/time-tracking`} className="mt-1 text-xs text-indigo-500 hover:underline">{t('timeTracking.logTime')} →</Link>
        </div>
      </div>
    );
  }

  const projChartData = projectEntries.map(([name, v]) => ({
    name: name.length > 18 ? name.slice(0, 16) + '…' : name,
    Hours: Math.round(v.total * 10) / 10,
    fill: '#6366f1',
  }));
  const weekTotal = (myWeek as any)?.totalHours ?? 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart size={15} className="text-indigo-600" />
          <span className="text-sm font-semibold text-gray-900">{t('timeTracking.thisWeek')}</span>
          <span className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium">
            {weekTotal.toFixed(1)}h {t('common.total').toLowerCase()}
          </span>
        </div>
        <Link to={`/${tenantSlug}/time-tracking`} className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
          {t('timeTracking.logTime')} <ChevronRight size={11} />
        </Link>
      </div>
      <div className="p-4">
        <ResponsiveContainer width="100%" height={Math.max(150, projectEntries.length * 32)}>
          <ReBarChart data={projChartData} layout="vertical" margin={{ top: 0, right: 50, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}h`} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} width={90} />
            <Tooltip formatter={(v: number) => [`${v}h`, 'Hours']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
            <Bar dataKey="Hours" radius={[0, 4, 4, 0]} maxBarSize={16} fill="#6366f1">
              {projChartData.map((_: any, i: number) => (
                <Cell key={i} fill={i === 0 ? '#6366f1' : i === 1 ? '#8b5cf6' : i === 2 ? '#a78bfa' : '#c4b5fd'} />
              ))}
            </Bar>
          </ReBarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Personal Insights Widget (task status donut + priority breakdown) ─────────

function PersonalInsightsWidget({ tasks, tenantSlug, userId }: { tasks: any[]; tenantSlug: string; userId: string }) {
  const { t } = useI18n();
  // Match: assigned (multi-assignee array), assigned (legacy single field), or owner/creator
  const myTasks = tasks.filter((t: any) =>
    t.assigneeIds?.includes(String(userId)) ||
    String(t.assigneeId ?? '') === String(userId) ||
    String(t.createdBy  ?? '') === String(userId)
  );

  const statusGroups: Record<string, number> = {};
  const priorityGroups: Record<string, number> = {};
  myTasks.forEach((t: any) => {
    const s = t.status ?? 'TODO';
    const p = t.priority ?? 'MEDIUM';
    statusGroups[s]   = (statusGroups[s]   ?? 0) + 1;
    priorityGroups[p] = (priorityGroups[p] ?? 0) + 1;
  });

  const STATUS_COLORS: Record<string, string> = {
    DONE: '#22c55e', IN_PROGRESS: '#6366f1', TODO: '#94a3b8',
    BLOCKED: '#ef4444', REVIEW: '#f59e0b', CANCELLED: '#d1d5db',
  };
  const PRIORITY_COLORS: Record<string, string> = {
    CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#94a3b8',
  };

  const pieData = Object.entries(statusGroups)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value, color: STATUS_COLORS[name] ?? '#e2e8f0' }));

  const barData = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
    .filter((p) => (priorityGroups[p] ?? 0) > 0)
    .map((p) => ({ name: p.charAt(0) + p.slice(1).toLowerCase(), value: priorityGroups[p] ?? 0, fill: PRIORITY_COLORS[p] }));

  const done       = statusGroups['DONE']        ?? 0;
  const inProgress = statusGroups['IN_PROGRESS'] ?? 0;
  const blocked    = statusGroups['BLOCKED']     ?? 0;
  const total      = myTasks.length;

  if (total === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2">
          <Layers size={15} className="text-indigo-600" />
          <span className="text-sm font-semibold text-gray-900">{t('tasks.myTasks')}</span>
        </div>
        <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
          <CheckCheck size={28} className="text-gray-200" />
          <p className="text-sm text-gray-400 font-medium">{t('tasks.noTasks')}</p>
          <Link to={`/${tenantSlug}/my-tasks`} className="mt-1 text-xs text-indigo-500 hover:underline">{t('dashboard.myTasks.viewAll')} →</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers size={15} className="text-indigo-600" />
          <span className="text-sm font-semibold text-gray-900">{t('tasks.myTasks')}</span>
          <span className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium">{t('dashboard.myTasks.active', { count: total })}</span>
        </div>
        <Link to={`/${tenantSlug}/my-tasks`} className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
          {t('dashboard.myTasks.viewAll')} <ChevronRight size={11} />
        </Link>
      </div>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Donut: task status */}
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">{t('common.status')}</p>
          <div className="flex items-center gap-4">
            <div className="w-28 h-28 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={30} outerRadius={50}
                    paddingAngle={2} dataKey="value" strokeWidth={0}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, name: string) => [v, name.replace('_', ' ')]}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-2">
              {pieData.map((d) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                  <span className="text-[11px] text-gray-600 flex-1">{d.name.replace('_', ' ')}</span>
                  <span className="text-xs font-bold" style={{ color: d.color }}>{d.value}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Completion summary */}
          <div className="flex gap-3 mt-3 flex-wrap">
            <span className={`text-xs px-2 py-1 rounded-lg font-semibold ${done > 0 ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400'}`}>
              ✓ {done} {t('statuses.done').toLowerCase()}
            </span>
            <span className={`text-xs px-2 py-1 rounded-lg font-semibold ${inProgress > 0 ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-50 text-gray-400'}`}>
              ↻ {inProgress} {t('statuses.inProgress').toLowerCase()}
            </span>
            {blocked > 0 && (
              <span className="text-xs px-2 py-1 rounded-lg font-semibold bg-red-50 text-red-700">⚠ {blocked} blocked</span>
            )}
          </div>
        </div>

        {/* Bar: priority breakdown */}
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">{t('common.priority')}</p>
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={110}>
              <ReBarChart data={barData} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} width={55} />
                <Tooltip formatter={(v: number) => [v, 'Tasks']} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={16}>
                  {barData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </ReBarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-gray-400 pt-6 text-center">{t('common.noData')}</p>
          )}
          <div className="mt-2 text-center">
            <span className="text-xs text-gray-400">
              {total > 0 ? `${Math.round((done / total) * 100)}% ${t('statuses.completed').toLowerCase()}` : ''}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── My Monthly Stats Widget ───────────────────────────────────────────────────

function MyMonthlyStatsWidget({ userId, tenantSlug }: { userId: string; tenantSlug: string }) {
  const { t } = useI18n();
  const now = new Date();
  const { data: rawAttend } = useAttendanceSummary({
    year:  String(now.getFullYear()),
    month: String(now.getMonth() + 1),
  });
  const { data: rawTime } = useTimeSummary({
    date_from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
    date_to:   format(now, 'yyyy-MM-dd'),
  });
  const { data: rawLeave } = useLeaveBalance();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const atSummary = (rawAttend as any)?.summary ?? rawAttend as any;
  const presentDays = Number(atSummary?.present ?? 0);
  const totalHoursAttend = Number(atSummary?.total_hours ?? 0);

  // Find current user's hours from time summary
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const timeUsers: any[] = (rawTime as any)?.by_user ?? [];
  const myTime = timeUsers.find((u) => String(u.user_id) === String(userId));
  const hoursLogged = myTime ? Number(myTime.total).toFixed(1) : null;
  const billableHours = myTime ? Number(myTime.billable).toFixed(1) : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const balances: any[] = Array.isArray(rawLeave) ? rawLeave : [];
  const totalLeaveLeft = balances.reduce((s: number, b: any) => s + (Number(b.remaining) || 0), 0);
  const totalLeaveAlloc = balances.reduce((s: number, b: any) => s + (Number(b.allocated) || 0), 0);
  const leaveUsed = balances.reduce((s: number, b: any) => s + (Number(b.used) || 0), 0);

  const monthName = format(now, 'MMMM');
  const workingDaysSoFar = (() => {
    const d = now.getDate();
    let count = 0;
    for (let i = 1; i <= d; i++) {
      const day = new Date(now.getFullYear(), now.getMonth(), i).getDay();
      if (day !== 0 && day !== 6) count++;
    }
    return count;
  })();
  const attendancePct = workingDaysSoFar > 0 ? Math.round((presentDays / workingDaysSoFar) * 100) : 0;

  const stats = [
    {
      label: t('attendance.summary.present'),
      value: presentDays,
      sub: `of ${workingDaysSoFar} working days`,
      pct: attendancePct,
      barColor: attendancePct >= 80 ? '#22c55e' : attendancePct >= 60 ? '#f59e0b' : '#ef4444',
      icon: <CheckCircle2 size={16} className={attendancePct >= 80 ? 'text-green-500' : 'text-amber-500'} />,
    },
    {
      label: t('attendance.summary.totalHours'),
      value: hoursLogged !== null ? `${hoursLogged}h` : `${totalHoursAttend.toFixed(0)}h`,
      sub: billableHours !== null ? `${billableHours}h ${t('timeTracking.billable').toLowerCase()}` : `${monthName} ${t('common.total').toLowerCase()}`,
      pct: null,
      barColor: '#6366f1',
      icon: <Timer size={16} className="text-indigo-500" />,
    },
    {
      label: t('leave.balance.remaining'),
      value: totalLeaveLeft,
      sub: `of ${totalLeaveAlloc} ${t('common.days').toLowerCase()} ${t('common.total').toLowerCase()}`,
      pct: totalLeaveAlloc > 0 ? Math.round((totalLeaveLeft / totalLeaveAlloc) * 100) : 0,
      barColor: '#f59e0b',
      icon: <Calendar size={16} className="text-amber-500" />,
    },
    {
      label: t('leave.balance.used'),
      value: leaveUsed,
      sub: `${totalLeaveAlloc - totalLeaveLeft - leaveUsed > 0 ? `${totalLeaveAlloc - totalLeaveLeft - leaveUsed}d ${t('statuses.pending').toLowerCase()}` : t('common.none').toLowerCase() + ' pending'}`,
      pct: totalLeaveAlloc > 0 ? Math.round((leaveUsed / totalLeaveAlloc) * 100) : 0,
      barColor: '#8b5cf6',
      icon: <ClipboardList size={16} className="text-purple-500" />,
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={14} className="text-indigo-500" />
          <span className="text-sm font-semibold text-gray-900">{monthName}</span>
        </div>
        <Link to={`/${tenantSlug}/attendance`} className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
          {t('common.view')} <ChevronRight size={11} />
        </Link>
      </div>
      <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map(({ label, value, sub, pct, barColor, icon }) => (
          <div key={label} className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              {icon}
              <span className="text-[11px] text-gray-500 font-medium">{label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-800 leading-none">{value}</p>
            <p className="text-[10px] text-gray-400">{sub}</p>
            {pct !== null && (
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Upcoming Milestones Widget (managers / PMO) ────────────────────────────────

function UpcomingMilestonesWidget({ tenantSlug, enabled = true }: { tenantSlug: string; enabled?: boolean }) {
  const { t } = useI18n();
  const { data: exec } = useExecSummary(enabled);
  const upcoming  = exec?.upcomingMilestones  ?? [];
  const overdue   = exec?.overdueMilestones   ?? [];

  if (upcoming.length === 0 && overdue.length === 0) return null;

  const combined = [
    ...overdue.slice(0, 3).map((m: any) => ({ ...m, isOverdue: true })),
    ...upcoming.slice(0, 5).map((m: any) => ({ ...m, isOverdue: false })),
  ].slice(0, 6);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projectNames = exec?.projects?.reduce((acc: Record<string, string>, p: any) => {
    acc[p.id] = p.name;
    return acc;
  }, {} as Record<string, string>) ?? {};

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar size={15} className="text-indigo-500" />
          <span className="text-sm font-semibold text-gray-900">{t('milestones.title')}</span>
          {overdue.length > 0 && (
            <span className="text-xs bg-red-50 text-red-700 px-1.5 py-0.5 rounded-full font-medium">
              {overdue.length} {t('tasks.overdue').toLowerCase()}
            </span>
          )}
          {upcoming.length > 0 && (
            <span className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium">
              {exec?.milestones?.upcoming7days ?? 0} {t('dashboard.projectHealth.dueIn7Days').toLowerCase()}
            </span>
          )}
        </div>
        <Link to={`/${tenantSlug}/projects`} className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
          {t('nav.projects')} <ChevronRight size={11} />
        </Link>
      </div>
      <div className="divide-y divide-gray-50">
        {combined.map((m: any) => {
          const dueDate = m.dueDate;
          let relLabel = '';
          try {
            const d = parseISO(dueDate);
            const diff = differenceInDays(d, new Date());
            if (m.isOverdue) relLabel = `${Math.abs(diff)}d overdue`;
            else if (diff === 0) relLabel = t('common.today');
            else relLabel = `in ${diff}d`;
          } catch { /* empty */ }

          return (
            <div key={m.id} className={`flex items-center gap-3 px-4 py-2.5 ${m.isOverdue ? 'bg-red-50/40' : ''}`}>
              <div className={`w-1.5 h-8 rounded-full flex-shrink-0 ${m.isOverdue ? 'bg-red-400' : 'bg-indigo-400'}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${m.isOverdue ? 'text-red-800' : 'text-gray-800'}`}>{m.title}</p>
                <p className="text-[10px] text-gray-400 truncate">{projectNames[m.projectId] ?? ''}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`text-xs font-semibold ${m.isOverdue ? 'text-red-600' : 'text-indigo-600'}`}>{relLabel}</p>
                <p className="text-[10px] text-gray-400">{dueDate ? format(parseISO(dueDate), 'MMM d') : ''}</p>
              </div>
            </div>
          );
        })}
      </div>
      {(upcoming.length + overdue.length) > 6 && (
        <div className="px-4 py-2 border-t border-gray-50">
          <Link to={`/${tenantSlug}/projects`} className="text-xs text-indigo-600 hover:underline">
            +{(upcoming.length + overdue.length) - 6} {t('milestones.title').toLowerCase()} →
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Time This Week Widget ─────────────────────────────────────────────────────

function TimeThisWeekWidget({ tenantSlug }: { tenantSlug: string }) {
  const { t } = useI18n();
  const { data: week } = useMyWeek();

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const days = (week as any)?.days ?? [];

  if (!week || days.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2">
          <Timer size={15} className="text-indigo-600" />
          <span className="text-sm font-semibold text-gray-900">{t('timeTracking.thisWeek')}</span>
        </div>
        <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
          <Timer size={28} className="text-gray-200" />
          <p className="text-sm text-gray-400 font-medium">{t('timeTracking.noLogs')}</p>
          <Link to={`/${tenantSlug}/time-tracking`} className="mt-1 text-xs text-indigo-500 hover:underline">{t('timeTracking.logTime')} →</Link>
        </div>
      </div>
    );
  }

  const chartData = days.map((d: any) => {
    const label = d.date ? format(parseISO(d.date), 'EEE') : '';
    const isToday = d.date === todayStr;
    return {
      day:     label,
      Hours:   d.hours,
      isToday,
      fill:    isToday ? '#6366f1' : '#c7d2fe',
    };
  });

  const maxHours = Math.max(...days.map((d: any) => d.hours), 0);
  const todayDay = days.find((d: any) => d.date === todayStr);
  const todayHours  = todayDay?.hours ?? 0;
  const totalHours  = week.totalHours ?? 0;
  const billable    = week.billableHours ?? 0;
  const nonBillable = week.nonBillableHours ?? (totalHours - billable);
  const billablePct = totalHours > 0 ? Math.round((billable / totalHours) * 100) : 0;
  const avgPerDay   = week.daysLogged > 0 ? (totalHours / week.daysLogged).toFixed(1) : '0';

  // Top projects from today's entries
  const todayEntries: any[] = todayDay?.entries ?? [];
  const projectMap: Record<string, number> = {};
  todayEntries.forEach((e: any) => {
    const name = e.projectName || 'Other';
    projectMap[name] = (projectMap[name] ?? 0) + (e.hours ?? 0);
  });
  const topProjects = Object.entries(projectMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Timer size={15} className="text-purple-600" />
          <span className="text-sm font-semibold text-gray-900">{t('timeTracking.thisWeek')}</span>
          <span className="text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">
            {totalHours.toFixed(1)}h {t('common.total').toLowerCase()}
          </span>
        </div>
        <Link to={`/${tenantSlug}/time-tracking`} className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
          {t('timeTracking.logTime')} <ChevronRight size={11} />
        </Link>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Bar chart */}
          <div className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={160}>
              <ReBarChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis
                  domain={[0, Math.max(maxHours + 1, 8)]}
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  axisLine={false} tickLine={false}
                  tickFormatter={(v) => `${v}h`}
                />
                <Tooltip
                  formatter={(v: number) => [`${v}h`, 'Hours']}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                  cursor={{ fill: '#f9fafb' }}
                />
                <Bar dataKey="Hours" radius={[4, 4, 0, 0]} maxBarSize={36}>
                  {chartData.map((entry: any, i: number) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </ReBarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-1">
              <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <span className="w-3 h-3 rounded-sm bg-indigo-500 inline-block" /> {t('common.today')}
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
                <span className="w-3 h-3 rounded-sm bg-indigo-200 inline-block" /> Other days
              </span>
            </div>
          </div>

          {/* Stats panel */}
          <div className="flex flex-col gap-3">
            {/* Today's hours prominent */}
            <div className={`rounded-xl p-3 text-center ${todayHours > 0 ? 'bg-indigo-50 border border-indigo-100' : 'bg-gray-50 border border-gray-100'}`}>
              <p className={`text-3xl font-bold leading-none ${todayHours > 0 ? 'text-indigo-700' : 'text-gray-300'}`}>
                {todayHours.toFixed(1)}h
              </p>
              <p className={`text-[11px] mt-1 font-medium ${todayHours > 0 ? 'text-indigo-400' : 'text-gray-400'}`}>
                {todayHours > 0 ? `${t('timeTracking.logTime')} ${t('common.today').toLowerCase()}` : t('timeTracking.noLogs')}
              </p>
            </div>

            {/* Billable breakdown */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-gray-500">{t('timeTracking.billable')}</span>
                <span className="font-semibold text-green-600">{billable.toFixed(1)}h <span className="text-gray-400 font-normal">({billablePct}%)</span></span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${billablePct}%` }} />
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-gray-500">{t('timeTracking.nonBillable')}</span>
                <span className="font-semibold text-gray-600">{nonBillable.toFixed(1)}h</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-gray-500">Avg / day logged</span>
                <span className="font-semibold text-gray-700">{avgPerDay}h</span>
              </div>
            </div>

            {/* Top projects today */}
            {topProjects.length > 0 && (
              <div className="border-t border-gray-50 pt-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('common.today')}'s {t('nav.timeTracking').toLowerCase()}</p>
                {topProjects.map(([name, hrs]) => (
                  <div key={name} className="flex items-center gap-2 mb-1">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-gray-600 truncate">{name}</p>
                    </div>
                    <span className="text-[11px] font-semibold text-indigo-600 shrink-0">{hrs.toFixed(1)}h</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Dynamic permission-driven KPI strip ────────────────────────────────────────
// Each card only renders when the user has the relevant permission.
// No role checks — purely permission-based.

function DynamicKpiStrip({ summary, tenantSlug, tasks, todayHours, weekHours }: {
  summary: any; tenantSlug: string; tasks: any[]; todayHours?: number; weekHours?: number;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const p = (perm: Permission) => hasPermission(user, perm);

  const canSeeProjects   = p(PERMISSIONS.PROJECT_READ);
  const canSeeTasks      = p(PERMISSIONS.TASK_READ);
  const canSeeTeamAttend = p(PERMISSIONS.ATTENDANCE_TEAM_VIEW);
  const canSeeBlockers   = p(PERMISSIONS.BLOCKER_READ);
  const canApproveLeave  = p(PERMISSIONS.LEAVE_APPROVE);
  const canReadLeave     = p(PERMISSIONS.LEAVE_READ);
  const canSubmitStandup = p(PERMISSIONS.STANDUP_SUBMIT);
  const showTime         = todayHours !== undefined; // gated by TIME_WRITE in parent

  // Fetch only what the user can see
  const { data: liveData }         = useAttendanceLive(canSeeTeamAttend);
  const { data: notCheckedInData } = useAttendanceNotCheckedIn(canSeeTeamAttend);
  const { data: rawPendingLeaves } = useLeaveRequests({ status: 'PENDING' });
  const { data: rawBalances }      = useLeaveBalance();

  // Attendance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const liveCount  = canSeeTeamAttend && Array.isArray(liveData)         ? (liveData as any[]).length : 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notInCount = canSeeTeamAttend && Array.isArray(notCheckedInData) ? (notCheckedInData as any[]).length : 0;
  const attendTotal    = (liveCount + notInCount) || 1;
  const attendanceRate = Math.round((liveCount / attendTotal) * 100);

  // Leave
  const pendingLeaveCount = canApproveLeave && Array.isArray(rawPendingLeaves) ? rawPendingLeaves.length : 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const balances: any[] = Array.isArray(rawBalances) ? rawBalances : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalLeaveLeft = balances.reduce((s: number, b: any) => s + (Number(b.remaining) || 0), 0);

  // Tasks (tasks is already server-filtered to current user via useMyTasks)
  const myActive = canSeeTasks ? tasks.filter((t: any) => t.status !== 'DONE' && t.status !== 'CANCELLED').length : 0;
  const myDone   = canSeeTasks ? tasks.filter((t: any) => t.status === 'DONE').length : 0;
  const myTotal  = canSeeTasks ? tasks.length : 0;
  const myOverdue = canSeeTasks ? tasks.filter((t: any) => {
    if (!t.dueDate || t.status === 'DONE' || t.status === 'CANCELLED') return false;
    try { return isPast(parseISO(t.dueDate)); } catch { return false; }
  }).length : 0;
  const overdueActions = summary?.stats?.overdueActionsCount ?? 0;

  // Standups
  const missingStandups = canSubmitStandup ? summary?.stats?.missingStandupsCount ?? 0 : 0;
  const missingEods     = canSubmitStandup ? summary?.stats?.missingEodCount ?? 0 : 0;

  // Build the ordered card list — each entry only included when permission is granted
  const cards = [
    canSeeProjects && {
      key: 'projects',
      label: t('dashboard.projectHealth.active') + ' ' + t('nav.projects'),
      value: summary?.stats?.totalProjects ?? 0,
      sub: `${summary?.ragSummary?.RED ?? 0} ${t('dashboard.projectHealth.atRisk').toLowerCase()} · ${summary?.ragSummary?.GREEN ?? 0} ${t('dashboard.projectHealth.healthy').toLowerCase()}`,
      icon: <FolderKanban size={20} />,
      iconBg: 'bg-blue-100 text-blue-600',
      valueCls: (summary?.ragSummary?.RED ?? 0) > 0 ? 'text-red-600' : 'text-blue-700',
      to: `/${tenantSlug}/projects`,
    },
    canSeeTasks && {
      key: 'tasks',
      label: 'My Tasks',
      value: myActive,
      sub: myOverdue > 0
        ? `${myOverdue} overdue · ${myDone} done`
        : overdueActions > 0
          ? `${overdueActions} action${overdueActions > 1 ? 's' : ''} overdue`
          : `${myDone} completed · ${myTotal} total`,
      icon: <CheckSquare size={20} />,
      iconBg: myOverdue > 0 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600',
      valueCls: myOverdue > 0 ? 'text-red-700' : 'text-blue-700',
      trend: myOverdue > 0 ? 'down' : 'neutral',
      to: `/${tenantSlug}/my-tasks`,
    },
    canSeeTeamAttend && {
      key: 'attendance',
      label: 'Team Attendance',
      value: `${attendanceRate}%`,
      sub: `${liveCount} checked in · ${notInCount} pending`,
      icon: <Users size={20} />,
      iconBg: attendanceRate >= 70 ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600',
      valueCls: attendanceRate >= 70 ? 'text-green-700' : 'text-amber-700',
      trend: attendanceRate >= 70 ? 'up' : 'down',
      to: `/${tenantSlug}/attendance`,
    },
    canSeeBlockers && {
      key: 'blockers',
      label: 'Critical Blockers',
      value: summary?.stats?.criticalBlockersCount ?? 0,
      sub: (summary?.stats?.criticalBlockersCount ?? 0) === 0 ? 'All clear' : 'Needs attention',
      icon: <ShieldAlert size={20} />,
      iconBg: (summary?.stats?.criticalBlockersCount ?? 0) > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600',
      valueCls: (summary?.stats?.criticalBlockersCount ?? 0) > 0 ? 'text-red-700' : 'text-green-700',
      to: `/${tenantSlug}/blockers`,
    },
    canApproveLeave && {
      key: 'approvals',
      label: 'Pending Approvals',
      value: pendingLeaveCount,
      sub: pendingLeaveCount === 0 ? 'No pending requests' : `leave request${pendingLeaveCount > 1 ? 's' : ''} awaiting`,
      icon: <ClipboardList size={20} />,
      iconBg: pendingLeaveCount > 0 ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500',
      valueCls: pendingLeaveCount > 0 ? 'text-amber-700' : 'text-gray-500',
      to: `/${tenantSlug}/leave`,
    },
    canReadLeave && {
      key: 'leave',
      label: 'Leave Remaining',
      value: `${totalLeaveLeft}d`,
      sub: totalLeaveLeft === 0 ? 'No leave left' : 'days available',
      icon: <Calendar size={20} />,
      iconBg: totalLeaveLeft <= 3 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600',
      valueCls: totalLeaveLeft <= 3 ? 'text-red-700' : 'text-amber-700',
      to: `/${tenantSlug}/leave`,
    },
    canSubmitStandup && {
      key: 'standups',
      label: 'My Standups Due',
      value: missingStandups,
      sub: missingStandups === 0
        ? missingEods === 0 ? 'All submitted today' : `${missingEods} EOD${missingEods > 1 ? 's' : ''} pending`
        : `${missingStandups} project${missingStandups > 1 ? 's' : ''} pending`,
      icon: <Bell size={20} />,
      iconBg: missingStandups > 0 ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600',
      valueCls: missingStandups > 0 ? 'text-orange-700' : 'text-green-700',
      to: `/${tenantSlug}/standup`,
    },
    showTime && {
      key: 'time',
      label: "Today's Hours",
      value: `${(todayHours ?? 0).toFixed(1)}h`,
      sub: weekHours ? `${weekHours.toFixed(1)}h this week` : 'logged today',
      icon: <Timer size={20} />,
      iconBg: (todayHours ?? 0) > 0 ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-400',
      valueCls: (todayHours ?? 0) > 0 ? 'text-purple-700' : 'text-gray-400',
      to: `/${tenantSlug}/time-tracking`,
    },
  ].filter(Boolean) as Array<{
    key: string; label: string; value: string | number; sub: string;
    icon: React.ReactNode; iconBg: string; valueCls: string;
    trend?: 'up' | 'down' | 'neutral'; to: string;
  }>;

  if (cards.length === 0) return null;

  const count = cards.length;
  const gridCls =
    count <= 2 ? 'grid-cols-2' :
    count <= 4 ? 'grid-cols-2 sm:grid-cols-4' :
    count <= 6 ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6' :
                 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8';

  return (
    <div className={`grid ${gridCls} gap-4`}>
      {cards.map((card) => (
        <KpiCard
          key={card.key}
          label={card.label}
          value={card.value}
          sub={card.sub}
          icon={card.icon}
          iconBg={card.iconBg}
          valueCls={card.valueCls}
          trend={card.trend}
          to={card.to}
        />
      ))}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

const DashboardPage = () => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const slug = tenantSlug ?? '';
  const { user } = useAuth();

  // Permission helper — single source of truth for all gating below
  const p = (perm: Permission) => hasPermission(user, perm);

  // Permission aliases used by exec-summary gated widgets (not role checks)
  const isManager = p(PERMISSIONS.ORG_ROLE_READ);
  const isPmo     = p(PERMISSIONS.ADMIN_USERS);

  // Widget visibility flags derived entirely from permissions
  const showCheckin          = p(PERMISSIONS.ATTENDANCE_WRITE);
  const showTasks            = p(PERMISSIONS.TASK_READ);
  const showProjects         = p(PERMISSIONS.PROJECT_READ);
  const showBlockers         = p(PERMISSIONS.BLOCKER_READ);
  const showActions          = p(PERMISSIONS.ACTION_READ);
  const showLeaveBalance     = p(PERMISSIONS.LEAVE_READ);
  const showBadges           = p(PERMISSIONS.BADGE_READ);
  const showAnnouncements    = p(PERMISSIONS.ANNOUNCEMENT_READ);
  const showTeamAttend       = p(PERMISSIONS.ATTENDANCE_TEAM_VIEW);
  const showPendingLeaves    = p(PERMISSIONS.LEAVE_APPROVE);
  // STANDUP_TEAM_VIEW gates the feature; ORG_ROLE_READ is required by exec-summary backend
  const showActivityTrend    = isManager && p(PERMISSIONS.STANDUP_TEAM_VIEW);
  const showBlockerBreakdown = showBlockers && isManager;
  const showProjectHealth    = isPmo || p(PERMISSIONS.PROJECT_DATA_VIEW_ALL);
  const showMonthlyStats     = showCheckin;
  const showMilestones       = isManager || showProjectHealth;
  const showTimeWidget       = p(PERMISSIONS.TIME_WRITE);
  const showUpcomingLeave    = p(PERMISSIONS.LEAVE_READ);
  // TIME_ANALYTICS is the actual backend route gate (not TIME_TEAM_VIEW)
  const showTeamTimeView     = p(PERMISSIONS.TIME_ANALYTICS);
  const showTimeHistogram    = showTimeWidget;
  // All exec-summary widgets require ORG_ROLE_READ (matches backend route gate)
  const showExecWidgets      = isManager;
  const showPortfolioHealth  = p(PERMISSIONS.PROJECT_READ);

  // Data — lifted here so AttentionStrip can use them without extra fetches
  const { data, isLoading, error } = useDashboardSummary();
  // useMyTasks: server-filtered to current user (assignee OR creator) — correct for KPI/insights
  const { data: rawTasks = [] } = useMyTasks();
  const { data: attendance } = useMyAttendanceRecord();
  const { data: rawPendingLeaves } = useLeaveRequests({ status: 'PENDING' });
  const { data: myWeekData } = useMyWeek();

  const allTasks = useMemo(() => {
    const arr = Array.isArray(rawTasks) ? rawTasks : (rawTasks as { data?: unknown[] })?.data ?? [];
    return arr as any[];
  }, [rawTasks]);

  const pendingLeaves = useMemo(
    () => (Array.isArray(rawPendingLeaves) ? rawPendingLeaves : []),
    [rawPendingLeaves],
  );

  const attendanceToday = (attendance as any)?.today;

  // Today's / week hours from my-week (undefined when TIME_WRITE not granted → strips hide the card)
  const todayStr    = format(new Date(), 'yyyy-MM-dd');
  const todayHours  = showTimeWidget
    ? ((myWeekData as any)?.days ?? []).find((d: any) => d.date === todayStr)?.hours ?? 0
    : undefined;
  const weekHours   = showTimeWidget ? (myWeekData as any)?.totalHours ?? 0 : undefined;

  if (isLoading) return <Layout><PageLoader /></Layout>;
  if (error) return <Layout><Alert type="error" message={(error as Error).message} className="m-6" /></Layout>;

  const summary    = data as any;
  const today      = format(new Date(), 'EEEE, d MMMM yyyy');
  const hour       = new Date().getHours();
  const greeting   = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName  = user?.name?.split(' ')[0] ?? '';
  const userId     = String(user?.id ?? '');

  return (
    <Layout>
      <Header
        title={`${greeting}${firstName ? `, ${firstName}` : ''}`}
        subtitle={today}
      />
      <div className="p-6 space-y-5">

        {/* Attention Required — always first, only rendered when there are alerts */}
        <AttentionStrip
          summary={summary}
          tasks={allTasks}
          userId={userId}
          tenantSlug={slug}
          pendingLeaves={pendingLeaves}
          attendanceToday={attendanceToday}
        />

        {/* Dynamic KPI strip — each card gated by its own permission */}
        <DynamicKpiStrip summary={summary} tenantSlug={slug} tasks={allTasks} todayHours={todayHours} weekHours={weekHours} />

        {/* Check-in + Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {showCheckin && (
            <div className="lg:col-span-1">
              <CheckInWidget />
            </div>
          )}
          <div className={showCheckin ? 'lg:col-span-2' : 'lg:col-span-3'}>
            <QuickActions tenantSlug={slug} user={user} />
          </div>
        </div>

        {/* My Monthly Snapshot */}
        {showMonthlyStats && (
          <MyMonthlyStatsWidget userId={userId} tenantSlug={slug} />
        )}

        {/* Time This Week — bar chart + today's hours + billable breakdown */}
        {showTimeWidget && <TimeThisWeekWidget tenantSlug={slug} />}

        {/* Tasks + Projects — columns collapse when one is hidden */}
        {(showTasks || showProjects) && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {showTasks && (
              <div className={showProjects ? 'lg:col-span-2' : 'lg:col-span-3'}>
                <MyTasksWidget userId={userId} tenantSlug={slug} />
              </div>
            )}
            {showProjects && (
              <div className={showTasks ? '' : 'lg:col-span-3'}>
                <ProjectsWidget summary={summary} tenantSlug={slug} />
              </div>
            )}
          </div>
        )}

        {/* Personal Task Insights — task status donut + priority chart */}
        {showTasks && (
          <PersonalInsightsWidget tasks={allTasks} tenantSlug={slug} userId={userId} />
        )}

        {/* Portfolio Snapshot — RAG donut + action/blocker/standup stats (PROJECT_READ) */}
        {showPortfolioHealth && (
          <PortfolioSnapshotWidget summary={summary} tenantSlug={slug} />
        )}

        {/* Activity Trend — full width for managers */}
        {showActivityTrend && <ActivityTrendWidget tenantSlug={slug} enabled={showExecWidgets} />}

        {/* Time Histogram — team view for managers, personal project breakdown otherwise */}
        {showTimeHistogram && (
          <TimeHistogramWidget showTeamView={showTeamTimeView} tenantSlug={slug} />
        )}

        {/* Org Pulse — risks, decisions, dependencies, teams, milestone progress (managers) */}
        {showExecWidgets && <OrgPulseWidget tenantSlug={slug} enabled={showExecWidgets} />}

        {/* Project Health + Blocker Breakdown — side by side for PMO/managers */}
        {(showProjectHealth || showBlockerBreakdown) && (
          <div className={`grid grid-cols-1 ${showProjectHealth && showBlockerBreakdown ? 'lg:grid-cols-3' : ''} gap-5`}>
            {showProjectHealth && (
              <div className={showBlockerBreakdown ? 'lg:col-span-2' : ''}>
                <ProjectHealthPanel tenantSlug={slug} enabled={showExecWidgets} />
              </div>
            )}
            {showBlockerBreakdown && <BlockerBreakdownWidget tenantSlug={slug} enabled={showExecWidgets} />}
          </div>
        )}

        {/* Blockers + Overdue Actions — each half gated independently */}
        <BlockersActionsRow
          summary={summary}
          tenantSlug={slug}
          showBlockers={showBlockers}
          showActions={showActions}
        />

        {/* Leave row — Leave Balance + Upcoming Leaves side by side */}
        {(showLeaveBalance || showUpcomingLeave) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {showLeaveBalance    && <LeaveBalanceWidget      tenantSlug={slug} />}
            {showUpcomingLeave   && <MyUpcomingLeavesWidget  tenantSlug={slug} />}
          </div>
        )}

        {/* Badges + Announcements row */}
        {(showBadges || showAnnouncements) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {showBadges        && <MyBadgesWidget       tenantSlug={slug} />}
            {showAnnouncements && <AnnouncementsWidget  tenantSlug={slug} />}
          </div>
        )}

        {/* Manager section — team attendance, pending leaves, milestones */}
        {(showTeamAttend || showPendingLeaves || showMilestones) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {showTeamAttend    && <TeamAttendanceWidget tenantSlug={slug} />}
            {showPendingLeaves && <PendingLeavesWidget  tenantSlug={slug} />}
            {showMilestones    && (
              <div className={showTeamAttend && showPendingLeaves ? 'lg:col-span-2' : ''}>
                <UpcomingMilestonesWidget tenantSlug={slug} enabled={showExecWidgets} />
              </div>
            )}
          </div>
        )}


      </div>
    </Layout>
  );
};

export default DashboardPage;
