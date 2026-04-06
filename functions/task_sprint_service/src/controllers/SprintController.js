'use strict';

const DataStoreService = require('../services/DataStoreService');
const AuditService     = require('../services/AuditService');
const NotificationService = require('../services/NotificationService');
const ResponseHelper   = require('../utils/ResponseHelper');
const { TABLES, SPRINT_STATUS, AUDIT_ACTION, NOTIFICATION_TYPE } = require('../utils/Constants');

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

      let where = project_id ? `project_id = '${DataStoreService.escape(project_id)}'` : null;
      if (status) {
        const sc = `status = '${DataStoreService.escape(status)}'`;
        where = where ? `${where} AND ${sc}` : sc;
      }

      const sprints = await this.db.findWhere(TABLES.SPRINTS, tenantId, where, { orderBy: 'CREATEDTIME DESC', limit: 50 });

      for (const sprint of sprints) {
        const total = await this.db.count(TABLES.TASKS, { tenant_id: tenantId, sprint_id: sprint.ROWID });
        const done  = await this.db.count(TABLES.TASKS, { tenant_id: tenantId, sprint_id: sprint.ROWID, status: 'DONE' });
        sprint.task_count      = total;
        sprint.completed_count = done;
      }

      return ResponseHelper.success(res, sprints);
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // POST /api/ts/sprints
  async create(req, res) {
    try {
      const { project_id, name, goal, start_date, end_date, capacity_points } = req.body;
      const tenantId = req.tenantId;
      const userId   = req.currentUser.id;

      if (!project_id || !name || !start_date || !end_date)
        return ResponseHelper.validationError(res, 'project_id, name, start_date, end_date are required');

      const row = await this.db.insert(TABLES.SPRINTS, {
        tenant_id: String(tenantId), project_id: String(project_id), name, goal: goal || '',
        start_date, end_date, status: SPRINT_STATUS.PLANNING,
        capacity_points: capacity_points || 0,
      });

      await this.audit.log({ tenantId, entityType: 'SPRINT', entityId: row.ROWID, action: AUDIT_ACTION.CREATE, newValue: row, performedBy: userId });
      return ResponseHelper.created(res, row);
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // GET /api/ts/sprints/:sprintId
  async getById(req, res) {
    const sprint = await this.db.findById(TABLES.SPRINTS, req.params.sprintId, req.tenantId);
    if (!sprint) return ResponseHelper.notFound(res, 'Sprint not found');

    // Full task list
    const tasks = await this.db.findWhere(TABLES.TASKS, req.tenantId,
      `sprint_id = '${sprint.ROWID}' AND parent_task_id = 0`, { orderBy: 'CREATEDTIME ASC', limit: 200 });

    return ResponseHelper.success(res, { ...sprint, tasks });
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

    // Ensure no other sprint is ACTIVE for this project
    const active = await this.db.findWhere(TABLES.SPRINTS, tenantId,
      `project_id = '${DataStoreService.escape(sprint.project_id)}' AND status = 'ACTIVE'`, { limit: 1 });
    if (active.length > 0)
      return ResponseHelper.conflict(res, 'Another sprint is already active for this project');

    await this.db.update(TABLES.SPRINTS, { ROWID: sprintId, status: SPRINT_STATUS.ACTIVE });
    await this.audit.log({ tenantId, entityType: 'SPRINT', entityId: sprintId, action: AUDIT_ACTION.STATUS_CHANGE, oldValue: { status: sprint.status }, newValue: { status: SPRINT_STATUS.ACTIVE }, performedBy: req.currentUser.id });

    // Notify sprint members
    const members = await this.db.findWhere(TABLES.SPRINT_MEMBERS, tenantId, `sprint_id = '${sprintId}'`, { limit: 100 });
    for (const m of members) {
      const userRows = await this.db.query(`SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = '${m.user_id}' LIMIT 1`);
      if (userRows[0]) {
        await this.notif.send({ toEmail: userRows[0].email, subject: `[Delivery Sync] Sprint "${sprint.name}" has started`, htmlBody: `<p>Hi ${userRows[0].name}, the sprint <strong>${sprint.name}</strong> has started. Check your assigned tasks.</p>` });
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
    const doneTasks = await this.db.findWhere(TABLES.TASKS, tenantId, `sprint_id = '${sprintId}' AND status = 'DONE'`, { limit: 200 });
    const completedPoints = doneTasks.reduce((sum, t) => sum + (parseFloat(t.story_points) || 0), 0);

    await this.db.update(TABLES.SPRINTS, { ROWID: sprintId, status: SPRINT_STATUS.COMPLETED, velocity: completedPoints });
    await this.audit.log({ tenantId, entityType: 'SPRINT', entityId: sprintId, action: AUDIT_ACTION.STATUS_CHANGE, oldValue: { status: SPRINT_STATUS.ACTIVE }, newValue: { status: SPRINT_STATUS.COMPLETED, completed_points: completedPoints }, performedBy: req.currentUser.id });

    return ResponseHelper.success(res, { message: 'Sprint completed', completed_points: completedPoints });
  }

  // GET /api/ts/sprints/:sprintId/board
  async getBoard(req, res) {
    const { sprintId } = req.params;
    const tenantId = req.tenantId;
    const sprint = await this.db.findById(TABLES.SPRINTS, sprintId, tenantId);
    if (!sprint) return ResponseHelper.notFound(res, 'Sprint not found');

    const tasks = await this.db.findWhere(TABLES.TASKS, tenantId, `sprint_id = '${sprintId}' AND parent_task_id = 0`, { orderBy: 'CREATEDTIME ASC', limit: 200 });

    // Group by status
    const board = {};
    for (const task of tasks) {
      const s = task.status || 'TODO';
      if (!board[s]) board[s] = [];
      // Attach subtasks
      const subtasks = await this.db.findWhere(TABLES.TASKS, tenantId, `parent_task_id = '${task.ROWID}'`, { limit: 20 });
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

    const tasks = await this.db.findWhere(TABLES.TASKS, tenantId, `sprint_id = '${sprintId}'`, { limit: 200 });
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
}

module.exports = SprintController;
