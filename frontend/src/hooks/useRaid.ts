import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { raidApi } from '../lib/api';

// ─── Risks ────────────────────────────────────────────────────────────────────
export const useRisks = (params?: Record<string, string>) =>
  useQuery({ queryKey: ['risks', params], queryFn: () => raidApi.risks.list(params).then((d) => d.risks) });

export const useCreateRisk = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: raidApi.risks.create, onSuccess: () => qc.invalidateQueries({ queryKey: ['risks'] }) });
};

export const useUpdateRisk = (id: string) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: unknown) => raidApi.risks.update(id, data), onSuccess: () => qc.invalidateQueries({ queryKey: ['risks'] }) });
};

// ─── Issues ───────────────────────────────────────────────────────────────────
export const useIssues = (params?: Record<string, string>) =>
  useQuery({ queryKey: ['issues', params], queryFn: () => raidApi.issues.list(params).then((d) => d.issues) });

export const useCreateIssue = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: raidApi.issues.create, onSuccess: () => qc.invalidateQueries({ queryKey: ['issues'] }) });
};

export const useUpdateIssue = (id: string) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: unknown) => raidApi.issues.update(id, data), onSuccess: () => qc.invalidateQueries({ queryKey: ['issues'] }) });
};

// ─── Dependencies ─────────────────────────────────────────────────────────────
export const useDependencies = (params?: Record<string, string>) =>
  useQuery({ queryKey: ['dependencies', params], queryFn: () => raidApi.dependencies.list(params).then((d) => d.dependencies) });

export const useCreateDependency = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: raidApi.dependencies.create, onSuccess: () => qc.invalidateQueries({ queryKey: ['dependencies'] }) });
};

// Added
export const useUpdateDependency = (id: string) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: unknown) => raidApi.dependencies.update(id, data), onSuccess: () => qc.invalidateQueries({ queryKey: ['dependencies'] }) });
};

// ─── Assumptions ──────────────────────────────────────────────────────────────
export const useAssumptions = (params?: Record<string, string>) =>
  useQuery({ queryKey: ['assumptions', params], queryFn: () => raidApi.assumptions.list(params).then((d) => d.assumptions) });

export const useCreateAssumption = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: raidApi.assumptions.create, onSuccess: () => qc.invalidateQueries({ queryKey: ['assumptions'] }) });
};

// Added
export const useUpdateAssumption = (id: string) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: unknown) => raidApi.assumptions.update(id, data), onSuccess: () => qc.invalidateQueries({ queryKey: ['assumptions'] }) });
};