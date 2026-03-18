import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../lib/api';

export const useDashboardSummary = () =>
  useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: dashboardApi.getSummary,
    staleTime: 1000 * 60, // 1 min
  });

export const usePortfolioDashboard = () =>
  useQuery({
    queryKey: ['dashboard', 'portfolio'],
    queryFn: dashboardApi.getPortfolio,
  });

export const useProjectDashboard = (projectId: string) =>
  useQuery({
    queryKey: ['dashboard', 'project', projectId],
    queryFn: () => dashboardApi.getProjectDashboard(projectId),
    enabled: !!projectId,
  });
