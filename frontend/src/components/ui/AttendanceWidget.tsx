import React, { useState, useEffect, useRef } from 'react';
import { LogIn, LogOut, Coffee, Clock, Home, UtensilsCrossed, AlertTriangle } from 'lucide-react';
import {
  useMyAttendanceRecord,
  useCheckIn,
  useCheckOut,
  useBreakStart,
  useBreakEnd,
  useWfhRequests,
} from '../../hooks/usePeople';
import { useAuth } from '../../contexts/AuthContext';

const fmt2 = (n: number) => String(Math.max(0, Math.floor(n))).padStart(2, '0');
const fmtMins = (totalMins: number) => {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const ALLOWANCES = { LUNCH: 60, SHORT: 15 };

const AttendanceWidget: React.FC = () => {
  const { user } = useAuth();
  const { data: record } = useMyAttendanceRecord();
  const checkIn    = useCheckIn();
  const checkOut   = useCheckOut();
  const breakStart = useBreakStart();
  const breakEnd   = useBreakEnd();

  const today         = record?.today as any;
  const isCheckedIn   = !!(today?.checkInTime  ?? today?.check_in_time);
  const isCheckedOut  = !!(today?.checkOutTime ?? today?.check_out_time);
  const isWorking     = isCheckedIn && !isCheckedOut;

  const breakSummary  = today?.breakSummary ?? today?.break_summary ?? null;
  const lunchInfo     = breakSummary?.lunch  ?? { allowance_minutes: 60,  used_minutes: 0, exceeded_minutes: 0, remaining_minutes: 60,  active: null };
  const shortInfo     = breakSummary?.short  ?? { allowance_minutes: 15,  used_minutes: 0, exceeded_minutes: 0, remaining_minutes: 15,  active: null };

  const activeBreak   = lunchInfo.active ?? shortInfo.active ?? null;
  const onBreak       = !!activeBreak;

  // Work elapsed timer — ticks every second, shows HH:MM:SS
  const [elapsed, setElapsed] = useState('');
  const workRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (workRef.current) clearInterval(workRef.current);
    const ciTime = today?.checkInTime ?? today?.check_in_time;
    if (!isWorking || !ciTime) { setElapsed(''); return; }
    // Stored time is UTC — append 'Z' so it's always parsed as UTC regardless of browser timezone
    const ciMs = new Date(String(ciTime).replace(' ', 'T').replace(/Z?$/, 'Z')).getTime();
    const calc = () => {
      const diff = Math.max(0, Date.now() - ciMs);
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setElapsed(`${fmt2(h)}:${fmt2(m)}:${fmt2(s)}`);
    };
    calc();
    workRef.current = setInterval(calc, 1000);
    return () => { if (workRef.current) clearInterval(workRef.current); };
  }, [isWorking, today?.checkInTime, today?.check_in_time]);

  // Active break timer — count up from break_start
  const [breakSecs, setBreakSecs] = useState(0);
  const breakRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (breakRef.current) clearInterval(breakRef.current);
    if (!activeBreak?.break_start) { setBreakSecs(0); return; }
    // Stored time is UTC — append 'Z' for correct parsing regardless of browser timezone
    const tick = () => setBreakSecs(Math.max(0, Math.floor((Date.now() - new Date(String(activeBreak.break_start).replace(' ', 'T').replace(/Z?$/, 'Z')).getTime()) / 1000)));
    tick();
    breakRef.current = setInterval(tick, 1000);
    return () => { if (breakRef.current) clearInterval(breakRef.current); };
  }, [activeBreak?.break_start]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const { data: myWfhRequests = [] } = useWfhRequests({ mine: 'true' });
  const todayApprovedWfh = (myWfhRequests as any[]).find((r: any) => {
    if (r.status !== 'APPROVED') return false;
    const from = r.wfhDate ?? r.wfh_date ?? '';
    const to   = r.wfhDateTo ?? r.wfh_date_to ?? from;
    return from <= todayStr && todayStr <= (to || from);
  });

  // Always send UTC so both backend and timer use the same reference frame
  const clientTime = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

  const handleCheckIn    = () => checkIn.mutate({ client_time: clientTime() });
  const handleWfhCheckIn = () => checkIn.mutate({ client_time: clientTime(), is_wfh: true, wfh_reason: todayApprovedWfh?.reason ?? '' });
  const handleBreakStart = (type: 'LUNCH' | 'SHORT') => breakStart.mutate({ client_time: clientTime(), break_type: type });
  const handleBreakEnd   = () => breakEnd.mutate({ client_time: clientTime() });

  const breakElapsedMins = Math.floor(breakSecs / 60);
  const activeAllowance  = activeBreak ? ALLOWANCES[activeBreak.break_type as keyof typeof ALLOWANCES] ?? 15 : 0;
  const isOverBreak      = breakElapsedMins > activeAllowance;
  const overMins         = Math.max(0, breakElapsedMins - activeAllowance);

  if (!user) return null;

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Work elapsed */}
        {isWorking && elapsed && !onBreak && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-50 border border-green-200 text-green-700 text-xs font-mono font-semibold">
            <Clock size={11} />
            {elapsed}
          </div>
        )}

        {/* Active break indicator + End Break — color-coded per break type so
            it's obvious at a glance whether the user is on Lunch or a Short
            break. Lunch = amber (food), Short = sky-blue (coffee/tea). */}
        {onBreak && (() => {
          const isLunch = activeBreak?.break_type === 'LUNCH';
          const Icon   = isLunch ? UtensilsCrossed : Coffee;
          const label  = isLunch ? 'Lunch Break' : 'Short Break';
          // Over-allowance always escalates to red regardless of type
          const styles = isOverBreak
            ? 'bg-red-50 border-red-300 text-red-700'
            : isLunch
              ? 'bg-amber-50 border-amber-300 text-amber-800'
              : 'bg-sky-50 border-sky-300 text-sky-800';
          const endBtn = isLunch
            ? 'bg-amber-100 hover:bg-amber-200 border-amber-300 text-amber-800'
            : 'bg-sky-100 hover:bg-sky-200 border-sky-300 text-sky-800';
          return (
            <div className="flex items-center gap-1">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs ${styles}`}>
                <Icon size={13} className="shrink-0" />
                <span className="font-semibold">{label}</span>
                <span className="font-mono font-bold">{fmt2(Math.floor(breakSecs / 60))}:{fmt2(breakSecs % 60)}</span>
                {isOverBreak && (
                  <span className="flex items-center gap-0.5 text-red-600 font-semibold ml-0.5">
                    <AlertTriangle size={10} />+{overMins}m
                  </span>
                )}
              </div>
              <button
                onClick={handleBreakEnd}
                disabled={breakEnd.isPending}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium transition-colors disabled:opacity-60 ${endBtn}`}
              >
                {breakEnd.isPending ? '…' : 'End Break'}
              </button>
            </div>
          );
        })()}

        {/* Break buttons — Lunch (amber) and Short (sky-blue), only when
            working and not on break. Colors match the active-break pill above
            so users build muscle memory: amber = food, sky-blue = coffee. */}
        {isWorking && !onBreak && (
          <>
            <button
              onClick={() => handleBreakStart('LUNCH')}
              disabled={breakStart.isPending}
              title={`Lunch break (${lunchInfo.remaining_minutes}m remaining)`}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs transition-colors disabled:opacity-60 ${
                lunchInfo.remaining_minutes === 0
                  ? 'border-gray-200 text-gray-300 cursor-default'
                  : 'border-transparent hover:bg-amber-50 hover:border-amber-200 text-gray-500 hover:text-amber-700'
              }`}
            >
              <UtensilsCrossed size={13} />
              <span className="hidden sm:inline font-medium">Lunch</span>
              <span className="text-gray-300 text-xs">{lunchInfo.remaining_minutes}m</span>
            </button>
            <button
              onClick={() => handleBreakStart('SHORT')}
              disabled={breakStart.isPending}
              title={`Short break (${shortInfo.remaining_minutes}m remaining)`}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs transition-colors disabled:opacity-60 ${
                shortInfo.remaining_minutes === 0
                  ? 'border-gray-200 text-gray-300 cursor-default'
                  : 'border-transparent hover:bg-sky-50 hover:border-sky-200 text-gray-500 hover:text-sky-700'
              }`}
            >
              <Coffee size={13} />
              <span className="hidden sm:inline font-medium">Short</span>
              <span className="text-gray-300 text-xs">{shortInfo.remaining_minutes}m</span>
            </button>
          </>
        )}

        {/* Check In buttons */}
        {!isCheckedIn && (
          <>
            <button
              onClick={handleCheckIn}
              disabled={checkIn.isPending}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors disabled:opacity-60"
            >
              <LogIn size={13} />
              {checkIn.isPending ? '…' : 'Check In'}
            </button>
            {todayApprovedWfh && (
              <button
                onClick={handleWfhCheckIn}
                disabled={checkIn.isPending}
                title={`WFH: ${todayApprovedWfh.reason}`}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-medium transition-colors disabled:opacity-60"
              >
                <Home size={13} />
                <span className="hidden sm:inline">WFH</span>
              </button>
            )}
          </>
        )}

        {/* Check Out */}
        {isWorking && (
          <button
            onClick={() => checkOut.mutate({ client_time: clientTime() })}
            disabled={checkOut.isPending}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors disabled:opacity-60"
          >
            <LogOut size={13} />
            {checkOut.isPending ? '…' : 'Check Out'}
          </button>
        )}

        {/* Done for the day — show work hours + break summary */}
        {isCheckedOut && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-50 border border-gray-200 text-gray-500 text-xs">
            <Clock size={11} />
            <span className="font-mono font-semibold">{parseFloat(today?.net_work_hours ?? today?.work_hours ?? 0).toFixed(1)}h</span>
            {(lunchInfo.used_minutes > 0 || shortInfo.used_minutes > 0) && (
              <span className="text-gray-400 flex items-center gap-1">
                {lunchInfo.used_minutes > 0 && (
                  <span className={lunchInfo.exceeded_minutes > 0 ? 'text-red-500' : ''}>
                    <UtensilsCrossed size={9} className="inline mr-0.5" />
                    {fmtMins(Math.round(lunchInfo.used_minutes))}
                    {lunchInfo.exceeded_minutes > 0 && ` (+${Math.round(lunchInfo.exceeded_minutes)}m over)`}
                  </span>
                )}
                {shortInfo.used_minutes > 0 && (
                  <span className={shortInfo.exceeded_minutes > 0 ? 'text-red-500' : ''}>
                    <Coffee size={9} className="inline mr-0.5" />
                    {fmtMins(Math.round(shortInfo.used_minutes))}
                    {shortInfo.exceeded_minutes > 0 && ` (+${Math.round(shortInfo.exceeded_minutes)}m over)`}
                  </span>
                )}
              </span>
            )}
          </div>
        )}
      </div>

    </>
  );
};

export default AttendanceWidget;
