import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/Spinner';
import VoiceRecorder from '../components/voice/VoiceRecorder';
import VoiceAiInsights from '../components/voice/VoiceAiInsights';
import { useProjects, useMyProjects } from '../hooks/useProjects';
import { useTeamPeers } from '../hooks/useTeams';
import { useSubmitEod, useUpdateEod, useEodRollup, useEod, useEodPaged } from '../hooks/useEod';
import { useProcessVoice, type EodVoiceResult } from '../hooks/useVoiceAI';
import { format, subDays, startOfWeek, endOfWeek } from 'date-fns';
import {
  CheckCircle, Sparkles, History, Pencil, X,
  FolderOpen, ChevronDown, ChevronRight, TrendingUp,
  Users as UsersIcon, Globe, User,
} from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission, PERMISSIONS } from '../utils/permissions';
import UserAvatar from '../components/ui/UserAvatar';

interface EodForm {
  project_id: string;
  date: string;
  accomplishments: string;
  planned_tomorrow: string;
  blockers: string;
  progress_percentage: number;
  mood: string;
}

interface EodEntry {
  id: string;
  date: string;
  projectId?: string;
  projectName?: string;
  accomplishments: string;
  plannedTomorrow?: string;
  blockers?: string;
  progressPercentage: number;
  mood: string;
  submittedAt?: string;
}

const MOOD_OPTIONS = [
  { value: 'GREEN',  label: '😊 Good',  color: 'text-green-600' },
  { value: 'YELLOW', label: '😐 Okay',  color: 'text-yellow-600' },
  { value: 'RED',    label: '😔 Tough', color: 'text-red-600' },
];

const AiBadge = () => (
  <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-medium">
    <Sparkles size={10} /> AI
  </span>
);

const moodEmoji = (mood: string) =>
  mood === 'GREEN' ? '😊' : mood === 'YELLOW' ? '😐' : '😔';

const progressColor = (pct: number) =>
  pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-400';

// ─── Project color palette ────────────────────────────────────────────────────

const PROJECT_COLORS = [
  'bg-indigo-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-orange-500', 'bg-teal-500',
];

// ─── Per-project grouped section ─────────────────────────────────────────────

