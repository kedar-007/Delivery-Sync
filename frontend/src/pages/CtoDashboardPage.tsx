import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as ReTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  LineChart, Line,
} from 'recharts';
import {
  AlertTriangle, CheckCircle, Clock, RefreshCw, Download, Sparkles,
  Brain, TrendingDown, TrendingUp, Minus, Shield, Zap,
  Activity, BarChart2, ChevronRight, Target, Search, Filter,
} from 'lucide-react';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import { PageLoader } from '../components/ui/Spinner';
import Alert from '../components/ui/Alert';
import { useExecSummary, type ExecProject } from '../hooks/useExecDashboard';
import {
  useAiDetectBlockers, useAiTrends, useAiProjectHealth,
} from '../hooks/useAiInsights';
import { useProjects } from '../hooks/useProjects';
import { format, parseISO, differenceInDays } from 'date-fns';

// ─── Constants ────────────────────────────────────────────────────────────────

const SEV_COLORS: Record<string, string> = {
  CRITICAL: '#ef4444', HIGH: '#f59e0b', MEDIUM: '#6366f1', LOW: '#22c55e',
};
const RAG_COLORS: Record<string, string> = {
  GREEN: '#22c55e', AMBER: '#f59e0b', RED: '#ef4444',
};

// ─── Utils ────────────────────────────────────────────────────────────────────

const fmtDate = (d: string) => {
  try { return format(parseISO(d), 'dd MMM'); } catch { return d; }
};

const daysUntil = (d: string) => {
  try { return differenceInDays(parseISO(d), new Date()); } catch { return 0; }
};

const scoreColor = (n: number) =>
  n >= 75 ? 'text-green-600' : n >= 50 ? 'text-amber-600' : 'text-red-600';
const scoreBg = (n: number) =>
  n >= 75 ? 'bg-green-500' : n >= 50 ? 'bg-amber-500' : 'bg-red-500';

function downloadJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

const KpiCard = ({
  label, value, sub, icon, accent, trend, alert,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; accent: string;
  trend?: 'up' | 'down' | 'neutral'; alert?: boolean;
}) => (
  <div className={`bg-white rounded-2xl border shadow-sm p-4 flex items-start gap-3 ${alert ? 'border-red-200 bg-red-50/30' : 'border-gray-100'}`}>
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accent}`}>
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <div className="flex items-end gap-1.5 mt-0.5">
        <span className={`text-xl font-bold ${alert ? 'text-red-600' : 'text-gray-900'}`}>{value}</span>
        {trend === 'up'      && <TrendingUp  size={13} className="text-green-500 mb-0.5" />}
        {trend === 'down'    && <TrendingDown size={13} className="text-red-500 mb-0.5" />}
        {trend === 'neutral' && <Minus        size={13} className="text-gray-400 mb-0.5" />}
      </div>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

// ─── Section Card ─────────────────────────────────────────────────────────────

const SectionCard = ({
  title, icon, sub, actions, children, className = '',
}: {
  title: string; icon: React.ReactNode; sub?: string;
  actions?: React.ReactNode; children: React.ReactNode; className?: string;
}) => (
  <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${className}`}>
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">{icon}</div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
        </div>
      </div>
      {actions}
    </div>
    <div className="p-5">{children}</div>
  </div>
);

// ─── RAG badge ────────────────────────────────────────────────────────────────

const RagBadge = ({ status }: { status: string }) => {
  const cfg: Record<string, string> = {
    GREEN: 'bg-green-100 text-green-700', AMBER: 'bg-amber-100 text-amber-700', RED: 'bg-red-100 text-red-700',
  };
  const labels: Record<string, string> = { GREEN: 'On Track', AMBER: 'At Risk', RED: 'Delayed' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${cfg[status] ?? 'bg-gray-100 text-gray-600'}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: RAG_COLORS[status] ?? '#9ca3af' }} />
      {labels[status] ?? status}
    </span>
  );
};

// ─── Severity Badge ───────────────────────────────────────────────────────────

