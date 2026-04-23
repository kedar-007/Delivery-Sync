import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  Clock, TrendingUp, DollarSign, Users, ChevronDown, ChevronRight,
  Search, CalendarDays, Activity, X, CheckCircle, AlertCircle, FileEdit,
  LogIn, LogOut, Coffee, MapPin, Home,
} from 'lucide-react';
import { timeEntriesApi, attendanceApi, teamsApi } from '../lib/api';
import UserAvatar from '../components/ui/UserAvatar';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectBreakdown {
  project_id:         string;
  project_name:       string;
  total_hours:        number;
  billable_hours:     number;
  non_billable_hours: number;
  entries_count:      number;
}

interface MemberStat {
  user_id:            string;
  user_name:          string;
  user_avatar_url:    string;
  org_role_name:      string;
  total_hours:        number;
  billable_hours:     number;
  non_billable_hours: number;
  billable_pct:       number;
  entries_count:      number;
  days_logged:        number;
  approved_hours:     number;
  submitted_hours:    number;
  draft_hours:        number;
  by_project:         ProjectBreakdown[];
}

interface AnalyticsData {
  period:  { from: string; to: string; label: string };
  summary: {
    total_hours:        number;
    billable_hours:     number;
    non_billable_hours: number;
    billable_pct:       number;
    active_members:     number;
    total_entries:      number;
  };
  members: MemberStat[];
}

interface DailyEntry {
  date:               string;
  total_hours:        number;
  billable_hours:     number;
  non_billable_hours: number;
  entries_count:      number;
  approved_hours:     number;
  submitted_hours:    number;
  draft_hours:        number;
}

interface UserActivityData {
  period: { from: string; to: string };
  daily:  DailyEntry[];
}

interface AttendanceRecord {
  ROWID:               string;
  attendance_date:     string;
  check_in_time:       string | null;
  check_out_time:      string | null;
  work_hours:          number | string | null;
  net_work_hours:      number | string | null;
  total_break_minutes: number | string | null;
  status:              string;
  is_wfh:              string;
}

interface TeamMember {
  id:        string;
  name:      string;
  avatarUrl: string;
  role:      string;
}

