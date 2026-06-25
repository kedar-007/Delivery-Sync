import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { timeEntriesApi, timeApprovalsApi } from '../lib/api';
import { useToast } from '../components/ui/Toast';

// ── Field Normalisers ─────────────────────────────────────────────────────────
// Catalyst: ROWID=PK, CREATEDTIME=created, MODIFIEDTIME=updated, CREATORID=creator
// `date` is a reserved keyword → renamed to `entry_date` in DataStore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normaliseEntry = (r: any) => ({
  ...r,
  id:             String(r.ROWID ?? r.id ?? ''),
  tenantId:       r.tenant_id    ?? r.tenantId,
  projectId:      r.project_id ? String(r.project_id) : (r.projectId ? String(r.projectId) : ''),
  taskId:         (r.task_id && r.task_id !== '0' && r.task_id !== 0) ? String(r.task_id) : (r.taskId ?? null),
  userId:         r.user_id      ?? r.userId,
  date:           ((r.entry_date ?? r.date ?? '') as string).split('T')[0].split(' ')[0],
  hours:          parseFloat(r.hours ?? 0),
  startTime:      r.start_time   ?? r.startTime   ?? null,
  endTime:        r.end_time     ?? r.endTime     ?? null,
  isBillable:     r.is_billable === 'true' || r.is_billable === true || r.isBillable === true,
  approvedBy:     r.approved_by  ?? r.approvedBy  ?? null,
  approvalNotes:  r.approval_notes ?? r.approvalNotes ?? '',
  submittedAt:    r.submitted_at ?? r.submittedAt ?? null,
  approvedAt:     r.approved_at  ?? r.approvedAt  ?? null,
  createdBy:      r.CREATORID    ?? r.created_by  ?? r.createdBy,
  createdAt:      r.CREATEDTIME  ?? r.created_at  ?? r.createdAt,
  updatedAt:      r.MODIFIEDTIME ?? r.updated_at  ?? r.updatedAt,
  userName:       r.user_name    ?? r.userName    ?? '',
  userAvatarUrl:  r.user_avatar_url ?? r.userAvatarUrl ?? '',
  projectName:    r.project_name ?? r.projectName ?? '',
  taskName:       r.task_name    ?? r.taskName    ?? '',
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normaliseApproval = (r: any) => ({
  ...r,
  id:                   String(r.ROWID ?? r.id ?? ''),
  timeEntryId:          r.time_entry_id ?? r.timeEntryId,
  requestedBy:          r.requested_by  ?? r.requestedBy,
  assignedTo:           r.assigned_to   ?? r.assignedTo,
  escalatedTo:          r.escalated_to  ?? r.escalatedTo ?? null,
  escalatedAt:          r.escalated_at  ?? r.escalatedAt ?? null,
  createdBy:            r.CREATORID     ?? r.created_by  ?? r.createdBy,
  createdAt:            r.CREATEDTIME   ?? r.created_at  ?? r.createdAt,
  updatedAt:            r.MODIFIEDTIME  ?? r.updated_at  ?? r.updatedAt,
  submittedByName:      r.requester?.name       ?? r.submittedByName       ?? '',
  submittedByAvatarUrl: r.requester?.avatar_url ?? r.submittedByAvatarUrl  ?? '',
  projectId:            r.entry?.project_id  ?? r.projectId  ?? '',
  projectName:          r.entry?.project_name ?? r.projectName ?? '',
  taskName:             r.entry?.task_name    ?? r.taskName    ?? '',
  sprintName:           r.entry?.sprint_name  ?? r.sprintName  ?? '',
  description:          r.entry?.description  ?? r.description ?? '',
  date:                 r.entry?.entry_date   ?? r.entry?.date ?? r.date ?? '',
  hours:                parseFloat(r.entry?.hours ?? r.hours ?? 0),
  isBillable:           r.entry?.is_billable === 'true' || r.entry?.is_billable === true || r.isBillable === true,
});

