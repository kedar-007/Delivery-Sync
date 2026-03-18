import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { eodApi } from '../lib/api';

export const useEod = (params?: Record<string, string>) =>
  useQuery({
    queryKey: ['eod', params],
    queryFn: () => eodApi.list(params).then((d) => d.eods),
  });

export const useEodRollup = (params: { projectId: string; startDate?: string; endDate?: string }) =>
  useQuery({
    queryKey: ['eod-rollup', params],
    queryFn: () => eodApi.rollup(params),
    enabled: !!params.projectId,
  });

export const useMyTodayEod = (projectId?: string) =>
  useQuery({
    queryKey: ['eod-today', projectId],
    queryFn: () => eodApi.myToday(projectId).then((d) => d.eods),
  });

export const useSubmitEod = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => eodApi.submit(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['eod'] });
      qc.invalidateQueries({ queryKey: ['eod-today'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};
