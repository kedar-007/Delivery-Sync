import axios, { AxiosError } from 'axios';

/**
 * Catalyst API client.
 * Base URL uses the Catalyst serverless function path pattern.
 * Credentials (Catalyst session cookie) are included automatically.
 */
const api = axios.create({
  baseURL: '/server/delivery_sync_function/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Response interceptor: normalise errors ──────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ success: boolean; message: string; errors?: string[]; code?: string; suspension?: unknown }>) => {
    const message =
      error.response?.data?.message ||
      error.message ||
      'An unexpected error occurred';
    const enhanced = new Error(message) as Error & { status?: number; errors?: string[]; data?: unknown };
    enhanced.status = error.response?.status;
    enhanced.errors = error.response?.data?.errors;
    enhanced.data = error.response?.data;
    return Promise.reject(enhanced);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  me: () => api.get('/auth/me').then((r) => r.data.data),
  registerTenant: (data: { tenantName: string; domain: string }) =>
    api.post('/auth/register-tenant', data).then((r) => r.data.data),
  acceptInvite: () => api.post('/auth/accept-invite').then((r) => r.data.data),
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

export const dashboardApi = {
  getSummary: () => api.get('/dashboard/summary').then((r) => r.data.data),
  getPortfolio: () => api.get('/dashboard/portfolio').then((r) => r.data.data),
  getProjectDashboard: (projectId: string) =>
    api.get(`/dashboard/project/${projectId}`).then((r) => r.data.data),
  getExecSummary: () => api.get('/dashboard/exec-summary').then((r) => r.data.data),
};

// ─── Projects ─────────────────────────────────────────────────────────────────

export const projectsApi = {
  list: (params?: Record<string, string | number>) => api.get('/projects', { params }).then((r) => r.data.data),
  get: (id: string) => api.get(`/projects/${id}`).then((r) => r.data.data),
  create: (data: unknown) => api.post('/projects', data).then((r) => r.data.data),
  update: (id: string, data: unknown) => api.put(`/projects/${id}`, data).then((r) => r.data.data),
  updateRAG: (id: string, data: { rag_status: string; reason?: string }) =>
    api.patch(`/projects/${id}/rag`, data).then((r) => r.data.data),
  getMilestones: (projectId: string) =>
    api.get(`/projects/${projectId}/milestones`).then((r) => r.data.data),
  createMilestone: (projectId: string, data: unknown) =>
    api.post(`/projects/${projectId}/milestones`, data).then((r) => r.data.data),
  updateMilestone: (projectId: string, milestoneId: string, data: unknown) =>
    api.put(`/projects/${projectId}/milestones/${milestoneId}`, data).then((r) => r.data.data),
  getMembers: (projectId: string) =>
    api.get(`/projects/${projectId}/members`).then((r) => r.data.data),
  addMember: (projectId: string, data: unknown) =>
    api.post(`/projects/${projectId}/members`, data).then((r) => r.data.data),
  removeMember: (projectId: string, memberId: string) =>
    api.delete(`/projects/${projectId}/members/${memberId}`).then((r) => r.data.data),
};

// ─── Standups ─────────────────────────────────────────────────────────────────

export const standupsApi = {
  submit: (data: unknown) => api.post('/standups', data).then((r) => r.data.data),
  list: (params?: Record<string, string>) =>
    api.get('/standups', { params }).then((r) => r.data.data),
  rollup: (params: { projectId: string; startDate?: string; endDate?: string }) =>
    api.get('/standups/rollup', { params }).then((r) => r.data.data),
  myToday: (projectId?: string) =>
    api.get('/standups/my-today', { params: projectId ? { projectId } : {} }).then((r) => r.data.data),
};

// ─── EOD ──────────────────────────────────────────────────────────────────────

export const eodApi = {
  submit: (data: unknown) => api.post('/eod', data).then((r) => r.data.data),
  list: (params?: Record<string, string>) =>
    api.get('/eod', { params }).then((r) => r.data.data),
  rollup: (params: { projectId: string; startDate?: string; endDate?: string }) =>
    api.get('/eod/rollup', { params }).then((r) => r.data.data),
  myToday: (projectId?: string) =>
    api.get('/eod/my-today', { params: projectId ? { projectId } : {} }).then((r) => r.data.data),
};

// ─── Actions ──────────────────────────────────────────────────────────────────

export const actionsApi = {
  list: (params?: Record<string, string>) =>
    api.get('/actions', { params }).then((r) => r.data.data),
  create: (data: unknown) => api.post('/actions', data).then((r) => r.data.data),
  update: (id: string, data: unknown) => api.put(`/actions/${id}`, data).then((r) => r.data.data),
  delete: (id: string) => api.delete(`/actions/${id}`).then((r) => r.data.data),
};

// ─── Blockers ────────────────────────────────────────────────────────────────

export const blockersApi = {
  list: (params?: Record<string, string>) =>
    api.get('/blockers', { params }).then((r) => r.data.data),
  create: (data: unknown) => api.post('/blockers', data).then((r) => r.data.data),
  update: (id: string, data: unknown) => api.put(`/blockers/${id}`, data).then((r) => r.data.data),
  resolve: (id: string, resolution?: string) =>
    api.patch(`/blockers/${id}/resolve`, { resolution }).then((r) => r.data.data),
};

// ─── RAID ─────────────────────────────────────────────────────────────────────

export const raidApi = {
  risks: {
    list: (params?: Record<string, string>) => api.get('/raid/risks', { params }).then((r) => r.data.data),
    create: (data: unknown) => api.post('/raid/risks', data).then((r) => r.data.data),
    update: (id: string, data: unknown) => api.put(`/raid/risks/${id}`, data).then((r) => r.data.data),
  },
  issues: {
    list: (params?: Record<string, string>) => api.get('/raid/issues', { params }).then((r) => r.data.data),
    create: (data: unknown) => api.post('/raid/issues', data).then((r) => r.data.data),
    update: (id: string, data: unknown) => api.put(`/raid/issues/${id}`, data).then((r) => r.data.data),
  },
  dependencies: {
    list: (params?: Record<string, string>) => api.get('/raid/dependencies', { params }).then((r) => r.data.data),
    create: (data: unknown) => api.post('/raid/dependencies', data).then((r) => r.data.data),
    update: (id: string, data: unknown) => api.put(`/raid/dependencies/${id}`, data).then((r) => r.data.data),
  },
  assumptions: {
    list: (params?: Record<string, string>) => api.get('/raid/assumptions', { params }).then((r) => r.data.data),
    create: (data: unknown) => api.post('/raid/assumptions', data).then((r) => r.data.data),
    update: (id: string, data: unknown) => api.put(`/raid/assumptions/${id}`, data).then((r) => r.data.data),
  },
};

// ─── Decisions ────────────────────────────────────────────────────────────────

export const decisionsApi = {
  list: (params?: Record<string, string>) =>
    api.get('/decisions', { params }).then((r) => r.data.data),
  create: (data: unknown) => api.post('/decisions', data).then((r) => r.data.data),
  update: (id: string, data: unknown) => api.put(`/decisions/${id}`, data).then((r) => r.data.data),
  delete: (id: string) => api.delete(`/decisions/${id}`).then((r) => r.data.data),
};

// ─── Reports ──────────────────────────────────────────────────────────────────

export const reportsApi = {
  list: (params?: Record<string, string>) =>
    api.get('/reports', { params }).then((r) => r.data.data),
  get: (id: string) => api.get(`/reports/${id}`).then((r) => r.data.data),
  getPublic: (id: string) => api.get(`/reports/public/${id}`).then((r) => r.data.data),
  generate: (data: unknown) => api.post('/reports/generate', data).then((r) => r.data.data),
  update: (id: string, data: unknown) => api.patch(`/reports/${id}`, data).then((r) => r.data.data),
};

// ─── Users (for assignment dropdowns) ────────────────────────────────────────

export const usersApi = {
  list: () => api.get('/auth/users').then((r) => r.data.data),
  getProfile: () => api.get('/users/me').then((r) => r.data.data),
  updateProfile: (data: { name?: string; avatarUrl?: string }) =>
    api.patch('/users/me', data).then((r) => r.data.data),
  uploadAvatar: (data: { fileName: string; contentType: string; base64: string }) =>
    api.post('/users/me/avatar/upload', data).then((r) => r.data.data),
  updateEmail: (data: { email: string }) =>
    api.post('/users/me/email-update', data).then((r) => r.data),
};

// ─── Admin ────────────────────────────────────────────────────────────────────

export const adminApi = {
  listUsers: (params?: Record<string, string>) =>
    api.get('/admin/users', { params }).then((r) => r.data.data),
  inviteUser: (data: unknown) => api.post('/admin/users/invite', data).then((r) => r.data.data),
  updateUser: (id: string, data: unknown) =>
    api.put(`/admin/users/${id}`, data).then((r) => r.data.data),
  deactivateUser: (id: string) =>
    api.delete(`/admin/users/${id}`).then((r) => r.data.data),
  getTenant: () => api.get('/admin/tenant').then((r) => r.data.data),
  getAuditLogs: (params?: Record<string, string>) =>
    api.get('/admin/audit-logs', { params }).then((r) => r.data.data),
  getModules: () => api.get('/admin/modules').then((r) => r.data.data),
  getMyPermissions: () => api.get('/admin/my-permissions').then((r) => r.data.data),
  getUserPermissions: (userId: string) =>
    api.get(`/admin/users/${userId}/permissions`).then((r) => r.data.data),
  setUserPermissions: (userId: string, data: { granted: string[]; revoked: string[] }) =>
    api.put(`/admin/users/${userId}/permissions`, data).then((r) => r.data.data),
};

// ─── Super Admin ──────────────────────────────────────────────────────────────

export const superAdminApi = {
  // Overview
  getStats: () => api.get('/super-admin/stats').then(r => r.data.data),

  // Tenants
  listTenants: (params?: Record<string, string>) =>
    api.get('/super-admin/tenants', { params }).then(r => r.data.data),
  getTenantDetail: (tenantId: string) =>
    api.get(`/super-admin/tenants/${tenantId}`).then(r => r.data.data),
  updateTenantStatus: (tenantId: string, status: string, reason?: string) =>
    api.patch(`/super-admin/tenants/${tenantId}/status`, { status, reason }).then(r => r.data.data),
  lockTenant: (tenantId: string, data: { lockType: string; reason: string; durationDays?: number }) =>
    api.post(`/super-admin/tenants/${tenantId}/lock`, data).then(r => r.data.data),
  unlockTenant: (tenantId: string, data?: { reason?: string }) =>
    api.post(`/super-admin/tenants/${tenantId}/unlock`, data ?? {}).then(r => r.data.data),
  listTenantUsers: (tenantId: string) =>
    api.get(`/super-admin/tenants/${tenantId}/users`).then(r => r.data.data),

  // Module Permissions
  getModulePermissions: (tenantId: string) =>
    api.get(`/super-admin/tenants/${tenantId}/modules`).then(r => r.data.data),
  updateModulePermissions: (tenantId: string, modules: { key: string; enabled: boolean }[]) =>
    api.put(`/super-admin/tenants/${tenantId}/modules`, { modules }).then(r => r.data.data),

  // Subscription
  getSubscriptionUsage: (tenantId: string) =>
    api.get(`/super-admin/tenants/${tenantId}/subscription`).then(r => r.data.data),

  // Users (cross-tenant)
  getAllUsers: (params?: Record<string, string>) =>
    api.get('/super-admin/users', { params }).then(r => r.data.data),
  blockUser: (userId: string, reason: string) =>
    api.post(`/super-admin/users/${userId}/block`, { reason }).then(r => r.data.data),
  unblockUser: (userId: string) =>
    api.post(`/super-admin/users/${userId}/unblock`).then(r => r.data.data),

  // AI Recommendations
  getRecommendations: (params?: Record<string, string>) =>
    api.get('/super-admin/recommendations', { params }).then(r => r.data.data),
  resolveRecommendation: (recId: string, notes?: string) =>
    api.post(`/super-admin/recommendations/${recId}/resolve`, { notes }).then(r => r.data.data),

  // Audit & Security
  getAuditLogs: (params?: Record<string, string>) =>
    api.get('/super-admin/audit-logs', { params }).then(r => r.data.data),
  getLockHistory: (params?: Record<string, string>) =>
    api.get('/super-admin/lock-history', { params }).then(r => r.data.data),

  // Performance
  getPerformanceMetrics: () =>
    api.get('/super-admin/performance').then(r => r.data.data),

  // Smart Alerts
  getSmartAlerts: () =>
    api.get('/super-admin/alerts').then(r => r.data.data),

  // Feature Usage
  getFeatureUsage: () =>
    api.get('/super-admin/feature-usage').then(r => r.data.data),
};

// ─── Notifications ────────────────────────────────────────────────────────────

export const notificationsApi = {
  list: (params?: Record<string, string>) =>
    api.get('/notifications', { params }).then((r) => r.data.data),
  count: () => api.get('/notifications/count').then((r) => r.data.data),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`).then((r) => r.data.data),
  markAllRead: () => api.patch('/notifications/read-all').then((r) => r.data.data),
  delete: (id: string) => api.delete(`/notifications/${id}`).then((r) => r.data.data),
};

// ─── Teams ────────────────────────────────────────────────────────────────────

export const teamsApi = {
  list: (params?: Record<string, string>) =>
    api.get('/teams', { params }).then((r) => r.data.data),
  get: (teamId: string) => api.get(`/teams/${teamId}`).then((r) => r.data.data),
  create: (data: unknown) => api.post('/teams', data).then((r) => r.data.data),
  update: (teamId: string, data: unknown) =>
    api.put(`/teams/${teamId}`, data).then((r) => r.data.data),
  delete: (teamId: string) => api.delete(`/teams/${teamId}`).then((r) => r.data.data),
  addMember: (teamId: string, data: unknown) =>
    api.post(`/teams/${teamId}/members`, data).then((r) => r.data.data),
  removeMember: (teamId: string, memberId: string) =>
    api.delete(`/teams/${teamId}/members/${memberId}`).then((r) => r.data.data),
};

// ─── Enhanced Reports ─────────────────────────────────────────────────────────

export const enhancedReportsApi = {
  userPerformance: (params: Record<string, string>) =>
    api.get('/reports/user-performance', { params }).then((r) => r.data.data),
  teamPerformance: (params: Record<string, string>) =>
    api.get('/reports/team-performance', { params }).then((r) => r.data.data),
  dailySummary: (params: Record<string, string>) =>
    api.get('/reports/daily-summary', { params }).then((r) => r.data.data),
};

// ─── AI Insights (ai_service function) ───────────────────────────────────────
// The ai_service is a separate Catalyst Advanced IO function, so it lives at a
// different URL prefix than the main delivery_sync_function.

const aiClient = axios.create({
  baseURL: '/server/ai_service/api/ai',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

aiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ success: boolean; message: string }>) => {
    const message = error.response?.data?.message || error.message || 'AI service error';
    const enhanced = new Error(message) as Error & { status?: number };
    enhanced.status = error.response?.status;
    return Promise.reject(enhanced);
  }
);

export interface AiRequestParams {
  projectId?: string;
  date?: string;
  days?: number;
  type?: string;
  context?: string;
  dateFrom?: string;
  dateTo?: string;
  [key: string]: unknown;
}

export const aiApi = {
  /** Summarise standups + EODs for a given date */
  dailySummary: (params: AiRequestParams = {}) =>
    aiClient.post('/daily-summary', params).then((r) => r.data),

  /** Analyse project health — On Track / At Risk / Delayed */
  projectHealth: (params: AiRequestParams = {}) =>
    aiClient.post('/project-health', params).then((r) => r.data),

  /** Per-member performance insights over N days */
  performance: (params: AiRequestParams = {}) =>
    aiClient.post('/performance', params).then((r) => r.data),

  /** Generate a daily / weekly / project AI report */
  generateReport: (params: AiRequestParams & { type: string }) =>
    aiClient.post('/report', params).then((r) => r.data),

  /** Smart suggestions: productivity, risk mitigation, resource allocation */
  suggestions: (params: AiRequestParams = {}) =>
    aiClient.post('/suggestions', params).then((r) => r.data),

  /** Detect explicit + implicit blockers from recent standup/EOD text */
  detectBlockers: (params: AiRequestParams & { days?: number }) =>
    aiClient.post('/detect-blockers', params).then((r) => r.data),

  /** Analyse productivity, engagement, mood and blocker trends */
  analyzeTrends: (params: AiRequestParams & { days?: number }) =>
    aiClient.post('/trends', params).then((r) => r.data),

  /** Sprint retrospective: went well, went wrong, action items */
  generateRetrospective: (params: AiRequestParams & { sprintStart?: string; sprintEnd?: string }) =>
    aiClient.post('/retrospective', params).then((r) => r.data),

  /** Answer a free-text natural language query about the project */
  naturalLanguageQuery: (params: { query: string; projectId?: string }) =>
    aiClient.post('/query', params).then((r) => r.data),

  /** Process a voice transcript → extract structured standup/EOD fields + insights */
  processVoice: (params: { transcript: string; type: 'standup' | 'eod'; projectId?: string; date?: string }) =>
    aiClient.post('/process-voice', params).then((r) => r.data),

  /** Generate concise AI insight for a single task */
  taskInsight: (params: { title: string; description?: string; status?: string; priority?: string; dueDate?: string; taskId?: string }) =>
    aiClient.post('/task-insight', params).then((r) => r.data),

  /** Holistic performance analysis across ALL modules (tasks, attendance, leave, time, standups, etc.) */
  holisticPerformance: (params: { targetUserId?: string; days?: 7 | 30 | 90 }) =>
    aiClient.post('/holistic-performance', params).then((r) => r.data),

  /** Sprint-specific analysis: velocity, completion rate, star rating, recommendations */
  sprintAnalysis: (params: { sprintId: string }) =>
    aiClient.post('/sprint-analysis', params).then((r) => r.data),
};

// ─── People Service clients ────────────────────────────────────────────────────

const peopleClient = axios.create({
  baseURL: '/server/people_service/api/people',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});
peopleClient.interceptors.response.use(
  (r) => r,
  (error: AxiosError<{ success: boolean; message: string }>) => {
    const message = error.response?.data?.message || error.message || 'People service error';
    const enhanced = new Error(message) as Error & { status?: number };
    enhanced.status = error.response?.status;
    return Promise.reject(enhanced);
  }
);

export const attendanceApi = {
  checkIn:   (data: unknown) => peopleClient.post('/attendance/check-in', data).then((r) => r.data.data),
  checkOut:  (data: unknown) => peopleClient.post('/attendance/check-out', data).then((r) => r.data.data),
  myRecord:  () => peopleClient.get('/attendance/my-record').then((r) => r.data.data),
  live:      () => peopleClient.get('/attendance/live').then((r) => r.data.data),
  records:   (params?: Record<string, string>) => peopleClient.get('/attendance/records', { params }).then((r) => r.data.data),
  markWfh:   (data: unknown) => peopleClient.post('/attendance/wfh', data).then((r) => r.data.data),
  override:  (recordId: string, data: unknown) => peopleClient.patch(`/attendance/${recordId}/override`, data).then((r) => r.data.data),
  anomalies: () => peopleClient.get('/attendance/anomalies').then((r) => r.data.data),
  summary:   (params?: Record<string, string>) => peopleClient.get('/attendance/summary', { params }).then((r) => r.data.data),
  exportCsv: (params?: Record<string, string>) => peopleClient.get('/attendance/export', { params, responseType: 'blob' }).then((r) => r.data),
};

export const leaveApi = {
  listTypes:      () => peopleClient.get('/leave/types').then((r) => r.data.data),
  createType:     (data: unknown) => peopleClient.post('/leave/types', data).then((r) => r.data.data),
  updateType:     (typeId: string, data: unknown) => peopleClient.put(`/leave/types/${typeId}`, data).then((r) => r.data.data),
  getBalance:     (userId?: string) => peopleClient.get(`/leave/balance${userId ? `/${userId}` : ''}`).then((r) => r.data.data),
  listRequests:   (params?: Record<string, string>) => peopleClient.get('/leave/requests', { params }).then((r) => r.data.data),
  getRequest:     (id: string) => peopleClient.get(`/leave/requests/${id}`).then((r) => r.data.data),
  apply:          (data: unknown) => peopleClient.post('/leave/requests', data).then((r) => r.data.data),
  cancel:         (id: string) => peopleClient.delete(`/leave/requests/${id}`).then((r) => r.data.data),
  approve:        (id: string, data?: unknown) => peopleClient.patch(`/leave/requests/${id}/approve`, data).then((r) => r.data.data),
  reject:         (id: string, data: unknown) => peopleClient.patch(`/leave/requests/${id}/reject`, data).then((r) => r.data.data),
  calendar:           (params?: Record<string, string>) => peopleClient.get('/leave/calendar', { params }).then((r) => r.data.data),
  checkOverlap:       (params: Record<string, string>) => peopleClient.get('/leave/overlaps', { params }).then((r) => r.data.data),
  // Company calendar (admin)
  getCompanyCalendar: (params?: Record<string, string>) => peopleClient.get('/leave/company-calendar', { params }).then((r) => r.data.data),
  createHoliday:      (data: unknown) => peopleClient.post('/leave/company-calendar', data).then((r) => r.data.data),
  deleteHoliday:      (id: string) => peopleClient.delete(`/leave/company-calendar/${id}`).then((r) => r.data.data),
  // Leave balance admin
  setBalance:         (data: unknown) => peopleClient.post('/leave/balance/set', data).then((r) => r.data.data),
  getAllBalances:      (params?: Record<string, string>) => peopleClient.get('/leave/balance/all', { params }).then((r) => r.data.data),
};

export const announcementsApi = {
  list:       () => peopleClient.get('/announcements').then((r) => r.data.data),
  create:     (data: unknown) => peopleClient.post('/announcements', data).then((r) => r.data.data),
  update:     (id: string, data: unknown) => peopleClient.put(`/announcements/${id}`, data).then((r) => r.data.data),
  remove:     (id: string) => peopleClient.delete(`/announcements/${id}`).then((r) => r.data.data),
  markRead:   (id: string) => peopleClient.patch(`/announcements/${id}/read`).then((r) => r.data.data),
  readStatus: (id: string) => peopleClient.get(`/announcements/${id}/read-status`).then((r) => r.data.data),
};

export const dataSeedApi = {
  stats: () => api.get('/data-seed/stats').then((r) => r.data.data),
  run: (data: {
    modules: { projects?: number; actions?: number; blockers?: number; standups?: number; eod?: number };
    date_from: string;
    date_to: string;
  }) => api.post('/data-seed/run', data).then((r) => r.data.data),
  clear: (data: { modules: string[]; confirm: true }) =>
    api.delete('/data-seed/clear', { data }).then((r) => r.data.data),
};

export const orgApi = {
  hierarchy:      () => peopleClient.get('/org/hierarchy').then((r) => r.data.data),
  directReports:  (userId: string) => peopleClient.get(`/org/reports/${userId}`).then((r) => r.data.data),
  getManager:     (userId: string) => peopleClient.get(`/org/manager/${userId}`).then((r) => r.data.data),
  setManager:     (data: unknown) => peopleClient.put('/org/manager', data).then((r) => r.data.data),
};

// ─── Task & Sprint Service clients ────────────────────────────────────────────

const taskClient = axios.create({
  baseURL: '/server/task_sprint_service/api/ts',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});
taskClient.interceptors.response.use(
  (r) => r,
  (error: AxiosError<{ success: boolean; message: string }>) => {
    const message = error.response?.data?.message || error.message || 'Task service error';
    const enhanced = new Error(message) as Error & { status?: number };
    enhanced.status = error.response?.status;
    return Promise.reject(enhanced);
  }
);

export const sprintsApi = {
  list:         (projectId: string) => taskClient.get(`/sprints?project_id=${projectId}`).then((r) => r.data.data),
  get:          (id: string) => taskClient.get(`/sprints/${id}`).then((r) => r.data.data),
  create:       (data: unknown) => taskClient.post('/sprints', data).then((r) => r.data.data),
  update:       (id: string, data: unknown) => taskClient.put(`/sprints/${id}`, data).then((r) => r.data.data),
  start:        (id: string) => taskClient.patch(`/sprints/${id}/start`).then((r) => r.data.data),
  complete:     (id: string) => taskClient.patch(`/sprints/${id}/complete`).then((r) => r.data.data),
  board:        (id: string) => taskClient.get(`/sprints/${id}/board`).then((r) => r.data.data),
  velocity:     (projectId: string) => taskClient.get(`/sprints/velocity?project_id=${projectId}`).then((r) => r.data.data),
  addMember:    (id: string, data: unknown) => taskClient.post(`/sprints/${id}/members`, data).then((r) => r.data.data),
  removeMember: (id: string, userId: string) => taskClient.delete(`/sprints/${id}/members/${userId}`).then((r) => r.data.data),
};

export const tasksApi = {
  list:         (params?: Record<string, string>) => taskClient.get('/tasks', { params }).then((r) => r.data.data),
  myTasks:      () => taskClient.get('/tasks/my-tasks').then((r) => r.data.data),
  overdue:      () => taskClient.get('/tasks/overdue').then((r) => r.data.data),
  backlog:      (projectId: string) => taskClient.get(`/backlog?project_id=${projectId}`).then((r) => r.data.data),
  get:          (id: string) => taskClient.get(`/tasks/${id}`).then((r) => r.data.data),
  create:       (data: unknown) => taskClient.post('/tasks', data).then((r) => r.data.data),
  update:       (id: string, data: unknown) => taskClient.put(`/tasks/${id}`, data).then((r) => r.data.data),
  remove:       (id: string) => taskClient.delete(`/tasks/${id}`).then((r) => r.data.data),
  updateStatus: (id: string, data: unknown) => taskClient.patch(`/tasks/${id}/status`, data).then((r) => r.data.data),
  assign:       (id: string, data: unknown) => taskClient.patch(`/tasks/${id}/assign`, data).then((r) => r.data.data),
  moveSprint:   (id: string, data: unknown) => taskClient.patch(`/tasks/${id}/move-sprint`, data).then((r) => r.data.data),
  getComments:  (id: string) => taskClient.get(`/tasks/${id}/comments`).then((r) => r.data.data),
  addComment:   (id: string, data: unknown) => taskClient.post(`/tasks/${id}/comments`, data).then((r) => r.data.data),
  deleteComment:(id: string, commentId: string) => taskClient.delete(`/tasks/${id}/comments/${commentId}`).then((r) => r.data.data),
  getHistory:       (id: string) => taskClient.get(`/tasks/${id}/history`).then((r) => r.data.data),
  uploadAttachment: (id: string, file: File) =>
    new Promise<unknown>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        taskClient.post(`/tasks/${id}/attachments`, {
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          base64,
        }).then((r) => resolve(r.data.data)).catch(reject);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    }),
  deleteAttachment: (taskId: string, attachId: string) =>
    taskClient.delete(`/tasks/${taskId}/attachments/${attachId}`).then((r) => r.data.data),
};

// ─── Time Tracking Service clients ────────────────────────────────────────────

const timeClient = axios.create({
  baseURL: '/server/time_tracking_service/api/time',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});
timeClient.interceptors.response.use(
  (r) => r,
  (error: AxiosError<{ success: boolean; message: string }>) => {
    const message = error.response?.data?.message || error.message || 'Time service error';
    const enhanced = new Error(message) as Error & { status?: number };
    enhanced.status = error.response?.status;
    return Promise.reject(enhanced);
  }
);

export const timeEntriesApi = {
  list:        (params?: Record<string, string>) => timeClient.get('/entries', { params }).then((r) => r.data.data),
  myWeek:      () => timeClient.get('/entries/my-week').then((r) => r.data.data),
  summary:     (params?: Record<string, string>) => timeClient.get('/entries/summary', { params }).then((r) => r.data.data),
  get:         (id: string) => timeClient.get(`/entries/${id}`).then((r) => r.data.data),
  create:      (data: unknown) => timeClient.post('/entries', data).then((r) => r.data.data),
  update:      (id: string, data: unknown) => timeClient.put(`/entries/${id}`, data).then((r) => r.data.data),
  remove:      (id: string) => timeClient.delete(`/entries/${id}`).then((r) => r.data.data),
  submit:      (id: string) => timeClient.patch(`/entries/${id}/submit`).then((r) => r.data.data),
  retract:     (id: string) => timeClient.patch(`/entries/${id}/retract`).then((r) => r.data.data),
  bulkSubmit:  (data: unknown) => timeClient.post('/entries/bulk-submit', data).then((r) => r.data.data),
};

export const timeApprovalsApi = {
  list:     (params?: Record<string, string>) => timeClient.get('/approvals', { params }).then((r) => r.data.data),
  history:  (params?: Record<string, string>) => timeClient.get('/approvals/history', { params }).then((r) => r.data.data),
  approve:  (id: string, data?: unknown) => timeClient.patch(`/approvals/${id}/approve`, data).then((r) => r.data.data),
  reject:   (id: string, data: unknown) => timeClient.patch(`/approvals/${id}/reject`, data).then((r) => r.data.data),
  escalate: (id: string) => timeClient.patch(`/approvals/${id}/escalate`).then((r) => r.data.data),
};

// ─── Asset Service clients ─────────────────────────────────────────────────────

const assetClient = axios.create({
  baseURL: '/server/asset_service/api/assets',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});
assetClient.interceptors.response.use(
  (r) => r,
  (error: AxiosError<{ success: boolean; message: string }>) => {
    const message = error.response?.data?.message || error.message || 'Asset service error';
    const enhanced = new Error(message) as Error & { status?: number };
    enhanced.status = error.response?.status;
    return Promise.reject(enhanced);
  }
);

export const assetsApi = {
  categories:      {
    list:   () => assetClient.get('/categories').then((r) => r.data.data),
    create: (data: unknown) => assetClient.post('/categories', data).then((r) => r.data.data),
    update: (id: string, data: unknown) => assetClient.put(`/categories/${id}`, data).then((r) => r.data.data),
    remove: (id: string) => assetClient.delete(`/categories/${id}`).then((r) => r.data.data),
  },
  inventory:       {
    list:      (params?: Record<string, string>) => assetClient.get('/inventory', { params }).then((r) => r.data.data),
    available: () => assetClient.get('/inventory/available').then((r) => r.data.data),
    myAssets:  () => assetClient.get('/inventory/my-assets').then((r) => r.data.data),
    get:       (id: string) => assetClient.get(`/inventory/${id}`).then((r) => r.data.data),
    create:    (data: unknown) => assetClient.post('/inventory', data, data instanceof FormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {}).then((r) => r.data.data),
    update:    (id: string, data: unknown) => assetClient.put(`/inventory/${id}`, data, data instanceof FormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {}).then((r) => r.data.data),
    retire:      (id: string) => assetClient.patch(`/inventory/${id}/retire`).then((r) => r.data.data),
    bulkCreate:  (rows: unknown[]) => assetClient.post('/inventory/bulk', { assets: rows }).then((r) => r.data.data),
  },
  requests:        {
    list:    (params?: Record<string, string>) => assetClient.get('/requests', { params }).then((r) => r.data.data),
    create:  (data: unknown) => assetClient.post('/requests', data).then((r) => r.data.data),
    approve: (id: string) => assetClient.patch(`/requests/${id}/approve`).then((r) => r.data.data),
    reject:  (id: string, data: unknown) => assetClient.patch(`/requests/${id}/reject`, data).then((r) => r.data.data),
    fulfill: (id: string, data: unknown) => assetClient.patch(`/requests/${id}/fulfill`, data).then((r) => r.data.data),
  },
  assignments:     {
    list:   (params?: Record<string, string>) => assetClient.get('/assignments', { params }).then((r) => r.data.data),
    create: (data: unknown) => assetClient.post('/assignments', data).then((r) => r.data.data),
    return: (id: string, data?: unknown) => assetClient.patch(`/assignments/${id}/return`, data).then((r) => r.data.data),
  },
  maintenance:     {
    list:     (params?: Record<string, string>) => assetClient.get('/maintenance', { params }).then((r) => r.data.data),
    schedule: (data: unknown) => assetClient.post('/maintenance', data).then((r) => r.data.data),
    complete: (id: string, data?: unknown) => assetClient.patch(`/maintenance/${id}/complete`, data).then((r) => r.data.data),
  },
};

// ─── Badge & Profile Service clients ──────────────────────────────────────────

const badgeClient = axios.create({
  baseURL: '/server/badge_profile_service/api/bp',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});
badgeClient.interceptors.response.use(
  (r) => r,
  (error: AxiosError<{ success: boolean; message: string }>) => {
    const message = error.response?.data?.message || error.message || 'Badge service error';
    const enhanced = new Error(message) as Error & { status?: number };
    enhanced.status = error.response?.status;
    return Promise.reject(enhanced);
  }
);

export const profilesApi = {
  me:        () => badgeClient.get('/profiles/me').then((r) => r.data.data),
  getById:   (userId: string) => badgeClient.get(`/profiles/${userId}`).then((r) => r.data.data),
  updateMe:  (data: unknown) => badgeClient.put('/profiles/me', data).then((r) => r.data.data),
  directory: (params?: Record<string, string>) => badgeClient.get('/profiles/directory', { params }).then((r) => r.data.data),
  uploadFile: (file: File, type: 'resume' | 'photo' = 'resume') => {
    const fd = new FormData();
    fd.append('file', file);
    // Must delete Content-Type so axios sets multipart/form-data with correct boundary
    return badgeClient.post(`/profiles/upload-file?type=${type}`, fd, {
      headers: { 'Content-Type': undefined },
    }).then((r) => r.data.data as { url: string; field: string });
  },
};

export const badgesApi = {
  list:        () => badgeClient.get('/badges').then((r) => r.data.data),
  create:      (data: unknown) => badgeClient.post('/badges', data, {
    headers: data instanceof FormData ? { 'Content-Type': undefined } : {},
  }).then((r) => r.data.data),
  update:      (id: string, data: unknown) => badgeClient.put(`/badges/${id}`, data).then((r) => r.data.data),
  award:       (id: string, data: unknown) => badgeClient.post(`/badges/${id}/award`, data).then((r) => r.data.data),
  revoke:      (id: string, data: unknown) => badgeClient.patch(`/badges/${id}/revoke`, data).then((r) => r.data.data),
  leaderboard: () => badgeClient.get('/badges/leaderboard').then((r) => r.data.data),
};

// ─── Enterprise Reports Service clients ───────────────────────────────────────

const reportingClient = axios.create({
  baseURL: '/server/reporting_service/api/reports',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});
reportingClient.interceptors.response.use(
  (r) => r,
  (error: AxiosError<{ success: boolean; message: string }>) => {
    const message = error.response?.data?.message || error.message || 'Reporting service error';
    const enhanced = new Error(message) as Error & { status?: number };
    enhanced.status = error.response?.status;
    return Promise.reject(enhanced);
  }
);

// ─── Admin Config Service clients ─────────────────────────────────────────────

const configClient = axios.create({
  baseURL: '/server/admin_config_service/api/config',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});
configClient.interceptors.response.use(
  (r) => r,
  (error: AxiosError<{ success: boolean; message: string }>) => {
    const message = error.response?.data?.message || error.message || 'Config service error';
    const enhanced = new Error(message) as Error & { status?: number };
    enhanced.status = error.response?.status;
    return Promise.reject(enhanced);
  }
);

export const adminConfigApi = {
  workflows: {
    list:     (params?: Record<string, string>) => configClient.get('/workflows', { params }).then((r) => r.data.data),
    create:   (data: unknown) => configClient.post('/workflows', data).then((r) => r.data.data),
    update:   (id: string, data: unknown) => configClient.put(`/workflows/${id}`, data).then((r) => r.data.data),
    remove:   (id: string) => configClient.delete(`/workflows/${id}`).then((r) => r.data.data),
    activate: (id: string) => configClient.post(`/workflows/${id}/activate`).then((r) => r.data.data),
  },
  forms: {
    list:      (params?: Record<string, string>) => configClient.get('/forms', { params }).then((r) => r.data.data),
    create:    (data: unknown) => configClient.post('/forms', data).then((r) => r.data.data),
    update:    (id: string, data: unknown) => configClient.put(`/forms/${id}`, data).then((r) => r.data.data),
    getActive: (formType: string) => configClient.get(`/forms/${formType}/active`).then((r) => r.data.data),
  },
  features: {
    list:    (params?: Record<string, string>) => configClient.get('/features', { params }).then((r) => r.data.data),
    enabled: () => configClient.get('/features/enabled').then((r) => r.data.data),
    create:  (data: unknown) => configClient.post('/features', data).then((r) => r.data.data),
    update:  (flagName: string, data: unknown) => configClient.put(`/features/${flagName}`, data).then((r) => r.data.data),
  },
  permissions: {
    matrix:       () => configClient.get('/permissions/matrix').then((r) => r.data.data),
    getRole:      (role: string) => configClient.get(`/permissions/role/${role}`).then((r) => r.data.data),
    overrideRole: (role: string, data: unknown) => configClient.put(`/permissions/role/${role}`, data).then((r) => r.data.data),
    grantProject: (data: unknown) => configClient.post('/permissions/project', data).then((r) => r.data.data),
    revokeProject:(id: string) => configClient.delete(`/permissions/project/${id}`).then((r) => r.data.data),
  },
  migration: {
    validate: (data: unknown) => configClient.post('/migration/validate', data).then((r) => r.data.data),
    import:   (data: unknown) => configClient.post('/migration/import', data).then((r) => r.data.data),
  },
  seed: {
    demo: () => configClient.post('/seed/demo').then((r) => r.data.data),
  },
};

// ─── Enterprise Reports Service clients ───────────────────────────────────────

export const enterpriseReportsApi = {
  deliveryHealth:    (params?: Record<string, string>) => reportingClient.get('/delivery-health', { params }).then((r) => r.data.data),
  projectHealth:     (projectId: string) => reportingClient.get(`/delivery-health/${projectId}`).then((r) => r.data.data),
  peopleSummary:     (params?: Record<string, string>) => reportingClient.get('/people-summary', { params }).then((r) => r.data.data),
  attendanceReport:  (params?: Record<string, string>) => reportingClient.get('/attendance-report', { params }).then((r) => r.data.data),
  leaveReport:       (params?: Record<string, string>) => reportingClient.get('/leave-report', { params }).then((r) => r.data.data),
  timeSummary:       (params?: Record<string, string>) => reportingClient.get('/time-summary', { params }).then((r) => r.data.data),
  timeByProject:     (params?: Record<string, string>) => reportingClient.get('/time-by-project', { params }).then((r) => r.data.data),
  assetSummary:      () => reportingClient.get('/asset-summary').then((r) => r.data.data),
  executiveBrief:    () => reportingClient.get('/executive-brief').then((r) => r.data.data),
  customReport:      (data: unknown) => reportingClient.post('/custom', data).then((r) => r.data.data),
  generatePdf:       (data: unknown) => reportingClient.post('/pdf/generate', data).then((r) => r.data.data),
  pdfJobs:           () => reportingClient.get('/pdf/jobs').then((r) => r.data.data),
};

export default api;
