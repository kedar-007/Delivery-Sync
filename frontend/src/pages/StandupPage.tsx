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
import { useSubmitStandup, useStandupRollup, useMyTodayStandup } from '../hooks/useStandups';
import { useProcessVoice, type StandupVoiceResult } from '../hooks/useVoiceAI';
import { format } from 'date-fns';
import { CheckCircle, Clock, Sparkles } from 'lucide-react';

interface StandupForm {
  project_id: string;
  date: string;
  yesterday: string;
  today: string;
  blockers: string;
}

const AiBadge = () => (
  <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-medium">
    <Sparkles size={10} /> AI
  </span>
);

const StandupPage = () => {
  const [searchParams] = useSearchParams();
  const preselectedProject = searchParams.get('projectId') || '';
  const [tab, setTab] = useState<'submit' | 'rollup'>('submit');
  const [rollupProjectId, setRollupProjectId] = useState(preselectedProject);
  const [success, setSuccess] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [aiResult, setAiResult] = useState<StandupVoiceResult | null>(null);
  const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set());

  const today = format(new Date(), 'yyyy-MM-dd');
  const { data: projects = [], isLoading: projectsLoading } = useProjects();
  const { data: todayStandups = [] } = useMyTodayStandup();
  const submitStandup = useSubmitStandup();
  const { data: rollupData, isLoading: rollupLoading } = useStandupRollup({ projectId: rollupProjectId });
  const processVoice = useProcessVoice();

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<StandupForm>({
    defaultValues: { project_id: preselectedProject, date: today },
  });

  const watchedProject = watch('project_id');

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
    } catch {
      // Error shown via processVoice.isError below
    }
  };

  const onSubmit = async (data: StandupForm) => {
    try {
      setSubmitError('');
      await submitStandup.mutateAsync(data);
      setSuccess(`Standup submitted for ${format(new Date(data.date), 'd MMM yyyy')}`);
      reset({ project_id: data.project_id, date: today });
      setAiResult(null);
      setAiFilledFields(new Set());
    } catch (err: unknown) {
      setSubmitError((err as Error).message);
    }
  };

  if (projectsLoading) return <Layout><PageLoader /></Layout>;

  const submittedProjectIds = new Set(todayStandups.map((s: { projectId: string }) => s.projectId));

  return (
    <Layout>
      <Header title="Standups" subtitle="Daily standup updates" />
      <div className="p-6 space-y-5">

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200">
          {(['submit', 'rollup'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
                tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t === 'submit' ? 'Submit Standup' : 'Standup Rollup'}
            </button>
          ))}
        </div>

        {tab === 'submit' && (
          <div className="max-w-2xl space-y-4">
            {/* Today's status */}
            {todayStandups.length > 0 && (
              <div className="p-4 bg-green-50 rounded-xl border border-green-200 flex items-start gap-3">
                <CheckCircle size={18} className="text-green-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-800">Standup submitted for today</p>
                  <p className="text-xs text-green-600 mt-0.5">
                    {submittedProjectIds.size} project(s): {projects
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
                {/* Project + Date */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Project *</label>
                    <select className="form-select" {...register('project_id', { required: 'Select a project' })}>
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

                <Button type="submit" loading={isSubmitting} icon={<Clock size={16} />}>
                  Submit Standup
                </Button>
              </form>
            </Card>
          </div>
        )}

        {tab === 'rollup' && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <select className="form-select max-w-xs"
                value={rollupProjectId} onChange={(e) => setRollupProjectId(e.target.value)}>
                <option value="">Select project…</option>
                {projects.map((p: { id: string; name: string }) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {rollupLoading ? <PageLoader /> : !rollupProjectId ? (
              <EmptyState title="Select a project" description="Choose a project to see standup rollup." />
            ) : rollupData?.rollup?.length === 0 ? (
              <EmptyState title="No standups found" description="No standup entries in the last 7 days." />
            ) : (
              rollupData?.rollup?.map((day: {
                date: string; entryCount: number; entries: Array<{
                  id: string; userName: string; yesterday: string; today: string; blockers?: string;
                }>;
              }) => (
                <Card key={day.date} className="space-y-3">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <h3 className="text-sm font-semibold text-gray-900">
                      {format(new Date(day.date + 'T00:00:00'), 'EEEE, d MMMM yyyy')}
                    </h3>
                    <span className="text-xs text-gray-400">{day.entryCount} update{day.entryCount !== 1 ? 's' : ''}</span>
                  </div>
                  {day.entries.map((entry) => (
                    <div key={entry.id} className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-blue-700 mb-2">{entry.userName}</p>
                      <div className="space-y-2">
                        <div>
                          <span className="text-xs text-gray-500 font-medium uppercase">Yesterday</span>
                          <p className="text-sm text-gray-700 mt-0.5">{entry.yesterday}</p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 font-medium uppercase">Today</span>
                          <p className="text-sm text-gray-700 mt-0.5">{entry.today}</p>
                        </div>
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

export default StandupPage;
