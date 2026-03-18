import React, { useState } from 'react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as ReTooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  BarChart, Bar, Legend,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle,
  RefreshCw, Download, Sparkles, Brain, Target, Users, Activity,
  Shield, Clock, BarChart2, ChevronRight, Zap, Lightbulb, ArrowRight,
} from 'lucide-react';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import { PageLoader } from '../components/ui/Spinner';
import Alert from '../components/ui/Alert';
import { useExecSummary, type ExecProject } from '../hooks/useExecDashboard';
import { useAiProjectHealth, useAiSuggestions, useAiDetectBlockers, useAiTrends } from '../hooks/useAiInsights';
import { format, parseISO } from 'date-fns';

// ─── Constants ────────────────────────────────────────────────────────────────

const RAG_COLORS  = { GREEN: '#22c55e', AMBER: '#f59e0b', RED: '#ef4444' };
const RAG_LABELS  = { GREEN: 'On Track', AMBER: 'At Risk', RED: 'Delayed' };
const CHART_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd'];

// ─── Small helpers ─────────────────────────────────────────────────────────

const scoreColor = (n: number) =>
  n >= 75 ? 'text-green-600' : n >= 50 ? 'text-amber-600' : 'text-red-600';
const scoreBg = (n: number) =>
  n >= 75 ? 'bg-green-500' : n >= 50 ? 'bg-amber-500' : 'bg-red-500';

const fmtDate = (d: string) => {
  try { return format(parseISO(d), 'dd MMM'); } catch { return d; }
};

function downloadJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accent: string;   // tailwind bg class for icon
  trend?: 'up' | 'down' | 'neutral';
  alert?: boolean;
}

const KpiCard = ({ label, value, sub, icon, accent, trend, alert }: KpiCardProps) => (
  <div className={`bg-white rounded-2xl border shadow-sm p-5 flex items-start gap-4 ${alert ? 'border-red-200 bg-red-50/40' : 'border-gray-100'}`}>
    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${accent}`}>
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <div className="flex items-end gap-2 mt-0.5">
        <span className={`text-2xl font-bold ${alert ? 'text-red-600' : 'text-gray-900'}`}>{value}</span>
        {trend === 'up'      && <TrendingUp  size={15} className="text-green-500 mb-1" />}
        {trend === 'down'    && <TrendingDown size={15} className="text-red-500 mb-1" />}
        {trend === 'neutral' && <Minus        size={15} className="text-gray-400 mb-1" />}
      </div>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

// ─── Health Score Ring ────────────────────────────────────────────────────────

const HealthRing = ({ score }: { score: number }) => {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative flex items-center justify-center w-32 h-32">
      <svg width="128" height="128" className="-rotate-90">
        <circle cx="64" cy="64" r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${fill} ${circ - fill}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-bold ${scoreColor(score)}`}>{score}</span>
        <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Health</span>
      </div>
    </div>
  );
};

// ─── RAG Donut ─────────────────────────────────────────────────────────────

const RagDonut = ({ byRag }: { byRag: { RED: number; AMBER: number; GREEN: number } }) => {
  const data = [
    { name: RAG_LABELS.GREEN, value: byRag.GREEN, color: RAG_COLORS.GREEN },
    { name: RAG_LABELS.AMBER, value: byRag.AMBER, color: RAG_COLORS.AMBER },
    { name: RAG_LABELS.RED,   value: byRag.RED,   color: RAG_COLORS.RED   },
  ].filter(d => d.value > 0);

  if (data.every(d => d.value === 0)) {
    return <div className="flex items-center justify-center h-40 text-sm text-gray-400">No active projects</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={52} outerRadius={78}
          paddingAngle={3} dataKey="value" strokeWidth={0}>
          {data.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
        </Pie>
        <ReTooltip formatter={(v: number, name: string) => [`${v} project(s)`, name]} />
      </PieChart>
    </ResponsiveContainer>
  );
};

// ─── Activity Trend ──────────────────────────────────────────────────────────

const ActivityTrend = ({ trend }: { trend: { date: string; standups: number; eods: number }[] }) => (
  <ResponsiveContainer width="100%" height={200}>
    <AreaChart data={trend.map(d => ({ ...d, date: fmtDate(d.date) }))}
      margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
      <defs>
        <linearGradient id="gStandup" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.4} />
          <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05} />
        </linearGradient>
        <linearGradient id="gEod" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.4} />
          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
      <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
      <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
      <ReTooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
      <Legend wrapperStyle={{ fontSize: 12 }} />
      <Area type="monotone" dataKey="standups" name="Standups" stroke="#6366f1"
        fill="url(#gStandup)" strokeWidth={2} />
      <Area type="monotone" dataKey="eods" name="EODs" stroke="#8b5cf6"
        fill="url(#gEod)" strokeWidth={2} />
    </AreaChart>
  </ResponsiveContainer>
);

