import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { attendanceApi, leaveApi, announcementsApi, orgApi } from '../lib/api';
import { useToast } from '../components/ui/Toast';

// ── Field normaliser: Catalyst DataStore returns snake_case; map to camelCase ─
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// Normalise stored UTC datetime ('YYYY-MM-DD HH:MM:SS') to 'YYYY-MM-DDTHH:MM:SSZ'
// so new Date() always parses as UTC regardless of browser timezone
const normDT = (v: string | null | undefined) =>
  v ? v.replace(' ', 'T').replace(/Z?$/, 'Z') : null;

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
  breakSummary:        r.break_summary       ?? null,
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
      // Use browser local date (not UTC) — attendance_date is stored in the user's local timezone
      const todayStr = new Date().toLocaleDateString('sv'); // 'sv' locale gives YYYY-MM-DD in local TZ
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

export const useAttendanceNotCheckedIn = () =>
  useQuery({
    queryKey: ['attendance', 'not-checked-in'],
    queryFn: async () => {
      const rows = await attendanceApi.notCheckedIn();
      return Array.isArray(rows) ? rows : [];
    },
    refetchInterval: 30_000,
  });

export const useCheckIn = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => attendanceApi.checkIn(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance'] }); toast.success('Checked in'); },
    onError: (e: Error) => toast.error(e.message || 'Check-in failed'),
  });
};

export const useCheckOut = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => attendanceApi.checkOut(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance'] }); toast.success('Checked out'); },
    onError: (e: Error) => toast.error(e.message || 'Check-out failed'),
  });
};

export const useMarkWfh = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => attendanceApi.markWfh(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance'] }); toast.success('Marked as WFH'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to mark WFH'),
  });
};

export const useOverrideAttendance = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ recordId, data }: { recordId: string; data: unknown }) => attendanceApi.override(recordId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance'] }); toast.success('Attendance updated'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to update attendance'),
  });
};

export const useBreakStart = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => attendanceApi.breakStart(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance'] }); toast.success('Break started'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to start break'),
  });
};

export const useBreakEnd = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => attendanceApi.breakEnd(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance'] }); toast.success('Break ended'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to end break'),
  });
};

export const useBreakSummary = () =>
  useQuery({
    queryKey: ['attendance', 'break-summary'],
    queryFn: () => attendanceApi.getBreakSummary(),
    refetchInterval: 30000,
  });

export const useIpSettings = () =>
  useQuery({ queryKey: ['attendance', 'ip-settings'], queryFn: () => attendanceApi.getIpSettings() });

export const useUpdateIpSettings = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: { enabled: boolean }) => attendanceApi.updateIpSettings(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance', 'ip-settings'] }); toast.success('IP settings updated'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to update IP settings'),
  });
};

export const useIpConfig = () =>
  useQuery({ queryKey: ['attendance', 'ip-config'], queryFn: () => attendanceApi.getIpConfig() });

export const useAddIpConfig = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => attendanceApi.addIpConfig(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance', 'ip-config'] }); toast.success('IP address added'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to add IP address'),
  });
};

export const useDeleteIpConfig = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (configId: string) => attendanceApi.deleteIpConfig(configId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance', 'ip-config'] }); toast.success('IP address removed'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to remove IP address'),
  });
};

export const useGeoSettings = () =>
  useQuery({ queryKey: ['attendance', 'geo-settings'], queryFn: () => attendanceApi.getGeoSettings() });

export const useUpdateGeoSettings = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: { enabled: boolean }) => attendanceApi.updateGeoSettings(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance', 'geo-settings'] }); toast.success('Geo settings updated'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to update geo settings'),
  });
};

export const useGeoConfig = () =>
  useQuery({ queryKey: ['attendance', 'geo-config'], queryFn: () => attendanceApi.getGeoConfig() });

export const useAddGeoConfig = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => attendanceApi.addGeoConfig(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance', 'geo-config'] }); toast.success('Country added'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to add country'),
  });
};

