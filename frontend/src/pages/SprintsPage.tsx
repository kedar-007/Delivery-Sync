'use client';
import React, { FormEvent, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  GitBranch, Plus, Play, CheckCircle2, Clock, Layers,
  ChevronRight, Search, Calendar, BarChart2, ClipboardCheck,
} from 'lucide-react';
import { addDays, format, isPast, parseISO } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import { PageSkeleton } from '../components/ui/Skeleton';
import Alert from '../components/ui/Alert';
import Modal, { ModalActions } from '../components/ui/Modal';
import { useProjects } from '../hooks/useProjects';
import { useCreateSprint } from '../hooks/useTaskSprint';
import { sprintsApi } from '../lib/api';

interface Sprint {
  id: string;
  projectId: string;
  name: string;
  status: 'PLANNING' | 'ACTIVE' | 'COMPLETED';
  startDate?: string;
  endDate?: string;
  capacityPoints?: number;
  completedPoints?: number;
  taskCount?: number;
  completedCount?: number;
}

interface Project {
  id: string;
  name: string;
  ragStatus?: string;
}

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  PLANNING: { label: 'Planning', color: 'bg-gray-100 text-gray-600 border border-gray-200' },
  ACTIVE: { label: 'Active', color: 'bg-green-100 text-green-700 border border-green-200' },
  COMPLETED: { label: 'Completed', color: 'bg-blue-100 text-blue-700 border border-blue-200' },
};

const RAG_DOT: Record<string, string> = {
  RED: 'bg-red-500', AMBER: 'bg-amber-400', GREEN: 'bg-green-500',
};

function safeDate(d?: string) {
  if (!d) return null;
  try { return parseISO(d); } catch { return null; }
}

function normalizeSprint(raw: unknown): Sprint {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = raw as any;
  const statusRaw = String(r.status ?? 'PLANNING').toUpperCase();
  const status = (['PLANNING', 'ACTIVE', 'COMPLETED'].includes(statusRaw)
    ? statusRaw
    : 'PLANNING') as Sprint['status'];
  const toNum = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  return {
    id: String(r.ROWID ?? r.id ?? ''),
    projectId: String(r.project_id ?? r.projectId ?? ''),
    name: String(r.name ?? ''),
    status,
    startDate: r.start_date ?? r.startDate ?? undefined,
    endDate: r.end_date ?? r.endDate ?? undefined,
    capacityPoints: toNum(r.capacity_points ?? r.capacityPoints),
    completedPoints: toNum(r.completed_points ?? r.completedPoints),
    taskCount: toNum(r.task_count ?? r.taskCount),
    completedCount: toNum(r.completed_count ?? r.completedCount),
  };
}

