'use strict';

const DataStoreService = require('../services/DataStoreService');
const AuditService     = require('../services/AuditService');
const NotificationService = require('../services/NotificationService');
const ResponseHelper   = require('../utils/ResponseHelper');
const { TABLES, SPRINT_STATUS, AUDIT_ACTION, NOTIFICATION_TYPE, PERMISSIONS } = require('../utils/Constants');

class SprintController {
  constructor(catalystApp) {
    this.db      = new DataStoreService(catalystApp);
    this.audit   = new AuditService(this.db);
    this.notif   = new NotificationService(catalystApp, this.db);
    this.app     = catalystApp;
  }

  // GET /api/ts/sprints?project_id=&status=
  async list(req, res) {
    try {
      const { project_id, status } = req.query;
      const tenantId = req.tenantId;
      const { id: userId, role, dataScope, permissions } = req.currentUser;

      // Org-wide / elevated users (admins, leads with SPRINT_VIEW_ALL) see all sprints.
      // Everyone else is restricted to sprints they are explicitly members of.
      const canViewAll = role === 'SUPER_ADMIN' || role === 'TENANT_ADMIN'
        || dataScope === 'ORG_WIDE' || dataScope === 'SUBORDINATES'
        || (Array.isArray(permissions) && (
          permissions.includes(PERMISSIONS.SPRINT_VIEW_ALL) ||
          permissions.includes(PERMISSIONS.PROJECT_DATA_VIEW_ALL)
        ));

      // Exclude soft-deleted sprints from the active workspace.
      const notDeleted = 'deleted_at IS NULL';
      let where = project_id ? `project_id = '${DataStoreService.escape(project_id)}' AND ${notDeleted}` : notDeleted;
      if (status) {
        const sc = `status = '${DataStoreService.escape(status)}'`;
        where = `${where} AND ${sc}`;
      }

      let sprints;
      if (canViewAll) {
        sprints = await this.db.fetchAll(TABLES.SPRINTS, tenantId, where, { orderBy: 'CREATEDTIME DESC' });
      } else {
        const memberships = await this.db.fetchAll(TABLES.SPRINT_MEMBERS, tenantId,
          `user_id = '${DataStoreService.escape(userId)}'`);
        if (memberships.length === 0) {
          return ResponseHelper.success(res, []);
        }
        // Filter in JS rather than relying on ZCQL ROWID IN() to avoid edge-case
        // behaviour with ROWID comparisons in Catalyst ZCQL.
        const memberSprintIds = new Set(memberships.map((m) => String(m.sprint_id)));
        const allSprints = await this.db.fetchAll(TABLES.SPRINTS, tenantId, where, { orderBy: 'CREATEDTIME DESC' });
        sprints = allSprints.filter((s) => memberSprintIds.has(String(s.ROWID)));
      }

      if (sprints.length > 0) {
        // Batch fetch task counts in 2 queries instead of N*2 sequential queries
        const sprintIds = sprints.map((s) => `'${DataStoreService.escape(String(s.ROWID))}'`).join(',');
        const [allTasks, doneTasks] = await Promise.all([
          this.db.fetchColumn(TABLES.TASKS, 'sprint_id', tenantId, `sprint_id IN (${sprintIds}) AND deleted_at IS NULL`),
          this.db.fetchColumn(TABLES.TASKS, 'sprint_id', tenantId, `sprint_id IN (${sprintIds}) AND status = 'DONE' AND deleted_at IS NULL`),
        ]);

        const totalBySprint = {};
        allTasks.forEach((t) => {
          const sid = String(t.sprint_id);
          totalBySprint[sid] = (totalBySprint[sid] || 0) + 1;
        });
        const doneBySprint = {};
        doneTasks.forEach((t) => {
          const sid = String(t.sprint_id);
          doneBySprint[sid] = (doneBySprint[sid] || 0) + 1;
        });

        for (const sprint of sprints) {
          const sid = String(sprint.ROWID);
          sprint.task_count      = totalBySprint[sid] || 0;
          sprint.completed_count = doneBySprint[sid]  || 0;
        }
      }

      return ResponseHelper.success(res, sprints);
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // POST /api/ts/sprints
  async create(req, res) {
    try {
      const { project_id, name, goal, start_date, end_date, capacity_points, member_ids, statuses } = req.body;
      const tenantId = req.tenantId;
      const userId   = req.currentUser.id;

      if (!project_id || !name || !start_date || !end_date)
        return ResponseHelper.validationError(res, 'project_id, name, start_date, end_date are required');

      // Optional per-board custom statuses (kanban columns) stored as JSON.
      const statusesStr = Array.isArray(statuses) ? JSON.stringify(statuses)
        : (typeof statuses === 'string' && statuses ? statuses : '[]');

      const row = await this.db.insert(TABLES.SPRINTS, {
        tenant_id: String(tenantId), project_id: String(project_id), name, goal: goal || '',
        start_date, end_date, status: SPRINT_STATUS.PLANNING,
        capacity_points: capacity_points || 0,
        statuses: statusesStr,
      });

      // Insert members in the same request — no extra round-trips needed
      const members = Array.isArray(member_ids) ? member_ids : [];
      for (const uid of members) {
        try {
          await this.db.insert(TABLES.SPRINT_MEMBERS, {
            tenant_id:      String(tenantId),
            sprint_id:      String(row.ROWID),
            user_id:        String(uid),
            capacity_hours: 0,
          });
        } catch (_) {} // skip duplicates
      }

      await this.audit.log({ tenantId, entityType: 'SPRINT', entityId: row.ROWID, action: AUDIT_ACTION.CREATE, newValue: { ...row, member_count: members.length }, performedBy: userId });
      return ResponseHelper.created(res, { ...row, member_ids: members });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // GET /api/ts/sprints/:sprintId
  async getById(req, res) {
    const { id: userId, role, dataScope } = req.currentUser;
    const sprint = await this.db.findById(TABLES.SPRINTS, req.params.sprintId, req.tenantId);
    if (!sprint || sprint.deleted_at) return ResponseHelper.notFound(res, 'Sprint not found');

    // Membership gate — same rule as list()
    const isOrgWide = role === 'SUPER_ADMIN' || role === 'TENANT_ADMIN'
      || dataScope === 'ORG_WIDE' || dataScope === 'SUBORDINATES';
    if (!isOrgWide) {
      const membership = await this.db.findWhere(TABLES.SPRINT_MEMBERS, req.tenantId,
        `sprint_id = '${sprint.ROWID}' AND user_id = '${DataStoreService.escape(userId)}'`, { limit: 1 });
      if (membership.length === 0) {
        return ResponseHelper.forbidden(res, 'You are not a member of this sprint');
      }
    }

    const tasks = await this.db.findWhere(TABLES.TASKS, req.tenantId,
      `sprint_id = '${sprint.ROWID}' AND parent_task_id = 0 AND deleted_at IS NULL`, { orderBy: 'CREATEDTIME ASC', limit: 200 });

    const memberRows = await this.db.findWhere(TABLES.SPRINT_MEMBERS, req.tenantId,
      `sprint_id = '${sprint.ROWID}'`, { limit: 200 });
    const member_ids = memberRows.map((m) => String(m.user_id));

    return ResponseHelper.success(res, { ...sprint, tasks, member_ids });
  }

  // PUT /api/ts/sprints/:sprintId
  async update(req, res) {
    const { sprintId } = req.params;
    const tenantId = req.tenantId;
    const sprint = await this.db.findById(TABLES.SPRINTS, sprintId, tenantId);
    if (!sprint) return ResponseHelper.notFound(res, 'Sprint not found');

    const allowed = ['name', 'goal', 'start_date', 'end_date', 'capacity_points'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    // Per-board custom statuses (kanban columns) — accept an array or JSON string.
    if (req.body.statuses !== undefined) {
      updates.statuses = Array.isArray(req.body.statuses) ? JSON.stringify(req.body.statuses) : String(req.body.statuses || '[]');
    }

    const updated = await this.db.update(TABLES.SPRINTS, { ROWID: sprintId, ...updates });
    await this.audit.log({ tenantId, entityType: 'SPRINT', entityId: sprintId, action: AUDIT_ACTION.UPDATE, oldValue: sprint, newValue: updated, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, updated);
  }

  // PATCH /api/ts/sprints/:sprintId/start
  async start(req, res) {
    const { sprintId } = req.params;
    const tenantId = req.tenantId;
    const sprint = await this.db.findById(TABLES.SPRINTS, sprintId, tenantId);
    if (!sprint) return ResponseHelper.notFound(res, 'Sprint not found');
    if (sprint.status !== SPRINT_STATUS.PLANNING)
      return ResponseHelper.validationError(res, 'Only PLANNING sprints can be started');

    // A project may run multiple sprints concurrently (e.g. parallel
    // workstreams / squads on the same project), so we intentionally do NOT
    // block starting a sprint when another sprint is already active for the
    // same project.

    await this.db.update(TABLES.SPRINTS, { ROWID: sprintId, status: SPRINT_STATUS.ACTIVE });
    await this.audit.log({ tenantId, entityType: 'SPRINT', entityId: sprintId, action: AUDIT_ACTION.STATUS_CHANGE, oldValue: { status: sprint.status }, newValue: { status: SPRINT_STATUS.ACTIVE }, performedBy: req.currentUser.id });

    // Notify sprint members
    const members = await this.db.findWhere(TABLES.SPRINT_MEMBERS, tenantId, `sprint_id = '${sprintId}'`, { limit: 100 });
    for (const m of members) {
      const userRows = await this.db.query(`SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = '${m.user_id}' LIMIT 1`);
      if (userRows[0]) {
        // Escape user-controlled fields before injecting into HTML to prevent
        // an attacker who can name a sprint (or rename a user) from sneaking
        // markup into recipient inboxes.
        await this.notif.send({
          toEmail: userRows[0].email,
          subject: `Sprint "${sprint.name}" has started`,
          htmlBody: `<p>Hi ${_escapeHtml(userRows[0].name)}, the sprint <strong>${_escapeHtml(sprint.name)}</strong> has started. Check your assigned tasks.</p>`,
        });
        await this.notif.sendInApp({ tenantId, userId: m.user_id, title: 'Sprint Started', message: `Sprint "${sprint.name}" is now active`, type: NOTIFICATION_TYPE.SPRINT_STARTED, entityType: 'SPRINT', entityId: sprintId });
      }
    }

    return ResponseHelper.success(res, { message: 'Sprint started' });
  }

  // PATCH /api/ts/sprints/:sprintId/complete
  async complete(req, res) {
    const { sprintId } = req.params;
    const tenantId = req.tenantId;
    const sprint = await this.db.findById(TABLES.SPRINTS, sprintId, tenantId);
    if (!sprint) return ResponseHelper.notFound(res, 'Sprint not found');
    if (sprint.status !== SPRINT_STATUS.ACTIVE)
      return ResponseHelper.validationError(res, 'Only ACTIVE sprints can be completed');

    // Calculate completed points
    const doneTasks = await this.db.findWhere(TABLES.TASKS, tenantId, `sprint_id = '${sprintId}' AND status = 'DONE' AND deleted_at IS NULL`, { limit: 200 });
    const completedPoints = doneTasks.reduce((sum, t) => sum + (parseFloat(t.story_points) || 0), 0);

    await this.db.update(TABLES.SPRINTS, { ROWID: sprintId, status: SPRINT_STATUS.COMPLETED, velocity: completedPoints });

    // Carry incomplete work forward: every task in this sprint that isn't DONE
    // (and hasn't been CANCELLED) is moved back to the project backlog
    // (sprint_id = 0) so it can be pulled into a future sprint of the same
    // project. This mirrors standard Scrum behaviour where unfinished items
    // return to the backlog when the sprint closes.
    const incompleteTasks = await this.db.findWhere(
      TABLES.TASKS, tenantId,
      `sprint_id = '${sprintId}' AND status != 'DONE' AND status != 'CANCELLED' AND deleted_at IS NULL`,
      { limit: 300 }
    );
    for (const t of incompleteTasks) {
      await this.db.update(TABLES.TASKS, { ROWID: t.ROWID, sprint_id: 0 });
    }
    const movedToBacklog = incompleteTasks.length;

    await this.audit.log({ tenantId, entityType: 'SPRINT', entityId: sprintId, action: AUDIT_ACTION.STATUS_CHANGE, oldValue: { status: SPRINT_STATUS.ACTIVE }, newValue: { status: SPRINT_STATUS.COMPLETED, completed_points: completedPoints, moved_to_backlog: movedToBacklog }, performedBy: req.currentUser.id });

    return ResponseHelper.success(res, { message: 'Sprint completed', completed_points: completedPoints, moved_to_backlog: movedToBacklog });
  }

  // GET /api/ts/sprints/:sprintId/board
  async getBoard(req, res) {
    const { sprintId } = req.params;
    const tenantId = req.tenantId;
    const sprint = await this.db.findById(TABLES.SPRINTS, sprintId, tenantId);
    if (!sprint) return ResponseHelper.notFound(res, 'Sprint not found');

    const tasks = await this.db.findWhere(TABLES.TASKS, tenantId, `sprint_id = '${sprintId}' AND parent_task_id = 0 AND deleted_at IS NULL`, { orderBy: 'CREATEDTIME ASC', limit: 200 });

    // Group by status
    const board = {};
    for (const task of tasks) {
      const s = task.status || 'TODO';
      if (!board[s]) board[s] = [];
      // Attach subtasks
      const subtasks = await this.db.findWhere(TABLES.TASKS, tenantId, `parent_task_id = '${task.ROWID}' AND deleted_at IS NULL`, { limit: 20 });
      board[s].push({ ...task, subtasks });
    }

    return ResponseHelper.success(res, { sprint, board });
  }

  // GET /api/ts/sprints/:sprintId/velocity
  async getVelocity(req, res) {
    const { sprintId } = req.params;
    const tenantId = req.tenantId;
    const sprint = await this.db.findById(TABLES.SPRINTS, sprintId, tenantId);
    if (!sprint) return ResponseHelper.notFound(res, 'Sprint not found');

    const tasks = await this.db.findWhere(TABLES.TASKS, tenantId, `sprint_id = '${sprintId}' AND deleted_at IS NULL`, { limit: 200 });
    const total = tasks.reduce((s, t) => s + (parseFloat(t.story_points) || 0), 0);
    const done  = tasks.filter(t => t.status === 'DONE').reduce((s, t) => s + (parseFloat(t.story_points) || 0), 0);
    const rate  = total > 0 ? Math.round((done / total) * 100) : 0;

    return ResponseHelper.success(res, { sprint_id: sprintId, total_points: total, completed_points: done, completion_rate: rate, task_count: tasks.length, done_count: tasks.filter(t => t.status === 'DONE').length });
  }

  // POST /api/ts/sprints/:sprintId/members
  async addMember(req, res) {
    const { sprintId } = req.params;
    const { user_id, capacity_hours } = req.body;
    if (!user_id) return ResponseHelper.validationError(res, 'user_id is required');

    const row = await this.db.insert(TABLES.SPRINT_MEMBERS, {
      tenant_id: req.tenantId, sprint_id: sprintId, user_id, capacity_hours: capacity_hours || 0,
    });
    return ResponseHelper.created(res, row);
  }

  // DELETE /api/ts/sprints/:sprintId/members/:uid
  async removeMember(req, res) {
    const { sprintId, uid } = req.params;
    const rows = await this.db.findWhere(TABLES.SPRINT_MEMBERS, req.tenantId, `sprint_id = '${sprintId}' AND user_id = '${uid}'`, { limit: 1 });
    if (rows.length === 0) return ResponseHelper.notFound(res, 'Sprint member not found');
    await this.db.delete(TABLES.SPRINT_MEMBERS, rows[0].ROWID);
    return ResponseHelper.success(res, { message: 'Member removed' });
  }

  // DELETE /api/ts/sprints/:sprintId — soft delete (moves to Recycle Bin).
  async remove(req, res) {
    const { sprintId } = req.params;
    const tenantId = req.tenantId;
    const sprint = await this.db.findById(TABLES.SPRINTS, sprintId, tenantId);
    if (!sprint || sprint.deleted_at) return ResponseHelper.notFound(res, 'Sprint not found');
    await this.db.update(TABLES.SPRINTS, {
      ROWID: sprintId,
      deleted_at: DataStoreService.fmtDT(new Date()),
      deleted_by: String(req.currentUser.id),
    });
    await this.audit.log({ tenantId, entityType: 'SPRINT', entityId: sprintId, action: AUDIT_ACTION.DELETE, oldValue: { name: sprint.name }, newValue: { soft: true }, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, { message: 'Sprint moved to Recycle Bin' });
  }

  // GET /api/ts/sprints/recycle-bin — list soft-deleted sprints (admin only).
  async listDeleted(req, res) {
    const { role } = req.currentUser;
    if (role !== 'TENANT_ADMIN' && role !== 'SUPER_ADMIN') return ResponseHelper.forbidden(res, 'Admin only');
    const rows = await this.db.findWhere(TABLES.SPRINTS, req.tenantId, 'deleted_at IS NOT NULL', { orderBy: 'MODIFIEDTIME DESC', limit: 200 });
    return ResponseHelper.success(res, rows.map((s) => ({
      id: String(s.ROWID), name: s.name, project_id: String(s.project_id),
      status: s.status, deletedAt: s.deleted_at, deletedBy: s.deleted_by,
    })));
  }

  // POST /api/ts/sprints/:sprintId/restore — restore a soft-deleted sprint (admin only).
  async restore(req, res) {
    const { role } = req.currentUser;
    if (role !== 'TENANT_ADMIN' && role !== 'SUPER_ADMIN') return ResponseHelper.forbidden(res, 'Admin only');
    const { sprintId } = req.params;
    const sprint = await this.db.findById(TABLES.SPRINTS, sprintId, req.tenantId);
    if (!sprint) return ResponseHelper.notFound(res, 'Sprint not found');
    await this.db.update(TABLES.SPRINTS, { ROWID: sprintId, deleted_at: null, deleted_by: null });
    await this.audit.log({ tenantId: req.tenantId, entityType: 'SPRINT', entityId: sprintId, action: AUDIT_ACTION.UPDATE, newValue: { restored: true }, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, { message: 'Sprint restored' });
  }

  // DELETE /api/ts/sprints/:sprintId/purge — permanent delete (admin only).
  async purge(req, res) {
    const { role } = req.currentUser;
    if (role !== 'TENANT_ADMIN' && role !== 'SUPER_ADMIN') return ResponseHelper.forbidden(res, 'Admin only');
    const { sprintId } = req.params;
    const sprint = await this.db.findById(TABLES.SPRINTS, sprintId, req.tenantId);
    if (!sprint) return ResponseHelper.notFound(res, 'Sprint not found');
    await this.db.delete(TABLES.SPRINTS, sprintId);
    await this.audit.log({ tenantId: req.tenantId, entityType: 'SPRINT', entityId: sprintId, action: AUDIT_ACTION.DELETE, oldValue: { name: sprint.name }, newValue: { permanent: true }, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, { message: 'Sprint permanently deleted' });
  }
}

function _escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = SprintController;
