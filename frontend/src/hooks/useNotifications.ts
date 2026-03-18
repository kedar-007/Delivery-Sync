import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../lib/api';

const KEY = 'notifications';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export const useNotifications = (unreadOnly = false) =>
  useQuery({
    queryKey: [KEY, { unreadOnly }],
    queryFn: () =>
      notificationsApi.list(unreadOnly ? { unreadOnly: 'true' } : {}).then(
        (d) => d as { notifications: Notification[]; unreadCount: number }
      ),
    refetchInterval: 30_000, // poll every 30s for real-time feel
  });

export const useUnreadCount = () =>
  useQuery({
    queryKey: [KEY, 'count'],
    queryFn: () => notificationsApi.count().then((d) => (d as { count: number }).count),
    refetchInterval: 30_000,
  });

export const useMarkRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
};

export const useMarkAllRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
};

export const useDeleteNotification = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
};
