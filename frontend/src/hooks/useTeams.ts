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

export const useRemoveTeamMember = (teamId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => teamsApi.removeMember(teamId, memberId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, teamId] }),
  });
};
