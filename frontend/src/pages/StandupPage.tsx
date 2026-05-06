import React, { useState } from 'react';
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
import {
  useSubmitStandup, useUpdateStandup,
  useStandupRollup, useMyTodayStandup,
  useStandups, useSearchStandups,
} from '../hooks/useStandups';
import { useProcessVoice, type StandupVoiceResult } from '../hooks/useVoiceAI';
import { format } from 'date-fns';
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
          {entries.length} update{entries.length !== 1 ? 's' : ''}
        </span>
        {collapsed ? <ChevronRight size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>

      {!collapsed && (
        <div className="divide-y divide-gray-100">
          {entries.map((entry) => (
            <div key={entry.id} className="px-4 py-3 bg-white group">
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
                    <div className="flex gap-2">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5 w-16 shrink-0">Yesterday</span>
                      <p className="text-sm text-gray-700 leading-snug">{entry.yesterday}</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mt-0.5 w-16 shrink-0">Today</span>
                      <p className="text-sm text-gray-700 leading-snug">{entry.today}</p>
                    </div>
                    {entry.blockers && (
                      <div className="flex gap-2">
                        <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider mt-0.5 w-16 shrink-0">Blockers</span>
                        <p className="text-sm text-red-700 leading-snug">{entry.blockers}</p>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onEdit(entry)}
                  title="Edit this standup"
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
  const [searchParams] = useSearchParams();
  const preselectedProject = searchParams.get('projectId') || '';

  const [tab, setTab] = useState<'submit' | 'rollup' | 'mine'>('submit');
  const [rollupProjectId, setRollupProjectId] = useState(preselectedProject);
  const [success, setSuccess] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [aiResult, setAiResult] = useState<StandupVoiceResult | null>(null);
  const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set());
  const [standupSearch, setStandupSearch] = useState('');
  const [debouncedStandupSearch, setDebouncedStandupSearch] = useState('');
  const [editingEntry, setEditingEntry] = useState<StandupEntry | null>(null);

  const today = format(new Date(), 'yyyy-MM-dd');
  const { data: projects = [], isLoading: projectsLoading } = useProjects();
  const { data: todayStandups = [] } = useMyTodayStandup();
  const { data: myStandups = [], isLoading: myLoading } = useStandups();
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
        setSuccess('Standup updated successfully');
        setEditingEntry(null);
      } else {
        await submitStandup.mutateAsync(data);
        setSuccess(`Standup submitted for ${format(new Date(data.date), 'd MMM yyyy')}`);
      }
      reset({ project_id: data.project_id, date: today });
      setAiResult(null);
      setAiFilledFields(new Set());
    } catch (err: unknown) {
      setSubmitError((err as Error).message);
    }
  };

  if (projectsLoading) return <Layout><PageLoader /></Layout>;

  const submittedProjectIds = new Set(todayStandups.map((s: { projectId: string }) => s.projectId));
  const standupProjects = (projects as any[]).filter((p) => p.standupEnabled !== false);

  // Group "My Submissions" by project
  const projectColorMap = new Map<string, string>();
  (projects as any[]).forEach((p, i) => {
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
      <Header title="Standups" subtitle="Daily standup updates" />
      <div className="p-6 space-y-5">

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200">
          {(['submit', 'rollup', 'mine'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t === 'submit'
                ? editingEntry ? (
                    <span className="flex items-center gap-1.5 text-amber-600">
                      <Pencil size={13} /> Edit Standup
                    </span>
                  ) : 'Submit Standup'
                : t === 'rollup' ? 'Standup Rollup'
                : (
                  <span className="flex items-center gap-1.5">
                    <History size={14} />
                    My Submissions
                    {myStandups.length > 0 && (
                      <span className="bg-blue-100 text-blue-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
                        {myStandups.length}
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
                    <p className="text-sm font-semibold text-amber-800">Editing standup</p>
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

            {/* Today's status (only when not editing) */}
            {!editingEntry && todayStandups.length > 0 && (
              <div className="p-4 bg-green-50 rounded-xl border border-green-200 flex items-start gap-3">
                <CheckCircle size={18} className="text-green-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-800">Standup submitted for today</p>
                  <p className="text-xs text-green-600 mt-0.5">
                    {submittedProjectIds.size} project(s): {(projects as any[])
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
                    <label className="form-label">Project *</label>
                    {editingEntry ? (
                      <div className="form-input bg-gray-50 text-gray-600 cursor-not-allowed">
                        {editingEntry.projectName ?? 'Unknown'}
                      </div>
                    ) : (
                      <select className="form-select" {...register('project_id', { required: 'Select a project' })}>
                        <option value="">Select project…</option>
                        {standupProjects.map((p: { id: string; name: string }) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    )}
                    {errors.project_id && <p className="form-error">{errors.project_id.message}</p>}
                  </div>
                  <div>
                    <label className="form-label">Date *</label>
                    <input type="date" className={`form-input ${editingEntry ? 'bg-gray-50 text-gray-600 cursor-not-allowed' : ''}`}
                      readOnly={!!editingEntry}
                      {...register('date', { required: true })} />
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
                    What did you do yesterday? *
                    {aiFilledFields.has('yesterday') && <AiBadge />}
                  </label>
                  <textarea className="form-textarea" rows={3}
                    placeholder="Completed X, reviewed Y, attended Z…"
                    {...register('yesterday', { required: 'Required' })} />
                  {errors.yesterday && <p className="form-error">{errors.yesterday.message}</p>}
                </div>

                {/* Today */}
                <div>
                  <label className="form-label">
                    What are you doing today? *
                    {aiFilledFields.has('today') && <AiBadge />}
                  </label>
                  <textarea className="form-textarea" rows={3}
                    placeholder="Working on A, will finish B, meeting with C…"
                    {...register('today', { required: 'Required' })} />
                  {errors.today && <p className="form-error">{errors.today.message}</p>}
                </div>

                {/* Blockers */}
                <div>
                  <label className="form-label">
                    Any blockers?
                    {aiFilledFields.has('blockers') && <AiBadge />}
                  </label>
                  <textarea className="form-textarea" rows={2}
                    placeholder="None / Waiting for X / Blocked by Y…"
                    {...register('blockers')} />
                </div>

                <div className="flex items-center gap-3">
                  <Button type="submit" loading={isSubmitting}
                    icon={editingEntry ? <Pencil size={15} /> : <Clock size={16} />}
                    variant={editingEntry ? 'primary' : 'primary'}>
                    {editingEntry ? 'Update Standup' : 'Submit Standup'}
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
            {/* Search bar */}
            <div className="relative">
              {searchStandupLoading && isSearchMode
                ? <svg className="absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-blue-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                : <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              }
              <input
                className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-200 outline-none"
                placeholder="Search yesterday, today, blockers…"
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
                {(myLoading || searchStandupLoading) ? 'Loading…'
                  : isSearchMode
                    ? `${visibleStandups.length} result${visibleStandups.length !== 1 ? 's' : ''} for "${debouncedStandupSearch}"`
                    : `${myStandups.length} standup${myStandups.length !== 1 ? 's' : ''} across ${byProject.size} project${byProject.size !== 1 ? 's' : ''}`}
              </p>
            </div>

            {/* Hover-tip */}
            {!myLoading && myStandups.length > 0 && (
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <Pencil size={10} /> Hover over an entry to edit it
              </p>
            )}

            {myLoading && !isSearchMode ? <PageLoader /> : visibleStandups.length === 0 ? (
              <EmptyState
                title={isSearchMode ? 'No results found' : 'No standups yet'}
                description={isSearchMode ? 'Try a different search term.' : 'Your submitted standups will appear here.'}
              />
            ) : isSearchMode ? (
              /* Flat list in search mode (entries from different projects mixed) */
              <div className="space-y-3">
                {(visibleStandups as StandupEntry[]).map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3 group">
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
                          <div className="flex gap-2">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5 w-16 shrink-0">Yesterday</span>
                            <p className="text-sm text-gray-700 leading-snug">{entry.yesterday}</p>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mt-0.5 w-16 shrink-0">Today</span>
                            <p className="text-sm text-gray-700 leading-snug">{entry.today}</p>
                          </div>
                          {entry.blockers && (
                            <div className="flex gap-2">
                              <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider mt-0.5 w-16 shrink-0">Blockers</span>
                              <p className="text-sm text-red-700 leading-snug">{entry.blockers}</p>
                            </div>
                          )}
                        </div>
                      </div>
                      <button type="button" onClick={() => startEdit(entry)} title="Edit"
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
              {(projects as any[]).map((p: { id: string; name: string }, i: number) => (
                <button key={p.id} type="button"
                  onClick={() => setRollupProjectId(p.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                    rollupProjectId === p.id
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                  }`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${rollupProjectId === p.id ? 'bg-white' : PROJECT_COLORS[i % PROJECT_COLORS.length]}`} />
                  {p.name}
                </button>
              ))}
            </div>

            {rollupLoading ? <PageLoader /> : !rollupProjectId ? (
              <EmptyState title="Select a project" description="Choose a project above to see the standup rollup." />
            ) : rollupData?.rollup?.length === 0 ? (
              <EmptyState title="No standups found" description="No standup entries in the last 7 days." />
            ) : (
              <div className="space-y-4">
                {rollupData?.rollup?.map((day: {
                  date: string; entryCount: number; entries: Array<{
                    id: string; userName: string; yesterday: string; today: string; blockers?: string;
                  }>;
                }) => (
                  <div key={day.date} className="rounded-xl border border-gray-200 overflow-hidden">
                    {/* Day header */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
                      <h3 className="text-sm font-semibold text-gray-900">
                        {format(new Date(day.date + 'T00:00:00'), 'EEEE, d MMMM yyyy')}
                      </h3>
                      <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded-full border border-gray-200">
                        {day.entryCount} update{day.entryCount !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Entries */}
                    <div className="divide-y divide-gray-100 bg-white">
                      {day.entries.map((entry) => (
                        <div key={entry.id} className="px-4 py-3">
                          <p className="text-xs font-bold text-blue-600 mb-2">{entry.userName}</p>
                          <div className="grid grid-cols-1 gap-1.5">
                            <div className="flex gap-2">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5 w-16 shrink-0">Yesterday</span>
                              <p className="text-sm text-gray-700 leading-snug">{entry.yesterday}</p>
                            </div>
                            <div className="flex gap-2">
                              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mt-0.5 w-16 shrink-0">Today</span>
                              <p className="text-sm text-gray-700 leading-snug">{entry.today}</p>
                            </div>
                            {entry.blockers && (
                              <div className="flex gap-2">
                                <AlertCircle size={12} className="text-red-400 mt-0.5 shrink-0" />
                                <p className="text-sm text-red-700 leading-snug">{entry.blockers}</p>
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
      </div>
    </Layout>
  );
};

export default StandupPage;
