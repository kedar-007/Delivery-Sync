'use strict';

const DataStoreService = require('../services/DataStoreService');
const ResponseHelper   = require('../utils/ResponseHelper');
const { TABLES }       = require('../utils/Constants');

// Catalyst ZCQL hard limit — never exceed this in any query
const ZCQL_MAX = 200;

// ── Platform modules catalogue (only modules that exist in the app) ───────────
const ALL_MODULES = [
  { key: 'projects', label: 'Projects & Sprints',  icon: '📋', defaultEnabled: true  },
  { key: 'people',   label: 'People & HR',         icon: '👥', defaultEnabled: true  },
  { key: 'assets',   label: 'Asset Management',    icon: '🖥️', defaultEnabled: true  },
  { key: 'time',     label: 'Time Tracking',       icon: '⏱️', defaultEnabled: true  },
  { key: 'reports',  label: 'Reports & Analytics', icon: '📊', defaultEnabled: true  },
  { key: 'ai',       label: 'AI Insights',         icon: '🤖', defaultEnabled: true  },
  { key: 'exec',     label: 'Executive Dashboard', icon: '📈', defaultEnabled: true  },
];

// ── AI Recommendation Engine ─────────────────────────────────────────────────
function generateRecommendations(tenantData, users, projects, tasks, leaves) {
  const recs = [];

  tenantData.forEach((tenant) => {
    const tid          = String(tenant.ROWID);
    const tUsers       = users.filter((u) => String(u.tenant_id) === tid);
    const tProjects    = projects.filter((p) => String(p.tenant_id) === tid);
    const tTasks       = tasks.filter((t) => String(t.tenant_id) === tid);
    const tLeaves      = leaves.filter((l) => String(l.tenant_id) === tid);

    const activeUsers    = tUsers.filter((u) => u.status === 'ACTIVE').length;
    const totalUsers     = tUsers.length || 1;
    const activeProjects = tProjects.filter((p) => p.status === 'ACTIVE').length;
    const doneTasks      = tTasks.filter((t) => t.status === 'DONE').length;
    const totalTasks     = tTasks.length || 1;
    const completionPct  = Math.round((doneTasks / totalTasks) * 100);
    const pendingLeaves  = tLeaves.filter((l) => l.status === 'PENDING').length;

    const overdueTasks = tTasks.filter((t) => {
      if (!t.due_date || t.status === 'DONE') return false;
      try { return new Date(t.due_date) < new Date(); } catch { return false; }
    }).length;

    // Low completion rate
    if (completionPct < 40 && tTasks.length >= 5) {
      recs.push({
        id:             `rec_low_completion_${tid}`,
        tenantId:       tid,
        tenantName:     tenant.name,
        category:       'PRODUCTIVITY',
        severity:       completionPct < 20 ? 'HIGH' : 'MEDIUM',
        title:          `Low task completion rate at ${tenant.name}`,
        description:    `Only ${completionPct}% of tasks are completed. Consider resource redistribution or sprint restructuring.`,
        impact:         'Delivery velocity improvement',
        confidence:     completionPct < 20 ? 88 : 72,
        actions:        ['Redistribute workload', 'Review sprint capacity', 'Escalate to delivery lead'],
        expectedImpact: `+${35 - completionPct}% completion rate in 2 sprints`,
        priority:       completionPct < 20 ? 1 : 2,
        type:           'RESOURCE_REDISTRIBUTION',
        status:         'OPEN',
        createdAt:      new Date().toISOString(),
      });
    }

    // High overdue tasks
    if (overdueTasks > 0 && (overdueTasks / totalTasks) > 0.2) {
      recs.push({
        id:             `rec_overdue_${tid}`,
        tenantId:       tid,
        tenantName:     tenant.name,
        category:       'RISK',
        severity:       'HIGH',
        title:          `${overdueTasks} overdue tasks at ${tenant.name}`,
        description:    `${Math.round((overdueTasks / totalTasks) * 100)}% of tasks are overdue. Workflow bottleneck likely.`,
        impact:         'SLA compliance risk',
        confidence:     91,
        actions:        ['Review blockers', 'Escalate overdue items', 'Reassign tasks'],
        expectedImpact: 'Reduce overdue by 60% in 1 sprint',
        priority:       1,
        type:           'WORKFLOW_BOTTLENECK',
        status:         'OPEN',
        createdAt:      new Date().toISOString(),
      });
    }

    // Inactive users
    const inactiveRatio = 1 - (activeUsers / totalUsers);
    if (inactiveRatio > 0.3 && totalUsers >= 3) {
      recs.push({
        id:             `rec_inactive_users_${tid}`,
        tenantId:       tid,
        tenantName:     tenant.name,
        category:       'ADOPTION',
        severity:       'MEDIUM',
        title:          `${Math.round(inactiveRatio * 100)}% users inactive at ${tenant.name}`,
        description:    `${totalUsers - activeUsers} of ${totalUsers} users are inactive. Low platform adoption.`,
        impact:         'Feature adoption and retention risk',
        confidence:     85,
        actions:        ['Send re-engagement email', 'Schedule training session', 'Review user permissions'],
        expectedImpact: 'Increase DAU by 40%',
        priority:       2,
        type:           'LOW_UTILIZATION',
        status:         'OPEN',
        createdAt:      new Date().toISOString(),
      });
    }

    // High pending leaves
    if (pendingLeaves >= 3) {
      recs.push({
        id:             `rec_leave_bandwidth_${tid}`,
        tenantId:       tid,
        tenantName:     tenant.name,
        category:       'BANDWIDTH',
        severity:       'MEDIUM',
        title:          `${pendingLeaves} pending leave requests at ${tenant.name}`,
        description:    'High leave backlog may indicate team bandwidth risk if approved.',
        impact:         'Team capacity planning',
        confidence:     78,
        actions:        ['Stagger leave approvals', 'Plan coverage', 'Alert delivery lead'],
        expectedImpact: 'Prevent 30% capacity drop',
        priority:       3,
        type:           'BANDWIDTH_RISK',
        status:         'OPEN',
        createdAt:      new Date().toISOString(),
      });
    }

    // No active projects
    if (activeUsers > 2 && activeProjects === 0) {
      recs.push({
        id:             `rec_no_projects_${tid}`,
        tenantId:       tid,
        tenantName:     tenant.name,
        category:       'CHURN',
        severity:       'HIGH',
        title:          `No active projects at ${tenant.name}`,
        description:    'Active team with no running projects — high churn risk.',
        impact:         'Subscription renewal risk',
        confidence:     82,
        actions:        ['Reach out to tenant admin', 'Offer onboarding session', 'Review engagement'],
        expectedImpact: 'Reduce churn probability by 50%',
        priority:       1,
        type:           'CHURN_RISK',
        status:         'OPEN',
        createdAt:      new Date().toISOString(),
      });
    }
  });

  return recs.sort((a, b) => a.priority - b.priority);
}

