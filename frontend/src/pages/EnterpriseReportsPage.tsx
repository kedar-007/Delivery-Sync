import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, Minus, Users, Activity, Clock,
  Package, FileDown, AlertTriangle, BarChart2, CheckCircle,
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Card, { StatCard } from '../components/ui/Card';
import Modal, { ModalActions } from '../components/ui/Modal';
import Alert from '../components/ui/Alert';
import { StatusBadge } from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { PageSkeleton } from '../components/ui/Skeleton';
import {
  useDeliveryHealth,
  usePeopleSummaryReport,
  useAttendanceReport,
  useTimeSummaryReport,
  useAssetSummaryReport,
  useExecutiveBrief,
  useGeneratePdfExport,
} from '../hooks/useEnterpriseReports';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExecutiveBrief {
  active_projects: number;
  on_track_pct: number;
  total_headcount: number;
  attendance_rate: number;
  billable_hours: number;
  asset_utilization_pct: number;
  trends?: {
    active_projects?: 'up' | 'down' | 'flat';
    on_track_pct?: 'up' | 'down' | 'flat';
    total_headcount?: 'up' | 'down' | 'flat';
    attendance_rate?: 'up' | 'down' | 'flat';
    billable_hours?: 'up' | 'down' | 'flat';
    asset_utilization_pct?: 'up' | 'down' | 'flat';
  };
}

interface DeliveryProject {
  id: string;
  name: string;
  status: string;
  total_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  health_score: number;
}

interface AttendanceRow {
  user_id: string;
  name: string;
  present_days: number;
  absent_days: number;
  wfh_days: number;
  avg_hours: number;
}

interface DeptHeadcount {
  department: string;
  count: number;
}

interface TimeSummaryRow {
  user_id: string;
  name: string;
  total_hours: number;
  billable_hours: number;
}

interface ProjectTimeSummary {
  project_id: string;
  project_name: string;
  total_hours: number;
}

interface AssetStatus {
  available: number;
  assigned: number;
  maintenance: number;
  retired: number;
}

interface AssetCategoryRow {
  category: string;
  total: number;
  assigned: number;
  available: number;
}

interface MaintenanceDue {
  asset_id: string;
  asset_name: string;
  due_date: string;
  assigned_to?: string;
}

