import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { enterpriseReportsApi } from '../lib/api';

export const useDeliveryHealth = (params?: Record<string, string>) =>
  useQuery({ queryKey: ['ereports', 'delivery-health', params], queryFn: () => enterpriseReportsApi.deliveryHealth(params) });

export const useProjectHealthReport = (projectId: string) =>
  useQuery({ queryKey: ['ereports', 'project-health', projectId], queryFn: () => enterpriseReportsApi.projectHealth(projectId), enabled: !!projectId });

export const usePeopleSummaryReport = (params?: Record<string, string>) =>
  useQuery({ queryKey: ['ereports', 'people', params], queryFn: () => enterpriseReportsApi.peopleSummary(params) });

export const useAttendanceReport = (params?: Record<string, string>) =>
  useQuery({ queryKey: ['ereports', 'attendance', params], queryFn: () => enterpriseReportsApi.attendanceReport(params) });

export const useLeaveReport = (params?: Record<string, string>) =>
  useQuery({ queryKey: ['ereports', 'leave', params], queryFn: () => enterpriseReportsApi.leaveReport(params) });

export const useTimeSummaryReport = (params?: Record<string, string>) =>
  useQuery({ queryKey: ['ereports', 'time', params], queryFn: () => enterpriseReportsApi.timeSummary(params) });

export const useAssetSummaryReport = () =>
  useQuery({ queryKey: ['ereports', 'assets'], queryFn: () => enterpriseReportsApi.assetSummary() });

export const useExecutiveBrief = () =>
  useQuery({ queryKey: ['ereports', 'executive-brief'], queryFn: () => enterpriseReportsApi.executiveBrief() });

export const useGeneratePdfExport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => enterpriseReportsApi.generatePdf(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ereports', 'pdf-jobs'] }),
  });
};
