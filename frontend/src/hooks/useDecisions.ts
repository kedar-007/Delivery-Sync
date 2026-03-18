import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { decisionsApi } from '../lib/api';

export const useDecisions = (params?: Record<string, string>) =>
  useQuery({
    queryKey: ['decisions', params],
    queryFn: () => decisionsApi.list(params).then((d) => d.decisions),
  });

export const useCreateDecision = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => decisionsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['decisions'] }),
  });
};

export const useUpdateDecision = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => decisionsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['decisions'] }),
  });
};

export const useDeleteDecision = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => decisionsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['decisions'] }),
  });
};
