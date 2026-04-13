import React, { useState, useCallback } from 'react';
import {
  Brain, Sparkles, Activity, Users, FileText, Lightbulb,
  RefreshCw, Download, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle, Clock, TrendingUp, TrendingDown,
  Minus, Zap, Shield, BarChart2, Search, ArrowUpRight, ArrowDownRight,
  RotateCcw, MessageSquare, History,
} from 'lucide-react';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import { PageLoader } from '../components/ui/Spinner';
import Alert from '../components/ui/Alert';
import ProjectPicker from '../components/ui/ProjectPicker';
import { useProjects } from '../hooks/useProjects';
import { useAuth } from '../contexts/AuthContext';
import {
  useAiDailySummary, useAiProjectHealth,
  useAiPerformance, useAiReport, useAiSuggestions,
  useAiDetectBlockers, useAiTrends, useAiRetrospective, useAiNLQuery,
  useAiHolisticPerformance,
} from '../hooks/useAiInsights';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

function downloadJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

const AiCard = ({
  title, icon, children, onDownload, className = '',
}: {
  title: string; icon: React.ReactNode;
  children: React.ReactNode;
  onDownload?: () => void;
  className?: string;
}) => (
  <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden ${className}`}>
    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
          {icon}
        </div>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      {onDownload && (
        <button
          onClick={onDownload}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 transition-colors"
          title="Download JSON"
        >
          <Download size={13} /> Export
        </button>
      )}
    </div>
    <div className="p-5">{children}</div>
  </div>
);

const AiLoadingState = ({ label }: { label: string }) => (
  <div className="flex flex-col items-center justify-center py-12 gap-3">
    <div className="relative w-12 h-12">
      <div className="absolute inset-0 rounded-full border-4 border-indigo-100" />
      <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
    </div>
    <div className="text-center">
      <p className="text-sm font-medium text-gray-700">AI is thinking…</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
    </div>
  </div>
);

const AiEmptyState = ({ label, onGenerate, loading }: { label: string; onGenerate: () => void; loading: boolean }) => (
  <div className="flex flex-col items-center justify-center py-10 gap-3">
    <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center">
      <Sparkles size={22} className="text-indigo-400" />
    </div>
    <p className="text-sm text-gray-500">{label}</p>
    <button
      onClick={onGenerate}
      disabled={loading}
      className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
    >
      {loading ? <RefreshCw size={14} className="animate-spin" /> : <Brain size={14} />}
      Generate Insights
    </button>
  </div>
);

const HealthBadge = ({ status }: { status: string }) => {
  const map: Record<string, { color: string; icon: React.ReactNode }> = {
    'On Track': { color: 'bg-green-100 text-green-700 border-green-200', icon: <CheckCircle size={13} /> },
    'At Risk':  { color: 'bg-amber-100 text-amber-700 border-amber-200',  icon: <AlertTriangle size={13} /> },
    'Delayed':  { color: 'bg-red-100 text-red-700 border-red-200',         icon: <TrendingDown size={13} /> },
  };
  const cfg = map[status] ?? { color: 'bg-gray-100 text-gray-600 border-gray-200', icon: <Minus size={13} /> };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.color}`}>
      {cfg.icon} {status}
    </span>
  );
};

const SentimentBadge = ({ sentiment }: { sentiment: string }) => {
  const map: Record<string, string> = {
    positive: 'bg-green-100 text-green-700',
    neutral:  'bg-gray-100 text-gray-600',
    negative: 'bg-red-100 text-red-700',
    mixed:    'bg-amber-100 text-amber-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[sentiment?.toLowerCase()] ?? 'bg-gray-100 text-gray-600'}`}>
      {sentiment || 'Unknown'}
    </span>
  );
};

const ScoreBar = ({ score }: { score: number }) => {
  const color = score >= 75 ? 'bg-green-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
      <span className="text-sm font-bold text-gray-900 w-10 text-right">{score}</span>
    </div>
  );
};

const BulletList = ({ items, icon, color = 'text-gray-400' }: { items: string[]; icon?: React.ReactNode; color?: string }) => {
  if (!items?.length) return <p className="text-xs text-gray-400 italic">None identified.</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
          <span className={`mt-0.5 shrink-0 ${color}`}>{icon ?? <span className="text-[8px] mt-1 block">●</span>}</span>
          {item}
        </li>
      ))}
    </ul>
  );
};