export const useDeleteGeoConfig = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (configId: string) => attendanceApi.deleteGeoConfig(configId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance', 'geo-config'] }); toast.success('Country removed'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to remove country'),
  });
};

export const useGeoZoneSettings = () =>
  useQuery({ queryKey: ['attendance', 'geo-zone-settings'], queryFn: () => attendanceApi.getGeoZoneSettings() });

export const useUpdateGeoZoneSettings = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: { enabled: boolean }) => attendanceApi.updateGeoZoneSettings(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance', 'geo-zone-settings'] }); toast.success('Zone settings updated'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to update zone settings'),
  });
};

export const useGeoZones = () =>
  useQuery({ queryKey: ['attendance', 'geo-zones'], queryFn: () => attendanceApi.getGeoZones() });

export const useAddGeoZone = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => attendanceApi.addGeoZone(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance', 'geo-zones'] }); toast.success('Zone added'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to add zone'),
  });
};

export const useDeleteGeoZone = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (zoneId: string) => attendanceApi.deleteGeoZone(zoneId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance', 'geo-zones'] }); toast.success('Zone removed'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to remove zone'),
  });
};

// ── Shifts ────────────────────────────────────────────────────────────────────
export const useShifts = () =>
  useQuery({
    queryKey: ['attendance', 'shifts'],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: async () => {
      const rows = await attendanceApi.getShifts();
      if (!Array.isArray(rows)) return [];
      return (rows as any[]).map((s) => ({
        ...s,
        id:            String(s.ROWID ?? s.id ?? ''),
        name:          s.name ?? '',
        startTime:     s.start_time ?? s.startTime ?? '',
        endTime:       s.end_time ?? s.endTime ?? '',
        timezone:      s.timezone ?? 'Asia/Kolkata',
        graceMinutes:  parseInt(s.grace_minutes ?? s.graceMinutes ?? 15),
      }));
    },
  });

export const useAddShift = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => attendanceApi.addShift(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance', 'shifts'] }); toast.success('Shift created'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to create shift'),
  });
};

export const useUpdateShift = (shiftId: string) => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => attendanceApi.updateShift(shiftId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance', 'shifts'] }); toast.success('Shift updated'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to update shift'),
  });
};

export const useDeleteShift = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (shiftId: string) => attendanceApi.deleteShift(shiftId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance', 'shifts'] }); toast.success('Shift deleted'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to delete shift'),
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
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => leaveApi.apply(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave', 'requests'] });
      qc.invalidateQueries({ queryKey: ['leave', 'balance'] });
      toast.success('Leave request submitted');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to submit leave request'),
  });
};

export const useCancelLeave = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: string) => leaveApi.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave', 'requests'] });
      qc.invalidateQueries({ queryKey: ['leave', 'balance'] });
      toast.success('Leave request cancelled');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to cancel leave request'),
  });
};

export const useApproveLeave = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: unknown }) => leaveApi.approve(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leave', 'requests'] }); toast.success('Leave approved'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to approve leave'),
  });
};

export const useRejectLeave = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => leaveApi.reject(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leave', 'requests'] }); toast.success('Leave rejected'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to reject leave'),
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
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => announcementsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['announcements'] }); toast.success('Announcement created'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to create announcement'),
  });
};

export const useUpdateAnnouncement = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => announcementsApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['announcements'] }); toast.success('Announcement updated'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to update announcement'),
  });
};

export const useDeleteAnnouncement = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: string) => announcementsApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['announcements'] }); toast.success('Announcement deleted'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to delete announcement'),
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
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => orgApi.setManager(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org'] }); toast.success('Manager assigned'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to assign manager'),
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
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => leaveApi.createHoliday(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leave', 'company-calendar'] }); toast.success('Holiday added'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to add holiday'),
  });
};

export const useDeleteHoliday = () => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: string) => leaveApi.deleteHoliday(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leave', 'company-calendar'] }); toast.success('Holiday removed'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to remove holiday'),
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
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => leaveApi.setBalance(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave', 'balance'] });
      toast.success('Leave balance updated');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update leave balance'),
  });
};
