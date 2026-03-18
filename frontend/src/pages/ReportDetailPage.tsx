import React, { useCallback, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Link as LinkIcon, CheckCheck, Download,
  TrendingUp, AlertTriangle, CheckSquare, Milestone,
  Users, BarChart2, FileText, Clock, Calendar,
} from 'lucide-react';
import { useReport } from '../hooks/useReports';
import { RAGBadge, StatusBadge } from '../components/ui/Badge';
import { PageLoader } from '../components/ui/Spinner';
import { ReportSummary } from '../types';

// ── Stat card ─────────────────────────────────────────────────────────────────
const Stat = ({ label, value, sub, color = 'blue' }: {
  label: string; value: string | number; sub?: string; color?: string;
}) => {
  const colors: Record<string, string> = {
    blue: 'text-blue-600', green: 'text-green-600',
    red: 'text-red-600', amber: 'text-amber-600', purple: 'text-purple-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-1">
      <p className={`text-3xl font-bold ${colors[color] ?? colors.blue}`}>{value}</p>
      <p className="text-sm font-medium text-gray-700">{label}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
};

// ── Section header ────────────────────────────────────────────────────────────
const Section = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
    <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50/60">
      <span className="text-gray-500">{icon}</span>
      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">{title}</h3>
    </div>
    <div className="p-6">{children}</div>
  </div>
);