function ProjectSprintCard({
  project,
  tenantSlug,
  sprints,
}: {
  project: Project;
  tenantSlug: string;
  sprints: Sprint[];
}) {
  const active = sprints.filter((s) => s.status === 'ACTIVE');
  const planning = sprints.filter((s) => s.status === 'PLANNING');
  const completed = sprints.filter((s) => s.status === 'COMPLETED');

  const ordered = [...active, ...planning, ...completed.slice(0, 2)];

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {project.ragStatus && (
            <span className={`w-2 h-2 rounded-full ${RAG_DOT[project.ragStatus] ?? 'bg-gray-400'}`} />
          )}
          <span className="font-semibold text-sm text-gray-900 truncate">{project.name}</span>
        </div>
        <Link
          to={`/${tenantSlug}/projects/${project.id}/sprints`}
          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium shrink-0"
        >
          Open Board <ChevronRight size={12} />
        </Link>
      </div>

      <div className="space-y-2">
        {ordered.map((sprint) => {
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
                  {' - '}
                  <span className={isOverdue ? 'text-red-500 font-medium' : ''}>
                    {ed ? format(ed, 'MMM d, yyyy') : '?'}
                    {isOverdue && ' overdue'}
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

function StatsBar({
  projectCount,
  activeSprints,
  totalTasks,
  completedTasks,
}: {
  projectCount: number;
  activeSprints: number;
  totalTasks: number;
  completedTasks: number;
}) {
  const stats = [
    { label: 'Projects', value: projectCount, icon: <Layers size={16} className="text-indigo-500" /> },
    { label: 'Active Sprints', value: activeSprints, icon: <Play size={16} className="text-green-500" /> },
    { label: 'Total Tasks', value: totalTasks, icon: <BarChart2 size={16} className="text-amber-500" /> },
    { label: 'Completed Tasks', value: completedTasks, icon: <ClipboardCheck size={16} className="text-blue-500" /> },
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

export default function SprintsPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(addDays(new Date(), 14), 'yyyy-MM-dd'));
  const [capacityPoints, setCapacityPoints] = useState('0');
  const [createError, setCreateError] = useState('');

  const { data: rawProjects = [], isLoading: projectsLoading, error: projectsError } = useProjects();
  const createSprint = useCreateSprint();
  const {
    data: allSprints = [],
    isLoading: sprintsLoading,
    error: sprintsError,
  } = useQuery({
    queryKey: ['sprints', 'all'],
    queryFn: async () => {
      const response = await sprintsApi.listAll();
      const rows: unknown[] = Array.isArray(response)
        ? response
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : (((response as any)?.data as unknown[]) ?? []);
      return rows.map(normalizeSprint).filter((s) => s.id && s.projectId);
    },
    staleTime: 30_000,
    retry: 1,
  });

  const projects: Project[] = useMemo(
    () => (Array.isArray(rawProjects) ? rawProjects : []) as Project[],
    [rawProjects],
  );

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name)),
    [projects],
  );

  const projectById = useMemo(() => {
    const map = new Map<string, Project>();
    projects.forEach((p) => map.set(String(p.id), p));
    return map;
  }, [projects]);

  const validSprints = useMemo(
    () => allSprints.filter((s) => projectById.has(s.projectId)),
    [allSprints, projectById],
  );

  const sprintsByProject = useMemo(() => {
    const map = new Map<string, Sprint[]>();
    validSprints.forEach((s) => {
      const key = String(s.projectId);
      const existing = map.get(key);
      if (existing) existing.push(s);
      else map.set(key, [s]);
    });
    return map;
  }, [validSprints]);

  const projectsWithSprints = useMemo(
    () => sortedProjects.filter((p) => sprintsByProject.has(String(p.id))),
    [sortedProjects, sprintsByProject],
  );

  const filteredProjects = useMemo(
    () => projectsWithSprints.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())),
    [projectsWithSprints, search],
  );

  const createProjectOptions = useMemo(
    () =>
      sortedProjects
        .filter((p) => p.name.toLowerCase().includes(projectSearch.toLowerCase()))
        .slice(0, 40),
    [sortedProjects, projectSearch],
  );

  const kpis = useMemo(() => {
    const activeSprints = validSprints.filter((s) => s.status === 'ACTIVE').length;
    const totalTasks = validSprints.reduce((sum, s) => sum + (s.taskCount ?? 0), 0);
    const completedTasks = validSprints.reduce((sum, s) => sum + (s.completedCount ?? 0), 0);
    return {
      projectCount: projects.length,
      activeSprints,
      totalTasks,
      completedTasks,
    };
  }, [validSprints, projects.length]);

  const openCreate = () => {
    setCreateError('');
    setShowCreate(true);
  };

  const closeCreate = () => {
    if (createSprint.isPending) return;
    setShowCreate(false);
    setCreateError('');
  };

  const handleCreateSprint = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCreateError('');

    if (!selectedProjectId) {
      setCreateError('Please select a project');
      return;
    }
    if (!name.trim()) {
      setCreateError('Sprint name is required');
      return;
    }
    if (!startDate || !endDate) {
      setCreateError('Start date and end date are required');
      return;
    }

    try {
      await createSprint.mutateAsync({
        project_id: selectedProjectId,
        name: name.trim(),
        goal: goal.trim(),
        start_date: startDate,
        end_date: endDate,
        capacity_points: Number(capacityPoints) || 0,
      });
      setShowCreate(false);
      setProjectSearch('');
      setSelectedProjectId('');
      setName('');
      setGoal('');
      setStartDate(format(new Date(), 'yyyy-MM-dd'));
      setEndDate(format(addDays(new Date(), 14), 'yyyy-MM-dd'));
      setCapacityPoints('0');
      setSearch('');
    } catch (err) {
      setCreateError((err as Error).message);
    }
  };

  if (projectsLoading || sprintsLoading) return <Layout><PageSkeleton /></Layout>;
  if (sprintsError) return (
    <Layout>
      <Alert type="error" message={`Failed to load sprints: ${(sprintsError as Error).message}`} />
    </Layout>
  );

  return (
    <Layout>
      <Header
        title="Sprint Boards"
        subtitle={`${projectsWithSprints.length} project${projectsWithSprints.length !== 1 ? 's' : ''} with sprint boards`}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" icon={<Plus size={14} />} onClick={openCreate}>
              Create Sprint
            </Button>
            <Link to={`/${tenantSlug}/projects`}>
              <Button variant="secondary" size="sm" icon={<Layers size={14} />}>All Projects</Button>
            </Link>
          </div>
        }
      />

      <div className="p-6 space-y-5">
        {projectsError && <Alert type="error" message={(projectsError as Error).message} />}
        {sprintsError && <Alert type="error" message={(sprintsError as Error).message} />}

        <StatsBar
          projectCount={kpis.projectCount}
          activeSprints={kpis.activeSprints}
          totalTasks={kpis.totalTasks}
          completedTasks={kpis.completedTasks}
        />

        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none bg-white"
            placeholder="Filter projects with sprints..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {projectsWithSprints.length === 0 ? (
          <EmptyState
            title="No sprint boards yet"
            description="Create a sprint for any project to start using Sprint Boards."
            icon={<GitBranch size={32} className="text-gray-300" />}
            action={<Button onClick={openCreate} icon={<Plus size={14} />}>Create Sprint</Button>}
          />
        ) : filteredProjects.length === 0 ? (
          <EmptyState
            title="No projects found"
            description="Try a different search keyword."
            icon={<GitBranch size={32} className="text-gray-300" />}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredProjects.map((p) => (
              <ProjectSprintCard
                key={p.id}
                project={p}
                tenantSlug={tenantSlug!}
                sprints={sprintsByProject.get(String(p.id)) ?? []}
              />
            ))}
          </div>
        )}
      </div>

      <Modal open={showCreate} onClose={closeCreate} title="Create Sprint" size="xl">
        <form onSubmit={handleCreateSprint} className="space-y-4">
          {createError && <Alert type="error" message={createError} />}

          <div>
            <label className="form-label">Search Project *</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="form-input pl-9"
                placeholder="Type project name (500+ projects supported)"
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg p-2 max-h-48 overflow-auto bg-gray-50/40">
            {createProjectOptions.length === 0 ? (
              <p className="text-xs text-gray-500 p-2">No matching projects</p>
            ) : (
              <div className="space-y-1">
                {createProjectOptions.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white border border-transparent hover:border-gray-200 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="project"
                      checked={selectedProjectId === String(p.id)}
                      onChange={() => setSelectedProjectId(String(p.id))}
                    />
                    <span className="text-sm text-gray-800">{p.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <p className="text-[11px] text-gray-500">
            Showing first {createProjectOptions.length} match(es). Refine search for faster selection.
          </p>

          <div>
            <label className="form-label">Sprint Name *</label>
            <input
              className="form-input"
              placeholder="Sprint 1 - Platform Hardening"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="form-label">Goal</label>
            <textarea
              className="form-textarea"
              rows={2}
              placeholder="Optional sprint goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="form-label">Start Date *</label>
              <input
                type="date"
                className="form-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">End Date *</label>
              <input
                type="date"
                className="form-input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">Capacity Points</label>
              <input
                type="number"
                min={0}
                className="form-input"
                value={capacityPoints}
                onChange={(e) => setCapacityPoints(e.target.value)}
              />
            </div>
          </div>

          <ModalActions>
            <Button variant="outline" type="button" onClick={closeCreate}>Cancel</Button>
            <Button type="submit" loading={createSprint.isPending}>Create Sprint</Button>
          </ModalActions>
        </form>
      </Modal>
    </Layout>
  );
}
