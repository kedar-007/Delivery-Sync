import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { standupsApi } from '../lib/api';

export const useStandups = (
  params?: Record<string, string>,
  options?: { enabled?: boolean }
) =>
  useQuery({
    queryKey: ['standups', params],
    queryFn: () => standupsApi.list(params).then((d) => d.standups),
    enabled: options?.enabled !== false,
  });

// Paginated variant — used by the Team Standups tab where the result set can
// span many users and many days. Pass `page` + `pageSize` in `params` and the
// backend returns { standups: [...], pagination: {...} }. The hook always
// resolves to `{ data, pagination }`, falling back to `pagination: null` when
// the backend returned the legacy (non-paginated) shape.
export interface StandupsPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface StandupsResult { data: any[]; pagination: StandupsPagination | null; }

export const useStandupsPaged = (
  params?: Record<string, string>,
  options?: { enabled?: boolean }
) =>
  useQuery<StandupsResult>({
    queryKey: ['standups', 'paged', params],
    queryFn: async () => {
      const res = await standupsApi.list(params);
      // Paginated shape: { standups, pagination }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = res as any;
      if (r && Array.isArray(r.standups) && r.pagination) {
        return { data: r.standups, pagination: r.pagination as StandupsPagination };
      }
      // Legacy shape: { standups: [...] }
      const arr = (r && Array.isArray(r.standups)) ? r.standups : [];
      return { data: arr, pagination: null };
    },
    enabled: options?.enabled !== false,
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

export const useSearchStandups = (q: string) =>
  useQuery({
    queryKey: ['standups', 'search', q],
    queryFn: () => standupsApi.search(q).then((d) => d.standups ?? []),
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
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

export const useUpdateStandup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => standupsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['standups'] });
      qc.invalidateQueries({ queryKey: ['standup-rollup'] });
    },
  });
};
