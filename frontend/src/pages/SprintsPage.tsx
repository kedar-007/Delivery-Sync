'use client';
import React, { useState, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  GitBranch, Plus, Play, CheckCircle2, Clock, Layers,
  ChevronRight, Search, Calendar, BarChart2, Users,
} from 'lucide-react';
import { format, isPast, parseISO } from 'date-fns';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import { PageSkeleton } from '../components/ui/Skeleton';
import Alert from '../components/ui/Alert';
import { useQueries } from '@tanstack/react-query';
import { useProjects } from '../hooks/useProjects';
import { useSprints } from '../hooks/useTaskSprint';
import { sprintsApi } from '../lib/api';

// ── Per-project sprint list ──────────────────────────────────────────────────

interface Sprint {
  id: string;
  name: string;
  status: 'PLANNING' | 'ACTIVE' | 'COMPLETED';
  startDate?: string;
  endDate?: string;
  capacityPoints?: number;
  completedPoints?: number;
}

interface Project {
  id: string;
  name: string;
  ragStatus?: string;
}

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  PLANNING:  { label: 'Planning',  color: 'bg-gray-100 text-gray-600 border border-gray-200' },
  ACTIVE:    { label: 'Active',    color: 'bg-green-100 text-green-700 border border-green-200' },
  COMPLETED: { label: 'Completed', color: 'bg-blue-100 text-blue-700 border border-blue-200' },
};

const RAG_DOT: Record<string, string> = {
  RED: 'bg-red-500', AMBER: 'bg-amber-400', GREEN: 'bg-green-500',
};

function safeDate(d?: string) {
  if (!d) return null;
  try { return parseISO(d); } catch { return null; }
}

