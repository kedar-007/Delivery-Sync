import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import { useI18n } from '../contexts/I18nContext';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/Spinner';
import VoiceRecorder from '../components/voice/VoiceRecorder';
import VoiceAiInsights from '../components/voice/VoiceAiInsights';
import { useProjects, useMyProjects } from '../hooks/useProjects';
import { useTeamPeers } from '../hooks/useTeams';
import {
  useSubmitStandup, useUpdateStandup,
  useStandupRollup, useMyTodayStandup,
  useStandups, useStandupsPaged, useSearchStandups,
} from '../hooks/useStandups';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission, PERMISSIONS } from '../utils/permissions';
import UserAvatar from '../components/ui/UserAvatar';
import { Users as UsersIcon, Globe, User } from 'lucide-react';
import { useProcessVoice, type StandupVoiceResult } from '../hooks/useVoiceAI';
import { format, subDays, startOfWeek, endOfWeek } from 'date-fns';
import {
  CheckCircle, Clock, Sparkles, History, Search,
  Pencil, X, FolderOpen, ChevronDown, ChevronRight,
  AlertCircle,
} from 'lucide-react';

interface StandupForm {
  project_id: string;
  date: string;
  yesterday: string;
  today: string;
  blockers: string;
}

interface StandupEntry {
  id: string;
  date: string;
  projectId?: string;
  projectName?: string;
  yesterday: string;
  today: string;
  blockers?: string;
  submittedAt?: string;
  userId?: string;          // returned by team-view fetches
  userName?: string;        // backend attaches this on team / privileged views
  userAvatarUrl?: string;   // backend attaches this on team / privileged views
}

const AiBadge = () => (
  <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-medium">
    <Sparkles size={10} /> AI
  </span>
);

// ─── Per-project grouped list ─────────────────────────────────────────────────

