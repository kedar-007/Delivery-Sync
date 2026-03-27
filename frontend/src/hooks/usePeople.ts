import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { attendanceApi, leaveApi, announcementsApi, orgApi } from '../lib/api';

// ── Field normaliser: Catalyst DataStore returns snake_case; map to camelCase ─
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// Normalise Catalyst DateTime ('YYYY-MM-DD HH:MM:SS') so new Date() parses it correctly
const normDT = (v: string | null | undefined) =>
  v ? v.replace(' ', 'T') : null;

const normaliseAttendance = (r: any) => ({
  ...r,
  id:                  String(r.ROWID ?? r.id ?? ''),
  userId:              r.user_id           ?? r.userId,
  tenantId:            r.tenant_id         ?? r.tenantId,
  date:                r.attendance_date   ?? r.date,
  checkInTime:         normDT(r.check_in_time ?? r.checkInTime ?? null),
  checkOutTime:        normDT(r.check_out_time ?? r.checkOutTime ?? null),
  workHours:           parseFloat(r.work_hours ?? r.workHours ?? 0),
  hoursWorked:         parseFloat(r.work_hours ?? r.hoursWorked ?? 0),
  isWfh:               r.is_wfh === 'true' || r.is_wfh === true || r.isWfh === true,
  wfhReason:           r.wfh_reason        ?? r.wfhReason    ?? '',
  checkInIp:           r.check_in_ip       ?? r.checkInIp    ?? '',
  isLocationVerified:  r.is_location_verified === 'true' || r.is_location_verified === true,
  overrideReason:      r.override_reason   ?? r.overrideReason ?? '',
  overriddenBy:        r.overridden_by     ?? r.overriddenBy   ?? null,
  createdBy:           r.CREATORID         ?? r.created_by     ?? r.createdBy,
  createdAt:           (() => { const raw = r.CREATEDTIME ?? r.created_at ?? r.createdAt; if (!raw) return null; const n = Number(raw); return (!isNaN(n) && n > 946684800000) ? new Date(n).toISOString() : String(raw); })(),
  updatedAt:           r.MODIFIEDTIME      ?? r.updated_at     ?? r.updatedAt,
  // enriched fields from backend
  name:                r.name              ?? '',
  email:               r.email             ?? '',
  avatarUrl:           r.avatar_url        ?? r.avatarUrl     ?? '',
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normaliseLeave = (r: any) => {
  const lt = r.leave_type ?? r.leaveType ?? null;
  const days = parseFloat(r.days_count ?? r.days ?? r.daysCount ?? 0);
  return {
    ...r,
    id:            String(r.ROWID ?? r.id ?? ''),
    userId:        r.user_id          ?? r.userId,
    leaveTypeId:   r.leave_type_id    ?? r.leaveTypeId,
    leaveTypeName: (lt && lt.name)    ?? r.leave_type_name ?? r.leaveTypeName ?? '',
    startDate:     r.start_date       ?? r.startDate,
    endDate:       r.end_date         ?? r.endDate,
    days,
    daysCount:     days,
    reason:        r.reason           ?? '',
    isHalfDay:     r.is_half_day === 'true' || r.is_half_day === true,
    halfDaySession:r.half_day_session ?? r.halfDaySession ?? '',
    reviewedBy:    r.reviewed_by      ?? r.reviewedBy    ?? '',
    reviewerNotes: r.reviewer_notes   ?? r.reviewerNotes ?? '',
    reviewedAt:    r.reviewed_at      ?? r.reviewedAt    ?? null,
    leaveType:     lt,
    userName:      r.user_name        ?? r.userName      ?? r.name ?? '',
    userAvatarUrl: r.user_avatar_url  ?? r.userAvatarUrl ?? r.avatar_url ?? '',
    // calendar normalisation
    date:          r.start_date       ?? r.date,
    userName_cal:  r.user_name        ?? r.userName ?? '',
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normaliseLeaveBalance = (r: any) => {
  const lt = r.leave_type ?? r.leaveType ?? null;
  // Support both DB column names: allocated_days (actual) and total_allocated (legacy code)
  const allocated  = parseFloat(r.allocated_days  ?? r.total_allocated ?? r.total_days ?? r.allocated ?? r.totalDays ?? 0);
  const used       = parseFloat(r.used_days        ?? r.used          ?? r.usedDays     ?? 0);
  const pending    = parseFloat(r.pending_days     ?? r.pending       ?? r.pendingDays  ?? 0);
  const remaining  = parseFloat(r.remaining_days   ?? r.remaining     ?? r.remainingDays ?? Math.max(0, allocated - used - pending));
  return {
    ...r,
    id:             String(r.ROWID ?? r.id ?? ''),
    leaveTypeId:    r.leave_type_id  ?? r.leaveTypeId,
    leaveTypeName:  (lt && lt.name)  ?? r.leave_type_name ?? r.leaveTypeName ?? '',
    allocated,
    total_allocated: allocated,
    used,
    pending,
    remaining,
    total_available: Math.max(0, allocated - used),
    // legacy aliases
    totalDays:      allocated,
    usedDays:       used,
    pendingDays:    pending,
    remainingDays:  remaining,
    carryForwardDays: parseFloat(r.carry_forward_days ?? r.carryForwardDays ?? 0),
    leaveType:      lt,
    userName:       r.user_name ?? r.userName ?? '',
    userAvatarUrl:  r.user_avatar_url ?? r.userAvatarUrl ?? '',
    userId:         r.user_id ?? r.userId ?? '',
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normaliseAnnouncement = (r: any) => ({
  ...r,
  id:            String(r.ROWID ?? r.id ?? ''),
  isPinned:      r.is_pinned === 'true'  || r.is_pinned === true  || r.isPinned === true,
  isRead:        r.is_read  === 'true'   || r.is_read  === true   || r.isRead  === true,
  priority:      r.announcement_priority ?? r.priority ?? 'NORMAL',  // reserved keyword fix
  viewCount:     parseInt(r.view_count ?? r.viewCount ?? 0, 10),
  expiresAt:     r.expires_at  ?? r.expiresAt  ?? null,
  targetRoles:   (() => { try { return JSON.parse(r.target_roles ?? r.targetRoles ?? '[]'); } catch { return []; } })(),
  targetUserIds: (() => { try { return JSON.parse(r.target_user_ids ?? r.targetUserIds ?? '[]'); } catch { return []; } })(),
  subtype:     r.subtype     ?? r.announcement_subtype ?? 'GENERAL',
  festivalKey: r.festival_key ?? r.festivalKey ?? null,
  createdBy:     r.CREATORID ?? r.created_by ?? r.createdBy ?? null,
  // Catalyst returns CREATEDTIME as Unix ms number — convert to ISO string
  createdAt:     (() => {
    const raw = r.CREATEDTIME ?? r.created_at ?? r.createdAt;
    if (!raw) return null;
    const n = Number(raw);
    if (!isNaN(n) && n > 946684800000) return new Date(n).toISOString();
    return String(raw);
  })(),
  updatedAt:     (() => {
    const raw = r.MODIFIEDTIME ?? r.updated_at ?? r.updatedAt;
    if (!raw) return null;
    const n = Number(raw);
    if (!isNaN(n) && n > 946684800000) return new Date(n).toISOString();
    return String(raw);
  })(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normaliseProfile = (r: any) => ({
  ...r,
  id:                  String(r.ROWID ?? r.id ?? ''),
  userId:              r.user_id              ?? r.userId,
  reportingManagerId:  r.reporting_manager_id ?? r.reportingManagerId ?? null,
  managerName:         r.manager_name         ?? r.managerName         ?? null,
  isProfilePublic:     r.is_profile_public === 'true' || r.is_profile_public === true,
  photoUrl:            r.photo_url            ?? r.photoUrl            ?? '',
  socialLinks:         (() => { try { return JSON.parse(r.social_links ?? r.socialLinks ?? '{}'); } catch { return {}; } })(),
  skills:              (() => { try { return JSON.parse(r.skills ?? '[]'); } catch { return []; } })(),
  experience:          (() => { try { return JSON.parse(r.experience ?? '[]'); } catch { return []; } })(),
  certifications:      (() => { try { return JSON.parse(r.certifications ?? '[]'); } catch { return []; } })(),
});

// ── Attendance ────────────────────────────────────────────────────────────────
export const useMyAttendanceRecord = () =>
  useQuery({
    queryKey: ['attendance', 'my-record'],
    queryFn: async () => {
      const rows = await attendanceApi.myRecord();
      const history = Array.isArray(rows) ? rows.map(normaliseAttendance) : [];
      const todayStr = new Date().toISOString().split('T')[0];
      const today = history.find((r: any) => r.date === todayStr) ?? null;
      return { today, history };
    },
  });

export const useAttendanceLive = () =>
  useQuery({
    queryKey: ['attendance', 'live'],
    queryFn: async () => {
      const rows = await attendanceApi.live();
      return Array.isArray(rows) ? rows.map(normaliseAttendance) : [];
    },
    refetchInterval: 60000,
  });

export const useAttendanceRecords = (params?: Record<string, string>) =>
  useQuery({
    queryKey: ['attendance', 'records', params],
    queryFn: async () => {
      const rows = await attendanceApi.records(params);
      return Array.isArray(rows) ? rows.map(normaliseAttendance) : [];
    },
  });

export const useAttendanceSummary = (params?: Record<string, string>) =>
  useQuery({
    queryKey: ['attendance', 'summary', params],
    queryFn: () => attendanceApi.summary(params),
  });

export const useAttendanceAnomalies = () =>
  useQuery({
    queryKey: ['attendance', 'anomalies'],
    queryFn: async () => {
      const rows = await attendanceApi.anomalies();
      return Array.isArray(rows) ? rows.map(normaliseAttendance) : [];
    },
  });

export const useCheckIn = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => attendanceApi.checkIn(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance'] });
    },
  });
};

export const useCheckOut = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => attendanceApi.checkOut(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
  });
};

export const useMarkWfh = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => attendanceApi.markWfh(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
  });
};

export const useOverrideAttendance = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recordId, data }: { recordId: string; data: unknown }) => attendanceApi.override(recordId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
  });
};

