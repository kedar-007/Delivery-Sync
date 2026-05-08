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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bug-reports'] });
      qc.invalidateQueries({ queryKey: ['bug-reports-all'] });
    },
  });
};

export const useResolveBugReport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, resolution_notes }: { id: string; resolution_notes?: string }) =>
      bugApi.resolve(id, resolution_notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bug-reports'] });
      qc.invalidateQueries({ queryKey: ['bug-reports-all'] });
    },
  });
};

export const useReplyBugReport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, resolution_notes }: { id: string; resolution_notes: string }) =>
      bugApi.reply(id, resolution_notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bug-reports'] });
      qc.invalidateQueries({ queryKey: ['bug-reports-all'] });
    },
  });
};

export const useReporterReplyBugReport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reply }: { id: string; reply: string }) =>
      bugApi.reporterReply(id, reply),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bug-reports'] });
      qc.invalidateQueries({ queryKey: ['bug-reports-all'] });
    },
  });
};

export const useBugConfig = () =>
  useQuery({
    queryKey: ['bug-config'],
    queryFn:  () => bugApi.getConfig().then((d: any) => d?.config ?? d),
  });

export const useSaveBugConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<BugReportConfig>) => bugApi.saveConfig(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['bug-config'] }),
  });
};
