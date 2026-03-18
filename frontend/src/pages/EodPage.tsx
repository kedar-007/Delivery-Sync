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
import { useProjects } from '../hooks/useProjects';
import { useSubmitEod, useEodRollup } from '../hooks/useEod';
import { format } from 'date-fns';
import { CheckCircle } from 'lucide-react';

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
  { value: 'GREEN', label: '😊 Good', color: 'text-green-600' },
  { value: 'YELLOW', label: '😐 Okay', color: 'text-yellow-600' },
  { value: 'RED', label: '😔 Tough', color: 'text-red-600' },
];

const EodPage = () => {
  const [searchParams] = useSearchParams();
  const preselectedProject = searchParams.get('projectId') || '';
  const [tab, setTab] = useState<'submit' | 'rollup'>('submit');
  const [rollupProjectId, setRollupProjectId] = useState(preselectedProject);
  const [success, setSuccess] = useState('');
  const [submitError, setSubmitError] = useState('');

  const today = format(new Date(), 'yyyy-MM-dd');
  const { data: projects = [], isLoading: projectsLoading } = useProjects();
  const submitEod = useSubmitEod();
  const { data: rollupData, isLoading: rollupLoading } = useEodRollup({ projectId: rollupProjectId });

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<EodForm>({
    defaultValues: { project_id: preselectedProject, date: today, progress_percentage: 0, mood: 'GREEN' },
  });

  const progressValue = watch('progress_percentage', 0);

  const onSubmit = async (data: EodForm) => {
    try {
      setSubmitError('');
      await submitEod.mutateAsync({ ...data, progress_percentage: Number(data.progress_percentage) });
      setSuccess(`EOD submitted for ${format(new Date(data.date), 'd MMM yyyy')}`);
      reset({ project_id: data.project_id, date: today, progress_percentage: 0, mood: 'GREEN' });
    } catch (err: unknown) {
      setSubmitError((err as Error).message);
    }
  };

  if (projectsLoading) return <Layout><PageLoader /></Layout>;

  return (
    <Layout>
      <Header title="End of Day" subtitle="Daily EOD updates" />
      <div className="p-6 space-y-5">

        <div className="flex gap-2 border-b border-gray-200">
          {(['submit', 'rollup'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t === 'submit' ? 'Submit EOD' : 'EOD Rollup'}
            </button>
          ))}
        </div>

        {tab === 'submit' && (
          <div className="max-w-2xl">
            {success && <Alert type="success" message={success} className="mb-4" />}
            {submitError && <Alert type="error" message={submitError} className="mb-4" />}

            <Card>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Project *</label>
                    <select className="form-select" {...register('project_id', { required: 'Required' })}>
                      <option value="">Select project…</option>
                      {projects.map((p: {id: string; name: string}) => (
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

                <div>
                  <label className="form-label">What did you accomplish today? *</label>
                  <textarea className="form-textarea" rows={4}
                    placeholder="Completed X feature, fixed Y bug, reviewed Z PR…"
                    {...register('accomplishments', { required: 'Required' })} />
                  {errors.accomplishments && <p className="form-error">{errors.accomplishments.message}</p>}
                </div>

                <div>
                  <label className="form-label">Planned for tomorrow?</label>
                  <textarea className="form-textarea" rows={3}
                    placeholder="Continue with A, start B, meeting about C…"
                    {...register('planned_tomorrow')} />
                </div>

                <div>
                  <label className="form-label">Any blockers?</label>
                  <textarea className="form-textarea" rows={2}
                    placeholder="None / Waiting for X / Need access to Y…"
                    {...register('blockers')} />
                </div>

                <div>
                  <label className="form-label">Overall Progress Today: <strong>{progressValue}%</strong></label>
                  <input type="range" min={0} max={100} step={5}
                    className="w-full accent-blue-600"
                    {...register('progress_percentage')} />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>0%</span><span>50%</span><span>100%</span>
                  </div>
                </div>

                <div>
                  <label className="form-label">How was your day?</label>
                  <div className="flex gap-3">
                    {MOOD_OPTIONS.map((m) => (
                      <label key={m.value} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" value={m.value} {...register('mood')} className="sr-only" />
                        <span className={`text-sm font-medium ${m.color} px-3 py-1.5 rounded-lg border-2 ${
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

        {tab === 'rollup' && (
          <div className="space-y-4">
            <select className="form-select max-w-xs"
              value={rollupProjectId} onChange={(e) => setRollupProjectId(e.target.value)}>
              <option value="">Select project…</option>
              {projects.map((p: {id: string; name: string}) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            {rollupLoading ? <PageLoader /> : !rollupProjectId ? (
              <EmptyState title="Select a project" description="Choose a project to see EOD rollup." />
            ) : rollupData?.rollup?.length === 0 ? (
              <EmptyState title="No EODs found" description="No EOD entries in the last 7 days." />
            ) : (
              rollupData?.rollup?.map((day: {date: string; entryCount: number; avgProgress: number; entries: Array<{
                id: string; userName: string; accomplishments: string; plannedTomorrow?: string; blockers?: string; progressPercentage: number; mood: string;
              }>}) => (
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
                        <div><span className="text-xs text-gray-500 font-medium uppercase">Accomplishments</span>
                          <p className="text-sm text-gray-700 mt-0.5">{entry.accomplishments}</p></div>
                        {entry.plannedTomorrow && (
                          <div><span className="text-xs text-gray-500 font-medium uppercase">Tomorrow</span>
                            <p className="text-sm text-gray-700 mt-0.5">{entry.plannedTomorrow}</p></div>
                        )}
                        {entry.blockers && (
                          <div><span className="text-xs text-red-500 font-medium uppercase">Blockers</span>
                            <p className="text-sm text-gray-700 mt-0.5">{entry.blockers}</p></div>
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
