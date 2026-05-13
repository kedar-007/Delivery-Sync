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
import { useProjects } from '../hooks/useProjects';
import { useSubmitEod, useUpdateEod, useEodRollup, useEod } from '../hooks/useEod';
import { useProcessVoice, type EodVoiceResult } from '../hooks/useVoiceAI';
import { format, subDays } from 'date-fns';
import {
  CheckCircle, Sparkles, History, Pencil, X,
  FolderOpen, ChevronDown, ChevronRight, TrendingUp,
  Users as UsersIcon,
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
              <div key={entry.id} className="px-4 py-3 bg-white group">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Date + mood + progress */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs font-semibold text-gray-700">
                        {format(new Date(entry.date + 'T00:00:00'), 'd MMM yyyy')}
                      </span>
                      <span className="text-base leading-none">{moodEmoji(entry.mood)}</span>
                      <div className="flex items-center gap-1.5">
                        <div className="w-20 bg-gray-200 rounded-full h-1.5">
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
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5 w-20 shrink-0">Done</span>
                        <p className="text-sm text-gray-700 leading-snug">{entry.accomplishments}</p>
                      </div>
                      {entry.plannedTomorrow && (
                        <div className="flex gap-2">
                          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mt-0.5 w-20 shrink-0">Tomorrow</span>
                          <p className="text-sm text-gray-700 leading-snug">{entry.plannedTomorrow}</p>
                        </div>
                      )}
                      {entry.blockers && (
                        <div className="flex gap-2">
                          <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider mt-0.5 w-20 shrink-0">Blockers</span>
                          <p className="text-sm text-red-700 leading-snug">{entry.blockers}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onEdit(entry)}
                    title="Edit this EOD"
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
  const { data: projects = [], isLoading: projectsLoading } = useProjects();
  const submitEod = useSubmitEod();
  const updateEod = useUpdateEod();
  const { data: myEods = [], isLoading: myLoading } = useEod();
  const { user: authUser } = useAuth();
  const canSeeTeamEods = hasPermission(authUser, PERMISSIONS.EOD_TEAM_VIEW);
  // Team-view fetch — only fires when the Team EOD tab is opened AND the
  // user has EOD_TEAM_VIEW. Passes scope=team so the backend expands the
  // query from "own only" to "all team peers".
  const { data: teamEods = [], isLoading: teamLoading } = useEod(
    { scope: 'team' },
    { enabled: tab === 'team' && canSeeTeamEods }
  );
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
  (projects as any[]).forEach((p, i) => {
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
        setSuccess('EOD updated successfully');
        setEditingEntry(null);
      } else {
        await submitEod.mutateAsync({ ...data, progress_percentage: Number(data.progress_percentage) });
        setSuccess(`EOD submitted for ${format(new Date(data.date), 'd MMM yyyy')}`);
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

  const eodProjects = (projects as any[]).filter((p) => p.eodEnabled !== false);

  return (
    <Layout>
      <Header title={t('nav.eod')} subtitle="Daily EOD updates" />
      <div className="p-6 space-y-5">

        {/* Tabs — Team EOD only visible to users with EOD_TEAM_VIEW */}
        <div className="flex gap-2 border-b border-gray-200">
          {(['submit', 'rollup', 'mine', ...(canSeeTeamEods ? ['team'] as const : [])] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t === 'submit'
                ? editingEntry ? (
                    <span className="flex items-center gap-1.5 text-amber-600">
                      <Pencil size={13} /> Edit EOD
                    </span>
                  ) : 'Submit EOD'
                : t === 'rollup' ? 'EOD Rollup'
                : t === 'mine' ? (
                  <span className="flex items-center gap-1.5">
                    <History size={14} />
                    My Submissions
                    {myEods.length > 0 && (
                      <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
                        {myEods.length}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <UsersIcon size={14} />
                    Team EOD
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
                    <p className="text-sm font-semibold text-amber-800">Editing EOD</p>
                    <p className="text-xs text-amber-600">
                      {editingEntry.projectName} · {format(new Date(editingEntry.date + 'T00:00:00'), 'd MMM yyyy')}
                    </p>
                  </div>
                </div>
                <button type="button" onClick={cancelEdit}
                  className="text-xs text-amber-600 hover:text-amber-800 flex items-center gap-1 px-2 py-1 rounded hover:bg-amber-100 transition-colors">
                  <X size={12} /> Cancel
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
                    <label className="form-label">Project *</label>
                    {editingEntry ? (
                      <div className="form-input bg-gray-50 text-gray-600 cursor-not-allowed">
                        {editingEntry.projectName ?? 'Unknown'}
                      </div>
                    ) : (
                      <select className="form-select" {...register('project_id', { required: 'Required' })}>
                        <option value="">Select project…</option>
                        {eodProjects.map((p: { id: string; name: string }) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    )}
                    {errors.project_id && <p className="form-error">{errors.project_id.message}</p>}
                  </div>
                  <div>
                    <label className="form-label">Date *</label>
                    <input
                      type="date"
                      className={`form-input ${editingEntry ? 'bg-gray-50 text-gray-600 cursor-not-allowed' : ''}`}
                      readOnly={!!editingEntry}
                      min={minDate}
                      max={today}
                      {...register('date', {
                        required: 'Date is required',
                        validate: (v) => {
                          if (!v) return 'Date is required';
                          if (v > today)    return "You can't submit an EOD for a future date.";
                          if (v < minDate)  return 'Backdated entries are allowed only within the past 7 days.';
                          return true;
                        },
                      })}
                    />
                    {errors.date && <p className="form-error">{(errors.date as any).message || 'Invalid date'}</p>}
                    {!editingEntry && (
                      <p className="text-[11px] text-gray-400 mt-1">
                        You can enter EODs for the past 7 days. Future dates are not allowed.
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
                    What did you accomplish today? *
                    {aiFilledFields.has('accomplishments') && <AiBadge />}
                  </label>
                  <textarea className="form-textarea" rows={4}
                    placeholder="Completed X feature, fixed Y bug, reviewed Z PR…"
                    {...register('accomplishments', { required: 'Required' })} />
                  {errors.accomplishments && <p className="form-error">{errors.accomplishments.message}</p>}
                </div>

                {/* Planned tomorrow */}
                <div>
                  <label className="form-label">
                    Planned for tomorrow?
                    {aiFilledFields.has('planned_tomorrow') && <AiBadge />}
                  </label>
                  <textarea className="form-textarea" rows={3}
                    placeholder="Continue with A, start B, meeting about C…"
                    {...register('planned_tomorrow')} />
                </div>

                {/* Blockers */}
                <div>
                  <label className="form-label">
                    Any blockers?
                    {aiFilledFields.has('blockers') && <AiBadge />}
                  </label>
                  <textarea className="form-textarea" rows={2}
                    placeholder="None / Waiting for X / Need access to Y…"
                    {...register('blockers')} />
                </div>

                {/* Progress */}
                <div>
                  <label className="form-label">
                    Overall Progress Today:{' '}
                    <strong className={`${progressValue >= 70 ? 'text-green-600' : progressValue >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                      {progressValue}%
                    </strong>
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
                    How was your day?
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
                    {editingEntry ? 'Update EOD' : 'Submit EOD'}
                  </Button>
                  {editingEntry && (
                    <Button type="button" variant="outline" onClick={cancelEdit}>Cancel</Button>
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
                  <X size={12} /> Clear
                </button>
              )}
            </div>

            {/* Summary pill */}
            <div className="flex items-center gap-3 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
              <History size={18} className="text-indigo-600 shrink-0" />
              <p className="text-sm font-medium text-indigo-800">
                {myLoading ? 'Loading…'
                  : eodDateFilter
                    ? `${visibleEods.length} EOD${visibleEods.length !== 1 ? 's' : ''} on ${format(new Date(eodDateFilter + 'T00:00:00'), 'd MMM yyyy')}`
                    : `${myEods.length} EOD${myEods.length !== 1 ? 's' : ''} across ${byProject.size} project${byProject.size !== 1 ? 's' : ''}`}
              </p>
            </div>

            {/* Hover-tip */}
            {!myLoading && myEods.length > 0 && (
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <Pencil size={10} /> Hover over an entry to edit it
              </p>
            )}

            {myLoading ? <PageLoader /> : visibleEods.length === 0 ? (
              <EmptyState
                title={eodDateFilter ? 'No EODs on this date' : 'No EODs yet'}
                description={eodDateFilter ? 'Try a different date.' : 'Your submitted EODs will appear here.'}
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
              {(projects as any[]).map((p: { id: string; name: string }, i: number) => (
                <button key={p.id} type="button"
                  onClick={() => setRollupProjectId(p.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                    rollupProjectId === p.id
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
                  }`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${rollupProjectId === p.id ? 'bg-white' : PROJECT_COLORS[i % PROJECT_COLORS.length]}`} />
                  {p.name}
                </button>
              ))}
            </div>

            {rollupLoading ? <PageLoader /> : !rollupProjectId ? (
              <EmptyState title="Select a project" description="Choose a project above to see the EOD rollup." />
            ) : rollupData?.rollup?.length === 0 ? (
              <EmptyState title="No EODs found" description="No EOD entries in the last 7 days." />
            ) : (
              <div className="space-y-4">
                {rollupData?.rollup?.map((day: {
                  date: string; entryCount: number; avgProgress: number; entries: Array<{
                    id: string; userName: string; accomplishments: string;
                    plannedTomorrow?: string; blockers?: string; progressPercentage: number; mood: string;
                  }>;
                }) => (
                  <div key={day.date} className="rounded-xl border border-gray-200 overflow-hidden">
                    {/* Day header */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-gray-200">
                      <h3 className="text-sm font-semibold text-gray-900">
                        {format(new Date(day.date + 'T00:00:00'), 'EEEE, d MMMM yyyy')}
                      </h3>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                          <TrendingUp size={12} className="text-indigo-400" />
                          Avg <strong className="text-gray-700">{day.avgProgress}%</strong>
                        </div>
                        <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded-full border border-gray-200">
                          {day.entryCount} update{day.entryCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>

                    {/* Entries */}
                    <div className="divide-y divide-gray-100 bg-white">
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
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5 w-20 shrink-0">Done</span>
                                <p className="text-sm text-gray-700 leading-snug">{entry.accomplishments}</p>
                              </div>
                              {entry.plannedTomorrow && (
                                <div className="flex gap-2">
                                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mt-0.5 w-20 shrink-0">Tomorrow</span>
                                  <p className="text-sm text-gray-700 leading-snug">{entry.plannedTomorrow}</p>
                                </div>
                              )}
                              {entry.blockers && (
                                <div className="flex gap-2">
                                  <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider mt-0.5 w-20 shrink-0">Blockers</span>
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
                Showing EOD submissions from members of teams you're in or lead. Use this to track end-of-day progress across your team.
              </span>
            </div>

            {teamLoading ? (
              <PageLoader />
            ) : (teamEods as EodEntry[]).length === 0 ? (
              <EmptyState
                title="No team EODs yet"
                description="Your team peers haven't submitted EODs in the visible window. They'll show up here as soon as they do."
              />
            ) : (
              <div className="space-y-3">
                {(teamEods as EodEntry[]).map((entry: any) => (
                  <div key={entry.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <UserAvatar name={entry.userName ?? entry.userId ?? '?'} size="xs" />
                        <span className="text-sm font-semibold text-gray-800 truncate">
                          {entry.userName ?? 'Team member'}
                        </span>
                        {entry.projectName && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-100 truncate max-w-[160px]">
                            {entry.projectName}
                          </span>
                        )}
                        {typeof entry.progress_percentage === 'number' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                            {entry.progress_percentage}% done
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">
                        {entry.date ? format(new Date(entry.date + 'T00:00:00'), 'd MMM yyyy') : ''}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                      {entry.accomplishments && (
                        <div className="flex gap-2">
                          <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mt-0.5 w-24 shrink-0">Accomplished</span>
                          <p className="text-sm text-gray-700 leading-snug">{entry.accomplishments}</p>
                        </div>
                      )}
                      {entry.planned_tomorrow && (
                        <div className="flex gap-2">
                          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mt-0.5 w-24 shrink-0">Tomorrow</span>
                          <p className="text-sm text-gray-700 leading-snug">{entry.planned_tomorrow}</p>
                        </div>
                      )}
                      {entry.blockers && (
                        <div className="flex gap-2">
                          <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider mt-0.5 w-24 shrink-0">Blockers</span>
                          <p className="text-sm text-red-700 leading-snug">{entry.blockers}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default EodPage;
