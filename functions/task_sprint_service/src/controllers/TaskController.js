'use strict';

const DataStoreService = require('../services/DataStoreService');
const AuditService = require('../services/AuditService');
const NotificationService = require('../services/NotificationService');
const ResponseHelper = require('../utils/ResponseHelper');
const { TABLES, TASK_STATUS, TASK_TYPE, AUDIT_ACTION, NOTIFICATION_TYPE } = require('../utils/Constants');

class TaskController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
    this.notif = new NotificationService(catalystApp, this.db);
  }

  // GET /api/ts/tasks?project_id=&sprint_id=&assignee_id=&status=&type=
  async list(req, res) {
    try {
      const { project_id, sprint_id, assignee_id, status, type } = req.query;
      const tenantId = req.tenantId;
      const userId = req.currentUser.id;
      const role = req.currentUser.role;

      let where = 'parent_task_id = 0';
      if (project_id) where += ` AND project_id = '${DataStoreService.escape(project_id)}'`;
      if (sprint_id)  where += ` AND sprint_id = '${DataStoreService.escape(sprint_id)}'`;
      if (status)     where += ` AND status = '${DataStoreService.escape(status)}'`;
      if (type)       where += ` AND type = '${DataStoreService.escape(type)}'`;

      // For DELIVERY_LEAD, restrict to their project memberships
      if (role === 'DELIVERY_LEAD') {
        const memberRows = await this.db.query(
          `SELECT project_id FROM ${TABLES.PROJECT_MEMBERS} WHERE user_id = '${userId}' AND tenant_id = '${tenantId}'`
        );
        if (memberRows.length > 0) {
          const pids = memberRows.map(r => `'${r.project_id}'`).join(',');
          where += ` AND project_id IN (${pids})`;
        } else {
          // No memberships — return only tasks they created (will JS-filter below)
          where += ` AND created_by = '${userId}'`;
        }
      }
      // TENANT_ADMIN, PMO, EXEC, CLIENT: no additional filter

      let tasks = await this.db.findWhere(TABLES.TASKS, tenantId, where, { orderBy: 'CREATEDTIME DESC', limit: 200 });

      // TEAM_MEMBER: filter in JS so LIKE on JSON text is not needed
      if (role === 'TEAM_MEMBER') {
        tasks = tasks.filter(t => {
          if (String(t.created_by) === userId) return true;
          try { return JSON.parse(t.assignee_ids || '[]').map(String).includes(userId); }
          catch { return false; }
        });
      }

      // assignee_id query param: filter in JS (avoids LIKE on JSON column)
      if (assignee_id) {
        tasks = tasks.filter(t => {
          try { return JSON.parse(t.assignee_ids || '[]').map(String).includes(String(assignee_id)); }
          catch { return false; }
        });
      }

      return ResponseHelper.success(res, tasks);
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // GET /api/ts/tasks/my-tasks
  async myTasks(req, res) {
    try {
      const userId = req.currentUser.id;
      // Fetch recent non-cancelled tasks for the tenant and filter in JS.
      // ZCQL LIKE on JSON text columns is unreliable — JS filtering is definitive.
      const allTasks = await this.db.findWhere(TABLES.TASKS, req.tenantId,
        `status != 'CANCELLED' AND parent_task_id = 0`,
        { orderBy: 'CREATEDTIME DESC', limit: 200 });

      const tasks = allTasks.filter((t) => {
        if (String(t.created_by) === userId) return true;
        try {
          const ids = JSON.parse(t.assignee_ids || '[]');
          return ids.map(String).includes(userId);
        } catch { return false; }
      });

      return ResponseHelper.success(res, tasks);
    } catch (err) {
      console.error('[TaskController.myTasks]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }
  // GET /api/ts/tasks/overdue
  async overdue(req, res) {
    const today = DataStoreService.today();
    const tasks = await this.db.findWhere(TABLES.TASKS, req.tenantId,
      `due_date < '${today}' AND status != 'DONE' AND status != 'CANCELLED'`,
      { orderBy: 'due_date ASC', limit: 100 });
    return ResponseHelper.success(res, tasks);
  }

  // GET /api/ts/tasks/:taskId
  async getById(req, res) {
    const task = await this.db.findById(TABLES.TASKS, req.params.taskId, req.tenantId);
    if (!task) return ResponseHelper.notFound(res, 'Task not found');

    const subtasks = await this.db.findWhere(TABLES.TASKS, req.tenantId, `parent_task_id = '${task.ROWID}'`, { limit: 50 });
    const comments = await this.db.findWhere(TABLES.TASK_COMMENTS, req.tenantId, `task_id = '${task.ROWID}'`, { orderBy: 'CREATEDTIME ASC', limit: 100 });
    const attachments = await this.db.findWhere(TABLES.TASK_ATTACHMENTS, req.tenantId, `task_id = '${task.ROWID}'`, { limit: 50 });
    const history = await this.db.findWhere(TABLES.TASK_STATUS_HISTORY, req.tenantId, `task_id = '${task.ROWID}'`, { orderBy: 'CREATEDTIME ASC', limit: 50 });

    return ResponseHelper.success(res, { ...task, subtasks, comments, attachments, history });
  }

  // POST /api/ts/tasks
  async create(req, res) {
    const { project_id, sprint_id, parent_task_id, title, description, type, priority,
      assignee_id, assignee_ids, story_points, estimated_hours, due_date,
      labels, custom_fields, status } = req.body;
    const tenantId = req.tenantId;
    const userId = req.currentUser.id;

    if (!project_id || !title) return ResponseHelper.validationError(res, 'project_id and title are required');

    // Normalise labels — frontend may send JSON string or array
    let labelsStr = '[]';
    if (labels) {
      labelsStr = typeof labels === 'string' ? labels : JSON.stringify(labels);
    }

    // Build assignee_ids JSON array from assignee_id or assignee_ids input
    let assigneeIdsArr = [];
    if (assignee_ids) {
      const ids = typeof assignee_ids === 'string' ? JSON.parse(assignee_ids) : assignee_ids;
      if (Array.isArray(ids)) assigneeIdsArr = ids.map(String);
    } else if (assignee_id) {
      assigneeIdsArr = [String(assignee_id)];
    }
    const assigneeIdsStr = JSON.stringify(assigneeIdsArr);
    const primaryAssigneeId = assigneeIdsArr[0] || null;

    const insertData = {
      tenant_id: String(tenantId),
      project_id: String(project_id),
      sprint_id: String(sprint_id || 0),
      parent_task_id: String(parent_task_id || 0),
      title,
      description: description || '',
      type: type || TASK_TYPE.TASK,
      status: status || TASK_STATUS.TODO,
      task_priority: priority || 'MEDIUM',
      assignee_ids: assigneeIdsStr,
      story_points: parseInt(story_points) || 0,
      estimated_hours: parseFloat(estimated_hours) || 0,
      logged_hours: 0,
      labels: labelsStr,
      created_by: String(userId),
    };
    if (due_date) insertData.due_date = due_date;

    const row = await this.db.insert(TABLES.TASKS, insertData);

    await this.audit.log({ tenantId, entityType: 'TASK', entityId: row.ROWID, action: AUDIT_ACTION.CREATE, newValue: row, performedBy: userId });

    // Notify assignee
    if (primaryAssigneeId && primaryAssigneeId !== String(userId)) {
      const userRows = await this.db.query(`SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = '${primaryAssigneeId}' LIMIT 1`);
      const creatorRows = await this.db.query(`SELECT name FROM ${TABLES.USERS} WHERE ROWID = '${userId}' LIMIT 1`);
      if (userRows[0]) {
        await this.notif.send({ toEmail: userRows[0].email, subject: `[Delivery Sync] Task assigned: ${title}`, htmlBody: `<p>Hi ${userRows[0].name}, a task has been assigned to you: <strong>${title}</strong> by ${creatorRows[0]?.name || 'a lead'}.</p>` });
        await this.notif.sendInApp({ tenantId, userId: primaryAssigneeId, title: 'Task Assigned', message: `"${title}" has been assigned to you`, type: NOTIFICATION_TYPE.TASK_ASSIGNED, entityType: 'TASK', entityId: row.ROWID });
      }
    }

    return ResponseHelper.created(res, row);
  }

  // PUT /api/ts/tasks/:taskId
  async update(req, res) {
    const { taskId } = req.params;
    const task = await this.db.findById(TABLES.TASKS, taskId, req.tenantId);
    if (!task) return ResponseHelper.notFound(res, 'Task not found');

    const allowed = ['title', 'description', 'type', 'status',
      'sprint_id', 'story_points', 'estimated_hours', 'due_date', 'labels', 'task_priority'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    // priority maps to task_priority column
    if (req.body.priority !== undefined) updates.task_priority = req.body.priority;
    // Update assignee_ids JSON array
    if (req.body.assignee_ids !== undefined || req.body.assignee_id !== undefined) {
      let ids = [];
      if (req.body.assignee_ids) {
        const raw = typeof req.body.assignee_ids === 'string' ? JSON.parse(req.body.assignee_ids) : req.body.assignee_ids;
        if (Array.isArray(raw)) ids = raw.map(String);
      } else if (req.body.assignee_id) {
        ids = [String(req.body.assignee_id)];
      }
      updates.assignee_ids = JSON.stringify(ids);
    }
    if (updates.labels && typeof updates.labels !== 'string') updates.labels = JSON.stringify(updates.labels);
    if (updates.sprint_id === '' || updates.sprint_id === null) updates.sprint_id = 0;
    if (updates.due_date === '') delete updates.due_date;

    const updated = await this.db.update(TABLES.TASKS, { ROWID: taskId, ...updates });
    await this.audit.log({ tenantId: req.tenantId, entityType: 'TASK', entityId: taskId, action: AUDIT_ACTION.UPDATE, oldValue: task, newValue: updated, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, updated);
  }

  // DELETE /api/ts/tasks/:taskId
  async remove(req, res) {
    const task = await this.db.findById(TABLES.TASKS, req.params.taskId, req.tenantId);
    if (!task) return ResponseHelper.notFound(res, 'Task not found');
    await this.db.delete(TABLES.TASKS, req.params.taskId);
    await this.audit.log({ tenantId: req.tenantId, entityType: 'TASK', entityId: req.params.taskId, action: AUDIT_ACTION.DELETE, oldValue: task, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, { message: 'Task deleted' });
  }

  // PATCH /api/ts/tasks/:taskId/status
  async updateStatus(req, res) {
    const { taskId } = req.params;
    const { status } = req.body;
    if (!status) return ResponseHelper.validationError(res, 'status is required');

    const task = await this.db.findById(TABLES.TASKS, taskId, req.tenantId);
    if (!task) return ResponseHelper.notFound(res, 'Task not found');

    const updateFields = { ROWID: taskId, status };
    if (status === TASK_STATUS.DONE) updateFields.completed_at = DataStoreService.fmtDT(new Date());
    await this.db.update(TABLES.TASKS, updateFields);

    // Record status history
    await this.db.insert(TABLES.TASK_STATUS_HISTORY, {
      tenant_id: String(req.tenantId),
      task_id: String(taskId),
      from_status: task.status,
      to_status: status,
      changed_by: String(req.currentUser.id),
    });

    await this.audit.log({ tenantId: req.tenantId, entityType: 'TASK', entityId: taskId, action: AUDIT_ACTION.STATUS_CHANGE, oldValue: { status: task.status }, newValue: { status }, performedBy: req.currentUser.id });

    // Notify task creator
    if (task.created_by && String(task.created_by) !== String(req.currentUser.id)) {
      await this.notif.sendInApp({ tenantId: req.tenantId, userId: task.created_by, title: 'Task Status Updated', message: `"${task.title}" moved to ${status}`, type: NOTIFICATION_TYPE.TASK_STATUS_CHANGED, entityType: 'TASK', entityId: taskId });
    }

    return ResponseHelper.success(res, { message: 'Status updated', status });
  }

  // PATCH /api/ts/tasks/:taskId/assign
  async assign(req, res) {
    const { taskId } = req.params;
    const { assignee_id } = req.body;
    const task = await this.db.findById(TABLES.TASKS, taskId, req.tenantId);
    if (!task) return ResponseHelper.notFound(res, 'Task not found');
    const newIds = assignee_id ? JSON.stringify([String(assignee_id)]) : '[]';
    await this.db.update(TABLES.TASKS, { ROWID: taskId, assignee_ids: newIds });
    await this.audit.log({ tenantId: req.tenantId, entityType: 'TASK', entityId: taskId, action: AUDIT_ACTION.ASSIGN, newValue: { assignee_id }, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, { message: 'Task assigned' });
  }

  // PATCH /api/ts/tasks/:taskId/move-sprint
  async moveSprint(req, res) {
    const { taskId } = req.params;
    const { sprint_id } = req.body;
    const task = await this.db.findById(TABLES.TASKS, taskId, req.tenantId);
    if (!task) return ResponseHelper.notFound(res, 'Task not found');
    await this.db.update(TABLES.TASKS, { ROWID: taskId, sprint_id: sprint_id || 0 });
    await this.audit.log({ tenantId: req.tenantId, entityType: 'TASK', entityId: taskId, action: AUDIT_ACTION.UPDATE, oldValue: { sprint_id: task.sprint_id }, newValue: { sprint_id }, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, { message: 'Task moved' });
  }

  // GET /api/ts/tasks/:taskId/history
  async getHistory(req, res) {
    const history = await this.db.findWhere(TABLES.TASK_STATUS_HISTORY, req.tenantId, `task_id = '${req.params.taskId}'`, { orderBy: 'CREATEDTIME ASC', limit: 100 });
    return ResponseHelper.success(res, history);
  }

  // GET /api/ts/tasks/:taskId/comments
  async getComments(req, res) {
    const comments = await this.db.findWhere(TABLES.TASK_COMMENTS, req.tenantId, `task_id = '${req.params.taskId}'`, { orderBy: 'CREATEDTIME ASC', limit: 200 });
    return ResponseHelper.success(res, comments);
  }

  // POST /api/ts/tasks/:taskId/comments
  async addComment(req, res) {
    const { content } = req.body;
    if (!content) return ResponseHelper.validationError(res, 'content is required');

    const task = await this.db.findById(TABLES.TASKS, req.params.taskId, req.tenantId);
    if (!task) return ResponseHelper.notFound(res, 'Task not found');

    const row = await this.db.insert(TABLES.TASK_COMMENTS, {
      tenant_id: req.tenantId, task_id: req.params.taskId,
      user_id: req.currentUser.id, content, is_edited: false,
    });

    // Notify task creator (reporter substitute) — parse assignee_ids for multi-assignee notify
    const notifySet = new Set();
    if (task.created_by && String(task.created_by) !== String(req.currentUser.id)) notifySet.add(String(task.created_by));
    try {
      const ids = JSON.parse(task.assignee_ids || '[]');
      ids.forEach(id => { if (id && String(id) !== String(req.currentUser.id)) notifySet.add(String(id)); });
    } catch { /* ignore parse errors */ }
    for (const uid of notifySet) {
      await this.notif.sendInApp({ tenantId: req.tenantId, userId: uid, title: 'New Comment', message: `New comment on "${task.title}"`, type: NOTIFICATION_TYPE.TASK_COMMENT_ADDED, entityType: 'TASK', entityId: task.ROWID });
    }

    return ResponseHelper.created(res, row);
  }

  // DELETE /api/ts/tasks/:taskId/comments/:cid
  async deleteComment(req, res) {
    const comment = await this.db.findById(TABLES.TASK_COMMENTS, req.params.cid, req.tenantId);
    if (!comment) return ResponseHelper.notFound(res, 'Comment not found');
    if (String(comment.user_id) !== req.currentUser.id && req.currentUser.role !== 'TENANT_ADMIN')
      return ResponseHelper.forbidden(res, 'Cannot delete another user\'s comment');
    await this.db.delete(TABLES.TASK_COMMENTS, req.params.cid);
    return ResponseHelper.success(res, { message: 'Comment deleted' });
  }

  // GET /api/ts/backlog?project_id=
  async getBacklog(req, res) {
    const { project_id } = req.query;
    if (!project_id) return ResponseHelper.validationError(res, 'project_id is required');
    const tasks = await this.db.findWhere(TABLES.TASKS, req.tenantId,
      `project_id = '${DataStoreService.escape(project_id)}' AND sprint_id = 0 AND parent_task_id = 0 AND status != 'DONE' AND status != 'CANCELLED'`,
      { orderBy: 'CREATEDTIME DESC', limit: 200 });
    return ResponseHelper.success(res, tasks);
  }
}

module.exports = TaskController;
