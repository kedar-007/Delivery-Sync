import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../lib/api';
import { useToast } from '../components/ui/Toast';

export const PROJECTS_KEY = 'projects';

export const useProjects = () =>
  useQuery({
    queryKey: [PROJECTS_KEY],
    queryFn: () => projectsApi.list().then((d) => d.projects ?? d),
  });

/** Returns only projects the current user is a member of, regardless of role.
 *  Use this for personal views (timesheets, personal dashboards) so that
 *  admins see their own projects, not every project in the tenant. */
export const useMyProjects = () =>
  useQuery({
    queryKey: [PROJECTS_KEY, 'mine'],
    queryFn: () => projectsApi.list({ member_only: 'true' }).then((d) => d.projects ?? d),
  });

export const useProjectsPaginated = (params: { page?: number; pageSize?: number; status?: string; member_only?: string } = {}) =>
  useQuery({
    queryKey: [PROJECTS_KEY, 'paginated', params],
    queryFn: () => projectsApi.list(params as Record<string, string | number>),
  });

export const useSearchProjects = (q: string) =>
  useQuery({
    queryKey: [PROJECTS_KEY, 'search', q],
    queryFn: () => projectsApi.search(q),
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
  });

export const useProject = (id: string) =>
  useQuery({
    queryKey: [PROJECTS_KEY, id],
    queryFn: () => projectsApi.get(id).then((d) => d.project),
    enabled: !!id,
  });

export const useCreateProject = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => projectsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [PROJECTS_KEY] }); toast.success('Project created'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to create project'),
  });
};

export const useUpdateProject = (id: string) => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => projectsApi.update(id, data),
    onError: (e: Error) => toast.error(e.message || 'Failed to update project'),
    onSuccess: () => {
      toast.success('Project updated');
      qc.invalidateQueries({ queryKey: [PROJECTS_KEY] });
      qc.invalidateQueries({ queryKey: [PROJECTS_KEY, id] });
      qc.invalidateQueries({ queryKey: ['dashboard', 'project', id] });
      qc.invalidateQueries({ queryKey: ['dashboard', 'summary'] });
    },
  });
};

export const useUpdateRAG = (id: string) => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: { rag_status: string; reason?: string }) => projectsApi.updateRAG(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PROJECTS_KEY] });
      qc.invalidateQueries({ queryKey: [PROJECTS_KEY, id] });
      toast.success('RAG status updated');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update RAG status'),
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
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => projectsApi.createMilestone(projectId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [PROJECTS_KEY, projectId, 'milestones'] }); toast.success('Milestone created'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to create milestone'),
  });
};

export const useUpdateMilestone = (projectId: string, milestoneId: string) => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => projectsApi.updateMilestone(projectId, milestoneId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [PROJECTS_KEY, projectId, 'milestones'] }); toast.success('Milestone updated'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to update milestone'),
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
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => projectsApi.addMember(projectId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [PROJECTS_KEY, projectId, 'members'] }); toast.success('Member added'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to add member'),
  });
};

export const useAddTeamToProject = (projectId: string) => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => projectsApi.addTeam(projectId, data),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: [PROJECTS_KEY, projectId, 'members'] });
      toast.success(d?.message || 'Team members added');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to add team'),
  });
};

export const useRemoveMember = (projectId: string) => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (memberId: string) => projectsApi.removeMember(projectId, memberId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [PROJECTS_KEY, projectId, 'members'] }); toast.success('Member removed'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to remove member'),
  });
};