const ProjectSection = ({
  projectName,
  entries,
  onEdit,
  color,
}: {
  projectName: string;
  entries: StandupEntry[];
  onEdit: (entry: StandupEntry) => void;
  color: string;
}) => {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      {/* Section header */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${color}`} />
        <FolderOpen size={14} className="text-gray-500 shrink-0" />
        <span className="text-sm font-semibold text-gray-800 flex-1">{projectName}</span>
        <span className="text-xs text-gray-400 font-medium mr-2">
          {entries.length !== 1 ? t('standup.updateCountPlural', { count: entries.length }) : t('standup.updateCount', { count: entries.length })}
        </span>
        {collapsed ? <ChevronRight size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>

      {!collapsed && (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {entries.map((entry) => (
            <div key={entry.id} className="px-4 py-3 bg-ds-surface group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-700">
                      {format(new Date(entry.date + 'T00:00:00'), 'd MMM yyyy')}
                    </span>
                    {entry.submittedAt && (
                      <span className="text-xs text-gray-400">· {format(new Date(entry.submittedAt), 'h:mm a')}</span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-1.5">
                    <div className="flex gap-3">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5 w-24 shrink-0">{t('standup.form.labelYesterday')}</span>
                      <p className="text-sm text-gray-700 leading-snug min-w-0 break-words">{entry.yesterday}</p>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mt-0.5 w-24 shrink-0">{t('standup.form.labelToday')}</span>
                      <p className="text-sm text-gray-700 leading-snug min-w-0 break-words">{entry.today}</p>
                    </div>
                    {entry.blockers && (
                      <div className="flex gap-3">
                        <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider mt-0.5 w-24 shrink-0">{t('standup.form.labelBlockers')}</span>
                        <p className="text-sm text-gray-700 leading-snug min-w-0 break-words">{entry.blockers}</p>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onEdit(entry)}
                  title={t('common.edit')}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 shrink-0"
                >
                  <Pencil size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Project color palette ────────────────────────────────────────────────────

const PROJECT_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-orange-500', 'bg-teal-500',
];

// ─── Main component ───────────────────────────────────────────────────────────

const StandupPage = () => {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const preselectedProject = searchParams.get('projectId') || '';

  const [tab, setTab] = useState<'submit' | 'rollup' | 'mine' | 'team'>('submit');
  const [rollupProjectId, setRollupProjectId] = useState(preselectedProject);
  const [success, setSuccess] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [aiResult, setAiResult] = useState<StandupVoiceResult | null>(null);
  const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set());
  const [standupSearch, setStandupSearch] = useState('');
  const [debouncedStandupSearch, setDebouncedStandupSearch] = useState('');
  const [editingEntry, setEditingEntry] = useState<StandupEntry | null>(null);

  const today = format(new Date(), 'yyyy-MM-dd');
  // 7-day backdate window: standups can be entered for today or up to 7 days
  // back. Future dates are never allowed.
  const minDate = format(subDays(new Date(), 7), 'yyyy-MM-dd');
  const { data: allOrgProjects = [], isLoading: projectsLoading } = useProjects();
  const { data: myProjects = [] } = useMyProjects();
  const { data: todayStandups = [] } = useMyTodayStandup();
  const { data: myStandups = [], isLoading: myLoading } = useStandups();
  const { user: authUser } = useAuth();
  const canSeeTeamStandups = hasPermission(authUser, PERMISSIONS.STANDUP_TEAM_VIEW)
    || hasPermission(authUser, PERMISSIONS.PROJECT_DATA_VIEW_ALL)
    || authUser?.role === 'TENANT_ADMIN' || authUser?.role === 'SUPER_ADMIN';
  const isOrgWideStandups = (hasPermission(authUser, PERMISSIONS.PROJECT_DATA_VIEW_ALL)
    || authUser?.role === 'TENANT_ADMIN' || authUser?.role === 'SUPER_ADMIN')
    && !hasPermission(authUser, PERMISSIONS.STANDUP_TEAM_VIEW);
  const canViewOrgData = authUser?.role === 'TENANT_ADMIN' || authUser?.role === 'SUPER_ADMIN'
    || hasPermission(authUser, PERMISSIONS.PROJECT_DATA_VIEW_ALL);
  const [viewMode, setViewMode] = useState<'mine' | 'org'>('mine');
  // submitProjects is always member-only (you submit for your own projects).
  // viewProjects drives the rollup pills and team-tab project filter.
  const submitProjects = myProjects.length > 0 ? myProjects : allOrgProjects;
  const viewProjects = (canViewOrgData && viewMode === 'org') ? allOrgProjects : submitProjects;
  // Team Standups filter + pagination state. Date defaults to "Today" so the
  // tab loads useful data immediately — users can widen the range as needed.
  const [teamDateFrom, setTeamDateFrom] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [teamDateTo,   setTeamDateTo]   = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [teamUserId,   setTeamUserId]   = useState<string>('');
  const [teamProjectId, setTeamProjectId] = useState<string>('');
  const [teamPage,     setTeamPage]     = useState(1);
  const [teamPageSize, setTeamPageSize] = useState(5);

  // Reset to page 1 whenever any team-tab filter changes
  useEffect(() => { setTeamPage(1); },
    [teamDateFrom, teamDateTo, teamUserId, teamProjectId, teamPageSize]);

  // Build team-fetch params. Date range is sent via startDate/endDate; the
  // backend already supports those for STANDUP_ENTRIES.
  const teamParams = React.useMemo<Record<string, string>>(() => {
    const p: Record<string, string> = { scope: 'team' };
    if (teamDateFrom) p.startDate = teamDateFrom;
    if (teamDateTo)   p.endDate   = teamDateTo;
    if (teamUserId)   p.userId    = teamUserId;
    if (teamProjectId) p.projectId = teamProjectId;
    p.page     = String(teamPage);
    p.pageSize = String(teamPageSize);
    return p;
  }, [teamDateFrom, teamDateTo, teamUserId, teamProjectId, teamPage, teamPageSize]);

  // Team-view fetch — only triggers when the Team Standups tab is opened AND
  // the user has STANDUP_TEAM_VIEW. Uses the paginated hook so the response
  // includes { data, pagination } and we can render proper page controls.
  const { data: teamResult, isLoading: teamLoading } = useStandupsPaged(
    teamParams,
    { enabled: tab === 'team' && canSeeTeamStandups }
  );
  const teamStandups   = React.useMemo(() => teamResult?.data ?? [], [teamResult?.data]);
  const teamPagination = teamResult?.pagination ?? null;
  const teamTotal      = teamPagination?.total ?? teamStandups.length;
  const teamTotalPages = Math.max(1, teamPagination?.totalPages ?? Math.ceil(teamStandups.length / teamPageSize));

  // User-filter roster — fetched from `/api/teams/peers` so the dropdown
  // lists every person the caller can see (team members + leads, or the
  // whole tenant for org-wide callers), not just users who happen to have
  // an entry on the visible page. Falls back to entries-derived users if
  // the endpoint isn't reachable, so the dropdown is never empty.
  const { data: teamPeers = [] } = useTeamPeers(tab === 'team' && canSeeTeamStandups);
  const teamUserOptions = React.useMemo(() => {
    if (teamPeers.length > 0) {
      return teamPeers
        .map((p) => ({ id: p.id, name: p.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    const seen = new Map<string, { id: string; name: string }>();
    (teamStandups as Array<{ userId?: string; userName?: string }>).forEach((s) => {
      const id = String(s.userId || '');
      if (id && !seen.has(id)) seen.set(id, { id, name: s.userName || 'Team member' });
    });
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [teamPeers, teamStandups]);

  // Date preset helpers — same shape as the Time Tracking tab so the UI feels
  // consistent across the app.
  const applyTeamDatePreset = (preset: 'today' | 'yesterday' | 'week' | 'all') => {
    const today = new Date();
    if (preset === 'all') {
      setTeamDateFrom(''); setTeamDateTo(''); return;
    }
    if (preset === 'today') {
      const d = format(today, 'yyyy-MM-dd');
      setTeamDateFrom(d); setTeamDateTo(d); return;
    }
    if (preset === 'yesterday') {
      const d = format(subDays(today, 1), 'yyyy-MM-dd');
      setTeamDateFrom(d); setTeamDateTo(d); return;
    }
    if (preset === 'week') {
      setTeamDateFrom(format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
      setTeamDateTo  (format(endOfWeek  (today, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
      return;
    }
  };
  const teamActivePreset = React.useMemo<'today' | 'yesterday' | 'week' | 'all' | 'custom'>(() => {
    const today = new Date();
    const t  = format(today, 'yyyy-MM-dd');
    const y  = format(subDays(today, 1), 'yyyy-MM-dd');
    const ws = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const we = format(endOfWeek  (today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    if (!teamDateFrom && !teamDateTo)                                 return 'all';
    if (teamDateFrom === t  && teamDateTo === t)                      return 'today';
    if (teamDateFrom === y  && teamDateTo === y)                      return 'yesterday';
    if (teamDateFrom === ws && teamDateTo === we)                     return 'week';
    return 'custom';
  }, [teamDateFrom, teamDateTo]);

  const teamHasFilter = Boolean(teamDateFrom || teamDateTo || teamUserId || teamProjectId);
  const clearTeamFilters = () => {
    setTeamDateFrom(format(new Date(), 'yyyy-MM-dd'));
    setTeamDateTo  (format(new Date(), 'yyyy-MM-dd'));
    setTeamUserId(''); setTeamProjectId('');
  };
  const { data: searchStandups = [], isLoading: searchStandupLoading } = useSearchStandups(debouncedStandupSearch);
  const { data: rollupData, isLoading: rollupLoading } = useStandupRollup({ projectId: rollupProjectId });
  const submitStandup = useSubmitStandup();
  const updateStandup = useUpdateStandup();
  const processVoice = useProcessVoice();

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedStandupSearch(standupSearch.trim()), 350);
    return () => clearTimeout(t);
  }, [standupSearch]);

  const isSearchMode = debouncedStandupSearch.length >= 2;
  const visibleStandups = isSearchMode ? searchStandups : myStandups;

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<StandupForm>({
    defaultValues: { project_id: preselectedProject, date: today },
  });

  const watchedProject = watch('project_id');

  const startEdit = (entry: StandupEntry) => {
    setEditingEntry(entry);
    setValue('project_id', entry.projectId ?? '');
    setValue('date', entry.date);
    setValue('yesterday', entry.yesterday);
    setValue('today', entry.today);
    setValue('blockers', entry.blockers ?? '');
    setAiResult(null);
    setAiFilledFields(new Set());
    setSuccess('');
    setSubmitError('');
    setTab('submit');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingEntry(null);
    reset({ project_id: preselectedProject, date: today });
    setAiResult(null);
    setAiFilledFields(new Set());
  };

  const handleVoiceProcess = async (transcript: string) => {
    try {
      const result = await processVoice.mutateAsync({
        transcript,
        type: 'standup',
        projectId: watchedProject || undefined,
      });
      const data: StandupVoiceResult = result.data;
      setAiResult(data);
      const filled = new Set<string>();
      if (data.yesterday) { setValue('yesterday', data.yesterday, { shouldDirty: true }); filled.add('yesterday'); }
      if (data.today)     { setValue('today', data.today, { shouldDirty: true });         filled.add('today'); }
      if (data.blockers)  { setValue('blockers', data.blockers, { shouldDirty: true });   filled.add('blockers'); }
      setAiFilledFields(filled);
    } catch { /* shown via processVoice.isError */ }
  };

  const onSubmit = async (data: StandupForm) => {
    try {
      setSubmitError('');
      if (editingEntry) {
        await updateStandup.mutateAsync({
          id: editingEntry.id,
          data: { yesterday: data.yesterday, today: data.today, blockers: data.blockers },
        });
        setSuccess(t('standup.updatedSuccess'));
        setEditingEntry(null);
      } else {
        await submitStandup.mutateAsync(data);
        setSuccess(t('standup.submittedFor', { date: format(new Date(data.date), 'd MMM yyyy') }));
      }
      // Explicitly clear textareas to '' (not undefined) so the inputs render
      // as empty after submit. Keep project_id + date so quick re-submits work.
      reset({
        project_id: data.project_id,
        date: today,
        yesterday: '',
        today: '',
        blockers: '',
      });
      setAiResult(null);
      setAiFilledFields(new Set());
      // Surface the success message and scroll up so the user sees it
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      setSubmitError((err as Error).message);
      // DSV-005: scroll to top so the error banner is visible (the form is
      // long; users were stuck looking at the bottom when submission failed).
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // DSV-001: auto-hide the success banner so it doesn't linger forever.
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(''), 4000);
    return () => clearTimeout(t);
  }, [success]);

  if (projectsLoading) return <Layout><PageLoader /></Layout>;

  const submittedProjectIds = new Set(todayStandups.map((s: { projectId: string }) => s.projectId));
  const standupProjects = submitProjects as any[];

  // Group "My Submissions" by project
  const projectColorMap = new Map<string, string>();
  (submitProjects as any[]).forEach((p, i) => {
    projectColorMap.set(p.id, PROJECT_COLORS[i % PROJECT_COLORS.length]);
  });

  const byProject = new Map<string, { name: string; color: string; entries: StandupEntry[] }>();
  (visibleStandups as StandupEntry[]).forEach((entry) => {
    const key = entry.projectId ?? '_none';
    const name = entry.projectName ?? 'Unknown Project';
    if (!byProject.has(key)) {
      byProject.set(key, { name, color: projectColorMap.get(entry.projectId ?? '') ?? 'bg-gray-400', entries: [] });
    }
    byProject.get(key)!.entries.push(entry);
  });
  const projectGroups = Array.from(byProject.values());

  return (
    <Layout>
      <Header
        title={t('nav.standup')}
        subtitle={t('standup.subtitle')}
        actions={canViewOrgData ? (
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setViewMode('mine')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${viewMode === 'mine' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}><User size={11} /> My Projects</button>
            <button onClick={() => setViewMode('org')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${viewMode === 'org' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}><Globe size={11} /> All Org</button>
          </div>
        ) : undefined}
      />
      <div className="p-6 space-y-5">

        {/* Tabs — Team Standups only visible to users with STANDUP_TEAM_VIEW */}
        <div className="flex gap-2 border-b border-gray-200">
          {(['submit', 'rollup', 'mine', ...(canSeeTeamStandups ? ['team'] as const : [])] as const).map((tabKey) => (
            <button key={tabKey} onClick={() => setTab(tabKey)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === tabKey ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {tabKey === 'submit'
                ? editingEntry ? (
                    <span className="flex items-center gap-1.5 text-amber-600">
                      <Pencil size={13} /> {t('standup.editStandup')}
                    </span>
                  ) : t('standup.submit')
                : tabKey === 'rollup' ? t('standup.rollupTitle')
                : tabKey === 'mine' ? (
                  <span className="flex items-center gap-1.5">
                    <History size={14} />
                    {t('standup.tabs.mySubmissions')}
                    {myStandups.length > 0 && (
                      <span className="bg-blue-100 text-blue-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
                        {myStandups.length}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <UsersIcon size={14} />
                    {isOrgWideStandups ? 'Org Standups' : t('standup.tabs.teamStandups')}
                    {teamStandups.length > 0 && (
                      <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
                        {teamStandups.length}
                      </span>
                    )}
                  </span>
                )}
            </button>
          ))}
        </div>

        {/* ── Submit / Edit tab ── */}
        {tab === 'submit' && (
          <div className="max-w-2xl space-y-4">
            {/* Edit mode banner */}
            {editingEntry && (
              <div className="flex items-center justify-between gap-3 p-3 bg-amber-50 rounded-xl border border-amber-200">
                <div className="flex items-center gap-2">
                  <Pencil size={15} className="text-amber-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">{t('standup.editingStandup')}</p>
                    <p className="text-xs text-amber-600">
                      {editingEntry.projectName} · {format(new Date(editingEntry.date + 'T00:00:00'), 'd MMM yyyy')}
                    </p>
                  </div>
                </div>
                <button type="button" onClick={cancelEdit}
                  className="text-xs text-amber-600 hover:text-amber-800 flex items-center gap-1 px-2 py-1 rounded hover:bg-amber-100 transition-colors">
                  <X size={12} /> {t('common.cancel')}
                </button>
              </div>
            )}

            {/* Today's status (only when not editing) */}
            {!editingEntry && todayStandups.length > 0 && (
              <div className="p-4 bg-green-50 rounded-xl border border-green-200 flex items-start gap-3">
                <CheckCircle size={18} className="text-green-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-800">{t('standup.submittedToday')}</p>
                  <p className="text-xs text-green-600 mt-0.5">
                    {submittedProjectIds.size} project(s): {(submitProjects as any[])
                      .filter((p: { id: string }) => submittedProjectIds.has(p.id))
                      .map((p: { name: string }) => p.name).join(', ')}
                  </p>
                </div>
              </div>
            )}

            {success && <Alert type="success" message={success} className="mb-0" />}
            {submitError && <Alert type="error" message={submitError} className="mb-0" />}
            {processVoice.isError && (
              <Alert type="error" message={`AI processing failed: ${(processVoice.error as Error)?.message}`} className="mb-0" />
            )}

            <Card>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                {/* Project + Date (read-only when editing) */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">{t('standup.form.projectRequired')}</label>
                    {editingEntry ? (
                      <div className="form-input bg-gray-50 text-gray-600 cursor-not-allowed">
                        {editingEntry.projectName ?? t('common.na')}
                      </div>
                    ) : (
                      <select className="form-select" {...register('project_id', { required: t('validation.required') })}>
                        <option value="">{t('standup.form.selectProject')}</option>
                        {standupProjects.map((p: { id: string; name: string }) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    )}
                    {errors.project_id && <p className="form-error">{errors.project_id.message}</p>}
                  </div>
                  <div>
                    <label className="form-label">{t('standup.form.dateRequired')}</label>
                    <input
                      type="date"
                      className={`form-input ${editingEntry ? 'bg-gray-50 text-gray-600 cursor-not-allowed' : ''}`}
                      readOnly={!!editingEntry}
                      min={minDate}
                      max={today}
                      {...register('date', {
                        required: t('validation.required'),
                        validate: (v) => {
                          if (!v) return t('validation.required');
                          if (v > today)    return t('validation.futureDate');
                          if (v < minDate)  return t('validation.pastDate');
                          return true;
                        },
                      })}
                    />
                    {errors.date && <p className="form-error">{(errors.date as any).message || t('validation.invalidDate')}</p>}
                    {!editingEntry && (
                      <p className="text-[11px] text-gray-400 mt-1">
                        {t('standup.form.backdateHint')}
                      </p>
                    )}
                  </div>
                </div>

                {/* Voice recorder */}
                <VoiceRecorder onProcess={handleVoiceProcess} isProcessing={processVoice.isPending} />

                {/* AI Insights panel */}
                {aiResult && (
                  <VoiceAiInsights
                    summary={aiResult.summary}
                    insights={aiResult.insights}
                    onDismiss={() => { setAiResult(null); setAiFilledFields(new Set()); }}
                  />
                )}

                {/* Yesterday */}
                <div>
                  <label className="form-label">
                    {t('standup.form.yesterdayFull')}
                    {aiFilledFields.has('yesterday') && <AiBadge />}
                  </label>
                  <textarea className="form-textarea" rows={3}
                    placeholder={t('standup.form.yesterdayPlaceholder')}
                    {...register('yesterday', { required: t('validation.required') })} />
                  {errors.yesterday && <p className="form-error">{errors.yesterday.message}</p>}
                </div>

                {/* Today */}
                <div>
                  <label className="form-label">
                    {t('standup.form.todayFull')}
                    {aiFilledFields.has('today') && <AiBadge />}
                  </label>
                  <textarea className="form-textarea" rows={3}
                    placeholder={t('standup.form.todayPlaceholder')}
                    {...register('today', { required: t('validation.required') })} />
                  {errors.today && <p className="form-error">{errors.today.message}</p>}
                </div>

                {/* Blockers */}
                <div>
                  <label className="form-label">
                    {t('standup.form.blockers')}
                    {aiFilledFields.has('blockers') && <AiBadge />}
                  </label>
                  <textarea className="form-textarea" rows={2}
                    placeholder={t('standup.form.blockersPlaceholder')}
                    {...register('blockers')} />
                </div>

                <div className="flex items-center gap-3">
                  <Button type="submit" loading={isSubmitting}
                    icon={editingEntry ? <Pencil size={15} /> : <Clock size={16} />}
                    variant={editingEntry ? 'primary' : 'primary'}>
                    {editingEntry ? t('standup.update') : t('standup.submit')}
                  </Button>
                  {editingEntry && (
                    <Button type="button" variant="outline" onClick={cancelEdit}>{t('common.cancel')}</Button>
                  )}
                </div>
              </form>
            </Card>
          </div>
        )}

        {/* ── My Submissions tab ── */}
        {tab === 'mine' && (
          <div className="space-y-4">
            {/* Search bar */}
            <div className="relative">
              {searchStandupLoading && isSearchMode
                ? <svg className="absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-blue-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                : <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              }
              <input
                className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-200 outline-none"
                placeholder={t('standup.searchInputPlaceholder')}
                value={standupSearch}
                onChange={(e) => setStandupSearch(e.target.value)}
              />
              {standupSearch && (
                <button type="button" onClick={() => { setStandupSearch(''); setDebouncedStandupSearch(''); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Summary pill */}
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
              <History size={18} className="text-blue-600 shrink-0" />
              <p className="text-sm font-medium text-blue-800">
                {(myLoading || searchStandupLoading) ? t('common.loading')
                  : isSearchMode
                    ? `${visibleStandups.length} result${visibleStandups.length !== 1 ? 's' : ''} for "${debouncedStandupSearch}"`
                    : `${myStandups.length} standup${myStandups.length !== 1 ? 's' : ''} across ${byProject.size} project${byProject.size !== 1 ? 's' : ''}`}
              </p>
            </div>

            {/* Hover-tip */}
            {!myLoading && myStandups.length > 0 && (
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <Pencil size={10} /> {t('standup.hoverToEdit')}
              </p>
            )}

            {myLoading && !isSearchMode ? <PageLoader /> : visibleStandups.length === 0 ? (
              <EmptyState
                title={isSearchMode ? t('standup.noSearchResults') : t('standup.noEntries')}
                description={isSearchMode ? t('standup.noSearchResultsDesc') : t('standup.noEntriesDesc')}
              />
            ) : isSearchMode ? (
              /* Flat list in search mode (entries from different projects mixed) */
              <div className="space-y-3">
                {(visibleStandups as StandupEntry[]).map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-ds-surface px-4 py-3 group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-gray-700">
                            {format(new Date(entry.date + 'T00:00:00'), 'd MMM yyyy')}
                          </span>
                          {entry.projectName && (
                            <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium border border-blue-100">
                              {entry.projectName}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-1.5">
                          <div className="flex gap-3">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5 w-24 shrink-0">{t('standup.form.labelYesterday')}</span>
                            <p className="text-sm text-gray-700 leading-snug min-w-0 break-words">{entry.yesterday}</p>
                          </div>
                          <div className="flex gap-3">
                            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mt-0.5 w-24 shrink-0">{t('standup.form.labelToday')}</span>
                            <p className="text-sm text-gray-700 leading-snug min-w-0 break-words">{entry.today}</p>
                          </div>
                          {entry.blockers && (
                            <div className="flex gap-3">
                              <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider mt-0.5 w-24 shrink-0">{t('standup.form.labelBlockers')}</span>
                              <p className="text-sm text-red-700 leading-snug min-w-0 break-words">{entry.blockers}</p>
                            </div>
                          )}
                        </div>
                      </div>
                      <button type="button" onClick={() => startEdit(entry)} title={t('common.edit')}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 shrink-0">
                        <Pencil size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Grouped by project */
              <div className="space-y-3">
                {projectGroups.map((group) => (
                  <ProjectSection
                    key={group.name}
                    projectName={group.name}
                    entries={group.entries}
                    onEdit={startEdit}
                    color={group.color}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Rollup tab ── */}
        {tab === 'rollup' && (
          <div className="space-y-4">
            {/* Project pills */}
            <div className="flex flex-wrap gap-2">
              {(viewProjects as any[]).map((p: { id: string; name: string }, i: number) => (
                <button key={p.id} type="button"
                  onClick={() => setRollupProjectId(p.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                    rollupProjectId === p.id
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-ds-surface text-gray-600 border-gray-200 dark:border-gray-600 hover:border-blue-300 hover:text-blue-600'
                  }`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${rollupProjectId === p.id ? 'bg-white/80 dark:bg-white/60' : PROJECT_COLORS[i % PROJECT_COLORS.length]}`} />
                  {p.name}
                </button>
              ))}
            </div>

            {rollupLoading ? <PageLoader /> : !rollupProjectId ? (
              <EmptyState title={t('standup.selectProject')} description={t('standup.selectProjectDesc')} />
            ) : rollupData?.rollup?.length === 0 ? (
              <EmptyState title={t('standup.noStandupsRange')} description={t('standup.noStandupsRangeDesc')} />
            ) : (
              <div className="space-y-4">
                {rollupData?.rollup?.map((day: {
                  date: string; entryCount: number; entries: Array<{
                    id: string; userName: string; yesterday: string; today: string; blockers?: string;
                  }>;
                }) => (
                  <div key={day.date} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                    {/* Day header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-indigo-600 dark:bg-indigo-800 text-white">
                      <h3 className="text-sm font-bold tracking-wide">
                        {format(new Date(day.date + 'T00:00:00'), 'EEEE, d MMMM yyyy')}
                      </h3>
                      <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-200 bg-white/95 dark:bg-indigo-300/20 px-2.5 py-0.5 rounded-full">
                        {day.entryCount !== 1 ? t('standup.updateCountPlural', { count: day.entryCount }) : t('standup.updateCount', { count: day.entryCount })}
                      </span>
                    </div>

                    {/* Entries */}
                    <div className="divide-y divide-gray-100 dark:divide-gray-700 bg-ds-surface">
                      {day.entries.map((entry) => (
                        <div key={entry.id} className="px-4 py-3">
                          <p className="text-xs font-bold text-blue-600 mb-2">{entry.userName}</p>
                          <div className="grid grid-cols-1 gap-1.5">
                            <div className="flex gap-3">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5 w-24 shrink-0">{t('standup.form.labelYesterday')}</span>
                              <p className="text-sm text-gray-700 leading-snug min-w-0 break-words">{entry.yesterday}</p>
                            </div>
                            <div className="flex gap-3">
                              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mt-0.5 w-24 shrink-0">{t('standup.form.labelToday')}</span>
                              <p className="text-sm text-gray-700 leading-snug min-w-0 break-words">{entry.today}</p>
                            </div>
                            {/* DSV-009: blockers row uses the same w-24 label
                                column as Yesterday/Today so the layout stays
                                consistent and the icon + uppercase label fits
                                without overflowing into the description. */}
                            {entry.blockers && (
                              <div className="flex gap-3">
                                <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider mt-0.5 w-24 shrink-0 inline-flex items-center gap-1 whitespace-nowrap">
                                  <AlertCircle size={11} className="shrink-0" />
                                  <span>{t('standup.form.labelBlockers')}</span>
                                </span>
                                <p className="text-sm text-red-700 leading-snug min-w-0 break-words">{entry.blockers}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Team Standups tab — visible only with STANDUP_TEAM_VIEW perm ── */}
        {tab === 'team' && canSeeTeamStandups && (
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-indigo-700">
              <UsersIcon size={14} className="mt-0.5 flex-shrink-0" />
              <span>
                {t('standup.teamViewInfo')}
              </span>
            </div>

            {/* Filter card — date presets + custom range + user + project +
                Clear button. Mirrors the Time Tracking filter pattern so the
                UX is consistent across the app. */}
            <Card>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {[
                  { key: 'today',     label: t('common.today') },
                  { key: 'yesterday', label: t('common.yesterday') },
                  { key: 'week',      label: t('common.thisWeek') },
                  { key: 'all',       label: t('common.all') },
                ].map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => applyTeamDatePreset(p.key as 'today' | 'yesterday' | 'week' | 'all')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                      teamActivePreset === p.key
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-ds-surface text-ds-text border-ds-border hover:bg-ds-surface-hover'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                {teamActivePreset === 'custom' && (
                  <span className="px-3 py-1.5 text-xs font-medium rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {t('eod.customPreset')}
                  </span>
                )}
                {teamHasFilter && (
                  <button
                    type="button"
                    onClick={clearTeamFilters}
                    className="ml-auto px-3 py-1.5 text-xs font-medium rounded-full border border-red-200 text-red-600 bg-ds-surface hover:bg-red-50 transition-colors"
                    title={t('common.reset')}
                  >
                    {t('common.clear')}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="form-label">{t('leave.from')}</label>
                  <input
                    type="date"
                    className="form-input"
                    value={teamDateFrom}
                    onChange={(e) => setTeamDateFrom(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">{t('leave.to')}</label>
                  <input
                    type="date"
                    className="form-input"
                    value={teamDateTo}
                    onChange={(e) => setTeamDateTo(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">{t('common.filter')}</label>
                  <select
                    className="form-select"
                    value={teamProjectId}
                    onChange={(e) => setTeamProjectId(e.target.value)}
                  >
                    <option value="">{t('standup.selectProject')}</option>
                    {(viewProjects as Array<{ id: string; name: string }>).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">{t('admin.users.title')}</label>
                  <select
                    className="form-select"
                    value={teamUserId}
                    onChange={(e) => setTeamUserId(e.target.value)}
                  >
                    <option value="">{t('eod.allUsers')}</option>
                    {teamUserOptions.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </Card>

            {teamLoading ? (
              <PageLoader />
            ) : (teamStandups as StandupEntry[]).length === 0 ? (
              <EmptyState
                title={t('standup.noTeamRange')}
                description={t('standup.noTeamRangeDesc')}
              />
            ) : (
              <div className="space-y-3">
                {(teamStandups as StandupEntry[]).map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-ds-surface px-4 py-4 shadow-sm hover:shadow-md transition-shadow">
                    {/* Header — avatar + name + project + date */}
                    <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        <UserAvatar
                          name={entry.userName || t('standup.teamMember')}
                          avatarUrl={entry.userAvatarUrl}
                          size="md"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {entry.userName || t('standup.teamMember')}
                          </p>
                          {entry.projectName && (
                            <span className="inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 truncate max-w-[200px]">
                              {entry.projectName}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap pt-1">
                        {entry.date ? format(new Date(entry.date + 'T00:00:00'), 'd MMM yyyy') : ''}
                      </span>
                    </div>
                    {/* Body — yesterday / today / blockers. All three labels
                        share w-24 so the bodies line up vertically and the
                        Blockers label (icon + uppercase tracking) fits without
                        overlapping its description. */}
                    <div className="grid grid-cols-1 gap-1.5">
                      <div className="flex gap-3">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5 w-24 shrink-0">{t('standup.form.labelYesterday')}</span>
                        <p className="text-sm text-gray-700 leading-snug min-w-0 break-words">{entry.yesterday}</p>
                      </div>
                      <div className="flex gap-3">
                        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mt-0.5 w-24 shrink-0">{t('standup.form.labelToday')}</span>
                        <p className="text-sm text-gray-700 leading-snug min-w-0 break-words">{entry.today}</p>
                      </div>
                      {entry.blockers && (
                        <div className="flex gap-3">
                          <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider mt-0.5 w-24 shrink-0 inline-flex items-center gap-1 whitespace-nowrap">
                            <AlertCircle size={11} className="shrink-0" />
                            <span>{t('standup.form.labelBlockers')}</span>
                          </span>
                          <p className="text-sm text-red-700 leading-snug min-w-0 break-words">{entry.blockers}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination footer — server-driven. Always rendered when there's
                at least one entry so users see the count and rows selector;
                page-nav buttons only appear when there's more than one page. */}
            {(teamStandups as StandupEntry[]).length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border border-ds-border rounded-xl bg-ds-surface-hover">
                <div className="flex items-center gap-4 text-xs text-ds-text-muted">
                  <span>
                    {t('standup.showingRange', { from: ((teamPage - 1) * teamPageSize) + 1, to: Math.min(teamPage * teamPageSize, teamTotal), total: teamTotal })}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <label htmlFor="team-page-size" className="text-ds-text-muted">{t('standup.rowsPerPage')}</label>
                    <select
                      id="team-page-size"
                      value={teamPageSize}
                      onChange={(e) => setTeamPageSize(parseInt(e.target.value, 10) || 5)}
                      className="text-xs border border-ds-border rounded px-1.5 py-0.5 bg-ds-surface text-ds-text"
                    >
                      <option value={3}>3</option>
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    disabled={teamPage === 1}
                    onClick={() => setTeamPage(1)}
                    className="px-2 py-1 text-xs border border-ds-border rounded hover:bg-ds-surface disabled:opacity-40 disabled:cursor-not-allowed"
                    title={t('common.previous')}
                  >«</button>
                  <button
                    disabled={teamPage === 1}
                    onClick={() => setTeamPage((p) => Math.max(1, p - 1))}
                    className="px-2 py-1 text-xs border border-ds-border rounded hover:bg-ds-surface disabled:opacity-40 disabled:cursor-not-allowed"
                    title={t('common.previous')}
                  >←</button>
                  {Array.from({ length: teamTotalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === teamTotalPages || Math.abs(p - teamPage) <= 1)
                    .reduce<(number | '...')[]>((acc, p, i, arr) => {
                      if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('...');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === '...' ? (
                        <span key={`team-ellipsis-${i}`} className="px-1 text-ds-text-muted text-xs">…</span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setTeamPage(p as number)}
                          className={`min-w-[28px] px-2 py-1 text-xs border rounded ${
                            teamPage === p
                              ? 'bg-indigo-600 text-white border-indigo-600 font-semibold'
                              : 'border-ds-border hover:bg-ds-surface'
                          }`}
                        >{p}</button>
                      )
                    )}
                  <button
                    disabled={teamPage >= teamTotalPages}
                    onClick={() => setTeamPage((p) => Math.min(teamTotalPages, p + 1))}
                    className="px-2 py-1 text-xs border border-ds-border rounded hover:bg-ds-surface disabled:opacity-40 disabled:cursor-not-allowed"
                    title={t('common.next')}
                  >→</button>
                  <button
                    disabled={teamPage >= teamTotalPages}
                    onClick={() => setTeamPage(teamTotalPages)}
                    className="px-2 py-1 text-xs border border-ds-border rounded hover:bg-ds-surface disabled:opacity-40 disabled:cursor-not-allowed"
                    title={t('common.next')}
                  >»</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default StandupPage;
