import { useMutation } from '@tanstack/react-query';
import { aiApi, AiRequestParams } from '../lib/api';

/**
 * useAiInsights — custom hooks wrapping the five AI insight endpoints.
 *
 * All five endpoints are POST requests (they send filter params in the body
 * and trigger LLM processing), so we use useMutation rather than useQuery.
 * This also gives callers an explicit `mutate()` trigger and `isLoading` state.
 */

export const useAiDailySummary = () =>
  useMutation({
    mutationFn: (params: AiRequestParams) => aiApi.dailySummary(params),
  });

export const useAiProjectHealth = () =>
  useMutation({
    mutationFn: (params: AiRequestParams) => aiApi.projectHealth(params),
  });

export const useAiPerformance = () =>
  useMutation({
    mutationFn: (params: AiRequestParams) => aiApi.performance(params),
  });

export const useAiReport = () =>
  useMutation({
    mutationFn: (params: AiRequestParams & { type: string }) => aiApi.generateReport(params),
  });

export const useAiSuggestions = () =>
  useMutation({
    mutationFn: (params: AiRequestParams) => aiApi.suggestions(params),
  });

export const useAiDetectBlockers = () =>
  useMutation({
    mutationFn: (params: AiRequestParams & { days?: number }) => aiApi.detectBlockers(params),
  });

export const useAiTrends = () =>
  useMutation({
    mutationFn: (params: AiRequestParams & { days?: number }) => aiApi.analyzeTrends(params),
  });

export const useAiRetrospective = () =>
  useMutation({
    mutationFn: (params: AiRequestParams & { sprintStart?: string; sprintEnd?: string }) =>
      aiApi.generateRetrospective(params),
  });

export const useAiNLQuery = () =>
  useMutation({
    mutationFn: (params: { query: string; projectId?: string }) => aiApi.naturalLanguageQuery(params),
  });
