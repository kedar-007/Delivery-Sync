import React from 'react';
import {
  RefreshCw, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronUp, Clock, Info,
} from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import { useJobRuns } from '../../hooks/useAdmin';

interface JobRun {
  ROWID: string;
  CREATEDTIME?: string;
  job_name: string;
  service: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  started_at?: string;
  finished_at?: string;
  duration_ms?: number | string;
  summary?: string;
  error?: string;
}

const STATUS_STYLES: Record<string, string> = {
  SUCCESS: 'bg-green-50 text-green-700 border-green-200',
  FAILED:  'bg-red-50 text-red-700 border-red-200',
  RUNNING: 'bg-blue-50 text-blue-700 border-blue-200',
};

const StatusChip = ({ status }: { status: string }) => (
  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium border ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
    {status === 'SUCCESS' && <CheckCircle2 size={11} />}
    {status === 'FAILED'  && <XCircle size={11} />}
    {status === 'RUNNING' && <Loader2 size={11} className="animate-spin" />}
    {status}
  </span>
);

const fmtTime = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
};

const fmtDuration = (ms?: number | string) => {
  const n = Number(ms);
  if (!n || isNaN(n)) return '—';
  if (n < 1000) return `${n} ms`;
  if (n < 60_000) return `${(n / 1000).toFixed(1)} s`;
  return `${Math.floor(n / 60_000)}m ${Math.round((n % 60_000) / 1000)}s`;
};

const prettyJson = (raw?: string) => {
  if (!raw) return '';
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
};

export const BackgroundJobsTab = () => {
  const [statusFilter, setStatusFilter] = React.useState('');
  const [jobFilter, setJobFilter] = React.useState('');
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  const params: Record<string, string> = { pageSize: '100' };
  if (statusFilter) params.status = statusFilter;
  if (jobFilter) params.job_name = jobFilter;

  const { data, isLoading, isFetching, refetch } = useJobRuns(params);
  const runs: JobRun[] = (data?.runs as JobRun[]) ?? [];

  // Latest run per job — the "is everything fine?" glance
  const latestByJob = new Map<string, JobRun>();
  for (const r of runs) {
    if (!latestByJob.has(r.job_name)) latestByJob.set(r.job_name, r);
  }
  const jobNames = Array.from(latestByJob.keys()).sort();

  if (isLoading) return <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2.5 p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
        <Info size={14} className="mt-0.5 flex-shrink-0" />
        <span>
          Every background job and cron records its runs here — status, duration, result summary and
          errors. A job that should have run but shows no recent entry, or any <strong>FAILED</strong> row,
          needs attention. Detailed console output stays in the Catalyst function logs.
        </span>
      </div>

      {/* Latest status per job */}
      {!jobFilter && !statusFilter && jobNames.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {jobNames.map((name) => {
            const r = latestByJob.get(name)!;
            return (
              <Card key={name} className="!p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
                    <p className="text-[11px] text-gray-400 truncate">{r.service}</p>
                  </div>
                  <StatusChip status={r.status} />
                </div>
                <div className="flex items-center gap-1.5 mt-2 text-[11px] text-gray-500">
                  <Clock size={11} />
                  <span>{fmtTime(r.started_at)}</span>
                  <span className="text-gray-300">·</span>
                  <span>{fmtDuration(r.duration_ms)}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select className="form-select w-44" value={jobFilter} onChange={(e) => setJobFilter(e.target.value)}>
          <option value="">All jobs</option>
          {jobNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select className="form-select w-36" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="SUCCESS">Success</option>
          <option value="FAILED">Failed</option>
          <option value="RUNNING">Running</option>
        </select>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </Button>
        <span className="text-[11px] text-gray-400 ml-auto">Auto-refreshes every 30s</span>
      </div>

      {/* Run history */}
      {runs.length === 0 ? (
        <EmptyState title="No job runs recorded yet" description="Runs will appear here after the next scheduled job executes." />
      ) : (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-ds-border">
                  <th className="px-4 py-2.5 font-semibold">Job</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Started</th>
                  <th className="px-4 py-2.5 font-semibold">Duration</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const isExp = expanded[r.ROWID] ?? false;
                  const hasDetail = !!(r.summary || r.error);
                  return (
                    <React.Fragment key={r.ROWID}>
                      <tr
                        className={`border-b border-ds-border last:border-0 ${hasDetail ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                        onClick={() => hasDetail && setExpanded((e) => ({ ...e, [r.ROWID]: !isExp }))}
                      >
                        <td className="px-4 py-2.5">
                          <span className="font-medium text-gray-900">{r.job_name}</span>
                          <span className="ml-2 text-[11px] text-gray-400">{r.service}</span>
                        </td>
                        <td className="px-4 py-2.5"><StatusChip status={r.status} /></td>
                        <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{fmtTime(r.started_at)}</td>
                        <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{fmtDuration(r.duration_ms)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-400">
                          {hasDetail && (isExp ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                        </td>
                      </tr>
                      {isExp && (
                        <tr className="border-b border-ds-border last:border-0 bg-gray-50/60">
                          <td colSpan={5} className="px-4 py-3">
                            {r.error && (
                              <div className="mb-2">
                                <p className="text-[11px] font-semibold text-red-600 uppercase tracking-wide mb-1">Error</p>
                                <pre className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg p-2.5 whitespace-pre-wrap break-words">{r.error}</pre>
                              </div>
                            )}
                            {r.summary && (
                              <div>
                                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Result summary</p>
                                <pre className="text-xs text-gray-700 bg-white border border-ds-border rounded-lg p-2.5 whitespace-pre-wrap break-words">{prettyJson(r.summary)}</pre>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default BackgroundJobsTab;
