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
  (error: AxiosError<{ success: boolean; message: string; errors?: string[] }>) => {
    const message =
      error.response?.data?.message ||
      error.message ||
      'An unexpected error occurred';
    const enhanced = new Error(message) as Error & { status?: number; errors?: string[] };
    enhanced.status = error.response?.status;
    enhanced.errors = error.response?.data?.errors;
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
  list: () => api.get('/projects').then((r) => r.data.data),
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
};

// ─── Super Admin ──────────────────────────────────────────────────────────────

export const superAdminApi = {
  getStats: () => api.get('/super-admin/stats').then(r => r.data.data),
  listTenants: () => api.get('/super-admin/tenants').then(r => r.data.data),
  updateTenantStatus: (tenantId: string, status: string) =>
    api.patch(`/super-admin/tenants/${tenantId}/status`, { status }).then(r => r.data.data),
  listTenantUsers: (tenantId: string) =>
    api.get(`/super-admin/tenants/${tenantId}/users`).then(r => r.data.data),
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
  type?: 'daily' | 'weekly' | 'project';
  dateFrom?: string;
  dateTo?: string;
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
};

export default api;