// ── Tenant Health Score ───────────────────────────────────────────────────────
function computeHealthScore(tenant, users, projects, tasks) {
  const tid = String(tenant.ROWID);
  const tUsers    = users.filter((u) => String(u.tenant_id) === tid);
  const tProjects = projects.filter((p) => String(p.tenant_id) === tid);
  const tTasks    = tasks.filter((t) => String(t.tenant_id) === tid);

  const activeUserPct = tUsers.length
    ? (tUsers.filter((u) => u.status === 'ACTIVE').length / tUsers.length) * 100 : 0;
  const taskCompletionPct = tTasks.length
    ? (tTasks.filter((t) => t.status === 'DONE').length / tTasks.length) * 100 : 50;
  const hasActiveProjects = tProjects.some((p) => p.status === 'ACTIVE') ? 100 : 0;
  const overdueRatio = tTasks.length
    ? tTasks.filter((t) => {
        if (!t.due_date || t.status === 'DONE') return false;
        try { return new Date(t.due_date) < new Date(); } catch { return false; }
      }).length / tTasks.length : 0;
  const overdueScore = Math.max(0, 100 - overdueRatio * 200);

  const score = Math.round(
    activeUserPct       * 0.30 +
    taskCompletionPct   * 0.25 +
    hasActiveProjects   * 0.20 +
    overdueScore        * 0.25
  );

  let label = 'Critical';
  if (score >= 80) label = 'Excellent';
  else if (score >= 65) label = 'Good';
  else if (score >= 45) label = 'Fair';
  else if (score >= 25) label = 'Poor';

  return { score: Math.min(100, Math.max(0, score)), label };
}

// ── Churn Risk ────────────────────────────────────────────────────────────────
function computeChurnRisk(tenant, users, projects) {
  const tid      = String(tenant.ROWID);
  const tUsers   = users.filter((u) => String(u.tenant_id) === tid);
  const tProjects= projects.filter((p) => String(p.tenant_id) === tid);

  let riskScore = 0;
  if (tUsers.filter((u) => u.status === 'ACTIVE').length === 0) riskScore += 40;
  if (!tProjects.some((p) => p.status === 'ACTIVE')) riskScore += 30;
  if (tenant.status === 'SUSPENDED') riskScore += 25;
  if (tUsers.length <= 1) riskScore += 20;

  return { score: Math.min(100, riskScore), risk: riskScore >= 60 ? 'HIGH' : riskScore >= 30 ? 'MEDIUM' : 'LOW' };
}

// ── Tenant row normaliser ─────────────────────────────────────────────────────
// Real schema (confirmed by AuthController inserts): slug, plan, status, settings
// lock info stored in settings JSON (no dedicated lock columns).
function parseTenant(t) {
  let settings = {};
  try { settings = JSON.parse(t.settings || '{}'); } catch (_) {}
  const lock = settings.lockInfo || {};
  return {
    ROWID:         t.ROWID,
    name:          t.name,
    slug:          t.slug || '',
    plan:          t.plan || 'STARTER',
    status:        t.status || 'ACTIVE',
    domain:        t.slug || '',
    settings:      t.settings,
    createdAt:     t.CREATEDTIME,
    lockReason:    lock.reason    || null,
    lockType:      lock.lockType  || null,
    lockedAt:      lock.lockedAt  || null,
    billingStatus: settings.billingStatus || 'ACTIVE',
    renewalDate:   settings.renewalDate   || null,
  };
}

/**
 * SuperAdminController – Full SaaS operator management console.
 * Only accessible to users with role = 'SUPER_ADMIN'.
 *
 * NOTE: All ZCQL queries are capped at ZCQL_MAX (200) rows —
 * Catalyst DataStore rejects any LIMIT > 200 with an error.
 */
