import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { eodApi } from '../lib/api';

export const useEod = (
  params?: Record<string, string>,
  options?: { enabled?: boolean }
) =>
  useQuery({
    queryKey: ['eod', params],
    queryFn: () => eodApi.list(params).then((d) => d.eods),
    enabled: options?.enabled !== false,
  });

// Pagination shape mirrors `useStandupsPaged`. The backend serves the legacy
// `{ eods: [...] }` shape when `page` is omitted, and `{ eods, pagination }`
// when it's present. The hook normalises both so callers can render
// pagination controls uniformly.
export interface EodPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface EodResult { data: any[]; pagination: EodPagination | null; }

export const useEodPaged = (
  params?: Record<string, string>,
  options?: { enabled?: boolean }
) =>
  useQuery<EodResult>({
    queryKey: ['eod', 'paged', params],
    queryFn: async () => {
      const res = await eodApi.list(params);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = res as any;
      if (r && Array.isArray(r.eods) && r.pagination) {
        return { data: r.eods, pagination: r.pagination as EodPagination };
      }
      const arr = (r && Array.isArray(r.eods)) ? r.eods : [];
      return { data: arr, pagination: null };
    },
    enabled: options?.enabled !== false,
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

export const useSearchEod = (q: string) =>
  useQuery({
    queryKey: ['eod', 'search', q],
    queryFn: () => eodApi.search(q).then((d) => d.eods ?? []),
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
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

export const useUpdateEod = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => eodApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['eod'] });
      qc.invalidateQueries({ queryKey: ['eod-rollup'] });
    },
  });
};