const ProjectSection = ({
  projectName,
  entries,
  onEdit,
  color,
}: {
  projectName: string;
  entries: EodEntry[];
  onEdit: (entry: EodEntry) => void;
  color: string;
}) => {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${color}`} />
        <FolderOpen size={14} className="text-gray-500 shrink-0" />
        <span className="text-sm font-semibold text-gray-800 flex-1">{projectName}</span>
        <span className="text-xs text-gray-400 font-medium mr-2">
          {entries.length} EOD{entries.length !== 1 ? 's' : ''}
        </span>
        {collapsed ? <ChevronRight size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>

      {!collapsed && (
        <div className="divide-y divide-gray-100">
          {entries.map((entry) => {
            const pct = entry.progressPercentage ?? 0;
            return (
              <div key={entry.id} className="px-4 py-3 bg-ds-surface group">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Date + mood + progress */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs font-semibold text-gray-700">
                        {format(new Date(entry.date + 'T00:00:00'), 'd MMM yyyy')}
                      </span>
                      <span className="text-base leading-none">{moodEmoji(entry.mood)}</span>
                      <div className="flex items-center gap-1.5">
                        <div className="w-20 bg-gray-200 dark:bg-gray-600/50 rounded-full h-1.5">
                          <div className={`${progressColor(pct)} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 font-medium">{pct}%</span>
                      </div>
                      {entry.submittedAt && (
                        <span className="text-xs text-gray-400">· {format(new Date(entry.submittedAt), 'h:mm a')}</span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-1.5">
                      <div className="flex gap-2">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5 w-20 shrink-0">{t('eod.form.accomplished')}</span>
                        <p className="text-sm text-gray-700 leading-snug">{entry.accomplishments}</p>
                      </div>
                      {entry.plannedTomorrow && (
                        <div className="flex gap-2">
                          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mt-0.5 w-20 shrink-0">{t('eod.form.planned')}</span>
                          <p className="text-sm text-gray-700 leading-snug">{entry.plannedTomorrow}</p>
                        </div>
                      )}
                      {entry.blockers && (
                        <div className="flex gap-2">
                          <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider mt-0.5 w-20 shrink-0">{t('eod.form.blockers')}</span>
                          <p className="text-sm text-red-700 leading-snug">{entry.blockers}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onEdit(entry)}
                    title={t('common.edit')}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 shrink-0"
                  >
                    <Pencil size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const EodPage = () => {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const preselectedProject = searchParams.get('projectId') || '';

  const [tab, setTab] = useState<'submit' | 'rollup' | 'mine' | 'team'>('submit');
  const [rollupProjectId, setRollupProjectId] = useState(preselectedProject);
  const [success, setSuccess] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [aiResult, setAiResult] = useState<EodVoiceResult | null>(null);
  const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set());

  // Compute "today" up front so state initializers below can reference it.
  const today = format(new Date(), 'yyyy-MM-dd');
  // 7-day backdate window: EODs can be entered for today or up to 7 days
  // back. Future dates are never allowed.
  const minDate = format(subDays(new Date(), 7), 'yyyy-MM-dd');

  // DSV-024: default the My Submissions date filter to today so the date
  // picker matches what the list is showing (was '' which meant "all dates"
  // but the picker stayed empty, confusing users into thinking the filter
  // was broken).
  const [eodDateFilter, setEodDateFilter] = useState(today);
  const [editingEntry, setEditingEntry] = useState<EodEntry | null>(null);
  const { data: allOrgProjects = [], isLoading: projectsLoading } = useProjects();
  const { data: myProjects = [] } = useMyProjects();
  const submitEod = useSubmitEod();
  const updateEod = useUpdateEod();
  const { data: myEods = [], isLoading: myLoading } = useEod();
  const { user: authUser } = useAuth();
  const canSeeTeamEods = hasPermission(authUser, PERMISSIONS.EOD_TEAM_VIEW)
    || hasPermission(authUser, PERMISSIONS.PROJECT_DATA_VIEW_ALL)
    || authUser?.role === 'TENANT_ADMIN' || authUser?.role === 'SUPER_ADMIN';
  const isOrgWideEods = (hasPermission(authUser, PERMISSIONS.PROJECT_DATA_VIEW_ALL)
    || authUser?.role === 'TENANT_ADMIN' || authUser?.role === 'SUPER_ADMIN')
    && !hasPermission(authUser, PERMISSIONS.EOD_TEAM_VIEW);
  const canViewOrgData = authUser?.role === 'TENANT_ADMIN' || authUser?.role === 'SUPER_ADMIN'
    || hasPermission(authUser, PERMISSIONS.PROJECT_DATA_VIEW_ALL);
  const [viewMode, setViewMode] = useState<'mine' | 'org'>('mine');
  const submitProjects = myProjects.length > 0 ? myProjects : allOrgProjects;
  const viewProjects = (canViewOrgData && viewMode === 'org') ? allOrgProjects : submitProjects;

  // Team EOD filter + pagination state — mirrors the Team Standups tab so
  // managers get the same UX across both views. Defaults to "Today" so the
  // tab loads useful data on first open.
  const [teamDateFrom, setTeamDateFrom]   = useState<string>(today);
  const [teamDateTo,   setTeamDateTo]     = useState<string>(today);
  const [teamUserId,   setTeamUserId]     = useState<string>('');
  const [teamProjectId, setTeamProjectId] = useState<string>('');
  const [teamPage,     setTeamPage]       = useState(1);
  const [teamPageSize, setTeamPageSize]   = useState(5);

  // Reset to page 1 whenever any team-tab filter changes
  useEffect(() => { setTeamPage(1); },
    [teamDateFrom, teamDateTo, teamUserId, teamProjectId, teamPageSize]);

  const teamParams = React.useMemo<Record<string, string>>(() => {
    const p: Record<string, string> = { scope: 'team' };
    if (teamDateFrom)  p.startDate  = teamDateFrom;
    if (teamDateTo)    p.endDate    = teamDateTo;
    if (teamUserId)    p.userId     = teamUserId;
    if (teamProjectId) p.projectId  = teamProjectId;
    p.page     = String(teamPage);
    p.pageSize = String(teamPageSize);
    return p;
  }, [teamDateFrom, teamDateTo, teamUserId, teamProjectId, teamPage, teamPageSize]);

  // Team-view fetch — only fires when the Team EOD tab is opened AND the
  // user has EOD_TEAM_VIEW. Uses the paginated hook so the response includes
  // { data, pagination } and we can render proper page controls.
  const { data: teamResult, isLoading: teamLoading } = useEodPaged(
    teamParams,
    { enabled: tab === 'team' && canSeeTeamEods }
  );
  const teamEods       = React.useMemo(() => teamResult?.data ?? [], [teamResult?.data]);
  const teamPagination = teamResult?.pagination ?? null;
  const teamTotal      = teamPagination?.total ?? teamEods.length;
  const teamTotalPages = Math.max(1, teamPagination?.totalPages ?? Math.ceil(teamEods.length / teamPageSize));

  // User-filter roster — sourced from `/api/teams/peers` so the dropdown
  // lists every person the caller can see (team members + leads, or the
  // whole tenant for org-wide callers), not just users who happen to have
  // an entry on the visible page.
  const { data: teamPeers = [] } = useTeamPeers(tab === 'team' && canSeeTeamEods);
  const teamUserOptions = React.useMemo(() => {
    if (teamPeers.length > 0) {
      return teamPeers
        .map((p) => ({ id: p.id, name: p.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    const seen = new Map<string, { id: string; name: string }>();
    (teamEods as Array<{ userId?: string; userName?: string }>).forEach((e) => {
      const id = String(e.userId || '');
      if (id && !seen.has(id)) seen.set(id, { id, name: e.userName || 'Team member' });
    });
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [teamPeers, teamEods]);

  const applyTeamDatePreset = (preset: 'today' | 'yesterday' | 'week' | 'all') => {
    const now = new Date();
    if (preset === 'all')       { setTeamDateFrom(''); setTeamDateTo(''); return; }
    if (preset === 'today')     { const d = format(now, 'yyyy-MM-dd'); setTeamDateFrom(d); setTeamDateTo(d); return; }
    if (preset === 'yesterday') { const d = format(subDays(now, 1), 'yyyy-MM-dd'); setTeamDateFrom(d); setTeamDateTo(d); return; }
    if (preset === 'week') {
      setTeamDateFrom(format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
      setTeamDateTo  (format(endOfWeek  (now, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
    }
  };
  const teamActivePreset = React.useMemo<'today' | 'yesterday' | 'week' | 'all' | 'custom'>(() => {
    const now = new Date();
    const t  = format(now, 'yyyy-MM-dd');
    const y  = format(subDays(now, 1), 'yyyy-MM-dd');
    const ws = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const we = format(endOfWeek  (now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    if (!teamDateFrom && !teamDateTo)            return 'all';
    if (teamDateFrom === t  && teamDateTo === t) return 'today';
    if (teamDateFrom === y  && teamDateTo === y) return 'yesterday';
    if (teamDateFrom === ws && teamDateTo === we) return 'week';
    return 'custom';
  }, [teamDateFrom, teamDateTo]);
  const teamHasFilter = Boolean(teamDateFrom || teamDateTo || teamUserId || teamProjectId);
  const clearTeamFilters = () => {
    setTeamDateFrom(today); setTeamDateTo(today);
    setTeamUserId(''); setTeamProjectId('');
  };

  const { data: rollupData, isLoading: rollupLoading } = useEodRollup({ projectId: rollupProjectId });
  const processVoice = useProcessVoice();

  const visibleEods = eodDateFilter
    ? (myEods as EodEntry[]).filter((e) => e.date === eodDateFilter)
    : (myEods as EodEntry[]);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<EodForm>({
    defaultValues: { project_id: preselectedProject, date: today, progress_percentage: 0, mood: 'GREEN' },
  });

  const progressValue = watch('progress_percentage', 0);
  const watchedProject = watch('project_id');

  // Group visible EODs by project
  const projectColorMap = new Map<string, string>();
  (submitProjects as any[]).forEach((p, i) => {
    projectColorMap.set(p.id, PROJECT_COLORS[i % PROJECT_COLORS.length]);
  });

  const byProject = new Map<string, { name: string; color: string; entries: EodEntry[] }>();
  visibleEods.forEach((entry) => {
    const key = entry.projectId ?? '_none';
    const name = entry.projectName ?? 'Unknown Project';
    if (!byProject.has(key)) {
      byProject.set(key, { name, color: projectColorMap.get(entry.projectId ?? '') ?? 'bg-gray-400', entries: [] });
    }
    byProject.get(key)!.entries.push(entry);
  });
  const projectGroups = Array.from(byProject.values());

  const startEdit = (entry: EodEntry) => {
    setEditingEntry(entry);
    setValue('project_id', entry.projectId ?? '');
    setValue('date', entry.date);
    setValue('accomplishments', entry.accomplishments);
    setValue('planned_tomorrow', entry.plannedTomorrow ?? '');
    setValue('blockers', entry.blockers ?? '');
    setValue('progress_percentage', entry.progressPercentage ?? 0);
    setValue('mood', entry.mood ?? 'GREEN');
    setAiResult(null);
    setAiFilledFields(new Set());
    setSuccess('');
    setSubmitError('');
    setTab('submit');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingEntry(null);
    reset({ project_id: preselectedProject, date: today, progress_percentage: 0, mood: 'GREEN' });
    setAiResult(null);
    setAiFilledFields(new Set());
  };

  const handleVoiceProcess = async (transcript: string) => {
    try {
      const result = await processVoice.mutateAsync({
        transcript,
        type: 'eod',
        projectId: watchedProject || undefined,
      });
      const data: EodVoiceResult = result.data;
      setAiResult(data);
      const filled = new Set<string>();
      if (data.accomplishments)   { setValue('accomplishments', data.accomplishments, { shouldDirty: true });       filled.add('accomplishments'); }
      if (data.plan_for_tomorrow) { setValue('planned_tomorrow', data.plan_for_tomorrow, { shouldDirty: true });   filled.add('planned_tomorrow'); }
      if (data.blockers)          { setValue('blockers', data.blockers, { shouldDirty: true });                    filled.add('blockers'); }
      if (data.mood)              { setValue('mood', data.mood, { shouldDirty: true });                            filled.add('mood'); }
      const score = data.insights?.productivityScore;
      if (score !== undefined) {
        setValue('progress_percentage', Math.round(score / 5) * 5, { shouldDirty: true });
        filled.add('progress_percentage');
      }
      setAiFilledFields(filled);
    } catch { /* shown via processVoice.isError */ }
  };

  const onSubmit = async (data: EodForm) => {
    try {
      setSubmitError('');
      if (editingEntry) {
        await updateEod.mutateAsync({
          id: editingEntry.id,
          data: {
            accomplishments:    data.accomplishments,
            planned_tomorrow:   data.planned_tomorrow,
            blockers:           data.blockers,
            progress_percentage: Number(data.progress_percentage),
            mood:               data.mood,
          },
        });
        setSuccess(t('common.updateSuccess'));
        setEditingEntry(null);
      } else {
        await submitEod.mutateAsync({ ...data, progress_percentage: Number(data.progress_percentage) });
        setSuccess(t('eod.submittedFor', { date: format(new Date(data.date), 'd MMM yyyy') }));
      }
      // DSV-022: explicitly reset textareas to '' so they actually clear in
      // the UI (passing undefined leaves stale text on some browsers).
      reset({
        project_id: data.project_id,
        date: today,
        progress_percentage: 0,
        mood: 'GREEN',
        accomplishments: '',
        planned_tomorrow: '',
        blockers: '',
      });
      setAiResult(null);
      setAiFilledFields(new Set());
      // DSV-021: scroll up so the success message at the top is visible.
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      setSubmitError((err as Error).message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Auto-hide the success banner after 4s so it doesn't sit forever.
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(''), 4000);
    return () => clearTimeout(t);
  }, [success]);

  if (projectsLoading) return <Layout><PageLoader /></Layout>;

  const eodProjects = submitProjects as any[];

  return (
    <Layout>
      <Header
        title={t('nav.eod')}
        subtitle={t('eod.title')}
        actions={canViewOrgData ? (
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setViewMode('mine')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${viewMode === 'mine' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}><User size={11} /> My Projects</button>
            <button onClick={() => setViewMode('org')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${viewMode === 'org' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}><Globe size={11} /> All Org</button>
          </div>
        ) : undefined}
      />
      <div className="p-6 space-y-5">

        {/* Tabs — Team EOD only visible to users with EOD_TEAM_VIEW */}
        <div className="flex gap-2 border-b border-gray-200">
          {(['submit', 'rollup', 'mine', ...(canSeeTeamEods ? ['team'] as const : [])] as const).map((tabKey) => (
            <button key={tabKey} onClick={() => setTab(tabKey)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === tabKey ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {tabKey === 'submit'
                ? editingEntry ? (
                    <span className="flex items-center gap-1.5 text-amber-600">
                      <Pencil size={13} /> {t('eod.update')}
                    </span>
                  ) : t('eod.submit')
                : tabKey === 'rollup' ? t('standup.rollupTitle')
                : tabKey === 'mine' ? (
                  <span className="flex items-center gap-1.5">
                    <History size={14} />
                    {t('eod.tabs.myToday')}
                    {myEods.length > 0 && (
                      <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
                        {myEods.length}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <UsersIcon size={14} />
                    {isOrgWideEods ? 'Org EODs' : t('eod.tabs.teamToday')}
                    {teamEods.length > 0 && (
                      <span className="bg-violet-100 text-violet-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
                        {teamEods.length}
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
                    <p className="text-sm font-semibold text-amber-800">{t('eod.update')}</p>
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

            {success && <Alert type="success" message={success} className="mb-0" />}
            {submitError && <Alert type="error" message={submitError} className="mb-0" />}
            {processVoice.isError && (
              <Alert type="error" message={`AI processing failed: ${(processVoice.error as Error)?.message}`} className="mb-0" />
            )}

            <Card>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                {/* Project + Date */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">{t('eod.form.project')}</label>
                    {editingEntry ? (
                      <div className="form-input bg-gray-50 text-gray-600 cursor-not-allowed">
                        {editingEntry.projectName ?? t('common.na')}
                      </div>
                    ) : (
                      <select className="form-select" {...register('project_id', { required: t('validation.required') })}>
                        <option value="">{t('common.searchPlaceholder')}</option>
                        {eodProjects.map((p: { id: string; name: string }) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    )}
                    {errors.project_id && <p className="form-error">{errors.project_id.message}</p>}
                  </div>
                  <div>
                    <label className="form-label">{t('eod.form.date')}</label>
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
                        {t('eod.form.backdateHint')}
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

                {/* Accomplishments */}
                <div>
                  <label className="form-label">
                    {t('eod.form.accomplished')}
                    {aiFilledFields.has('accomplishments') && <AiBadge />}
                  </label>
                  <textarea className="form-textarea" rows={4}
                    placeholder={t('eod.form.accomplishedPlaceholder')}
                    {...register('accomplishments', { required: t('validation.required') })} />
                  {errors.accomplishments && <p className="form-error">{errors.accomplishments.message}</p>}
                </div>

                {/* Planned tomorrow */}
                <div>
                  <label className="form-label">
                    {t('eod.form.planned')}
                    {aiFilledFields.has('planned_tomorrow') && <AiBadge />}
                  </label>
                  <textarea className="form-textarea" rows={3}
                    placeholder={t('eod.form.plannedPlaceholder')}
                    {...register('planned_tomorrow')} />
                </div>

                {/* Blockers */}
                <div>
                  <label className="form-label">
                    {t('eod.form.blockers')}
                    {aiFilledFields.has('blockers') && <AiBadge />}
                  </label>
                  <textarea className="form-textarea" rows={2}
                    placeholder={t('eod.form.blockersPlaceholder')}
                    {...register('blockers')} />
                </div>

                {/* Progress */}
                <div>
                  <label className="form-label">
                    {t('eod.form.progressLabel', { pct: progressValue })}
                    {aiFilledFields.has('progress_percentage') && <AiBadge />}
                  </label>
                  <input type="range" min={0} max={100} step={5}
                    className="w-full accent-indigo-600"
                    {...register('progress_percentage')} />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>0%</span><span>50%</span><span>100%</span>
                  </div>
                </div>

                {/* Mood */}
                <div>
                  <label className="form-label">
                    {t('eod.form.mood')}
                    {aiFilledFields.has('mood') && <AiBadge />}
                  </label>
                  <div className="flex gap-3 flex-wrap">
                    {MOOD_OPTIONS.map((m) => (
                      <label key={m.value} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" value={m.value} {...register('mood')} className="sr-only" />
                        <span className={`text-sm font-medium ${m.color} px-3 py-1.5 rounded-lg border-2 transition-colors ${
                          watch('mood') === m.value ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200'
                        }`}>{m.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Button type="submit" loading={isSubmitting}
                    icon={editingEntry ? <Pencil size={15} /> : <CheckCircle size={16} />}>
                    {editingEntry ? t('eod.update') : t('eod.submit')}
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
            {/* Date filter */}
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="form-input max-w-[180px]"
                value={eodDateFilter}
                onChange={(e) => setEodDateFilter(e.target.value)}
              />
              {eodDateFilter && (
                <button type="button" onClick={() => setEodDateFilter('')}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors">
                  <X size={12} /> {t('common.clear')}
                </button>
              )}
            </div>

            {/* Summary pill */}
            <div className="flex items-center gap-3 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
              <History size={18} className="text-indigo-600 shrink-0" />
              <p className="text-sm font-medium text-indigo-800">
                {myLoading ? t('common.loading')
                  : eodDateFilter
                    ? `${visibleEods.length} EOD${visibleEods.length !== 1 ? 's' : ''} on ${format(new Date(eodDateFilter + 'T00:00:00'), 'd MMM yyyy')}`
                    : `${myEods.length} EOD${myEods.length !== 1 ? 's' : ''} across ${byProject.size} project${byProject.size !== 1 ? 's' : ''}`}
              </p>
            </div>

            {/* Hover-tip */}
            {!myLoading && myEods.length > 0 && (
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <Pencil size={10} /> {t('eod.hoverToEdit')}
              </p>
            )}

            {myLoading ? <PageLoader /> : visibleEods.length === 0 ? (
              <EmptyState
                title={eodDateFilter ? t('eod.noEodsDate') : t('eod.noEodsAll')}
                description={eodDateFilter ? t('eod.noEodsDateDesc') : t('eod.noEodsAllDesc')}
              />
            ) : (
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
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-ds-surface text-gray-600 border-gray-200 dark:border-gray-600 hover:border-indigo-300 hover:text-indigo-600'
                  }`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${rollupProjectId === p.id ? 'bg-white/80 dark:bg-white/60' : PROJECT_COLORS[i % PROJECT_COLORS.length]}`} />
                  {p.name}
                </button>
              ))}
            </div>

            {rollupLoading ? <PageLoader /> : !rollupProjectId ? (
              <EmptyState title={t('eod.selectProject')} description={t('eod.selectProjectDesc')} />
            ) : rollupData?.rollup?.length === 0 ? (
              <EmptyState title={t('eod.noEntries')} description={t('eod.noEodsRangeDesc')} />
            ) : (
              <div className="space-y-4">
                {rollupData?.rollup?.map((day: {
                  date: string; entryCount: number; avgProgress: number; entries: Array<{
                    id: string; userName: string; accomplishments: string;
                    plannedTomorrow?: string; blockers?: string; progressPercentage: number; mood: string;
                  }>;
                }) => (
                  <div key={day.date} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    {/* Day header */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-900/30 dark:to-violet-900/30 border-b border-gray-200 dark:border-gray-700">
                      <h3 className="text-sm font-semibold text-gray-900">
                        {format(new Date(day.date + 'T00:00:00'), 'EEEE, d MMMM yyyy')}
                      </h3>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                          <TrendingUp size={12} className="text-indigo-400" />
                          {t('eod.avgProgress')} <strong className="text-gray-700">{day.avgProgress}%</strong>
                        </div>
                        <span className="text-xs text-gray-500 bg-white dark:bg-gray-700/60 dark:text-gray-300 px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-600">
                          {day.entryCount} update{day.entryCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>

                    {/* Entries */}
                    <div className="divide-y divide-gray-100 dark:divide-gray-700 bg-ds-surface">
                      {day.entries.map((entry) => {
                        const pct = entry.progressPercentage ?? 0;
                        return (
                          <div key={entry.id} className="px-4 py-3">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-bold text-indigo-600">{entry.userName}</p>
                              <div className="flex items-center gap-2">
                                <span className="text-base leading-none">{moodEmoji(entry.mood)}</span>
                                <div className="flex items-center gap-1.5">
                                  <div className="w-16 bg-gray-200 rounded-full h-1.5">
                                    <div className={`${progressColor(pct)} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="text-xs text-gray-500">{pct}%</span>
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 gap-1.5">
                              <div className="flex gap-2">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5 w-20 shrink-0">{t('eod.form.accomplished')}</span>
                                <p className="text-sm text-gray-700 leading-snug">{entry.accomplishments}</p>
                              </div>
                              {entry.plannedTomorrow && (
                                <div className="flex gap-2">
                                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mt-0.5 w-20 shrink-0">{t('eod.form.planned')}</span>
                                  <p className="text-sm text-gray-700 leading-snug">{entry.plannedTomorrow}</p>
                                </div>
                              )}
                              {entry.blockers && (
                                <div className="flex gap-2">
                                  <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider mt-0.5 w-20 shrink-0">{t('eod.form.blockers')}</span>
                                  <p className="text-sm text-red-700 leading-snug">{entry.blockers}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Team EOD tab — visible only with EOD_TEAM_VIEW perm ── */}
        {tab === 'team' && canSeeTeamEods && (
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 p-3 bg-violet-50 border border-violet-100 rounded-xl text-xs text-violet-700">
              <UsersIcon size={14} className="mt-0.5 flex-shrink-0" />
              <span>
                {t('eod.teamViewInfo')}
              </span>
            </div>

            {/* Filter card — date presets + custom range + project + user +
                Clear button. Mirrors the Team Standups tab so the UX is
                consistent across both team views. */}
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
                    <option value="">{t('eod.allProjects')}</option>
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
            ) : (teamEods as EodEntry[]).length === 0 ? (
              <EmptyState
                title={t('eod.noEntries')}
                description={t('common.noResults')}
              />
            ) : (
              <div className="space-y-3">
                {(teamEods as EodEntry[]).map((entry: any) => (
                  <div key={entry.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-ds-surface px-4 py-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        <UserAvatar
                          name={entry.userName || t('eod.teamMember')}
                          avatarUrl={entry.userAvatarUrl}
                          size="md"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {entry.userName || t('eod.teamMember')}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {entry.projectName && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-100 truncate max-w-[200px]">
                                {entry.projectName}
                              </span>
                            )}
                            {typeof entry.progressPercentage === 'number' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                                {t('eod.donePct', { pct: entry.progressPercentage })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap pt-1">
                        {entry.date ? format(new Date(entry.date + 'T00:00:00'), 'd MMM yyyy') : ''}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                      {entry.accomplishments && (
                        <div className="flex gap-2">
                          <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mt-0.5 w-24 shrink-0">{t('eod.form.accomplished')}</span>
                          <p className="text-sm text-gray-700 leading-snug">{entry.accomplishments}</p>
                        </div>
                      )}
                      {entry.plannedTomorrow && (
                        <div className="flex gap-2">
                          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mt-0.5 w-24 shrink-0">{t('eod.form.planned')}</span>
                          <p className="text-sm text-gray-700 leading-snug">{entry.plannedTomorrow}</p>
                        </div>
                      )}
                      {entry.blockers && (
                        <div className="flex gap-2">
                          <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider mt-0.5 w-24 shrink-0">{t('eod.form.blockers')}</span>
                          <p className="text-sm text-red-700 leading-snug">{entry.blockers}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination footer — server-driven. Mirrors Team Standups. */}
            {(teamEods as EodEntry[]).length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border border-ds-border rounded-xl bg-ds-surface-hover">
                <div className="flex items-center gap-4 text-xs text-ds-text-muted">
                  <span>
                    {t('eod.showingRange', { from: ((teamPage - 1) * teamPageSize) + 1, to: Math.min(teamPage * teamPageSize, teamTotal), total: teamTotal })}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <label htmlFor="team-eod-page-size" className="text-ds-text-muted">{t('eod.rowsPerPage')}</label>
                    <select
                      id="team-eod-page-size"
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
                        <span key={`team-eod-ellipsis-${i}`} className="px-1 text-ds-text-muted text-xs">…</span>
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

export default EodPage;
