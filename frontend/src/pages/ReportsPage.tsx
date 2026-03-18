import React, { useState, useCallback } from 'react';
import { useSearchParams, useParams, Link as RouterLink } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Plus, FileText, Link, CheckCheck, ExternalLink } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import { RAGBadge, StatusBadge } from '../components/ui/Badge';
import Modal, { ModalActions } from '../components/ui/Modal';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/Spinner';
import { useReports, useReport, useGenerateReport } from '../hooks/useReports';
import { useProjects } from '../hooks/useProjects';
import { Report } from '../types';
import { format, subDays } from 'date-fns';

const ReportsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const preselectedProject = searchParams.get('projectId') || '';
  const [filterProject, setFilterProject] = useState(preselectedProject);
  const [showGenerate, setShowGenerate] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState(searchParams.get('reportId') || '');
  const [generateError, setGenerateError] = useState('');
  const [copied, setCopied] = useState(false);

  const params: Record<string, string> = {};
  if (filterProject) params.projectId = filterProject;
  const { data: reports = [], isLoading } = useReports(params);
  const { data: selectedReport } = useReport(selectedReportId);
  const { data: projects = [] } = useProjects();
  const generateReport = useGenerateReport();

  const today = format(new Date(), 'yyyy-MM-dd');
  const lastWeek = format(subDays(new Date(), 7), 'yyyy-MM-dd');

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm({
    defaultValues: { project_id: preselectedProject, report_type: 'WEEKLY', period_start: lastWeek, period_end: today },
  });

  const selectReport = useCallback((id: string) => {
    setSelectedReportId(id);
    setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('reportId', id); return p; }, { replace: true });
  }, [setSearchParams]);

  const copyPermalink = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}#/${tenantSlug}/reports?reportId=${selectedReportId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [tenantSlug, selectedReportId]);

  const onGenerate = async (data: any) => {
    try {
      setGenerateError('');
      const result = await generateReport.mutateAsync(data);
      setShowGenerate(false);
      reset();
      if (result?.report?.id) selectReport(result.report.id);
    } catch (err: unknown) { setGenerateError((err as Error).message); }
  };

  if (isLoading) return <Layout><PageLoader /></Layout>;

  const report = selectedReportId ? selectedReport ?? null : null;

  return (
    <Layout>
      <Header title="Reports" subtitle="Weekly and custom delivery reports"
        actions={<Button onClick={() => setShowGenerate(true)} icon={<Plus size={16} />}>Generate Report</Button>}
      />
      <div className="p-6 space-y-5">
        <select className="form-select max-w-xs" value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
          <option value="">All Projects</option>
          {projects.map((p: {id: string; name: string}) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Report List */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="p-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Generated Reports</h3>
            </div>
            {reports.length === 0 ? (
              <EmptyState title="No reports" description="Generate your first report." />
            ) : (
              <div className="divide-y divide-gray-50">
                {reports.map((r: Report) => (
                  <button key={r.id} onClick={() => selectReport(r.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${selectedReportId === r.id ? 'bg-blue-50 border-l-2 border-blue-600' : ''}`}>
                    <p className="text-sm font-medium text-gray-900">{r.summary?.projectName || 'Report'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {r.reportType} · {r.periodStart} → {r.periodEnd}
                    </p>
                    {r.summary?.ragStatus && <RAGBadge status={r.summary.ragStatus} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Report Detail */}
          <div className="lg:col-span-2 space-y-4">
            {!selectedReportId ? (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
                <FileText size={40} className="mx-auto text-gray-200 mb-3" />
                <p className="text-sm text-gray-500">Select a report to view details</p>
              </div>
            ) : !report ? (
              <PageLoader />
            ) : (
              <>
                {/* Header */}
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h2 className="text-base font-bold text-gray-900">{report.summary?.projectName}</h2>
                      <p className="text-sm text-gray-500 mt-1">
                        {report.reportType} Report · {report.periodStart} to {report.periodEnd}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {report.summary?.ragStatus && <RAGBadge status={report.summary.ragStatus} />}
                      <RouterLink
                        to={`/${tenantSlug}/reports/${report.id}`}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600"
                        title="View full report"
                      >
                        <ExternalLink size={13} /> Full view
                      </RouterLink>
                      <button
                        onClick={copyPermalink}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600"
                        title="Copy shareable link"
                      >
                        {copied ? <><CheckCheck size={13} className="text-green-600" /> Copied!</> : <><Link size={13} /> Share</>}
                      </button>
                    </div>
                  </div>
                </Card>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                    <p className="text-2xl font-bold text-blue-600">{report.summary?.standups?.total}</p>
                    <p className="text-xs text-gray-500 mt-1">Standups</p>
                    <p className="text-xs text-gray-400">{report.summary?.standups?.submissionRate} rate</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                    <p className="text-2xl font-bold text-green-600">{report.summary?.actions?.completionRate}%</p>
                    <p className="text-xs text-gray-500 mt-1">Action Completion</p>
                    <p className="text-xs text-gray-400">{report.summary?.actions?.completed}/{report.summary?.actions?.total} done</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                    <p className={`text-2xl font-bold ${report.summary?.blockers?.open > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {report.summary?.blockers?.open}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Open Blockers</p>
                    <p className="text-xs text-gray-400">{report.summary?.blockers?.critical} critical</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                    <p className="text-2xl font-bold text-purple-600">{report.summary?.eods?.avgProgressPercentage}%</p>
                    <p className="text-xs text-gray-500 mt-1">Avg Progress</p>
                    <p className="text-xs text-gray-400">EOD reported</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Key Blockers */}
                  {report.summary?.keyBlockers?.length > 0 && (
                    <Card>
                      <CardHeader><CardTitle>Key Blockers</CardTitle></CardHeader>
                      {report.summary.keyBlockers.map((b: {title: string; severity: string}, i: number) => (
                        <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                          <span className="text-sm text-gray-700 truncate pr-2">{b.title}</span>
                          <StatusBadge status={b.severity} />
                        </div>
                      ))}
                    </Card>
                  )}

                  {/* Milestones */}
                  <Card>
                    <CardHeader><CardTitle>Milestones</CardTitle></CardHeader>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Completed</span>
                        <span className="font-medium text-green-600">{report.summary?.milestones?.completed}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Delayed</span>
                        <span className="font-medium text-red-600">{report.summary?.milestones?.delayed}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Upcoming</span>
                        <span className="font-medium text-blue-600">{report.summary?.milestones?.upcoming}</span>
                      </div>
                    </div>
                  </Card>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <Modal open={showGenerate} onClose={() => { setShowGenerate(false); reset(); setGenerateError(''); }} title="Generate Report">
        <form onSubmit={handleSubmit(onGenerate)} className="space-y-4">
          {generateError && <Alert type="error" message={generateError} />}
          <div>
            <label className="form-label">Project *</label>
            <select className="form-select" {...register('project_id', { required: 'Required' })}>
              <option value="">Select…</option>
              {projects.map((p: {id: string; name: string}) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Report Type</label>
            <select className="form-select" {...register('report_type')}>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">From *</label>
              <input type="date" className="form-input" {...register('period_start', { required: 'Required' })} />
            </div>
            <div>
              <label className="form-label">To *</label>
              <input type="date" className="form-input" {...register('period_end', { required: 'Required' })} />
            </div>
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setShowGenerate(false)}>Cancel</Button>
            <Button type="submit" loading={isSubmitting}>Generate</Button>
          </ModalActions>
        </form>
      </Modal>
    </Layout>
  );
};

export default ReportsPage;
