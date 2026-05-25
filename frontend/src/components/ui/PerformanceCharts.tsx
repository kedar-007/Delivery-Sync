/**
 * PerformanceCharts — visualisations for the holistic-performance modal.
 *
 * - FactorRadar:      5-axis radar over the per-factor score.
 * - TaskStatusDonut:  done / in-progress / todo / overdue split.
 * - ActivitySparkline: stacked daily standups+EODs+hours over the window.
 * - MoodTrend:        line of mood score (1–5) over the window.
 * - BenchmarkBars:    user vs team median across key metrics.
 * - CountUp:          smooth animated number transition.
 *
 * All charts use the project's `recharts` and inherit Tailwind colors via
 * inline hex (recharts can't read Tailwind classes directly).
 */
import React, { useEffect, useState } from 'react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  PieChart, Pie, Cell,
  ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line,
  BarChart, Bar, Legend, ResponsiveContainer,
} from 'recharts';

// ─── Animated number ──────────────────────────────────────────────────────────

export function CountUp({ value, duration = 900, decimals = 0, suffix = '' }: {
  value: number; duration?: number; decimals?: number; suffix?: string;
}) {
  const [n, setN] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const from  = n;
    const to    = Number.isFinite(value) ? value : 0;
    let raf = 0;
    const tick = (t: number) => {
      const elapsed = t - start;
      const p = Math.min(1, elapsed / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - p, 3);
      setN(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return <>{n.toFixed(decimals)}{suffix}</>;
}

// ─── Factor radar ─────────────────────────────────────────────────────────────

export type FactorScore = { name: string; score: number };

export function FactorRadar({ factors }: { factors: FactorScore[] }) {
  if (!factors || factors.length === 0) return null;
  const data = factors.map((f) => ({ subject: shortName(f.name), score: clamp(f.score) }));
  return (
    <div className="w-full h-56">
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="78%">
          <defs>
            <linearGradient id="radarFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor="#6366f1" stopOpacity={0.7} />
              <stop offset="100%" stopColor="#a855f7" stopOpacity={0.2} />
            </linearGradient>
          </defs>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 11 }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 9 }} />
          <Radar name="Score" dataKey="score" stroke="#6366f1" strokeWidth={2}
                 fill="url(#radarFill)" fillOpacity={0.9} isAnimationActive />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}/100`, 'Score']} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Task status donut ────────────────────────────────────────────────────────

export type TaskStatus = {
  done: number; inProgress: number; todo: number; overdue: number;
};

const STATUS_COLOR = {
  Done:        '#10b981',
  'In Progress': '#3b82f6',
  Todo:        '#a3a3a3',
  Overdue:     '#ef4444',
};

export function TaskStatusDonut({ status }: { status: TaskStatus }) {
  const data = [
    { name: 'Done',        value: status.done       },
    { name: 'In Progress', value: status.inProgress },
    { name: 'Todo',        value: status.todo       },
    { name: 'Overdue',     value: status.overdue    },
  ].filter((d) => d.value > 0);

  const total = data.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return <div className="text-xs text-gray-400 text-center py-6">No task data</div>;
  }

  return (
    <div className="relative w-full h-48">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%"
               innerRadius={48} outerRadius={70} paddingAngle={3} stroke="none" isAnimationActive>
            {data.map((d) => (
              <Cell key={d.name} fill={STATUS_COLOR[d.name as keyof typeof STATUS_COLOR]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            wrapperStyle={{ fontSize: 11, color: '#6b7280' }}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Center label */}
      <div className="pointer-events-none absolute inset-x-0 top-[36%] flex flex-col items-center">
        <span className="text-lg font-bold text-gray-900 leading-none"><CountUp value={total} /></span>
        <span className="text-[10px] uppercase tracking-wider text-gray-400">Tasks</span>
      </div>
    </div>
  );
}

// ─── Activity sparkline (daily standups + EODs + hours) ───────────────────────

export type ActivityRow = {
  date: string;
  standups: number;
  eods: number;
  hours: number;
};

export function ActivitySparkline({ rows }: { rows: ActivityRow[] }) {
  if (!rows || rows.length === 0) return <div className="text-xs text-gray-400 py-6 text-center">No activity recorded</div>;
  // Format date label as MMM d for axis readability
  const data = rows.map((r) => ({ ...r, label: shortDate(r.date) }));
  return (
    <div className="w-full h-48">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="aHours" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#f3f4f6" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Area type="monotone" dataKey="hours" name="Work hours" stroke="#6366f1" strokeWidth={2}
                fill="url(#aHours)" isAnimationActive />
          <Line type="monotone" dataKey="standups" name="Standups" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} isAnimationActive />
          <Line type="monotone" dataKey="eods"     name="EODs"     stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} isAnimationActive />
          <Legend wrapperStyle={{ fontSize: 10, color: '#6b7280' }} iconType="circle" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Mood trend ───────────────────────────────────────────────────────────────

export type MoodPoint = { date: string; mood: string; score: number };

export function MoodTrend({ points }: { points: MoodPoint[] }) {
  if (!points || points.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 text-xs text-gray-400 py-6">
        <span className="text-2xl">🌤️</span>
        No mood entries logged
      </div>
    );
  }
  const data = points.map((p) => ({ ...p, label: shortDate(p.date) }));
  return (
    <div className="w-full h-40">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
          <CartesianGrid stroke="#f3f4f6" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle}
                   formatter={(_v: number, _k, row: any) => [`${row.payload.mood} (${row.payload.score}/5)`, 'Mood']} />
          <Line type="monotone" dataKey="score" stroke="#a855f7" strokeWidth={2.5}
                dot={{ r: 4, fill: '#fff', stroke: '#a855f7', strokeWidth: 2 }} isAnimationActive />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Benchmark bars (user vs team median) ─────────────────────────────────────

export type BenchmarkRow = { metric: string; you: number; median: number; suffix?: string };

export function BenchmarkBars({ rows }: { rows: BenchmarkRow[] }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div className="w-full h-56">
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }} barCategoryGap={14}>
          <CartesianGrid stroke="#f3f4f6" horizontal={false} />
          <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="metric" width={120} tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 10, color: '#6b7280' }} iconType="circle" />
          <Bar dataKey="you"    name="You"         fill="#6366f1" radius={[0, 6, 6, 0]} isAnimationActive />
          <Bar dataKey="median" name="Team median" fill="#cbd5e1" radius={[0, 6, 6, 0]} isAnimationActive />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const tooltipStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.96)',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  fontSize: 11,
  padding: '6px 10px',
  boxShadow: '0 8px 20px rgba(0,0,0,0.08)',
};

function shortName(name: string): string {
  // "Task Delivery" → "Tasks", "Time Management" → "Time", "Accountability" → "Account."
  if (!name) return '';
  if (name.length <= 10) return name;
  if (name.toLowerCase().includes('task'))     return 'Tasks';
  if (name.toLowerCase().includes('time'))     return 'Time';
  if (name.toLowerCase().includes('attend'))   return 'Attend.';
  if (name.toLowerCase().includes('account'))  return 'Account.';
  if (name.toLowerCase().includes('engage'))   return 'Engage.';
  return name.slice(0, 9) + '…';
}

function shortDate(d: string): string {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00Z');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Number(n) || 0));
}
