import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamsApi } from '../lib/api';

const KEY = 'teams';

export const useTeams = (projectId?: string) =>
  useQuery({
    queryKey: [KEY, { projectId }],
    queryFn: () =>
      teamsApi.list(projectId ? { projectId } : {}).then((d: any) => d.teams ?? []),
    enabled: true,
  });

export const useTeam = (teamId: string) =>
  useQuery({
    queryKey: [KEY, teamId],
    queryFn: () => teamsApi.get(teamId).then((d: any) => d.team),
    enabled: !!teamId,
  });

// Roster for *_TEAM_VIEW user-filter dropdowns. Returns every user the caller
// is allowed to see (team peers + leads, or the full tenant for org-wide
// callers), so dropdowns aren't limited to who happens to have posted today.
export type TeamPeer = { id: string; name: string; email?: string; avatarUrl?: string };

export const useTeamPeers = (enabled = true) =>
  useQuery<TeamPeer[]>({
    queryKey: [KEY, 'peers'],
    queryFn: () => teamsApi.peers().then((d: any) => (d?.peers ?? []) as TeamPeer[]),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

export const useCreateTeam = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => teamsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
};

export const useUpdateTeam = (teamId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => teamsApi.update(teamId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: [KEY, teamId] });
    },
  });
};

export const useDeleteTeam = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (teamId: string) => teamsApi.delete(teamId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
};

export const useAddTeamMember = (teamId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => teamsApi.addMember(teamId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, teamId] }),
  });
};

export const useUpdateTeamMember = (teamId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: string }) =>
      teamsApi.updateMember(teamId, memberId, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, teamId] }),
  });
};

export const useRemoveTeamMember = (teamId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => teamsApi.removeMember(teamId, memberId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, teamId] }),
  });
};
