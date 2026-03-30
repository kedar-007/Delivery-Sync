import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle, CheckSquare, Clock, FolderKanban,
  LogIn, LogOut, CheckCircle2, Circle, ArrowUpRight, Timer,
  Layers, ChevronRight, Calendar, BarChart2, Zap, Users,
  AlertCircle, Star, Bell, Award, TrendingUp, TrendingDown,
  Activity, ShieldAlert, ClipboardList, Briefcase,
  Target, BarChart, Flame, Coffee, CheckCheck,
} from 'lucide-react';
import { format, parseISO, isPast, addDays, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import { RAGBadge, StatusBadge } from '../components/ui/Badge';
import { PageLoader } from '../components/ui/Spinner';
import Alert from '../components/ui/Alert';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import { useDashboardSummary } from '../hooks/useDashboard';
import { useAuth } from '../contexts/AuthContext';
import {
  useMyAttendanceRecord, useCheckIn, useCheckOut,
  useLeaveBalance, useLeaveRequests, useAttendanceSummary,
  useAnnouncements,
} from '../hooks/usePeople';
import UserAvatar from '../components/ui/UserAvatar';
import { useTasks } from '../hooks/useTaskSprint';
import { useProjects } from '../hooks/useProjects';
import { useMyProfile } from '../hooks/useBadgeProfile';
import PerformanceModal from '../components/ui/PerformanceModal';

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
  const { data: attendance } = useMyAttendanceRecord();
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();
  const [error, setError] = useState('');

  const today = attendance?.today as { checkInTime?: string; checkOutTime?: string; status?: string; hoursWorked?: number } | null | undefined;
  const isCheckedIn  = !!today?.checkInTime;
  const isCheckedOut = !!today?.checkOutTime;
  const isDone = isCheckedIn && isCheckedOut;

  const elapsed = useElapsedTimer(isCheckedIn && !isCheckedOut ? today?.checkInTime : undefined);

  const handleCheckIn = async () => {
    try { setError(''); await checkIn.mutateAsync({}); } catch (e: unknown) { setError((e as Error).message); }
  };
  const handleCheckOut = async () => {
    try { setError(''); await checkOut.mutateAsync({}); } catch (e: unknown) { setError((e as Error).message); }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isCheckedIn && !isCheckedOut ? 'bg-green-100' : isDone ? 'bg-blue-100' : 'bg-gray-100'}`}>
            <Clock size={14} className={isCheckedIn && !isCheckedOut ? 'text-green-600' : isDone ? 'text-blue-600' : 'text-gray-500'} />
          </div>
          <span className="text-sm font-semibold text-gray-800">Today's Attendance</span>
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
            <p className="text-xs text-gray-500">Not checked in yet</p>
          </div>
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white w-full justify-center"
            icon={<LogIn size={14} />}
            loading={checkIn.isPending}
            onClick={handleCheckIn}
          >
            Check In Now
          </Button>
        </div>
      )}

      {isCheckedIn && !isCheckedOut && (
        <div className="space-y-3">
          <div className="text-center bg-green-50 rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-0.5">Time since check-in</p>
            <p className="text-2xl font-bold text-green-600 font-mono tabular-nums tracking-widest">{elapsed}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              Checked in at {today?.checkInTime ? format(new Date(today.checkInTime), 'hh:mm a') : ''}
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
            Check Out
          </Button>
        </div>
      )}

      {isDone && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-gray-50 rounded-lg p-2">
            <p className="text-[10px] text-gray-400 mb-0.5">In</p>
            <p className="text-xs font-semibold text-gray-700">{today?.checkInTime ? format(new Date(today.checkInTime), 'hh:mm a') : '—'}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <p className="text-[10px] text-gray-400 mb-0.5">Out</p>
            <p className="text-xs font-semibold text-gray-700">{today?.checkOutTime ? format(new Date(today.checkOutTime), 'hh:mm a') : '—'}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-2">
            <p className="text-[10px] text-gray-400 mb-0.5">Hours</p>
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
  const inner = (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3 hover:shadow-md transition-all group h-full">
      <div className="flex items-center justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg} transition-transform group-hover:scale-105`}>
          {icon}
        </div>
        {trend && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-500' : 'text-gray-400'}`}>
            {trend === 'up' ? <TrendingUp size={13} /> : trend === 'down' ? <TrendingDown size={13} /> : null}
            {trendLabel}
          </span>
        )}
      </div>
      <div>
        <p className={`text-2xl font-bold leading-none ${valueCls}`}>{value}</p>
        <p className="text-xs font-semibold text-gray-500 mt-1">{label}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
  if (to) return <Link to={to}>{inner}</Link>;
  return inner;
}

