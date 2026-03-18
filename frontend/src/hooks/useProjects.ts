import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../lib/api';

export const PROJECTS_KEY = 'projects';

export const useProjects = () =>
  useQuery({
    queryKey: [PROJECTS_KEY],
    queryFn: () => projectsApi.list().then((d) => d.projects),
  });

export const useProject = (id: string) =>
  useQuery({
    queryKey: [PROJECTS_KEY, id],
    queryFn: () => projectsApi.get(id).then((d) => d.project),
    enabled: !!id,
  });

export const useCreateProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => projectsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [PROJECTS_KEY] }),
  });
};

export const useUpdateProject = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => projectsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PROJECTS_KEY] });
      qc.invalidateQueries({ queryKey: [PROJECTS_KEY, id] });
    },
  });
};

export const useUpdateRAG = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { rag_status: string; reason?: string }) => projectsApi.updateRAG(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PROJECTS_KEY] });
      qc.invalidateQueries({ queryKey: [PROJECTS_KEY, id] });
    },
  });
};

export const useMilestones = (projectId: string) =>
  useQuery({
    queryKey: [PROJECTS_KEY, projectId, 'milestones'],
    queryFn: () => projectsApi.getMilestones(projectId).then((d) => d.milestones),
    enabled: !!projectId,
  });

export const useCreateMilestone = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => projectsApi.createMilestone(projectId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [PROJECTS_KEY, projectId, 'milestones'] }),
  });
};

export const useUpdateMilestone = (projectId: string, milestoneId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => projectsApi.updateMilestone(projectId, milestoneId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [PROJECTS_KEY, projectId, 'milestones'] }),
  });
};

export const useProjectMembers = (projectId: string) =>
  useQuery({
    queryKey: [PROJECTS_KEY, projectId, 'members'],
    queryFn: () => projectsApi.getMembers(projectId).then((d) => d.members),
    enabled: !!projectId,
  });

export const useAddMember = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => projectsApi.addMember(projectId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [PROJECTS_KEY, projectId, 'members'] }),
  });
};

export const useRemoveMember = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => projectsApi.removeMember(projectId, memberId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [PROJECTS_KEY, projectId, 'members'] }),
  });
};
