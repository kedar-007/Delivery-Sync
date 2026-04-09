import React, { useState, useEffect, useRef } from 'react';
import { LogIn, LogOut, Coffee, Timer, Clock } from 'lucide-react';
import { useMyAttendanceRecord, useCheckIn, useCheckOut } from '../../hooks/usePeople';
import { useAuth } from '../../contexts/AuthContext';

const LUNCH_MINS = 60;
const SHORT_MINS = 15;
const LS_LUNCH = 'ds_lunch_break_start';
const LS_SHORT = 'ds_short_break_start';

const fmt2 = (n: number) => String(Math.max(0, Math.floor(n))).padStart(2, '0');

const AttendanceWidget: React.FC = () => {
  const { user } = useAuth();
  const { data: record } = useMyAttendanceRecord();
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();

  const today = record?.today as any;
  const isCheckedIn = !!(today?.checkInTime);
  const isCheckedOut = !!(today?.checkOutTime);
  const isWorking = isCheckedIn && !isCheckedOut;

  // Elapsed work timer
  const [elapsed, setElapsed] = useState('');
  const workRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Break timers
  const [lunchRemaining, setLunchRemaining] = useState<number | null>(null);
  const [shortRemaining, setShortRemaining] = useState<number | null>(null);
  const lunchRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shortRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Work elapsed timer
  useEffect(() => {
    if (workRef.current) clearInterval(workRef.current);
    if (!isWorking || !today?.checkInTime) { setElapsed(''); return; }
    const calc = () => {
      const diff = Math.max(0, Date.now() - new Date(today.checkInTime).getTime());
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setElapsed(`${fmt2(h)}:${fmt2(m)}`);
    };
    calc();
    workRef.current = setInterval(calc, 10000);
    return () => { if (workRef.current) clearInterval(workRef.current); };
  }, [isWorking, today?.checkInTime]);

  // Restore breaks from localStorage on mount
  useEffect(() => {
    const lunchStart = localStorage.getItem(LS_LUNCH);
    if (lunchStart) {
      const elapsed = (Date.now() - Number(lunchStart)) / 60000;
      const rem = LUNCH_MINS - elapsed;
      if (rem > 0) setLunchRemaining(rem * 60);
      else localStorage.removeItem(LS_LUNCH);
    }
    const shortStart = localStorage.getItem(LS_SHORT);
    if (shortStart) {
      const elapsed = (Date.now() - Number(shortStart)) / 60000;
      const rem = SHORT_MINS - elapsed;
      if (rem > 0) setShortRemaining(rem * 60);
      else localStorage.removeItem(LS_SHORT);
    }
  }, []);

  // Lunch break countdown
  useEffect(() => {
    if (lunchRef.current) clearInterval(lunchRef.current);
    if (lunchRemaining === null) return;
    lunchRef.current = setInterval(() => {
      setLunchRemaining(prev => {
        if (prev === null || prev <= 1) {
          localStorage.removeItem(LS_LUNCH);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (lunchRef.current) clearInterval(lunchRef.current); };
  }, [lunchRemaining !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Short break countdown
  useEffect(() => {
    if (shortRef.current) clearInterval(shortRef.current);
    if (shortRemaining === null) return;
    shortRef.current = setInterval(() => {
      setShortRemaining(prev => {
        if (prev === null || prev <= 1) {
          localStorage.removeItem(LS_SHORT);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (shortRef.current) clearInterval(shortRef.current); };
  }, [shortRemaining !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const startLunch = () => {
    localStorage.setItem(LS_LUNCH, String(Date.now()));
    setLunchRemaining(LUNCH_MINS * 60);
  };

  const startShort = () => {
    localStorage.setItem(LS_SHORT, String(Date.now()));
    setShortRemaining(SHORT_MINS * 60);
  };

  const fmtBreak = (secs: number) =>
    `${fmt2(Math.floor(secs / 60))}:${fmt2(secs % 60)}`;

  if (!user) return null;

  return (
    <div className="flex items-center gap-1.5">
      {isWorking && elapsed && (
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-50 border border-green-200 text-green-700 text-xs font-mono font-semibold">
          <Clock size={11} />
          {elapsed}
        </div>
      )}

      {isWorking && lunchRemaining !== null && (
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-50 border border-orange-200 text-orange-700 text-xs font-mono">
          <Coffee size={11} />
          {fmtBreak(lunchRemaining)}
        </div>
      )}

      {isWorking && shortRemaining !== null && (
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-50 border border-purple-200 text-purple-700 text-xs font-mono">
          <Timer size={11} />
          {fmtBreak(shortRemaining)}
        </div>
      )}

      {isWorking && lunchRemaining === null && (
        <button
          onClick={startLunch}
          title="Lunch break (60 min)"
          className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-orange-50 border border-transparent hover:border-orange-200 text-gray-400 hover:text-orange-600 text-xs transition-colors"
        >
          <Coffee size={13} />
          <span className="hidden sm:inline">Lunch</span>
        </button>
      )}

      {isWorking && shortRemaining === null && (
        <button
          onClick={startShort}
          title="Short break (15 min)"
          className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-purple-50 border border-transparent hover:border-purple-200 text-gray-400 hover:text-purple-600 text-xs transition-colors"
        >
          <Timer size={13} />
          <span className="hidden sm:inline">Break</span>
        </button>
      )}

      {!isCheckedIn && (
        <button
          onClick={() => checkIn.mutate({ client_time: new Date().toLocaleString('sv') })}
          disabled={checkIn.isPending}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors disabled:opacity-60"
        >
          <LogIn size={13} />
          {checkIn.isPending ? '...' : 'Check In'}
        </button>
      )}

      {isWorking && (
        <button
          onClick={() => checkOut.mutate({ client_time: new Date().toLocaleString('sv') })}
          disabled={checkOut.isPending}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors disabled:opacity-60"
        >
          <LogOut size={13} />
          {checkOut.isPending ? '...' : 'Check Out'}
        </button>
      )}

      {isCheckedOut && today?.workHours && (
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-50 border border-gray-200 text-gray-500 text-xs">
          <Clock size={11} />
          {parseFloat(today.workHours).toFixed(1)}h done
        </div>
      )}
    </div>
  );
};

export default AttendanceWidget;
