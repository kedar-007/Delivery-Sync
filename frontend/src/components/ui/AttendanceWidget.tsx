import React, { useState, useEffect, useRef } from 'react';
import { LogIn, LogOut, Coffee, Timer, Clock, Home, UtensilsCrossed, AlertTriangle } from 'lucide-react';
import {
  useMyAttendanceRecord,
  useCheckIn,
  useCheckOut,
  useBreakStart,
  useBreakEnd,
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

  // Work elapsed timer
  const [elapsed, setElapsed] = useState('');
  const workRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (workRef.current) clearInterval(workRef.current);
    const ciTime = today?.checkInTime ?? today?.check_in_time;
    if (!isWorking || !ciTime) { setElapsed(''); return; }
    const calc = () => {
      const diff = Math.max(0, Date.now() - new Date(ciTime).getTime());
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setElapsed(`${fmt2(h)}:${fmt2(m)}`);
    };
    calc();
    workRef.current = setInterval(calc, 10000);
    return () => { if (workRef.current) clearInterval(workRef.current); };
  }, [isWorking, today?.checkInTime, today?.check_in_time]);

  // Active break timer — count up from break_start
  const [breakSecs, setBreakSecs] = useState(0);
  const breakRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (breakRef.current) clearInterval(breakRef.current);
    if (!activeBreak?.break_start) { setBreakSecs(0); return; }
    // No 'Z' suffix — stored time is local (IST), browser parses without explicit TZ as local
    const tick = () => setBreakSecs(Math.max(0, Math.floor((Date.now() - new Date(activeBreak.break_start.replace(' ', 'T')).getTime()) / 1000)));
    tick();
    breakRef.current = setInterval(tick, 1000);
    return () => { if (breakRef.current) clearInterval(breakRef.current); };
  }, [activeBreak?.break_start]);

  const [showWfhModal, setShowWfhModal] = useState(false);
  const [wfhReason, setWfhReason] = useState('');

  const clientTime = () => new Date().toLocaleString('sv');

  const handleCheckIn    = () => checkIn.mutate({ client_time: clientTime() });
  const handleWfhCheckIn = () => { checkIn.mutate({ client_time: clientTime(), is_wfh: true, wfh_reason: wfhReason }); setShowWfhModal(false); setWfhReason(''); };
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

        {/* Active break indicator + End Break */}
        {onBreak && (
          <div className="flex items-center gap-1">
            <div className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-mono ${isOverBreak ? 'bg-red-50 border-red-300 text-red-700' : 'bg-orange-50 border-orange-200 text-orange-700'}`}>
              {activeBreak?.break_type === 'LUNCH' ? <UtensilsCrossed size={11} /> : <Coffee size={11} />}
              <span>{activeBreak?.break_type === 'LUNCH' ? 'Lunch' : 'Break'}</span>
              <span className="font-bold">{fmt2(Math.floor(breakSecs / 60))}:{fmt2(breakSecs % 60)}</span>
              {isOverBreak && (
                <span className="flex items-center gap-0.5 text-red-600 font-semibold ml-1">
                  <AlertTriangle size={10} />+{overMins}m
                </span>
              )}
            </div>
            <button
              onClick={handleBreakEnd}
              disabled={breakEnd.isPending}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-100 hover:bg-orange-200 border border-orange-300 text-orange-700 text-xs font-medium transition-colors disabled:opacity-60"
            >
              {breakEnd.isPending ? '…' : 'End Break'}
            </button>
          </div>
        )}

        {/* Break buttons — Lunch and Short, only when working and not on break */}
        {isWorking && !onBreak && (
          <>
            <button
              onClick={() => handleBreakStart('LUNCH')}
              disabled={breakStart.isPending}
              title={`Lunch break (${lunchInfo.remaining_minutes}m remaining)`}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs transition-colors disabled:opacity-60 ${
                lunchInfo.remaining_minutes === 0
                  ? 'border-gray-200 text-gray-300 cursor-default'
                  : 'border-transparent hover:bg-orange-50 hover:border-orange-200 text-gray-400 hover:text-orange-600'
              }`}
            >
              <UtensilsCrossed size={12} />
              <span className="hidden sm:inline">Lunch</span>
              <span className="text-gray-300 text-xs">{lunchInfo.remaining_minutes}m</span>
            </button>
            <button
              onClick={() => handleBreakStart('SHORT')}
              disabled={breakStart.isPending}
              title={`Short break (${shortInfo.remaining_minutes}m remaining)`}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs transition-colors disabled:opacity-60 ${
                shortInfo.remaining_minutes === 0
                  ? 'border-gray-200 text-gray-300 cursor-default'
                  : 'border-transparent hover:bg-orange-50 hover:border-orange-200 text-gray-400 hover:text-orange-600'
              }`}
            >
              <Coffee size={12} />
              <span className="hidden sm:inline">Break</span>
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
            <button
              onClick={() => setShowWfhModal(true)}
              disabled={checkIn.isPending}
              title="Working from home"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-medium transition-colors disabled:opacity-60"
            >
              <Home size={13} />
              <span className="hidden sm:inline">WFH</span>
            </button>
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

      {/* WFH check-in modal */}
      {showWfhModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 space-y-4">
            <div className="flex items-center gap-2">
              <Home size={18} className="text-blue-600" />
              <h3 className="text-base font-semibold text-gray-900">WFH Check-in</h3>
            </div>
            <p className="text-sm text-gray-500">A notification will be sent to your manager.</p>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Reason (optional)</label>
              <input
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-200 outline-none"
                placeholder="e.g. Doctor appointment, personal work…"
                value={wfhReason}
                onChange={(e) => setWfhReason(e.target.value)}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setShowWfhModal(false); setWfhReason(''); }}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleWfhCheckIn} disabled={checkIn.isPending}
                className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-60">
                {checkIn.isPending ? '…' : 'Check In WFH'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AttendanceWidget;
