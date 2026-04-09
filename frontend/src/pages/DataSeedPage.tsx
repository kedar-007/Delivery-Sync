import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Play, Trash2, BarChart2, RefreshCw, AlertTriangle, ChevronDown, ChevronRight,
  FolderKanban, Users, Clock, Shield, CheckSquare, UserCircle, Award,
} from 'lucide-react';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import { dataSeedApi } from '../lib/api';

// ─── Module definitions ───────────────────────────────────────────────────────

interface ModuleSpec {
  key: string;
  label: string;
  description: string;
  defaultCount: number;
  maxCount: number;
  noCount?: boolean;
}

interface ModuleGroup {
  label: string;
  icon: React.ReactNode;
  modules: ModuleSpec[];
}

const MODULE_GROUPS: ModuleGroup[] = [
  {
    label: 'Project Management',
    icon: <FolderKanban size={16} />,
    modules: [
      { key: 'projects',     label: 'Projects',      description: 'Sample projects with RAG status and timeline.',        defaultCount: 20,  maxCount: 1000 },
      { key: 'milestones',   label: 'Milestones',    description: 'Key delivery milestones per project.',                 defaultCount: 30,  maxCount: 1000 },
      { key: 'decisions',    label: 'Decisions',     description: 'Architecture and product decision log entries.',       defaultCount: 20,  maxCount: 1000 },
      { key: 'sprints',      label: 'Sprints',       description: 'Sprint cycles (Planning/Active/Completed) per project.',defaultCount: 15,  maxCount: 200  },
      { key: 'tasks',        label: 'Tasks',         description: 'Tasks and stories assigned to users within sprints.',  defaultCount: 80,  maxCount: 1000 },
    ],
  },
  {
    label: 'RAID Register',
    icon: <Shield size={16} />,
    modules: [
      { key: 'risks',        label: 'Risks',         description: 'Project risks with probability, impact & mitigation.', defaultCount: 20,  maxCount: 500 },
      { key: 'issues',       label: 'Issues',        description: 'Open issues tracked against projects.',               defaultCount: 20,  maxCount: 500 },
      { key: 'dependencies', label: 'Dependencies',  description: 'Cross-team and external dependencies.',               defaultCount: 15,  maxCount: 500 },
      { key: 'assumptions',  label: 'Assumptions',   description: 'Project assumptions with validity status.',           defaultCount: 15,  maxCount: 500 },
    ],
  },
  {
    label: 'Daily Work',
    icon: <CheckSquare size={16} />,
    modules: [
      { key: 'actions',      label: 'Actions',       description: 'Action items assigned to team members.',              defaultCount: 50,  maxCount: 1000 },
      { key: 'blockers',     label: 'Blockers',      description: 'Project blockers with severity.',                     defaultCount: 20,  maxCount: 1000 },
      { key: 'standups',     label: 'Standup Entries', description: 'Daily standup submissions per user.',              defaultCount: 100, maxCount: 1000 },
      { key: 'eod',          label: 'EOD Entries',   description: 'End-of-day reports per user.',                       defaultCount: 100, maxCount: 1000 },
    ],
  },
  {
    label: 'Teams & Time',
    icon: <Clock size={16} />,
    modules: [
      { key: 'teams',        label: 'Teams',         description: 'Teams with random members from the tenant.',                                defaultCount: 5,   maxCount: 100  },
      { key: 'time_entries', label: 'Time Entries',  description: '30% land in current week. ~40% auto-submitted with approval requests.', defaultCount: 100, maxCount: 1000 },
    ],
  },
  {
    label: 'People & Profiles',
    icon: <Users size={16} />,
    modules: [
      {
        key: 'user_profiles',
        label: 'User Profiles & Org Chart',
        description: 'Seeds department, designation, bio, skills, timezone and reporting manager (branching-factor-3 tree) for every user.',
        defaultCount: 0,
        maxCount: 0,
        noCount: true,
      },
      { key: 'leaves',     label: 'Leave Types, Balances & Requests', description: 'Creates 5 standard leave types (AL/SL/CL/CO/UL), allocates yearly balances for every user, then seeds leave requests.', defaultCount: 50,  maxCount: 500 },
      { key: 'attendance', label: 'Attendance Records',               description: 'Seeds daily check-in/check-out records for all users. Count = number of calendar days back to seed.', defaultCount: 30, maxCount: 60  },
    ],
  },
  {
    label: 'Badges & Recognition',
    icon: <Award size={16} />,
    modules: [
      { key: 'badges', label: 'Badges & Awards', description: 'Creates 12 badge definitions (First Commit, Sprint Finisher, Blocker Buster, etc.) and awards them randomly to users.', defaultCount: 30, maxCount: 500 },
    ],
  },
];

