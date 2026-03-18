import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reportsApi } from '../lib/api';

export const useReports = (params?: Record<string, string>) =>
  useQuery({
    queryKey: ['reports', params],
    queryFn: () => reportsApi.list(params).then((d) => d.reports),
  });

export const useReport = (id: string) =>
  useQuery({
    queryKey: ['reports', id],
    queryFn: () => reportsApi.get(id).then((d) => d.report),
    enabled: !!id,
  });

export const useGenerateReport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => reportsApi.generate(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
  });
};
