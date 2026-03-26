import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { profilesApi, badgesApi } from '../lib/api';

export const useMyProfile = () =>
  useQuery({ queryKey: ['profiles', 'me'], queryFn: () => profilesApi.me() });

export const useProfile = (userId: string) =>
  useQuery({ queryKey: ['profiles', userId], queryFn: () => profilesApi.getById(userId), enabled: !!userId });

export const useDirectory = (params?: Record<string, string>) =>
  useQuery({ queryKey: ['profiles', 'directory', params], queryFn: () => profilesApi.directory(params) });

export const useUpdateMyProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => profilesApi.updateMe(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles', 'me'] }),
  });
};

export const useBadges = () =>
  useQuery({ queryKey: ['badges'], queryFn: () => badgesApi.list() });

export const useBadgeLeaderboard = () =>
  useQuery({ queryKey: ['badges', 'leaderboard'], queryFn: () => badgesApi.leaderboard() });

export const useCreateBadge = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (formData: FormData) => badgesApi.create(formData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['badges'] });
    },
  });
};

export const useAwardBadge = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      badgesApi.award(id, data),

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['badges'] });
      qc.invalidateQueries({ queryKey: ['profiles'] });
    },
  });
};
