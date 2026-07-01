import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { featureReleasesApi } from '../lib/api';
import { useToast } from '../components/ui/Toast';

export interface FeatureRelease {
  ROWID: string;
  title: string;
  description?: string;
  category?: string;
  version?: string;
  media_url?: string;
  cta_label?: string;
  cta_route?: string;
  is_published?: boolean | string;
  published_at?: string;
  is_new?: boolean;
  seen_count?: number;
  CREATEDTIME?: string;
}

export interface ManageReleasesResult {
  releases: FeatureRelease[];
  totalUsers: number;
}

export interface SeenPerson { id: string; name: string; email: string; avatar_url?: string; seen_at?: string }
export interface SeenStatus { seen: SeenPerson[]; notSeen: SeenPerson[]; total: number }

export interface FeatureReleaseList {
  releases: FeatureRelease[];
  unreadCount: number;
  lastSeenAt: string | null;
}

// User-facing: published releases + unread count. Polls modestly and refetches
// on focus so a freshly published release surfaces without a reload.
export const useFeatureReleases = (enabled = true) =>
  useQuery<FeatureReleaseList>({
    queryKey: ['feature-releases'],
    queryFn: () => featureReleasesApi.list() as Promise<FeatureReleaseList>,
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

export const useMarkReleasesSeen = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => featureReleasesApi.markSeen(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feature-releases'] }),
  });
};

// ── Admin authoring ─────────────────────────────────────────────────────────
export const useManageReleases = (enabled = true) =>
  useQuery<ManageReleasesResult>({
    queryKey: ['feature-releases', 'manage'],
    queryFn: () => featureReleasesApi.listManage() as Promise<ManageReleasesResult>,
    enabled,
    // Seen counts change as users open What's New — keep the admin view fresh.
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

export const useReleaseSeenStatus = (id: string | null) =>
  useQuery<SeenStatus>({
    queryKey: ['feature-releases', 'seen-status', id],
    queryFn: () => featureReleasesApi.seenStatus(id as string) as Promise<SeenStatus>,
    enabled: !!id,
  });

const useReleaseMutation = <T>(fn: (arg: T) => Promise<unknown>, okMsg: string) => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feature-releases'] });
      toast.success(okMsg);
    },
    onError: (e: Error) => toast.error(e.message || 'Something went wrong'),
  });
};

export const useCreateRelease = () =>
  useReleaseMutation((data: unknown) => featureReleasesApi.create(data), 'Release saved');

export const useUpdateRelease = () =>
  useReleaseMutation(({ id, data }: { id: string; data: unknown }) => featureReleasesApi.update(id, data), 'Release updated');

export const usePublishRelease = () =>
  useReleaseMutation(({ id, publish }: { id: string; publish: boolean }) => featureReleasesApi.publish(id, publish), 'Updated');

export const useDeleteRelease = () =>
  useReleaseMutation((id: string) => featureReleasesApi.remove(id), 'Release deleted');
