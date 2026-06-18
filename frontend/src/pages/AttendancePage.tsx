import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Clock, LogIn, LogOut, Home, Users, BarChart2, AlertTriangle, UtensilsCrossed, Coffee, Bot, FileText } from 'lucide-react';
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
import Pagination from '../components/ui/Pagination';
import UserAvatar from '../components/ui/UserAvatar';
import UserPicker from '../components/ui/UserPicker';
import {
  useMyAttendanceRecord,
  useAttendanceLive,
  useAttendanceRecords,
  useAttendanceSummary,
  useAttendanceAnomalies,
  useAttendanceNotCheckedIn,
  useCheckIn,
  useCheckOut,
  useMarkWfh,
  useBreakStart,
  useBreakEnd,
  useWfhRequests,
  useSubmitWfhRequest,
  useApproveWfhRequest,
  useRejectWfhRequest,
  useCancelWfhRequest,
} from '../hooks/usePeople';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission, PERMISSIONS } from '../utils/permissions';
import { attendanceApi } from '../lib/api';
import { useMyPermissions } from '../hooks/useAdmin';
import { Download, CheckCircle, XCircle, Send } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AttendanceRecord {
  id: string;
  date: string;
  status: string;
  checkInTime?: string;
  checkOutTime?: string;
  hoursWorked?: number;
  isWfh?: boolean;
  remoteWorkType?: string;
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

// Permissions that unlock manager-level attendance views (team records, live view, export)
const ATTENDANCE_MANAGER_PERMS = ['ATTENDANCE_ADMIN', 'ATTENDANCE_TEAM_VIEW'];

// ── Tab definitions ───────────────────────────────────────────────────────────

type Tab = 'my' | 'wfh' | 'live' | 'records' | 'summary' | 'report';

// ── IP Config Tab ─────────────────────────────────────────────────────────────


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

// ── History Section (My tab) ──────────────────────────────────────────────────

const HISTORY_DAY_OPTIONS = [7, 14] as const;
type HistoryDays = (typeof HISTORY_DAY_OPTIONS)[number];

const HistorySection = ({ history }: { history: AttendanceRecord[] }) => {
  const { t } = useI18n();
  const [days, setDays] = useState<HistoryDays>(7);

  const cutoff = format(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
  const filtered = history.filter((r) => r.date >= cutoff);

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">{t('attendance.tabs.myRecord')}</h3>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {HISTORY_DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                days === d
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {d} {t('common.days')}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={t('common.noData')} description={t('common.noResults')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 uppercase tracking-wide">{t('common.dueDate')}</th>
                <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 uppercase tracking-wide">{t('common.status')}</th>
                <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 uppercase tracking-wide">{t('dashboard.attendance.labelIn')}</th>
                <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 uppercase tracking-wide">{t('dashboard.attendance.labelOut')}</th>
                <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 uppercase tracking-wide">{t('common.notes')}</th>
                <th className="text-left py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">{t('dashboard.attendance.labelHours')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((rec) => (
                <tr key={rec.id} className="hover:bg-gray-50">
                  <td className="py-2.5 pr-4 text-gray-700">{formatDate(rec.date)}</td>
                  <td className="py-2.5 pr-4">
                    {rec.isWfh && rec.remoteWorkType && rec.remoteWorkType !== 'WFH'
                      ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${remoteTypeBadgeClass(rec.remoteWorkType)}`}>{remoteTypeLabel(rec.remoteWorkType)}</span>
                      : <AttendanceStatusBadge status={rec.status} />}
                  </td>
                  <td className="py-2.5 pr-4 text-gray-600">{formatTime(rec.checkInTime)}</td>
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-600">{formatTime((rec as any).checkOutTime)}</span>
                      {(rec as any).botCheckout && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full" title="Auto checked out by system at 23:59">
                          <Bot size={9} /> Bot
                        </span>
                      )}
                    </div>
                  </td>
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
    </>
  );
};

// ── My Attendance Tab ─────────────────────────────────────────────────────────

const BREAK_ALLOWANCES = { LUNCH: 60, SHORT: 15 };

const MyAttendanceTab = ({ onRequestWfh }: { onRequestWfh?: () => void }) => {
  const { t } = useI18n();
  const [showWfhModal, setShowWfhModal] = useState(false);
  const [actionError, setActionError] = useState('');
  const [, setGpsErrorCode] = useState(0);

  const { data: record, isLoading } = useMyAttendanceRecord();
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const { data: myWfhRequests = [] } = useWfhRequests({ mine: 'true' });
  const todayApprovedWfh = (myWfhRequests as any[]).find((r: any) => {
    if (r.status !== 'APPROVED') return false;
    const from = r.wfhDate ?? r.wfh_date ?? '';
    const to   = r.wfhDateTo ?? r.wfh_date_to ?? from;
    return from <= todayStr && todayStr <= (to || from);
  });
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
    const tick = () => setBreakSecs(Math.max(0, Math.floor((Date.now() - new Date(String(activeBreak.break_start).replace(' ', 'T').replace(/Z?$/, 'Z')).getTime()) / 1000)));
    tick();
    breakTimerRef.current = setInterval(tick, 1000);
    return () => { if (breakTimerRef.current) clearInterval(breakTimerRef.current); };
  }, [activeBreak?.break_start]);

  const activeAllowance  = activeBreak ? (BREAK_ALLOWANCES[activeBreak.break_type as keyof typeof BREAK_ALLOWANCES] ?? 15) : 0;
  const allowanceSecs    = activeAllowance * 60;
  const isOverBreak      = breakSecs > allowanceSecs;
  const remSecs          = Math.max(0, allowanceSecs - breakSecs);
  const remMins          = Math.floor(remSecs / 60);
  const remRemSecs       = remSecs % 60;
  const overTotalSecs    = Math.max(0, breakSecs - allowanceSecs);
  const overDispMins     = Math.floor(overTotalSecs / 60);
  const overDispSecs     = overTotalSecs % 60;
  const fmt2 = (n: number) => String(Math.max(0, Math.floor(n))).padStart(2, '0');

  const clientTime = () => new Date().toLocaleString('sv');
  const handleBreakStart = async (type: 'LUNCH' | 'SHORT') => {
    setActionError('');
    const { coords, errorCode } = await getGpsCoords();
    setGpsErrorCode(errorCode);
    const payload: Record<string, unknown> = { client_time: clientTime(), break_type: type, ...(coords ?? {}) };
    if (!coords) payload.gps_error_code = errorCode;
    console.warn('[BreakStart] payload sent to server:', JSON.stringify(payload));
    breakStart.mutate(payload,
      { onError: (e: any) => setActionError(e?.message ?? t('errors.saveFailed')) });
  };
  const handleBreakEnd = async () => {
    setActionError('');
    const { coords, errorCode } = await getGpsCoords();
    setGpsErrorCode(errorCode);
    const payload: Record<string, unknown> = { client_time: clientTime(), ...(coords ?? {}) };
    if (!coords) payload.gps_error_code = errorCode;
    console.warn('[BreakEnd] payload sent to server:', JSON.stringify(payload));
    breakEnd.mutate(payload,
      { onError: (e: any) => setActionError(e?.message ?? t('errors.saveFailed')) });
  };

  const getGpsCoords = (): Promise<{ coords: { latitude: number; longitude: number } | null; errorCode: number }> => {
    return new Promise((resolve) => {
      console.warn('[GPS] ── starting location request ──────────────────────');
      console.log('[GPS] protocol:', window.location.protocol, '| host:', window.location.host);
      console.log('[GPS] geolocation API:', !!navigator?.geolocation ? 'available' : 'NOT AVAILABLE');

      if (!navigator?.geolocation) {
        console.error('[GPS] navigator.geolocation undefined — browser does not support it or page is not HTTPS');
        resolve({ coords: null, errorCode: 2 });
        return;
      }

      const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (!isSecure) {
        console.error('[GPS] page is HTTP (not HTTPS/localhost) — browser BLOCKS geolocation on non-localhost origins');
      }

      if (navigator.permissions) {
        navigator.permissions.query({ name: 'geolocation' }).then((status) => {
          console.warn('[GPS] permission state:', status.state, status.state === 'denied' ? '← BLOCKED — go to site settings to allow' : '');
        }).catch(() => {});
      }

      const onSuccess = (pos: GeolocationPosition) => {
        const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        const ageMs = Date.now() - pos.timestamp;
        console.warn('[GPS] ✓ position obtained — lat:', coords.latitude, 'lon:', coords.longitude, '| accuracy:', pos.coords.accuracy, 'm | cache age:', Math.round(ageMs / 1000), 's');
        resolve({ coords, errorCode: 0 });
      };

      // Attempt 1: fresh or recently cached position (max 5 min old)
      console.warn('[GPS] attempt 1 — timeout=15s maxAge=5min …');
      navigator.geolocation.getCurrentPosition(
        onSuccess,
        (err) => {
          const reasons: Record<number, string> = { 1: 'PERMISSION_DENIED', 2: 'POSITION_UNAVAILABLE', 3: 'TIMEOUT' };
          console.warn('[GPS] attempt 1 failed:', reasons[err.code] ?? err.message, '(code', err.code + ')');
          if (err.code === 1) {
            console.error('[GPS] location access blocked by user — go to browser site settings and allow location for this page');
            resolve({ coords: null, errorCode: 1 });
            return;
          }
          // Attempt 2: use ANY cached position (even old) — device may have a stale fix from a previous session
          console.warn('[GPS] attempt 2 — using any cached position (maxAge=Infinity) …');
          navigator.geolocation.getCurrentPosition(
            onSuccess,
            (err2) => {
              console.error('[GPS] attempt 2 failed:', reasons[err2.code] ?? err2.message, '(code', err2.code + ')');
              console.error('[GPS] no position available — server will block if geo zone is active');
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
    if (todayApprovedWfh) { handleCheckInWfh(); return; }
    try {
      setActionError('');
      console.warn('[CheckIn] ── check-in button clicked ──────────────────────');
      const { coords, errorCode } = await getGpsCoords();
      setGpsErrorCode(errorCode);
      const payload: Record<string, unknown> = { client_time: new Date().toLocaleString('sv'), ...(coords ?? {}) };
      if (!coords) payload.gps_error_code = errorCode;
      if (coords) {
        console.warn('[CheckIn] GPS coords included in payload → server validates against geo-zones');
      } else {
        console.warn('[CheckIn] no GPS coords (error code', errorCode, ') → server falls back to IP-geo');
      }
      console.warn('[CheckIn] payload sent to server:', JSON.stringify(payload));
      await checkIn.mutateAsync(payload);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  };

  const handleCheckInWfh = async () => {
    try {
      setActionError('');
      const reqType = (todayApprovedWfh?.requestType ?? todayApprovedWfh?.request_type ?? 'WFH').toUpperCase();
      const isLegacyWfh = reqType === 'WFH' || reqType === '';
      await checkIn.mutateAsync({
        client_time: new Date().toLocaleString('sv'),
        is_wfh:      true,
        remote_type: isLegacyWfh ? undefined : reqType,
        wfh_reason:  todayApprovedWfh?.reason ?? '',
      });
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
            <h3 className="text-base font-semibold text-gray-900">{t('attendance.tabs.today')}</h3>
            <p className="text-sm text-gray-500">{format(new Date(), 'EEEE, dd MMMM yyyy')}</p>
          </div>
          <div className="flex items-center gap-1.5">
            {today?.status && <AttendanceStatusBadge status={today.status} />}
            {today?.remoteWorkType && today.remoteWorkType !== 'WFH' && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${remoteTypeBadgeClass(today.remoteWorkType)}`}>
                {remoteTypeLabel(today.remoteWorkType)}
              </span>
            )}
          </div>
        </div>

        {!isCheckedIn && (
          <div className="flex flex-col items-center py-8 gap-4">
            <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
              <LogIn size={28} className="text-green-600" />
            </div>
            <p className="text-sm text-gray-500">{t('attendance.notCheckedIn')}</p>
            <div className="flex flex-wrap gap-2 justify-center">
              <Button
                className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 text-base"
                icon={<LogIn size={18} />}
                loading={checkIn.isPending}
                onClick={handleCheckIn}
              >
                {t('attendance.checkIn')}
              </Button>
              {todayApprovedWfh && (() => {
                const reqType = (todayApprovedWfh.requestType ?? todayApprovedWfh.request_type ?? 'WFH').toUpperCase();
                const label = reqType === 'CLIENT_VISIT' ? 'Client Visit'
                  : reqType === 'FIELD_WORK' ? 'Field Work'
                  : reqType === 'OFFSITE' ? 'Offsite'
                  : t('attendance.status.wfh');
                const btnClass = reqType === 'CLIENT_VISIT'
                  ? 'bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 text-base'
                  : reqType === 'FIELD_WORK' || reqType === 'OFFSITE'
                    ? 'bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 text-base'
                    : 'bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 text-base';
                return (
                  <Button
                    className={btnClass}
                    icon={<Home size={18} />}
                    loading={checkIn.isPending}
                    onClick={handleCheckInWfh}
                  >
                    {t('attendance.checkIn')} ({label})
                  </Button>
                );
              })()}
            </div>
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
                  {isOverBreak ? (
                    <>
                      <p className="text-3xl font-bold font-mono tabular-nums tracking-widest text-red-600">
                        {fmt2(overDispMins)}:{fmt2(overDispSecs)}
                      </p>
                      <p className="text-xs text-red-500 mt-1 font-medium flex items-center justify-center gap-1">
                        <AlertTriangle size={11} /> Over by {overDispMins}m {overDispSecs}s — please return
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-3xl font-bold font-mono tabular-nums tracking-widest text-orange-500">
                        {fmt2(remMins)}:{fmt2(remRemSecs)}
                      </p>
                      <p className="text-xs text-orange-400 mt-1">remaining</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-0.5">{t('dashboard.attendance.timeSinceCheckIn')}</p>
                  <p className="text-3xl font-bold text-green-600 font-mono tabular-nums tracking-widest">{elapsed}</p>
                  <p className="text-xs text-gray-400 mt-1">{t('dashboard.attendance.checkedInAt')} {formatTime(today?.checkInTime)}</p>
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
                {t('attendance.checkOut')}
              </Button>
              {!onBreak && todayApprovedWfh && !today?.isWfh && today?.status !== 'WFH' && (
                <Button variant="outline" icon={<Home size={16} />} onClick={() => setShowWfhModal(true)}>
                  {t('attendance.markWfh')}
                </Button>
              )}
            </div>
          </div>
        )}

        {isDone && (
          <div className="grid grid-cols-3 gap-4">
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-xs text-gray-500 mb-1">{t('dashboard.attendance.labelIn')}</p>
              <p className="font-semibold text-gray-900 text-sm">{formatTime(today?.checkInTime)}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-xs text-gray-500 mb-1">{t('dashboard.attendance.labelOut')}</p>
              <p className="font-semibold text-gray-900 text-sm">{formatTime(today?.checkOutTime)}</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg text-center">
              <p className="text-xs text-gray-500 mb-1">{t('dashboard.attendance.labelHours')}</p>
              <p className="font-semibold text-blue-700 text-sm">{today?.hoursWorked?.toFixed(1) ?? '—'}h</p>
            </div>
          </div>
        )}
      </Card>

      {/* Recent History */}
      <Card>
        <HistorySection history={history} />
      </Card>

      {/* WFH Modal */}
      <Modal open={showWfhModal} onClose={() => { setShowWfhModal(false); reset(); }} title={t('attendance.markWfh')} size="sm">
        <form onSubmit={handleSubmit(handleWfh)} className="space-y-4">
          <div>
            <label className="form-label">{t('attendance.wfhRequest.reason')}</label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="Briefly explain why you're working from home…"
              {...register('reason', { required: t('validation.required') })}
            />
            {errors.reason && <p className="form-error">{errors.reason.message}</p>}
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => { setShowWfhModal(false); reset(); }}>{t('common.cancel')}</Button>
            <Button type="submit" loading={isSubmitting}>{t('common.confirm')}</Button>
          </ModalActions>
        </form>
      </Modal>
    </div>
  );
};

// ── Team Live Tab ─────────────────────────────────────────────────────────────

const LIVE_GRID_PAGE_SIZE = 12;
const LIVE_LIST_PAGE_SIZE = 15;

const TeamLiveTab = () => {
  const { t } = useI18n();
  const { data, isLoading, error } = useAttendanceLive();
  const { data: anomaliesData } = useAttendanceAnomalies();
  const { data: notCheckedInData } = useAttendanceNotCheckedIn();

  const [livePage, setLivePage] = useState(1);
  const [anomalyPage, setAnomalyPage] = useState(1);
  const [notCheckedInPage, setNotCheckedInPage] = useState(1);

  const liveUsers: LiveUser[] = Array.isArray(data) ? (data as unknown as LiveUser[]) : [];

  // Safety net: never show a checked-in user as absent.
  // Use userId (the person), not id (the record ROWID) — a user can have two records
  // on the same day (one ABSENT from the morning cron, one PRESENT from check-in).
  const liveUserIds = new Set(liveUsers.map((u) => String((u as any).userId || u.id)));
  const anomalies: AnomalyUser[] = ((anomaliesData as AnomalyUser[]) ?? []).filter(
    (u) => !liveUserIds.has(String((u as any).userId || u.id))
  );

  // Not-checked-in: backend already subtracts checked-in users; de-duplicate against live list for safety
  const notCheckedIn: { id: string; name: string; email: string; avatarUrl: string }[] =
    ((notCheckedInData as any[]) ?? []).filter((u) => !liveUserIds.has(String(u.userId || u.id)));

  const pagedLiveUsers = liveUsers.slice((livePage - 1) * LIVE_GRID_PAGE_SIZE, livePage * LIVE_GRID_PAGE_SIZE);
  const pagedAnomalies = anomalies.slice((anomalyPage - 1) * LIVE_LIST_PAGE_SIZE, anomalyPage * LIVE_LIST_PAGE_SIZE);
  const pagedNotCheckedIn = notCheckedIn.slice((notCheckedInPage - 1) * LIVE_GRID_PAGE_SIZE, notCheckedInPage * LIVE_GRID_PAGE_SIZE);

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      {error && <Alert type="error" message={(error as Error).message} />}

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">{t('attendance.liveNow')}</h3>
          <Badge variant="success">{liveUsers.length} {t('statuses.checkedIn')}</Badge>
        </div>

        {liveUsers.length === 0 ? (
          <EmptyState title={t('attendance.notCheckedIn')} description={t('dashboard.teamAttendance.notYetCheckedIn')} />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pagedLiveUsers.map((u) => (
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
            <Pagination
              page={livePage}
              totalPages={Math.ceil(liveUsers.length / LIVE_GRID_PAGE_SIZE)}
              total={liveUsers.length}
              pageSize={LIVE_GRID_PAGE_SIZE}
              onPageChange={setLivePage}
              className="mt-4"
            />
          </>
        )}
      </Card>

      {anomalies.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} className="text-red-500" />
            <h3 className="text-sm font-semibold text-gray-900">{t('attendance.anomalies')}</h3>
            <Badge variant="danger">{anomalies.length}</Badge>
          </div>
          <div className="divide-y divide-gray-50">
            {pagedAnomalies.map((u) => (
              <div key={u.id} className="flex items-center gap-3 py-2.5">
                <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size="sm" />
                <p className="text-sm text-gray-700">{u.name}</p>
                <Badge variant="danger" className="ml-auto">{t('attendance.status.absent')}</Badge>
              </div>
            ))}
          </div>
          <Pagination
            page={anomalyPage}
            totalPages={Math.ceil(anomalies.length / LIVE_LIST_PAGE_SIZE)}
            total={anomalies.length}
            pageSize={LIVE_LIST_PAGE_SIZE}
            onPageChange={setAnomalyPage}
            className="mt-4"
          />
        </Card>
      )}

      {notCheckedIn.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Clock size={16} className="text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-900">{t('attendance.notCheckedIn')}</h3>
            <Badge variant="warning">{notCheckedIn.length}</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pagedNotCheckedIn.map((u) => (
              <div key={u.id} className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-100 rounded-lg">
                <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size="md" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-600 truncate">{u.name}</p>
                  <p className="text-xs text-gray-400">{t('attendance.notCheckedIn')}</p>
                </div>
                <span className="ml-auto w-2 h-2 rounded-full bg-gray-300 shrink-0" />
              </div>
            ))}
          </div>
          <Pagination
            page={notCheckedInPage}
            totalPages={Math.ceil(notCheckedIn.length / LIVE_GRID_PAGE_SIZE)}
            total={notCheckedIn.length}
            pageSize={LIVE_GRID_PAGE_SIZE}
            onPageChange={setNotCheckedInPage}
            className="mt-4"
          />
        </Card>
      )}
    </div>
  );
};

// ── Records Tab ───────────────────────────────────────────────────────────────

const RecordsTab = ({ isManager }: { isManager: boolean }) => {
  const { t } = useI18n();
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
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const { data, isLoading, error } = useAttendanceRecords(filterParams);
  const allRecords = useMemo(() => (data as AttendanceRecord[]) ?? [], [data]);
  const totalPages = Math.ceil(allRecords.length / PAGE_SIZE);
  const pagedRecords = allRecords.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
    setPage(1);
  };

  const handleUserSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const uid = e.target.value;
    const uname = userOptions.find(([id]) => id === uid)?.[1] ?? '';
    setSelectedUserId(uid);
    setSelectedUserName(uname);
    setPage(1);
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
      alert(t('errors.saveFailed') + ': ' + (e as Error).message);
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
            <label className="form-label">{t('leave.from')}</label>
            <input type="date" className="form-input" {...register('date_from')} />
          </div>
          <div>
            <label className="form-label">{t('leave.to')}</label>
            <input type="date" className="form-input" {...register('date_to')} />
          </div>
          {isManager && (
            <div>
              <label className="form-label">{t('teams.membersLabel')}</label>
              <select
                className="form-select"
                value={selectedUserId}
                onChange={handleUserSelect}
              >
                <option value="">{t('common.all')} members</option>
                {userOptions.map(([uid, uname]) => (
                  <option key={uid} value={uid}>{uname}</option>
                ))}
              </select>
            </div>
          )}
          <Button type="submit" size="sm">{t('common.apply')}</Button>
          {isManager && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={<Download size={14} />}
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? t('common.loading') : selectedUserId ? `${t('attendance.export')} ${selectedUserName}` : `${t('attendance.export')} ${t('common.all')} CSV`}
            </Button>
          )}
        </form>
      </Card>

      {/* Table */}
      <Card padding={false}>
        {isLoading ? (
          <div className="p-6"><PageSkeleton /></div>
        ) : allRecords.length === 0 ? (
          <EmptyState title={t('common.noResults')} description={t('common.noData')} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-gray-50">
                  <tr>
                    {isManager && <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{t('common.name')}</th>}
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{t('common.dueDate')}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{t('common.status')}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{t('dashboard.attendance.labelIn')}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{t('dashboard.attendance.labelOut')}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{t('dashboard.attendance.labelHours')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pagedRecords.map((rec) => (
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
                      <td className="px-4 py-3">
                        {rec.isWfh && rec.remoteWorkType && rec.remoteWorkType !== 'WFH'
                          ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${remoteTypeBadgeClass(rec.remoteWorkType)}`}>{remoteTypeLabel(rec.remoteWorkType)}</span>
                          : <AttendanceStatusBadge status={rec.status} />}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatTime(rec.checkInTime)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-600">{formatTime(rec.checkOutTime)}</span>
                          {(rec as any).botCheckout && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full" title="Auto checked out by system at 23:59">
                              <Bot size={9} /> Bot
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{rec.hoursWorked?.toFixed(1) ?? '—'}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={allRecords.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              className="px-4 py-3 border-t border-gray-100"
            />
          </>
        )}
      </Card>
    </div>
  );
};

// ── Summary Tab ───────────────────────────────────────────────────────────────

type SummaryMode = 'weekly' | 'monthly';

const SummaryTab = () => {
  const { t } = useI18n();
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
    { label: t('attendance.summary.present'), value: summary?.presentCount ?? 0, color: 'bg-green-500' },
    { label: t('attendance.summary.absent'),  value: summary?.absentCount  ?? 0, color: 'bg-red-500'   },
    { label: t('attendance.summary.wfh'),     value: summary?.wfhCount     ?? 0, color: 'bg-purple-500' },
    { label: t('attendance.summary.late'),    value: summary?.lateCount    ?? 0, color: 'bg-yellow-500' },
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
                    ? 'bg-white dark:bg-gray-600/70 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {m === 'weekly' ? t('common.thisWeek') : t('common.thisMonth')}
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
                <p className="text-xs text-gray-400">{t('common.days')}</p>
              </Card>
            ))}
            <Card>
              <p className="text-xs text-gray-500 mb-1">{t('attendance.summary.totalHours')}</p>
              <p className="text-2xl font-bold text-blue-700">{summary?.totalHours?.toFixed(1) ?? 0}</p>
              <p className="text-xs text-gray-400">hrs</p>
            </Card>
          </div>

          {/* Weekly: day-by-day breakdown */}
          {mode === 'weekly' && (
            <Card>
              <h3 className="text-sm font-semibold text-gray-900 mb-5">{t('attendance.tabs.summary')}</h3>
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
                          {isToday && <span className="text-[10px] font-semibold bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">{t('common.today')}</span>}
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
              <h3 className="text-sm font-semibold text-gray-900 mb-5">{t('attendance.tabs.summary')}</h3>
              <div className="space-y-4">
                {stats.map((s) => {
                  const pct = Math.min(100, (s.value / maxDays) * 100);
                  return (
                    <div key={s.label}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-gray-700">{s.label}</span>
                        <span className="text-sm font-medium text-gray-900">{s.value} {t('common.days')}</span>
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

// ── WFH Requests Tab ─────────────────────────────────────────────────────────

const REMOTE_WORK_TYPES = [
  { value: 'WFH',          label: 'Work From Home',  description: 'Working remotely from home' },
  { value: 'CLIENT_VISIT', label: 'Client Visit',    description: 'At a client location or meeting' },
  { value: 'FIELD_WORK',   label: 'Field Work',      description: 'On-site work outside the office' },
  { value: 'OFFSITE',      label: 'Offsite',         description: 'Team offsite, conference, or travel' },
] as const;

interface WfhRequestForm {
  date_from: string;
  date_to: string;
  reason: string;
  request_type: string;
}

interface RejectForm {
  reviewer_notes: string;
}

const wfhStatusVariant = (status: string): 'success' | 'danger' | 'warning' | 'gray' => {
  const map: Record<string, 'success' | 'danger' | 'warning' | 'gray'> = {
    APPROVED: 'success',
    REJECTED: 'danger',
    PENDING: 'warning',
    CANCELLED: 'gray',
  };
  return map[status] ?? 'gray';
};

const remoteTypeLabel = (type: string): string => {
  const map: Record<string, string> = {
    WFH: 'WFH', CLIENT_VISIT: 'Client Visit', FIELD_WORK: 'Field Work', OFFSITE: 'Offsite',
  };
  return map[String(type).toUpperCase()] ?? 'WFH';
};

const remoteTypeBadgeClass = (type: string): string => {
  const t = String(type).toUpperCase();
  if (t === 'CLIENT_VISIT') return 'bg-purple-100 text-purple-700 border border-purple-200';
  if (t === 'FIELD_WORK')   return 'bg-orange-100 text-orange-700 border border-orange-200';
  if (t === 'OFFSITE')      return 'bg-orange-100 text-orange-700 border border-orange-200';
  return 'bg-blue-100 text-blue-700 border border-blue-200';
};

const WFH_PAGE_SIZE = 10;
const WFH_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;

const WfhRequestsTab = ({ highlightId = '' }: { highlightId?: string }) => {
  const { t } = useI18n();
  const [wfhSubTab, setWfhSubTab] = useState<'my' | 'team'>('my');
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [myPage, setMyPage] = useState(1);
  const [teamPage, setTeamPage] = useState(1);
  const [myStatusFilter, setMyStatusFilter] = useState('');
  const [teamStatusFilter, setTeamStatusFilter] = useState('');

  const { data: myRequests = [], isLoading: myLoading } = useWfhRequests({ mine: 'true' });
  const { data: teamRequests = [], isLoading: teamLoading } = useWfhRequests({ team: 'true' });

  const hasTeam = !teamLoading && (teamRequests as any[]).length > 0;
  const pendingTeam = (teamRequests as any[]).filter((r: any) => r.status === 'PENDING').length;

  const filteredMyRequests = myStatusFilter
    ? (myRequests as any[]).filter((r: any) => r.status === myStatusFilter)
    : (myRequests as any[]);
  const filteredTeamRequests = teamStatusFilter
    ? (teamRequests as any[]).filter((r: any) => r.status === teamStatusFilter)
    : (teamRequests as any[]);

  const pagedMyRequests = filteredMyRequests.slice((myPage - 1) * WFH_PAGE_SIZE, myPage * WFH_PAGE_SIZE);
  const pagedTeamRequests = filteredTeamRequests.slice((teamPage - 1) * WFH_PAGE_SIZE, teamPage * WFH_PAGE_SIZE);

  // When the page was opened from a WFH notification, switch to the right
  // sub-tab, clear the status filter and jump to the correct page.
  const highlightRef = React.useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!highlightId || myLoading || teamLoading) return;
    const myIdx = (myRequests as any[]).findIndex((r: any) => String(r.id) === String(highlightId));
    if (myIdx !== -1) {
      setWfhSubTab('my');
      setMyStatusFilter('');
      setMyPage(Math.ceil((myIdx + 1) / WFH_PAGE_SIZE));
      return;
    }
    const teamIdx = (teamRequests as any[]).findIndex((r: any) => String(r.id) === String(highlightId));
    if (teamIdx !== -1) {
      setWfhSubTab('team');
      setTeamStatusFilter('');
      setTeamPage(Math.ceil((teamIdx + 1) / WFH_PAGE_SIZE));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, myLoading, teamLoading]);
  useEffect(() => {
    if (!highlightId || myLoading || teamLoading) return;
    const timer = setTimeout(() => {
      highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
    return () => clearTimeout(timer);
  }, [highlightId, myLoading, teamLoading]);

  const submitWfh  = useSubmitWfhRequest();
  const approveWfh = useApproveWfhRequest();
  const rejectWfh  = useRejectWfhRequest();
  const cancelWfh  = useCancelWfhRequest();

  const {
    register: registerSubmit, handleSubmit: handleSubmitForm, reset: resetSubmit,
    watch: watchSubmit,
    formState: { errors: submitErrors, isSubmitting: submitPending },
  } = useForm<WfhRequestForm>({ defaultValues: { date_from: format(new Date(), 'yyyy-MM-dd'), date_to: format(new Date(), 'yyyy-MM-dd'), request_type: 'WFH' } });
  // Watch the start date so the End-date validator can compare against it
  const wfhDateFrom = watchSubmit('date_from');
  // Today (local) — used as the floor so users can't request WFH for a date
  // that has already passed.
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const {
    register: registerReject, handleSubmit: handleRejectForm, reset: resetReject,
    formState: { errors: rejectErrors, isSubmitting: rejectPending },
  } = useForm<RejectForm>();

  const handleSubmitRequest = async (data: WfhRequestForm) => {
    try {
      setActionError('');
      await submitWfh.mutateAsync(data);
      resetSubmit();
      setShowSubmitModal(false);
    } catch (e: any) { setActionError(e?.message ?? t('errors.saveFailed')); }
  };

  const handleApprove = async (id: string) => {
    try {
      setActionError('');
      await approveWfh.mutateAsync({ id });
    } catch (e: any) { setActionError(e?.message ?? t('errors.saveFailed')); }
  };

  const handleReject = async (data: RejectForm) => {
    if (!rejectTarget) return;
    try {
      setActionError('');
      await rejectWfh.mutateAsync({ id: rejectTarget, data });
      setRejectTarget(null);
      resetReject();
    } catch (e: any) { setActionError(e?.message ?? t('errors.saveFailed')); }
  };

  const handleCancel = async (id: string) => {
    try {
      setActionError('');
      await cancelWfh.mutateAsync(id);
    } catch (e: any) { setActionError(e?.message ?? t('errors.saveFailed')); }
  };

  // Status filter chip bar
  const StatusFilterBar = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        onClick={() => onChange('')}
        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
          value === '' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
        }`}
      >{t('common.all')}</button>
      {WFH_STATUSES.map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
            value === s
              ? s === 'PENDING'   ? 'bg-amber-500 text-white border-amber-500'
              : s === 'APPROVED'  ? 'bg-green-600 text-white border-green-600'
              : s === 'REJECTED'  ? 'bg-red-600 text-white border-red-600'
              :                     'bg-gray-400 text-white border-gray-400'
              : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
          }`}
        >{s.charAt(0) + s.slice(1).toLowerCase()}</button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {actionError && <Alert type="error" message={actionError} />}

      {/* Sub-tab bar + Request WFH button */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setWfhSubTab('my')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              wfhSubTab === 'my' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t('leave.tabs.myRequests')}
            {(myRequests as any[]).length > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                wfhSubTab === 'my' ? 'bg-gray-100 text-gray-600' : 'bg-gray-200 text-gray-500'
              }`}>{(myRequests as any[]).length}</span>
            )}
          </button>
          {(teamLoading || hasTeam) && (
            <button
              onClick={() => setWfhSubTab('team')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                wfhSubTab === 'team' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Users size={13} />
              {t('leave.tabs.team')}
              {pendingTeam > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700">{pendingTeam}</span>
              )}
            </button>
          )}
        </div>
        <Button size="sm" icon={<Send size={13} />} onClick={() => setShowSubmitModal(true)}>New Request</Button>
      </div>

      {/* My Requests panel */}
      {wfhSubTab === 'my' && (
        <Card>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <p className="text-xs text-gray-500">{t('attendance.wfhRequest.pending')}</p>
            <StatusFilterBar value={myStatusFilter} onChange={(v) => { setMyStatusFilter(v); setMyPage(1); }} />
          </div>
          {myLoading ? <PageSkeleton /> : filteredMyRequests.length === 0 ? (
            <EmptyState
              title={myStatusFilter ? `No ${myStatusFilter.toLowerCase()} requests` : t('attendance.wfhRequest.title')}
              description={myStatusFilter ? t('common.noResults') : t('common.noData')}
            />
          ) : (
            <>
              <div className="space-y-2">
                {pagedMyRequests.map((req: any) => {
                  const isHighlight = highlightId && String(req.id) === String(highlightId);
                  return (
                    <div
                      key={req.id}
                      ref={isHighlight ? highlightRef : undefined}
                      className={`flex items-center justify-between px-3 py-3 rounded-xl border transition-all ${
                        isHighlight
                          ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-300 ring-offset-1 animate-pulse'
                          : 'bg-gray-50 border-gray-100'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="text-sm font-medium text-gray-800">
                            {(req.wfhDateTo ?? req.wfh_date_to) && (req.wfhDateTo ?? req.wfh_date_to) !== (req.wfhDate ?? req.wfh_date)
                              ? `${formatDate(req.wfhDate ?? req.wfh_date)} – ${formatDate(req.wfhDateTo ?? req.wfh_date_to)}`
                              : formatDate(req.wfhDate ?? req.wfh_date)}
                          </p>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${remoteTypeBadgeClass(req.requestType ?? req.request_type ?? 'WFH')}`}>
                            {remoteTypeLabel(req.requestType ?? req.request_type ?? 'WFH')}
                          </span>
                          <Badge variant={wfhStatusVariant(req.status)}>{req.status}</Badge>
                        </div>
                        <p className="text-xs text-gray-500 truncate">{req.reason}</p>
                        {(req.reviewerNotes ?? req.reviewer_notes) && (
                          <p className="text-xs text-red-500 mt-0.5">Note: {req.reviewerNotes ?? req.reviewer_notes}</p>
                        )}
                      </div>
                      {req.status === 'PENDING' && (
                        <button
                          onClick={() => handleCancel(String(req.id))}
                          disabled={cancelWfh.isPending}
                          className="ml-3 p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                          title={t('leave.cancel')}
                        >
                          <XCircle size={15} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <Pagination
                page={myPage}
                totalPages={Math.ceil(filteredMyRequests.length / WFH_PAGE_SIZE)}
                total={filteredMyRequests.length}
                pageSize={WFH_PAGE_SIZE}
                onPageChange={setMyPage}
                className="mt-4"
              />
            </>
          )}
        </Card>
      )}

      {/* Team Requests panel */}
      {wfhSubTab === 'team' && (
        <Card>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <p className="text-xs text-gray-500">{t('dashboard.teamAttendance.title')}</p>
            <StatusFilterBar value={teamStatusFilter} onChange={(v) => { setTeamStatusFilter(v); setTeamPage(1); }} />
          </div>
          {teamLoading ? <PageSkeleton /> : filteredTeamRequests.length === 0 ? (
            <EmptyState
              title={teamStatusFilter ? `No ${teamStatusFilter.toLowerCase()} requests` : t('common.noData')}
              description={teamStatusFilter ? t('common.noResults') : t('common.noResults')}
            />
          ) : (
            <>
              <div className="space-y-2">
                {pagedTeamRequests.map((req: any) => {
                  const isHighlight = highlightId && String(req.id) === String(highlightId);
                  return (
                    <div
                      key={req.id}
                      ref={isHighlight ? highlightRef : undefined}
                      className={`flex items-center justify-between px-3 py-3 rounded-xl border transition-all ${
                        isHighlight
                          ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-300 ring-offset-1 animate-pulse'
                          : 'bg-gray-50 border-gray-100'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="text-sm font-medium text-gray-800">{req.userName ?? req.user_name ?? '—'}</p>
                          <span className="text-gray-300 text-xs">·</span>
                          <p className="text-sm text-gray-600">
                            {(req.wfhDateTo ?? req.wfh_date_to) && (req.wfhDateTo ?? req.wfh_date_to) !== (req.wfhDate ?? req.wfh_date)
                              ? `${formatDate(req.wfhDate ?? req.wfh_date)} – ${formatDate(req.wfhDateTo ?? req.wfh_date_to)}`
                              : formatDate(req.wfhDate ?? req.wfh_date)}
                          </p>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${remoteTypeBadgeClass(req.requestType ?? req.request_type ?? 'WFH')}`}>
                            {remoteTypeLabel(req.requestType ?? req.request_type ?? 'WFH')}
                          </span>
                          <Badge variant={wfhStatusVariant(req.status)}>{req.status}</Badge>
                        </div>
                        <p className="text-xs text-gray-500 truncate">{req.reason}</p>
                      </div>
                      {req.status === 'PENDING' && (
                        <div className="flex items-center gap-1 ml-3">
                          <button
                            onClick={() => handleApprove(String(req.id))}
                            disabled={approveWfh.isPending}
                            className="p-1.5 rounded-lg text-green-500 hover:text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50"
                            title={t('leave.approve')}
                          >
                            <CheckCircle size={16} />
                          </button>
                          <button
                            onClick={() => setRejectTarget(String(req.id))}
                            className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title={t('leave.reject')}
                          >
                            <XCircle size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <Pagination
                page={teamPage}
                totalPages={Math.ceil(filteredTeamRequests.length / WFH_PAGE_SIZE)}
                total={filteredTeamRequests.length}
                pageSize={WFH_PAGE_SIZE}
                onPageChange={setTeamPage}
                className="mt-4"
              />
            </>
          )}
        </Card>
      )}

      {/* Submit WFH Request Modal */}
      <Modal open={showSubmitModal} onClose={() => { setShowSubmitModal(false); resetSubmit(); }} title="Remote Work Request" size="sm">
        <form onSubmit={handleSubmitForm(handleSubmitRequest)} className="space-y-4">
          <div>
            <label className="form-label">Request Type</label>
            <select className="form-input" {...registerSubmit('request_type', { required: true })}>
              {REMOTE_WORK_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label} — {t.description}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">{t('leave.from')}</label>
              <input
                type="date"
                className="form-input"
                min={todayStr}
                {...registerSubmit('date_from', {
                  required: t('validation.required'),
                  validate: (v) => (v && v >= todayStr) || t('validation.pastDate'),
                })}
              />
              {submitErrors.date_from && <p className="form-error">{submitErrors.date_from.message}</p>}
            </div>
            <div>
              <label className="form-label">{t('leave.to')}</label>
              <input
                type="date"
                className="form-input"
                // Lower bound = the currently-selected start date, so the
                // browser's date picker won't even offer earlier days.
                min={wfhDateFrom || todayStr}
                {...registerSubmit('date_to', {
                  required: t('validation.required'),
                  validate: (v) => {
                    if (!v) return t('validation.required');
                    if (wfhDateFrom && v < wfhDateFrom) return t('validation.invalidDate');
                    return true;
                  },
                })}
              />
              {submitErrors.date_to && <p className="form-error">{submitErrors.date_to.message}</p>}
            </div>
          </div>
          <div>
            <label className="form-label">Reason</label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="Briefly explain the purpose of this request…"
              {...registerSubmit('reason', { required: t('validation.required') })}
            />
            {submitErrors.reason && <p className="form-error">{submitErrors.reason.message}</p>}
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => { setShowSubmitModal(false); resetSubmit(); }}>{t('common.cancel')}</Button>
            <Button type="submit" icon={<Send size={13} />} loading={submitPending}>Submit Request</Button>
          </ModalActions>
        </form>
      </Modal>

      {/* Reject WFH Request Modal */}
      <Modal open={!!rejectTarget} onClose={() => { setRejectTarget(null); resetReject(); }} title={t('leave.reject')} size="sm">
        <form onSubmit={handleRejectForm(handleReject)} className="space-y-4">
          <div>
            <label className="form-label">{t('attendance.wfhRequest.reason')}</label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="Provide a reason so the employee can resubmit if needed…"
              {...registerReject('reviewer_notes', { required: t('validation.required') })}
            />
            {rejectErrors.reviewer_notes && <p className="form-error">{rejectErrors.reviewer_notes.message}</p>}
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => { setRejectTarget(null); resetReject(); }}>{t('common.cancel')}</Button>
            <Button variant="danger" type="submit" icon={<XCircle size={13} />} loading={rejectPending}>{t('leave.reject')}</Button>
          </ModalActions>
        </form>
      </Modal>
    </div>
  );
};

// ── Report Tab ────────────────────────────────────────────────────────────────

interface ReportRow {
  userId: string;
  name: string;
  email: string;
  working_days: number;
  present_days: number;
  wfh_days: number;
  late_days: number;
  absent_days: number;
  calendar_absent: number;
  half_days: number;
  on_leave_days: number;
  leave_days: number;
  total_hours: number;
  avg_hours_per_day: number;
  excess_lunch_breaks: number;
  total_lunch_excess_min: number;
  excess_short_breaks: number;
  total_short_excess_min: number;
}

const ReportTab = ({ isManager }: { isManager: boolean }) => {
  const { t } = useI18n();
  const today    = format(new Date(), 'yyyy-MM-dd');
  const monthAgo = format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');

  const [dateFrom, setDateFrom]           = useState(monthAgo);
  const [dateTo, setDateTo]               = useState(today);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedUserName, setSelectedUserName] = useState('');
  const [report, setReport]               = useState<ReportRow[]>([]);
  const [loading, setLoading]             = useState(false);
  const [downloading, setDownloading]     = useState(false);
  const [error, setError]                 = useState('');
  const [generated, setGenerated]         = useState(false);
  const [userOptions, setUserOptions]     = useState<[string, string][]>([]);
  const [progress, setProgress]           = useState(0);
  const [progressMsg, setProgressMsg]     = useState('');
  const progressRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const PROGRESS_STEPS = [
    { pct: 10, msg: 'Fetching team members…'        },
    { pct: 25, msg: 'Loading attendance records…'   },
    { pct: 42, msg: 'Calculating working days…'     },
    { pct: 58, msg: 'Analysing leave data…'         },
    { pct: 72, msg: 'Checking break allowances…'    },
    { pct: 84, msg: 'Compiling report data…'        },
    { pct: 91, msg: 'Preparing your report…'        },
    { pct: 96, msg: 'Almost ready…'                 },
  ];

  const startProgress = () => {
    setProgress(0);
    setProgressMsg(PROGRESS_STEPS[0].msg);
    let stepIdx = 0;
    progressRef.current = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, PROGRESS_STEPS.length - 1);
      setProgress(PROGRESS_STEPS[stepIdx].pct);
      setProgressMsg(PROGRESS_STEPS[stepIdx].msg);
    }, 900);
  };

  const finishProgress = (cb: () => void) => {
    if (progressRef.current) clearInterval(progressRef.current);
    setProgress(100);
    setProgressMsg('Report ready!');
    setTimeout(cb, 400);
  };

  const fetchReport = async () => {
    if (!dateFrom || !dateTo) { setError(t('validation.required')); return; }
    setError('');
    setLoading(true);
    startProgress();
    try {
      const params: Record<string, string> = { date_from: dateFrom, date_to: dateTo };
      const data = await attendanceApi.attendanceReport(params);
      const rows: ReportRow[] = data?.report ?? [];
      finishProgress(() => {
        setReport(rows);
        setGenerated(true);
        if (isManager && rows.length > 0) {
          const opts: [string, string][] = rows.map((r) => [r.userId, r.name]);
          opts.sort((a, b) => a[1].localeCompare(b[1]));
          setUserOptions(opts);
        }
        setSelectedUserId('');
        setSelectedUserName('');
        setLoading(false);
      });
    } catch (e) {
      if (progressRef.current) clearInterval(progressRef.current);
      setError((e as Error).message || t('errors.loadFailed'));
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const params: Record<string, string> = { date_from: dateFrom, date_to: dateTo };
      if (selectedUserId) params.user_id = selectedUserId;
      const blob = await attendanceApi.exportAttendanceReport(params);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      const slug = selectedUserName ? selectedUserName.replace(/\s+/g, '_') : 'all_users';
      a.download = `${slug}_attendance_report_${dateFrom}_to_${dateTo}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(t('errors.saveFailed') + ': ' + (e as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  const handleUserSelect = (uid: string) => {
    const uname = userOptions.find(([id]) => id === uid)?.[1] ?? '';
    setSelectedUserId(uid);
    setSelectedUserName(uname);
  };

  const userPickerOptions = React.useMemo(
    () => userOptions.map(([id, name]) => ({ id, name })),
    [userOptions]
  );

  // Client-side filter: selecting a user narrows the view instantly (no re-fetch)
  const displayedReport = selectedUserId
    ? report.filter((r) => r.userId === selectedUserId)
    : report;

  // Summary stat cards derived from the currently displayed (possibly filtered) rows
  const totalUsers       = displayedReport.length;
  const totalPresent     = displayedReport.reduce((s, r) => s + r.present_days, 0);
  const totalAbsent      = displayedReport.reduce((s, r) => s + (r.calendar_absent ?? r.absent_days), 0);
  const totalLate        = displayedReport.reduce((s, r) => s + r.late_days, 0);
  const totalWorkingDays = displayedReport.reduce((s, r) => s + (r.working_days ?? 0), 0);
  // Working days for the period (same for all users in one org — use avg to handle
  // edge cases where different locations have slightly different holiday counts)
  const periodWorkingDays = totalUsers > 0 ? Math.round(totalWorkingDays / totalUsers) : 0;
  // Avg absent per person — more meaningful than team-wide total for the headline card
  const avgAbsent        = totalUsers > 0 ? +(totalAbsent / totalUsers).toFixed(1) : 0;
  const usersWithExcess  = displayedReport.filter((r) => r.excess_lunch_breaks > 0 || r.excess_short_breaks > 0).length;

  return (
    <div className="space-y-5">
      {/* Filter row */}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="form-label">{t('leave.from')} <span className="text-red-500">*</span></label>
            <input type="date" className="form-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="form-label">{t('leave.to')} <span className="text-red-500">*</span></label>
            <input type="date" className="form-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          {isManager && userOptions.length > 0 && (
            <div>
              <label className="form-label">Member</label>
              <UserPicker
                users={userPickerOptions}
                value={selectedUserId}
                onChange={handleUserSelect}
                placeholder="All members"
                allowEmpty
              />
            </div>
          )}
          <Button type="button" size="sm" onClick={fetchReport} disabled={loading}>
            {loading ? 'Generating…' : t('reports.generate')}
          </Button>
          {generated && report.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={<Download size={14} />}
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? t('common.loading') : selectedUserId ? `Export ${selectedUserName}` : 'Export All CSV'}
            </Button>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </Card>

      {/* ── Progress loader ── */}
      {loading && (
        <Card>
          <div className="py-8 px-6 flex flex-col items-center gap-5">
            {/* Spinner + message */}
            <div className="flex items-center gap-3">
              <svg className="animate-spin h-5 w-5 text-blue-500 shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              <span className="text-sm font-medium text-ds-text">{progressMsg}</span>
            </div>

            {/* Progress bar */}
            <div className="w-full max-w-md">
              <div className="flex justify-between text-xs text-ds-text-muted mb-1.5">
                <span>Preparing the report</span>
                <span className="font-semibold text-blue-600">{progress}%</span>
              </div>
              <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${progress}%`,
                    background: progress === 100
                      ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                      : 'linear-gradient(90deg, #3b82f6, #6366f1)',
                  }}
                />
              </div>
            </div>

            <p className="text-xs text-ds-text-muted">This may take a moment for large teams</p>
          </div>
        </Card>
      )}

      {!loading && generated && (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              {
                label: isManager ? 'Team Members' : 'Users',
                value: totalUsers,
                sub: 'in this report',
                color: 'text-gray-900',
              },
              {
                label: 'Working Days',
                value: periodWorkingDays,
                sub: 'per person this period',
                color: 'text-gray-700',
              },
              {
                label: 'Present Days',
                value: totalPresent,
                sub: totalUsers > 1 ? `avg ${+(totalPresent / totalUsers).toFixed(1)} / person` : 'days',
                color: 'text-green-700',
              },
              {
                label: 'Absent Days',
                value: avgAbsent,
                sub: `avg / person  (${totalAbsent} total)`,
                color: avgAbsent >= periodWorkingDays * 0.5 ? 'text-red-600' : 'text-yellow-600',
              },
              {
                label: 'Late Check-ins',
                value: totalLate,
                sub: totalUsers > 1 ? `avg ${+(totalLate / totalUsers).toFixed(1)} / person` : 'check-ins',
                color: totalLate === 0 ? 'text-green-600' : totalLate >= 10 ? 'text-red-600' : 'text-yellow-600',
              },
              {
                label: 'Excess Breaks',
                value: `${usersWithExcess}`,
                sub: `user${usersWithExcess !== 1 ? 's' : ''} exceeded limit`,
                color: usersWithExcess > 0 ? 'text-orange-600' : 'text-gray-400',
              },
            ].map((s) => (
              <Card key={s.label} className="text-center">
                <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{s.sub}</p>
              </Card>
            ))}
          </div>

          {/* Report Table */}
          {displayedReport.length === 0 ? (
            <EmptyState title={t('common.noData')} description={t('common.noResults')} />
          ) : (
            <Card padding={false}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide sticky left-0 bg-gray-50 z-10">{t('common.name')}</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Work Days</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('attendance.summary.present')}</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('attendance.status.wfh')}</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('attendance.status.late')}</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Absent</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('attendance.status.halfDay')}</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('leave.title')}</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('attendance.summary.totalHours')}</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Avg Hrs</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-orange-500 uppercase tracking-wide">Excess Breaks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {displayedReport.map((row) => {
                      const hasExcess   = row.excess_lunch_breaks > 0 || row.excess_short_breaks > 0;
                      const absentCount = row.calendar_absent ?? row.absent_days;
                      const lateColor   = row.late_days === 0
                        ? 'text-gray-300'
                        : row.late_days < 3
                          ? 'font-semibold text-green-600'
                          : 'font-semibold text-red-600';
                      return (
                        <tr key={row.userId} className={`hover:bg-gray-50 transition-colors ${hasExcess ? 'bg-orange-50/30' : ''}`}>
                          <td className="px-4 py-3 sticky left-0 bg-inherit z-10">
                            <div>
                              <p className="font-medium text-gray-900">{row.name}</p>
                              <p className="text-xs text-gray-400">{row.email}</p>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className="text-xs font-medium text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{row.working_days ?? '—'}</span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className="font-semibold text-green-700">{row.present_days}</span>
                          </td>
                          <td className="px-3 py-3 text-center text-blue-600">{row.wfh_days || '—'}</td>
                          <td className="px-3 py-3 text-center">
                            <span className={lateColor}>
                              {row.late_days > 0 ? row.late_days : '—'}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            {absentCount > 0
                              ? <span className="font-medium text-red-600">{absentCount}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-3 text-center text-gray-500">{row.half_days || '—'}</td>
                          <td className="px-3 py-3 text-center">
                            {row.leave_days > 0
                              ? <span className="text-indigo-600 font-medium">{row.leave_days}d</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-3 text-center font-medium text-gray-700">{row.total_hours}h</td>
                          <td className="px-3 py-3 text-center text-gray-500">{row.avg_hours_per_day}h</td>
                          <td className="px-3 py-3 text-center">
                            {hasExcess ? (
                              <div className="flex flex-col gap-0.5 items-center text-xs">
                                {row.excess_lunch_breaks > 0 && (
                                  <span className="text-orange-600 font-medium">
                                    Lunch: {row.excess_lunch_breaks}x (+{row.total_lunch_excess_min}m)
                                  </span>
                                )}
                                {row.excess_short_breaks > 0 && (
                                  <span className="text-orange-500">
                                    Short: {row.excess_short_breaks}x (+{row.total_short_excess_min}m)
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400 flex items-center gap-3 flex-wrap">
                <span>Period: {dateFrom} → {dateTo}</span>
                {selectedUserId
                  ? <span className="font-medium text-gray-600">· {selectedUserName}</span>
                  : <span>· {report.length} members</span>
                }
                <span className="ml-auto text-xs text-gray-300">Absent = calendar working days not accounted by present/leave</span>
              </div>
            </Card>
          )}
        </>
      )}

      {!generated && !loading && (
        <EmptyState
          title="Attendance Report"
          description="Select a date range and click Generate Report to view attendance data"
        />
      )}
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const AttendancePage = () => {
  const { t } = useI18n();
  useParams<{ tenantSlug: string }>();
  const { user } = useAuth();
  const { data: myPerms } = useMyPermissions();
  const effectivePerms: string[] = myPerms?.permissions ?? [];
  const isManager   = hasPermission(user, PERMISSIONS.ATTENDANCE_ADMIN) ||
    hasPermission(user, PERMISSIONS.ATTENDANCE_TEAM_VIEW) ||
    ATTENDANCE_MANAGER_PERMS.some((p) => effectivePerms.includes(p));
  const canManageIp = hasPermission(user, PERMISSIONS.IP_CONFIG_WRITE);

  // Deep-link support: ?tab=wfh&requestId=X (e.g. user clicked a WFH
  // notification in the bell). We read the URL once on mount, switch to the
  // requested tab, and pass the requestId down so the matching row can
  // highlight + scroll into view. Params are then stripped so refresh/back
  // doesn't re-apply them.
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab     = (searchParams.get('tab') as Tab) || 'my';
  const initialFocusId = searchParams.get('requestId') || '';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [highlightWfhId] = useState<string>(initialFocusId);

  useEffect(() => {
    if (searchParams.get('tab') || searchParams.get('requestId')) {
      const next = new URLSearchParams(searchParams);
      next.delete('tab');
      next.delete('requestId');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canReport = hasPermission(user, PERMISSIONS.ATTENDANCE_ADMIN) ||
    hasPermission(user, PERMISSIONS.ATTENDANCE_REPORT) ||
    hasPermission(user, PERMISSIONS.ATTENDANCE_TEAM_VIEW) ||
    effectivePerms.includes('ATTENDANCE_ADMIN') ||
    effectivePerms.includes('ATTENDANCE_REPORT') ||
    effectivePerms.includes('ATTENDANCE_TEAM_VIEW');

  const tabs: { id: Tab; label: string; icon: React.ReactNode; managerOnly?: boolean; ipOnly?: boolean; reportOnly?: boolean }[] = [
    { id: 'my',        label: t('attendance.tabs.today'),    icon: <Clock size={15} /> },
    { id: 'wfh',       label: t('attendance.tabs.wfh'),      icon: <Home size={15} /> },
    { id: 'live',      label: t('attendance.liveNow'),       icon: <Users size={15} />,       managerOnly: true },
    { id: 'records',   label: t('attendance.tabs.team'),     icon: <BarChart2 size={15} /> },
    { id: 'summary',   label: t('attendance.tabs.summary'),  icon: <BarChart2 size={15} /> },
    { id: 'report',    label: t('reports.title'),            icon: <FileText size={15} />,    reportOnly: true },
  ];

  const visibleTabs = tabs.filter((t) => {
    if (t.managerOnly && !isManager) return false;
    if (t.ipOnly && !canManageIp) return false;
    if (t.reportOnly && !canReport) return false;
    return true;
  });

  return (
    <Layout>
      <Header title={t('attendance.title')} subtitle={t('attendance.checkedIn')} />

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
        {tab === 'my' && <MyAttendanceTab onRequestWfh={() => setTab('wfh')} />}
        {tab === 'wfh' && <WfhRequestsTab highlightId={highlightWfhId} />}
        {tab === 'live' && isManager && <TeamLiveTab />}
        {tab === 'records' && <RecordsTab isManager={isManager} />}
        {tab === 'summary' && <SummaryTab />}
        {tab === 'report' && canReport && <ReportTab isManager={isManager} />}
      </div>
    </Layout>
  );
};

export default AttendancePage;
