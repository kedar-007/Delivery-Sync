import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { blockersApi } from '../lib/api';

export const useBlockers = (params?: Record<string, string>) =>
  useQuery({
    queryKey: ['blockers', params],
    queryFn: () => blockersApi.list(params).then((d) => d.blockers),
  });

export const useCreateBlocker = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => blockersApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['blockers'] }),
  });
};

// ID now comes from mutationFn payload, not hook argument
export const useUpdateBlocker = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) =>
      blockersApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blockers'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export const useResolveBlocker = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, resolution }: { id: string; resolution?: string }) =>
      blockersApi.resolve(id, resolution),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blockers'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};