const applyNorm = <T>(norm: (r: unknown) => T) =>
  (res: unknown): T | T[] => {
    if (Array.isArray(res)) return res.map(norm);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (res as any);
    if (d?.data && Array.isArray(d.data)) return { ...d, data: d.data.map(norm) } as unknown as T;
    return norm(res);
  };

// ── Time Entries ──────────────────────────────────────────────────────────────
// Always returns { data: TimeEntry[], pagination: PageInfo | null }.
// When the caller passes `page` in params, the backend includes pagination
// metadata; otherwise pagination is null and `data` holds all returned rows
// (legacy / analytics callers).
export interface TimeEntriesPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface TimeEntriesResult { data: any[]; pagination: TimeEntriesPagination | null; }

export const useTimeEntries = (params?: Record<string, string>) =>
  useQuery<TimeEntriesResult>({
    queryKey: ['time', 'entries', params],
    queryFn: async () => {
      const res = await timeEntriesApi.list(params);
      // Paginated shape: { entries, pagination }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (res && typeof res === 'object' && !Array.isArray(res) && Array.isArray((res as any).entries)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = res as any;
        return { data: r.entries.map(normaliseEntry), pagination: r.pagination ?? null };
      }
      // Legacy array shape (no pagination)
      const arr = Array.isArray(res) ? res : [];
      return { data: arr.map(normaliseEntry), pagination: null };
    },
  });

// Fetch EVERY entry matching the params by walking the paginated endpoint.
// Used by personal analytics (Month / Overall) so totals/breakdowns cover the
// whole period instead of the backend's 200-row non-paginated cap.
export const useAllTimeEntries = (params?: Record<string, string>, enabled = true) =>
  useQuery<TimeEntriesResult>({
    queryKey: ['time', 'entries', 'all', params],
    enabled,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const all: any[] = [];
      for (let page = 1; page <= 50; page++) { // 50×200 = 10k safety ceiling
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await timeEntriesApi.list({ ...(params ?? {}), page: String(page), pageSize: '200' }) as any;
        const batch = Array.isArray(res?.entries) ? res.entries : (Array.isArray(res) ? res : []);
        all.push(...batch);
        if (!res?.pagination?.hasMore || batch.length === 0) break;
      }
      return { data: all.map(normaliseEntry), pagination: null };
    },
  });

export const useMyWeek = () =>
  useQuery({
    queryKey: ['time', 'my-week'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = await timeEntriesApi.myWeek() as any;

      const entries: ReturnType<typeof normaliseEntry>[] = Array.isArray(raw)
        ? raw.map(normaliseEntry)
        : Array.isArray(raw?.entries)
          ? raw.entries.map(normaliseEntry)
          : [];

      const totalHours    = parseFloat(raw?.total_hours   ?? raw?.totalHours   ?? 0);
      const billableHours = parseFloat(raw?.billable_hours ?? raw?.billableHours ?? 0);
      const weekStart: string = raw?.week_start ?? raw?.weekStart ?? '';
      const weekEnd:   string = raw?.week_end   ?? raw?.weekEnd   ?? '';

      const byDate: Record<string, typeof entries> = {};
      for (const e of entries) {
        const d = (e.date as string) ?? '';
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(e);
      }

      const days = Array.from({ length: 7 }, (_, i) => {
        const dt   = weekStart
          ? new Date(new Date(weekStart).getTime() + i * 86400000).toISOString().split('T')[0]
          : '';
        const dayEntries = byDate[dt] ?? [];
        const hours = dayEntries.reduce((s, e) => s + (parseFloat(String(e.hours)) || 0), 0);
        return {
          date:    dt,
          label:   dt,
          hours:   Math.round(hours * 100) / 100,
          entries: dayEntries.map((e) => ({
            projectName: (e as any).projectName ?? (e as any).project_name ?? (e as any).projectId ?? '',
            hours:       parseFloat(String(e.hours)) || 0,
            taskId:      (e as any).taskId ?? null,
            description: (e as any).description ?? '',
            status:      (e as any).status ?? '',
            id:          e.id,
          })),
        };
      });

      const daysLogged  = days.filter((d) => d.hours > 0).length;
      const nonBillable = Math.round((totalHours - billableHours) * 100) / 100;

      return { entries, totalHours, billableHours, nonBillableHours: nonBillable, daysLogged, days, weekStart, weekEnd };
    },
  });

