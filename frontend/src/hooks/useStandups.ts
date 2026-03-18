import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { standupsApi } from '../lib/api';

export const useStandups = (params?: Record<string, string>) =>
  useQuery({
    queryKey: ['standups', params],
    queryFn: () => standupsApi.list(params).then((d) => d.standups),
  });

export const useStandupRollup = (params: { projectId: string; startDate?: string; endDate?: string }) =>
  useQuery({
    queryKey: ['standup-rollup', params],
    queryFn: () => standupsApi.rollup(params),
    enabled: !!params.projectId,
  });

export const useMyTodayStandup = (projectId?: string) =>
  useQuery({
    queryKey: ['standup-today', projectId],
    queryFn: () => standupsApi.myToday(projectId).then((d) => d.standups),
  });

export const useSubmitStandup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => standupsApi.submit(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['standups'] });
      qc.invalidateQueries({ queryKey: ['standup-today'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};