// ── My Tasks Widget ───────────────────────────────────────────────────────────

function MyTasksWidget({ userId, tenantSlug }: { userId: string; tenantSlug: string }) {
  const { data: rawTasks } = useTasks();
  const { data: projects = [] } = useProjects();

  const tasks = useMemo(() => {
    const arr = Array.isArray(rawTasks) ? rawTasks : (rawTasks as { data?: unknown[] })?.data ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (arr as any[]).filter((t) =>
      t.assigneeIds?.includes(String(userId)) || String(t.assigneeId) === String(userId)
    );
  }, [rawTasks, userId]);

  const inProgress = tasks.filter((t) => t.status === 'IN_PROGRESS');
  const todo       = tasks.filter((t) => t.status === 'TODO');
  const done       = tasks.filter((t) => t.status === 'DONE');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  const PRIORITY_DOT: Record<string, string> = {
    CRITICAL: 'bg-red-500', HIGH: 'bg-orange-500', MEDIUM: 'bg-yellow-500', LOW: 'bg-gray-400',
  };
  const STATUS_ICON: Record<string, React.ReactNode> = {
    TODO:        <Circle size={12} className="text-gray-400" />,
    IN_PROGRESS: <ArrowUpRight size={12} className="text-blue-500" />,
    IN_REVIEW:   <AlertCircle size={12} className="text-yellow-500" />,
    DONE:        <CheckCircle2 size={12} className="text-green-500" />,
  };

  const totalActive = tasks.filter((t) => t.status !== 'DONE').length;
  const completionPct = tasks.length > 0 ? Math.round((done.length / tasks.length) * 100) : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CheckSquare size={15} className="text-indigo-600" />
            <span className="text-sm font-semibold text-gray-900">My Tasks</span>
            <span className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium">{totalActive} active</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            {overdue.length > 0 && <span className="text-red-600 font-medium">{overdue.length} overdue</span>}
            {dueSoon.length > 0 && <span className="text-amber-600">{dueSoon.length} due soon</span>}
            <Link to={`/${tenantSlug}/my-tasks`} className="text-indigo-600 hover:underline flex items-center gap-0.5">
              View all <ChevronRight size={11} />
            </Link>
          </div>
        </div>
        {/* Status breakdown bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden flex">
            <div className="h-full bg-blue-500 transition-all" style={{ width: `${tasks.length > 0 ? (inProgress.length / tasks.length) * 100 : 0}%` }} />
            <div className="h-full bg-green-500 transition-all" style={{ width: `${tasks.length > 0 ? (done.length / tasks.length) * 100 : 0}%` }} />
            <div className="h-full bg-gray-300 transition-all" style={{ width: `${tasks.length > 0 ? (todo.length / tasks.length) * 100 : 0}%` }} />
          </div>
          <span className="text-[10px] text-gray-400 shrink-0">{completionPct}% done</span>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="py-8 text-center">
          <CheckCheck size={28} className="mx-auto text-green-300 mb-2" />
          <p className="text-sm font-medium text-gray-500">All caught up!</p>
          <p className="text-xs text-gray-400 mt-0.5">No tasks assigned to you</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {[...inProgress, ...todo].slice(0, 7).map((t: any) => (
            <div key={t.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors">
              <span className="flex-shrink-0">{STATUS_ICON[t.status] ?? <Circle size={12} />}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 font-medium truncate">{t.title}</p>
                <p className="text-[10px] text-gray-400 truncate">{getProject(t.projectId)?.name ?? 'Project'}</p>
              </div>
              {t.priority && (
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[t.priority] ?? 'bg-gray-400'}`} title={t.priority} />
              )}
              {t.dueDate && isPast(parseISO(t.dueDate)) && t.status !== 'DONE' && (
                <span className="text-[10px] text-red-500 flex-shrink-0 bg-red-50 px-1.5 py-0.5 rounded">
                  {format(parseISO(t.dueDate), 'MMM d')}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Quick Actions ─────────────────────────────────────────────────────────────

function QuickActions({ tenantSlug, role }: { tenantSlug: string; role: string }) {
  const baseActions = [
    { label: 'Submit Standup', to: `/${tenantSlug}/standup`,       icon: <Clock size={15} />,        bg: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
    { label: 'Submit EOD',     to: `/${tenantSlug}/eod`,           icon: <CheckSquare size={15} />,  bg: 'bg-green-50 text-green-700 hover:bg-green-100' },
    { label: 'Log Time',       to: `/${tenantSlug}/time-tracking`, icon: <Timer size={15} />,        bg: 'bg-purple-50 text-purple-700 hover:bg-purple-100' },
    { label: 'My Tasks',       to: `/${tenantSlug}/my-tasks`,      icon: <Layers size={15} />,       bg: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' },
    { label: 'Raise Blocker',  to: `/${tenantSlug}/blockers`,      icon: <AlertTriangle size={15} />,bg: 'bg-red-50 text-red-700 hover:bg-red-100' },
    { label: 'Mark Leave',     to: `/${tenantSlug}/leave`,         icon: <Calendar size={15} />,     bg: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
    { label: 'Team Directory', to: `/${tenantSlug}/directory`,     icon: <Users size={15} />,        bg: 'bg-teal-50 text-teal-700 hover:bg-teal-100' },
    { label: 'AI Insights',    to: `/${tenantSlug}/ai-insights`,   icon: <Zap size={15} />,          bg: 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100' },
  ];

  const managerExtras = [
    { label: 'Projects',      to: `/${tenantSlug}/projects`,     icon: <FolderKanban size={15} />,  bg: 'bg-sky-50 text-sky-700 hover:bg-sky-100' },
    { label: 'Sprints',       to: `/${tenantSlug}/sprints`,      icon: <Activity size={15} />,      bg: 'bg-violet-50 text-violet-700 hover:bg-violet-100' },
  ];

  const actions = ['PMO', 'TENANT_ADMIN', 'DELIVERY_LEAD'].includes(role)
    ? [...baseActions.slice(0, 6), ...managerExtras]
    : baseActions;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 h-full">
      <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <Star size={14} className="text-indigo-500" /> Quick Actions
      </h3>
      <div className="grid grid-cols-4 gap-2">
        {actions.map((a) => (
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
  const { data: rawBalances } = useLeaveBalance();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const balances: any[] = Array.isArray(rawBalances) ? rawBalances : [];
  if (balances.length === 0) return null;

  const totalDays = balances.reduce((s: number, b: any) => s + (Number(b.remaining) || 0), 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar size={15} className="text-amber-600" />
          <span className="text-sm font-semibold text-gray-900">Leave Balance</span>
          <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">{totalDays}d total</span>
        </div>
        <Link to={`/${tenantSlug}/leave`} className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
          Apply <ChevronRight size={11} />
        </Link>
      </div>
      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
        {balances.slice(0, 6).map((b: any) => {
          const pct = b.allocated > 0 ? Math.min(100, ((b.used + b.pending) / b.allocated) * 100) : 0;
          const isLow = b.remaining <= 2 && b.allocated > 0;
          return (
            <div key={b.leaveTypeId ?? b.id} className={`p-2.5 rounded-lg border ${isLow ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-transparent'}`}>
              <p className="text-xs font-medium text-gray-600 truncate mb-1">{b.leaveTypeName}</p>
              <p className={`text-xl font-bold leading-none ${isLow ? 'text-red-600' : 'text-blue-700'}`}>{b.remaining ?? 0}</p>
              <p className="text-[10px] text-gray-400 mb-1.5">of {b.allocated ?? 0}d</p>
              <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${isLow ? 'bg-red-400' : 'bg-blue-500'}`} style={{ width: `${100 - pct}%` }} />
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
  const { data: raw } = useLeaveRequests({ status: 'PENDING' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requests: any[] = Array.isArray(raw) ? raw : [];
  if (requests.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={15} className="text-amber-500" />
          <span className="text-sm font-semibold text-gray-900">Pending Leave Requests</span>
          <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">{requests.length}</span>
        </div>
        <Link to={`/${tenantSlug}/leave`} className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
          Review <ChevronRight size={11} />
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
              +{requests.length - 4} more pending
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Team Attendance Widget (for managers) ─────────────────────────────────────

function TeamAttendanceWidget({ tenantSlug }: { tenantSlug: string }) {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const { data: summaryData } = useAttendanceSummary({ date: todayStr });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summary = (summaryData as any)?.summary ?? summaryData;
  if (!summary) return null;

  const present = Number(summary.present ?? 0);
  const absent  = Number(summary.absent  ?? 0);
  const wfh     = Number(summary.wfh     ?? 0);
  const total   = present + absent + wfh || 1;
  const attendanceRate = Math.round(((present + wfh) / total) * 100);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={15} className="text-teal-600" />
          <span className="text-sm font-semibold text-gray-900">Team Attendance Today</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${attendanceRate >= 80 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
            {attendanceRate}%
          </span>
        </div>
        <Link to={`/${tenantSlug}/attendance`} className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
          Details <ChevronRight size={11} />
        </Link>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-3 gap-3 text-center mb-4">
          <div className="bg-green-50 rounded-lg p-3">
            <p className="text-2xl font-bold text-green-700">{present}</p>
            <p className="text-xs text-gray-500 mt-0.5">Present</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-2xl font-bold text-blue-700">{wfh}</p>
            <p className="text-xs text-gray-500 mt-0.5">WFH</p>
          </div>
          <div className="bg-red-50 rounded-lg p-3">
            <p className="text-2xl font-bold text-red-600">{absent}</p>
            <p className="text-xs text-gray-500 mt-0.5">Absent</p>
          </div>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
          <div className="h-full bg-green-500 transition-all" style={{ width: `${(present / total) * 100}%` }} />
          <div className="h-full bg-blue-400 transition-all" style={{ width: `${(wfh    / total) * 100}%` }} />
          <div className="h-full bg-red-300  transition-all" style={{ width: `${(absent  / total) * 100}%` }} />
        </div>
        <div className="flex items-center justify-between mt-1.5 text-[10px] text-gray-400">
          <span>Present + WFH = {present + wfh}</span>
          <span>Total {total}</span>
        </div>
      </div>
    </div>
  );
}

// ── My Badges Widget ──────────────────────────────────────────────────────────

function MyBadgesWidget({ tenantSlug }: { tenantSlug: string }) {
  const { data: profile } = useMyProfile();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const badges: any[] = Array.isArray((profile as any)?.badges) ? (profile as any).badges : [];
  if (badges.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award size={15} className="text-amber-500" />
          <span className="text-sm font-semibold text-gray-900">My Badges</span>
          <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">{badges.length}</span>
        </div>
        <Link to={`/${tenantSlug}/directory`} className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
          Profile <ChevronRight size={11} />
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
            <p className="text-[10px] text-gray-400">more</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Announcements Widget ──────────────────────────────────────────────────────

function AnnouncementsWidget({ tenantSlug }: { tenantSlug: string }) {
  const { data: raw } = useAnnouncements();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = Array.isArray(raw) ? raw.slice(0, 3) : [];
  if (items.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={15} className="text-purple-600" />
          <span className="text-sm font-semibold text-gray-900">Announcements</span>
        </div>
        <Link to={`/${tenantSlug}/announcements`} className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
          All <ChevronRight size={11} />
        </Link>
      </div>
      <div className="divide-y divide-gray-50">
        {items.map((a: any) => (
          <div key={a.id} className="px-4 py-3">
            <p className="text-sm font-medium text-gray-800 truncate">{a.title}</p>
            {a.content && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{a.content}</p>}
            <p className="text-[10px] text-gray-400 mt-1">{(() => { try { const d = new Date(String(a.createdAt ?? '').replace(' ', 'T')); return isNaN(d.getTime()) ? '' : format(d, 'MMM d, yyyy'); } catch { return ''; } })()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Projects RAG Widget ───────────────────────────────────────────────────────

function ProjectsWidget({ summary, tenantSlug }: { summary: any; tenantSlug: string }) {
  const red   = summary?.ragSummary?.RED   ?? 0;
  const amber = summary?.ragSummary?.AMBER ?? 0;
  const green = summary?.ragSummary?.GREEN ?? 0;
  const total = red + amber + green || 1;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <FolderKanban size={14} className="text-blue-500" /> My Projects
        </h3>
        <Link to={`/${tenantSlug}/projects`} className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
          All <ChevronRight size={11} />
        </Link>
      </div>
      {/* RAG summary bar */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex gap-2 text-xs mb-2">
          {red > 0   && <span className="text-red-600 font-semibold flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{red} at risk</span>}
          {amber > 0 && <span className="text-amber-600 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />{amber} caution</span>}
          {green > 0 && <span className="text-green-700 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />{green} healthy</span>}
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden flex">
          <div className="h-full bg-red-500"   style={{ width: `${(red   / total) * 100}%` }} />
          <div className="h-full bg-amber-400" style={{ width: `${(amber / total) * 100}%` }} />
          <div className="h-full bg-green-500" style={{ width: `${(green / total) * 100}%` }} />
        </div>
      </div>
      <div className="divide-y divide-gray-50">
        {(!summary?.projects || summary.projects.length === 0)
          ? <EmptyState title="No projects" description="Not a member of any active project." />
          : summary.projects.slice(0, 7).map((p: { id: string; name: string; ragStatus: string }) => (
            <Link key={p.id} to={`/${tenantSlug}/projects/${p.id}`}
              className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors group">
              <span className="text-sm text-gray-800 font-medium truncate pr-2 group-hover:text-indigo-600 transition-colors">{p.name}</span>
              <RAGBadge status={p.ragStatus} />
            </Link>
          ))
        }
      </div>
      {summary?.projects?.length > 7 && (
        <div className="px-4 py-2 border-t border-gray-50">
          <Link to={`/${tenantSlug}/projects`} className="text-xs text-indigo-600 hover:underline">
            View all {summary.projects.length} →
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Blockers & Actions Widgets ─────────────────────────────────────────────────

function BlockersActionsRow({ summary, tenantSlug }: { summary: any; tenantSlug: string }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Overdue Actions */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <ClipboardList size={14} className="text-orange-500" /> Overdue Actions
            {summary?.overdueActions?.length > 0 && (
              <span className="text-xs bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded-full">{summary.overdueActions.length}</span>
            )}
          </h3>
          <Link to={`/${tenantSlug}/actions`} className="text-xs text-indigo-600 hover:underline">View all</Link>
        </div>
        <div className="divide-y divide-gray-50">
          {(!summary?.overdueActions || summary.overdueActions.length === 0)
            ? <div className="py-6 text-center"><CheckCircle2 size={20} className="mx-auto text-green-300 mb-1" /><p className="text-xs text-gray-400">All caught up!</p></div>
            : summary.overdueActions.slice(0, 5).map((a: { id: string; title: string; dueDate: string; priority: string }) => (
              <div key={a.id} className="px-4 py-2.5 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 font-medium truncate">{a.title}</p>
                  <p className="text-xs text-red-500 mt-0.5">Due {a.dueDate}</p>
                </div>
                <StatusBadge status={a.priority} />
              </div>
            ))
          }
        </div>
      </div>

      {/* Critical Blockers */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <ShieldAlert size={14} className="text-red-500" /> Critical Blockers
            {summary?.criticalBlockers?.length > 0 && (
              <span className="text-xs bg-red-50 text-red-700 px-1.5 py-0.5 rounded-full">{summary.criticalBlockers.length}</span>
            )}
          </h3>
          <Link to={`/${tenantSlug}/blockers`} className="text-xs text-indigo-600 hover:underline">View all</Link>
        </div>
        <div className="divide-y divide-gray-50">
          {(!summary?.criticalBlockers || summary.criticalBlockers.length === 0)
            ? <div className="py-6 text-center"><CheckCircle2 size={20} className="mx-auto text-green-300 mb-1" /><p className="text-xs text-gray-400">No critical blockers</p></div>
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
    </div>
  );
}

// ── Role-specific KPI strips ───────────────────────────────────────────────────

function PmoKpiStrip({ summary, tenantSlug, tasks }: { summary: any; tenantSlug: string; tasks: any[] }) {
  const { data: attendanceSummaryData } = useAttendanceSummary({ date: format(new Date(), 'yyyy-MM-dd') });
  const { data: rawPendingLeaves } = useLeaveRequests({ status: 'PENDING' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const atSummary = (attendanceSummaryData as any)?.summary ?? attendanceSummaryData;
  const present = Number(atSummary?.present ?? 0);
  const wfh     = Number(atSummary?.wfh     ?? 0);
  const total   = Number(atSummary?.total   ?? (present + Number(atSummary?.absent ?? 0) + wfh)) || 1;
  const attendanceRate = Math.round(((present + wfh) / total) * 100);
  const pendingLeaves = Array.isArray(rawPendingLeaves) ? rawPendingLeaves.length : 0;

  const allTasks = Array.isArray(tasks) ? tasks : [];
  const overdueTasks = allTasks.filter((t: any) => {
    if (!t.dueDate || t.status === 'DONE') return false;
    try { return isPast(parseISO(t.dueDate)); } catch { return false; }
  }).length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      <KpiCard
        label="Active Projects"
        value={summary?.stats?.totalProjects ?? 0}
        sub={`${summary?.ragSummary?.RED ?? 0} at risk`}
        icon={<FolderKanban size={20} />}
        iconBg="bg-blue-100 text-blue-600"
        valueCls={(summary?.ragSummary?.RED ?? 0) > 0 ? 'text-red-600' : 'text-blue-700'}
        to={`/${tenantSlug}/projects`}
      />
      <KpiCard
        label="Team Attendance"
        value={`${attendanceRate}%`}
        sub={`${present + wfh} of ${total} in`}
        icon={<Users size={20} />}
        iconBg={attendanceRate >= 80 ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}
        valueCls={attendanceRate >= 80 ? 'text-green-700' : 'text-amber-700'}
        trend={attendanceRate >= 80 ? 'up' : 'down'}
        to={`/${tenantSlug}/attendance`}
      />
      <KpiCard
        label="Critical Blockers"
        value={summary?.stats?.criticalBlockersCount ?? 0}
        sub={(summary?.stats?.criticalBlockersCount ?? 0) === 0 ? 'All clear' : 'Needs attention'}
        icon={<ShieldAlert size={20} />}
        iconBg={(summary?.stats?.criticalBlockersCount ?? 0) > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}
        valueCls={(summary?.stats?.criticalBlockersCount ?? 0) > 0 ? 'text-red-700' : 'text-green-700'}
        to={`/${tenantSlug}/blockers`}
      />
      <KpiCard
        label="Pending Approvals"
        value={pendingLeaves}
        sub="leave requests"
        icon={<ClipboardList size={20} />}
        iconBg={pendingLeaves > 0 ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'}
        valueCls={pendingLeaves > 0 ? 'text-amber-700' : 'text-gray-500'}
        to={`/${tenantSlug}/leave`}
      />
      <KpiCard
        label="Overdue Tasks"
        value={overdueTasks}
        sub="across all projects"
        icon={<AlertTriangle size={20} />}
        iconBg={overdueTasks > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}
        valueCls={overdueTasks > 0 ? 'text-red-700' : 'text-green-700'}
        to={`/${tenantSlug}/my-tasks`}
      />
    </div>
  );
}

function DeliveryLeadKpiStrip({ summary, tenantSlug, tasks, userId }: { summary: any; tenantSlug: string; tasks: any[]; userId: string }) {
  const myTasks = tasks.filter((t: any) =>
    t.assigneeIds?.includes(String(userId)) || String(t.assigneeId) === String(userId)
  );
  const myInProgress = myTasks.filter((t: any) => t.status === 'IN_PROGRESS').length;
  const myOverdue    = myTasks.filter((t: any) => {
    if (!t.dueDate || t.status === 'DONE') return false;
    try { return isPast(parseISO(t.dueDate)); } catch { return false; }
  }).length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <KpiCard
        label="My Projects"
        value={summary?.projects?.length ?? 0}
        sub={`${summary?.ragSummary?.RED ?? 0} at risk`}
        icon={<Briefcase size={20} />}
        iconBg="bg-indigo-100 text-indigo-600"
        valueCls="text-indigo-700"
        to={`/${tenantSlug}/projects`}
      />
      <KpiCard
        label="My Tasks"
        value={myInProgress}
        sub={myOverdue > 0 ? `${myOverdue} overdue` : 'On track'}
        icon={<CheckSquare size={20} />}
        iconBg={myOverdue > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}
        valueCls={myOverdue > 0 ? 'text-red-700' : 'text-green-700'}
        trend={myOverdue > 0 ? 'down' : 'neutral'}
        to={`/${tenantSlug}/my-tasks`}
      />
      <KpiCard
        label="Critical Blockers"
        value={summary?.stats?.criticalBlockersCount ?? 0}
        sub={(summary?.stats?.criticalBlockersCount ?? 0) === 0 ? 'All clear' : 'Needs attention'}
        icon={<ShieldAlert size={20} />}
        iconBg={(summary?.stats?.criticalBlockersCount ?? 0) > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}
        valueCls={(summary?.stats?.criticalBlockersCount ?? 0) > 0 ? 'text-red-700' : 'text-green-700'}
        to={`/${tenantSlug}/blockers`}
      />
      <KpiCard
        label="Missing Standups"
        value={summary?.stats?.missingStandupsCount ?? 0}
        sub={(summary?.stats?.missingStandupsCount ?? 0) === 0 ? 'Everyone reported' : 'Follow up needed'}
        icon={<Bell size={20} />}
        iconBg={(summary?.stats?.missingStandupsCount ?? 0) > 0 ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}
        valueCls={(summary?.stats?.missingStandupsCount ?? 0) > 0 ? 'text-orange-700' : 'text-green-700'}
        to={`/${tenantSlug}/standup`}
      />
    </div>
  );
}

function TeamMemberKpiStrip({ tenantSlug, tasks, userId }: { tenantSlug: string; tasks: any[]; userId: string }) {
  const { data: rawBalances } = useLeaveBalance();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const balances: any[] = Array.isArray(rawBalances) ? rawBalances : [];
  const totalLeaveLeft = balances.reduce((sum: number, b: any) => sum + (Number(b.remaining) || 0), 0);

  const myTasks = tasks.filter((t: any) =>
    t.assigneeIds?.includes(String(userId)) || String(t.assigneeId) === String(userId)
  );
  const inProgress = myTasks.filter((t: any) => t.status === 'IN_PROGRESS').length;
  const done       = myTasks.filter((t: any) => t.status === 'DONE').length;
  const overdue    = myTasks.filter((t: any) => {
    if (!t.dueDate || t.status === 'DONE') return false;
    try { return isPast(parseISO(t.dueDate)); } catch { return false; }
  }).length;
  const completionPct = myTasks.length > 0 ? Math.round((done / myTasks.length) * 100) : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <KpiCard
        label="In Progress"
        value={inProgress}
        sub={`${myTasks.length} total tasks`}
        icon={<Activity size={20} />}
        iconBg="bg-blue-100 text-blue-600"
        valueCls="text-blue-700"
        to={`/${tenantSlug}/my-tasks`}
      />
      <KpiCard
        label="Completed"
        value={`${completionPct}%`}
        sub={`${done} tasks done`}
        icon={<Target size={20} />}
        iconBg={completionPct >= 50 ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}
        valueCls={completionPct >= 50 ? 'text-green-700' : 'text-gray-600'}
        trend={completionPct >= 50 ? 'up' : 'neutral'}
        to={`/${tenantSlug}/my-tasks`}
      />
      <KpiCard
        label="Overdue Tasks"
        value={overdue}
        sub={overdue === 0 ? 'On schedule' : 'Needs attention'}
        icon={<Flame size={20} />}
        iconBg={overdue > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}
        valueCls={overdue > 0 ? 'text-red-700' : 'text-green-700'}
        to={`/${tenantSlug}/my-tasks`}
      />
      <KpiCard
        label="Leave Remaining"
        value={totalLeaveLeft}
        sub="days total"
        icon={<Calendar size={20} />}
        iconBg="bg-amber-100 text-amber-600"
        valueCls="text-amber-700"
        to={`/${tenantSlug}/leave`}
      />
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

const MANAGER_ROLES = ['TENANT_ADMIN', 'PMO', 'DELIVERY_LEAD'];

const DashboardPage = () => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const slug = tenantSlug ?? '';
  const { user } = useAuth();
  const role = user?.role ?? 'TEAM_MEMBER';
  const isManager = MANAGER_ROLES.includes(role);
  const isPmo = role === 'PMO' || role === 'TENANT_ADMIN';
  const [showPerformance, setShowPerformance] = useState(false);
  const { data, isLoading, error } = useDashboardSummary();
  const { data: rawTasks = [] } = useTasks();

  const allTasks = useMemo(() => {
    const arr = Array.isArray(rawTasks) ? rawTasks : (rawTasks as { data?: unknown[] })?.data ?? [];
    return arr as any[];
  }, [rawTasks]);

  if (isLoading) return <Layout><PageLoader /></Layout>;
  if (error) return <Layout><Alert type="error" message={(error as Error).message} className="m-6" /></Layout>;

  const summary = data as any;
  const today   = format(new Date(), 'EEEE, d MMMM yyyy');
  const hour    = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <Layout>
      <Header
        title={`${greeting}, ${user?.name?.split(' ')[0] ?? 'there'} 👋`}
        subtitle={today}
        actions={
          isManager ? (
            <Button size="sm" variant="secondary" icon={<BarChart2 size={15} />} onClick={() => setShowPerformance(true)}>
              Analyze Performance
            </Button>
          ) : undefined
        }
      />
      <div className="p-6 space-y-5">

        {/* Standup alert */}
        {summary?.stats?.missingStandupsCount > 0 && (
          <Alert
            type="warning"
            message={`Missing today's standup for: ${summary.missingStandups?.map((p: { name: string }) => p.name).join(', ')}`}
          />
        )}

        {/* Role-specific KPI strip */}
        {isPmo && (
          <PmoKpiStrip summary={summary} tenantSlug={slug} tasks={allTasks} />
        )}
        {role === 'DELIVERY_LEAD' && (
          <DeliveryLeadKpiStrip summary={summary} tenantSlug={slug} tasks={allTasks} userId={String(user?.id ?? '')} />
        )}
        {!isManager && (
          <TeamMemberKpiStrip tenantSlug={slug} tasks={allTasks} userId={String(user?.id ?? '')} />
        )}

        {/* Check-in + Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1">
            <CheckInWidget />
          </div>
          <div className="lg:col-span-2">
            <QuickActions tenantSlug={slug} role={role} />
          </div>
        </div>

        {/* Main content — tasks + projects */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <MyTasksWidget userId={String(user?.id ?? '')} tenantSlug={slug} />
          </div>
          <div>
            <ProjectsWidget summary={summary} tenantSlug={slug} />
          </div>
        </div>

        {/* Blockers + Overdue Actions */}
        <BlockersActionsRow summary={summary} tenantSlug={slug} />

        {/* People row: Leave Balance + Badges + Announcements */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <LeaveBalanceWidget tenantSlug={slug} />
          <MyBadgesWidget tenantSlug={slug} />
          <AnnouncementsWidget tenantSlug={slug} />
        </div>

        {/* Manager-only section */}
        {isManager && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <TeamAttendanceWidget tenantSlug={slug} />
            <PendingLeavesWidget tenantSlug={slug} />
          </div>
        )}

        {/* PMO: extra analytics insight strip */}
        {isPmo && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KpiCard
              label="Projects at Risk"
              value={summary?.ragSummary?.RED ?? 0}
              sub="need immediate attention"
              icon={<AlertTriangle size={20} />}
              iconBg={(summary?.ragSummary?.RED ?? 0) > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}
              valueCls={(summary?.ragSummary?.RED ?? 0) > 0 ? 'text-red-700' : 'text-green-700'}
              to={`/${slug}/projects`}
            />
            <KpiCard
              label="Projects On Track"
              value={summary?.ragSummary?.GREEN ?? 0}
              sub="healthy delivery"
              icon={<CheckCheck size={20} />}
              iconBg="bg-green-100 text-green-600"
              valueCls="text-green-700"
              trend="up"
              to={`/${slug}/projects`}
            />
            <KpiCard
              label="Sprint Velocity"
              value={summary?.stats?.avgVelocity ?? '—'}
              sub="avg story points"
              icon={<BarChart size={20} />}
              iconBg="bg-purple-100 text-purple-600"
              valueCls="text-purple-700"
              to={`/${slug}/sprints`}
            />
            <KpiCard
              label="Overdue Actions"
              value={summary?.stats?.overdueActionsCount ?? 0}
              sub="items past due"
              icon={<Timer size={20} />}
              iconBg={(summary?.stats?.overdueActionsCount ?? 0) > 0 ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'}
              valueCls={(summary?.stats?.overdueActionsCount ?? 0) > 0 ? 'text-orange-700' : 'text-gray-500'}
              to={`/${slug}/actions`}
            />
          </div>
        )}

      </div>

      <PerformanceModal
        open={showPerformance}
        onClose={() => setShowPerformance(false)}
        targetUserId={isManager ? undefined : user?.id}
        targetName={isManager ? undefined : user?.name}
      />
    </Layout>
  );
};

export default DashboardPage;