const ALL_CLEARABLE_KEYS = MODULE_GROUPS
  .flatMap((g) => g.modules)
  .filter((m) => m.key !== 'user_profiles')
  .map((m) => m.key);

// ─── Stats display ────────────────────────────────────────────────────────────

const STAT_KEYS: { key: string; label: string }[] = [
  { key: 'users',         label: 'Users' },
  { key: 'user_profiles', label: 'Profiles' },
  { key: 'projects',      label: 'Projects' },
  { key: 'milestones',    label: 'Milestones' },
  { key: 'actions',       label: 'Actions' },
  { key: 'blockers',      label: 'Blockers' },
  { key: 'decisions',     label: 'Decisions' },
  { key: 'risks',         label: 'Risks' },
  { key: 'issues',        label: 'Issues' },
  { key: 'dependencies',  label: 'Deps' },
  { key: 'assumptions',   label: 'Assumptions' },
  { key: 'standups',      label: 'Standups' },
  { key: 'eod',           label: 'EOD' },
  { key: 'sprints',       label: 'Sprints' },
  { key: 'tasks',         label: 'Tasks' },
  { key: 'teams',         label: 'Teams' },
  { key: 'time_entries',  label: 'Time Entries' },
  { key: 'time_approvals', label: 'Approvals' },
  { key: 'leave_types',    label: 'Leave Types' },
  { key: 'leave_requests', label: 'Leaves' },
  { key: 'leave_balances', label: 'Balances' },
  { key: 'attendance',     label: 'Attendance' },
  { key: 'badge_defs',     label: 'Badge Defs' },
  { key: 'badges',         label: 'Badges' },
];

// ─── Progress bar component ───────────────────────────────────────────────────

