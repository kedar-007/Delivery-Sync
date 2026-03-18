import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../lib/api';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ExecProject {
  id: string;
  name: string;
  status: string;
  ragStatus: string;
  startDate: string;
  endDate: string;
  openBlockers: number;
  criticalBlockers: number;
  overdueActions: number;
  totalActions: number;
  totalMilestones: number;
  completedMilestones: number;
  milestoneProgress: number;
  overdueMilestones: number;
  healthScore: number;
}

export interface ExecBlocker {
  id: string;
  title: string;
  severity: string;
  status: string;
  projectId: string;
  raisedDate: string;
}

export interface ExecMilestone {
  id: string;
  title: string;
  dueDate: string;
  projectId: string;
  status?: string;
}

export interface ActivityDay {
  date: string;
  standups: number;
  eods: number;
}

export interface ExecSummaryData {
  portfolio: {
    total: number;
    active: number;
    completed: number;
    onHold: number;
    byRag: { RED: number; AMBER: number; GREEN: number };
    healthScore: number;
  };
  milestones: {
    total: number;
    completed: number;
    overdue: number;
    upcoming7days: number;
    completionRate: number;
  };
  actions: {
    total: number;
    open: number;
    overdue: number;
    done: number;
    completionRate: number;
  };
  blockers: {
    open: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  risks: { open: number; critical: number; high: number };
  decisions: { total: number; thisMonth: number };
  dependencies: { open: number };
  teams: { total: number; memberCount: number };
  standups: {
    submittedToday: number;
    last7DaysTotal: number;
    submissionRateLast7d: number;
  };
  eods: { submittedToday: number; last7DaysTotal: number };
  activityTrend: ActivityDay[];
  projects: ExecProject[];
  topBlockers: ExecBlocker[];
  upcomingMilestones: ExecMilestone[];
  overdueMilestones: ExecMilestone[];
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export const useExecSummary = () =>
  useQuery<ExecSummaryData>({
    queryKey: ['exec-summary'],
    queryFn:  dashboardApi.getExecSummary,
    staleTime: 1000 * 60 * 5, // 5 min
    refetchOnWindowFocus: false,
  });
