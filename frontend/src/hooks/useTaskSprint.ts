import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sprintsApi, tasksApi } from '../lib/api';
import { useToast } from '../components/ui/Toast';

// ── Field Normalisers ─────────────────────────────────────────────────────────
// Catalyst DataStore: ROWID = PK, CREATEDTIME = created, MODIFIEDTIME = updated, CREATORID = creator
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normaliseSprint = (r: any) => ({
  ...r,
  id:               String(r.ROWID ?? r.id ?? ''),
  tenantId:         r.tenant_id      ?? r.tenantId,
  projectId:        r.project_id     ?? r.projectId,
  startDate:        r.start_date     ?? r.startDate,
  endDate:          r.end_date       ?? r.endDate,
  capacityPoints:   parseFloat(r.capacity_points  ?? r.capacityPoints  ?? 0),
  completedPoints:  parseFloat(r.completed_points ?? r.completedPoints ?? 0),
  retrospectiveId:  r.retrospective_id ?? r.retrospectiveId ?? null,
  createdBy:        r.CREATORID      ?? r.created_by   ?? r.createdBy,
  createdAt:        r.CREATEDTIME    ?? r.created_at   ?? r.createdAt,
  updatedAt:        r.MODIFIEDTIME   ?? r.updated_at   ?? r.updatedAt,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normaliseTask = (r: any) => {
  // Multi-assignee: stored as JSON array in assignee_ids, fallback to single assignee_id
  let assigneeIds: string[] = [];
  try {
    if (r.assignee_ids) assigneeIds = JSON.parse(r.assignee_ids);
    else if (r.assigneeIds) assigneeIds = Array.isArray(r.assigneeIds) ? r.assigneeIds : JSON.parse(r.assigneeIds);
    else if (r.assignee_id) assigneeIds = [String(r.assignee_id)];
  } catch { assigneeIds = r.assignee_id ? [String(r.assignee_id)] : []; }

  return {
    ...r,
    id:             String(r.ROWID ?? r.id ?? ''),
    tenantId:       r.tenant_id       ?? r.tenantId,
    projectId:      r.project_id      ?? r.projectId,
    sprintId:       r.sprint_id       ?? r.sprintId       ?? null,
    parentTaskId:   r.parent_task_id  ?? r.parentTaskId   ?? null,
    type:           r.type            ?? 'TASK',
    status:         r.status          ?? 'TODO',
    priority:       r.task_priority   ?? r.priority       ?? 'MEDIUM',
    assigneeId:     r.assignee_id     ?? r.assigneeId     ?? null,
    assigneeIds,
    reporterId:     r.reporter_id     ?? r.reporterId,
    storyPoints:    parseFloat(r.story_points    ?? r.storyPoints    ?? 0) || null,
    estimatedHours: parseFloat(r.estimated_hours ?? r.estimatedHours ?? 0) || null,
    loggedHours:    parseFloat(r.logged_hours    ?? r.loggedHours    ?? 0),
    dueDate:        r.due_date        ?? r.dueDate        ?? null,
    completedAt:    r.completed_at    ?? r.completedAt    ?? null,
    labels:         (() => { try { return JSON.parse(r.labels ?? '[]'); } catch { return []; } })(),
    customFields:    (() => { try { return JSON.parse(r.custom_fields ?? r.customFields ?? '{}'); } catch { return {}; } })(),
    requireApproval: r.require_approval === true || r.require_approval === 'true' || r.requireApproval === true,
    createdBy:      r.CREATORID       ?? r.created_by     ?? r.createdBy,
    createdAt:      r.CREATEDTIME     ?? r.created_at     ?? r.createdAt,
    updatedAt:      r.MODIFIEDTIME    ?? r.updated_at     ?? r.updatedAt,
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normaliseComment = (r: any) => ({
  ...r,
  id:        String(r.ROWID ?? r.id ?? ''),
  userId:    r.user_id   ?? r.userId,
  taskId:    r.task_id   ?? r.taskId,
  isEdited:  r.is_edited === 'true' || r.is_edited === true,
  editedAt:  r.edited_at ?? r.editedAt ?? null,
  createdBy: r.CREATORID   ?? r.created_by ?? r.createdBy,
  createdAt: r.CREATEDTIME ?? r.created_at ?? r.createdAt,
});

const applyNorm = <T>(norm: (r: unknown) => T) =>
  (res: unknown): T | T[] => {
    if (Array.isArray(res)) return res.map(norm);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (res as any);
    if (d?.data && Array.isArray(d.data)) return { ...d, data: d.data.map(norm) } as unknown as T;
    return norm(res);
  };

// ── Sprints ───────────────────────────────────────────────────────────────────
export const useSprints = (projectId: string) =>
  useQuery({
    queryKey: ['sprints', projectId],
    queryFn: () => sprintsApi.list(projectId).then(applyNorm(normaliseSprint)),
    enabled: !!projectId,
  });

export const useSprint = (id: string) =>
  useQuery({
    queryKey: ['sprints', 'detail', id],
    queryFn: () => sprintsApi.get(id).then(normaliseSprint),
    enabled: !!id,
  });

export const useSprintBoard = (id: string) =>
  useQuery({
    queryKey: ['sprints', 'board', id],
    queryFn: async () => {
      const res = await sprintsApi.board(id);
      // Backend returns { sprint, board: { TODO: [], IN_PROGRESS: [], ... } }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const boardObj = (res as any)?.board ?? res;
      if (boardObj && typeof boardObj === 'object' && !Array.isArray(boardObj)) {
        const normalised: Record<string, unknown[]> = {};
        for (const [col, tasks] of Object.entries(boardObj as Record<string, unknown[]>)) {
          normalised[col] = Array.isArray(tasks) ? tasks.map(normaliseTask) : [];
        }
        return normalised;
      }
      return {};
    },
    enabled: !!id,
  });

export const useSprintVelocity = (projectId: string) =>
  useQuery({
    queryKey: ['sprints', 'velocity', projectId],
    queryFn: () => sprintsApi.velocity(projectId),
    enabled: !!projectId,
  });

export const useCreateSprint = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => sprintsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sprints'] }); toast.success('Sprint created'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to create sprint'),
  });
};

