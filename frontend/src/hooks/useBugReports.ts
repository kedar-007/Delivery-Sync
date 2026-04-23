'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bugApi, BugReport, BugReportConfig } from '../lib/api';

export const useBugReports = (params?: Record<string, string>) =>
  useQuery({
    queryKey: ['bug-reports', params],
    queryFn:  () => bugApi.list(params),
  });

export const useBugReport = (id: string) =>
  useQuery({
    queryKey: ['bug-reports', id],
    queryFn:  () => bugApi.get(id),
    enabled:  !!id,
  });

export const useAllBugReports = (params?: Record<string, string>) =>
  useQuery({
    queryKey: ['bug-reports-all', params],
    queryFn:  () => bugApi.listAll(params),
  });

export const useSubmitBugReport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<BugReport>) => bugApi.submit(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['bug-reports'] }),
  });
};

export const useUpdateBugReport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<BugReport> }) =>
      bugApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bug-reports'] }),
  });
};

export const useBugConfig = () =>
  useQuery({
    queryKey: ['bug-config'],
    queryFn:  () => bugApi.getConfig(),
  });

export const useSaveBugConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<BugReportConfig>) => bugApi.saveConfig(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['bug-config'] }),
  });
};
