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

export const usePublicReport = (id: string) =>
  useQuery({
    queryKey: ['reports-public', id],
    queryFn: () => reportsApi.getPublic(id).then((d) => d.report),
    enabled: !!id,
    retry: false,
  });

export const useGenerateReport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => reportsApi.generate(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
  });
};

// Added
export const useUpdateReport = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => reportsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports'] });
      qc.invalidateQueries({ queryKey: ['reports', id] });
    },
  });
};