export const useUpdateSprint = (id: string) => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => sprintsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sprints'] });
      qc.invalidateQueries({ queryKey: ['sprints', 'detail', id] });
      toast.success('Sprint updated');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update sprint'),
  });
};

export const useStartSprint = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: string) => sprintsApi.start(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sprints'] }); toast.success('Sprint started'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to start sprint'),
  });
};

export const useCompleteSprint = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: string) => sprintsApi.complete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sprints'] }); toast.success('Sprint completed'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to complete sprint'),
  });
};

// ── Tasks ─────────────────────────────────────────────────────────────────────
export const useTasks = (params?: Record<string, string>, enabled = true) =>
  useQuery({
    queryKey: ['tasks', params],
    queryFn: () => tasksApi.list(params).then(applyNorm(normaliseTask)),
    enabled,
    retry: 1,
    retryDelay: 2000,
  });

export const useMyTasks = () =>
  useQuery({
    queryKey: ['tasks', 'my'],
    queryFn: () => tasksApi.myTasks().then(applyNorm(normaliseTask)),
  });

export const useSearchMyTasks = (q: string) =>
  useQuery({
    queryKey: ['tasks', 'search', q],
    queryFn: () => tasksApi.search(q).then(applyNorm(normaliseTask)),
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
  });

export const useOverdueTasks = () =>
  useQuery({
    queryKey: ['tasks', 'overdue'],
    queryFn: () => tasksApi.overdue().then(applyNorm(normaliseTask)),
  });

export const useBacklog = (projectId: string) =>
  useQuery({
    queryKey: ['tasks', 'backlog', projectId],
    queryFn: () => tasksApi.backlog(projectId).then(applyNorm(normaliseTask)),
    enabled: !!projectId,
  });

export const useTask = (id: string) =>
  useQuery({
    queryKey: ['tasks', id],
    queryFn: () => tasksApi.get(id).then(normaliseTask),
    enabled: !!id,
  });

export const useTaskComments = (id: string) =>
  useQuery({
    queryKey: ['tasks', id, 'comments'],
    queryFn: () => tasksApi.getComments(id).then(applyNorm(normaliseComment)),
    enabled: !!id,
  });

export const useCreateTask = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => tasksApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['sprints', 'board'] });
      toast.success('Task created');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to create task'),
  });
};

export const useUpdateTask = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => tasksApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['sprints', 'board'] });
      toast.success('Task updated');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update task'),
  });
};

export const useUpdateTaskStatus = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => tasksApi.updateStatus(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['sprints', 'board'] });
      toast.success('Status updated');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update status'),
  });
};

export const useDeleteTask = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: string) => tasksApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['sprints', 'board'] });
      toast.success('Task deleted');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to delete task'),
  });
};

export const useAddTaskComment = (taskId: string) => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => tasksApi.addComment(taskId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks', taskId, 'comments'] }); toast.success('Comment posted'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to post comment'),
  });
};