interface PdfResult {
  share_link?: string;
  url?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TABS = [
  'Executive Brief',
  'Delivery Health',
  'People',
  'Time',
  'Assets',
] as const;
type Tab = (typeof TABS)[number];

type TrendDir = 'up' | 'down' | 'flat';

const TrendIcon = ({ dir, size = 14 }: { dir?: TrendDir; size?: number }) => {
  if (dir === 'up') return <TrendingUp size={size} className="text-green-500" />;
  if (dir === 'down') return <TrendingDown size={size} className="text-red-500" />;
  return <Minus size={size} className="text-gray-400" />;
};

const healthColor = (score: number) => {
  if (score > 70) return 'bg-green-500';
  if (score >= 40) return 'bg-amber-400';
  return 'bg-red-500';
};

const healthTextColor = (score: number) => {
  if (score > 70) return 'text-green-700';
  if (score >= 40) return 'text-amber-700';
  return 'text-red-700';
};

const fmt = (n: number, decimals = 1) =>
  Number.isFinite(n) ? n.toFixed(decimals) : '—';

const currentMonthParam = () => ({
  month: String(new Date().getMonth() + 1),
  year: String(new Date().getFullYear()),
});

// ─── Executive Brief Tab ──────────────────────────────────────────────────────

const ExecutiveBriefTab = () => {
  const { data, isLoading, error } = useExecutiveBrief();
  const generatePdf = useGeneratePdfExport();

  const [showExport, setShowExport] = useState(false);
  const [exportResult, setExportResult] = useState<PdfResult | null>(null);
  const [exportError, setExportError] = useState('');

  const brief: ExecutiveBrief | undefined = useMemo(
    () => data?.data ?? data,
    [data]
  );

  const handleExport = async () => {
    setExportError('');
    try {
      const result = await generatePdf.mutateAsync({ type: 'executive_brief' });
      setExportResult((result?.data ?? result) as PdfResult);
      setShowExport(true);
    } catch (e: unknown) {
      setExportError((e as Error).message ?? 'Export failed.');
      setShowExport(true);
    }
  };

  if (isLoading) return <PageSkeleton />;
  if (error)
    return (
      <Alert type="error" message="Failed to load executive brief." className="m-6" />
    );

  const trends = brief?.trends ?? {};

  const stats = [
    {
      label: 'Active Projects',
      value: brief?.active_projects ?? 0,
      trend: trends.active_projects,
      icon: <BarChart2 size={18} />,
      color: 'blue' as const,
    },
    {
      label: 'On-Track %',
      value: `${fmt(brief?.on_track_pct ?? 0, 0)}%`,
      trend: trends.on_track_pct,
      icon: <CheckCircle size={18} />,
      color: 'green' as const,
    },
    {
      label: 'Total Headcount',
      value: brief?.total_headcount ?? 0,
      trend: trends.total_headcount,
      icon: <Users size={18} />,
      color: 'purple' as const,
    },
    {
      label: 'Attendance Rate (Month)',
      value: `${fmt(brief?.attendance_rate ?? 0, 0)}%`,
      trend: trends.attendance_rate,
      icon: <Activity size={18} />,
      color: 'amber' as const,
    },
    {
      label: 'Billable Hours (Month)',
      value: fmt(brief?.billable_hours ?? 0, 0),
      trend: trends.billable_hours,
      icon: <Clock size={18} />,
      color: 'blue' as const,
    },
    {
      label: 'Asset Utilization %',
      value: `${fmt(brief?.asset_utilization_pct ?? 0, 0)}%`,
      trend: trends.asset_utilization_pct,
      icon: <Package size={18} />,
      color: 'amber' as const,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          icon={<FileDown size={14} />}
          loading={generatePdf.isPending}
          onClick={handleExport}
        >
          Export to PDF
        </Button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500">{stat.label}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stat.value}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className={`p-2.5 rounded-lg bg-${stat.color}-50 text-${stat.color}-600`}>
                  {stat.icon}
                </div>
                <TrendIcon dir={stat.trend} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* PDF Export Modal */}
      <Modal
        open={showExport}
        onClose={() => {
          setShowExport(false);
          setExportResult(null);
          setExportError('');
        }}
        title="Export Report"
        size="sm"
      >
        {exportError ? (
          <Alert type="error" message={exportError} />
        ) : (
          <div className="space-y-3">
            <Alert type="success" message="Your PDF report has been generated." />
            {(exportResult?.share_link ?? exportResult?.url) && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Share Link
                </label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={exportResult?.share_link ?? exportResult?.url ?? ''}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        exportResult?.share_link ?? exportResult?.url ?? ''
                      );
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        <ModalActions>
          <Button
            variant="primary"
            onClick={() => {
              setShowExport(false);
              setExportResult(null);
              setExportError('');
            }}
          >
            Done
          </Button>
        </ModalActions>
      </Modal>
    </div>
  );
};

// ─── Delivery Health Tab ──────────────────────────────────────────────────────

const DeliveryHealthTab = () => {
  const [dateFrom, setDateFrom] = useState(
    format(startOfMonth(new Date()), 'yyyy-MM-dd')
  );
  const [dateTo, setDateTo] = useState(
    format(endOfMonth(new Date()), 'yyyy-MM-dd')
  );

  const { data, isLoading, error } = useDeliveryHealth({
    date_from: dateFrom,
    date_to: dateTo,
  });

  const projects: DeliveryProject[] = useMemo(() => {
    const raw = data?.data ?? data ?? [];
    return Array.isArray(raw) ? raw : [];
  }, [data]);

  if (isLoading) return <PageSkeleton />;
  if (error)
    return (
      <Alert type="error" message="Failed to load delivery health." className="m-6" />
    );

  return (
    <div className="space-y-5">
      {/* Date filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="No project data"
          description="No delivery data found for the selected period."
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    Project
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    Tasks
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    Done
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    Overdue
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider min-w-[160px]">
                    Health Score
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {projects.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {p.total_tasks}
                    </td>
                    <td className="px-4 py-3 text-right text-green-700 font-medium">
                      {p.completed_tasks}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.overdue_tasks > 0 ? (
                        <span className="text-red-600 font-medium">
                          {p.overdue_tasks}
                        </span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${healthColor(
                              p.health_score
                            )}`}
                            style={{
                              width: `${Math.min(100, Math.max(0, p.health_score))}%`,
                            }}
                          />
                        </div>
                        <span
                          className={`text-xs font-semibold w-8 text-right shrink-0 ${healthTextColor(
                            p.health_score
                          )}`}
                        >
                          {p.health_score}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── People Tab ───────────────────────────────────────────────────────────────

const PeopleTab = () => {
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));

  const params = { month, year };

  const { data: peopleData, isLoading: loadingPeople } = usePeopleSummaryReport(params);
  const { data: attendanceData, isLoading: loadingAttendance } = useAttendanceReport(params);

  const deptHeadcounts: DeptHeadcount[] = useMemo(() => {
    const raw = peopleData?.data?.headcount_by_department ??
      peopleData?.headcount_by_department ?? [];
    return Array.isArray(raw) ? raw : [];
  }, [peopleData]);

  const attendanceRows: AttendanceRow[] = useMemo(() => {
    const raw =
      attendanceData?.data?.rows ?? attendanceData?.rows ??
      attendanceData?.data ?? attendanceData ?? [];
    return Array.isArray(raw) ? raw : [];
  }, [attendanceData]);

  const maxCount = useMemo(
    () => Math.max(...deptHeadcounts.map((d) => d.count), 1),
    [deptHeadcounts]
  );

  const months = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];
  const years = Array.from({ length: 5 }, (_, i) =>
    String(now.getFullYear() - i)
  );

  return (
    <div className="space-y-6">
      {/* Month/Year filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Month</label>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {months.map((m, i) => (
              <option key={m} value={String(i + 1)}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Year</label>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Headcount by Department */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          Headcount by Department
        </h3>
        {loadingPeople ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-3 bg-gray-200 rounded w-1/4 mb-1" />
                <div className="h-5 bg-gray-200 rounded w-3/4" />
              </div>
            ))}
          </div>
        ) : deptHeadcounts.length === 0 ? (
          <EmptyState
            title="No department data"
            description="No headcount data available."
          />
        ) : (
          <div className="space-y-3">
            {deptHeadcounts.map((dept) => (
              <div key={dept.department}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700">{dept.department}</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {dept.count}
                  </span>
                </div>
                <div className="h-5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{ width: `${(dept.count / maxCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Attendance Summary */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          Attendance Summary
        </h3>
        {loadingAttendance ? (
          <PageSkeleton />
        ) : attendanceRows.length === 0 ? (
          <EmptyState
            title="No attendance data"
            description="No attendance records for the selected period."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    Employee
                  </th>
                  <th className="text-right px-3 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    Present
                  </th>
                  <th className="text-right px-3 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    Absent
                  </th>
                  <th className="text-right px-3 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    WFH
                  </th>
                  <th className="text-right px-3 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    Avg Hours
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {attendanceRows.map((row) => (
                  <tr key={row.user_id} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 font-medium text-gray-900">
                      {row.name}
                    </td>
                    <td className="px-3 py-2.5 text-right text-green-700">
                      {row.present_days}
                    </td>
                    <td className="px-3 py-2.5 text-right text-red-600">
                      {row.absent_days}
                    </td>
                    <td className="px-3 py-2.5 text-right text-blue-600">
                      {row.wfh_days}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700">
                      {fmt(row.avg_hours)}h
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

// ─── Time Tab ─────────────────────────────────────────────────────────────────

const TimeTab = () => {
  const [dateFrom, setDateFrom] = useState(
    format(startOfMonth(new Date()), 'yyyy-MM-dd')
  );
  const [dateTo, setDateTo] = useState(
    format(endOfMonth(new Date()), 'yyyy-MM-dd')
  );

  const { data, isLoading, error } = useTimeSummaryReport({
    date_from: dateFrom,
    date_to: dateTo,
  });

  const userRows: TimeSummaryRow[] = useMemo(() => {
    const raw =
      data?.data?.by_user ?? data?.by_user ?? data?.data ?? data ?? [];
    return Array.isArray(raw) ? raw : [];
  }, [data]);

  const projectRows: ProjectTimeSummary[] = useMemo(() => {
    const raw = data?.data?.by_project ?? data?.by_project ?? [];
    return Array.isArray(raw) ? raw : [];
  }, [data]);

  const maxProjectHours = useMemo(
    () => Math.max(...projectRows.map((p) => p.total_hours), 1),
    [projectRows]
  );

  if (isLoading) return <PageSkeleton />;
  if (error)
    return (
      <Alert type="error" message="Failed to load time summary." className="m-6" />
    );

  return (
    <div className="space-y-5">
      {/* Date filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* By User */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Hours by Employee</h3>
        {userRows.length === 0 ? (
          <EmptyState title="No time data" description="No tracked hours for the selected range." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    Employee
                  </th>
                  <th className="text-right px-3 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    Total Hours
                  </th>
                  <th className="text-right px-3 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    Billable Hours
                  </th>
                  <th className="text-right px-3 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    Billable %
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {userRows.map((row) => {
                  const pct =
                    row.total_hours > 0
                      ? (row.billable_hours / row.total_hours) * 100
                      : 0;
                  return (
                    <tr key={row.user_id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-medium text-gray-900">
                        {row.name}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700">
                        {fmt(row.total_hours)}h
                      </td>
                      <td className="px-3 py-2.5 text-right text-blue-600">
                        {fmt(row.billable_hours)}h
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span
                          className={`font-semibold ${
                            pct >= 80
                              ? 'text-green-600'
                              : pct >= 60
                              ? 'text-amber-600'
                              : 'text-red-600'
                          }`}
                        >
                          {fmt(pct, 0)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* By Project bar chart */}
      {projectRows.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            Hours by Project
          </h3>
          <div className="space-y-3">
            {projectRows.map((p) => (
              <div key={p.project_id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700 truncate max-w-[60%]">
                    {p.project_name}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">
                    {fmt(p.total_hours)}h
                  </span>
                </div>
                <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{
                      width: `${(p.total_hours / maxProjectHours) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

// ─── Assets Tab ───────────────────────────────────────────────────────────────

const AssetsTab = () => {
  const { data, isLoading, error } = useAssetSummaryReport();

  const assetStatus: AssetStatus = useMemo(
    () =>
      data?.data?.status_summary ?? data?.status_summary ?? {
        available: 0,
        assigned: 0,
        maintenance: 0,
        retired: 0,
      },
    [data]
  );

  const categories: AssetCategoryRow[] = useMemo(() => {
    const raw =
      data?.data?.by_category ?? data?.by_category ?? [];
    return Array.isArray(raw) ? raw : [];
  }, [data]);

  const maintenanceDue: MaintenanceDue[] = useMemo(() => {
    const raw =
      data?.data?.maintenance_due ?? data?.maintenance_due ?? [];
    return Array.isArray(raw) ? raw : [];
  }, [data]);

  if (isLoading) return <PageSkeleton />;
  if (error)
    return (
      <Alert type="error" message="Failed to load asset summary." className="m-6" />
    );

  const statusCards = [
    {
      label: 'Available',
      value: assetStatus.available,
      color: 'green' as const,
      icon: <CheckCircle size={18} />,
    },
    {
      label: 'Assigned',
      value: assetStatus.assigned,
      color: 'blue' as const,
      icon: <Users size={18} />,
    },
    {
      label: 'In Maintenance',
      value: assetStatus.maintenance,
      color: 'amber' as const,
      icon: <Activity size={18} />,
    },
    {
      label: 'Retired',
      value: assetStatus.retired,
      color: 'red' as const,
      icon: <Package size={18} />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Status cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statusCards.map((s) => (
          <StatCard
            key={s.label}
            label={s.label}
            value={s.value}
            icon={s.icon}
            color={s.color}
          />
        ))}
      </div>

      {/* Maintenance Alerts */}
      {maintenanceDue.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">
            Maintenance Due Alerts
          </h3>
          {maintenanceDue.map((item) => (
            <Alert
              key={item.asset_id}
              type="warning"
              message={`${item.asset_name} — Due ${item.due_date}${
                item.assigned_to ? ` (assigned to ${item.assigned_to})` : ''
              }`}
            />
          ))}
        </div>
      )}

      {/* Category breakdown */}
      {categories.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            By Category
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    Category
                  </th>
                  <th className="text-right px-3 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    Total
                  </th>
                  <th className="text-right px-3 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    Assigned
                  </th>
                  <th className="text-right px-3 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    Available
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {categories.map((cat) => (
                  <tr key={cat.category} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 font-medium text-gray-900">
                      {cat.category}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700">
                      {cat.total}
                    </td>
                    <td className="px-3 py-2.5 text-right text-blue-600">
                      {cat.assigned}
                    </td>
                    <td className="px-3 py-2.5 text-right text-green-600">
                      {cat.available}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {categories.length === 0 && maintenanceDue.length === 0 && (
        <EmptyState
          title="No asset data"
          description="Asset breakdown will appear here once assets are tracked."
          icon={<Package size={36} />}
        />
      )}
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const EnterpriseReportsPage = () => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('Executive Brief');

  return (
    <Layout>
      <Header
        title="Enterprise Reports"
        subtitle="Executive-level cross-domain insights and analytics"
      />
      <div className="p-6 space-y-6">
        {/* Tab bar */}
        <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap rounded-t-lg transition-colors -mb-px ${
                activeTab === tab
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'Executive Brief' && <ExecutiveBriefTab />}
        {activeTab === 'Delivery Health' && <DeliveryHealthTab />}
        {activeTab === 'People' && <PeopleTab />}
        {activeTab === 'Time' && <TimeTab />}
        {activeTab === 'Assets' && <AssetsTab />}
      </div>
    </Layout>
  );
};

export default EnterpriseReportsPage;