// ── Leave ─────────────────────────────────────────────────────────────────────
export const useLeaveTypes = () =>
  useQuery({
    queryKey: ['leave', 'types'],
    queryFn: async () => {
      const rows = await leaveApi.listTypes();
      if (!Array.isArray(rows)) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (rows as any[]).map((t) => ({
        ...t,
        id:   String(t.ROWID ?? t.id ?? ''),
        name: t.name ?? '',
        code: t.code ?? '',
      }));
    },
  });

export const useLeaveBalance = (userId?: string) =>
  useQuery({
    queryKey: ['leave', 'balance', userId],
    queryFn: async () => {
      const rows = await leaveApi.getBalance(userId);
      return Array.isArray(rows) ? rows.map(normaliseLeaveBalance) : [];
    },
  });

export const useLeaveRequests = (params?: Record<string, string>) =>
  useQuery({
    queryKey: ['leave', 'requests', params],
    queryFn: async () => {
      const rows = await leaveApi.listRequests(params);
      return Array.isArray(rows) ? rows.map(normaliseLeave) : [];
    },
  });

export const useLeaveCalendar = (params?: Record<string, string>) =>
  useQuery({
    queryKey: ['leave', 'calendar', params],
    queryFn: async () => {
      const rows = await leaveApi.calendar(params);
      return Array.isArray(rows) ? rows.map(normaliseLeave) : [];
    },
  });