export const useTimeSummary = (params?: Record<string, string>) =>
  useQuery({
    queryKey: ['time', 'summary', params],
    queryFn: () => timeEntriesApi.summary(params),
  });

export const useCreateTimeEntry = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => timeEntriesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['time', 'entries'] });
      qc.invalidateQueries({ queryKey: ['time', 'my-week'] });
      toast.success('Time entry logged');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to log time'),
  });
};

export const useUpdateTimeEntry = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => timeEntriesApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['time'] }); toast.success('Entry updated'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to update entry'),
  });
};

export const useDeleteTimeEntry = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: string) => timeEntriesApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['time'] }); toast.success('Entry deleted'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to delete entry'),
  });
};

export const useSubmitTimeEntry = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: string) => timeEntriesApi.submit(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['time'] }); toast.success('Entry submitted for approval'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to submit entry'),
  });
};

export const useRetractTimeEntry = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: string) => timeEntriesApi.retract(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['time'] }); toast.success('Entry retracted to draft'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to retract entry'),
  });
};

// ── Org Analytics ───────────────────────────────────────────────────────────
// Server-side ZCQL GROUP BY aggregation — every breakdown the org tab renders,
// computed over the FULL date range (no client-side row cap).
export interface OrgAnalytics {
  period:  { from: string; to: string };
  summary: { total_hours: number; billable_hours: number; non_billable_hours: number; total_entries: number };
  by_user:    Array<{ user_id: string; user_name: string; user_avatar_url: string; total_hours: number; billable_hours: number; entries_count: number }>;
  by_project: Array<{ project_id: string; project_name: string; total_hours: number; billable_hours: number; entries_count: number; member_count: number }>;
  by_task:    Array<{ task_id: string; task_name: string; project_name: string; total_hours: number; billable_hours: number; entries_count: number }>;
  by_day:     Array<{ date: string; total_hours: number; billable_hours: number; entries_count: number }>;
  by_status:  Array<{ status: string; entries_count: number }>;
}

export const useOrgAnalytics = (params?: Record<string, string>, enabled = true) =>
  useQuery<OrgAnalytics>({
    queryKey: ['time', 'analytics', 'org', params],
    queryFn: () => timeEntriesApi.orgAnalytics(params),
    enabled,
  });

// ── Team Analytics ────────────────────────────────────────────────────────────
export const useTeamAnalytics = (params?: Record<string, string>, enabled = true) =>
  useQuery({
    queryKey: ['time', 'analytics', 'team', params],
    queryFn: () => timeEntriesApi.teamAnalytics(params),
    enabled,
  });

export const useTeamMemberEntries = (params?: Record<string, string>, enabled = true) =>
  useQuery<TimeEntriesResult>({
    queryKey: ['time', 'team-entries', params],
    queryFn: async () => {
      const res = await timeEntriesApi.list(params);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (res && typeof res === 'object' && !Array.isArray(res) && Array.isArray((res as any).entries)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = res as any;
        return { data: r.entries.map(normaliseEntry), pagination: r.pagination ?? null };
      }
      const arr = Array.isArray(res) ? res : [];
      return { data: arr.map(normaliseEntry), pagination: null };
    },
    enabled,
  });

// ── Approvals ─────────────────────────────────────────────────────────────────
export const useTimeApprovals = (params?: Record<string, string>, enabled = true) =>
  useQuery({
    queryKey: ['time', 'approvals', params],
    queryFn: () => timeApprovalsApi.list(params).then(applyNorm(normaliseApproval)),
    enabled,
  });

export const useApproveTime = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: unknown }) => timeApprovalsApi.approve(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['time', 'approvals'] }); toast.success('Entry approved'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to approve entry'),
  });
};

export const useRejectTime = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => timeApprovalsApi.reject(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['time', 'approvals'] }); toast.success('Entry rejected'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to reject entry'),
  });
};
