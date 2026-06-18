/**
 * PerformanceModal — AI-powered holistic performance analysis.
 *
 * Shows a star rating (1–5), factor breakdown cards, strengths,
 * areas of improvement, and actionable suggestions.
 *
 * Used for: individual users, team members, and admin-level analysis.
 */
import React, { useEffect, useState } from 'react';
import {
  Star, Sparkles, TrendingUp, TrendingDown, AlertCircle,
  Clock, CheckCircle2, Users, Activity, BarChart3,
  ChevronDown, ChevronUp, User, AlertTriangle,
  RefreshCw, Zap, LineChart as LineChartIcon, GitCompareArrows,
} from 'lucide-react';
import Modal from './Modal';
import UserAvatar from './UserAvatar';
import MarkdownText from './MarkdownText';
import {
  CountUp, FactorRadar, TaskStatusDonut, ActivitySparkline,
  MoodTrend, BenchmarkBars,
} from './PerformanceCharts';
import type {
  FactorScore as _FactorScore,
  ActivityRow, MoodPoint, BenchmarkRow,
} from './PerformanceCharts';
import { useAiHolisticPerformance } from '../../hooks/useAiInsights';
import { useAuth } from '../../contexts/AuthContext';
import { hasPermission, PERMISSIONS } from '../../utils/permissions';
import { useUsers } from '../../hooks/useUsers';
import { useTeams } from '../../hooks/useTeams';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PerformanceFactor {
  name: string;
  score: number;
  detail: string;
}

interface PerformanceIssue {
  problem: string;
  evidence: string;
  severity: 'high' | 'medium' | 'low';
}

interface MemberMetrics {
  standupCount: number;
  eodCount: number;
  consistencyPct: number;
  tasksTotal: number;
  tasksDone: number;
  tasksInProgress: number;
  tasksTodo: number;
  tasksOverdue: number;
  storyPointsDone: number;
  taskCompletionPct: number | null;
  attendanceDays: number;
  wfhDays: number;
  avgWorkHours: number;
  hoursLogged: number;
  billableHours?: number;
  nonBillableHours?: number;
  billableUtilization?: number;
  timeEntryCount: number;
  leaveDaysTaken: number;
  actionsTotal: number;
  actionsDone: number;
  blockersRaised: number;
  blockerBreakdown?: { high: number; medium: number; low: number; resolved: number };
}

export interface MemberResult {
  name: string;
  userId?: string;
  starRating: number;
  score: number;
  performanceSummary: string;
  factors: PerformanceFactor[];
  issues: PerformanceIssue[];
  strengths: string[];
  areasOfImprovement: string[];
  suggestions: string[];
  // Added by backend after LLM call
  dailyActivity?: ActivityRow[];
  moodSeries?: MoodPoint[];
  metrics?: MemberMetrics;
}

export interface TeamAggregate {
  memberCount: number;
  avgScore: number;
  avgStarRating: number;
  factorAverages: PerformanceFactor[];
  taskStatus: { done: number; inProgress: number; todo: number; overdue: number };
  dailyActivity: ActivityRow[];
  moodSeries: MoodPoint[];
  ranking: Array<{ name: string; score: number; delta: number }>;
  memberHours?: Array<{
    name: string;
    hours: number;
    billable: number;
    nonBillable: number;
    utilization: number;
  }>;
  totals: {
    hoursLogged: number;
    billableHours?: number;
    nonBillableHours?: number;
    billableUtilization?: number;
    tasksDone: number;
    standupCount: number;
    blockersRaised: number;
  };
}

export interface AnalysisResult {
  teamSummary?: string;
  members: MemberResult[];
  topPerformer?: string | null;
  teamMorale?: string;
  alerts?: string[];
  dateAxis?: string[];
  teamAggregate?: TeamAggregate | null;
  teamMedians?: {
    consistencyPct: number;
    taskCompletionPct: number;
    avgWorkHours: number;
    hoursLogged: number;
    storyPointsDone: number;
  };
}

export interface PerformanceModalProps {
  open: boolean;
  onClose: () => void;
  /** User ID to analyse. Defaults to the current logged-in user. */
  targetUserId?: string;
  targetName?: string;
  targetAvatarUrl?: string;
}

// ── Star display ──────────────────────────────────────────────────────────────

function StarRating({ rating, size = 24 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          className={n <= rating ? 'text-amber-400' : 'text-ds-border'}
          fill={n <= rating ? 'currentColor' : 'none'}
        />
      ))}
    </div>
  );
}

// ── Score ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const clr =
    score >= 90 ? '#22c55e' :
    score >= 75 ? '#3b82f6' :
    score >= 60 ? '#f59e0b' :
    score >= 40 ? '#f97316' : '#ef4444';

  const r = 36;
  const circ = 2 * Math.PI * r;

  // Animate the stroke as the component mounts (entry shine).
  const [animated, setAnimated] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 900);
      setAnimated(score * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);
  const dash = (animated / 100) * circ;

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg width="96" height="96" className="-rotate-90">
        <defs>
          <linearGradient id={`ringGrad-${Math.round(score)}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"  stopColor={clr} stopOpacity={0.95} />
            <stop offset="100%" stopColor={clr} stopOpacity={0.55} />
          </linearGradient>
        </defs>
        <circle cx="48" cy="48" r={r} fill="none" stroke="#f3f4f6" strokeWidth="7" />
        <circle
          cx="48" cy="48" r={r} fill="none"
          stroke={`url(#ringGrad-${Math.round(score)})`} strokeWidth="7"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-xl font-bold text-ds-text">
        <CountUp value={score} />
      </span>
    </div>
  );
}

// ── Factor card ───────────────────────────────────────────────────────────────

const FACTOR_ICONS: Record<string, React.ReactNode> = {
  'Engagement':      <Activity size={14} />,
  'Task Delivery':   <CheckCircle2 size={14} />,
  'Attendance':      <Clock size={14} />,
  'Time Management': <BarChart3 size={14} />,
  'Accountability':  <Users size={14} />,
};