const SeedProgressBar = ({
  active,
  totalRecords,
  onComplete,
}: {
  active: boolean;
  totalRecords: number;
  onComplete: () => void;
}) => {
  const [pct, setPct]     = useState(0);
  const timerRef          = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedRef      = useRef(false);

  useEffect(() => {
    if (!active) {
      // Snap to 100% and clear
      if (pct > 0 && !completedRef.current) {
        completedRef.current = true;
        setPct(100);
        setTimeout(() => { setPct(0); completedRef.current = false; onComplete(); }, 600);
      }
      return;
    }

    completedRef.current = false;
    setPct(0);

    // Estimate: ~80ms per record. Cap estimate at 60s.
    const estimatedMs = Math.min(60000, Math.max(3000, totalRecords * 80));
    const intervalMs  = 200;
    const step        = (intervalMs / estimatedMs) * 92; // advance to ~92% naturally

    timerRef.current = setInterval(() => {
      setPct((prev) => {
        const next = prev + step;
        return next >= 92 ? 92 : next; // hold at 92% until real completion
      });
    }, intervalMs);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  if (pct === 0 && !active) return null;

  return (
    <div className="mt-4 space-y-1.5">
      <div className="flex items-center justify-between text-xs text-[var(--ds-text-muted)]">
        <span>Seeding data…</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div className="h-2 w-full bg-[var(--ds-surface-raised)] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[var(--ds-primary)] to-teal-400 rounded-full transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
      {pct < 92 && (
        <p className="text-xs text-[var(--ds-text-muted)]">
          Estimated ~{Math.round((92 - pct) / 92 * totalRecords * 80 / 1000)}s remaining
        </p>
      )}
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const DataSeedPage = () => {
  const qc = useQueryClient();

  const today        = new Date().toISOString().split('T')[0];
  const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString().split('T')[0];

  const initCounts = () => {
    const c: Record<string, number> = {};
    MODULE_GROUPS.forEach((g) => g.modules.forEach((m) => { if (!m.noCount) c[m.key] = m.defaultCount; }));
    return c;
  };

  const [counts, setCounts]           = useState<Record<string, number>>(initCounts());
  const [dateFrom, setDateFrom]       = useState(sixMonthsAgo);
  const [dateTo, setDateTo]           = useState(today);
  const [enabledModules, setEnabled]  = useState<Record<string, boolean>>(
    Object.fromEntries(MODULE_GROUPS.flatMap((g) => g.modules.map((m) => [m.key, true])))
  );
  const [clearModules, setClearMods]  = useState<Record<string, boolean>>({});
  const [runResult, setRunResult]     = useState<string | null>(null);
  const [clearResult, setClearResult] = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [progressDone, setProgressDone] = useState(false);
  const [expandedGroups, setExpanded] = useState<Record<string, boolean>>(
    Object.fromEntries(MODULE_GROUPS.map((g) => [g.label, true]))
  );

  const { data: statsData, isLoading: statsLoading, refetch } = useQuery({
    queryKey: ['data-seed-stats'],
    queryFn:  () => dataSeedApi.stats(),
  });
  const counts_db = statsData?.counts ?? {};

  // Calculate total records to seed (for progress estimation)
  const totalToSeed = MODULE_GROUPS.flatMap((g) => g.modules).reduce((sum, m) => {
    if (!enabledModules[m.key] || m.noCount) return sum;
    return sum + (counts[m.key] ?? 0);
  }, 0) + (enabledModules['user_profiles'] ? 5 : 0); // rough user_profiles estimate

  const runMutation = useMutation({
    mutationFn: () => {
      const modules: Record<string, number | boolean> = {};
      MODULE_GROUPS.forEach((g) =>
        g.modules.forEach((m) => {
          if (!enabledModules[m.key]) return;
          if (m.noCount) { modules[m.key] = true; }
          else if ((counts[m.key] ?? 0) > 0) { modules[m.key] = counts[m.key]; }
        })
      );
      return dataSeedApi.run({ modules: modules as never, date_from: dateFrom, date_to: dateTo });
    },
    onSuccess: (data) => {
      setError(null);
      const parts = Object.entries(data.report as Record<string, Record<string, number>>)
        .map(([k, v]) => {
          if (v.users !== undefined)        return `${k}: ${(v.created ?? 0) + (v.updated ?? 0)} profiles`;
          if (v.awarded !== undefined)      return `${k}: ${v.awarded} awarded (${v.definitions ?? 0} defs)`;
          if (v.leave_types !== undefined)  return `${k}: ${v.requests_created ?? 0} requests, ${v.balances_created ?? 0} balances, ${v.leave_types} types`;
          if (v.days_back !== undefined)    return `${k}: ${v.created ?? 0} records (${v.days_back}d × ${v.users} users)`;
          return `${k}: ${v.created ?? 0}${(v.failed ?? 0) > 0 ? ` (${v.failed} failed)` : ''}`;
        })
        .join(' · ');
      setRunResult(`Done — ${parts}`);
      qc.invalidateQueries({ queryKey: ['data-seed-stats'] });
    },
    onError: (err: Error) => { setError(err.message); setRunResult(null); },
  });

  const clearMutation = useMutation({
    mutationFn: () => {
      const mods = Object.keys(clearModules).filter((k) => clearModules[k]);
      return dataSeedApi.clear({ modules: mods, confirm: true });
    },
    onSuccess: (data) => {
      setError(null);
      const parts = Object.entries(data.report as Record<string, { deleted?: number }>)
        .map(([k, v]) => `${k}: ${v.deleted ?? 0}`)
        .join(' · ');
      setClearResult(`Cleared — ${parts}`);
      setClearMods({});
      qc.invalidateQueries({ queryKey: ['data-seed-stats'] });
    },
    onError: (err: Error) => { setError(err.message); setClearResult(null); },
  });

  const toggleGroup = (label: string) =>
    setExpanded((prev) => ({ ...prev, [label]: !prev[label] }));

  const selectedClearKeys = Object.keys(clearModules).filter((k) => clearModules[k]);

  const hasAnythingToSeed = MODULE_GROUPS.some((g) =>
    g.modules.some((m) => enabledModules[m.key] && (m.noCount || (counts[m.key] ?? 0) > 0))
  );

  return (
    <Layout>
      <Header title="Data Seeder" subtitle="Generate realistic test data across all modules" />
      <div className="p-6 space-y-6">

        {error && <Alert type="error" message={error} />}

        {/* ── Stats ── */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[var(--ds-text)] flex items-center gap-2">
              <BarChart2 size={16} className="text-[var(--ds-primary)]" />
              Current Record Counts
            </h3>
            <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={() => refetch()} loading={statsLoading}>
              Refresh
            </Button>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-10 gap-2">
            {STAT_KEYS.map(({ key, label }) => (
              <div key={key} className="bg-[var(--ds-surface-raised)] rounded-lg p-2.5 text-center">
                <p className="text-xl font-bold text-[var(--ds-primary)]">{counts_db[key] ?? '—'}</p>
                <p className="text-[10px] text-[var(--ds-text-muted)] mt-0.5 leading-tight">{label}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* ── Seed Form ── */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[var(--ds-text)] flex items-center gap-2">
              <Play size={16} className="text-green-500" />
              Configure & Seed
            </h3>
          </div>

          {/* Date range */}
          <div className="flex flex-wrap gap-4 mb-6 pb-5 border-b border-[var(--ds-border)]">
            <div>
              <label className="form-label">Date From</label>
              <input type="date" className="form-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Date To</label>
              <input type="date" className="form-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <p className="self-end text-xs text-[var(--ds-text-muted)] pb-2">
              Applies to standup, EOD, actions, blockers, time entries and other dated records.
            </p>
          </div>

          {/* Module groups */}
          <div className="space-y-3">
            {MODULE_GROUPS.map((group) => (
              <div key={group.label} className="border border-[var(--ds-border)] rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center gap-2 px-4 py-3 bg-[var(--ds-surface-raised)] hover:bg-[var(--ds-surface-hover)] transition-colors text-left"
                >
                  <span className="text-[var(--ds-primary)]">{group.icon}</span>
                  <span className="font-medium text-sm text-[var(--ds-text)]">{group.label}</span>
                  <span className="ml-auto text-[var(--ds-text-muted)]">
                    {expandedGroups[group.label] ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </span>
                </button>

                {expandedGroups[group.label] && (
                  <div className="divide-y divide-[var(--ds-border)]">
                    {group.modules.map((mod) => (
                      <div key={mod.key} className="flex items-center gap-4 px-4 py-3">
                        <input
                          type="checkbox"
                          className="rounded shrink-0"
                          checked={!!enabledModules[mod.key]}
                          onChange={(e) => setEnabled((prev) => ({ ...prev, [mod.key]: e.target.checked }))}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--ds-text)]">{mod.label}</p>
                          <p className="text-xs text-[var(--ds-text-muted)] mt-0.5 leading-snug">{mod.description}</p>
                        </div>
                        {mod.noCount ? (
                          <span className="text-xs text-[var(--ds-text-muted)] shrink-0 w-28 text-right">All users</span>
                        ) : (
                          <div className="shrink-0 flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              max={mod.maxCount}
                              disabled={!enabledModules[mod.key]}
                              className="form-input w-24 text-center disabled:opacity-40"
                              value={counts[mod.key] ?? 0}
                              onChange={(e) => {
                                const n = parseInt(e.target.value);
                                setCounts((prev) => ({ ...prev, [mod.key]: isNaN(n) ? 0 : Math.min(mod.maxCount, Math.max(0, n)) }));
                              }}
                            />
                            <span className="text-xs text-[var(--ds-text-muted)]">/ {mod.maxCount.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <SeedProgressBar
            active={runMutation.isPending}
            totalRecords={totalToSeed}
            onComplete={() => setProgressDone(true)}
          />

          {!runMutation.isPending && runResult && (
            <Alert type="success" message={runResult} className="mt-4" />
          )}

          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <Button
              icon={<Play size={14} />}
              onClick={() => { setRunResult(null); setProgressDone(false); runMutation.mutate(); }}
              loading={runMutation.isPending}
              disabled={!hasAnythingToSeed}
            >
              {runMutation.isPending ? 'Seeding…' : 'Run Seed'}
            </Button>
            <Button variant="secondary" size="sm"
              onClick={() => setEnabled(Object.fromEntries(MODULE_GROUPS.flatMap((g) => g.modules.map((m) => [m.key, true]))))}
            >
              Enable All
            </Button>
            <Button variant="secondary" size="sm"
              onClick={() => setEnabled(Object.fromEntries(MODULE_GROUPS.flatMap((g) => g.modules.map((m) => [m.key, false]))))}
            >
              Disable All
            </Button>
            {totalToSeed > 0 && !runMutation.isPending && (
              <span className="text-xs text-[var(--ds-text-muted)] ml-auto">
                ~{totalToSeed.toLocaleString()} records to seed
              </span>
            )}
          </div>
        </Card>

        {/* ── Clear Form ── */}
        <Card>
          <h3 className="font-semibold text-[var(--ds-text)] mb-1 flex items-center gap-2">
            <Trash2 size={16} className="text-red-500" />
            Clear Module Data
          </h3>
          <p className="text-sm text-[var(--ds-text-muted)] mb-4">
            Permanently deletes <strong>all records</strong> in selected modules for this tenant.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
            {ALL_CLEARABLE_KEYS.map((key) => {
              const mod = MODULE_GROUPS.flatMap((g) => g.modules).find((m) => m.key === key)!;
              return (
                <label key={key} className="flex items-center gap-2 p-2.5 border border-[var(--ds-border)] rounded-lg cursor-pointer hover:bg-[var(--ds-surface-raised)] select-none">
                  <input
                    type="checkbox"
                    className="rounded shrink-0"
                    checked={!!clearModules[key]}
                    onChange={(e) => setClearMods((prev) => ({ ...prev, [key]: e.target.checked }))}
                  />
                  <span className="text-sm text-[var(--ds-text)]">{mod?.label ?? key}</span>
                </label>
              );
            })}
          </div>

          {/* User profiles clear — separate warning */}
          <label className="flex items-center gap-2 p-2.5 border border-red-200 bg-red-50/40 rounded-lg cursor-pointer select-none mb-4 w-fit">
            <input
              type="checkbox"
              className="rounded shrink-0"
              checked={!!clearModules['user_profiles']}
              onChange={(e) => setClearMods((prev) => ({ ...prev, user_profiles: e.target.checked }))}
            />
            <UserCircle size={14} className="text-red-500 shrink-0" />
            <span className="text-sm text-red-700 font-medium">User Profiles & Org Chart</span>
            <span className="text-xs text-red-500 ml-1">(sensitive)</span>
          </label>

          {selectedClearKeys.length > 0 && (
            <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg mb-4 text-sm text-red-700">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>
                Permanently deletes all <strong>
                  {selectedClearKeys.map((k) => {
                    const m = MODULE_GROUPS.flatMap((g) => g.modules).find((x) => x.key === k);
                    return m?.label ?? k;
                  }).join(', ')}
                </strong> records for this tenant.
              </span>
            </div>
          )}

          {clearResult && <Alert type="success" message={clearResult} className="mb-4" />}

          <Button
            variant="danger"
            icon={<Trash2 size={14} />}
            onClick={() => { setClearResult(null); clearMutation.mutate(); }}
            loading={clearMutation.isPending}
            disabled={selectedClearKeys.length === 0}
          >
            Clear Selected ({selectedClearKeys.length})
          </Button>
        </Card>
      </div>
    </Layout>
  );
};

export default DataSeedPage;
