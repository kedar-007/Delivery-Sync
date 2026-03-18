import React from 'react';
import { Sparkles, X, TrendingUp, AlertTriangle, Lightbulb, Star } from 'lucide-react';
import type { VoiceInsights } from '../../hooks/useVoiceAI';

interface VoiceAiInsightsProps {
  summary: string;
  insights: VoiceInsights;
  onDismiss: () => void;
}

const SENTIMENT_CONFIG = {
  positive: { label: 'Positive', className: 'bg-green-100 text-green-700' },
  neutral:  { label: 'Neutral',  className: 'bg-gray-100 text-gray-600' },
  negative: { label: 'Negative', className: 'bg-red-100 text-red-700' },
};

const scoreColor = (score: number) => {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-blue-500';
  if (score >= 40) return 'bg-yellow-500';
  return 'bg-red-500';
};

const VoiceAiInsights: React.FC<VoiceAiInsightsProps> = ({ summary, insights, onDismiss }) => {
  const {
    keyHighlights = [],
    risks = [],
    sentiment = 'neutral',
    productivityScore = 50,
    suggestions = [],
  } = insights;

  const sentimentCfg = SENTIMENT_CONFIG[sentiment as keyof typeof SENTIMENT_CONFIG] ?? SENTIMENT_CONFIG.neutral;

  return (
    <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-blue-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-violet-100">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-violet-600" />
          <span className="text-sm font-semibold text-violet-800">AI Insights</span>
          <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
            AI Generated
          </span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white/60 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Summary */}
        {summary && (
          <p className="text-sm text-gray-700 leading-relaxed">{summary}</p>
        )}

        {/* Score + Sentiment row */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500 font-medium flex items-center gap-1">
                <TrendingUp size={11} /> Productivity
              </span>
              <span className="text-xs font-semibold text-gray-700">{productivityScore}%</span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${scoreColor(productivityScore)}`}
                style={{ width: `${productivityScore}%` }}
              />
            </div>
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${sentimentCfg.className}`}>
            {sentimentCfg.label}
          </span>
        </div>

        {/* Key Highlights */}
        {keyHighlights.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <Star size={11} /> Highlights
            </p>
            <ul className="space-y-1">
              {keyHighlights.map((h, i) => (
                <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                  {h}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Risks */}
        {risks.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <AlertTriangle size={11} /> Risks / Blockers Detected
            </p>
            <ul className="space-y-1">
              {risks.map((r, i) => (
                <li key={i} className="text-sm text-amber-800 flex items-start gap-2 bg-amber-50 rounded-lg px-2.5 py-1.5">
                  <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <Lightbulb size={11} /> Suggestions
            </p>
            <ul className="space-y-1">
              {suggestions.map((s, i) => (
                <li key={i} className="text-sm text-blue-800 flex items-start gap-2">
                  <Lightbulb size={13} className="text-blue-400 mt-0.5 shrink-0" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-gray-400 pt-1">
          Fields above have been auto-filled from your voice recording. You can edit them before submitting.
        </p>
      </div>
    </div>
  );
};

export default VoiceAiInsights;