class SuperAdminController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
  }

  // ── Platform Stats ──────────────────────────────────────────────────────────

  /** GET /api/super-admin/stats */
  async getStats(req, res) {
    try {
      const [tenants, users, projects, tasks] = await Promise.all([
        this.db.query(`SELECT ROWID, status, plan FROM ${TABLES.TENANTS} LIMIT ${ZCQL_MAX}`),
        this.db.query(`SELECT ROWID, status, tenant_id FROM ${TABLES.USERS} LIMIT ${ZCQL_MAX}`),
        this.db.query(`SELECT ROWID, status, tenant_id FROM ${TABLES.PROJECTS} LIMIT ${ZCQL_MAX}`),
        this.db.query(`SELECT ROWID, status, due_date, tenant_id FROM ${TABLES.TASKS} LIMIT ${ZCQL_MAX}`),
      ]);

      const overdueTasks = tasks.filter((t) => {
        if (!t.due_date || t.status === 'DONE') return false;
        try { return new Date(t.due_date) < new Date(); } catch { return false; }
      });

      const planDist = {};
      tenants.forEach((t) => {
        const p = t.plan || 'STARTER';
        planDist[p] = (planDist[p] || 0) + 1;
      });

      return ResponseHelper.success(res, {
        stats: {
          totalTenants:     tenants.length,
          activeTenants:    tenants.filter((t) => t.status === 'ACTIVE').length,
          suspendedTenants: tenants.filter((t) => t.status === 'SUSPENDED').length,
          cancelledTenants: tenants.filter((t) => t.status === 'CANCELLED').length,
          totalUsers:       users.length,
          activeUsers:      users.filter((u) => u.status === 'ACTIVE').length,
          totalProjects:    projects.length,
          activeProjects:   projects.filter((p) => p.status === 'ACTIVE').length,
          totalTasks:       tasks.length,
          overdueTasks:     overdueTasks.length,
          planDistribution: planDist,
        },
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── Organization Management ─────────────────────────────────────────────────

  /** GET /api/super-admin/tenants */
  async listTenants(req, res) {
    try {
      const { search, status, plan } = req.query;
      const rawTenants = await this.db.query(
        `SELECT * FROM ${TABLES.TENANTS} ORDER BY CREATEDTIME DESC LIMIT ${ZCQL_MAX}`
      );
      if (!rawTenants.length) return ResponseHelper.success(res, { tenants: [] });

      const tenantIds = rawTenants.map((t) => `'${t.ROWID}'`).join(',');
      const [users, projects] = await Promise.all([
        this.db.query(`SELECT tenant_id, status, role FROM ${TABLES.USERS} WHERE tenant_id IN (${tenantIds}) LIMIT ${ZCQL_MAX}`),
        this.db.query(`SELECT tenant_id, status FROM ${TABLES.PROJECTS} WHERE tenant_id IN (${tenantIds}) LIMIT ${ZCQL_MAX}`),
      ]);

      let result = rawTenants.map((t) => {
        const pt        = parseTenant(t);
        const tid       = String(t.ROWID);
        const tUsers    = users.filter((u) => String(u.tenant_id) === tid);
        const tProjects = projects.filter((p) => String(p.tenant_id) === tid);
        const churn     = computeChurnRisk(t, users, projects);

        return {
          id:             tid,
          name:           pt.name,
          slug:           pt.slug,
          plan:           pt.plan,
          status:         pt.status,
          domain:         pt.domain,
          billingStatus:  pt.billingStatus,
          renewalDate:    pt.renewalDate,
          userCount:      tUsers.length,
          activeUsers:    tUsers.filter((u) => u.status === 'ACTIVE').length,
          projectCount:   tProjects.length,
          activeProjects: tProjects.filter((p) => p.status === 'ACTIVE').length,
          churnRisk:      churn.risk,
          churnScore:     churn.score,
          createdAt:      pt.createdAt,
          lockReason:     pt.lockReason,
          lockedAt:       pt.lockedAt,
        };
      });

      if (search) {
        const q = search.toLowerCase();
        result = result.filter((t) => t.name.toLowerCase().includes(q) || (t.slug || '').toLowerCase().includes(q));
      }
      if (status) result = result.filter((t) => t.status === status);
      if (plan)   result = result.filter((t) => t.plan   === plan);

      return ResponseHelper.success(res, { tenants: result });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /** GET /api/super-admin/tenants/:tenantId */
  async getTenantDetail(req, res) {
    try {
      const { tenantId } = req.params;
      const rows = await this.db.query(`SELECT * FROM ${TABLES.TENANTS} WHERE ROWID = '${tenantId}' LIMIT 1`);
      const tenant = rows[0] || null;
      if (!tenant) return ResponseHelper.notFound(res, 'Tenant not found');

      const pt  = parseTenant(tenant);
      const tid = String(tenant.ROWID);
      const [users, projects] = await Promise.all([
        this.db.query(`SELECT * FROM ${TABLES.USERS} WHERE tenant_id = '${tid}' LIMIT ${ZCQL_MAX}`),
        this.db.query(`SELECT * FROM ${TABLES.PROJECTS} WHERE tenant_id = '${tid}' LIMIT ${ZCQL_MAX}`),
      ]);

      const churn = computeChurnRisk(tenant, users, projects);

      return ResponseHelper.success(res, {
        tenant: {
          id:            tid,
          name:          pt.name,
          slug:          pt.slug,
          plan:          pt.plan,
          status:        pt.status,
          domain:        pt.domain,
          billingStatus: pt.billingStatus,
          renewalDate:   pt.renewalDate,
          createdAt:     pt.createdAt,
          lockReason:    pt.lockReason,
          lockedAt:      pt.lockedAt,
          churnRisk:     churn.risk,
          churnScore:    churn.score,
          users:    users.map((u) => ({ id: String(u.ROWID), name: u.name, email: u.email, role: u.role, status: u.status })),
          projects: projects.map((p) => ({ id: String(p.ROWID), name: p.name, status: p.status })),
        },
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /** PATCH /api/super-admin/tenants/:tenantId/status */
  async updateTenantStatus(req, res) {
    try {
      const { tenantId } = req.params;
      const { status, reason, lockType } = req.body;
      const validStatuses = ['ACTIVE', 'SUSPENDED', 'CANCELLED', 'LOCKED'];
      if (!validStatuses.includes(status)) {
        return ResponseHelper.validationError(res, `Status must be one of: ${validStatuses.join(', ')}`);
      }

      // Lock info is stored in settings JSON — tenants table has no dedicated lock columns
      const tRows = await this.db.query(`SELECT ROWID, settings FROM ${TABLES.TENANTS} WHERE ROWID = '${tenantId}' LIMIT 1`);
      if (!tRows.length) return ResponseHelper.notFound(res, 'Tenant not found');
      let settings = {};
      try { settings = JSON.parse(tRows[0].settings || '{}'); } catch (_) {}

      if (status !== 'ACTIVE') {
        settings.lockInfo = {
          locked: true, reason: reason || null,
          lockType: lockType || 'MANUAL',
          lockedAt: new Date().toISOString(),
          lockedBy: String(req.currentUser?.id || 'SUPER_ADMIN'),
        };
      } else {
        delete settings.lockInfo;
      }

      await this.db.update(TABLES.TENANTS, {
        ROWID: tenantId, status, settings: JSON.stringify(settings),
      });

      await this.db.insert(TABLES.AUDIT_LOGS, {
        tenant_id:    tenantId,
        entity_type:  'TENANT',
        entity_id:    tenantId,
        action:       `TENANT_STATUS_CHANGED_TO_${status}`,
        new_value:    JSON.stringify({ status, reason, lockType }),
        performed_by: String(req.currentUser?.id || 'SUPER_ADMIN'),
      });

      return ResponseHelper.success(res, null, `Tenant ${status.toLowerCase()} successfully`);
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /** POST /api/super-admin/tenants/:tenantId/lock */
  async lockTenant(req, res) {
    try {
      const { tenantId } = req.params;
      const { lockType, reason, unlockDate, durationDays } = req.body;
      const validLockTypes = ['TEMPORARY_SUSPEND', 'PERMANENT_BLOCK', 'PAYMENT_HOLD', 'SECURITY_HOLD', 'LEGAL_HOLD', 'MANUAL'];
      if (!lockType || !validLockTypes.includes(lockType)) {
        return ResponseHelper.validationError(res, `lockType must be one of: ${validLockTypes.join(', ')}`);
      }
      if (!reason) {
        return ResponseHelper.validationError(res, 'reason is required');
      }

      let computedUnlock = unlockDate || null;
      if (!computedUnlock && durationDays) {
        const d = new Date();
        d.setDate(d.getDate() + Number(durationDays));
        computedUnlock = d.toISOString();
      }

      // Read existing settings so we preserve modules config
      const tRows = await this.db.query(`SELECT ROWID, settings FROM ${TABLES.TENANTS} WHERE ROWID = '${tenantId}' LIMIT 1`);
      if (!tRows.length) return ResponseHelper.notFound(res, 'Tenant not found');
      let settings = {};
      try { settings = JSON.parse(tRows[0].settings || '{}'); } catch (_) {}

      settings.lockInfo = {
        locked:      true,
        lockType,
        reason,
        lockedAt:    new Date().toISOString(),
        unlockDate:  computedUnlock,
        lockedBy:    String(req.currentUser?.id || 'SUPER_ADMIN'),
      };

      await this.db.update(TABLES.TENANTS, {
        ROWID:    tenantId,
        status:   lockType === 'PERMANENT_BLOCK' ? 'CANCELLED' : 'SUSPENDED',
        settings: JSON.stringify(settings),
      });

      await this.db.insert(TABLES.AUDIT_LOGS, {
        tenant_id:    tenantId,
        entity_type:  'TENANT_LOCK',
        entity_id:    tenantId,
        action:       'TENANT_LOCKED',
        new_value:    JSON.stringify({ lockType, reason, unlockDate: computedUnlock }),
        performed_by: String(req.currentUser?.id || 'SUPER_ADMIN'),
      });

      return ResponseHelper.success(res, { lockType, reason }, 'Tenant locked successfully');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /** POST /api/super-admin/tenants/:tenantId/unlock */
  async unlockTenant(req, res) {
    try {
      const { tenantId } = req.params;
      const { reason } = req.body || {};

      const tRows = await this.db.query(`SELECT ROWID, settings FROM ${TABLES.TENANTS} WHERE ROWID = '${tenantId}' LIMIT 1`);
      if (!tRows.length) return ResponseHelper.notFound(res, 'Tenant not found');
      let settings = {};
      try { settings = JSON.parse(tRows[0].settings || '{}'); } catch (_) {}
      delete settings.lockInfo;

      await this.db.update(TABLES.TENANTS, {
        ROWID:    tenantId,
        status:   'ACTIVE',
        settings: JSON.stringify(settings),
      });

      await this.db.insert(TABLES.AUDIT_LOGS, {
        tenant_id:    tenantId,
        entity_type:  'TENANT_LOCK',
        entity_id:    tenantId,
        action:       'TENANT_UNLOCKED',
        new_value:    JSON.stringify({ reason }),
        performed_by: String(req.currentUser?.id || 'SUPER_ADMIN'),
      });

      return ResponseHelper.success(res, null, 'Tenant unlocked successfully');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── User Oversight ──────────────────────────────────────────────────────────

  /** GET /api/super-admin/tenants/:tenantId/users */
  async listTenantUsers(req, res) {
    try {
      const { tenantId } = req.params;
      const users = await this.db.query(
        `SELECT * FROM ${TABLES.USERS} WHERE tenant_id = '${tenantId}' ORDER BY CREATEDTIME DESC LIMIT ${ZCQL_MAX}`
      );
      return ResponseHelper.success(res, {
        users: users.map((u) => ({
          id: String(u.ROWID), name: u.name, email: u.email,
          role: u.role, status: u.status, createdAt: u.CREATEDTIME,
        })),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /** GET /api/super-admin/users */
  async getAllUsers(req, res) {
    try {
      const { search, status, role, tenantId } = req.query;
      let where = '';
      if (tenantId) where += `tenant_id = '${DataStoreService.escape(tenantId)}'`;
      if (status)   where += `${where ? ' AND ' : ''}status = '${DataStoreService.escape(status)}'`;
      if (role)     where += `${where ? ' AND ' : ''}role = '${DataStoreService.escape(role)}'`;

      const users = await this.db.query(
        where
          ? `SELECT * FROM ${TABLES.USERS} WHERE ${where} ORDER BY CREATEDTIME DESC LIMIT ${ZCQL_MAX}`
          : `SELECT * FROM ${TABLES.USERS} ORDER BY CREATEDTIME DESC LIMIT ${ZCQL_MAX}`
      );

      const tenantIds  = [...new Set(users.map((u) => u.tenant_id).filter(Boolean))];
      const tenantList = tenantIds.length
        ? await this.db.query(`SELECT ROWID, name FROM ${TABLES.TENANTS} WHERE ROWID IN (${tenantIds.map((id) => `'${id}'`).join(',')}) LIMIT ${ZCQL_MAX}`)
        : [];
      const tenantMap  = Object.fromEntries(tenantList.map((t) => [String(t.ROWID), t.name]));

      let result = users.map((u) => ({
        id:         String(u.ROWID),
        name:       u.name,
        email:      u.email,
        role:       u.role,
        status:     u.status,
        tenantId:   String(u.tenant_id),
        tenantName: tenantMap[String(u.tenant_id)] || '—',
        createdAt:  u.CREATEDTIME,
      }));

      if (search) {
        const q = search.toLowerCase();
        result = result.filter((u) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
      }

      return ResponseHelper.success(res, { users: result, total: result.length });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /** POST /api/super-admin/users/:userId/block */
  async blockUser(req, res) {
    try {
      const { userId } = req.params;
      const { reason } = req.body;
      await this.db.update(TABLES.USERS, { ROWID: userId, status: 'BLOCKED' });
      await this.db.insert(TABLES.AUDIT_LOGS, {
        entity_type:  'USER',
        entity_id:    userId,
        action:       'USER_BLOCKED',
        new_value:    JSON.stringify({ reason }),
        performed_by: String(req.currentUser?.id || 'SUPER_ADMIN'),
      });
      return ResponseHelper.success(res, null, 'User blocked');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /** POST /api/super-admin/users/:userId/unblock */
  async unblockUser(req, res) {
    try {
      const { userId } = req.params;
      await this.db.update(TABLES.USERS, { ROWID: userId, status: 'ACTIVE' });
      await this.db.insert(TABLES.AUDIT_LOGS, {
        entity_type:  'USER',
        entity_id:    userId,
        action:       'USER_UNBLOCKED',
        performed_by: String(req.currentUser?.id || 'SUPER_ADMIN'),
      });
      return ResponseHelper.success(res, null, 'User unblocked');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── Module Permissions ──────────────────────────────────────────────────────

  /** GET /api/super-admin/tenants/:tenantId/modules
   *  Module state is stored in tenants.settings JSON as { modules: { key: bool } }
   */
  async getModulePermissions(req, res) {
    try {
      const { tenantId } = req.params;
      const rows = await this.db.query(
        `SELECT settings FROM ${TABLES.TENANTS} WHERE ROWID = '${tenantId}' LIMIT 1`
      );
      let savedModules = {};
      if (rows.length > 0) {
        try { savedModules = (JSON.parse(rows[0].settings || '{}').modules) || {}; } catch (_) {}
      }

      const modules = ALL_MODULES.map((m) => ({
        ...m,
        enabled: Object.prototype.hasOwnProperty.call(savedModules, m.key)
          ? savedModules[m.key]
          : m.defaultEnabled,
      }));

      return ResponseHelper.success(res, { modules });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /** PUT /api/super-admin/tenants/:tenantId/modules */
  async updateModulePermissions(req, res) {
    try {
      const { tenantId } = req.params;
      const { modules }  = req.body;
      if (!Array.isArray(modules)) return ResponseHelper.validationError(res, 'modules array required');

      // Read existing settings
      const rows = await this.db.query(
        `SELECT ROWID, settings FROM ${TABLES.TENANTS} WHERE ROWID = '${tenantId}' LIMIT 1`
      );
      if (!rows.length) return ResponseHelper.notFound(res, 'Tenant not found');

      let settings = {};
      try { settings = JSON.parse(rows[0].settings || '{}'); } catch (_) {}

      // Merge module map into settings
      const moduleMap = {};
      modules.forEach(({ key, enabled }) => { moduleMap[key] = Boolean(enabled); });
      settings.modules = { ...(settings.modules || {}), ...moduleMap };

      await this.db.update(TABLES.TENANTS, {
        ROWID:    tenantId,
        settings: JSON.stringify(settings),
      });

      await this.db.insert(TABLES.AUDIT_LOGS, {
        tenant_id:    tenantId,
        entity_type:  'MODULE_PERMISSION',
        entity_id:    tenantId,
        action:       'MODULES_UPDATED',
        new_value:    JSON.stringify(moduleMap),
        performed_by: String(req.currentUser?.id || 'SUPER_ADMIN'),
      });

      return ResponseHelper.success(res, null, 'Module permissions updated');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── AI Recommendations ──────────────────────────────────────────────────────

  /** GET /api/super-admin/recommendations */
  async getRecommendations(req, res) {
    try {
      const { tenantId, category, severity } = req.query;
      const tenants = await this.db.query(
        `SELECT * FROM ${TABLES.TENANTS} WHERE status = 'ACTIVE' LIMIT ${ZCQL_MAX}`
      );
      const [users, projects, tasks, leaves] = await Promise.all([
        this.db.query(`SELECT tenant_id, status, role FROM ${TABLES.USERS} LIMIT ${ZCQL_MAX}`),
        this.db.query(`SELECT tenant_id, status FROM ${TABLES.PROJECTS} LIMIT ${ZCQL_MAX}`),
        this.db.query(`SELECT tenant_id, status, due_date FROM ${TABLES.TASKS} LIMIT ${ZCQL_MAX}`),
        this.db.query(`SELECT tenant_id, status FROM ${TABLES.LEAVE_REQUESTS} LIMIT ${ZCQL_MAX}`),
      ]);

      let recs = generateRecommendations(
        tenantId ? tenants.filter((t) => String(t.ROWID) === tenantId) : tenants,
        users, projects, tasks, leaves
      );

      if (category) recs = recs.filter((r) => r.category === category);
      if (severity) recs = recs.filter((r) => r.severity === severity);

      return ResponseHelper.success(res, { recommendations: recs, total: recs.length });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /** POST /api/super-admin/recommendations/:recId/resolve */
  async resolveRecommendation(req, res) {
    try {
      const { recId }  = req.params;
      const { notes }  = req.body || {};
      await this.db.insert(TABLES.AUDIT_LOGS, {
        entity_type:  'RECOMMENDATION',
        entity_id:    recId,
        action:       'RECOMMENDATION_RESOLVED',
        new_value:    JSON.stringify({ notes }),
        performed_by: String(req.currentUser?.id || 'SUPER_ADMIN'),
      });
      return ResponseHelper.success(res, null, 'Recommendation resolved');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── Audit & Security ────────────────────────────────────────────────────────

  /** GET /api/super-admin/audit-logs */
  async getAuditLogs(req, res) {
    try {
      const { tenantId, entityType, action, userId, limit = 100 } = req.query;
      let where = '';
      if (tenantId)   where += `tenant_id = '${DataStoreService.escape(tenantId)}'`;
      if (entityType) where += `${where ? ' AND ' : ''}entity_type = '${DataStoreService.escape(entityType)}'`;
      if (action)     where += `${where ? ' AND ' : ''}action = '${DataStoreService.escape(action)}'`;
      if (userId)     where += `${where ? ' AND ' : ''}performed_by = '${DataStoreService.escape(userId)}'`;

      const cap = Math.min(Number(limit), ZCQL_MAX);
      const logs = await this.db.query(
        where
          ? `SELECT * FROM ${TABLES.AUDIT_LOGS} WHERE ${where} ORDER BY CREATEDTIME DESC LIMIT ${cap}`
          : `SELECT * FROM ${TABLES.AUDIT_LOGS} ORDER BY CREATEDTIME DESC LIMIT ${cap}`
      );

      const tIds = [...new Set(logs.map((l) => l.tenant_id).filter(Boolean))];
      const tenants = tIds.length
        ? await this.db.query(`SELECT ROWID, name FROM ${TABLES.TENANTS} WHERE ROWID IN (${tIds.map((id) => `'${id}'`).join(',')}) LIMIT ${ZCQL_MAX}`)
        : [];
      const tenantMap = Object.fromEntries(tenants.map((t) => [String(t.ROWID), t.name]));

      return ResponseHelper.success(res, {
        logs: logs.map((l) => ({
          id:          String(l.ROWID),
          tenantId:    String(l.tenant_id),
          tenantName:  tenantMap[String(l.tenant_id)] || '—',
          entityType:  l.entity_type,
          entityId:    l.entity_id,
          action:      l.action,
          oldValue:    l.old_value,
          newValue:    l.new_value,
          performedBy: l.performed_by,
          createdAt:   l.CREATEDTIME,
        })),
        total: logs.length,
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /** GET /api/super-admin/lock-history */
  async getLockHistory(req, res) {
    try {
      const logs = await this.db.query(
        `SELECT * FROM ${TABLES.AUDIT_LOGS} WHERE entity_type = 'TENANT_LOCK' ORDER BY CREATEDTIME DESC LIMIT ${ZCQL_MAX}`
      );
      const tIds = [...new Set(logs.map((l) => l.tenant_id).filter(Boolean))];
      const tenants = tIds.length
        ? await this.db.query(`SELECT ROWID, name FROM ${TABLES.TENANTS} WHERE ROWID IN (${tIds.map((id) => `'${id}'`).join(',')}) LIMIT ${ZCQL_MAX}`)
        : [];
      const tenantMap = Object.fromEntries(tenants.map((t) => [String(t.ROWID), t.name]));

      return ResponseHelper.success(res, {
        history: logs.map((l) => {
          let details = {};
          try { details = JSON.parse(l.new_value || '{}'); } catch {}
          return {
            id:          String(l.ROWID),
            tenantId:    String(l.tenant_id),
            tenantName:  tenantMap[String(l.tenant_id)] || '—',
            action:      l.action,
            details,
            performedBy: l.performed_by,
            createdAt:   l.CREATEDTIME,
          };
        }),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── Performance Metrics ─────────────────────────────────────────────────────

  /** GET /api/super-admin/performance */
  async getPerformanceMetrics(req, res) {
    try {
      const [tenants, users, projects, tasks, auditLogs] = await Promise.all([
        this.db.query(`SELECT ROWID, name, status, plan FROM ${TABLES.TENANTS} LIMIT ${ZCQL_MAX}`),
        this.db.query(`SELECT tenant_id, status, role FROM ${TABLES.USERS} LIMIT ${ZCQL_MAX}`),
        this.db.query(`SELECT tenant_id, status FROM ${TABLES.PROJECTS} LIMIT ${ZCQL_MAX}`),
        this.db.query(`SELECT tenant_id, status, due_date, CREATEDTIME FROM ${TABLES.TASKS} LIMIT ${ZCQL_MAX}`),
        this.db.query(`SELECT tenant_id, action, CREATEDTIME FROM ${TABLES.AUDIT_LOGS} ORDER BY CREATEDTIME DESC LIMIT ${ZCQL_MAX}`),
      ]);

      // Daily activity (last 30 days)
      const now   = new Date();
      const daily = {};
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        daily[key] = { date: key, tasks: 0, standups: 0 };
      }
      tasks.forEach((t) => {
        try {
          const key = new Date(t.CREATEDTIME).toISOString().slice(0, 10);
          if (daily[key]) daily[key].tasks++;
        } catch {}
      });
      auditLogs.forEach((l) => {
        try {
          const key = new Date(l.CREATEDTIME).toISOString().slice(0, 10);
          if (daily[key] && l.action && l.action.includes('STANDUP')) daily[key].standups++;
        } catch {}
      });

      const dailyActivity = Object.values(daily);

      // Per-tenant metrics
      const tenantMetrics = tenants.map((t) => {
        const tid       = String(t.ROWID);
        const tUsers    = users.filter((u) => String(u.tenant_id) === tid);
        const tProjects = projects.filter((p) => String(p.tenant_id) === tid);
        const tTasks    = tasks.filter((tk) => String(tk.tenant_id) === tid);
        const doneTasks = tTasks.filter((tk) => tk.status === 'DONE').length;
        const health    = computeHealthScore(t, users, projects, tasks);
        return {
          tenantId:      tid,
          name:          t.name,
          plan:          t.plan || 'STARTER',
          users:         tUsers.length,
          projects:      tProjects.length,
          tasks:         tTasks.length,
          completionPct: tTasks.length ? Math.round((doneTasks / tTasks.length) * 100) : 0,
          healthScore:   health.score,
        };
      }).sort((a, b) => b.tasks - a.tasks);

      const healthScores = tenants.map((t) => computeHealthScore(t, users, projects, tasks).score);
      const avgHealthScore = healthScores.length
        ? Math.round(healthScores.reduce((s, v) => s + v, 0) / healthScores.length)
        : 0;

      return ResponseHelper.success(res, {
        summary: {
          totalTenants:   tenants.length,
          activeTenants:  tenants.filter((t) => t.status === 'ACTIVE').length,
          totalUsers:     users.length,
          totalProjects:  projects.length,
          totalTasks:     tasks.length,
          avgHealthScore,
          highChurnCount: tenants.filter((t) => computeChurnRisk(t, users, projects).risk === 'HIGH').length,
          atRiskCount:    tenants.filter((t) => computeHealthScore(t, users, projects, tasks).score < 50).length,
          healthyCount:   tenants.filter((t) => computeHealthScore(t, users, projects, tasks).score >= 75).length,
        },
        dailyActivity,
        tenantMetrics: tenantMetrics.slice(0, 20),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── Smart Alerts ────────────────────────────────────────────────────────────

  /** GET /api/super-admin/alerts */
  async getSmartAlerts(req, res) {
    try {
      const [tenants, users, projects] = await Promise.all([
        this.db.query(`SELECT * FROM ${TABLES.TENANTS} LIMIT ${ZCQL_MAX}`),
        this.db.query(`SELECT tenant_id, status, CREATEDTIME FROM ${TABLES.USERS} LIMIT ${ZCQL_MAX}`),
        this.db.query(`SELECT tenant_id, status FROM ${TABLES.PROJECTS} LIMIT ${ZCQL_MAX}`),
      ]);

      const alerts = [];
      const now    = new Date();

      tenants.forEach((t) => {
        const tid    = String(t.ROWID);
        const tUsers = users.filter((u) => String(u.tenant_id) === tid);
        const tProjs = projects.filter((p) => String(p.tenant_id) === tid);
        const churn  = computeChurnRisk(t, users, projects);
        const health = computeHealthScore(t, users, projects, []);

        if (churn.risk === 'HIGH') {
          alerts.push({ id: `alert_churn_${tid}`, type: 'CHURN_RISK', severity: 'HIGH', tenantId: tid, tenantName: t.name, title: `High churn risk: ${t.name}`, description: `Churn score ${churn.score}/100`, suggestedAction: 'Review engagement', createdAt: now.toISOString() });
        }
        if (t.status === 'SUSPENDED') {
          alerts.push({ id: `alert_suspended_${tid}`, type: 'ACCOUNT_SUSPENDED', severity: 'HIGH', tenantId: tid, tenantName: t.name, title: `Suspended: ${t.name}`, description: 'Organisation is currently suspended', suggestedAction: 'Review and resolve', createdAt: now.toISOString() });
        }
        if (health.score < 30) {
          alerts.push({ id: `alert_health_${tid}`, type: 'LOW_HEALTH', severity: 'MEDIUM', tenantId: tid, tenantName: t.name, title: `Critical health: ${t.name}`, description: `Health score ${health.score}/100 — ${health.label}`, suggestedAction: 'Engage customer success', createdAt: now.toISOString() });
        }
        if (tProjs.filter((p) => p.status === 'ACTIVE').length === 0 && tUsers.filter((u) => u.status === 'ACTIVE').length > 2) {
          alerts.push({ id: `alert_noproj_${tid}`, type: 'NO_ACTIVE_PROJECTS', severity: 'MEDIUM', tenantId: tid, tenantName: t.name, title: `No active projects: ${t.name}`, description: 'Active users but no running projects', suggestedAction: 'Onboarding follow-up', createdAt: now.toISOString() });
        }
      });

      return ResponseHelper.success(res, {
        alerts: alerts.sort((a, b) => (b.severity === 'HIGH' ? 1 : 0) - (a.severity === 'HIGH' ? 1 : 0)),
        total:  alerts.length,
        highPriority: alerts.filter((a) => a.severity === 'HIGH').length,
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── Subscription Usage ──────────────────────────────────────────────────────

  /** GET /api/super-admin/tenants/:tenantId/subscription */
  async getSubscriptionUsage(req, res) {
    try {
      const { tenantId } = req.params;
      const tRows = await this.db.query(`SELECT * FROM ${TABLES.TENANTS} WHERE ROWID = '${tenantId}' LIMIT 1`);
      const tenant = tRows[0] || null;
      if (!tenant) return ResponseHelper.notFound(res, 'Tenant not found');

      const [users, projects] = await Promise.all([
        this.db.query(`SELECT ROWID, status FROM ${TABLES.USERS} WHERE tenant_id = '${tenantId}' LIMIT ${ZCQL_MAX}`),
        this.db.query(`SELECT ROWID, status FROM ${TABLES.PROJECTS} WHERE tenant_id = '${tenantId}' LIMIT ${ZCQL_MAX}`),
      ]);

      const PLAN_LIMITS = {
        STARTER:    { users: 10,  projects: 5,   storage: 5 },
        PRO:        { users: 50,  projects: 25,  storage: 50 },
        ENTERPRISE: { users: 500, projects: 200, storage: 500 },
      };

      const pt     = parseTenant(tenant);
      const plan   = pt.plan;
      const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.STARTER;
      const uCount = users.length;
      const pCount = projects.length;

      return ResponseHelper.success(res, {
        tenantId,
        tenantName:    pt.name,
        plan,
        billingStatus: pt.billingStatus,
        renewalDate:   pt.renewalDate,
        users:    { used: uCount, limit: limits.users,    pct: Math.round((uCount / limits.users)    * 100), alert: uCount / limits.users    >= 0.9 },
        projects: { used: pCount, limit: limits.projects, pct: Math.round((pCount / limits.projects) * 100), alert: pCount / limits.projects >= 0.9 },
        overUsage: uCount > limits.users || pCount > limits.projects,
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── Feature Usage ────────────────────────────────────────────────────────────

  /** GET /api/super-admin/feature-usage
   *  Derives per-module usage counts from audit_logs action prefixes.
   *  No new tables required — works entirely from existing audit data.
   */
  async getFeatureUsage(req, res) {
    try {
      const logs = await this.db.query(
        `SELECT action, tenant_id, CREATEDTIME FROM ${TABLES.AUDIT_LOGS} ORDER BY CREATEDTIME DESC LIMIT ${ZCQL_MAX}`
      );

      // Real audit actions are generic (CREATE/UPDATE/DELETE) — group by entity_type instead
      const ENTITY_MODULE_MAP = {
        projects: ['TASK', 'PROJECT', 'SPRINT', 'SPRINT_MEMBER', 'MILESTONE', 'BLOCKER',
                   'DECISION', 'RISK', 'ISSUE', 'DEPENDENCY', 'ASSUMPTION', 'ACTION', 'BACKLOG'],
        people:   ['LEAVE', 'LEAVE_REQUEST', 'LEAVE_BALANCE', 'ATTENDANCE', 'STANDUP',
                   'STANDUP_ENTRY', 'EOD', 'EOD_ENTRY', 'ANNOUNCEMENT', 'TEAM', 'TEAM_MEMBER', 'USER_PROFILE'],
        assets:   ['ASSET', 'ASSET_REQUEST', 'ASSET_ASSIGNMENT', 'ASSET_MAINTENANCE', 'ASSET_CATEGORY'],
        time:     ['TIME_ENTRY', 'TIME', 'TIME_APPROVAL', 'TIME_APPROVAL_REQUEST', 'TIME_EXPORT'],
        reports:  ['REPORT', 'REPORT_EXPORT'],
        ai:       ['AI', 'INSIGHT', 'AI_INSIGHT'],
        admin:    ['USER', 'TENANT', 'MODULE_PERMISSION', 'TENANT_LOCK', 'PERMISSION',
                   'PERMISSION_OVERRIDE', 'WORKFLOW_CONFIG', 'FORM_CONFIG'],
      };

      const counts     = {};
      const tenantSets = {};
      Object.keys(ENTITY_MODULE_MAP).forEach((k) => { counts[k] = 0; tenantSets[k] = new Set(); });

      // Last-30-day activity buckets
      const now    = Date.now();
      const DAY_MS = 86_400_000;
      const daily  = {};
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now - i * DAY_MS).toISOString().slice(0, 10);
        daily[d] = 0;
      }

      logs.forEach((log) => {
        const entityType = (log.entity_type || '').toUpperCase().trim();
        if (!entityType) return;
        for (const [mod, types] of Object.entries(ENTITY_MODULE_MAP)) {
          if (types.includes(entityType)) {
            counts[mod]++;
            if (log.tenant_id) tenantSets[mod].add(String(log.tenant_id));
            try {
              const key = new Date(log.CREATEDTIME).toISOString().slice(0, 10);
              if (daily[key] !== undefined) daily[key]++;
            } catch (_) {}
            break;
          }
        }
      });

      const total = Object.values(counts).reduce((s, v) => s + v, 0) || 1;

      const LABELS = {
        projects: 'Projects & Sprints',
        people:   'People & HR',
        assets:   'Asset Management',
        time:     'Time Tracking',
        reports:  'Reports',
        ai:       'AI Insights',
        admin:    'Administration',
      };

      const features = Object.entries(counts)
        .map(([key, events]) => ({
          key,
          label:      LABELS[key] || key,
          events,
          orgs:       tenantSets[key].size,
          percentage: Math.round((events / total) * 100),
        }))
        .sort((a, b) => b.events - a.events);

      return ResponseHelper.success(res, {
        features,
        totalEvents:   total,
        dailyActivity: Object.entries(daily).map(([date, count]) => ({ date, count })),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = SuperAdminController;
