import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { timeEntriesApi, timeApprovalsApi } from '../lib/api';

// ── Field Normalisers ─────────────────────────────────────────────────────────
// Catalyst: ROWID=PK, CREATEDTIME=created, MODIFIEDTIME=updated, CREATORID=creator
// `date` is a reserved keyword → renamed to `entry_date` in DataStore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normaliseEntry = (r: any) => ({
  ...r,
  id:             String(r.ROWID ?? r.id ?? ''),
  tenantId:       r.tenant_id    ?? r.tenantId,
  projectId:      r.project_id   ?? r.projectId,
  taskId:         r.task_id      ?? r.taskId      ?? null,
  userId:         r.user_id      ?? r.userId,
  date:           ((r.entry_date ?? r.date ?? '') as string).split('T')[0].split(' ')[0], // strip time component
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
  // Flatten nested requester info (from ApprovalController enrichment)
  submittedByName:      r.requester?.name       ?? r.submittedByName       ?? '',
  submittedByAvatarUrl: r.requester?.avatar_url ?? r.submittedByAvatarUrl  ?? '',
  // Flatten nested time entry fields
  projectId:            r.entry?.project_id ?? r.projectId ?? '',
  description:          r.entry?.description ?? r.description ?? '',
  date:                 r.entry?.entry_date ?? r.entry?.date ?? r.date ?? '',
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
export const useTimeEntries = (params?: Record<string, string>) =>
  useQuery({
    queryKey: ['time', 'entries', params],
    queryFn: () => timeEntriesApi.list(params).then(applyNorm(normaliseEntry)),
  });

export const useMyWeek = () =>
  useQuery({
    queryKey: ['time', 'my-week'],
    queryFn: async () => {
      // API returns { entries: [], total_hours, billable_hours, week_start, week_end }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = await timeEntriesApi.myWeek() as any;

      const entries: ReturnType<typeof normaliseEntry>[] = Array.isArray(raw)
        ? raw.map(normaliseEntry)                        // fallback: bare array
        : Array.isArray(raw?.entries)
          ? raw.entries.map(normaliseEntry)              // normal shape
          : [];

      const totalHours    = parseFloat(raw?.total_hours   ?? raw?.totalHours   ?? 0);
      const billableHours = parseFloat(raw?.billable_hours ?? raw?.billableHours ?? 0);
      const weekStart: string = raw?.week_start ?? raw?.weekStart ?? '';
      const weekEnd:   string = raw?.week_end   ?? raw?.weekEnd   ?? '';

      // Group entries by date to build the per-day breakdown
      const byDate: Record<string, typeof entries> = {};
      for (const e of entries) {
        const d = (e.date as string) ?? '';
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(e);
      }

      // Build 7-day window from week_start
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

      return {
        entries,
        totalHours,
        billableHours,
        nonBillableHours: nonBillable,
        daysLogged,
        days,
        weekStart,
        weekEnd,
      };
    },
  });

export const useTimeSummary = (params?: Record<string, string>) =>
  useQuery({
    queryKey: ['time', 'summary', params],
    queryFn: () => timeEntriesApi.summary(params),
  });

export const useCreateTimeEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => timeEntriesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['time', 'entries'] });
      qc.invalidateQueries({ queryKey: ['time', 'my-week'] });
    },
  });
};

export const useUpdateTimeEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => timeEntriesApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['time'] }),
  });
};

export const useDeleteTimeEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => timeEntriesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['time'] }),
  });
};

export const useSubmitTimeEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => timeEntriesApi.submit(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['time'] }),
  });
};

export const useRetractTimeEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => timeEntriesApi.retract(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['time'] }),
  });
};

// ── Approvals ─────────────────────────────────────────────────────────────────
export const useTimeApprovals = (params?: Record<string, string>) =>
  useQuery({
    queryKey: ['time', 'approvals', params],
    queryFn: () => timeApprovalsApi.list(params).then(applyNorm(normaliseApproval)),
  });

export const useApproveTime = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: unknown }) => timeApprovalsApi.approve(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['time', 'approvals'] }),
  });
};

export const useRejectTime = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => timeApprovalsApi.reject(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['time', 'approvals'] }),
  });
};