const SevBadge = ({ sev }: { sev: string }) => {
  const colors: Record<string, string> = {
    CRITICAL: 'bg-red-100 text-red-700', HIGH: 'bg-amber-100 text-amber-700',
    MEDIUM:   'bg-indigo-100 text-indigo-700', LOW: 'bg-green-100 text-green-700',
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${colors[sev] ?? 'bg-gray-100 text-gray-600'}`}>
      {sev}
    </span>
  );
};

// ─── Project Health Bar chart ─────────────────────────────────────────────────

const ProjectHealthChart = ({ projects }: { projects: ExecProject[] }) => {
  const data = projects.slice(0, 8).map(p => ({
    name:     p.name.length > 12 ? p.name.slice(0, 12) + '…' : p.name,
    health:   p.healthScore,
    milestones: p.milestoneProgress,
    fill:     RAG_COLORS[p.ragStatus] ?? '#9ca3af',
  }));

  return (
    <ResponsiveContainer width="100%" height={210}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 4 }} barSize={16}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
        <ReTooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
          formatter={(v: number, name: string) => [`${v}%`, name === 'health' ? 'Health Score' : 'Milestone Progress']} />
        <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => v === 'health' ? 'Health Score' : 'Milestone %'} />
        <Bar dataKey="milestones" name="milestones" fill="#c7d2fe" radius={[3, 3, 0, 0]} />
        <Bar dataKey="health"     name="health"     fill="#6366f1" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
};

// ─── Blocker Severity Pie ─────────────────────────────────────────────────────

const BlockerSeverityPie = ({ blockers }: { blockers: { critical: number; high: number; medium: number; low: number } }) => {
  const data = [
    { name: 'Critical', value: blockers.critical, color: SEV_COLORS.CRITICAL },
    { name: 'High',     value: blockers.high,     color: SEV_COLORS.HIGH },
    { name: 'Medium',   value: blockers.medium,   color: SEV_COLORS.MEDIUM },
    { name: 'Low',      value: blockers.low,       color: SEV_COLORS.LOW },
  ].filter(d => d.value > 0);

  if (!data.length) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-green-600">
        <CheckCircle size={32} />
        <p className="text-sm font-medium">No open blockers</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width="60%" height={180}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" outerRadius={72} innerRadius={36}
            paddingAngle={3} dataKey="value" strokeWidth={0}>
            {data.map(d => <Cell key={d.name} fill={d.color} />)}
          </Pie>
          <ReTooltip formatter={(v: number, n: string) => [`${v}`, n]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-2">
        {data.map(d => (
          <div key={d.name} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="text-xs text-gray-600 flex-1">{d.name}</span>
            <span className="text-sm font-bold" style={{ color: d.color }}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Velocity Line Chart ──────────────────────────────────────────────────────

const VelocityChart = ({ trend }: { trend: { date: string; standups: number; eods: number }[] }) => (
  <ResponsiveContainer width="100%" height={180}>
    <LineChart data={trend.map(d => ({ ...d, date: fmtDate(d.date) }))}
      margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
      <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
      <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
      <ReTooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
      <Legend wrapperStyle={{ fontSize: 11 }} />
      <Line type="monotone" dataKey="standups" name="Standups" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} />
      <Line type="monotone" dataKey="eods"     name="EODs"     stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 3 }} strokeDasharray="4 2" />
    </LineChart>
  </ResponsiveContainer>
);

// ─── AI Analysis Panel ────────────────────────────────────────────────────────

const AiAnalysisPanel = ({
  aiBlockers, aiTrends, aiHealth, onRun, loading,
}: {
  aiBlockers: any; aiTrends: any; aiHealth: any;
  onRun: () => void; loading: boolean;
}) => {
  const hasData = aiBlockers?.data || aiTrends?.data || aiHealth?.data;

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
          <Brain size={24} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800">AI Delivery Analysis</p>
          <p className="text-xs text-gray-400 mt-1">Detect blockers, analyze trends, and get root-cause insights for your delivery pipeline.</p>
        </div>
        <button onClick={onRun} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-60 shadow-sm transition-all">
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
          Run AI Analysis
        </button>
      </div>
    );
  }

  const blockerData = aiBlockers?.data?.data;
  const trendData   = aiTrends?.data?.data;
  const healthData  = aiHealth?.data?.data;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">AI-powered delivery analysis</span>
        <button onClick={onRun} disabled={loading}
          className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors">
          <RefreshCw size={11} /> Refresh
        </button>
      </div>

      {/* Blocker Detection */}
      {blockerData && (
        <div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 flex items-center gap-1">
            <AlertTriangle size={11} className="text-red-500" /> Detected Blockers
          </p>
          {blockerData.blockers?.length > 0 ? (
            <div className="space-y-2">
              {blockerData.blockers.slice(0, 4).map((b: any, i: number) => {
                const sev = (b.severity ?? 'MEDIUM').toUpperCase();
                return (
                  <div key={i} className={`p-2.5 rounded-xl border text-xs ${sev === 'HIGH' || sev === 'CRITICAL' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-gray-800 truncate flex-1">{b.text ?? b.blocker}</span>
                      <SevBadge sev={sev} />
                    </div>
                    {b.blocker_type && <p className="text-gray-400 text-[10px] capitalize">{b.blocker_type.replace(/_/g, ' ')}</p>}
                    {(b.suggested_action ?? b.recommendation) && (
                      <p className="text-blue-600 mt-0.5">→ {b.suggested_action ?? b.recommendation}</p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-xl px-3 py-2 flex items-center gap-2">
              <CheckCircle size={13} /> No critical blockers detected in recent activity
            </p>
          )}
          {blockerData.summary && (
            <p className="text-xs text-gray-500 mt-2 italic">{blockerData.summary}</p>
          )}
        </div>
      )}

      {/* Trend insights */}
      {trendData && (
        <div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 flex items-center gap-1">
            <TrendingUp size={11} className="text-blue-500" /> Delivery Trends
          </p>
          {/* Trend indicators */}
          {(trendData.productivityTrend || trendData.engagementTrend) && (
            <div className="flex flex-wrap gap-2 mb-2">
              {trendData.productivityTrend && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 capitalize">
                  Productivity: {trendData.productivityTrend}
                </span>
              )}
              {trendData.engagementTrend && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100 capitalize">
                  Engagement: {trendData.engagementTrend}
                </span>
              )}
              {trendData.moodTrend && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100 capitalize">
                  Mood: {trendData.moodTrend}
                </span>
              )}
            </div>
          )}
          {trendData.insights?.length > 0 && (
            <ul className="space-y-1 mb-2">
              {trendData.insights.slice(0, 3).map((insight: string, i: number) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
                  <span className="mt-1 w-1 h-1 rounded-full bg-blue-400 shrink-0" />{insight}
                </li>
              ))}
            </ul>
          )}
          {trendData.recommendations?.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <p className="text-[10px] font-bold text-blue-700 uppercase mb-1.5">Recommendations</p>
              <ul className="space-y-1">
                {trendData.recommendations.slice(0, 3).map((r: string, i: number) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-blue-800">
                    <span className="mt-1 w-1 h-1 rounded-full bg-blue-400 shrink-0" />{r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Health summary */}
      {healthData && (
        <div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 flex items-center gap-1">
            <Shield size={11} className="text-indigo-500" /> Portfolio Health
          </p>
          {healthData.overallStatus && (
            <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full mb-2
              ${healthData.overallStatus === 'On Track' ? 'bg-green-100 text-green-700' :
                healthData.overallStatus === 'At Risk' ? 'bg-amber-100 text-amber-700' :
                'bg-red-100 text-red-700'}`}>
              {healthData.overallStatus}
            </span>
          )}
          {healthData.reasons?.length > 0 && (
            <ul className="space-y-1">
              {healthData.reasons.slice(0, 3).map((r: string, i: number) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />{r}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

// ─── CTO Dashboard Page ───────────────────────────────────────────────────────

const CtoDashboardPage = () => {
  const { data, isLoading, error, refetch, dataUpdatedAt } = useExecSummary();
  const { data: projectList = [] } = useProjects();
  const aiBlockers = useAiDetectBlockers();
  const aiTrends   = useAiTrends();
  const aiHealth   = useAiProjectHealth();

  const [filterProject, setFilterProject] = useState('');
  const [search, setSearch] = useState('');
  const [showAllBlockers, setShowAllBlockers] = useState(false);

  const lastUpdated = dataUpdatedAt ? format(new Date(dataUpdatedAt), 'HH:mm') : null;

  const runAi = () => {
    const params = filterProject ? { projectId: filterProject } : {};
    aiBlockers.mutate({ ...params, days: 14 });
    aiTrends.mutate({ ...params, days: 14 });
    aiHealth.mutate(params);
  };

  const filteredProjects: ExecProject[] = useMemo(() => {
    if (!data) return [];
    let list = data.projects;
    if (filterProject) list = list.filter(p => p.id === filterProject);
    if (search)        list = list.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [data, filterProject, search]);

  if (isLoading) return (
    <Layout><div className="flex items-center justify-center h-[60vh]"><PageLoader /></div></Layout>
  );
  if (error) return (
    <Layout><div className="p-8"><Alert type="error" message={(error as Error).message} /></div></Layout>
  );
  if (!data) return null;

  const { portfolio, milestones, actions, blockers, risks, teams, standups, activityTrend, projects, topBlockers, upcomingMilestones, overdueMilestones } = data;
  const displayedBlockers = showAllBlockers ? topBlockers : topBlockers.slice(0, 5);

  // Sprint health = milestone completion rate weighted by overdue penalty
  const sprintHealth = Math.max(0, Math.round(
    milestones.completionRate * 0.6 - milestones.overdue * 5
  ));

  return (
    <Layout>
      <Header
        title="CTO Dashboard"
        subtitle={`Delivery & engineering intelligence${lastUpdated ? ` · Updated ${lastUpdated}` : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => refetch()}
              className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <RefreshCw size={13} /> Refresh
            </button>
            <button
              onClick={() => downloadJSON(data, `cto-dashboard-${format(new Date(), 'yyyy-MM-dd')}.json`)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <Download size={13} /> Export
            </button>
          </div>
        }
      />

      <div className="p-6 space-y-6">

        {/* ── KPI Row ─────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Active Projects"    value={portfolio.active}      sub={`${portfolio.total} total`}           icon={<BarChart2 size={18} className="text-white" />} accent="bg-blue-500" />
          <KpiCard label="Critical Blockers"  value={blockers.critical}     sub={`${blockers.open} open total`}         icon={<Zap size={18} className="text-white" />}      accent={blockers.critical > 0 ? 'bg-red-500' : 'bg-gray-400'} alert={blockers.critical > 0} trend={blockers.critical > 0 ? 'down' : 'neutral'} />
          <KpiCard label="Overdue Actions"    value={actions.overdue}       sub={`${actions.completionRate}% done`}     icon={<CheckCircle size={18} className="text-white" />} accent={actions.overdue > 5 ? 'bg-red-500' : 'bg-amber-500'} alert={actions.overdue > 5} />
          <KpiCard label="Delayed Milestones" value={milestones.overdue}    sub={`${milestones.upcoming7days} due soon`} icon={<Clock size={18} className="text-white" />}    accent={milestones.overdue > 3 ? 'bg-red-500' : 'bg-amber-500'} alert={milestones.overdue > 3} />
          <KpiCard label="Sprint Health"      value={`${sprintHealth}%`}   sub={`${milestones.completionRate}% milestones`} icon={<Target size={18} className="text-white" />} accent={sprintHealth >= 70 ? 'bg-green-500' : 'bg-amber-500'} trend={sprintHealth >= 70 ? 'up' : 'down'} />
          <KpiCard label="Open Risks"         value={risks.open}            sub={`${risks.critical} critical`}          icon={<Shield size={18} className="text-white" />}   accent={risks.critical > 0 ? 'bg-red-500' : 'bg-indigo-500'} alert={risks.critical > 0} />
        </div>

        {/* ── Filter Bar ──────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3 flex-wrap">
          <Filter size={14} className="text-gray-400 shrink-0" />
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text" placeholder="Search projects…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg w-44 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200 min-w-[160px]">
            <option value="">All projects</option>
            {(projectList as any[]).map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {(filterProject || search) && (
            <button onClick={() => { setFilterProject(''); setSearch(''); }}
              className="text-xs text-red-500 hover:text-red-700 transition-colors">
              Clear filters
            </button>
          )}
          <span className="ml-auto text-xs text-gray-400">{filteredProjects.length} project(s)</span>
        </div>

        {/* ── Three Charts Row ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Project health bar */}
          <SectionCard title="Project Health Scores" sub="Health &amp; milestone % per project"
            icon={<BarChart2 size={15} className="text-blue-600" />}>
            <ProjectHealthChart projects={filteredProjects.length ? filteredProjects : projects} />
          </SectionCard>

          {/* Blocker severity pie */}
          <SectionCard title="Blocker Severity" sub={`${blockers.open} open blockers`}
            icon={<AlertTriangle size={15} className="text-red-500" />}>
            <BlockerSeverityPie blockers={blockers} />
          </SectionCard>

          {/* Velocity line chart */}
          <SectionCard title="Team Velocity" sub="Standups &amp; EODs — last 7 days"
            icon={<Activity size={15} className="text-blue-600" />}>
            <VelocityChart trend={activityTrend} />
            <p className="text-xs text-gray-400 mt-2 text-center">
              {standups.submissionRateLast7d}% submission rate · {teams.memberCount} active members
            </p>
          </SectionCard>
        </div>

        {/* ── Project Health Detail Table ──────────────────────────────────────── */}
        <SectionCard
          title="Project Health Breakdown"
          sub="Detailed delivery status per project"
          icon={<Target size={15} className="text-blue-600" />}
          className=""
        >
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80 border-b border-t border-gray-100">
                  {['Project', 'RAG', 'Health', 'Milestones', 'Overdue', 'Blockers', 'Actions OD', 'End Date'].map(h => (
                    <th key={h} className="text-left py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredProjects.map(p => (
                  <tr key={p.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-gray-900 max-w-[180px] truncate">{p.name}</td>
                    <td className="py-3 px-4"><RagBadge status={p.ragStatus} /></td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${scoreBg(p.healthScore)}`}
                            style={{ width: `${p.healthScore}%` }} />
                        </div>
                        <span className={`text-xs font-bold ${scoreColor(p.healthScore)}`}>{p.healthScore}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-400 rounded-full" style={{ width: `${p.milestoneProgress}%` }} />
                        </div>
                        <span className="text-xs text-gray-600">{p.completedMilestones}/{p.totalMilestones}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {p.overdueMilestones > 0
                        ? <span className="text-xs font-semibold text-red-600">{p.overdueMilestones}</span>
                        : <span className="text-xs text-green-600">0</span>}
                    </td>
                    <td className="py-3 px-4">
                      {p.openBlockers > 0 ? (
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${p.criticalBlockers > 0 ? 'text-red-600' : 'text-amber-600'}`}>
                          <AlertTriangle size={11} /> {p.openBlockers}
                          {p.criticalBlockers > 0 && <span className="text-[10px] text-red-500">({p.criticalBlockers} crit)</span>}
                        </span>
                      ) : <span className="text-xs text-green-600">0</span>}
                    </td>
                    <td className="py-3 px-4">
                      {p.overdueActions > 0
                        ? <span className="text-xs font-semibold text-red-600">{p.overdueActions}</span>
                        : <span className="text-xs text-green-600">0</span>}
                    </td>
                    <td className="py-3 px-4">
                      {p.endDate ? (
                        <span className={`text-xs ${daysUntil(p.endDate) < 0 ? 'text-red-600 font-semibold' : daysUntil(p.endDate) < 14 ? 'text-amber-600' : 'text-gray-500'}`}>
                          {daysUntil(p.endDate) < 0
                            ? `${Math.abs(daysUntil(p.endDate))}d overdue`
                            : fmtDate(p.endDate)}
                        </span>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>
                  </tr>
                ))}
                {filteredProjects.length === 0 && (
                  <tr><td colSpan={8} className="py-10 text-center text-sm text-gray-400">No projects match filters</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* ── Delivery Pipeline + Active Blockers ──────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Delivery pipeline */}
          <SectionCard title="Delivery Pipeline" sub="Upcoming & overdue milestones"
            icon={<Clock size={15} className="text-blue-600" />}>
            <div className="space-y-4">
              {upcomingMilestones.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Due in 7 days ({upcomingMilestones.length})</p>
                  <div className="space-y-1.5">
                    {upcomingMilestones.map(m => {
                      const proj = projects.find(p => p.id === m.projectId);
                      const d = daysUntil(m.dueDate);
                      return (
                        <div key={m.id} className="flex items-center gap-3 p-2.5 bg-blue-50 border border-blue-100 rounded-xl">
                          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-bold text-white">{d}d</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-gray-800 truncate">{m.title}</p>
                            <p className="text-[11px] text-gray-400">{proj?.name}</p>
                          </div>
                          <span className="text-[11px] text-blue-600 font-medium shrink-0">{fmtDate(m.dueDate)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {overdueMilestones.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">Overdue ({overdueMilestones.length})</p>
                  <div className="space-y-1.5">
                    {overdueMilestones.map(m => {
                      const proj = projects.find(p => p.id === m.projectId);
                      const d = Math.abs(daysUntil(m.dueDate));
                      return (
                        <div key={m.id} className="flex items-center gap-3 p-2.5 bg-red-50 border border-red-100 rounded-xl">
                          <div className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center shrink-0">
                            <TrendingDown size={14} className="text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-gray-800 truncate">{m.title}</p>
                            <p className="text-[11px] text-gray-400">{proj?.name}</p>
                          </div>
                          <span className="text-[11px] text-red-600 font-medium shrink-0">{d}d overdue</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {!upcomingMilestones.length && !overdueMilestones.length && (
                <div className="flex flex-col items-center justify-center py-8 gap-2 text-green-600">
                  <CheckCircle size={28} />
                  <p className="text-sm font-medium">Delivery pipeline is clear</p>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Active blockers */}
          <SectionCard title="Active Blockers" sub={`${blockers.open} open · ${blockers.critical} critical`}
            icon={<AlertTriangle size={15} className="text-red-500" />}>
            {topBlockers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-green-600">
                <CheckCircle size={28} />
                <p className="text-sm font-medium">No critical or high blockers</p>
              </div>
            ) : (
              <div className="space-y-2">
                {displayedBlockers.map(b => {
                  const proj = projects.find(p => p.id === b.projectId);
                  return (
                    <div key={b.id} className={`p-3 rounded-xl border ${b.severity === 'CRITICAL' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-xs font-semibold text-gray-800 flex-1 leading-snug">{b.title}</p>
                        <SevBadge sev={b.severity} />
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-gray-500">
                        <span>{proj?.name ?? `Project ${b.projectId}`}</span>
                        {b.raisedDate && <span>Raised {fmtDate(b.raisedDate)}</span>}
                        <span className={`capitalize ${b.status === 'ESCALATED' ? 'text-red-500 font-semibold' : ''}`}>{b.status?.toLowerCase()}</span>
                      </div>
                    </div>
                  );
                })}
                {topBlockers.length > 5 && (
                  <button onClick={() => setShowAllBlockers(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors mt-1">
                    {showAllBlockers ? 'Show less' : `Show all ${topBlockers.length} blockers`}
                    <ChevronRight size={12} />
                  </button>
                )}
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── AI Delivery Analysis ──────────────────────────────────────────── */}
        <SectionCard title="AI Delivery Analysis" sub="Powered by Qwen 30B"
          icon={<Brain size={15} className="text-blue-600" />}
          actions={
            <button onClick={runAi} disabled={aiBlockers.isPending || aiTrends.isPending || aiHealth.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-60 shadow-sm transition-all">
              {(aiBlockers.isPending || aiTrends.isPending) ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {(aiBlockers.isPending || aiTrends.isPending) ? 'Analysing…' : 'Run AI Analysis'}
            </button>
          }>
          <AiAnalysisPanel
            aiBlockers={aiBlockers}
            aiTrends={aiTrends}
            aiHealth={aiHealth}
            onRun={runAi}
            loading={aiBlockers.isPending || aiTrends.isPending || aiHealth.isPending}
          />
        </SectionCard>

      </div>
    </Layout>
  );
};

export default CtoDashboardPage;
