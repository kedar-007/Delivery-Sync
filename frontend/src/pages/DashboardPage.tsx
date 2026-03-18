import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckSquare, Clock, TrendingDown, FolderKanban } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import { StatCard } from '../components/ui/Card';
import { RAGBadge, StatusBadge } from '../components/ui/Badge';
import { PageLoader } from '../components/ui/Spinner';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import { useDashboardSummary } from '../hooks/useDashboard';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';

const DashboardPage = () => {
  const { user } = useAuth();
  const { data, isLoading, error } = useDashboardSummary();

  if (isLoading) return <Layout><PageLoader /></Layout>;
  if (error) return <Layout><Alert type="error" message={(error as Error).message} className="m-6" /></Layout>;

  const summary = data;
  const today = format(new Date(), 'EEEE, d MMMM yyyy');

  return (
    <Layout>
      <Header
        title={`Good day, ${user?.name?.split(' ')[0] ?? 'there'}`}
        subtitle={today}
      />
      <div className="p-6 space-y-6">

        {/* Missing Alerts */}
        {summary?.stats?.missingStandupsCount > 0 && (
          <Alert
            type="warning"
            message={`You have ${summary.stats.missingStandupsCount} project(s) missing today's standup. ${summary.missingStandups.map((p: {name: string}) => p.name).join(', ')}`}
          />
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label="My Projects" value={summary?.stats?.totalProjects ?? 0} icon={<FolderKanban size={20} />} color="blue" />
          <StatCard label="Overdue Actions" value={summary?.stats?.overdueActionsCount ?? 0} icon={<CheckSquare size={20} />} color="red" />
          <StatCard label="Critical Blockers" value={summary?.stats?.criticalBlockersCount ?? 0} icon={<AlertTriangle size={20} />} color="red" />
          <StatCard label="Missing Standups" value={summary?.stats?.missingStandupsCount ?? 0} icon={<Clock size={20} />} color="amber" />
          <StatCard label="Missing EOD" value={summary?.stats?.missingEodCount ?? 0} icon={<TrendingDown size={20} />} color="amber" />
        </div>

        {/* Projects RAG + Overdue Actions + Critical Blockers */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Projects */}
          <div className="lg:col-span-1 bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="p-5 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">My Projects</h3>
              <div className="flex gap-3 mt-2">
                <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                  {summary?.ragSummary?.RED ?? 0} Red
                </span>
                <span className="text-xs font-medium text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-full">
                  {summary?.ragSummary?.AMBER ?? 0} Amber
                </span>
                <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                  {summary?.ragSummary?.GREEN ?? 0} Green
                </span>
              </div>
            </div>
            <div className="divide-y divide-gray-50">
              {summary?.projects?.length === 0
                ? <EmptyState title="No projects" description="You're not a member of any active project." />
                : summary?.projects?.slice(0, 8).map((p: {id: string; name: string; ragStatus: string; endDate: string}) => (
                  <Link key={p.id} to={`/projects/${p.id}`}
                    className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                    <span className="text-sm text-gray-800 font-medium truncate pr-2">{p.name}</span>
                    <RAGBadge status={p.ragStatus} />
                  </Link>
                ))
              }
            </div>
          </div>

          {/* Overdue Actions */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Overdue Actions</h3>
              <Link to="/actions" className="text-xs text-blue-600 hover:underline">View all</Link>
            </div>
            <div className="divide-y divide-gray-50">
              {summary?.overdueActions?.length === 0
                ? <EmptyState title="All clear!" description="No overdue actions." />
                : summary?.overdueActions?.slice(0, 6).map((a: {id: string; title: string; dueDate: string; priority: string}) => (
                  <div key={a.id} className="px-5 py-3">
                    <p className="text-sm text-gray-800 font-medium truncate">{a.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusBadge status={a.priority} />
                      <span className="text-xs text-red-500">Due {a.dueDate}</span>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>

          {/* Critical Blockers */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Critical Blockers</h3>
              <Link to="/blockers" className="text-xs text-blue-600 hover:underline">View all</Link>
            </div>
            <div className="divide-y divide-gray-50">
              {summary?.criticalBlockers?.length === 0
                ? <EmptyState title="No blockers" description="No critical blockers at the moment." />
                : summary?.criticalBlockers?.slice(0, 6).map((b: {id: string; title: string; severity: string; status: string}) => (
                  <div key={b.id} className="px-5 py-3">
                    <p className="text-sm text-gray-800 font-medium truncate">{b.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusBadge status={b.severity} />
                      <StatusBadge status={b.status} />
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="flex flex-wrap gap-3">
            <Link to="/standup" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors">
              <Clock size={16} /> Submit Standup
            </Link>
            <Link to="/eod" className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg text-sm font-medium hover:bg-green-100 transition-colors">
              <CheckSquare size={16} /> Submit EOD
            </Link>
            <Link to="/actions" className="inline-flex items-center gap-2 px-4 py-2 bg-orange-50 text-orange-700 rounded-lg text-sm font-medium hover:bg-orange-100 transition-colors">
              <CheckSquare size={16} /> My Actions
            </Link>
            <Link to="/blockers" className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors">
              <AlertTriangle size={16} /> Raise Blocker
            </Link>
          </div>
        </div>

      </div>
    </Layout>
  );
};

export default DashboardPage;
