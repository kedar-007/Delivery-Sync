'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bugApi, BugReport, BugReportConfig } from '../lib/api';

export const useBugReports = (params?: Record<string, string>) =>
  useQuery({
    queryKey: ['bug-reports', params],
    queryFn:  () => bugApi.list(params),
    // Always re-fetch on mount so new submissions appear when the user comes
    // back to the page — without this, React Query serves the cached list.
    refetchOnMount: 'always',
  });

export const useBugReport = (id: string) =>
  useQuery({
    queryKey: ['bug-reports', id],
    queryFn:  () => bugApi.get(id),
    enabled:  !!id,
  });

// `enabled` lets callers (e.g. BugReportsPage) gate the request on isAdmin so
// non-admins don't trigger a 403 on /reports/all that the backend would log.
export const useAllBugReports = (
  params?: Record<string, string>,
  options?: { enabled?: boolean }
) =>
  useQuery({
    queryKey: ['bug-reports-all', params],
    queryFn:  () => bugApi.listAll(params),
    enabled:  options?.enabled !== false,
    refetchOnMount: 'always',
  });

export const useSubmitBugReport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<BugReport>) => bugApi.submit(data),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['bug-reports'] });
      qc.invalidateQueries({ queryKey: ['bug-reports-all'] }); // super-admin view
    },
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
