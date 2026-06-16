import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Flag, TrendingUp } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import { useI18n } from '../contexts/I18nContext';
import { StatCard } from '../components/ui/Card';
import { RAGBadge, StatusBadge } from '../components/ui/Badge';
import { PageLoader } from '../components/ui/Spinner';
import { usePortfolioDashboard } from '../hooks/useDashboard';

const PortfolioDashboard = () => {
  const { t } = useI18n();
  const { data, isLoading } = usePortfolioDashboard();

  if (isLoading) return <Layout><PageLoader /></Layout>;

  // Backend returns: { summary, projectsByRAG, delayedMilestones, topBlockers }
  const summary = data?.summary || {};
  const projectsByRAG = data?.projectsByRAG || { RED: [], AMBER: [], GREEN: [] };
  const delayedMilestones: any[] = data?.delayedMilestones || [];
  const topBlockers: any[] = data?.topBlockers || [];

  return (
    <Layout>
      <Header title={t('nav.portfolio')} subtitle={`${summary.totalProjects ?? 0} ${t('statuses.active').toLowerCase()} ${t('nav.projects').toLowerCase()}`} />
      <div className="p-6 space-y-6">

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label={`${t('common.total')} ${t('nav.projects')}`} value={summary.totalProjects ?? 0} color="blue" />
          <StatCard label={t('statuses.atRisk')} value={(summary.amberProjects ?? 0) + (summary.redProjects ?? 0)}
            sublabel={`${summary.redProjects ?? 0} ${t('statuses.red').toLowerCase()} · ${summary.amberProjects ?? 0} ${t('statuses.amber').toLowerCase()}`} color="red" />
          <StatCard label={t('milestones.title')} value={summary.delayedMilestones ?? 0} color="amber" />
          <StatCard label={t('blockers.title')} value={summary.openBlockers ?? 0} color="red" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Projects by RAG */}
          <div className="lg:col-span-2 space-y-4">
            {(['RED', 'AMBER', 'GREEN'] as const).map((rag) => {
              const projects: any[] = projectsByRAG[rag] || [];
              if (projects.length === 0) return null;
              return (
                <div key={rag}>
                  <div className="flex items-center gap-2 mb-2">
                    <RAGBadge status={rag} />
                    <span className="text-xs text-gray-500">{projects.length} {t('nav.projects').toLowerCase()}</span>
                  </div>
                  <div className="space-y-2">
                    {projects.map((p) => (
                      <Link key={p.id} to={`/projects/${p.id}`}
                        className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 hover:shadow-sm hover:border-gray-300 transition-all">
                        <span className="text-sm font-medium text-gray-900">{p.name}</span>
                        <span className="text-xs text-gray-400">{t('milestones.dueOn', { date: p.endDate })}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
            {Object.values(projectsByRAG).every((arr: any) => arr.length === 0) && (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <TrendingUp size={36} className="mx-auto text-gray-200 mb-3" />
                <p className="text-sm text-gray-500">{t('dashboard.projects.noProjects')}</p>
              </div>
            )}
          </div>

          {/* Side panels */}
          <div className="space-y-4">
            {/* Delayed Milestones */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <Flag size={14} className="text-amber-500" />
                <h3 className="text-sm font-semibold text-gray-900">{t('milestones.title')}</h3>
              </div>
              {delayedMilestones.length === 0 ? (
                <p className="text-xs text-gray-400 p-4 text-center">{t('common.noData')}</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {delayedMilestones.slice(0, 8).map((m) => (
                    <div key={m.id} className="px-4 py-2.5">
                      <p className="text-sm text-gray-800 truncate">{m.title}</p>
                      <p className="text-xs text-red-500 mt-0.5">{t('milestones.dueOn', { date: m.dueDate })}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Blockers */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <AlertTriangle size={14} className="text-red-500" />
                <h3 className="text-sm font-semibold text-gray-900">{t('blockers.title')}</h3>
              </div>
              {topBlockers.length === 0 ? (
                <p className="text-xs text-gray-400 p-4 text-center">{t('common.noData')}</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {topBlockers.map((b) => (
                    <div key={b.id} className="px-4 py-2.5 flex items-start justify-between gap-2">
                      <p className="text-sm text-gray-800 truncate flex-1">{b.title}</p>
                      <StatusBadge status={b.severity} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default PortfolioDashboard;