const Collapsible = ({ label, children }: { label: string; children: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        {label}
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
};

const SuggestionItem = ({ item }: { item: { suggestion: string; priority: string; impact: string } }) => {
  const pColor = item.priority === 'high' ? 'bg-red-100 text-red-700' : item.priority === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700';
  return (
    <div className="p-3 rounded-xl border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all">
      <div className="flex items-start gap-2 mb-1">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${pColor} shrink-0`}>{item.priority}</span>
      </div>
      <p className="text-sm text-gray-800 font-medium">{item.suggestion}</p>
      {item.impact && <p className="text-xs text-gray-400 mt-0.5">Impact: {item.impact}</p>}
    </div>
  );
};

const SEVERITY_COLOR: Record<string, string> = {
  high:   'bg-red-50 border-red-200 text-red-700',
  medium: 'bg-amber-50 border-amber-200 text-amber-700',
  low:    'bg-blue-50 border-blue-200 text-blue-700',
};

function MemberPerfCard({ member: m, severityColor }: { member: any; severityColor: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const score = m.score ?? 0;
  const stars = m.starRating ?? Math.round(score / 20);
  const scoreColor = score >= 90 ? 'text-emerald-600 bg-emerald-50' : score >= 75 ? 'text-blue-600 bg-blue-50' : score >= 60 ? 'text-amber-600 bg-amber-50' : score >= 40 ? 'text-orange-600 bg-orange-50' : 'text-red-600 bg-red-50';
  const label = score >= 90 ? 'Exceptional' : score >= 75 ? 'Good' : score >= 60 ? 'Satisfactory' : score >= 40 ? 'Needs Improvement' : 'Poor';
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <span className="font-semibold text-gray-800 text-xs truncate flex-1 text-left">{m.name}</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${scoreColor}`}>{label}</span>
        <span className="text-amber-400 text-xs shrink-0">{'★'.repeat(stars)}{'☆'.repeat(5 - stars)}</span>
        <span className="text-xs font-bold text-gray-500 shrink-0">{score}/100</span>
        {open ? <ChevronUp size={14} className="text-gray-400 shrink-0" /> : <ChevronDown size={14} className="text-gray-400 shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-gray-50">
          {m.performanceSummary && (
            <p className="text-xs text-gray-600 leading-relaxed bg-gray-50 rounded-lg p-2">{m.performanceSummary}</p>
          )}
          {(m.factors ?? []).length > 0 && (
            <div className="grid grid-cols-1 gap-1.5">
              {(m.factors as any[]).map((f: any, fi: number) => (
                <div key={fi} className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-500 w-28 shrink-0">{f.name}</span>
                  <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${f.score >= 75 ? 'bg-emerald-500' : f.score >= 50 ? 'bg-blue-500' : f.score >= 30 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${f.score}%` }} />
                  </div>
                  <span className="text-[10px] text-gray-500 w-8 text-right shrink-0">{f.score}</span>
                </div>
              ))}
            </div>
          )}
          {(m.issues ?? []).length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider">Issues</p>
              {(m.issues as any[]).map((iss: any, ii: number) => (
                <div key={ii} className={`border rounded-lg px-2.5 py-1.5 text-xs ${severityColor[iss.severity] ?? severityColor.low}`}>
                  <span className="font-semibold">{iss.problem}</span>
                  {iss.evidence && <span className="ml-1 opacity-80">— {iss.evidence}</span>}
                </div>
              ))}
            </div>
          )}
          {(m.strengths ?? []).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-1">Strengths</p>
              <BulletList items={m.strengths} icon={<CheckCircle size={11} className="text-emerald-500" />} />
            </div>
          )}
          {(m.suggestions ?? []).length > 0 && (
            <div className="bg-indigo-50 rounded-lg p-2">
              <p className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider mb-1">Suggestions</p>
              <ul className="space-y-0.5">
                {(m.suggestions as string[]).map((s: string, si: number) => (
                  <li key={si} className="text-xs text-indigo-800 flex items-start gap-1.5">
                    <span className="font-bold text-indigo-400 shrink-0">{si + 1}.</span>{s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const TrendArrow = ({ value }: { value: string }) => {
  if (!value) return <Minus size={14} className="text-gray-400" />;
  const v = value.toLowerCase();
  if (v === 'increasing' || v === 'improving') return <ArrowUpRight size={14} className="text-green-500" />;
  if (v === 'decreasing' || v === 'declining' || v === 'worsening') return <TrendingDown size={14} className="text-red-500" />;
  return <Minus size={14} className="text-gray-400" />;
};

const TrendPill = ({ label, value }: { label: string; value: string }) => {
  const v = (value || '').toLowerCase();
  const color = (v === 'increasing' || v === 'improving')
    ? 'bg-green-50 text-green-700 border-green-200'
    : (v === 'decreasing' || v === 'declining' || v === 'worsening')
      ? 'bg-red-50 text-red-700 border-red-200'
      : 'bg-gray-50 text-gray-600 border-gray-200';
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${color}`}>
      <span className="font-medium">{label}</span>
      <div className="flex items-center gap-1">
        <TrendArrow value={value} />
        <span className="capitalize">{value || 'N/A'}</span>
      </div>
    </div>
  );
};

const BlockerTypeBadge = ({ type }: { type: string }) => {
  const map: Record<string, string> = {
    dependency:    'bg-blue-100 text-blue-700',
    technical:     'bg-purple-100 text-purple-700',
    resource:      'bg-orange-100 text-orange-700',
    process:       'bg-teal-100 text-teal-700',
    communication: 'bg-pink-100 text-pink-700',
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${map[type?.toLowerCase()] ?? 'bg-gray-100 text-gray-600'}`}>
      {type}
    </span>
  );
};

const SeverityBadge = ({ severity }: { severity: string }) => {
  const s = (severity || '').toLowerCase();
  const color = s === 'high' ? 'bg-red-100 text-red-700' : s === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700';
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${color}`}>{severity}</span>;
};

// ─── Role-based visibility ────────────────────────────────────────────────────

type CardKey = 'summary' | 'health' | 'performance' | 'suggestions' | 'report' | 'blockers' | 'trends' | 'retro' | 'nlq' | 'holistic';

const ROLE_VISIBILITY: Record<string, Record<CardKey, boolean>> = {
  TENANT_ADMIN:  { summary: true,  health: true,  performance: true,  suggestions: true, report: true, blockers: true, trends: true, retro: true, nlq: true, holistic: true  },
  PMO:           { summary: true,  health: true,  performance: true,  suggestions: true, report: true, blockers: true, trends: true, retro: true, nlq: true, holistic: true  },
  DELIVERY_LEAD: { summary: true,  health: true,  performance: true,  suggestions: true, report: true, blockers: true, trends: true, retro: true, nlq: true, holistic: true  },
  EXEC:          { summary: true,  health: true,  performance: true,  suggestions: true, report: true, blockers: true, trends: true, retro: true, nlq: true, holistic: true  },
  TEAM_MEMBER:   { summary: true,  health: false, performance: true,  suggestions: true, report: true, blockers: true, trends: true, retro: true, nlq: true, holistic: true  },
  CLIENT:        { summary: false, health: true,  performance: false, suggestions: true, report: true, blockers: true, trends: false, retro: false, nlq: true, holistic: false },
};

const ROLE_BANNER: Record<string, { title: string; desc: string } | undefined> = {
  TEAM_MEMBER: { title: 'Personal View', desc: 'Insights are scoped to your own activity and assigned work.' },
  CLIENT:      { title: 'Project View',  desc: 'Insights are scoped to your assigned project(s).' },
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const AiInsightsPage = () => {
  const { user } = useAuth();
  const { data: projects = [] } = useProjects();
  const role = (user?.role ?? 'TENANT_ADMIN') as string;
  const canSee: Record<CardKey, boolean> = ROLE_VISIBILITY[role] ?? ROLE_VISIBILITY.TENANT_ADMIN;
  const banner = ROLE_BANNER[role];

  // Filter controls
  const [projectId, setProjectId]    = useState('');
  const [date, setDate]              = useState(today());
  const [days, setDays]              = useState(7);
  const [trendDays, setTrendDays]    = useState(14);
  const [reportType, setReportType]  = useState<'daily' | 'weekly' | 'project'>('weekly');
  const [dateFrom, setDateFrom]      = useState(daysAgo(7));
  const [dateTo, setDateTo]          = useState(today());
  const [sprintStart, setSprintStart]= useState(daysAgo(14));
  const [sprintEnd, setSprintEnd]    = useState(today());
  const [nlQuery, setNlQuery]        = useState('');

  // AI hooks — existing 5
  const summary  = useAiDailySummary();
  const health   = useAiProjectHealth();
  const perf     = useAiPerformance();
  const report   = useAiReport();
  const suggests = useAiSuggestions();

  // AI hooks — new 4
  const blockerDetect = useAiDetectBlockers();
  const trends        = useAiTrends();
  const retro         = useAiRetrospective();
  const nlq           = useAiNLQuery();

  // AI hook — holistic performance
  const [holisticDays, setHolisticDays] = useState<7 | 30 | 90>(30);
  const holistic = useAiHolisticPerformance();

  const params = { projectId: projectId || undefined };

  const runSummary       = useCallback(() => summary.mutate({ ...params, date }),                                [projectId, date]);
  const runHealth        = useCallback(() => health.mutate(params),                                             [projectId]);
  const runPerf          = useCallback(() => perf.mutate({ ...params, days }),                                  [projectId, days]);
  const runReport        = useCallback(() => report.mutate({ ...params, type: reportType, dateFrom, dateTo }),  [projectId, reportType, dateFrom, dateTo]);
  const runSuggests      = useCallback(() => suggests.mutate(params),                                           [projectId]);
  const runBlockers      = useCallback(() => blockerDetect.mutate({ ...params, days: 7 }),                      [projectId]);
  const runTrends        = useCallback(() => trends.mutate({ ...params, days: trendDays }),                     [projectId, trendDays]);
  const runRetro         = useCallback(() => retro.mutate({ ...params, sprintStart, sprintEnd }),                [projectId, sprintStart, sprintEnd]);
  const runNLQuery       = () => { if (nlQuery.trim().length >= 3) nlq.mutate({ ...params, query: nlQuery.trim() }); };
  const runHolistic      = useCallback(() => holistic.mutate({ days: holisticDays }),                            [holisticDays]);

  const runAll = () => {
    if (canSee.summary)     runSummary();
    if (canSee.health)      runHealth();
    if (canSee.performance) runPerf();
    if (canSee.report)      runReport();
    if (canSee.suggestions) runSuggests();
    if (canSee.blockers)    runBlockers();
    if (canSee.trends)      runTrends();
    if (canSee.retro)       runRetro();
    if (canSee.holistic)    runHolistic();
  };

  const isAnyLoading =
    (canSee.summary     && summary.isPending)       ||
    (canSee.health      && health.isPending)         ||
    (canSee.performance && perf.isPending)           ||
    (canSee.report      && report.isPending)         ||
    (canSee.suggestions && suggests.isPending)       ||
    (canSee.blockers    && blockerDetect.isPending)  ||
    (canSee.trends      && trends.isPending)         ||
    (canSee.retro       && retro.isPending)          ||
    (canSee.holistic    && holistic.isPending);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Layout>
      <Header
        title="AI Insights"
        subtitle="Powered by DSV AI — intelligent analysis of your team's activity"
      />

      <div className="p-6 space-y-6">

        {/* ── Role banner ── */}
        {banner && (
          <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
            <Sparkles size={16} className="text-indigo-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-indigo-800">{banner.title}</p>
              <p className="text-xs text-indigo-600 mt-0.5">{banner.desc}</p>
            </div>
          </div>
        )}

        {/* ── Project required notice ── */}
        {!projectId && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Select a project for best results</p>
              <p className="text-xs text-amber-600 mt-0.5">
                Running insights without a project selected sends data from all your projects to the AI, which increases processing time significantly. Select a specific project below for faster, more focused insights.
              </p>
            </div>
          </div>
        )}

        {/* ── Filters ── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-1.5">
            <BarChart2 size={12} /> Filters
          </p>

          {/* Project search + inline generate button */}
          <div className="flex items-end gap-3 mb-4">
            <div className="flex-1 min-w-0">
              <label className="form-label">Project <span className="text-amber-500">*</span></label>
              <ProjectPicker
                projects={(projects as any[]).map((p) => ({
                  id: p.id,
                  name: p.name,
                  ragStatus: p.ragStatus,
                  status: p.status,
                }))}
                value={projectId}
                onChange={setProjectId}
                placeholder="Search and select a project…"
              />
            </div>
            <button
              onClick={runAll}
              disabled={isAnyLoading || !projectId}
              title={!projectId ? 'Select a project first' : 'Generate all AI insights for this project'}
              className="shrink-0 inline-flex items-center gap-2 px-4 py-2 h-[40px] bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-lg text-sm font-semibold hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all whitespace-nowrap"
            >
              {isAnyLoading
                ? <><RefreshCw size={14} className="animate-spin" /> Generating…</>
                : <><Sparkles size={14} /> Generate Insights</>}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div>
              <label className="form-label">Summary Date</label>
              <input type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} max={today()} />
            </div>
            <div>
              <label className="form-label">Perf. Days</label>
              <select className="form-select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {[7, 14, 21, 30].map((d) => <option key={d} value={d}>Last {d} days</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Report Type</label>
              <select className="form-select" value={reportType} onChange={(e) => setReportType(e.target.value as any)}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="project">Project</option>
              </select>
            </div>
            <div>
              <label className="form-label">Report From</label>
              <input type="date" className="form-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Trend Days</label>
              <select className="form-select" value={trendDays} onChange={(e) => setTrendDays(Number(e.target.value))}>
                {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Sprint Start</label>
              <input type="date" className="form-input" value={sprintStart} onChange={(e) => setSprintStart(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Sprint End</label>
              <input type="date" className="form-input" value={sprintEnd} onChange={(e) => setSprintEnd(e.target.value)} max={today()} />
            </div>
          </div>
        </div>

        {/* ── Top row: Summary + Health ── */}
        {(canSee.summary || canSee.health) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Daily Summary */}
          {canSee.summary && <AiCard
            title={role === 'TEAM_MEMBER' ? 'My Daily Activity' : 'Daily Activity Summary'}
            icon={<Activity size={16} className="text-white" />}
            onDownload={summary.data ? () => downloadJSON(summary.data, `daily-summary-${date}.json`) : undefined}
          >
            {summary.isPending ? (
              <AiLoadingState label="Analysing standups and EODs…" />
            ) : summary.error ? (
              <Alert type="error" message={(summary.error as Error).message} />
            ) : !summary.data ? (
              <AiEmptyState label="Summarise today's standups and EOD updates." onGenerate={runSummary} loading={false} />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <SentimentBadge sentiment={summary.data.data?.sentiment} />
                  <span className="text-xs text-gray-400">
                    {summary.data.meta?.standupCount ?? 0} standups · {summary.data.meta?.eodCount ?? 0} EODs · {date}
                  </span>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{summary.data.data?.summary}</p>

                <Collapsible label={`Key Highlights (${summary.data.data?.highlights?.length ?? 0})`}>
                  <BulletList items={summary.data.data?.highlights} icon={<CheckCircle size={13} />} color="text-green-500" />
                </Collapsible>
                <Collapsible label={`Blockers (${summary.data.data?.blockers?.length ?? 0})`}>
                  <BulletList items={summary.data.data?.blockers} icon={<AlertTriangle size={13} />} color="text-red-500" />
                </Collapsible>
                <Collapsible label={`Suggestions (${summary.data.data?.suggestions?.length ?? 0})`}>
                  <BulletList items={summary.data.data?.suggestions} icon={<Lightbulb size={13} />} color="text-amber-500" />
                </Collapsible>

                <button onClick={runSummary} disabled={summary.isPending}
                  className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 transition-colors mt-1">
                  <RefreshCw size={12} /> Regenerate
                </button>
              </div>
            )}
          </AiCard>}

          {/* Project Health */}
          {canSee.health && <AiCard
            title="Project Health Analysis"
            icon={<TrendingUp size={16} className="text-white" />}
            onDownload={health.data ? () => downloadJSON(health.data, 'project-health.json') : undefined}
          >
            {health.isPending ? (
              <AiLoadingState label="Analysing milestones, blockers, and actions…" />
            ) : health.error ? (
              <Alert type="error" message={(health.error as Error).message} />
            ) : !health.data ? (
              <AiEmptyState label="Get an AI-powered health check on your projects." onGenerate={runHealth} loading={false} />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <HealthBadge status={health.data.data?.overallStatus} />
                  <span className="text-xs text-gray-400">{health.data.meta?.projectCount} project(s) analysed</span>
                </div>

                <div>
                  <p className="text-xs text-gray-500 mb-1.5">Health Score</p>
                  <ScoreBar score={health.data.data?.score ?? 0} />
                </div>

                {/* Per-project breakdown */}
                {health.data.data?.projects?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Projects</p>
                    {health.data.data.projects.map((p: any, i: number) => (
                      <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                        <span className="text-sm text-gray-800 truncate">{p.name}</span>
                        <HealthBadge status={p.status} />
                      </div>
                    ))}
                  </div>
                )}

                <Collapsible label={`Reasons (${health.data.data?.reasons?.length ?? 0})`}>
                  <BulletList items={health.data.data?.reasons} icon={<AlertTriangle size={13} />} color="text-amber-500" />
                </Collapsible>
                <Collapsible label={`Recommendations (${health.data.data?.recommendations?.length ?? 0})`}>
                  <BulletList items={health.data.data?.recommendations} icon={<Lightbulb size={13} />} color="text-indigo-500" />
                </Collapsible>

                <button onClick={runHealth} disabled={health.isPending}
                  className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 transition-colors mt-1">
                  <RefreshCw size={12} /> Regenerate
                </button>
              </div>
            )}
          </AiCard>}
        </div>
        )}

        {/* ── Performance Table ── */}
        {canSee.performance && <AiCard
          title={role === 'TEAM_MEMBER' ? 'My Performance' : 'Team Performance Insights'}
          icon={<Users size={16} className="text-white" />}
          onDownload={perf.data ? () => downloadJSON(perf.data, `performance-last-${days}d.json`) : undefined}
        >
          {perf.isPending ? (
            <AiLoadingState label={`Analysing ${days}-day activity per team member…`} />
          ) : perf.error ? (
            <Alert type="error" message={(perf.error as Error).message} />
          ) : !perf.data ? (
            <AiEmptyState label={`Analyse individual performance over the last ${days} days.`} onGenerate={runPerf} loading={false} />
          ) : (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-700">{perf.data.data?.teamSummary}</p>
                  <div className="flex items-center gap-3 mt-2">
                    {perf.data.data?.topPerformer && (
                      <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        ⭐ Top: {perf.data.data.topPerformer}
                      </span>
                    )}
                    <span className="text-xs text-gray-500">Team Morale: {perf.data.data?.teamMorale}</span>
                  </div>
                </div>
                <button onClick={runPerf} disabled={perf.isPending}
                  className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 transition-colors">
                  <RefreshCw size={12} /> Regenerate
                </button>
              </div>

              {perf.data.data?.alerts?.length > 0 && (
                <Alert type="warning" message={perf.data.data.alerts.join(' · ')} />
              )}

              {(perf.data.data?.members ?? []).length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Member</th>
                        <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Score</th>
                        <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Consistency</th>
                        <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Strengths</th>
                        <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Improve</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {perf.data.data.members.map((m: any, i: number) => (
                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                          <td className="py-3 px-3">
                            <p className="font-medium text-gray-900">{m.name}</p>
                            <p className="text-xs text-gray-400">{m.performanceSummary?.substring(0, 60)}…</p>
                          </td>
                          <td className="py-3 px-3 min-w-[120px]"><ScoreBar score={m.score ?? 0} /></td>
                          <td className="py-3 px-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              m.consistencyRating === 'Excellent' ? 'bg-green-100 text-green-700' :
                              m.consistencyRating === 'Good'      ? 'bg-blue-100 text-blue-700' :
                              m.consistencyRating === 'Average'   ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-700'
                            }`}>{m.consistencyRating}</span>
                          </td>
                          <td className="py-3 px-3 text-xs text-gray-600 max-w-[180px]">
                            {m.strengths?.slice(0, 2).join(', ')}
                          </td>
                          <td className="py-3 px-3 text-xs text-gray-600 max-w-[180px]">
                            {m.areasOfImprovement?.slice(0, 2).join(', ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-6">No member data available for this period.</p>
              )}
            </div>
          )}
        </AiCard>}

        {/* ── Bottom row: Suggestions + Report ── */}
        {(canSee.suggestions || canSee.report) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Smart Suggestions */}
          {canSee.suggestions && <AiCard
            title="Smart Suggestions"
            icon={<Lightbulb size={16} className="text-white" />}
            onDownload={suggests.data ? () => downloadJSON(suggests.data, 'ai-suggestions.json') : undefined}
          >
            {suggests.isPending ? (
              <AiLoadingState label="Generating prioritised suggestions…" />
            ) : suggests.error ? (
              <Alert type="error" message={(suggests.error as Error).message} />
            ) : !suggests.data ? (
              <AiEmptyState label="Get AI-powered productivity and risk suggestions." onGenerate={runSuggests} loading={false} />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                    suggests.data.data?.overallRiskLevel === 'high'   ? 'bg-red-100 text-red-700 border-red-200' :
                    suggests.data.data?.overallRiskLevel === 'medium' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                    'bg-green-100 text-green-700 border-green-200'
                  }`}>
                    {suggests.data.data?.overallRiskLevel?.toUpperCase()} RISK
                  </span>
                  <button onClick={runSuggests} disabled={suggests.isPending}
                    className="ml-auto flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 transition-colors">
                    <RefreshCw size={12} /> Regenerate
                  </button>
                </div>

                {suggests.data.data?.immediateActions?.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                    <p className="text-xs font-bold text-red-700 uppercase mb-2 flex items-center gap-1">
                      <Zap size={11} /> Immediate Actions
                    </p>
                    <BulletList items={suggests.data.data.immediateActions} icon={<AlertTriangle size={12} />} color="text-red-500" />
                  </div>
                )}

                <Collapsible label={`Productivity (${suggests.data.data?.productivity?.length ?? 0})`}>
                  <div className="space-y-2">
                    {(suggests.data.data?.productivity ?? []).map((s: any, i: number) => <SuggestionItem key={i} item={s} />)}
                  </div>
                </Collapsible>
                <Collapsible label={`Risk Mitigation (${suggests.data.data?.riskMitigation?.length ?? 0})`}>
                  <div className="space-y-2">
                    {(suggests.data.data?.riskMitigation ?? []).map((s: any, i: number) => <SuggestionItem key={i} item={s} />)}
                  </div>
                </Collapsible>
                <Collapsible label={`Resource Allocation (${suggests.data.data?.resourceAllocation?.length ?? 0})`}>
                  <div className="space-y-2">
                    {(suggests.data.data?.resourceAllocation ?? []).map((s: any, i: number) => <SuggestionItem key={i} item={s} />)}
                  </div>
                </Collapsible>
              </div>
            )}
          </AiCard>}

          {/* AI Report */}
          {canSee.report && <AiCard
            title="AI-Generated Report"
            icon={<FileText size={16} className="text-white" />}
            onDownload={report.data ? () => downloadJSON(report.data, `ai-report-${reportType}.json`) : undefined}
          >
            {report.isPending ? (
              <AiLoadingState label={`Compiling ${reportType} report…`} />
            ) : report.error ? (
              <Alert type="error" message={(report.error as Error).message} />
            ) : !report.data ? (
              <AiEmptyState label={`Generate a ${reportType} report with AI-written executive summary.`} onGenerate={runReport} loading={false} />
            ) : (
              <div className="space-y-4">
                <div>
                  <h4 className="text-base font-bold text-gray-900">{report.data.data?.title}</h4>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {report.data.meta?.dateFrom} → {report.data.meta?.dateTo}
                  </p>
                </div>

                {/* Metrics pills */}
                <div className="flex flex-wrap gap-2">
                  <HealthBadge status={report.data.data?.metrics?.overallHealth} />
                  <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-0.5 rounded-full font-medium">
                    {report.data.data?.metrics?.completionRate} completion
                  </span>
                  <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full font-medium">
                    {report.data.data?.metrics?.teamEngagement} engagement
                  </span>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Executive Summary</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{report.data.data?.executiveSummary}</p>
                </div>

                <Collapsible label={`Key Achievements (${report.data.data?.keyAchievements?.length ?? 0})`}>
                  <BulletList items={report.data.data?.keyAchievements} icon={<CheckCircle size={13} />} color="text-green-500" />
                </Collapsible>
                <Collapsible label={`Challenges (${report.data.data?.challenges?.length ?? 0})`}>
                  <BulletList items={report.data.data?.challenges} icon={<AlertTriangle size={13} />} color="text-red-500" />
                </Collapsible>
                <Collapsible label={`Action Items (${report.data.data?.actionableItems?.length ?? 0})`}>
                  <BulletList items={report.data.data?.actionableItems} icon={<Shield size={13} />} color="text-indigo-500" />
                </Collapsible>

                {report.data.data?.outlook && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                    <p className="text-xs font-semibold text-indigo-600 mb-1">Outlook</p>
                    <p className="text-sm text-indigo-800">{report.data.data.outlook}</p>
                  </div>
                )}

                <button onClick={runReport} disabled={report.isPending}
                  className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 transition-colors mt-1">
                  <RefreshCw size={12} /> Regenerate
                </button>
              </div>
            )}
          </AiCard>}
        </div>
        )}

        {/* ── Row: Blocker Detection + Trend Analysis ── */}
        {(canSee.blockers || canSee.trends) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Blocker Detection */}
          {canSee.blockers && <AiCard
            title="Blocker Detection"
            icon={<AlertTriangle size={16} className="text-white" />}
            onDownload={blockerDetect.data ? () => downloadJSON(blockerDetect.data, 'blockers-detected.json') : undefined}
          >
            {blockerDetect.isPending ? (
              <AiLoadingState label="Scanning standup and EOD entries for blockers…" />
            ) : blockerDetect.error ? (
              <Alert type="error" message={(blockerDetect.error as Error).message} />
            ) : !blockerDetect.data ? (
              <AiEmptyState label="Detect explicit and implicit blockers from team updates." onGenerate={runBlockers} loading={false} />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {blockerDetect.data.data?.requires_immediate_action && (
                      <span className="flex items-center gap-1 text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
                        <Zap size={11} /> Immediate Action Required
                      </span>
                    )}
                    <span className="text-xs text-gray-500">
                      {blockerDetect.data.data?.critical_count ?? 0} critical
                    </span>
                  </div>
                  <button onClick={runBlockers} disabled={blockerDetect.isPending}
                    className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 transition-colors">
                    <RefreshCw size={12} /> Regenerate
                  </button>
                </div>

                {blockerDetect.data.data?.summary && (
                  <p className="text-sm text-gray-700">{blockerDetect.data.data.summary}</p>
                )}

                {(blockerDetect.data.data?.blockers ?? []).length > 0 ? (
                  <div className="space-y-2">
                    {blockerDetect.data.data.blockers.map((b: any, i: number) => (
                      <div key={i} className="border border-gray-100 rounded-xl p-3 hover:border-red-200 hover:bg-red-50/20 transition-all">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <BlockerTypeBadge type={b.blocker_type} />
                          <SeverityBadge severity={b.severity} />
                          <span className="text-[10px] text-gray-400 uppercase ml-auto">{b.source}</span>
                        </div>
                        <p className="text-sm text-gray-800 italic">"{b.text}"</p>
                        {b.suggested_action && (
                          <p className="text-xs text-indigo-700 mt-1.5 flex items-start gap-1">
                            <Lightbulb size={11} className="mt-0.5 shrink-0" /> {b.suggested_action}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-2">
                    <CheckCircle size={15} /> No blockers detected in recent updates.
                  </p>
                )}
              </div>
            )}
          </AiCard>}

          {/* Trend Analysis */}
          {canSee.trends && <AiCard
            title="Trend Analysis"
            icon={<TrendingUp size={16} className="text-white" />}
            onDownload={trends.data ? () => downloadJSON(trends.data, `trends-${trendDays}d.json`) : undefined}
          >
            {trends.isPending ? (
              <AiLoadingState label={`Analysing ${trendDays}-day productivity and engagement trends…`} />
            ) : trends.error ? (
              <Alert type="error" message={(trends.error as Error).message} />
            ) : !trends.data ? (
              <AiEmptyState label={`Identify trends over the last ${trendDays} days.`} onGenerate={runTrends} loading={false} />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Last {trendDays} days</span>
                  <button onClick={runTrends} disabled={trends.isPending}
                    className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 transition-colors">
                    <RefreshCw size={12} /> Regenerate
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <TrendPill label="Productivity"  value={trends.data.data?.productivityTrend} />
                  <TrendPill label="Engagement"    value={trends.data.data?.engagementTrend} />
                  <TrendPill label="Team Mood"     value={trends.data.data?.moodTrend} />
                  <TrendPill label="Task Delays"   value={trends.data.data?.delayedTaskTrend} />
                </div>

                {trends.data.data?.riskAreas?.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <p className="text-xs font-bold text-amber-700 uppercase mb-1.5 flex items-center gap-1">
                      <AlertTriangle size={11} /> Risk Areas
                    </p>
                    <BulletList items={trends.data.data.riskAreas} icon={<AlertTriangle size={12} />} color="text-amber-500" />
                  </div>
                )}

                <Collapsible label={`Insights (${trends.data.data?.insights?.length ?? 0})`}>
                  <BulletList items={trends.data.data?.insights} icon={<Activity size={12} />} color="text-blue-500" />
                </Collapsible>
                <Collapsible label={`Recommendations (${trends.data.data?.recommendations?.length ?? 0})`}>
                  <BulletList items={trends.data.data?.recommendations} icon={<Lightbulb size={12} />} color="text-indigo-500" />
                </Collapsible>

                {trends.data.data?.recurringBlockers?.length > 0 && (
                  <Collapsible label={`Recurring Blockers (${trends.data.data.recurringBlockers.length})`}>
                    <BulletList items={trends.data.data.recurringBlockers} icon={<RotateCcw size={12} />} color="text-red-400" />
                  </Collapsible>
                )}
              </div>
            )}
          </AiCard>}
        </div>
        )}

        {/* ── Row: Sprint Retrospective + NL Query ── */}
        {(canSee.retro || canSee.nlq) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Sprint Retrospective */}
          {canSee.retro && <AiCard
            title="Sprint Retrospective"
            icon={<History size={16} className="text-white" />}
            onDownload={retro.data ? () => downloadJSON(retro.data, `retro-${sprintStart}-${sprintEnd}.json`) : undefined}
          >
            {retro.isPending ? (
              <AiLoadingState label="Generating sprint retrospective…" />
            ) : retro.error ? (
              <Alert type="error" message={(retro.error as Error).message} />
            ) : !retro.data ? (
              <AiEmptyState label={`Generate retrospective for ${sprintStart} → ${sprintEnd}.`} onGenerate={runRetro} loading={false} />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                      retro.data.data?.teamMorale === 'High'   ? 'bg-green-100 text-green-700 border-green-200' :
                      retro.data.data?.teamMorale === 'Medium' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                      'bg-red-100 text-red-700 border-red-200'
                    }`}>{retro.data.data?.teamMorale} Morale</span>
                    <span className="text-xs text-gray-500">Velocity: {retro.data.data?.velocityScore ?? '?'}/100</span>
                  </div>
                  <button onClick={runRetro} disabled={retro.isPending}
                    className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 transition-colors">
                    <RefreshCw size={12} /> Regenerate
                  </button>
                </div>

                {retro.data.data?.sprintSummary && (
                  <p className="text-sm text-gray-700 leading-relaxed">{retro.data.data.sprintSummary}</p>
                )}

                <Collapsible label={`What Went Well (${retro.data.data?.wentWell?.length ?? 0})`}>
                  <BulletList items={retro.data.data?.wentWell} icon={<CheckCircle size={13} />} color="text-green-500" />
                </Collapsible>
                <Collapsible label={`What Went Wrong (${retro.data.data?.wentWrong?.length ?? 0})`}>
                  <BulletList items={retro.data.data?.wentWrong} icon={<AlertTriangle size={13} />} color="text-red-500" />
                </Collapsible>
                <Collapsible label={`Action Items (${retro.data.data?.actionItems?.length ?? 0})`}>
                  <div className="space-y-2">
                    {(retro.data.data?.actionItems ?? []).map((item: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <SeverityBadge severity={item.priority} />
                        <div>
                          <p className="text-gray-800">{item.action}</p>
                          <p className="text-xs text-gray-400 mt-0.5">Owner: {item.owner}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Collapsible>

                {retro.data.data?.keyLearning && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                    <p className="text-xs font-semibold text-indigo-600 mb-1 flex items-center gap-1">
                      <Brain size={11} /> Key Learning
                    </p>
                    <p className="text-sm text-indigo-800">{retro.data.data.keyLearning}</p>
                  </div>
                )}
              </div>
            )}
          </AiCard>}

          {/* Natural Language Query */}
          {canSee.nlq && <AiCard
            title="Ask AI"
            icon={<MessageSquare size={16} className="text-white" />}
          >
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nlQuery}
                  onChange={(e) => setNlQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runNLQuery()}
                  placeholder='e.g. "Which project is at risk?" or "Who has blockers today?"'
                  className="form-input flex-1 text-sm"
                />
                <button
                  onClick={runNLQuery}
                  disabled={nlq.isPending || nlQuery.trim().length < 3}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-1.5 transition-colors"
                >
                  {nlq.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
                  Ask
                </button>
              </div>

              {/* Example queries */}
              {!nlq.data && !nlq.isPending && (
                <div className="space-y-1.5">
                  <p className="text-xs text-gray-400 font-medium">Try asking:</p>
                  {[
                    'Which project is at risk?',
                    'What are today\'s blockers?',
                    'Who is underperforming this week?',
                    'Which milestones are overdue?',
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => { setNlQuery(q); }}
                      className="block w-full text-left text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      "{q}"
                    </button>
                  ))}
                </div>
              )}

              {nlq.isPending && <AiLoadingState label="Searching project data…" />}

              {nlq.error && <Alert type="error" message={(nlq.error as Error).message} />}

              {nlq.data && (
                <div className="space-y-3">
                  <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-xs text-gray-500 font-medium">Answer</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        nlq.data.data?.confidence === 'high'   ? 'bg-green-100 text-green-700' :
                        nlq.data.data?.confidence === 'medium' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>{nlq.data.data?.confidence} confidence</span>
                    </div>
                    <p className="text-sm text-gray-900 leading-relaxed font-medium">{nlq.data.data?.answer}</p>
                  </div>

                  {nlq.data.data?.supportingData?.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 font-medium mb-1.5">Supporting Data</p>
                      <BulletList items={nlq.data.data.supportingData} icon={<Shield size={12} />} color="text-blue-400" />
                    </div>
                  )}

                  {nlq.data.data?.followUpSuggestions?.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 font-medium mb-1.5">Follow-up Questions</p>
                      <div className="space-y-1">
                        {nlq.data.data.followUpSuggestions.map((q: string, i: number) => (
                          <button key={i} onClick={() => setNlQuery(q)}
                            className="block w-full text-left text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2.5 py-1.5 rounded-lg transition-colors">
                            "{q}"
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </AiCard>}
        </div>
        )}

        {/* ── Holistic Performance ── */}
        {canSee.holistic && (
        <AiCard
          title="Holistic Performance"
          icon={<Activity size={14} className="text-white" />}
          onDownload={holistic.data ? () => downloadJSON(holistic.data, 'holistic-performance.json') : undefined}
        >
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            {([7, 30, 90] as const).map(d => (
              <button key={d}
                onClick={() => setHolisticDays(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${holisticDays === d ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {d} days
              </button>
            ))}
            <button
              onClick={runHolistic}
              disabled={holistic.isPending}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-medium hover:bg-violet-700 disabled:opacity-60 transition-colors">
              {holistic.isPending ? <RefreshCw size={12} className="animate-spin" /> : <Brain size={12} />}
              Analyse
            </button>
          </div>
          {holistic.isPending && <AiLoadingState label="Analysing performance across all modules…" />}
          {holistic.isError  && <p className="text-xs text-red-500">{String(holistic.error)}</p>}
          {!holistic.data && !holistic.isPending && !holistic.isError && (
            <AiEmptyState label="Cross-module performance: tasks, attendance, leave, time, standups & more." onGenerate={runHolistic} loading={false} />
          )}
          {holistic.data && (() => {
            const d = holistic.data?.data ?? holistic.data;
            const members: any[] = d?.members ?? [];
            const teamSummary: string = d?.teamSummary ?? '';
            const topPerformer: string | null = d?.topPerformer ?? null;
            const teamMorale: string = d?.teamMorale ?? '';
            const alerts: string[] = d?.alerts ?? [];

            if (members.length === 0) {
              return <p className="text-sm text-gray-500 text-center py-6">No performance data found for this period.</p>;
            }

            const moraleColor = teamMorale === 'High' ? 'text-emerald-600' : teamMorale === 'Medium' ? 'text-amber-600' : 'text-red-600';
            return (
              <div className="space-y-4">
                {/* Team overview */}
                {(teamSummary || topPerformer || teamMorale) && (
                  <div className="bg-violet-50 rounded-xl p-3 space-y-1">
                    {teamSummary && <p className="text-sm text-gray-700 leading-relaxed">{teamSummary}</p>}
                    <div className="flex items-center gap-4 flex-wrap mt-1">
                      {topPerformer && (
                        <span className="text-xs text-gray-600 flex items-center gap-1">
                          <TrendingUp size={11} className="text-emerald-500" />
                          Top performer: <strong className="ml-0.5">{topPerformer}</strong>
                        </span>
                      )}
                      {teamMorale && (
                        <span className={`text-xs font-medium flex items-center gap-1 ${moraleColor}`}>
                          <Activity size={11} /> Morale: {teamMorale}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Alerts */}
                {alerts.length > 0 && (
                  <div className="space-y-1">
                    {alerts.map((a, i) => (
                      <div key={i} className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                        <AlertTriangle size={12} className="text-red-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-red-700">{a}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Per-member cards */}
                {members.map((m: any, idx: number) => (
                  <MemberPerfCard key={idx} member={m} severityColor={SEVERITY_COLOR} />
                ))}
              </div>
            );
          })()}
        </AiCard>
        )}

        {/* ── Token usage footer ── */}
        {(summary.data || health.data || perf.data || report.data || suggests.data ||
          blockerDetect.data || trends.data || retro.data || nlq.data || holistic.data) && (
          <div className="flex items-center justify-end gap-1.5 text-[11px] text-gray-400">
            <Brain size={11} />
            Powered by Qwen3-30B-A3B (Zoho Catalyst QuickML) ·
            Tokens used this session:{' '}
            {[
              summary.data?.meta?.tokensUsed,    health.data?.meta?.tokensUsed,
              perf.data?.meta?.tokensUsed,        report.data?.meta?.tokensUsed,
              suggests.data?.meta?.tokensUsed,    blockerDetect.data?.meta?.tokensUsed,
              trends.data?.meta?.tokensUsed,      retro.data?.meta?.tokensUsed,
              nlq.data?.meta?.tokensUsed,         holistic.data?.meta?.tokensUsed,
            ].filter(Boolean).reduce((a: number, b: any) => a + Number(b), 0)}
          </div>
        )}

      </div>
    </Layout>
  );
};

export default AiInsightsPage;
