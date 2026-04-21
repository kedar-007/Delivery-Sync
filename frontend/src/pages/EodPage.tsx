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
import { useSubmitEod, useEodRollup, useEod } from '../hooks/useEod';
import { useProcessVoice, type EodVoiceResult } from '../hooks/useVoiceAI';
import { format } from 'date-fns';
import { CheckCircle, Sparkles, History } from 'lucide-react';

interface EodForm {
  project_id: string;
  date: string;
  accomplishments: string;
  planned_tomorrow: string;
  blockers: string;
  progress_percentage: number;
  mood: string;
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

const EodPage = () => {
  const [searchParams] = useSearchParams();
  const preselectedProject = searchParams.get('projectId') || '';
  const [tab, setTab] = useState<'submit' | 'rollup' | 'mine'>('submit');
  const [rollupProjectId, setRollupProjectId] = useState(preselectedProject);
  const [success, setSuccess] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [aiResult, setAiResult] = useState<EodVoiceResult | null>(null);
  const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set());

  const today = format(new Date(), 'yyyy-MM-dd');
  const { data: projects = [], isLoading: projectsLoading } = useProjects();
  const submitEod = useSubmitEod();
  const { data: myEods = [], isLoading: myLoading } = useEod();
  const { data: rollupData, isLoading: rollupLoading } = useEodRollup({ projectId: rollupProjectId });
  const processVoice = useProcessVoice();

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<EodForm>({
    defaultValues: { project_id: preselectedProject, date: today, progress_percentage: 0, mood: 'GREEN' },
  });

  const progressValue = watch('progress_percentage', 0);
  const watchedProject = watch('project_id');

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
      if (data.accomplishments)    { setValue('accomplishments', data.accomplishments, { shouldDirty: true });          filled.add('accomplishments'); }
      if (data.plan_for_tomorrow)  { setValue('planned_tomorrow', data.plan_for_tomorrow, { shouldDirty: true });      filled.add('planned_tomorrow'); }
      if (data.blockers)           { setValue('blockers', data.blockers, { shouldDirty: true });                       filled.add('blockers'); }
      if (data.mood)               { setValue('mood', data.mood, { shouldDirty: true });                               filled.add('mood'); }

      // Map sentiment to a productivity score for the progress slider
      const score = data.insights?.productivityScore;
      if (score !== undefined) {
        setValue('progress_percentage', Math.round(score / 5) * 5, { shouldDirty: true });
        filled.add('progress_percentage');
      }

