/**
 * SprintAnalysisModal — AI-powered sprint analysis.
 *
 * Shows a star rating, velocity/completion metrics, team highlights,
 * risks, insights, and recommendations for a sprint.
 */
import {
  Star, Sparkles, TrendingUp, AlertCircle,
  CheckCircle2, Zap, Users, BarChart3,
} from 'lucide-react';
import Modal from './Modal';

// ── Types ──────────────────────────────────────────────────────────────────────

interface MemberHighlight {
  name: string;
  contribution: string;
  tasksCompleted?: number;
  mood?: string;
}

interface SprintAnalysisResult {
  starRating: number;
  score: number;
  sprintSummary: string;
  completionRate: number;
  velocityScore: number;
  sprintHealth: string;
  insights: string;
  risks: string[];
  recommendations: string[];
  memberHighlights: MemberHighlight[];
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={22}
          className={n <= rating ? 'text-amber-400' : 'text-gray-200'}
          fill={n <= rating ? 'currentColor' : 'none'}
        />
      ))}
    </div>
  );
}

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

function LoadingState() {
  const modules = ['Tasks', 'Velocity', 'Stand-ups', 'EODs', 'Blockers', 'Team Mood'];
  return (
    <div className="py-12 flex flex-col items-center gap-6">
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-4 border-indigo-100 border-t-indigo-500 animate-spin" />
        <Sparkles size={20} className="absolute inset-0 m-auto text-indigo-400" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-gray-700">Analysing sprint data…</p>
        <p className="text-xs text-gray-400">AI is reviewing performance across all sprint activities</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {modules.map((m) => (
          <span
            key={m}
            className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 animate-pulse"
            style={{ animationDelay: `${modules.indexOf(m) * 150}ms` }}
          >
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export interface SprintAnalysisModalProps {
  open: boolean;
  onClose: () => void;
  sprintId: string;
  title?: string;
  isPending: boolean;
  isRetrying?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  error?: Error | null;
  onRetry: () => void;
}

export default function SprintAnalysisModal({
  open, onClose, title = 'Sprint Analysis',
  isPending, data, error, onRetry,
}: SprintAnalysisModalProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (data as any)?.data ?? data;
  const result: SprintAnalysisResult | null = raw ?? null;

  const healthColor =
    result?.sprintHealth === 'Healthy' ? 'text-emerald-600 bg-emerald-50' :
    result?.sprintHealth === 'At Risk'  ? 'text-amber-600 bg-amber-50' :
    result?.sprintHealth === 'Critical' ? 'text-red-600 bg-red-50' :
    'text-gray-600 bg-gray-50';

  return (
    <Modal open={open} onClose={onClose} title={title} size="xl">
      {isPending ? (
        <LoadingState />
      ) : error ? (
        <div className="py-8 text-center space-y-2">
          <AlertCircle size={32} className="text-red-400 mx-auto" />
          <p className="text-sm text-gray-600">Failed to analyse sprint. Please try again.</p>
          <button
            onClick={onRetry}
            className="text-xs text-blue-600 hover:underline"
          >
            Retry
          </button>
        </div>
      ) : result ? (
        <div className="space-y-5">
          {/* Score header */}
          <div className="flex items-start gap-5 p-4 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-2xl">
            <ScoreRing score={result.score} />
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <StarRating rating={result.starRating} />
                {result.sprintHealth && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${healthColor}`}>
                    {result.sprintHealth}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">{result.sprintSummary}</p>
            </div>
          </div>

          {/* Metrics row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-gray-100 rounded-xl p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 size={16} className="text-emerald-500" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">{result.completionRate}%</p>
                <p className="text-xs text-gray-500">Completion Rate</p>
              </div>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <Zap size={16} className="text-blue-500" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">{result.velocityScore}</p>
                <p className="text-xs text-gray-500">Velocity Score</p>
              </div>
            </div>
          </div>

          {/* Insights */}
          {result.insights && (
            <div className="bg-blue-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <TrendingUp size={14} className="text-blue-600" />
                <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Insights</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">{result.insights}</p>
            </div>
          )}

          {/* Risks */}
          {result.risks?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <AlertCircle size={12} className="text-red-400" /> Risks
              </h4>
              <ul className="space-y-1.5">
                {result.risks.map((r, i) => (
                  <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                    <span className="text-red-400 mt-0.5 shrink-0">•</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          {result.recommendations?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <BarChart3 size={12} className="text-indigo-400" /> Recommendations
              </h4>
              <ul className="space-y-1.5">
                {result.recommendations.map((r, i) => (
                  <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                    <span className="text-indigo-400 mt-0.5 shrink-0">→</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Member Highlights */}
          {result.memberHighlights?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Users size={12} className="text-gray-400" /> Team Highlights
              </h4>
              <div className="space-y-2">
                {result.memberHighlights.map((m, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600 shrink-0">
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{m.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{m.contribution}</p>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                        {m.tasksCompleted != null && (
                          <span className="flex items-center gap-1">
                            <CheckCircle2 size={10} className="text-emerald-400" />
                            {m.tasksCompleted} tasks done
                          </span>
                        )}
                        {m.mood && <span>Mood: {m.mood}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