function FactorCard({ factor }: { factor: PerformanceFactor }) {
  const pct = Math.min(100, Math.max(0, factor.score));
  const barColor =
    pct >= 75 ? 'bg-emerald-500' :
    pct >= 50 ? 'bg-blue-500' :
    pct >= 30 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="bg-ds-surface-hover rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-ds-text">
          <span className="text-ds-text-muted">{FACTOR_ICONS[factor.name] ?? <BarChart3 size={14} />}</span>
          {factor.name}
        </div>
        <span className="text-xs font-bold text-ds-text-muted">{pct}/100</span>
      </div>
      <div className="h-1.5 bg-ds-border rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {factor.detail && (
        <p className="text-[11px] text-ds-text-muted leading-snug">{factor.detail}</p>
      )}
    </div>
  );
}

// ── Issue card ────────────────────────────────────────────────────────────────

const SEVERITY_STYLES = {
  high:   { container: 'bg-red-50 border-red-200',    badge: 'bg-red-100 text-red-700',    icon: 'text-red-500'    },
  medium: { container: 'bg-amber-50 border-amber-200', badge: 'bg-amber-100 text-amber-700', icon: 'text-amber-500'  },
  low:    { container: 'bg-blue-50 border-blue-200',   badge: 'bg-blue-100 text-blue-700',   icon: 'text-blue-500'   },
};

function IssueCard({ issue }: { issue: PerformanceIssue }) {
  const sev = issue.severity in SEVERITY_STYLES ? issue.severity : 'low';
  const styles = SEVERITY_STYLES[sev];
  return (
    <div className={`border rounded-xl p-3 flex items-start gap-2.5 ${styles.container}`}>
      <AlertTriangle size={13} className={`mt-0.5 shrink-0 ${styles.icon}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="text-xs font-semibold text-ds-text">{issue.problem}</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase ${styles.badge}`}>
            {issue.severity}
          </span>
        </div>
        <p className="text-[11px] text-ds-text-muted leading-snug">{issue.evidence}</p>
      </div>
    </div>
  );
}

// ── Member result card ────────────────────────────────────────────────────────