      setAiFilledFields(filled);
    } catch {
      // Error shown via processVoice.isError below
    }
  };

  const onSubmit = async (data: EodForm) => {
    try {
      setSubmitError('');
      await submitEod.mutateAsync({ ...data, progress_percentage: Number(data.progress_percentage) });
      setSuccess(`EOD submitted for ${format(new Date(data.date), 'd MMM yyyy')}`);
      reset({ project_id: data.project_id, date: today, progress_percentage: 0, mood: 'GREEN' });
      setAiResult(null);
      setAiFilledFields(new Set());
    } catch (err: unknown) {
      setSubmitError((err as Error).message);
    }
  };

  if (projectsLoading) return <Layout><PageLoader /></Layout>;

  return (
    <Layout>
      <Header title="End of Day" subtitle="Daily EOD updates" />
      <div className="p-6 space-y-5">

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200">
          {(['submit', 'rollup', 'mine'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t === 'submit' ? 'Submit EOD' : t === 'rollup' ? 'EOD Rollup' : (
                <span className="flex items-center gap-1.5">
                  <History size={14} />
                  My Submissions
                  {myEods.length > 0 && (
                    <span className="bg-blue-100 text-blue-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
                      {myEods.length}
                    </span>
                  )}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === 'submit' && (
          <div className="max-w-2xl space-y-4">
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
                    <select className="form-select" {...register('project_id', { required: 'Required' })}>
                      <option value="">Select project…</option>
                      {projects.map((p: { id: string; name: string }) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    {errors.project_id && <p className="form-error">{errors.project_id.message}</p>}
                  </div>
                  <div>
                    <label className="form-label">Date *</label>
                    <input type="date" className="form-input" {...register('date', { required: true })} />
                  </div>
                </div>

                {/* Voice recorder */}
                <VoiceRecorder
                  onProcess={handleVoiceProcess}
                  isProcessing={processVoice.isPending}
                />

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
                    Overall Progress Today: <strong>{progressValue}%</strong>
                    {aiFilledFields.has('progress_percentage') && <AiBadge />}
                  </label>
                  <input type="range" min={0} max={100} step={5}
                    className="w-full accent-blue-600"
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
                  <div className="flex gap-3">
                    {MOOD_OPTIONS.map((m) => (
                      <label key={m.value} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" value={m.value} {...register('mood')} className="sr-only" />
                        <span className={`text-sm font-medium ${m.color} px-3 py-1.5 rounded-lg border-2 transition-colors ${
                          watch('mood') === m.value ? 'border-blue-400 bg-blue-50' : 'border-gray-200'
                        }`}>{m.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <Button type="submit" loading={isSubmitting} icon={<CheckCircle size={16} />}>
                  Submit EOD
                </Button>
              </form>
            </Card>
          </div>
        )}

        {tab === 'mine' && (
          <div className="space-y-4">
            {/* Count badge */}
            <div className="flex items-center gap-3 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
              <History size={18} className="text-indigo-600 shrink-0" />
              <p className="text-sm font-medium text-indigo-800">
                {myLoading ? 'Loading…' : `${myEods.length} EOD${myEods.length !== 1 ? 's' : ''} submitted`}
              </p>
            </div>

            {myLoading ? <PageLoader /> : myEods.length === 0 ? (
              <EmptyState title="No EODs yet" description="Your submitted EODs will appear here." />
            ) : (
              (myEods as Array<{
                id: string; date: string; projectName?: string; accomplishments: string;
                plannedTomorrow?: string; blockers?: string; progressPercentage: number;
                mood: string; submittedAt?: string;
              }>).map((entry) => {
                const moodEmoji = entry.mood === 'GREEN' ? '😊' : entry.mood === 'YELLOW' ? '😐' : '😔';
                const pct = entry.progressPercentage ?? 0;
                const progressColor = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500';
                return (
                  <Card key={entry.id} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {format(new Date(entry.date + 'T00:00:00'), 'd MMM yyyy')}
                        </p>
                        {entry.projectName && (
                          <p className="text-xs text-blue-600 font-medium mt-0.5">{entry.projectName}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{moodEmoji}</span>
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 bg-gray-200 rounded-full h-1.5">
                            <div className={`${progressColor} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-500 font-medium">{pct}%</span>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Accomplishments</p>
                        <p className="text-sm text-gray-700 mt-0.5">{entry.accomplishments}</p>
                      </div>
                      {entry.plannedTomorrow && (
                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Tomorrow</p>
                          <p className="text-sm text-gray-700 mt-0.5">{entry.plannedTomorrow}</p>
                        </div>
                      )}
                      {entry.blockers && (
                        <div>
                          <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">Blockers</p>
                          <p className="text-sm text-gray-700 mt-0.5">{entry.blockers}</p>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        )}

        {tab === 'rollup' && (
          <div className="space-y-4">
            <select className="form-select max-w-xs"
              value={rollupProjectId} onChange={(e) => setRollupProjectId(e.target.value)}>
              <option value="">Select project…</option>
              {projects.map((p: { id: string; name: string }) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            {rollupLoading ? <PageLoader /> : !rollupProjectId ? (
              <EmptyState title="Select a project" description="Choose a project to see EOD rollup." />
            ) : rollupData?.rollup?.length === 0 ? (
              <EmptyState title="No EODs found" description="No EOD entries in the last 7 days." />
            ) : (
              rollupData?.rollup?.map((day: {
                date: string; entryCount: number; avgProgress: number; entries: Array<{
                  id: string; userName: string; accomplishments: string;
                  plannedTomorrow?: string; blockers?: string; progressPercentage: number; mood: string;
                }>;
              }) => (
                <Card key={day.date} className="space-y-3">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <h3 className="text-sm font-semibold text-gray-900">
                      {format(new Date(day.date + 'T00:00:00'), 'EEEE, d MMMM yyyy')}
                    </h3>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400">Avg progress: <strong className="text-gray-700">{day.avgProgress}%</strong></span>
                      <span className="text-xs text-gray-400">{day.entryCount} update{day.entryCount !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  {day.entries.map((entry) => (
                    <div key={entry.id} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-blue-700">{entry.userName}</p>
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-gray-200 rounded-full h-1.5">
                            <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${entry.progressPercentage}%` }} />
                          </div>
                          <span className="text-xs text-gray-500">{entry.progressPercentage}%</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <span className="text-xs text-gray-500 font-medium uppercase">Accomplishments</span>
                          <p className="text-sm text-gray-700 mt-0.5">{entry.accomplishments}</p>
                        </div>
                        {entry.plannedTomorrow && (
                          <div>
                            <span className="text-xs text-gray-500 font-medium uppercase">Tomorrow</span>
                            <p className="text-sm text-gray-700 mt-0.5">{entry.plannedTomorrow}</p>
                          </div>
                        )}
                        {entry.blockers && (
                          <div>
                            <span className="text-xs text-red-500 font-medium uppercase">Blockers</span>
                            <p className="text-sm text-gray-700 mt-0.5">{entry.blockers}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default EodPage;
