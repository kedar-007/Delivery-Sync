import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { actionsApi } from '../lib/api';

export const useActions = (params?: Record<string, string>) =>
  useQuery({
    queryKey: ['actions', params],
    queryFn: () => actionsApi.list(params).then((d) => d.actions ?? d),
  });

export const useActionsPaginated = (params: Record<string, string | number> = {}) =>
  useQuery({
    queryKey: ['actions', 'paginated', params],
    queryFn: () => actionsApi.list(params as Record<string, string>),
  });

export const useCreateAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => actionsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['actions'] }),
  });
};

export const useUpdateAction = (actionId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => actionsApi.update(actionId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['actions'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export const useDeleteAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => actionsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['actions'] }),
  });
};
