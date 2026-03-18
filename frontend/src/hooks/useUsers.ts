import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../lib/api';

export interface TenantUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string;
}

export const useUsers = () =>
  useQuery<TenantUser[]>({
    queryKey: ['tenant-users'],
    queryFn: async () => {
      const data = await usersApi.list();
      return data?.users ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

export const useMyProfile = () =>
  useQuery({
    queryKey: ['my-profile'],
    queryFn: () => usersApi.getProfile().then((d) => d.user),
    staleTime: 2 * 60 * 1000,
  });

export const useUpdateProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name?: string; avatarUrl?: string }) => usersApi.updateProfile(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-profile'] });
      qc.invalidateQueries({ queryKey: ['tenant-users'] });
    },
  });
};

export const useUploadAvatar = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { fileName: string; contentType: string; base64: string }) =>
      usersApi.uploadAvatar(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-profile'] });
      qc.invalidateQueries({ queryKey: ['tenant-users'] });
    },
  });
};
