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
} from 'lucide-react';
import Modal from './Modal';
import { useAiHolisticPerformance } from '../../hooks/useAiInsights';
import { useAuth } from '../../contexts/AuthContext';
import { useUsers } from '../../hooks/useUsers';

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

interface MemberResult {
  name: string;
  starRating: number;
  score: number;
  performanceSummary: string;
  factors: PerformanceFactor[];
  issues: PerformanceIssue[];
  strengths: string[];
  areasOfImprovement: string[];
  suggestions: string[];
}

interface AnalysisResult {
  teamSummary?: string;
  members: MemberResult[];
  topPerformer?: string | null;
  teamMorale?: string;
  alerts?: string[];
}

export interface PerformanceModalProps {
  open: boolean;
  onClose: () => void;
  /** User ID to analyse. Defaults to the current logged-in user. */
  targetUserId?: string;
  targetName?: string;
}

// ── Star display ──────────────────────────────────────────────────────────────

function StarRating({ rating, size = 24 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          className={n <= rating ? 'text-amber-400' : 'text-gray-200'}
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
  const dash = (score / 100) * circ;

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg width="96" height="96" className="-rotate-90">
        <circle cx="48" cy="48" r={r} fill="none" stroke="#f3f4f6" strokeWidth="7" />
        <circle
          cx="48" cy="48" r={r} fill="none"
          stroke={clr} strokeWidth="7"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
      </svg>
      <span className="absolute text-xl font-bold text-gray-900">{score}</span>
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
    <div className="bg-gray-50 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
          <span className="text-gray-400">{FACTOR_ICONS[factor.name] ?? <BarChart3 size={14} />}</span>
          {factor.name}
        </div>
        <span className="text-xs font-bold text-gray-600">{pct}/100</span>
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {factor.detail && (
        <p className="text-[11px] text-gray-500 leading-snug">{factor.detail}</p>
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
          <span className="text-xs font-semibold text-gray-800">{issue.problem}</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase ${styles.badge}`}>
            {issue.severity}
          </span>
        </div>
        <p className="text-[11px] text-gray-600 leading-snug">{issue.evidence}</p>
      </div>
    </div>
  );
}

// ── Member result card ────────────────────────────────────────────────────────

function MemberCard({ member, defaultOpen }: { member: MemberResult; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  const scoreColor =
    member.score >= 90 ? 'text-emerald-600 bg-emerald-50 border-emerald-200' :
    member.score >= 75 ? 'text-blue-600 bg-blue-50 border-blue-200' :
    member.score >= 60 ? 'text-amber-600 bg-amber-50 border-amber-200' :
    member.score >= 40 ? 'text-orange-600 bg-orange-50 border-orange-200' :
    'text-red-600 bg-red-50 border-red-200';

  return (
    <div className="border border-gray-100 rounded-2xl overflow-hidden">
      {/* Header row — always visible */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 px-5 py-4 bg-white hover:bg-gray-50 transition-colors"
      >
        {/* Score ring */}
        <ScoreRing score={member.score} />

        {/* Name + summary */}
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-gray-900 text-sm">{member.name}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${scoreColor}`}>
              {member.score >= 90 ? 'Exceptional' :
               member.score >= 75 ? 'Good' :
               member.score >= 60 ? 'Satisfactory' :
               member.score >= 40 ? 'Needs Improvement' : 'Poor'}
            </span>
          </div>
          <StarRating rating={member.starRating} size={16} />
          <p className="text-xs text-gray-500 mt-1.5 line-clamp-2 leading-relaxed">
            {member.performanceSummary}
          </p>
        </div>

        <span className="text-gray-300 shrink-0">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {/* Expandable detail */}
      {open && (
        <div className="px-5 pb-5 space-y-4 bg-white border-t border-gray-50">
          {/* Factor cards */}
          {member.factors.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Performance Factors
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {member.factors.map((f) => (
                  <FactorCard key={f.name} factor={f} />
                ))}
              </div>
            </div>
          )}

          {/* Issues detected */}
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
                  .map((issue, i) => (
                    <IssueCard key={i} issue={issue} />
                  ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Strengths */}
            {member.strengths.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <TrendingUp size={11} /> Strengths
                </p>
                <ul className="space-y-1">
                  {member.strengths.map((s, i) => (
                    <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                      <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Areas of improvement */}
            {member.areasOfImprovement.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <TrendingDown size={11} /> Areas to Improve
                </p>
                <ul className="space-y-1">
                  {member.areasOfImprovement.map((a, i) => (
                    <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                      <span className="text-amber-500 mt-0.5 shrink-0">→</span>
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Improvement suggestions */}
          {member.suggestions.length > 0 && (
            <div className="bg-indigo-50 rounded-xl p-3">
              <p className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Sparkles size={11} /> Improvement Suggestions
              </p>
              <ul className="space-y-1.5">
                {member.suggestions.map((s, i) => (
                  <li key={i} className="text-xs text-indigo-800 flex items-start gap-2">
                    <span className="text-indigo-400 font-bold mt-0.5 shrink-0">{i + 1}.</span>
                    {s}
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

// ── Loading state ─────────────────────────────────────────────────────────────

function AnalysisLoading() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-5">
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-4 border-indigo-100 border-t-indigo-500 animate-spin" />
        <Sparkles size={20} className="absolute inset-0 m-auto text-indigo-500 animate-pulse" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-700">Analysing performance…</p>
        <p className="text-xs text-gray-400 mt-1">
          Scanning tasks, attendance, time logs, standups & more
        </p>
      </div>
      <div className="flex gap-1.5">
        {['Tasks', 'Attendance', 'Leave', 'Standups', 'Time'].map((label, i) => (
          <span
            key={label}
            className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-500 font-medium animate-pulse"
            style={{ animationDelay: `${i * 0.15}s` }}
          >
            {label}
          </span>
        ))}
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

const ADMIN_ROLES = ['TENANT_ADMIN', 'PMO', 'DELIVERY_LEAD'];

export default function PerformanceModal({
  open,
  onClose,
  targetUserId,
  targetName,
}: PerformanceModalProps) {
  const { user } = useAuth();
  const [days, setDays] = useState<7 | 30 | 90>(7);

  // 'team' = all-team analysis (admin only), 'individual' = pick one user
  const [viewMode, setViewMode] = useState<'team' | 'individual'>('team');
  const [selectedUserId, setSelectedUserId] = useState<string>(targetUserId ?? '');

  const isAdmin = ADMIN_ROLES.includes(user?.role ?? '');
  const { data: usersData } = useUsers();
  const users = usersData ?? [];

  const analyze = useAiHolisticPerformance();

  // Compute the effective targetUserId to pass to the API
  const effectiveTargetId =
    // If a specific user was passed in as a prop (e.g. from Directory), always use it
    targetUserId ? targetUserId
    // Admin in team mode → no targetUserId = full team
    : isAdmin && viewMode === 'team' ? undefined
    // Admin in individual mode → use selected user
    : isAdmin && viewMode === 'individual' ? (selectedUserId || undefined)
    // Non-admin → always their own id
    : (user?.id ?? undefined);

  const triggerAnalysis = () => {
    if (!open) return;
    analyze.reset();
    analyze.mutate({ targetUserId: effectiveTargetId, days });
  };

  // Trigger when modal opens, days change, or effective target changes
  useEffect(() => {
    if (open) triggerAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, days, effectiveTargetId]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: AnalysisResult | null = (analyze.data as any)?.data ?? analyze.data ?? null;

  // Determine display name for the header
  const displayName =
    targetName ? targetName
    : isAdmin && viewMode === 'team' ? 'Team'
    : isAdmin && viewMode === 'individual' && selectedUserId
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
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
              <Sparkles size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {displayName} Performance Analysis
              </h2>
              <p className="text-xs text-gray-400">AI-powered holistic review across all modules</p>
            </div>
          </div>

          {/* Time range selector */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 shrink-0">
            {([7, 30, 90] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={[
                  'px-3 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap',
                  days === d
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                ].join(' ')}
              >
                {RANGE_LABELS[d]}
              </button>
            ))}
          </div>
        </div>

        {/* Team / Individual toggle — only for admins when no specific user is passed */}
        {isAdmin && !targetUserId && (
          <div className="flex items-center gap-3 mb-4">
            {/* View mode toggle */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
              <button
                onClick={() => setViewMode('team')}
                className={[
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  viewMode === 'team'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                ].join(' ')}
              >
                <Users size={13} /> Team
              </button>
              <button
                onClick={() => setViewMode('individual')}
                className={[
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  viewMode === 'individual'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                ].join(' ')}
              >
                <User size={13} /> Individual
              </button>
            </div>

            {/* User picker — visible only in individual mode */}
            {viewMode === 'individual' && (
              <div className="flex-1 relative">
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 pr-8 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 appearance-none"
                >
                  <option value="">— Select a team member —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            )}
          </div>
        )}

        {/* Content */}
        {analyze.isPending && <AnalysisLoading />}

        {analyze.isError && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-xl p-4 mb-4">
            <AlertCircle size={16} className="text-red-500 shrink-0" />
            <p className="text-sm text-red-700">
              {(analyze.error as Error)?.message || 'Failed to analyse performance. Try again.'}
            </p>
          </div>
        )}

        {result && !analyze.isPending && (
          <div className="space-y-4">
            {/* Team summary + top performer (multi-user view) */}
            {isAdmin && result.members.length > 1 && (
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl p-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wider mb-1">
                    Team Overview
                  </p>
                  <p className="text-sm text-gray-700 leading-relaxed">{result.teamSummary}</p>
                  <div className="flex items-center gap-4 mt-3">
                    {result.topPerformer && (
                      <div className="flex items-center gap-1.5">
                        <Star size={13} className="text-amber-400" fill="currentColor" />
                        <span className="text-xs text-gray-600">
                          Top: <span className="font-semibold text-gray-800">{result.topPerformer}</span>
                        </span>
                      </div>
                    )}
                    {result.teamMorale && (
                      <div className="flex items-center gap-1.5">
                        <Activity size={13} className={
                          result.teamMorale === 'High' ? 'text-emerald-500' :
                          result.teamMorale === 'Medium' ? 'text-amber-500' : 'text-red-500'
                        } />
                        <span className="text-xs text-gray-600">
                          Morale: <span className="font-semibold">{result.teamMorale}</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
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
                />
              ))}
            </div>

            {/* Footer */}
            <p className="text-[10px] text-gray-400 text-center pt-1">
              Analysis based on last {days} days · Powered by AI — use as guidance, not as sole evaluation
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