export function MemberCard({ member, defaultOpen, teamMedians }: {
  member: MemberResult;
  defaultOpen: boolean;
  teamMedians?: AnalysisResult['teamMedians'];
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [tab, setTab]   = useState<'overview' | 'trends' | 'compare'>('overview');

  const scoreColor =
    member.score >= 90 ? 'text-emerald-600 bg-emerald-50 border-emerald-200' :
    member.score >= 75 ? 'text-blue-600 bg-blue-50 border-blue-200' :
    member.score >= 60 ? 'text-amber-600 bg-amber-50 border-amber-200' :
    member.score >= 40 ? 'text-orange-600 bg-orange-50 border-orange-200' :
    'text-red-600 bg-red-50 border-red-200';

  const m       = member.metrics;
  const hasMetrics = !!m;
  const hasTrend   = !!(member.dailyActivity && member.dailyActivity.length > 0);
  const hasCompare = !!(teamMedians && m);

  const benchmark: BenchmarkRow[] = hasCompare ? [
    { metric: 'Consistency %',  you: m!.consistencyPct,         median: teamMedians!.consistencyPct,    suffix: '%' },
    { metric: 'Task Complete %', you: m!.taskCompletionPct ?? 0, median: teamMedians!.taskCompletionPct, suffix: '%' },
    { metric: 'Avg Hours/Day',  you: m!.avgWorkHours,           median: teamMedians!.avgWorkHours },
    { metric: 'Hours Logged',   you: m!.hoursLogged,            median: teamMedians!.hoursLogged },
    { metric: 'Story Points',   you: m!.storyPointsDone,        median: teamMedians!.storyPointsDone },
  ] : [];

  return (
    <div className="border border-ds-border rounded-2xl overflow-hidden bg-ds-surface">
      {/* Header row — always visible */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 px-5 py-4 bg-gradient-to-r from-white via-white to-indigo-50/30 dark:from-gray-800/60 dark:via-gray-800/40 dark:to-indigo-900/20 hover:from-indigo-50/30 hover:to-purple-50/30 dark:hover:from-indigo-900/30 dark:hover:to-purple-900/20 transition-all"
      >
        {/* Score ring */}
        <ScoreRing score={member.score} />

        {/* Name + summary */}
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-ds-text text-sm">{member.name}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${scoreColor}`}>
              {member.score >= 90 ? 'Exceptional' :
               member.score >= 75 ? 'Good' :
               member.score >= 60 ? 'Satisfactory' :
               member.score >= 40 ? 'Needs Improvement' : 'Poor'}
            </span>
          </div>
          <StarRating rating={member.starRating} size={16} />
          <p className="text-xs text-ds-text-muted mt-1.5 line-clamp-2 leading-relaxed">
            {member.performanceSummary}
          </p>
        </div>

        <span className="text-ds-border shrink-0">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {/* Expandable detail */}
      {open && (
        <div className="px-5 pb-5 bg-gradient-to-b from-white to-indigo-50/30 dark:from-gray-800/30 dark:to-indigo-900/10 border-t border-gray-50 dark:border-gray-700">
          {/* Tabs */}
          <div className="flex items-center gap-1 pt-3 pb-4 border-b border-gray-100">
            {([
              { k: 'overview', label: 'Overview', icon: <BarChart3 size={12} /> },
              { k: 'trends',   label: 'Trends',   icon: <LineChartIcon size={12} /> },
              { k: 'compare',  label: 'Vs Team',  icon: <GitCompareArrows size={12} /> },
            ] as const).map((t) => {
              const disabled = (t.k === 'trends' && !hasTrend) || (t.k === 'compare' && !hasCompare);
              const active = tab === t.k;
              return (
                <button
                  key={t.k}
                  disabled={disabled}
                  onClick={() => setTab(t.k)}
                  className={[
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                    active
                      ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-200'
                      : disabled
                        ? 'text-ds-border cursor-not-allowed'
                        : 'text-ds-text-muted hover:text-indigo-600 hover:bg-indigo-50',
                  ].join(' ')}
                >
                  {t.icon}{t.label}
                </button>
              );
            })}
          </div>

          {/* ── Overview tab ───────────────────────────────────────────────── */}
          {tab === 'overview' && (
            <div className="space-y-4 pt-4">
              {/* Stat strip */}
              {hasMetrics && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <StatChip label="Tasks Done"    value={m!.tasksDone}     accent="emerald" icon={<CheckCircle2 size={11} />} />
                  <StatChip label="Hours Logged"  value={m!.hoursLogged}   decimals={1} accent="indigo"  icon={<Clock size={11} />} />
                  <StatChip label="Standups"      value={m!.standupCount}  accent="blue"    icon={<Activity size={11} />} />
                  <StatChip label="Story Points"  value={m!.storyPointsDone} accent="violet" icon={<Zap size={11} />} />
                </div>
              )}

              {/* Radar + Donut row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {member.factors.length > 0 && (
                  <ChartCard title="Factor Map" subtitle="Strength by dimension">
                    <FactorRadar factors={member.factors as _FactorScore[]} />
                  </ChartCard>
                )}
                {hasMetrics && (
                  <ChartCard title="Task Status" subtitle="Open work distribution">
                    <TaskStatusDonut status={{
                      done:       m!.tasksDone,
                      inProgress: m!.tasksInProgress,
                      todo:       m!.tasksTodo,
                      overdue:    m!.tasksOverdue,
                    }} />
                  </ChartCard>
                )}
              </div>

              {/* Factor bars (kept for narrative detail under the radar) */}
              {member.factors.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-ds-text-muted uppercase tracking-wider mb-2">
                    Performance Factors
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {member.factors.map((f) => (
                      <FactorCard key={f.name} factor={f} />
                    ))}
                  </div>
                </div>
              )}

              {/* Issues */}
              {(member.issues ?? []).length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <AlertTriangle size={11} /> Issues Detected
                  </p>
                  <div className="space-y-2">
                    {(member.issues ?? [])
                      .slice()
                      .sort((a, b) => {
                        const order = { high: 0, medium: 1, low: 2 };
                        return (order[a.severity] ?? 2) - (order[b.severity] ?? 2);
                      })
                      .map((issue, i) => <IssueCard key={i} issue={issue} />)}
                  </div>
                </div>
              )}

              {/* Strengths / improve */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {member.strengths.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <TrendingUp size={11} /> Strengths
                    </p>
                    <ul className="space-y-1">
                      {member.strengths.map((s, i) => (
                        <li key={i} className="text-xs text-ds-text flex items-start gap-1.5">
                          <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>{s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {member.areasOfImprovement.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <TrendingDown size={11} /> Areas to Improve
                    </p>
                    <ul className="space-y-1">
                      {member.areasOfImprovement.map((a, i) => (
                        <li key={i} className="text-xs text-ds-text flex items-start gap-1.5">
                          <span className="text-amber-500 mt-0.5 shrink-0">→</span>{a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Suggestions */}
              {member.suggestions.length > 0 && (
                <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-xl p-4 border border-indigo-100">
                  <p className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Sparkles size={11} /> Improvement Suggestions
                  </p>
                  <ul className="space-y-1.5">
                    {member.suggestions.map((s, i) => (
                      <li key={i} className="text-xs text-indigo-900 flex items-start gap-2">
                        <span className="flex-shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold bg-gradient-to-br from-indigo-500 to-purple-500 text-white">
                          {i + 1}
                        </span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ── Trends tab ─────────────────────────────────────────────────── */}
          {tab === 'trends' && hasTrend && (
            <div className="space-y-4 pt-4">
              <ChartCard title="Daily Activity" subtitle="Standups, EODs and work hours over time">
                <ActivitySparkline rows={member.dailyActivity!} />
              </ChartCard>
              <ChartCard title="Mood Trend" subtitle="From your daily EOD entries">
                <MoodTrend points={member.moodSeries ?? []} />
              </ChartCard>
              {hasMetrics && m!.blockerBreakdown && (
                <ChartCard title="Blockers Raised" subtitle="By severity">
                  <div className="flex items-center gap-3 px-2 py-2">
                    <BlockerPill label="High"     value={m!.blockerBreakdown.high}     color="red" />
                    <BlockerPill label="Medium"   value={m!.blockerBreakdown.medium}   color="amber" />
                    <BlockerPill label="Low"      value={m!.blockerBreakdown.low}      color="blue" />
                    <BlockerPill label="Resolved" value={m!.blockerBreakdown.resolved} color="emerald" />
                  </div>
                </ChartCard>
              )}
            </div>
          )}

          {/* ── Compare tab ────────────────────────────────────────────────── */}
          {tab === 'compare' && hasCompare && (
            <div className="space-y-4 pt-4">
              <ChartCard title="You vs Team Median" subtitle="How this user benchmarks against the team">
                <BenchmarkBars rows={benchmark} />
              </ChartCard>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {benchmark.map((b) => {
                  const delta = b.you - b.median;
                  const better = delta >= 0;
                  return (
                    <div key={b.metric} className="bg-ds-surface border border-ds-border rounded-xl p-3">
                      <p className="text-[10px] text-ds-text-muted uppercase tracking-wide">{b.metric}</p>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-sm font-bold text-ds-text">{b.you}{b.suffix ?? ''}</span>
                        <span className="text-[10px] text-ds-text-muted">vs {b.median}{b.suffix ?? ''}</span>
                      </div>
                      <div className={`mt-1 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                        better ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {better ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                        {better ? '+' : ''}{Math.round(delta * 10) / 10}{b.suffix ?? ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stat chip ────────────────────────────────────────────────────────────────

const CHIP_STYLES = {
  emerald: { grad: 'from-emerald-500 to-teal-500',   icon: 'text-emerald-500' },
  indigo:  { grad: 'from-indigo-500 to-purple-500',  icon: 'text-indigo-500' },
  blue:    { grad: 'from-blue-500 to-cyan-500',      icon: 'text-blue-500' },
  violet:  { grad: 'from-violet-500 to-fuchsia-500', icon: 'text-violet-500' },
} as const;

function StatChip({ label, value, decimals = 0, accent, icon }: {
  label: string; value: number; decimals?: number;
  accent: keyof typeof CHIP_STYLES;
  icon: React.ReactNode;
}) {
  const s = CHIP_STYLES[accent];
  return (
    <div className="relative overflow-hidden rounded-xl border border-ds-border bg-ds-surface p-2.5">
      <div className={`absolute -right-3 -top-3 w-12 h-12 rounded-full bg-gradient-to-br ${s.grad} opacity-10`} />
      <div className="flex items-center gap-1 text-[10px] font-semibold text-ds-text-muted uppercase tracking-wider">
        <span className={s.icon}>{icon}</span> {label}
      </div>
      <p className="text-base font-bold text-ds-text mt-0.5">
        <CountUp value={value} decimals={decimals} />
      </p>
    </div>
  );
}

// ─── Chart card wrapper ───────────────────────────────────────────────────────

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-ds-surface border border-ds-border rounded-2xl p-3 shadow-sm">
      <div className="flex items-baseline justify-between mb-2 px-1">
        <span className="text-[11px] font-bold text-ds-text uppercase tracking-wider">{title}</span>
        {subtitle && <span className="text-[10px] text-ds-text-muted">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

// ─── Blocker pill ─────────────────────────────────────────────────────────────

const BLOCKER_COLORS = {
  red:     { grad: 'from-red-500 to-pink-500',       bg: 'bg-red-50',     text: 'text-red-700' },
  amber:   { grad: 'from-amber-500 to-orange-500',   bg: 'bg-amber-50',   text: 'text-amber-700' },
  blue:    { grad: 'from-blue-500 to-cyan-500',      bg: 'bg-blue-50',    text: 'text-blue-700' },
  emerald: { grad: 'from-emerald-500 to-teal-500',   bg: 'bg-emerald-50', text: 'text-emerald-700' },
} as const;

function BlockerPill({ label, value, color }: { label: string; value: number; color: keyof typeof BLOCKER_COLORS }) {
  const c = BLOCKER_COLORS[color];
  return (
    <div className={`flex-1 rounded-xl p-3 text-center ${c.bg}`}>
      <div className={`inline-flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br ${c.grad} text-white text-xs font-bold mb-1`}>
        <CountUp value={value} />
      </div>
      <p className={`text-[10px] font-semibold uppercase tracking-wider ${c.text}`}>{label}</p>
    </div>
  );
}

// ── Team overview (charts + ranking) ─────────────────────────────────────────

export function TeamOverview({ summary, morale, topPerformer, agg }: {
  summary?: string;
  morale?: string;
  topPerformer?: string | null;
  agg: TeamAggregate;
}) {
  const moraleColor =
    morale === 'High'   ? 'text-emerald-600 bg-emerald-50' :
    morale === 'Medium' ? 'text-amber-600 bg-amber-50' :
    morale === 'Low'    ? 'text-red-600 bg-red-50' :
                          'text-ds-text-muted bg-ds-surface-hover';

  return (
    <div className="rounded-3xl overflow-hidden border border-indigo-100 dark:border-indigo-900/50 bg-gradient-to-br from-indigo-50 via-purple-50/60 to-pink-50/40 dark:from-indigo-950/40 dark:via-purple-950/30 dark:to-pink-950/20 shadow-sm">
      {/* Hero strip — avg score + headline stats */}
      <div className="px-5 pt-5 pb-4 flex items-center gap-5">
        <ScoreRing score={agg.avgScore} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Team Overview</span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white dark:bg-indigo-900/40 border border-indigo-100 dark:border-indigo-700/50 text-indigo-700 dark:text-indigo-300">
              {agg.memberCount} members
            </span>
            {morale && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${moraleColor}`}>
                Morale: {morale}
              </span>
            )}
          </div>
          {summary && <MarkdownText text={summary} className="text-sm text-ds-text mt-1.5" />}
          {topPerformer && (
            <div className="flex items-center gap-1.5 mt-2">
              <Star size={13} className="text-amber-400" fill="currentColor" />
              <span className="text-xs text-ds-text-muted">
                Top performer: <span className="font-semibold text-ds-text">{topPerformer}</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Totals strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 px-5 pb-3">
        <TotalChip label="Tasks Done"    value={agg.totals.tasksDone}    accent="emerald" icon={<CheckCircle2 size={11} />} />
        <TotalChip label="Hours Logged"  value={agg.totals.hoursLogged}  decimals={1} accent="indigo"  icon={<Clock size={11} />} />
        {typeof agg.totals.billableUtilization === 'number' && (
          <TotalChip label="Billable %"  value={agg.totals.billableUtilization} accent="emerald" icon={<Zap size={11} />} />
        )}
        <TotalChip label="Standups"      value={agg.totals.standupCount} accent="blue"   icon={<Activity size={11} />} />
        <TotalChip label="Blockers"      value={agg.totals.blockersRaised} accent="violet" icon={<AlertCircle size={11} />} />
      </div>

      {/* Charts grid */}
      <div className="px-5 pb-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {agg.factorAverages.length > 0 && (
            <ChartCard title="Team Strengths" subtitle="Average across all members">
              <FactorRadar factors={agg.factorAverages} />
            </ChartCard>
          )}
          <ChartCard title="Team Task Status" subtitle="Combined across the team">
            <TaskStatusDonut status={agg.taskStatus} />
          </ChartCard>
        </div>

        {agg.dailyActivity.length > 0 && (
          <ChartCard title="Team Activity" subtitle="Daily standups, EODs and total hours">
            <ActivitySparkline rows={agg.dailyActivity} />
          </ChartCard>
        )}

        {agg.moodSeries.length > 0 && (
          <ChartCard title="Team Mood" subtitle="Average daily mood across the team">
            <MoodTrend points={agg.moodSeries} />
          </ChartCard>
        )}

        {agg.ranking.length > 0 && (
          <ChartCard title="Member Ranking" subtitle="Score from highest to lowest">
            <div className="space-y-1.5 pt-1">
              {agg.ranking.map((r, i) => {
                const better  = r.delta >= 0;
                const barPct  = Math.max(2, Math.min(100, r.score));
                return (
                  <div key={r.name + i} className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-ds-text-muted w-5">#{i + 1}</span>
                    <span className="text-xs font-medium text-ds-text truncate w-32 shrink-0">{r.name}</span>
                    <div className="flex-1 h-2 bg-ds-border rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-700"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-ds-text w-9 text-right">{r.score}</span>
                    <span className={`text-[10px] font-semibold w-12 text-right ${better ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {better ? '+' : ''}{Math.round(r.delta)}
                    </span>
                  </div>
                );
              })}
            </div>
          </ChartCard>
        )}
      </div>
    </div>
  );
}

function TotalChip({ label, value, decimals = 0, accent, icon }: {
  label: string; value: number; decimals?: number;
  accent: keyof typeof CHIP_STYLES;
  icon: React.ReactNode;
}) {
  const s = CHIP_STYLES[accent];
  return (
    <div className="relative overflow-hidden rounded-xl bg-ds-surface p-2.5 border border-ds-border shadow-sm">
      <div className={`absolute -right-3 -top-3 w-14 h-14 rounded-full bg-gradient-to-br ${s.grad} opacity-15`} />
      <div className="flex items-center gap-1 text-[10px] font-semibold text-ds-text-muted uppercase tracking-wider">
        <span className={s.icon}>{icon}</span> {label}
      </div>
      <p className="text-base font-bold text-ds-text mt-0.5">
        <CountUp value={value} decimals={decimals} />
      </p>
    </div>
  );
}

// ── Loading state ─────────────────────────────────────────────────────────────

// Stages cycled during analysis. Each stage holds for roughly equal time slices.
const ANALYSIS_STAGES: Array<{ label: string; pct: number }> = [
  { label: 'Loading workspace data',     pct: 18 },
  { label: 'Aggregating tasks & sprints', pct: 36 },
  { label: 'Reviewing attendance & time', pct: 54 },
  { label: 'Scoring engagement & mood',   pct: 72 },
  { label: 'Generating AI insights',      pct: 92 },
];

// Expected wall-time for a fresh analysis. We pace the progress to land at ~95%
// after this duration, then hold there until the real response arrives.
const EXPECTED_DURATION_MS = 6500;

export function AnalysisLoading({ expedited = false, subjectName, subjectAvatarUrl }: {
  expedited?: boolean;
  subjectName?: string;
  subjectAvatarUrl?: string;
}) {
  const [pct, setPct]     = useState(0);
  const [stageIdx, setIdx] = useState(0);

  useEffect(() => {
    const start = performance.now();
    // When the result is cached, the call completes in <300ms — race the bar to ~80% fast.
    const duration = expedited ? 600 : EXPECTED_DURATION_MS;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 2); // ease-out quad
      const next = eased * 95;              // never reach 100 until response lands
      setPct(next);
      let nextStage = 0;
      for (let i = 0; i < ANALYSIS_STAGES.length; i++) {
        if (next >= ANALYSIS_STAGES[i].pct - 18) nextStage = i;
      }
      setIdx(nextStage);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [expedited]);

  const stage = ANALYSIS_STAGES[stageIdx] ?? ANALYSIS_STAGES[ANALYSIS_STAGES.length - 1];
  const pctRounded = Math.round(pct);

  // ── Spirograph "rangoli" geometry ───────────────────────────────────────
  // 60 radiating spokes shooting outward from the ring edge, and 60 chord
  // strands connecting ring points to (i + STEP) so the line crossings form
  // the spirograph polygon visible in classic string-art. STEP being coprime
  // with the point count gives the densest star pattern.
  const SPOKE_COUNT = 60;
  const CHORD_COUNT = 60;
  const CHORD_STEP  = 23;   // any odd value coprime with 60 — 23 is a good star
  const INNER_R     = 56;   // just outside the spinning gradient ring
  const SPOKE_R     = 160;  // how far spokes extend
  const CHORD_R     = 130;  // ring on which chord endpoints sit

  const spokes = Array.from({ length: SPOKE_COUNT }, (_, i) => {
    const angle = (i / SPOKE_COUNT) * Math.PI * 2;
    return {
      x1:  Math.cos(angle) * INNER_R,
      y1:  Math.sin(angle) * INNER_R,
      x2:  Math.cos(angle) * SPOKE_R,
      y2:  Math.sin(angle) * SPOKE_R,
      hue: Math.round((i / SPOKE_COUNT) * 360),
      delay: (i * 70) % 1500,
    };
  });

  const chords = Array.from({ length: CHORD_COUNT }, (_, i) => {
    const a1 = (i / CHORD_COUNT) * Math.PI * 2;
    const a2 = ((i + CHORD_STEP) / CHORD_COUNT) * Math.PI * 2;
    return {
      x1:  Math.cos(a1) * CHORD_R,
      y1:  Math.sin(a1) * CHORD_R,
      x2:  Math.cos(a2) * CHORD_R,
      y2:  Math.sin(a2) * CHORD_R,
      hue: Math.round((((i / CHORD_COUNT) + ((i + CHORD_STEP) / CHORD_COUNT)) / 2) * 360),
      delay: (i * 50) % 2000,
    };
  });

  // A few "sparks" — small bright dots that drift outward over the spirograph
  // for the firework-shower feel.
  const SPARK_COLORS = ['#fde047', '#fb7185', '#a78bfa', '#34d399', '#60a5fa', '#f97316'];
  const sparks = Array.from({ length: 18 }, (_, i) => ({
    angle: (i * 20 + 7) % 360,
    color: SPARK_COLORS[i % SPARK_COLORS.length],
    delay: (i * 130) % 1800,
  }));

  // Avatar initials fallback
  const initials = (subjectName ?? '?')
    .split(' ').slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('') || '?';

  return (
    <div className="relative py-10 px-2 overflow-hidden">
      {/* Local keyframes — scoped via a unique id wouldn't be necessary; using
          a single block since this component renders one at a time. */}
      <style>{`
        @keyframes spin-slow      { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes spin-reverse   { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
        @keyframes burst-out {
          0%   { transform: translate(-50%, -50%) translate(0, 0) scale(0); opacity: 0; }
          15%  { transform: translate(-50%, -50%) translate(0, 0) scale(1); opacity: 1; }
          100% { transform: translate(-50%, -50%) translate(var(--dx), var(--dy)) scale(0.3); opacity: 0; }
        }
        @keyframes ambient-glow {
          0%, 100% { transform: scale(1) rotate(0deg);   opacity: 0.55; }
          50%      { transform: scale(1.15) rotate(180deg); opacity: 0.85; }
        }
        @keyframes hue-cycle {
          0%   { filter: hue-rotate(0deg);   }
          100% { filter: hue-rotate(360deg); }
        }
        /* "Diwali" spoke: line draws from inner edge outward, then fades — repeats */
        @keyframes spoke-shoot {
          0%   { stroke-dashoffset: 110; opacity: 0; }
          20%  { opacity: 1; }
          70%  { opacity: 1; }
          100% { stroke-dashoffset: -110; opacity: 0; }
        }
        /* Chord strands gently pulse and breathe — the persistent string-art layer */
        @keyframes chord-breathe {
          0%, 100% { opacity: 0.18; stroke-width: 0.5; }
          50%      { opacity: 0.55; stroke-width: 0.9; }
        }
      `}</style>

      {/* Ambient gradient orbs behind the avatar — slowly morph & rotate */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          className="absolute w-64 h-64 rounded-full bg-gradient-to-br from-indigo-400/50 via-purple-400/40 to-pink-400/40 blur-3xl"
          style={{ animation: 'ambient-glow 6s ease-in-out infinite' }}
        />
        <div
          className="absolute w-48 h-48 rounded-full bg-gradient-to-tr from-blue-400/40 via-cyan-300/30 to-emerald-400/40 blur-3xl"
          style={{ animation: 'ambient-glow 8s ease-in-out infinite reverse' }}
        />
      </div>

      {/* Center: spirograph rangoli + spinning avatar in the middle */}
      <div className="relative flex flex-col items-center mb-6 pt-2">
        {/* Stage stage for the spirograph — fixed 360×360 box, avatar centered */}
        <div className="relative w-[360px] max-w-full aspect-square mx-auto flex items-center justify-center">

          {/* SVG rangoli — covers the whole stage, anchored at center */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="-200 -200 400 400"
            preserveAspectRatio="xMidYMid meet"
            style={{ animation: 'hue-cycle 9s linear infinite' }}
          >
            {/* Layer A: persistent chord strands (slow rotation, breathing opacity) */}
            <g style={{ animation: 'spin-reverse 38s linear infinite', transformOrigin: 'center' }}>
              {chords.map((c, i) => (
                <line
                  key={`c${i}`}
                  x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2}
                  stroke={`hsl(${c.hue}, 85%, 62%)`}
                  strokeWidth={0.6}
                  strokeLinecap="round"
                  style={{ animation: `chord-breathe 4s ease-in-out ${c.delay}ms infinite` }}
                />
              ))}
            </g>
            {/* Faint second chord layer with a different step for a denser star */}
            <g style={{ animation: 'spin-slow 60s linear infinite', transformOrigin: 'center', opacity: 0.45 }}>
              {chords.map((c, i) => {
                // Re-route: connect i → i+17 for a rosette overlay
                const a1 = (i / CHORD_COUNT) * Math.PI * 2;
                const a2 = ((i + 17) / CHORD_COUNT) * Math.PI * 2;
                return (
                  <line
                    key={`c2-${i}`}
                    x1={Math.cos(a1) * CHORD_R} y1={Math.sin(a1) * CHORD_R}
                    x2={Math.cos(a2) * CHORD_R} y2={Math.sin(a2) * CHORD_R}
                    stroke={`hsl(${c.hue + 60}, 85%, 65%)`}
                    strokeWidth={0.4}
                    strokeLinecap="round"
                  />
                );
              })}
            </g>

            {/* Layer B: radiating spokes shooting outward (Diwali firework effect) */}
            <g>
              {spokes.map((s, i) => (
                <line
                  key={`s${i}`}
                  x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
                  stroke={`hsl(${s.hue}, 90%, 60%)`}
                  strokeWidth={0.9}
                  strokeLinecap="round"
                  // Dash pattern: visible 60u then 999u gap, animated outward
                  strokeDasharray="55 999"
                  style={{
                    filter: `drop-shadow(0 0 3px hsl(${s.hue}, 90%, 60%))`,
                    animation: `spoke-shoot 1.8s ease-out ${s.delay}ms infinite`,
                  }}
                />
              ))}
            </g>

            {/* Layer C: bright sparks travelling along the spoke directions */}
            <g>
              {sparks.map((sp, i) => {
                const rad = (sp.angle * Math.PI) / 180;
                return (
                  <circle
                    key={`sp${i}`}
                    cx={Math.cos(rad) * INNER_R}
                    cy={Math.sin(rad) * INNER_R}
                    r={1.6}
                    fill={sp.color}
                    style={{
                      filter: `drop-shadow(0 0 6px ${sp.color})`,
                      // Reuse burst-out keyframe: we set --dx/--dy via custom props
                      ['--dx' as string]: `${Math.cos(rad) * 120}px`,
                      ['--dy' as string]: `${Math.sin(rad) * 120}px`,
                      animation: `burst-out 2.2s ease-out ${sp.delay}ms infinite`,
                      transformBox: 'fill-box',
                      transformOrigin: 'center',
                    } as React.CSSProperties}
                  />
                );
              })}
            </g>
          </svg>

          {/* Avatar puck — centered above the SVG */}
          <div className="relative z-10 w-28 h-28">
            <div
              className="absolute inset-0 rounded-full p-1"
              style={{
                background: 'conic-gradient(from 0deg, #6366f1, #a855f7, #ec4899, #f59e0b, #10b981, #3b82f6, #6366f1)',
                animation: 'spin-slow 2.5s linear infinite',
              }}
            >
              <div className="w-full h-full rounded-full bg-white dark:bg-gray-900" />
            </div>
            <div className="absolute inset-1.5 rounded-full bg-gradient-to-br from-white to-indigo-50 dark:from-gray-800 dark:to-indigo-950 flex items-center justify-center overflow-hidden shadow-inner">
              {subjectAvatarUrl ? (
                // eslint-disable-next-line jsx-a11y/img-redundant-alt
                <img src={subjectAvatarUrl} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-bold bg-gradient-to-br from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  {initials}
                </span>
              )}
            </div>
          </div>
        </div>

        {subjectName && (
          <p className="mt-3 text-sm font-semibold text-ds-text">{subjectName}</p>
        )}
        <p className="text-[11px] text-ds-text-muted mt-0.5">{stage.label}…</p>
      </div>

      {/* Big percentage + progress bar */}
      <div className="relative flex items-baseline justify-center gap-1 mb-3">
        <span
          className="text-5xl font-bold tabular-nums bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent"
          style={{ animation: 'hue-cycle 4s linear infinite' }}
        >
          {pctRounded}
        </span>
        <span className="text-xl font-bold text-indigo-400">%</span>
      </div>

      <div className="relative h-2 rounded-full bg-indigo-50 overflow-hidden mb-5">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-white/50 to-transparent"
          style={{
            left: `${Math.max(0, pct - 12)}%`,
            transition: 'left 0.3s ease-out',
            transform: 'skewX(-12deg)',
          }}
        />
      </div>

      {/* Stage chips */}
      <div className="relative flex flex-wrap gap-1.5 justify-center">
        {ANALYSIS_STAGES.map((s, i) => {
          const active = i === stageIdx;
          const done   = i < stageIdx;
          return (
            <span
              key={s.label}
              className={[
                'flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium transition-all',
                done   ? 'bg-emerald-50 text-emerald-600' :
                active ? 'bg-indigo-100 text-indigo-700 shadow-sm scale-105' :
                          'bg-ds-surface-hover text-ds-text-muted',
              ].join(' ')}
            >
              {done ? <CheckCircle2 size={10} /> : active ? <Activity size={10} className="animate-pulse" /> : null}
              {s.label.replace(/…$/, '')}
            </span>
          );
        })}
      </div>

      {/* Skeleton chart placeholders */}
      <div className="relative grid grid-cols-2 gap-2 mt-6">
        <div className="h-24 rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 animate-pulse" />
        <div className="h-24 rounded-2xl bg-gradient-to-br from-purple-50 to-pink-50 animate-pulse" />
        <div className="h-16 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 animate-pulse col-span-2" />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const RANGE_LABELS: Record<7 | 30 | 90, string> = {
  7:  'Weekly',
  30: 'Monthly',
  90: 'Quarterly',
};


export default function PerformanceModal({
  open,
  onClose,
  targetUserId,
  targetName,
  targetAvatarUrl,
}: PerformanceModalProps) {
  const { user } = useAuth();
  const [days, setDays] = useState<7 | 30 | 90>(7);

  // Permissions
  const isAdmin   = hasPermission(user, PERMISSIONS.AI_TEAM_ANALYSIS); // org-wide cross-team viewer
  const canTeam   = hasPermission(user, PERMISSIONS.AI_PERFORMANCE);   // can view a team they belong to

  // Data sources
  const { data: usersData } = useUsers();
  const users = usersData ?? [];
  const { data: teamsData } = useTeams();
  const allTeams = (teamsData ?? []) as Array<{
    id: string; name: string;
    members?: Array<{ id: string }>;
    leadUserId?: string | null;
    memberCount?: number;
  }>;

  // Teams visible to this user:
  //   - admin (AI_TEAM_ANALYSIS) → every team
  //   - AI_PERFORMANCE          → teams where they are a member or the lead
  const myUserId = String(user?.id ?? '');
  const visibleTeams = isAdmin
    ? allTeams
    : allTeams.filter((t) =>
        (t.members ?? []).some((m) => String(m.id) === myUserId) ||
        String(t.leadUserId ?? '') === myUserId
      );

  // Default mode + team:
  //   - If a specific target user was passed in (e.g. from Directory) → ignored, individual mode.
  //   - Admin: default to "all-teams" (cross-team org view).
  //   - Has a team-scoped permission → default to "team" with first visible team.
  //   - Otherwise → individual (self).
  const defaultMode: 'all-teams' | 'team' | 'individual' =
    targetUserId ? 'individual' :
    isAdmin      ? 'all-teams'  :
    canTeam && visibleTeams.length > 0 ? 'team' :
    'individual';

  const [mode, setMode]           = useState<'all-teams' | 'team' | 'individual'>(defaultMode);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string>(targetUserId ?? '');

  // Once the teams list loads, auto-pick the user's first visible team if none chosen.
  useEffect(() => {
    if (mode === 'team' && !selectedTeamId && visibleTeams.length > 0) {
      setSelectedTeamId(visibleTeams[0].id);
    }
  }, [mode, selectedTeamId, visibleTeams]);

  // When permissions/teams resolve, recover from a stale default mode.
  useEffect(() => {
    if (targetUserId) return; // explicit target overrides
    if (mode === 'all-teams' && !isAdmin) setMode(canTeam && visibleTeams.length > 0 ? 'team' : 'individual');
  }, [isAdmin, canTeam, visibleTeams.length, mode, targetUserId]);

  const analyze = useAiHolisticPerformance();

  // Compute effective scope to send to the API.
  //   - effectiveTargetId : set ONLY in individual mode (a specific user is requested)
  //   - effectiveTeamId   : set ONLY in team mode (a team is requested)
  //   - both undefined    : all-teams (admin org-wide view)
  const effectiveTargetId =
    targetUserId ? targetUserId :
    mode === 'individual' ? (isAdmin ? (selectedUserId || undefined) : (user?.id ?? undefined)) :
    undefined;

  const effectiveTeamId = mode === 'team' ? (selectedTeamId || undefined) : undefined;

  const triggerAnalysis = (forceRefresh = false) => {
    if (!open) return;
    // Don't fire until the user has actually picked a team in team mode (avoids 400 + flicker).
    if (mode === 'team' && !effectiveTeamId) return;
    analyze.reset();
    analyze.mutate({
      targetUserId: effectiveTargetId,
      teamId:       effectiveTeamId,
      days,
      forceRefresh,
    });
  };

  // Trigger when modal opens, days change, or effective scope changes
  useEffect(() => {
    if (open) triggerAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, days, effectiveTargetId, effectiveTeamId]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: AnalysisResult | null = (analyze.data as any)?.data ?? analyze.data ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromCache: boolean = !!(analyze.data as any)?.meta?.cached;

  // Determine display name for the header
  const selectedTeamName = visibleTeams.find((t) => t.id === selectedTeamId)?.name;
  const displayName =
    targetName ? targetName
    : mode === 'all-teams'  ? 'Organization'
    : mode === 'team'       ? (selectedTeamName ?? 'Team')
    : isAdmin && selectedUserId
      ? (users.find((u) => u.id === selectedUserId)?.name ?? 'Individual')
    : (user?.name ?? 'My');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title=""
      size="2xl"
    >
      {/* Custom header */}
      <div className="-mt-2 -mx-1">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            {targetUserId && (targetAvatarUrl || targetName) ? (
              <div className="relative shrink-0">
                <UserAvatar
                  name={targetName ?? ''}
                  avatarUrl={targetAvatarUrl}
                  size="md"
                  className="ring-2 ring-indigo-200"
                />
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center ring-2 ring-white">
                  <Sparkles size={10} className="text-white" />
                </div>
              </div>
            ) : (
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
                <Sparkles size={18} className="text-white" />
              </div>
            )}
            <div>
              <h2 className="text-base font-bold text-ds-text">
                {displayName} Performance Analysis
              </h2>
              <p className="text-xs text-ds-text-muted">AI-powered holistic review across all modules</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Cache indicator */}
            {fromCache && !analyze.isPending && (
              <span
                title="Served from cache (10-min TTL). Refresh to recompute."
                className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100"
              >
                <Zap size={10} /> Cached
              </span>
            )}

            {/* Refresh — bypasses cache */}
            <button
              onClick={() => triggerAnalysis(true)}
              disabled={analyze.isPending}
              title="Recompute (bypass cache)"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-ds-text-muted hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 transition-all"
            >
              <RefreshCw size={12} className={analyze.isPending ? 'animate-spin' : ''} />
            </button>

            {/* Time range selector */}
            <div className="flex items-center gap-1 bg-ds-border rounded-xl p-1">
              {([7, 30, 90] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={[
                    'px-3 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap',
                    days === d
                      ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                      : 'text-ds-text-muted hover:text-ds-text',
                  ].join(' ')}
                >
                  {RANGE_LABELS[d]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Scope picker — hidden when a specific target user was passed in (Directory click) */}
        {!targetUserId && (isAdmin || canTeam) && (
          <div className="flex flex-wrap items-center gap-3 mb-4">
            {/* Mode segmented control */}
            <div className="flex items-center gap-1 bg-ds-border rounded-xl p-1">
              {isAdmin && (
                <button
                  onClick={() => setMode('all-teams')}
                  className={[
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                    mode === 'all-teams'
                      ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                      : 'text-ds-text-muted hover:text-ds-text',
                  ].join(' ')}
                >
                  <Sparkles size={13} /> All Teams
                </button>
              )}
              <button
                onClick={() => setMode('team')}
                disabled={!isAdmin && visibleTeams.length === 0}
                title={!isAdmin && visibleTeams.length === 0 ? 'You are not a member of any team yet.' : ''}
                className={[
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  mode === 'team'
                    ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                    : visibleTeams.length === 0 && !isAdmin
                      ? 'text-ds-border cursor-not-allowed'
                      : 'text-ds-text-muted hover:text-ds-text',
                ].join(' ')}
              >
                <Users size={13} /> Team
              </button>
              <button
                onClick={() => setMode('individual')}
                className={[
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  mode === 'individual'
                    ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                    : 'text-ds-text-muted hover:text-ds-text',
                ].join(' ')}
              >
                <User size={13} /> Individual
              </button>
            </div>

            {/* Team picker — visible only in team mode */}
            {mode === 'team' && (
              <div className="flex-1 min-w-[200px] relative">
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="w-full text-xs border border-ds-border rounded-xl px-3 py-2 pr-8 bg-ds-surface text-ds-text focus:outline-none focus:ring-2 focus:ring-indigo-300 appearance-none"
                >
                  {visibleTeams.length === 0 ? (
                    <option value="">— No teams available —</option>
                  ) : (
                    <>
                      {!isAdmin && <option value="">— Select your team —</option>}
                      {isAdmin && <option value="">— Select a team —</option>}
                      {visibleTeams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}{typeof t.memberCount === 'number' ? ` (${t.memberCount})` : ''}
                        </option>
                      ))}
                    </>
                  )}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-ds-text-muted pointer-events-none" />
              </div>
            )}

            {/* User picker — visible only in individual mode, admin only */}
            {mode === 'individual' && isAdmin && (
              <div className="flex-1 min-w-[200px] relative">
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full text-xs border border-ds-border rounded-xl px-3 py-2 pr-8 bg-ds-surface text-ds-text focus:outline-none focus:ring-2 focus:ring-indigo-300 appearance-none"
                >
                  <option value="">— Select a team member —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-ds-text-muted pointer-events-none" />
              </div>
            )}
          </div>
        )}

        {/* Content */}
        {mode === 'team' && !effectiveTeamId && !analyze.isPending && (
          <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
              <Users size={26} className="text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ds-text">
                {visibleTeams.length === 0 ? 'No teams available' : 'Pick a team to analyse'}
              </p>
              <p className="text-xs text-ds-text-muted mt-1 max-w-xs">
                {visibleTeams.length === 0
                  ? isAdmin
                    ? 'No teams exist yet in this tenant. Create one in Admin → Teams.'
                    : 'You are not a member of any team. Ask an admin to add you to one.'
                  : 'Choose a team from the dropdown above to see its performance.'}
              </p>
            </div>
          </div>
        )}

        {analyze.isPending && (
          <AnalysisLoading
            subjectName={displayName === 'Organization' ? 'All Teams' : displayName}
            subjectAvatarUrl={targetAvatarUrl}
          />
        )}

        {analyze.isError && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-xl p-4 mb-4">
            <AlertCircle size={16} className="text-red-500 shrink-0" />
            <p className="text-sm text-red-700">
              {(analyze.error as Error)?.message || 'Failed to analyse performance. Try again.'}
            </p>
          </div>
        )}

        {result && !analyze.isPending && result.members.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-ds-border flex items-center justify-center">
              <Users size={22} className="text-ds-text-muted" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ds-text">No performance data found</p>
              <p className="text-xs text-ds-text-muted mt-1 max-w-xs">
                {result.teamSummary && result.teamSummary !== 'No member data found for the selected period.'
                  ? result.teamSummary
                  : `No active team members with activity in the last ${days} days. Try a longer time range.`}
              </p>
            </div>
            <div className="flex gap-2 mt-1">
              {([7, 30, 90] as const).filter((d) => d > days).map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-medium transition-colors"
                >
                  Try {RANGE_LABELS[d]}
                </button>
              ))}
            </div>
          </div>
        )}

        {result && !analyze.isPending && result.members.length > 0 && (
          <div className="space-y-4">
            {/* Team overview block — for any user viewing a team / org with 2+ members */}
            {result.members.length > 1 && result.teamAggregate && (
              <TeamOverview
                summary={result.teamSummary}
                morale={result.teamMorale}
                topPerformer={result.topPerformer}
                agg={result.teamAggregate}
              />
            )}

            {/* Alerts */}
            {(result.alerts ?? []).length > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 space-y-1">
                <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider flex items-center gap-1">
                  <AlertCircle size={11} /> Alerts
                </p>
                {result.alerts!.map((a, i) => (
                  <p key={i} className="text-xs text-red-700">{a}</p>
                ))}
              </div>
            )}

            {/* Member cards — scrollable if many */}
            <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
              {result.members.map((m, i) => (
                <MemberCard
                  key={m.name + i}
                  member={m}
                  defaultOpen={result.members.length === 1}
                  teamMedians={result.teamMedians}
                />
              ))}
            </div>

            {/* Footer */}
            <p className="text-[10px] text-ds-text-muted text-center pt-1">
              Analysis based on last {days} days · Powered by AI — use as guidance, not as sole evaluation
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