// ── Progress ring ─────────────────────────────────────────────────────────────
const Ring = ({ pct, color }: { pct: number; color: string }) => {
  const r = 36, c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <svg width="96" height="96" viewBox="0 0 96 96">
      <circle cx="48" cy="48" r={r} fill="none" stroke="#f3f4f6" strokeWidth="8" />
      <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
        transform="rotate(-90 48 48)" />
      <text x="48" y="53" textAnchor="middle" fontSize="16" fontWeight="bold" fill={color}>{pct}%</text>
    </svg>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
const ReportDetailPage = () => {
  const { reportId, tenantSlug } = useParams<{ reportId: string; tenantSlug: string }>();
  const { data: report, isLoading } = useReport(reportId ?? '');
  const [copied, setCopied] = useState(false);

  const copyLink = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}#/${tenantSlug}/reports/${reportId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [tenantSlug, reportId]);

  if (isLoading || !reportId) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center"><PageLoader /></div>
  );

  if (!report) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
      <FileText size={48} className="text-gray-300" />
      <p className="text-gray-500 text-sm">Report not found or you don't have access.</p>
      <Link to={`/${tenantSlug}/reports`} className="text-blue-600 text-sm hover:underline flex items-center gap-1">
        <ArrowLeft size={14} /> Back to Reports
      </Link>
    </div>
  );

  const s: ReportSummary = report.summary ?? {} as ReportSummary;
  const ragColor = s.ragStatus === 'RED' ? '#ef4444' : s.ragStatus === 'AMBER' ? '#f59e0b' : '#22c55e';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-4">
          <Link to={`/${tenantSlug}/reports`}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            <ArrowLeft size={16} /> Reports
          </Link>
          <div className="h-4 w-px bg-gray-200" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{s.projectName ?? 'Report'}</p>
            <p className="text-xs text-gray-400">{report.reportType} · {report.periodStart} → {report.periodEnd}</p>
          </div>
          {s.ragStatus && <RAGBadge status={s.ragStatus} />}
          <button onClick={copyLink}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600 shrink-0">
            {copied ? <><CheckCheck size={13} className="text-green-600" /> Copied!</> : <><LinkIcon size={13} /> Share link</>}
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* Hero header */}
        <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-violet-950 rounded-3xl p-8 text-white relative overflow-hidden">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-blue-500/10 blur-3xl" />
            <div className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full bg-violet-500/10 blur-3xl" />
          </div>
          <div className="relative flex flex-col sm:flex-row items-start justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-medium mb-4">
                <Calendar size={12} /> {report.reportType} Report
              </div>
              <h1 className="text-3xl font-bold mb-2">{s.projectName ?? 'Delivery Report'}</h1>
              <p className="text-blue-200/70 text-sm flex items-center gap-2">
                <Clock size={14} />
                Period: {s.period?.start ?? report.periodStart} — {s.period?.end ?? report.periodEnd}
              </p>
            </div>
            <div className="flex items-center gap-6 shrink-0">
              <div className="text-center">
                <Ring pct={s.actions?.completionRate ?? 0} color="#60a5fa" />
                <p className="text-xs text-blue-300/70 mt-1">Action<br />completion</p>
              </div>
              <div className="text-center">
                <Ring pct={s.eods?.avgProgressPercentage ?? 0} color="#a78bfa" />
                <p className="text-xs text-blue-300/70 mt-1">Avg<br />progress</p>
              </div>
            </div>
          </div>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <Stat label="Standups" value={s.standups?.total ?? 0}
            sub={`${s.standups?.submissionRate ?? '0%'} rate`} color="blue" />
          <Stat label="Contributors" value={s.standups?.uniqueContributors ?? 0}
            sub="Unique members" color="purple" />
          <Stat label="EOD Reports" value={s.eods?.total ?? 0}
            sub={`${s.eods?.avgProgressPercentage ?? 0}% avg progress`} color="purple" />
          <Stat label="Actions" value={`${s.actions?.completed ?? 0}/${s.actions?.total ?? 0}`}
            sub={`${s.actions?.overdue ?? 0} overdue`}
            color={(s.actions?.overdue ?? 0) > 0 ? 'red' : 'green'} />
          <Stat label="Open Blockers" value={s.blockers?.open ?? 0}
            sub={`${s.blockers?.critical ?? 0} critical`}
            color={(s.blockers?.critical ?? 0) > 0 ? 'red' : 'amber'} />
          <Stat label="Milestones" value={`${s.milestones?.completed ?? 0}/${s.milestones?.total ?? 0}`}
            sub={`${s.milestones?.delayed ?? 0} delayed`}
            color={(s.milestones?.delayed ?? 0) > 0 ? 'red' : 'green'} />
        </div>

        {/* Two column detail sections */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Actions breakdown */}
          <Section icon={<CheckSquare size={16} />} title="Actions">
            <div className="space-y-3">
              {[
                { label: 'Total', value: s.actions?.total ?? 0, color: 'text-gray-900' },
                { label: 'Completed', value: s.actions?.completed ?? 0, color: 'text-green-600' },
                { label: 'Open', value: s.actions?.open ?? 0, color: 'text-blue-600' },
                { label: 'Overdue', value: s.actions?.overdue ?? 0, color: 'text-red-600' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{label}</span>
                  <span className={`text-sm font-semibold ${color}`}>{value}</span>
                </div>
              ))}
              <div className="pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">Completion rate</span>
                  <span className="text-xs font-semibold text-gray-700">{s.actions?.completionRate ?? 0}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: `${s.actions?.completionRate ?? 0}%` }} />
                </div>
              </div>
            </div>
            {(s.overdueActionsPreview?.length ?? 0) > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">Overdue Actions</p>
                {s.overdueActionsPreview!.map((a, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-gray-700 truncate pr-2">{a.title}</span>
                    <span className="text-xs text-red-500 shrink-0">{a.dueDate}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Blockers breakdown */}
          <Section icon={<AlertTriangle size={16} />} title="Blockers">
            <div className="space-y-3">
              {[
                { label: 'Total', value: s.blockers?.total ?? 0, color: 'text-gray-900' },
                { label: 'Open', value: s.blockers?.open ?? 0, color: 'text-amber-600' },
                { label: 'Resolved', value: s.blockers?.resolved ?? 0, color: 'text-green-600' },
                { label: 'Critical', value: s.blockers?.critical ?? 0, color: 'text-red-600' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{label}</span>
                  <span className={`text-sm font-semibold ${color}`}>{value}</span>
                </div>
              ))}
            </div>
            {(s.keyBlockers?.length ?? 0) > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">Key Blockers</p>
                {s.keyBlockers!.map((b, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-gray-700 truncate pr-2">{b.title}</span>
                    <StatusBadge status={b.severity} />
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Milestones */}
          <Section icon={<Milestone size={16} />} title="Milestones">
            <div className="space-y-3">
              {[
                { label: 'Total', value: s.milestones?.total ?? 0, color: 'text-gray-900' },
                { label: 'Completed', value: s.milestones?.completed ?? 0, color: 'text-green-600' },
                { label: 'Delayed', value: s.milestones?.delayed ?? 0, color: 'text-red-600' },
                { label: 'Upcoming', value: s.milestones?.upcoming ?? 0, color: 'text-blue-600' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{label}</span>
                  <span className={`text-sm font-semibold ${color}`}>{value}</span>
                </div>
              ))}
            </div>
            {(s.upcomingMilestones?.length ?? 0) > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">Upcoming</p>
                {s.upcomingMilestones!.map((m, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-gray-700 truncate pr-2">{m.title}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-gray-400">{m.dueDate}</span>
                      <StatusBadge status={m.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Team engagement */}
          <Section icon={<Users size={16} />} title="Team Engagement">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Standup submissions</span>
                <span className="text-sm font-semibold text-gray-900">{s.standups?.total ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Unique contributors</span>
                <span className="text-sm font-semibold text-gray-900">{s.standups?.uniqueContributors ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">EOD reports</span>
                <span className="text-sm font-semibold text-gray-900">{s.eods?.total ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Decisions logged</span>
                <span className="text-sm font-semibold text-gray-900">{s.decisionsCount ?? 0}</span>
              </div>
              <div className="pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">Submission rate</span>
                  <span className="text-xs font-semibold text-gray-700">{s.standups?.submissionRate ?? '0%'}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: s.standups?.submissionRate ?? '0%' }} />
                </div>
              </div>
            </div>
          </Section>
        </div>

        {/* Footer */}
        <div className="text-center pb-8">
          <p className="text-xs text-gray-400">
            Generated by Delivery Sync · {report.reportType} Report · {report.periodStart} to {report.periodEnd}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ReportDetailPage;