export const useApplyLeave = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => leaveApi.apply(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave', 'requests'] });
      qc.invalidateQueries({ queryKey: ['leave', 'balance'] });
    },
  });
};

export const useCancelLeave = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => leaveApi.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave', 'requests'] });
      qc.invalidateQueries({ queryKey: ['leave', 'balance'] });
    },
  });
};

export const useApproveLeave = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: unknown }) => leaveApi.approve(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave', 'requests'] }),
  });
};

export const useRejectLeave = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => leaveApi.reject(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave', 'requests'] }),
  });
};

// ── Announcements ─────────────────────────────────────────────────────────────
export const useAnnouncements = () =>
  useQuery({
    queryKey: ['announcements'],
    queryFn: async () => {
      const rows = await announcementsApi.list();
      return Array.isArray(rows) ? rows.map(normaliseAnnouncement) : [];
    },
  });

export const useCreateAnnouncement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => announcementsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });
};

export const useUpdateAnnouncement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => announcementsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });
};

export const useDeleteAnnouncement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => announcementsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });
};

export const useMarkAnnouncementRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => announcementsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });
};

// ── Org ───────────────────────────────────────────────────────────────────────
export const useOrgHierarchy = () =>
  useQuery({
    queryKey: ['org', 'hierarchy'],
    queryFn: async () => {
      const rows = await orgApi.hierarchy();
      return Array.isArray(rows) ? rows.map(normaliseProfile) : [];
    },
  });

export const useDirectReports = (userId: string) =>
  useQuery({
    queryKey: ['org', 'reports', userId],
    queryFn: async () => {
      const rows = await orgApi.directReports(userId);
      return Array.isArray(rows) ? rows.map(normaliseProfile) : [];
    },
    enabled: !!userId,
  });

export const useSetManager = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => orgApi.setManager(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org'] }),
  });
};

// ── Company Calendar ───────────────────────────────────────────────────────────
export const useCompanyCalendar = (params?: Record<string, string>) =>
  useQuery({
    queryKey: ['leave', 'company-calendar', params],
    queryFn: () => leaveApi.getCompanyCalendar(params),
  });

export const useCreateHoliday = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => leaveApi.createHoliday(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave', 'company-calendar'] }),
  });
};

export const useDeleteHoliday = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => leaveApi.deleteHoliday(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave', 'company-calendar'] }),
  });
};

// ── Leave Balance Admin ────────────────────────────────────────────────────────
export const useAllLeaveBalances = (params?: Record<string, string>) =>
  useQuery({
    queryKey: ['leave', 'balance', 'all', params],
    queryFn: async () => {
      const rows = await leaveApi.getAllBalances(params);
      return Array.isArray(rows) ? rows.map(normaliseLeaveBalance) : [];
    },
  });

export const useSetLeaveBalance = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => leaveApi.setBalance(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave', 'balance'] });
    },
  });
};