// ─── Project Milestone Bar ────────────────────────────────────────────────────

const MilestoneBar = ({ projects }: { projects: ExecProject[] }) => {
  const data = projects
    .filter(p => p.totalMilestones > 0)
    .slice(0, 8)
    .map(p => ({
      name:      p.name.length > 14 ? p.name.slice(0, 14) + '…' : p.name,
      done:      p.completedMilestones,
      remaining: p.totalMilestones - p.completedMilestones,
    }));

  if (!data.length) return (
    <div className="flex items-center justify-center h-40 text-sm text-gray-400">No milestones data</div>
  );

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 4 }} barSize={14}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <ReTooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="done"      name="Completed" fill="#22c55e" radius={[3, 3, 0, 0]} stackId="ms" />
        <Bar dataKey="remaining" name="Remaining" fill="#e5e7eb" radius={[3, 3, 0, 0]} stackId="ms" />
      </BarChart>
    </ResponsiveContainer>
  );
};

// ─── RAG Badge ────────────────────────────────────────────────────────────────

const RagBadge = ({ status }: { status: string }) => {
  const cfg: Record<string, string> = {
    GREEN: 'bg-green-100 text-green-700 border-green-200',
    AMBER: 'bg-amber-100 text-amber-700 border-amber-200',
    RED:   'bg-red-100 text-red-700 border-red-200',
  };
  const labels: Record<string, string> = { GREEN: 'On Track', AMBER: 'At Risk', RED: 'Delayed' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${cfg[status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === 'GREEN' ? 'bg-green-500' : status === 'AMBER' ? 'bg-amber-500' : 'bg-red-500'}`} />
      {labels[status] ?? status}
    </span>
  );
};

// ─── Section header ───────────────────────────────────────────────────────────

const SectionHeader = ({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) => (
  <div className="flex items-center gap-2 mb-4">
    <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">{icon}</div>
    <div>
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  </div>
);

// ─── AI Brief Panel ───────────────────────────────────────────────────────────

const AiBriefPanel = ({
  aiHealth, aiSuggests, aiBlockers, aiTrends, onRun, loading,
}: {
  aiHealth: any; aiSuggests: any; aiBlockers: any; aiTrends: any;
  onRun: () => void; loading: boolean;
}) => {
  const health   = aiHealth?.data;
  const suggests = aiSuggests?.data;
  const blockers = aiBlockers?.data?.data;
  const trends   = aiTrends?.data?.data;

  const hasAny = health || suggests || blockers || trends;

  if (!hasAny) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
          <Brain size={28} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800">AI Executive Brief</p>
          <p className="text-xs text-gray-400 mt-1 max-w-xs">
            One click — portfolio health, delivery risks, team pulse, and strategic recommendations tailored for you.
          </p>
        </div>
        <button onClick={onRun} disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-60 shadow-sm transition-all">
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {loading ? 'Generating brief…' : 'Generate AI Brief'}
        </button>
      </div>
    );
  }

  const riskLevel  = suggests?.overallRiskLevel ?? 'medium';
  const riskColors: Record<string, string> = {
    high:   'bg-red-100 text-red-700 border-red-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    low:    'bg-green-100 text-green-700 border-green-200',
  };

  return (
    <div className="space-y-4 overflow-y-auto max-h-[520px] pr-1">

      {/* ── Header row: portfolio status + risk level + refresh ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {health?.overallStatus && (
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border
            ${health.overallStatus === 'On Track' ? 'bg-green-100 text-green-700 border-green-200' :
              health.overallStatus === 'At Risk'  ? 'bg-amber-100 text-amber-700 border-amber-200' :
              'bg-red-100 text-red-700 border-red-200'}`}>
            {health.overallStatus === 'On Track' ? <CheckCircle size={11} /> :
             health.overallStatus === 'At Risk'  ? <AlertTriangle size={11} /> :
             <TrendingDown size={11} />}
            {health.overallStatus}
          </span>
        )}
        {suggests?.overallRiskLevel && (
          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border capitalize ${riskColors[riskLevel] ?? riskColors.medium}`}>
            <Shield size={11} /> Risk: {suggests.overallRiskLevel}
          </span>
        )}
        {(trends?.productivityTrend || trends?.engagementTrend) && (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border bg-blue-50 text-blue-700 border-blue-200 capitalize">
            <Users size={11} /> Team: {trends.engagementTrend ?? trends.productivityTrend}
          </span>
        )}
        <button onClick={onRun} disabled={loading}
          className="ml-auto flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 transition-colors shrink-0">
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* ── AI Health Score bar ── */}
      {health?.score !== undefined && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">AI Portfolio Score</p>
            <span className={`text-sm font-bold ${scoreColor(health.score)}`}>{health.score}/100</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${scoreBg(health.score)}`}
              style={{ width: `${health.score}%` }} />
          </div>
        </div>
      )}

      {/* ── Immediate Actions (red alert box) ── */}
      {suggests?.immediateActions?.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <p className="text-[11px] font-bold text-red-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Zap size={12} /> Requires Your Immediate Attention
          </p>
          <ul className="space-y-1.5">
            {suggests.immediateActions.slice(0, 4).map((a: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-xs text-red-800 leading-snug">
                <ArrowRight size={11} className="mt-0.5 shrink-0 text-red-500" />{a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Portfolio Reasons / Status Drivers ── */}
      {health?.reasons?.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Activity size={11} className="text-violet-500" /> Portfolio Status Drivers
          </p>
          <ul className="space-y-1.5">
            {health.reasons.slice(0, 3).map((r: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-700 leading-snug">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />{r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Detected Blockers summary ── */}
      {blockers && (blockers.critical_count > 0 || blockers.blockers?.length > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <AlertTriangle size={12} /> Detected Delivery Blockers
            {blockers.critical_count > 0 && (
              <span className="ml-auto bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {blockers.critical_count} critical
              </span>
            )}
          </p>
          {blockers.summary && (
            <p className="text-xs text-amber-900 mb-2 leading-snug">{blockers.summary}</p>
          )}
          {blockers.blockers?.slice(0, 3).map((b: any, i: number) => (
            <div key={i} className="flex items-start gap-2 text-xs text-amber-800 mb-1 leading-snug">
              <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                (b.severity ?? '').toLowerCase() === 'high' || (b.severity ?? '').toLowerCase() === 'critical'
                  ? 'bg-red-500' : 'bg-amber-500'}`} />
              <span className="flex-1">{b.text}</span>
              {b.suggested_action && (
                <span className="text-[10px] text-blue-600 shrink-0 italic">→ {b.suggested_action}</span>
              )}
            </div>
          ))}
          {blockers.requires_immediate_action && (
            <p className="text-[10px] font-bold text-red-600 mt-1.5 flex items-center gap-1">
              <Zap size={10} /> Escalation recommended
            </p>
          )}
        </div>
      )}

      {/* ── Team Pulse ── */}
      {trends && (
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Users size={11} className="text-blue-500" /> Team Pulse
          </p>
          <div className="flex flex-wrap gap-2 mb-2">
            {[
              { label: 'Productivity', value: trends.productivityTrend, base: 'blue' },
              { label: 'Engagement',   value: trends.engagementTrend,   base: 'violet' },
              { label: 'Mood',         value: trends.moodTrend,          base: 'green' },
            ].filter(t => t.value).map(t => (
              <span key={t.label}
                className={`text-[11px] px-2 py-0.5 rounded-full border capitalize
                  bg-${t.base}-50 text-${t.base}-700 border-${t.base}-200`}>
                {t.label}: <strong>{t.value}</strong>
              </span>
            ))}
          </div>
          {trends.insights?.slice(0, 2).map((ins: string, i: number) => (
            <p key={i} className="text-xs text-gray-700 leading-snug mb-1 flex items-start gap-1.5">
              <Lightbulb size={11} className="text-amber-400 mt-0.5 shrink-0" />{ins}
            </p>
          ))}
          {trends.riskAreas?.length > 0 && (
            <p className="text-[11px] text-red-600 mt-1 flex items-start gap-1">
              <AlertTriangle size={10} className="mt-0.5 shrink-0" />
              Risk areas: {trends.riskAreas.slice(0, 2).join(' · ')}
            </p>
          )}
        </div>
      )}

      {/* ── Risk Mitigation ── */}
      {suggests?.riskMitigation?.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Shield size={11} className="text-red-500" /> Risk Mitigation
          </p>
          <ul className="space-y-2">
            {suggests.riskMitigation.slice(0, 3).map((item: any, i: number) => (
              <li key={i} className="flex items-start gap-2">
                <span className={`mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase shrink-0
                  ${item.priority === 'high' ? 'bg-red-100 text-red-700' :
                    item.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-500'}`}>
                  {item.priority}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-800 leading-snug">{item.suggestion}</p>
                  {item.impact && <p className="text-[11px] text-gray-400 mt-0.5">Impact: {item.impact}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Strategic Recommendations ── */}
      {(health?.recommendations?.length > 0 || suggests?.productivity?.length > 0) && (
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Target size={11} className="text-indigo-500" /> Strategic Recommendations
          </p>
          <ul className="space-y-1.5">
            {[
              ...(health?.recommendations ?? []),
              ...(suggests?.productivity?.map((p: any) => p.suggestion) ?? []),
            ].slice(0, 5).map((r: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-700 leading-snug">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />{r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Resource Allocation ── */}
      {suggests?.resourceAllocation?.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
          <p className="text-[11px] font-bold text-indigo-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Users size={11} /> Resource & Team Suggestions
          </p>
          <ul className="space-y-1.5">
            {suggests.resourceAllocation.slice(0, 3).map((item: any, i: number) => (
              <li key={i} className="text-xs text-indigo-900 leading-snug flex items-start gap-2">
                <ArrowRight size={11} className="mt-0.5 shrink-0 text-indigo-400" />
                <span>{item.suggestion}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Risk Flags ── */}
      {health?.riskFlags?.length > 0 && (
        <div className="border-t border-gray-100 pt-3">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Risk Flags</p>
          <div className="flex flex-wrap gap-1.5">
            {health.riskFlags.map((flag: string, i: number) => (
              <span key={i} className="text-[11px] px-2 py-0.5 bg-red-50 text-red-600 border border-red-100 rounded-full">
                {flag}
              </span>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};

// ─── CEO Dashboard Page ───────────────────────────────────────────────────────

const CeoDashboardPage = () => {
  const { data, isLoading, error, refetch, dataUpdatedAt } = useExecSummary();
  const aiHealth   = useAiProjectHealth();
  const aiSuggests = useAiSuggestions();
  const aiBlockers = useAiDetectBlockers();
  const aiTrends   = useAiTrends();
  const [showAllProjects, setShowAllProjects] = useState(false);

  const lastUpdated = dataUpdatedAt
    ? format(new Date(dataUpdatedAt), 'HH:mm')
    : null;

  if (isLoading) return (
    <Layout><div className="flex items-center justify-center h-[60vh]"><PageLoader /></div></Layout>
  );
  if (error) return (
    <Layout><div className="p-8"><Alert type="error" message={(error as Error).message} /></div></Layout>
  );
  if (!data) return null;

  const { portfolio, milestones, actions, blockers, risks, teams, standups, activityTrend, projects, topBlockers } = data;

  const displayedProjects = showAllProjects ? projects : projects.slice(0, 6);

  const ragPieData = [
    { name: 'On Track', value: portfolio.byRag.GREEN, color: RAG_COLORS.GREEN },
    { name: 'At Risk',  value: portfolio.byRag.AMBER, color: RAG_COLORS.AMBER },
    { name: 'Delayed',  value: portfolio.byRag.RED,   color: RAG_COLORS.RED   },
  ];

  return (
    <Layout>
      <Header
        title="CEO Dashboard"
        subtitle={`Executive portfolio overview${lastUpdated ? ` · Updated ${lastUpdated}` : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => refetch()}
              className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <RefreshCw size={13} /> Refresh
            </button>
            <button
              onClick={() => downloadJSON(data, `ceo-dashboard-${format(new Date(), 'yyyy-MM-dd')}.json`)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <Download size={13} /> Export
            </button>
          </div>
        }
      />

      <div className="p-6 space-y-6">

        {/* ── KPI Row ───────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <KpiCard
            label="Portfolio Health"
            value={`${portfolio.healthScore}%`}
            sub={`${portfolio.active} active projects`}
            icon={<Target size={20} className="text-white" />}
            accent={portfolio.healthScore >= 75 ? 'bg-green-500' : portfolio.healthScore >= 50 ? 'bg-amber-500' : 'bg-red-500'}
            trend={portfolio.healthScore >= 70 ? 'up' : 'down'}
          />
          <KpiCard
            label="Active Projects"
            value={portfolio.active}
            sub={`${portfolio.completed} completed · ${portfolio.onHold} on hold`}
            icon={<BarChart2 size={20} className="text-white" />}
            accent="bg-indigo-500"
          />
          <KpiCard
            label="Open Risks"
            value={risks.open}
            sub={`${risks.critical} critical`}
            icon={<Shield size={20} className="text-white" />}
            accent={risks.critical > 0 ? 'bg-red-500' : 'bg-amber-500'}
            alert={risks.critical > 0}
            trend={risks.critical > 0 ? 'down' : 'neutral'}
          />
          <KpiCard
            label="Overdue Actions"
            value={actions.overdue}
            sub={`${actions.completionRate}% completion rate`}
            icon={<CheckCircle size={20} className="text-white" />}
            accent={actions.overdue > 0 ? 'bg-red-500' : 'bg-green-500'}
            alert={actions.overdue > 5}
          />
          <KpiCard
            label="Team Velocity"
            value={`${standups.submissionRateLast7d}%`}
            sub={`${teams.memberCount} people · ${teams.total} teams`}
            icon={<Users size={20} className="text-white" />}
            accent="bg-violet-500"
            trend={standups.submissionRateLast7d >= 70 ? 'up' : 'down'}
          />
        </div>

        {/* ── Portfolio Health + AI Brief ───────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* RAG donut + breakdown */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <SectionHeader
              icon={<Activity size={15} className="text-indigo-600" />}
              title="Portfolio Health"
              sub="Projects by RAG status"
            />
            <div className="flex items-center gap-4">
              <HealthRing score={portfolio.healthScore} />
              <div className="flex-1 space-y-3">
                {ragPieData.map(d => (
                  <div key={d.name} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="text-xs text-gray-600 flex-1">{d.name}</span>
                    <span className="text-sm font-bold text-gray-800">{d.value}</span>
                  </div>
                ))}
                <div className="border-t border-gray-100 pt-2 mt-1">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Milestones</span>
                    <span className="font-semibold text-gray-700">{milestones.completionRate}% done</span>
                  </div>
                  <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${milestones.completionRate}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Actions</span>
                    <span className="font-semibold text-gray-700">{actions.completionRate}% done</span>
                  </div>
                  <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-500 rounded-full"
                      style={{ width: `${actions.completionRate}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* RAG donut chart */}
            <div className="mt-2">
              <RagDonut byRag={portfolio.byRag} />
            </div>
          </div>

          {/* AI Executive Brief */}
          <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <SectionHeader
                icon={<Brain size={15} className="text-violet-600" />}
                title="AI Executive Brief"
                sub="Powered by Qwen 30B"
              />
            </div>
            <AiBriefPanel
              aiHealth={aiHealth.data}
              aiSuggests={aiSuggests.data}
              aiBlockers={aiBlockers}
              aiTrends={aiTrends}
              onRun={() => {
                aiHealth.mutate({});
                aiSuggests.mutate({});
                aiBlockers.mutate({ days: 14 });
                aiTrends.mutate({ days: 14 });
              }}
              loading={aiHealth.isPending || aiSuggests.isPending || aiBlockers.isPending || aiTrends.isPending}
            />
          </div>
        </div>

        {/* ── Activity Trend + Milestone Progress ──────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Activity trend */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <SectionHeader
              icon={<Activity size={15} className="text-indigo-600" />}
              title="Team Activity Trend"
              sub="Standups &amp; EODs submitted — last 7 days"
            />
            <ActivityTrend trend={activityTrend} />
            <div className="flex items-center gap-6 mt-3 pt-3 border-t border-gray-100">
              <div>
                <p className="text-xs text-gray-400">Submitted Today</p>
                <p className="text-base font-bold text-gray-800">{standups.submittedToday} standups · {data.eods.submittedToday} EODs</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs text-gray-400">7-day Submission Rate</p>
                <p className={`text-base font-bold ${standups.submissionRateLast7d >= 70 ? 'text-green-600' : 'text-amber-600'}`}>
                  {standups.submissionRateLast7d}%
                </p>
              </div>
            </div>
          </div>

          {/* Milestone progress by project */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <SectionHeader
              icon={<Target size={15} className="text-green-600" />}
              title="Milestone Progress"
              sub="Completed vs remaining per project"
            />
            <MilestoneBar projects={projects} />
            <div className="flex items-center gap-6 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
              <span>{milestones.completed} completed</span>
              <span className="text-red-600 font-semibold">{milestones.overdue} overdue</span>
              <span className="text-blue-600">{milestones.upcoming7days} due in 7 days</span>
            </div>
          </div>
        </div>

        {/* ── Project Portfolio Table ───────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <SectionHeader
              icon={<BarChart2 size={15} className="text-indigo-600" />}
              title="Project Portfolio"
              sub={`${portfolio.active} active projects`}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  {['Project', 'Status', 'Milestones', 'Blockers', 'Actions Overdue', 'Health'].map(h => (
                    <th key={h} className="text-left py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {displayedProjects.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-medium text-gray-900">{p.name}</span>
                      {p.endDate && (
                        <p className="text-[11px] text-gray-400 mt-0.5">Due {fmtDate(p.endDate)}</p>
                      )}
                    </td>
                    <td className="py-3 px-4"><RagBadge status={p.ragStatus} /></td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-green-400 rounded-full"
                            style={{ width: `${p.milestoneProgress}%` }} />
                        </div>
                        <span className="text-xs text-gray-600">{p.milestoneProgress}%</span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5">{p.completedMilestones}/{p.totalMilestones}</p>
                    </td>
                    <td className="py-3 px-4">
                      {p.openBlockers > 0 ? (
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${p.criticalBlockers > 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          <AlertTriangle size={11} /> {p.openBlockers}
                        </span>
                      ) : (
                        <span className="text-xs text-green-600">None</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {p.overdueActions > 0 ? (
                        <span className="text-xs font-semibold text-red-600">{p.overdueActions}</span>
                      ) : (
                        <span className="text-xs text-green-600">0</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${scoreBg(p.healthScore)}`}
                            style={{ width: `${p.healthScore}%` }} />
                        </div>
                        <span className={`text-xs font-bold ${scoreColor(p.healthScore)}`}>{p.healthScore}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {projects.length > 6 && (
            <div className="px-5 py-3 border-t border-gray-100">
              <button onClick={() => setShowAllProjects(v => !v)}
                className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors">
                {showAllProjects ? 'Show less' : `Show all ${projects.length} projects`}
                <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>

        {/* ── Key Risks & Blockers ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Top blockers */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <SectionHeader
              icon={<AlertTriangle size={15} className="text-red-500" />}
              title="Critical & High Blockers"
              sub={`${blockers.critical} critical · ${blockers.high} high · ${blockers.medium} medium`}
            />
            {topBlockers.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm">
                <CheckCircle size={16} /> No critical or high severity blockers
              </div>
            ) : (
              <div className="space-y-2">
                {topBlockers.slice(0, 6).map(b => {
                  const proj = projects.find(p => p.id === b.projectId);
                  return (
                    <div key={b.id} className={`flex items-start gap-3 p-3 rounded-xl border ${b.severity === 'CRITICAL' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                      <AlertTriangle size={14} className={b.severity === 'CRITICAL' ? 'text-red-500 mt-0.5 shrink-0' : 'text-amber-500 mt-0.5 shrink-0'} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">{b.title}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{proj?.name ?? `Project ${b.projectId}`}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0 ${b.severity === 'CRITICAL' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {b.severity}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* KPI summary cards */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <SectionHeader
              icon={<Clock size={15} className="text-indigo-600" />}
              title="Delivery Metrics"
              sub="Key operational statistics"
            />
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Milestones Overdue', value: milestones.overdue, alert: milestones.overdue > 0, icon: <TrendingDown size={14} /> },
                { label: 'Due in 7 Days',     value: milestones.upcoming7days, alert: false, icon: <Clock size={14} /> },
                { label: 'Open Risks',         value: risks.open,    alert: risks.critical > 0, icon: <Shield size={14} /> },
                { label: 'Open Dependencies',  value: data.dependencies.open,  alert: false, icon: <Activity size={14} /> },
                { label: 'Decisions (Month)',  value: data.decisions.thisMonth, alert: false, icon: <CheckCircle size={14} /> },
                { label: 'Active Blockers',    value: blockers.open, alert: blockers.critical > 0, icon: <AlertTriangle size={14} /> },
              ].map(item => (
                <div key={item.label} className={`p-3 rounded-xl border ${item.alert ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'}`}>
                  <div className={`flex items-center gap-1 ${item.alert ? 'text-red-500' : 'text-gray-400'} mb-1`}>
                    {item.icon}
                    <span className="text-[10px] font-medium">{item.label}</span>
                  </div>
                  <p className={`text-xl font-bold ${item.alert ? 'text-red-600' : 'text-gray-800'}`}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </Layout>
  );
};

export default CeoDashboardPage;