function ProjectSprintCard({ project, tenantSlug }: { project: Project; tenantSlug: string }) {
  const { data: rawSprints, isLoading } = useSprints(project.id);
  const sprints: Sprint[] = useMemo(() => Array.isArray(rawSprints) ? rawSprints as Sprint[] : [], [rawSprints]);

  const active    = sprints.filter((s) => s.status === 'ACTIVE');
  const planning  = sprints.filter((s) => s.status === 'PLANNING');
  const completed = sprints.filter((s) => s.status === 'COMPLETED');

  if (isLoading) return (
    <Card className="p-4 animate-pulse">
      <div className="h-4 bg-gray-100 rounded w-1/3 mb-3" />
      <div className="h-3 bg-gray-100 rounded w-1/2" />
    </Card>
  );

  if (sprints.length === 0) return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        {project.ragStatus && (
          <span className={`w-2 h-2 rounded-full ${RAG_DOT[project.ragStatus] ?? 'bg-gray-400'}`} />
        )}
        <span className="font-medium text-sm text-gray-800">{project.name}</span>
      </div>
      <p className="text-xs text-gray-400">No sprints yet</p>
      <Link
        to={`/${tenantSlug}/projects/${project.id}/sprints`}
        className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 mt-2"
      >
        <Plus size={11} /> Create first sprint
      </Link>
    </Card>
  );

  return (
    <Card className="p-4 space-y-3">
      {/* Project header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {project.ragStatus && (
            <span className={`w-2 h-2 rounded-full ${RAG_DOT[project.ragStatus] ?? 'bg-gray-400'}`} />
          )}
          <span className="font-semibold text-sm text-gray-900">{project.name}</span>
        </div>
        <Link
          to={`/${tenantSlug}/projects/${project.id}/sprints`}
          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
        >
          Open Board <ChevronRight size={12} />
        </Link>
      </div>

      {/* Sprint rows */}
      <div className="space-y-2">
        {[...active, ...planning, ...completed.slice(0, 2)].map((sprint) => {
          const sd = safeDate(sprint.startDate);
          const ed = safeDate(sprint.endDate);
          const isOverdue = ed && sprint.status !== 'COMPLETED' && isPast(ed);
          const pct = sprint.capacityPoints && sprint.completedPoints != null
            ? Math.min(100, Math.round(((sprint.completedPoints ?? 0) / sprint.capacityPoints) * 100))
            : null;

          return (
            <Link
              key={sprint.id}
              to={`/${tenantSlug}/projects/${project.id}/sprints`}
              className="block p-2.5 rounded-lg border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors group"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_STYLE[sprint.status]?.color ?? ''}`}>
                    {STATUS_STYLE[sprint.status]?.label}
                  </span>
                  <span className="text-sm font-medium text-gray-800 truncate group-hover:text-indigo-700">
                    {sprint.name}
                  </span>
                </div>
                <ChevronRight size={12} className="text-gray-300 group-hover:text-indigo-400 shrink-0" />
              </div>

              {(sd || ed) && (
                <div className="flex items-center gap-1 mt-1 text-[11px] text-gray-400">
                  <Calendar size={10} />
                  {sd ? format(sd, 'MMM d') : '?'}
                  {' – '}
                  <span className={isOverdue ? 'text-red-500 font-medium' : ''}>
                    {ed ? format(ed, 'MMM d, yyyy') : '?'}
                    {isOverdue && ' ⚠ overdue'}
                  </span>
                </div>
              )}

              {pct !== null && (
                <div className="mt-1.5">
                  <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
                    <span>{sprint.completedPoints ?? 0} / {sprint.capacityPoints} pts</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-400 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* Summary row */}
      <div className="flex gap-4 text-xs text-gray-400 pt-1 border-t border-gray-50">
        {active.length > 0 && (
          <span className="flex items-center gap-1"><Play size={10} className="text-green-500" /> {active.length} active</span>
        )}
        {planning.length > 0 && (
          <span className="flex items-center gap-1"><Clock size={10} /> {planning.length} planning</span>
        )}
        {completed.length > 0 && (
          <span className="flex items-center gap-1"><CheckCircle2 size={10} className="text-blue-400" /> {completed.length} completed</span>
        )}
      </div>
    </Card>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatsBar({ projects }: { projects: Project[] }) {
  const sprintQueries = useQueries({
    queries: projects.map((p) => ({
      queryKey: ['sprints', p.id],
      queryFn: () => sprintsApi.list(p.id),
      enabled: !!p.id,
      staleTime: 60_000,
    })),
  });

  const { activeSprints, totalTasks, teamMembers } = useMemo(() => {
    let activeSprints = 0;
    let totalTasks = 0;
    const memberSet = new Set<string>();

    sprintQueries.forEach((q) => {
      if (!q.data) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = (q.data as any)?.data ?? q.data;
      const list: Sprint[] = Array.isArray(raw) ? raw : [];
      list.forEach((s) => {
        if (s.status === 'ACTIVE') activeSprints++;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tasks = (s as any).tasks;
        if (Array.isArray(tasks)) {
          totalTasks += tasks.length;
          tasks.forEach((t: any) => {
            if (t.assignee_id || t.assigneeId) memberSet.add(String(t.assignee_id ?? t.assigneeId));
            if (Array.isArray(t.assigneeIds)) t.assigneeIds.forEach((id: string) => memberSet.add(id));
          });
        }
      });
    });

    return { activeSprints, totalTasks, teamMembers: memberSet.size };
  }, [sprintQueries]);

  const loading = sprintQueries.some((q) => q.isLoading);

  const stats = [
    { label: 'Projects',      value: projects.length, icon: <Layers size={16} className="text-indigo-500" /> },
    { label: 'Active Sprints', value: loading ? '…' : activeSprints, icon: <Play size={16} className="text-green-500" /> },
    { label: 'Total Tasks',    value: loading ? '…' : (totalTasks || '–'), icon: <BarChart2 size={16} className="text-amber-500" /> },
    { label: 'Team Members',   value: loading ? '…' : (teamMembers || '–'), icon: <Users size={16} className="text-blue-500" /> },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map((s) => (
        <div key={s.label} className="bg-white border border-gray-100 rounded-xl p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">{s.icon}</div>
          <div>
            <p className="text-lg font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SprintsPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [search, setSearch] = useState('');
  const { data: rawProjects = [], isLoading, error } = useProjects();

  const projects: Project[] = useMemo(
    () => (Array.isArray(rawProjects) ? rawProjects : []) as Project[],
    [rawProjects],
  );

  const filtered = useMemo(
    () => projects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())),
    [projects, search],
  );

  if (isLoading) return <Layout><PageSkeleton /></Layout>;

  return (
    <Layout>
      <Header
        title="Sprint Boards"
        subtitle={`${projects.length} project${projects.length !== 1 ? 's' : ''} · Click any sprint to open its board`}
        actions={
          <Link to={`/${tenantSlug}/projects`}>
            <Button variant="secondary" size="sm" icon={<Layers size={14} />}>All Projects</Button>
          </Link>
        }
      />

      <div className="p-6 space-y-5">
        {error && <Alert type="error" message={(error as Error).message} />}

        <StatsBar projects={projects} />

        {/* Search */}
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none bg-white"
            placeholder="Filter projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="No projects found"
            description="Create a project first to start managing sprints."
            icon={<GitBranch size={32} className="text-gray-300" />}
            action={
              <Link to={`/${tenantSlug}/projects`}>
                <Button variant="primary" size="sm" icon={<Plus size={14} />}>Create Project</Button>
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((p) => (
              <ProjectSprintCard key={p.id} project={p} tenantSlug={tenantSlug!} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
