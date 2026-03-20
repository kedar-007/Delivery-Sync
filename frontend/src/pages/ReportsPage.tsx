import React, { useState, useCallback } from 'react';
import { useSearchParams, useParams, Link as RouterLink } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  Plus, FileText, Link, CheckCheck, ExternalLink,
  Pencil, TrendingUp, ShieldAlert, Milestone, Activity,
  ArrowRight, BarChart3, Clock
} from 'lucide-react';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import { RAGBadge, StatusBadge } from '../components/ui/Badge';
import Modal, { ModalActions } from '../components/ui/Modal';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/Spinner';
import { useReports, useReport, useGenerateReport, useUpdateReport } from '../hooks/useReports'; //  Added useUpdateReport
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

  // Rename state
  const [renamingReport, setRenamingReport] = useState<{ id: string; title: string } | null>(null);
  const [renameError, setRenameError] = useState('');

  const params: Record<string, string> = {};
  if (filterProject) params.projectId = filterProject;
  const { data: reports = [], isLoading } = useReports(params);
  const { data: selectedReport } = useReport(selectedReportId);
  const { data: projects = [] } = useProjects();
  const generateReport = useGenerateReport();

  // Update hook
  const updateReport = useUpdateReport(renamingReport?.id ?? '');

  const today = format(new Date(), 'yyyy-MM-dd');
  const lastWeek = format(subDays(new Date(), 7), 'yyyy-MM-dd');

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm({
    defaultValues: { project_id: preselectedProject, report_type: 'WEEKLY', period_start: lastWeek, period_end: today },
  });

  // Rename form
  const {
    register: registerRename,
    handleSubmit: handleRenameSubmit,
    reset: resetRename,
    formState: { errors: renameErrors, isSubmitting: isRenaming },
  } = useForm<{ title: string }>();

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

  // Open rename
  const openRename = (e: React.MouseEvent, report: { id: string; title: string }) => {
    e.stopPropagation();
    setRenamingReport(report);
    resetRename({ title: report.title });
    setRenameError('');
  };

  // Submit rename
  const onRename = async (data: { title: string }) => {
    if (!renamingReport) return;
    try {
      setRenameError('');
      await updateReport.mutateAsync({ title: data.title });
      setRenamingReport(null);
      resetRename();
    } catch (err: unknown) {
      setRenameError((err as Error).message);
    }
  };

  if (isLoading) return <Layout><PageLoader /></Layout>;

  const report = selectedReportId ? selectedReport ?? null : null;

  // RAG color helpers
  const ragRingColor = (rag?: string) => {
    if (rag === 'RED') return 'border-l-red-400';
    if (rag === 'AMBER') return 'border-l-amber-400';
    return 'border-l-green-400';
  };

  return (
    <Layout>
      <Header
        title="Reports"
        subtitle="Weekly and custom delivery reports"
        actions={<Button onClick={() => setShowGenerate(true)} icon={<Plus size={16} />}>Generate Report</Button>}
      />

      <div className="p-6 space-y-5">
        <select className="form-select max-w-xs" value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
          <option value="">All Projects</option>
          {projects.map((p: { id: string; name: string }) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Report List — improved cards */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Generated Reports</h3>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{reports.length}</span>
            </div>

            {reports.length === 0 ? (
              <EmptyState title="No reports" description="Generate your first report." />
            ) : (
              <div className="divide-y divide-gray-50 overflow-y-auto">
                {reports.map((r: Report) => (
                  <button
                    key={r.id}
                    onClick={() => selectReport(r.id)}
                    className={`w-full text-left px-4 py-3.5 hover:bg-gray-50 transition-colors group border-l-4 ${
                      selectedReportId === r.id ? `bg-blue-50 ${ragRingColor(r.summary?.ragStatus)} ` : 'border-l-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {r.summary?.projectName || 'Report'}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-400">
                          <Clock size={10} />
                          <span>{r.periodStart} → {r.periodEnd}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-xs font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                            {r.reportType}
                          </span>
                          {r.summary?.ragStatus && <RAGBadge status={r.summary.ragStatus} />}
                        </div>
                      </div>
                      <ArrowRight size={14} className="text-gray-300 group-hover:text-blue-400 transition-colors mt-1 flex-shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Report Detail — fully redesigned */}
          <div className="lg:col-span-2 space-y-4">
            {!selectedReportId ? (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 flex flex-col items-center justify-center text-center">
                <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mb-4">
                  <FileText size={24} className="text-gray-300" />
                </div>
                <p className="text-sm font-medium text-gray-500">Select a report to view details</p>
                <p className="text-xs text-gray-400 mt-1">Pick from the list on the left</p>
              </div>
            ) : !report ? (
              <PageLoader />
            ) : (
              <>
                {/* Report header card */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  {/* Top accent based on RAG */}
                  <div className={`h-1 w-full ${
                    report.summary?.ragStatus === 'RED' ? 'bg-red-400'
                    : report.summary?.ragStatus === 'AMBER' ? 'bg-amber-400'
                    : 'bg-green-400'
                  }`} />
                  <div className="p-5 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-gray-900">{report.summary?.projectName}</h2>
                        {/* Pencil to rename */}
                        <button
                          type="button"
                          onClick={(e) => openRename(e, { id: report.id, title: report.summary?.projectName ?? '' })}
                          className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Rename report"
                        >
                          <Pencil size={12} />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                        <span className="font-medium text-gray-700 bg-gray-100 text-xs px-2 py-0.5 rounded">{report.reportType}</span>
                        <span className="text-gray-300">·</span>
                        <span className="text-xs">{report.periodStart} to {report.periodEnd}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {report.summary?.ragStatus && <RAGBadge status={report.summary.ragStatus} />}
                      <RouterLink
                        to={`/${tenantSlug}/reports/${report.id}`}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600"
                      >
                        <ExternalLink size={12} /> Full view
                      </RouterLink>
                      <button
                        onClick={copyPermalink}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600"
                      >
                        {copied
                          ? <><CheckCheck size={12} className="text-green-600" /> Copied!</>
                          : <><Link size={12} /> Share</>
                        }
                      </button>
                    </div>
                  </div>
                </div>

                {/*  Stats grid — redesigned stat cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Standups */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-gray-500">Standups</span>
                      <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center">
                        <Activity size={13} className="text-blue-500" />
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{report.summary?.standups?.total ?? '—'}</p>
                    <p className="text-xs text-gray-400 mt-1">{report.summary?.standups?.submissionRate} rate</p>
                  </div>

                  {/* Action Completion */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-gray-500">Actions</span>
                      <div className="w-7 h-7 bg-green-50 rounded-lg flex items-center justify-center">
                        <TrendingUp size={13} className="text-green-500" />
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{report.summary?.actions?.completionRate ?? '—'}%</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {report.summary?.actions?.completed}/{report.summary?.actions?.total} done
                    </p>
                  </div>

                  {/* Open Blockers */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-gray-500">Blockers</span>
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                        report.summary?.blockers?.open > 0 ? 'bg-red-50' : 'bg-green-50'
                      }`}>
                        <ShieldAlert size={13} className={report.summary?.blockers?.open > 0 ? 'text-red-500' : 'text-green-500'} />
                      </div>
                    </div>
                    <p className={`text-2xl font-bold ${report.summary?.blockers?.open > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {report.summary?.blockers?.open ?? '—'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{report.summary?.blockers?.critical} critical</p>
                  </div>

                  {/* Avg Progress */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-gray-500">Progress</span>
                      <div className="w-7 h-7 bg-purple-50 rounded-lg flex items-center justify-center">
                        <BarChart3 size={13} className="text-purple-500" />
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{report.summary?.eods?.avgProgressPercentage ?? '—'}%</p>
                    <p className="text-xs text-gray-400 mt-1">EOD reported</p>
                  </div>
                </div>

                {/* Key Blockers + Milestones */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {report.summary?.keyBlockers?.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                        <ShieldAlert size={14} className="text-red-400" />
                        <h4 className="text-sm font-semibold text-gray-800">Key Blockers</h4>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {report.summary.keyBlockers.map((b: { title: string; severity: string }, i: number) => (
                          <div key={i} className="flex items-center justify-between px-4 py-2.5">
                            <span className="text-sm text-gray-700 truncate pr-3">{b.title}</span>
                            <StatusBadge status={b.severity} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                      <Milestone size={14} className="text-blue-400" />
                      <h4 className="text-sm font-semibold text-gray-800">Milestones</h4>
                    </div>
                    <div className="divide-y divide-gray-50">
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-sm text-gray-500">Completed</span>
                        <span className="text-sm font-semibold text-green-600">{report.summary?.milestones?.completed ?? '—'}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-sm text-gray-500">Delayed</span>
                        <span className="text-sm font-semibold text-red-600">{report.summary?.milestones?.delayed ?? '—'}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-sm text-gray-500">Upcoming</span>
                        <span className="text-sm font-semibold text-blue-600">{report.summary?.milestones?.upcoming ?? '—'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Generate Modal */}
      <Modal open={showGenerate} onClose={() => { setShowGenerate(false); reset(); setGenerateError(''); }} title="Generate Report">
        <form onSubmit={handleSubmit(onGenerate)} className="space-y-4">
          {generateError && <Alert type="error" message={generateError} />}
          <div>
            <label className="form-label">Project *</label>
            <select className="form-select" {...register('project_id', { required: 'Required' })}>
              <option value="">Select…</option>
              {projects.map((p: { id: string; name: string }) => <option key={p.id} value={p.id}>{p.name}</option>)}
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

      {/* Rename Modal */}
      <Modal
        open={!!renamingReport}
        onClose={() => { setRenamingReport(null); resetRename(); setRenameError(''); }}
        title="Rename Report"
        size="sm"
      >
        <form onSubmit={handleRenameSubmit(onRename)} className="space-y-4">
          {renameError && <Alert type="error" message={renameError} />}
          <div>
            <label className="form-label">Report Title *</label>
            <input
              className="form-input"
              autoFocus
              {...registerRename('title', {
                required: 'Required',
                validate: v => v.trim().length > 0 || 'Title cannot be blank',
              })}
            />
            {renameErrors.title && <p className="form-error">{renameErrors.title.message}</p>}
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => { setRenamingReport(null); resetRename(); }}>
              Cancel
            </Button>
            <Button type="submit" loading={isRenaming}>Save</Button>
          </ModalActions>
        </form>
      </Modal>

    </Layout>
  );
};

export default ReportsPage;