interface Team {
  id:          string;
  name:        string;
  description: string;
  memberCount: number;
  members:     TeamMember[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Period = 'week' | 'month' | 'last_month' | 'custom';

const PERIOD_LABELS: Record<Period, string> = {
  week:       'This Week',
  month:      'This Month',
  last_month: 'Last Month',
  custom:     'Custom Range',
};

function fmt(n: number) {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

function pctBar(pct: number) {
  const green = pct >= 70;
  const amber = pct >= 40;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${green ? 'bg-emerald-500' : amber ? 'bg-amber-500' : 'bg-red-400'}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className={`text-xs font-medium tabular-nums w-10 text-right ${green ? 'text-emerald-600' : amber ? 'text-amber-600' : 'text-red-500'}`}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, sub, color,
}: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4">
      <div className={`p-3 rounded-xl ${color} shrink-0`}>{icon}</div>
      <div>
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Team picker ─────────────────────────────────────────────────────────────

function TeamPicker({
  teams,
  selectedId,
  onChange,
}: {
  teams:      Team[];
  selectedId: string | null;
  onChange:   (id: string | null) => void;
}) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const ref               = useRef<HTMLDivElement>(null);
  const selected          = teams.find((t) => t.id === selectedId) ?? null;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const visible = useMemo(() => {
    if (!query.trim()) return teams;
    const q = query.toLowerCase();
    return teams.filter((t) => t.name.toLowerCase().includes(q));
  }, [teams, query]);

  if (teams.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-medium transition-colors ${
          selected
            ? 'border-violet-300 bg-violet-50 text-violet-700'
            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
        }`}
      >
        {selected ? (
          <>
            <Users size={14} />
            <span className="max-w-[120px] truncate">{selected.name}</span>
            <span className="text-xs text-violet-400 bg-violet-100 rounded-full px-1.5 ml-0.5">
              {selected.memberCount}
            </span>
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onChange(null); setOpen(false); }}
              className="ml-1 text-violet-400 hover:text-violet-600"
            >
              <X size={12} />
            </span>
          </>
        ) : (
          <>
            <Users size={14} />
            <span>All Teams</span>
            <ChevronDown size={13} className="text-gray-400" />
          </>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-2xl shadow-lg z-20 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                autoFocus
                type="text"
                placeholder="Search teams…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto">
            <button
              onClick={() => { onChange(null); setOpen(false); setQuery(''); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${!selectedId ? 'bg-violet-50 text-violet-700 font-medium' : 'text-gray-700'}`}
            >
              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                <Users size={14} className="text-gray-400" />
              </div>
              <span>All Teams</span>
            </button>
            {visible.map((t) => (
              <button
                key={t.id}
                onClick={() => { onChange(t.id); setOpen(false); setQuery(''); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${selectedId === t.id ? 'bg-violet-50 text-violet-700 font-medium' : 'text-gray-700'}`}
              >
                <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                  <Users size={13} className="text-violet-500" />
                </div>
                <div className="min-w-0 text-left flex-1">
                  <p className="truncate font-medium">{t.name}</p>
                  <p className="text-xs text-gray-400">{t.memberCount} member{t.memberCount !== 1 ? 's' : ''}</p>
                </div>
              </button>
            ))}
            {visible.length === 0 && (
              <p className="px-3 py-4 text-xs text-gray-400 text-center">No teams found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── User picker ──────────────────────────────────────────────────────────────

function UserPicker({
  members,
  selectedId,
  onChange,
}: {
  members: MemberStat[];
  selectedId: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState('');
  const ref                   = useRef<HTMLDivElement>(null);
  const selected              = members.find((m) => m.user_id === selectedId) ?? null;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const visible = useMemo(() => {
    if (!query.trim()) return members;
    const q = query.toLowerCase();
    return members.filter(
      (m) => m.user_name.toLowerCase().includes(q) || (m.org_role_name ?? '').toLowerCase().includes(q),
    );
  }, [members, query]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-medium transition-colors ${
          selected
            ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
        }`}
      >
        {selected ? (
          <>
            <UserAvatar name={selected.user_name} avatarUrl={selected.user_avatar_url} size="xs" />
            <span className="max-w-[120px] truncate">{selected.user_name}</span>
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onChange(null); setOpen(false); }}
              className="ml-1 text-indigo-400 hover:text-indigo-600"
            >
              <X size={12} />
            </span>
          </>
        ) : (
          <>
            <Users size={14} />
            <span>All Members</span>
            <ChevronDown size={13} className="text-gray-400" />
          </>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-2xl shadow-lg z-20 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                autoFocus
                type="text"
                placeholder="Search members…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto">
            <button
              onClick={() => { onChange(null); setOpen(false); setQuery(''); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${!selectedId ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'}`}
            >
              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                <Users size={14} className="text-gray-400" />
              </div>
              <span>All Members</span>
            </button>
            {visible.map((m) => (
              <button
                key={m.user_id}
                onClick={() => { onChange(m.user_id); setOpen(false); setQuery(''); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${selectedId === m.user_id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'}`}
              >
                <UserAvatar name={m.user_name} avatarUrl={m.user_avatar_url} size="xs" />
                <div className="min-w-0 text-left">
                  <p className="truncate font-medium">{m.user_name}</p>
                  {m.org_role_name && <p className="text-xs text-gray-400 truncate">{m.org_role_name}</p>}
                </div>
              </button>
            ))}
            {visible.length === 0 && (
              <p className="px-3 py-4 text-xs text-gray-400 text-center">No members found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── User activity charts ─────────────────────────────────────────────────────

const PIE_COLORS = ['#6366f1','#10b981','#f59e0b','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16'];

function fmtDate(d: string) {
  // Handles both "2026-04-01" and "2026-04-01 00:00:00" (Catalyst stores with space, not T)
  const clean = String(d).split('T')[0].split(' ')[0];
  const dt = new Date(clean + 'T00:00:00');
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtTime(t: string | null | undefined) {
  if (!t) return '—';
  const timeStr = t.includes(' ') ? t.split(' ')[1] : t;
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  if (isNaN(h)) return '—';
  const ampm  = h >= 12 ? 'PM' : 'AM';
  const disp  = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${disp}:${mStr} ${ampm}`;
}

function UserActivityCharts({ member, activity, loading }: {
  member: MemberStat;
  activity: UserActivityData | undefined;
  loading: boolean;
}) {
  const daily = activity?.daily ?? [];

  const projectData = member.by_project
    .filter((p) => p.total_hours > 0)
    .slice(0, 8)
    .map((p, i) => ({
      name:  p.project_name.length > 20 ? p.project_name.slice(0, 19) + '…' : p.project_name,
      value: p.total_hours,
      color: PIE_COLORS[i % PIE_COLORS.length],
    }));

  const totalProjectHours = projectData.reduce((s, p) => s + p.value, 0);

  const statusItems = [
    { label: 'Approved',  hours: member.approved_hours,  color: 'bg-emerald-500', textColor: 'text-emerald-700', icon: <CheckCircle size={14} /> },
    { label: 'Submitted', hours: member.submitted_hours, color: 'bg-amber-400',   textColor: 'text-amber-700',   icon: <AlertCircle size={14} /> },
    { label: 'Draft',     hours: member.draft_hours,     color: 'bg-gray-300',    textColor: 'text-gray-500',    icon: <FileEdit size={14} /> },
  ];
  const totalStatusHours = member.total_hours || 1;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

      {/* Daily activity — spans 2 cols */}
      <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Daily Activity</h3>
        {loading ? (
          <div className="h-44 flex items-center justify-center text-gray-400 text-sm gap-2">
            <Activity size={16} className="animate-pulse" /> Loading…
          </div>
        ) : daily.length === 0 ? (
          <div className="h-44 flex items-center justify-center text-gray-400 text-sm">
            No entries in this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={daily} margin={{ top: 0, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false} tickLine={false}
                interval={daily.length > 14 ? Math.floor(daily.length / 7) : 0}
              />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} unit="h" />
              <Tooltip
                labelFormatter={(l) => fmtDate(String(l))}
                formatter={(val: number, name: string) => [`${fmt(val)}h`, name]}
                contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }}
              />
              <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="billable_hours"     name="Billable"     stackId="a" fill="#10b981" radius={[0,0,0,0]} />
              <Bar dataKey="non_billable_hours" name="Non-Billable" stackId="a" fill="#f59e0b" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Right column: project pie + status */}
      <div className="flex flex-col gap-4">

        {/* Project distribution */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex-1">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Time by Project</h3>
          {projectData.length === 0 ? (
            <div className="h-28 flex items-center justify-center text-gray-400 text-xs">No project data</div>
          ) : (
            <div className="flex items-center gap-3">
              <PieChart width={90} height={90}>
                <Pie
                  data={projectData}
                  dataKey="value"
                  cx={40} cy={40}
                  innerRadius={24}
                  outerRadius={42}
                  paddingAngle={2}
                  startAngle={90}
                  endAngle={-270}
                >
                  {projectData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: number) => [`${fmt(val)}h`, '']}
                  contentStyle={{ borderRadius: 10, fontSize: 11 }}
                />
              </PieChart>
              <div className="flex-1 min-w-0 space-y-1">
                {projectData.map((p, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
                    <span className="truncate text-gray-600 flex-1">{p.name}</span>
                    <span className="text-gray-400 tabular-nums shrink-0">
                      {Math.round((p.value / totalProjectHours) * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Approval status */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Approval Status</h3>
          <div className="space-y-2.5">
            {statusItems.map((s) => (
              <div key={s.label}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className={`flex items-center gap-1 font-medium ${s.textColor}`}>
                    {s.icon} {s.label}
                  </span>
                  <span className="text-gray-500 tabular-nums">{fmt(s.hours)}h</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${s.color} transition-all`}
                    style={{ width: `${Math.min(100, (s.hours / totalStatusHours) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Top performers ───────────────────────────────────────────────────────────

const RANK_STYLES = [
  { bg: 'bg-amber-50',   border: 'border-amber-200',  badge: 'bg-amber-400  text-white', label: '🥇' },
  { bg: 'bg-gray-50',    border: 'border-gray-200',    badge: 'bg-gray-400   text-white', label: '🥈' },
  { bg: 'bg-orange-50',  border: 'border-orange-200',  badge: 'bg-orange-400 text-white', label: '🥉' },
];

function TopPerformers({ members }: { members: MemberStat[] }) {
  const ranked = [...members]
    .filter((m) => m.billable_hours > 0)
    .sort((a, b) => b.billable_hours - a.billable_hours)
    .slice(0, 10);

  if (ranked.length === 0) return null;

  const maxBillable = ranked[0].billable_hours;
  const podium = ranked.slice(0, 3);
  const rest   = ranked.slice(3);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Top Performers</h2>
          <p className="text-xs text-gray-400 mt-0.5">Ranked by billable hours this period</p>
        </div>
        <span className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-full px-3 py-1">
          {ranked.length} member{ranked.length !== 1 ? 's' : ''} with billable time
        </span>
      </div>

      {/* Podium — top 3 */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {podium.map((m, i) => {
          const style = RANK_STYLES[i];
          const pct   = Math.round((m.billable_hours / m.total_hours) * 100);
          return (
            <div key={m.user_id} className={`rounded-2xl border ${style.bg} ${style.border} p-4 flex flex-col items-center text-center gap-2 relative`}>
              <span className="absolute top-2 right-2 text-lg leading-none">{style.label}</span>
              <UserAvatar name={m.user_name} avatarUrl={m.user_avatar_url} size="lg" />
              <div className="min-w-0 w-full">
                <p className="text-sm font-semibold text-gray-900 truncate">{m.user_name}</p>
                {m.org_role_name && <p className="text-xs text-gray-400 truncate">{m.org_role_name}</p>}
              </div>
              <div className="w-full">
                <p className="text-xl font-bold text-emerald-600 tabular-nums">{fmt(m.billable_hours)}h</p>
                <p className="text-xs text-gray-400">billable · {pct}% of total</p>
              </div>
              <div className="w-full h-1.5 rounded-full bg-white/70 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-all"
                  style={{ width: `${(m.billable_hours / maxBillable) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Rank 4–10 as a compact list */}
      {rest.length > 0 && (
        <div className="divide-y divide-gray-50">
          {rest.map((m, i) => {
            const rank = i + 4;
            const pct  = (m.billable_hours / maxBillable) * 100;
            const billPct = m.total_hours > 0 ? Math.round((m.billable_hours / m.total_hours) * 100) : 0;
            return (
              <div key={m.user_id} className="flex items-center gap-3 py-2.5 hover:bg-gray-50 rounded-xl px-2 -mx-2 transition-colors">
                <span className="w-6 text-center text-sm font-bold text-gray-400 tabular-nums shrink-0">{rank}</span>
                <UserAvatar name={m.user_name} avatarUrl={m.user_avatar_url} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">{m.user_name}</p>
                  {m.org_role_name && <p className="text-xs text-gray-400 truncate">{m.org_role_name}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="w-24 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-emerald-600 tabular-nums w-14 text-right">{fmt(m.billable_hours)}h</span>
                  <span className="text-xs text-gray-400 tabular-nums w-10 text-right">{billPct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Attendance section ───────────────────────────────────────────────────────

const ATTN_STATUS_COLORS: Record<string, string> = {
  PRESENT:  '#10b981',
  WFH:      '#6366f1',
  HALF_DAY: '#a78bfa',
  LATE:     '#f59e0b',
  ABSENT:   '#f87171',
};

function AttendanceInsightCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 flex items-start gap-3 ${color}`}>
      <div className="mt-0.5">{icon}</div>
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold text-gray-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function AttendanceSection({ records, loading }: { records: AttendanceRecord[]; loading: boolean }) {
  const presentDays    = records.filter((r) => r.check_in_time && r.status !== 'ABSENT').length;
  const wfhDays        = records.filter((r) => String(r.is_wfh).toLowerCase() === 'true').length;
  const officeDays     = presentDays - wfhDays;
  const totalBreakMins = records.reduce((s, r) => s + (parseFloat(String(r.total_break_minutes || 0)) || 0), 0);
  const avgNetHrs      = presentDays > 0
    ? records.reduce((s, r) => s + (parseFloat(String(r.net_work_hours || r.work_hours || 0)) || 0), 0) / presentDays
    : 0;

  // Daily work hours chart — sorted ascending
  const dailyChart = [...records]
    .filter((r) => r.check_in_time)
    .sort((a, b) => String(a.attendance_date).localeCompare(String(b.attendance_date)))
    .map((r) => {
      const dateStr = String(r.attendance_date).split('T')[0].split(' ')[0];
      return {
        date:     dateStr,
        label:    fmtDate(dateStr),
        netHours: parseFloat(String(r.net_work_hours || r.work_hours || 0)) || 0,
        breakMins: parseFloat(String(r.total_break_minutes || 0)) || 0,
        isWfh:    String(r.is_wfh).toLowerCase() === 'true',
      };
    });

  // Status distribution for pie
  const statusCount: Record<string, number> = {};
  records.forEach((r) => {
    const s = r.status || 'ABSENT';
    statusCount[s] = (statusCount[s] || 0) + 1;
  });
  const statusPie = Object.entries(statusCount).map(([name, value]) => ({
    name, value, color: ATTN_STATUS_COLORS[name] ?? '#9ca3af',
  }));

  // Average check-in time (minutes since midnight)
  const checkIns = records
    .filter((r) => r.check_in_time)
    .map((r) => {
      const t = String(r.check_in_time!).includes(' ')
        ? String(r.check_in_time!).split(' ')[1]
        : String(r.check_in_time!);
      const [h, m] = t.split(':').map(Number);
      return h * 60 + (m || 0);
    });
  const avgCheckinMins = checkIns.length ? Math.round(checkIns.reduce((a, b) => a + b, 0) / checkIns.length) : null;
  const avgCheckinStr  = avgCheckinMins !== null
    ? `${Math.floor(avgCheckinMins / 60)}:${String(avgCheckinMins % 60).padStart(2, '0')} ${Math.floor(avgCheckinMins / 60) >= 12 ? 'PM' : 'AM'}`
    : '—';

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center justify-center gap-2 text-gray-400 text-sm">
        <Activity size={16} className="animate-pulse" /> Loading attendance insights…
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-sm text-gray-400">
        No attendance records in this period.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-800">Attendance Insights</h2>
        <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{records.length} records</span>
      </div>

      {/* Insight cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <AttendanceInsightCard
          icon={<MapPin size={16} className="text-emerald-600" />}
          label="Days Present"
          value={String(presentDays)}
          sub={`${officeDays} office · ${wfhDays} WFH`}
          color="bg-emerald-50 border-emerald-100"
        />
        <AttendanceInsightCard
          icon={<Clock size={16} className="text-indigo-600" />}
          label="Avg Work Hours"
          value={`${fmt(avgNetHrs)}h`}
          sub="net per day"
          color="bg-indigo-50 border-indigo-100"
        />
        <AttendanceInsightCard
          icon={<LogIn size={16} className="text-blue-600" />}
          label="Avg Check-in"
          value={avgCheckinStr}
          sub="across present days"
          color="bg-blue-50 border-blue-100"
        />
        <AttendanceInsightCard
          icon={<Coffee size={16} className="text-amber-600" />}
          label="Total Breaks"
          value={totalBreakMins >= 60 ? `${fmt(totalBreakMins / 60)}h` : `${Math.round(totalBreakMins)}m`}
          sub={`avg ${Math.round(totalBreakMins / Math.max(presentDays, 1))}m/day`}
          color="bg-amber-50 border-amber-100"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Daily work hours — spans 2 cols */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Daily Work Hours</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={dailyChart} margin={{ top: 0, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false} tickLine={false}
                interval={dailyChart.length > 14 ? Math.floor(dailyChart.length / 7) : 0}
              />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} unit="h" />
              <Tooltip
                formatter={(val: number, name: string) =>
                  name === 'Break' ? [`${Math.round(val)}m`, 'Break'] : [`${fmt(val)}h`, name]
                }
                contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }}
              />
              <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="netHours"   name="Net Hours" fill="#6366f1" radius={[4,4,0,0]} />
              <Bar dataKey="breakMins"  name="Break"     fill="#fbbf24" radius={[4,4,0,0]} yAxisId={0} hide />
            </BarChart>
          </ResponsiveContainer>

          {/* Check-in / checkout timeline strip */}
          <div className="mt-4 border-t border-gray-50 pt-4 max-h-44 overflow-y-auto space-y-1.5">
            {[...records]
              .filter((r) => r.check_in_time)
              .sort((a, b) => String(b.attendance_date).localeCompare(String(a.attendance_date)))
              .map((r) => {
                const ds = String(r.attendance_date).split('T')[0].split(' ')[0];
                const dt = new Date(ds + 'T00:00:00');
                const label = isNaN(dt.getTime()) ? ds : dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                const isWfh = String(r.is_wfh).toLowerCase() === 'true';
                const netH  = parseFloat(String(r.net_work_hours || r.work_hours || 0)) || 0;
                const brk   = parseFloat(String(r.total_break_minutes || 0)) || 0;
                return (
                  <div key={r.ROWID} className="flex items-center gap-3 text-xs text-gray-600 py-1 hover:bg-gray-50 rounded-lg px-2">
                    <span className="w-28 font-medium text-gray-700 shrink-0">{label}</span>
                    {isWfh
                      ? <span className="flex items-center gap-0.5 text-indigo-600 shrink-0"><Home size={10}/> WFH</span>
                      : <span className="flex items-center gap-0.5 text-emerald-600 shrink-0"><MapPin size={10}/> Office</span>
                    }
                    <span className="flex items-center gap-0.5 text-emerald-700 shrink-0"><LogIn size={10}/>{fmtTime(r.check_in_time)}</span>
                    {r.check_out_time
                      ? <span className="flex items-center gap-0.5 text-gray-500 shrink-0"><LogOut size={10}/>{fmtTime(r.check_out_time)}</span>
                      : <span className="text-amber-500 shrink-0">no checkout</span>
                    }
                    <span className="ml-auto font-semibold text-indigo-700 tabular-nums">{netH > 0 ? `${fmt(netH)}h` : '—'}</span>
                    {brk > 0 && <span className="text-amber-500 tabular-nums shrink-0"><Coffee size={9} className="inline mr-0.5"/>{Math.round(brk)}m</span>}
                  </div>
                );
              })
            }
          </div>
        </div>

        {/* Attendance distribution pie */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Attendance Distribution</h3>
          <div className="flex flex-col items-center gap-4">
            <PieChart width={130} height={130}>
              <Pie
                data={statusPie}
                dataKey="value"
                cx={60} cy={60}
                innerRadius={34}
                outerRadius={58}
                paddingAngle={2}
                startAngle={90}
                endAngle={-270}
              >
                {statusPie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip
                formatter={(val: number, name: string) => [`${val} day${val !== 1 ? 's' : ''}`, name]}
                contentStyle={{ borderRadius: 10, fontSize: 11 }}
              />
            </PieChart>
            <div className="w-full space-y-1.5">
              {statusPie.map((s) => (
                <div key={s.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="text-gray-600 capitalize">{s.name.replace('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}</span>
                  </span>
                  <span className="font-semibold text-gray-700">{s.value}d</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Member row ───────────────────────────────────────────────────────────────

function MemberRow({ member }: { member: MemberStat }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr
        className="hover:bg-gray-50 cursor-pointer transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <UserAvatar name={member.user_name} avatarUrl={member.user_avatar_url} size="sm" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{member.user_name}</p>
              {member.org_role_name && (
                <p className="text-xs text-gray-400 truncate">{member.org_role_name}</p>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-sm font-semibold text-gray-900 tabular-nums text-right">
          {fmt(member.total_hours)}h
        </td>
        <td className="px-4 py-3 text-sm text-emerald-600 font-medium tabular-nums text-right">
          {fmt(member.billable_hours)}h
        </td>
        <td className="px-4 py-3 text-sm text-gray-500 tabular-nums text-right">
          {fmt(member.non_billable_hours)}h
        </td>
        <td className="px-4 py-3 w-40">{pctBar(member.billable_pct)}</td>
        <td className="px-4 py-3 text-sm text-gray-500 tabular-nums text-center">
          {member.days_logged}
        </td>
        <td className="px-4 py-3 text-sm text-gray-500 tabular-nums text-center">
          {member.entries_count}
        </td>
        <td className="px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-1 text-xs">
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">{fmt(member.approved_hours)}h ✓</span>
            {member.submitted_hours > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">{fmt(member.submitted_hours)}h ⏳</span>
            )}
            {member.draft_hours > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{fmt(member.draft_hours)}h draft</span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-center">
          {open ? <ChevronDown size={14} className="text-gray-400 inline" /> : <ChevronRight size={14} className="text-gray-400 inline" />}
        </td>
      </tr>

      {open && member.by_project.length > 0 && (
        <tr>
          <td colSpan={9} className="bg-gray-50 px-6 pb-3 pt-0">
            <div className="rounded-xl border border-gray-100 overflow-hidden mt-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                    <th className="px-4 py-2 text-left font-medium">Project</th>
                    <th className="px-4 py-2 text-right font-medium">Total</th>
                    <th className="px-4 py-2 text-right font-medium">Billable</th>
                    <th className="px-4 py-2 text-right font-medium">Non-billable</th>
                    <th className="px-4 py-2 text-right font-medium">Entries</th>
                  </tr>
                </thead>
                <tbody>
                  {member.by_project.map((p) => (
                    <tr key={p.project_id} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-2 font-medium text-gray-700">{p.project_name}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-700">{fmt(p.total_hours)}h</td>
                      <td className="px-4 py-2 text-right tabular-nums text-emerald-600">{fmt(p.billable_hours)}h</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-400">{fmt(p.non_billable_hours)}h</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-400">{p.entries_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TeamActivityPage() {
  const [period, setPeriod]         = useState<Period>('month');
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');
  const [search, setSearch]         = useState('');
  const [selectedUserId, setSelectedUserId]   = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId]   = useState<string | null>(null);

  const params = useMemo(() => {
    const p: Record<string, string> = { period };
    if (period === 'custom') {
      if (dateFrom) p.date_from = dateFrom;
      if (dateTo)   p.date_to   = dateTo;
    }
    return p;
  }, [period, dateFrom, dateTo]);

  const enabled = period !== 'custom' || Boolean(dateFrom && dateTo);

  const { data, isLoading, isError, error } = useQuery<AnalyticsData>({
    queryKey: ['team-analytics', params],
    queryFn:  () => timeEntriesApi.teamAnalytics(params),
    enabled,
    retry: false,
  });

  const userActivityParams = useMemo(() => {
    if (!selectedUserId) return null;
    const p: Record<string, string> = { period, user_id: selectedUserId };
    if (period === 'custom') {
      if (dateFrom) p.date_from = dateFrom;
      if (dateTo)   p.date_to   = dateTo;
    }
    return p;
  }, [selectedUserId, period, dateFrom, dateTo]);

  const { data: activityData, isLoading: activityLoading } = useQuery<UserActivityData>({
    queryKey: ['user-activity', userActivityParams],
    queryFn:  () => timeEntriesApi.userActivity(userActivityParams!),
    enabled:  !!userActivityParams && enabled,
    retry: false,
  });

  const attendanceParams = useMemo(() => {
    if (!selectedUserId || !data?.period) return null;
    return { user_id: selectedUserId, date_from: data.period.from, date_to: data.period.to };
  }, [selectedUserId, data?.period]);

  const { data: attendanceData, isLoading: attendanceLoading } = useQuery<AttendanceRecord[]>({
    queryKey: ['user-attendance', attendanceParams],
    queryFn:  () => attendanceApi.records(attendanceParams!),
    enabled:  !!attendanceParams,
    retry: false,
  });

  const { data: teamsData } = useQuery<{ teams: Team[] }>({
    queryKey: ['teams'],
    queryFn:  () => teamsApi.list(),
    retry: false,
  });
  const teams = teamsData?.teams ?? [];

  // When period changes or team changes, reset user selection
  useEffect(() => { setSelectedUserId(null); }, [period, selectedTeamId]);

  const selectedMember = useMemo(
    () => data?.members.find((m) => m.user_id === selectedUserId) ?? null,
    [data?.members, selectedUserId],
  );

  const selectedTeam = useMemo(
    () => teams.find((t) => t.id === selectedTeamId) ?? null,
    [teams, selectedTeamId],
  );

  const teamMemberIds = useMemo(
    () => selectedTeam ? new Set(selectedTeam.members.map((m) => m.id)) : null,
    [selectedTeam],
  );

  // Members shown in the user picker — scoped to selected team when one is active
  const userPickerMembers = useMemo(() => {
    if (!data?.members) return [];
    if (!teamMemberIds) return data.members;
    return data.members.filter((m) => teamMemberIds.has(m.user_id));
  }, [data?.members, teamMemberIds]);

  // Summary stats — scoped to selected user, team, or overall
  const summary = useMemo(() => {
    if (!data) return null;
    if (selectedMember) {
      const m = selectedMember;
      return {
        total_hours:        m.total_hours,
        billable_hours:     m.billable_hours,
        non_billable_hours: m.non_billable_hours,
        billable_pct:       m.billable_pct,
        active_members:     m.days_logged,
        total_entries:      m.entries_count,
      };
    }
    if (teamMemberIds) {
      const tm = data.members.filter((m) => teamMemberIds.has(m.user_id));
      const total    = tm.reduce((s, m) => s + m.total_hours, 0);
      const billable = tm.reduce((s, m) => s + m.billable_hours, 0);
      return {
        total_hours:        total,
        billable_hours:     billable,
        non_billable_hours: tm.reduce((s, m) => s + m.non_billable_hours, 0),
        billable_pct:       total > 0 ? (billable / total) * 100 : 0,
        active_members:     tm.length,
        total_entries:      tm.reduce((s, m) => s + m.entries_count, 0),
      };
    }
    return data.summary;
  }, [data, selectedMember, teamMemberIds]);

  // Filtered members for the table
  const filtered = useMemo(() => {
    if (!data?.members) return [];
    let list = selectedUserId
      ? data.members.filter((m) => m.user_id === selectedUserId)
      : teamMemberIds
      ? data.members.filter((m) => teamMemberIds.has(m.user_id))
      : data.members;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) => m.user_name.toLowerCase().includes(q) || (m.org_role_name ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [data?.members, selectedUserId, teamMemberIds, search]);

  // Chart — selected user shows per-project, otherwise top-10 members (scoped to team)
  const chartData = useMemo(() => {
    if (!data) return [];
    if (selectedMember) {
      return selectedMember.by_project.slice(0, 10).map((p) => ({
        name:           p.project_name.length > 14 ? p.project_name.slice(0, 13) + '…' : p.project_name,
        Billable:       p.billable_hours,
        'Non-Billable': p.non_billable_hours,
      }));
    }
    const source = teamMemberIds
      ? data.members.filter((m) => teamMemberIds.has(m.user_id))
      : data.members;
    return source.slice(0, 10).map((m) => ({
      name:           m.user_name.split(' ')[0],
      Billable:       m.billable_hours,
      'Non-Billable': m.non_billable_hours,
    }));
  }, [data, selectedMember, teamMemberIds]);

  const chartTitle = selectedMember
    ? `${selectedMember.user_name} — Hours by Project`
    : selectedTeam
    ? `${selectedTeam.name} — Billable vs Non-Billable (Top ${chartData.length})`
    : `Billable vs Non-Billable — Top ${chartData.length} members`;

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Activity</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Billable vs non-billable hours across your team
            {data?.period && (
              <span className="ml-1 text-gray-400">
                · {data.period.from} – {data.period.to}
              </span>
            )}
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Team picker */}
          <TeamPicker
            teams={teams}
            selectedId={selectedTeamId}
            onChange={(id) => { setSelectedTeamId(id); setSelectedUserId(null); }}
          />

          {/* User picker — shown only once data is loaded */}
          {data && data.members.length > 0 && (
            <UserPicker
              members={userPickerMembers}
              selectedId={selectedUserId}
              onChange={setSelectedUserId}
            />
          )}

          {/* Period selector */}
          <div className="flex rounded-xl overflow-hidden border border-gray-200 text-sm">
            {(Object.keys(PERIOD_LABELS) as Period[]).filter((p) => p !== 'custom').map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  period === p
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
            <button
              onClick={() => setPeriod('custom')}
              className={`px-3 py-1.5 font-medium flex items-center gap-1 transition-colors ${
                period === 'custom'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <CalendarDays size={13} /> Custom
            </button>
          </div>

          {period === 'custom' && (
            <div className="flex items-center gap-2 text-sm">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <span className="text-gray-400">–</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          )}
        </div>
      </div>

      {/* Loading / error state */}
      {isLoading && (
        <div className="flex items-center justify-center py-24 text-gray-400 gap-2">
          <Activity size={18} className="animate-pulse" />
          <span className="text-sm">Loading team activity…</span>
        </div>
      )}

      {isError && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center text-sm text-red-600">
          {(error as Error & { status?: number })?.status === 403
            ? <>You don&apos;t have permission to view team analytics. Ask an admin to grant the <strong>Team Activity Analytics</strong> permission.</>
            : <>Failed to load analytics — the time tracking service may be unavailable. Please try again shortly.</>
          }
        </div>
      )}

      {!isLoading && !isError && data && summary && (
        <>
          {/* Team banner */}
          {selectedTeam && !selectedMember && (
            <div className="flex items-center gap-3 bg-violet-50 border border-violet-100 rounded-2xl px-4 py-3">
              <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                <Users size={18} className="text-violet-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-violet-900">{selectedTeam.name}</p>
                <p className="text-xs text-violet-500">
                  {selectedTeam.memberCount} member{selectedTeam.memberCount !== 1 ? 's' : ''}
                  {userPickerMembers.length < selectedTeam.memberCount && (
                    <span> · {userPickerMembers.length} with time data</span>
                  )}
                </p>
              </div>
              <button
                onClick={() => setSelectedTeamId(null)}
                className="ml-auto text-violet-400 hover:text-violet-600 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* Selected user banner */}
          {selectedMember && (
            <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3">
              <UserAvatar name={selectedMember.user_name} avatarUrl={selectedMember.user_avatar_url} size="md" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-indigo-900">{selectedMember.user_name}</p>
                {selectedMember.org_role_name && (
                  <p className="text-xs text-indigo-500">{selectedMember.org_role_name}</p>
                )}
              </div>
              <button
                onClick={() => setSelectedUserId(null)}
                className="ml-auto text-indigo-400 hover:text-indigo-600 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* Summary cards — always on top */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={<Clock size={18} className="text-indigo-600" />}
              label="Total Hours"
              value={`${fmt(summary.total_hours)}h`}
              sub={`${summary.total_entries} entries`}
              color="bg-indigo-50"
            />
            <StatCard
              icon={<DollarSign size={18} className="text-emerald-600" />}
              label="Billable Hours"
              value={`${fmt(summary.billable_hours)}h`}
              sub={`${summary.billable_pct.toFixed(1)}% of total`}
              color="bg-emerald-50"
            />
            <StatCard
              icon={<TrendingUp size={18} className="text-amber-600" />}
              label="Non-Billable"
              value={`${fmt(summary.non_billable_hours)}h`}
              sub={`${(100 - summary.billable_pct).toFixed(1)}% of total`}
              color="bg-amber-50"
            />
            <StatCard
              icon={<Users size={18} className="text-violet-600" />}
              label={selectedMember ? 'Days Logged' : 'Active Members'}
              value={selectedMember ? String(summary.active_members) : String(summary.active_members)}
              sub={selectedMember ? 'days with time entries' : 'logged at least 1 entry'}
              color="bg-violet-50"
            />
          </div>

          {/* Best performers — all-members / team view */}
          {!selectedMember && (
            <TopPerformers
              members={teamMemberIds ? data.members.filter((m) => teamMemberIds.has(m.user_id)) : data.members}
            />
          )}

          {chartData.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">{chartTitle}</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} unit="h" />
                  <Tooltip
                    formatter={(val: number, name: string) => [`${fmt(val)}h`, name]}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }}
                  />
                  <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Billable" fill="#10b981" radius={[4, 4, 0, 0]} stackId="a" />
                  <Bar dataKey="Non-Billable" fill="#f59e0b" radius={[4, 4, 0, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Per-user time charts */}
          {selectedMember && (
            <UserActivityCharts
              member={selectedMember}
              activity={activityData}
              loading={activityLoading}
            />
          )}

          {/* Member table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-gray-700">
                {selectedMember ? 'Member Detail' : 'Member Breakdown'}
                <span className="ml-2 text-xs font-normal text-gray-400">{filtered.length} member{filtered.length !== 1 ? 's' : ''}</span>
              </h2>
              {!selectedMember && (
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search members…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 w-52"
                  />
                </div>
              )}
            </div>

            {filtered.length === 0 ? (
              <div className="py-16 text-center text-sm text-gray-400">
                No members logged time in this period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
                      <th className="px-4 py-3 font-medium">Member</th>
                      <th className="px-4 py-3 font-medium text-right">Total</th>
                      <th className="px-4 py-3 font-medium text-right text-emerald-600">Billable</th>
                      <th className="px-4 py-3 font-medium text-right">Non-Billable</th>
                      <th className="px-4 py-3 font-medium w-40">Billable %</th>
                      <th className="px-4 py-3 font-medium text-center">Days</th>
                      <th className="px-4 py-3 font-medium text-center">Entries</th>
                      <th className="px-4 py-3 font-medium text-center">Status</th>
                      <th className="px-4 py-3 w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((m) => (
                      <MemberRow key={m.user_id} member={m} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Attendance insights — always last */}
          {selectedMember && (
            <AttendanceSection
              records={attendanceData ?? []}
              loading={attendanceLoading}
            />
          )}
        </>
      )}

      {!isLoading && !isError && !enabled && (
        <div className="py-16 text-center text-sm text-gray-400">
          Select a start and end date to load custom range data.
        </div>
      )}
    </div>
  );
}
