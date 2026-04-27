import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../lib/api';
import { useToast } from '../components/ui/Toast';

export const PROJECTS_KEY = 'projects';

export const useProjects = () =>
  useQuery({
    queryKey: [PROJECTS_KEY],
    queryFn: () => projectsApi.list().then((d) => d.projects ?? d),
  });

export const useProjectsPaginated = (params: { page?: number; pageSize?: number; status?: string } = {}) =>
  useQuery({
    queryKey: [PROJECTS_KEY, 'paginated', params],
    queryFn: () => projectsApi.list(params as Record<string, string | number>),
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
    onSuccess: (_result, variables: any) => {
      toast.success('Project updated');
      const standupChanged = variables.standup_enabled !== undefined;
      const eodChanged     = variables.eod_enabled     !== undefined;
      const standupOn = variables.standup_enabled === true  || variables.standup_enabled === 'true';
      const eodOn     = variables.eod_enabled     === true  || variables.eod_enabled     === 'true';

      // ── Immediately patch the projects list cache ─────────────────────────────
      qc.setQueryData([PROJECTS_KEY], (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((p: any) => String(p.id) !== id ? p : {
          ...p,
          ...(standupChanged ? { standupEnabled: standupOn } : {}),
          ...(eodChanged     ? { eodEnabled:     eodOn     } : {}),
        });
      });

      // ── Immediately patch the dashboard summary cache ─────────────────────────
      qc.setQueryData(['dashboard', 'summary'], (old: any) => {
        if (!old) return old;
        let updated = { ...old, stats: { ...old.stats } };

        if (standupChanged && !standupOn) {
          // Disable: remove this project from missingStandups immediately
          const next = (old.missingStandups ?? []).filter((p: any) => String(p.id) !== id);
          updated.missingStandups = next;
          updated.stats.missingStandupsCount = next.length;
        }

        if (eodChanged && !eodOn) {
          // Disable: remove from missingEod immediately
          const next = (old.missingEod ?? []).filter((p: any) => String(p.id) !== id);
          updated.missingEod = next;
          updated.stats.missingEodCount = next.length;
        }

        return updated;
      });

      // ── Background invalidations for accuracy (re-enable case & stale data) ──
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

export const useRemoveMember = (projectId: string) => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (memberId: string) => projectsApi.removeMember(projectId, memberId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [PROJECTS_KEY, projectId, 'members'] }); toast.success('Member removed'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to remove member'),
  });
};
