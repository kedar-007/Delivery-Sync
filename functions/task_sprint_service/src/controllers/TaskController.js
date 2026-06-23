'use strict';

const DataStoreService = require('../services/DataStoreService');
const AuditService = require('../services/AuditService');
const NotificationService = require('../services/NotificationService');
const ResponseHelper = require('../utils/ResponseHelper');
const { TABLES, TASK_STATUS, TASK_TYPE, AUDIT_ACTION, NOTIFICATION_TYPE } = require('../utils/Constants');

class TaskController {
  constructor(catalystApp) {
    this.catalystApp = catalystApp;
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

      // PROJECT_DATA_VIEW_ALL holders see all project tasks without JS restriction.
      const hasViewAll = Array.isArray(req.currentUser.permissions) &&
        req.currentUser.permissions.includes('PROJECT_DATA_VIEW_ALL');

      // TEAM_MEMBER: filter in JS so LIKE on JSON text is not needed.
      // Skipped when the user holds PROJECT_DATA_VIEW_ALL.
      // When project_id is provided, we also check project membership — if the user
      // belongs to that project (e.g. for timesheet logging) they see all its tasks.
      if (role === 'TEAM_MEMBER' && !hasViewAll) {
        if (project_id) {
          // Check if user is a member of the requested project
          const memberRows = await this.db.query(
            `SELECT ROWID FROM ${TABLES.PROJECT_MEMBERS} WHERE project_id = '${DataStoreService.escape(project_id)}' AND user_id = '${userId}' AND tenant_id = '${tenantId}' LIMIT 1`
          );
          if (memberRows.length === 0) {
            // Not a project member — restrict to tasks they created or are assigned to
            tasks = tasks.filter(t => {
              if (String(t.created_by) === userId) return true;
              try { return JSON.parse(t.assignee_ids || '[]').map(String).includes(userId); }
              catch { return false; }
            });
          }
          // Is a project member → see all tasks in this project (no further filter)
        } else {
          // No project_id — show only tasks they created or are assigned to
          tasks = tasks.filter(t => {
            if (String(t.created_by) === userId) return true;
            try { return JSON.parse(t.assignee_ids || '[]').map(String).includes(userId); }
            catch { return false; }
          });
        }
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
    this.notif.tenantSlug = req.currentUser?.tenantSlug || '';
    const { project_id, sprint_id, parent_task_id, title, description, type, priority,
      assignee_id, assignee_ids, story_points, estimated_hours, due_date,
      labels, custom_fields, status } = req.body;
    const tenantId = req.tenantId;
    const userId = req.currentUser.id;
    const role = req.currentUser.role;

    // project_id is mandatory — backlog and sprint tasks must belong to a project.
    if (!project_id || String(project_id) === '0') {
      return ResponseHelper.validationError(res, 'project_id is required');
    }

    // Non-admin users can only create tasks in projects they are a member of.
    const isOrgAdmin = role === 'TENANT_ADMIN' || role === 'SUPER_ADMIN';
    const hasOrgWide = req.currentUser.dataScope === 'ORG_WIDE' || req.currentUser.dataScope === 'SUBORDINATES';
    if (!isOrgAdmin && !hasOrgWide) {
      const membership = await this.db.query(
        `SELECT ROWID FROM ${TABLES.PROJECT_MEMBERS} ` +
        `WHERE tenant_id = '${tenantId}' ` +
        `AND project_id = '${DataStoreService.escape(String(project_id))}' ` +
        `AND user_id = '${userId}' LIMIT 1`
      );
      if (membership.length === 0) {
        return ResponseHelper.forbidden(res, 'You are not a member of this project');
      }
    }

    if (!title) return ResponseHelper.validationError(res, 'title is required');
    // Defence in depth — the frontend already marks Due Date as mandatory, but
    // a hand-crafted POST without it would otherwise leak through. We also
    // accept full ISO strings here (e.g. "2026-05-14T00:00:00Z") by trimming
    // anything after the date portion before validating the YYYY-MM-DD shape.
    if (!due_date) return ResponseHelper.validationError(res, 'due_date is required');
    const _dueDateOnly = String(due_date).split('T')[0].split(' ')[0].trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(_dueDateOnly)) {
      return ResponseHelper.validationError(res, 'due_date must be in YYYY-MM-DD format');
    }

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
      project_id: String(project_id || 0),
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
      require_approval: req.body.require_approval === true || req.body.require_approval === 'true' ? 'true' : 'false',
    };
    // Store the normalised YYYY-MM-DD (already validated above) so a stray
    // time component from the client doesn't leak into the DATE column.
    insertData.due_date = _dueDateOnly;

    const row = await this.db.insert(TABLES.TASKS, insertData);

    await this.audit.log({ tenantId, entityType: 'TASK', entityId: row.ROWID, action: AUDIT_ACTION.CREATE, newValue: row, performedBy: userId });

    // Notify all assignees (skip self). Filter out null/'null' strings so
    // they don't end up in the IN clause as 'null' (BIGINT parse error).
    const _isValidId = (id) => id && id !== 'null' && id !== 'undefined' && id !== String(userId);
    const assigneesToNotify = assigneeIdsArr.filter(_isValidId);
    if (assigneesToNotify.length > 0) {
      // Batch-fetch creator + every assignee in a single query; resolve
      // project name in parallel (only if a project was attached).
      const idsToFetch = [String(userId), ...assigneesToNotify.map(String)];
      const inList = idsToFetch.map((id) => `'${DataStoreService.escape(id)}'`).join(',');
      const hasProject = project_id && String(project_id) !== '0' && String(project_id) !== 'null';
      const [userRows, projectRows] = await Promise.all([
        this.db.query(`SELECT ROWID, email, name FROM ${TABLES.USERS} WHERE ROWID IN (${inList})`),
        hasProject
          ? this.db.query(`SELECT ROWID, name FROM ${TABLES.PROJECTS} WHERE ROWID = '${DataStoreService.escape(String(project_id))}' LIMIT 1`)
          : Promise.resolve([]),
      ]);
      const usersById   = new Map(userRows.map((u) => [String(u.ROWID), u]));
      const creatorName = usersById.get(String(userId))?.name || 'a lead';
      const projectName = projectRows[0]?.name || '';

      for (const assigneeId of assigneesToNotify) {
        const u = usersById.get(String(assigneeId));
        if (u) {
          // Branded HTML email — template auto-escapes via the template helpers.
          await this.notif.sendTaskAssigned({
            toEmail:     u.email,
            toName:      u.name,
            taskTitle:   title,
            taskType:    insertData.type,
            priority:    insertData.task_priority,
            dueDate:     due_date || '',
            projectName,
            assignedBy:  creatorName,
            taskId:      row.ROWID,
          });
          await this.notif.sendInApp({ tenantId, userId: assigneeId, title: 'Task Assigned', message: `"${title}" has been assigned to you`, type: NOTIFICATION_TYPE.TASK_ASSIGNED, entityType: 'TASK', entityId: row.ROWID });
        }
      }
    }

    return ResponseHelper.created(res, row);
  }

  // PUT /api/ts/tasks/:taskId
  async update(req, res) {
    const { taskId } = req.params;
    const { role, id: userId } = req.currentUser;
    const task = await this.db.findById(TABLES.TASKS, taskId, req.tenantId);
    if (!task) return ResponseHelper.notFound(res, 'Task not found');

    const isAdmin = role === 'TENANT_ADMIN' || role === 'SUPER_ADMIN';
    const isCreator = task.created_by && String(task.created_by) === String(userId);
    if (!isAdmin && !isCreator) {
      return ResponseHelper.forbidden(res, 'Only the task creator or an admin can edit task details');
    }

    // `status` is intentionally NOT in this list — status changes go through
    // PATCH /tasks/:id/status (the updateStatus endpoint) so that assignees can
    // change status without needing creator-level permission on the rest of
    // the details. If a caller posts `status` here it's silently ignored.
    const allowed = ['title', 'description', 'type',
      'sprint_id', 'story_points', 'estimated_hours', 'due_date', 'labels', 'task_priority', 'require_approval'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    // Normalise require_approval to match the create handler (handles string or boolean input)
    if (updates.require_approval !== undefined) {
      updates.require_approval = (updates.require_approval === true || updates.require_approval === 'true') ? 'true' : 'false';
    }
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

    // Delete is restricted to the creator or a tenant/super admin — same
    // policy as update(), since the route-level TASK_WRITE perm alone was
    // letting any junior delete tasks created by senior leads.
    const { role, id: userId } = req.currentUser;
    const isAdmin   = role === 'TENANT_ADMIN' || role === 'SUPER_ADMIN';
    const isCreator = task.created_by && String(task.created_by) === String(userId);
    if (!isAdmin && !isCreator) {
      return ResponseHelper.forbidden(res, 'Only the task creator or an admin can delete this task');
    }

    await this.db.delete(TABLES.TASKS, req.params.taskId);
    await this.audit.log({ tenantId: req.tenantId, entityType: 'TASK', entityId: req.params.taskId, action: AUDIT_ACTION.DELETE, oldValue: task, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, { message: 'Task deleted' });
  }

  // PATCH /api/ts/tasks/:taskId/status
  //
  // Status changes are OPEN to anyone (assignees, creators, admins) by design:
  // task details (title, due date, etc.) are creator-only, but moving a task
  // along the workflow — including marking it DONE — should be allowed for
  // whoever is doing the work. The owner is notified via both in-app and
  // email so they hear about completions even when not actively in the app.
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

    // ── Notify task creator (in-app + email) ─────────────────────────────────
    // Skip if the creator IS the one making the change (no self-notification).
    if (task.created_by && String(task.created_by) !== String(req.currentUser.id)) {
      const isDone     = status === TASK_STATUS.DONE;
      const actorName  = req.currentUser.name || req.currentUser.email || 'A team member';

      // 1. In-app notification (existing behaviour, kept intact)
      await this.notif.sendInApp({
        tenantId:    req.tenantId,
        userId:      task.created_by,
        title:       isDone ? 'Task completed' : 'Task status updated',
        message:     isDone
          ? `${actorName} marked "${task.title}" as DONE`
          : `${actorName} moved "${task.title}" to ${String(status).replace(/_/g, ' ')}`,
        type:        NOTIFICATION_TYPE.TASK_STATUS_CHANGED,
        entityType:  'TASK',
        entityId:    taskId,
      });

      // 2. Email notification (new) — fire-and-forget so a mail failure doesn't
      //    block the status update itself.
      try {
        const ownerRows = await this.db.query(
          `SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = '${task.created_by}' LIMIT 1`
        );
        const owner = ownerRows[0];
        if (owner && owner.email) {
          const subject = isDone
            ? `Task completed: ${task.title}`
            : `Task status changed: ${task.title}`;
          const htmlBody = `
            <p>Hi ${owner.name || 'there'},</p>
            <p>
              <strong>${actorName}</strong> ${isDone ? 'marked your task as <strong>DONE</strong>' : `moved your task to <strong>${String(status).replace(/_/g, ' ')}</strong>`}:
            </p>
            <blockquote style="margin:12px 0;padding:10px 14px;border-left:3px solid #4f46e5;background:#f5f3ff;color:#312e81;">
              ${_escapeHtml(task.title || '(untitled)')}
            </blockquote>
            <p style="font-size:12px;color:#6b7280;">
              Previous status: <strong>${String(task.status || '—').replace(/_/g, ' ')}</strong>
              &nbsp;→&nbsp;
              New status: <strong>${String(status).replace(/_/g, ' ')}</strong>
            </p>
            <p style="font-size:12px;color:#9ca3af;">You are receiving this because you created this task.</p>
          `;
          await this.notif.send({
            toEmail:  owner.email,
            subject,
            htmlBody,
          });
        }
      } catch (mailErr) {
        console.warn('[TaskController.updateStatus] email notification failed (non-fatal):', mailErr.message);
      }
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
    const tid = DataStoreService.escape(req.params.taskId);
    const history = await this.db.findWhere(TABLES.TASK_STATUS_HISTORY, req.tenantId, `task_id = '${tid}'`, { orderBy: 'CREATEDTIME ASC', limit: 100 });
    return ResponseHelper.success(res, history);
  }

  // GET /api/ts/tasks/:taskId/comments
  async getComments(req, res) {
    const tid = DataStoreService.escape(req.params.taskId);
    const comments = await this.db.findWhere(TABLES.TASK_COMMENTS, req.tenantId, `task_id = '${tid}'`, { orderBy: 'CREATEDTIME ASC', limit: 200 });
    return ResponseHelper.success(res, comments);
  }

  // POST /api/ts/tasks/:taskId/comments
  async addComment(req, res) {
    const { content, mentionedUserIds } = req.body;
    if (!content) return ResponseHelper.validationError(res, 'content is required');

    const task = await this.db.findById(TABLES.TASKS, req.params.taskId, req.tenantId);
    if (!task) return ResponseHelper.notFound(res, 'Task not found');

    const row = await this.db.insert(TABLES.TASK_COMMENTS, {
      tenant_id: req.tenantId, task_id: req.params.taskId,
      user_id: req.currentUser.id, content, is_edited: false,
    });

    // Notify task creator + assignees about new comment
    const notifySet = new Set();
    if (task.created_by && String(task.created_by) !== String(req.currentUser.id)) notifySet.add(String(task.created_by));
    try {
      const ids = JSON.parse(task.assignee_ids || '[]');
      ids.forEach(id => { if (id && String(id) !== String(req.currentUser.id)) notifySet.add(String(id)); });
    } catch { /* ignore parse errors */ }
    for (const uid of notifySet) {
      await this.notif.sendInApp({ tenantId: req.tenantId, userId: uid, title: 'New Comment', message: `New comment on "${task.title}"`, type: NOTIFICATION_TYPE.TASK_COMMENT_ADDED, entityType: 'TASK', entityId: task.ROWID });
    }

    // High-priority mention notifications for @mentioned users (in-app + email)
    const mentionIds = Array.isArray(mentionedUserIds) ? mentionedUserIds : [];
    const actorName  = req.currentUser.name || req.currentUser.email || 'A team member';
    for (const uid of mentionIds) {
      if (String(uid) === String(req.currentUser.id)) continue;

      // In-app
      await this.notif.sendInApp({
        tenantId: req.tenantId, userId: String(uid),
        title: `${actorName} mentioned you`,
        message: `You were mentioned in a comment on "${task.title}"`,
        type: NOTIFICATION_TYPE.TASK_MENTIONED,
        entityType: 'TASK', entityId: task.ROWID,
        priority: 'HIGH',
      });

      // Email — fire-and-forget
      try {
        const userRows = await this.db.query(
          `SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = '${DataStoreService.escape(String(uid))}' LIMIT 1`
        );
        const mentionedUser = userRows[0];
        if (mentionedUser && mentionedUser.email) {
          const plainText = _htmlToText(content);
          const excerpt   = plainText.length > 200 ? plainText.slice(0, 197) + '…' : plainText;
          await this.notif.sendMentionedInComment({
            toEmail:        mentionedUser.email,
            toName:         _escapeHtml(mentionedUser.name || 'there'),
            actorName:      _escapeHtml(actorName),
            taskTitle:      _escapeHtml(task.title || '(untitled)'),
            commentExcerpt: _escapeHtml(excerpt),
            taskId:         task.ROWID,
          });
        }
      } catch (mailErr) {
        console.warn('[TaskController.addComment] mention email failed (non-fatal):', mailErr.message);
      }
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

    const userId     = req.currentUser.id;
    const role       = req.currentUser.role;
    const hasViewAll = Array.isArray(req.currentUser.permissions) &&
      req.currentUser.permissions.includes('PROJECT_DATA_VIEW_ALL');

    let tasks = await this.db.findWhere(TABLES.TASKS, req.tenantId,
      `project_id = '${DataStoreService.escape(project_id)}' AND sprint_id = 0 AND parent_task_id = 0 AND status != 'DONE' AND status != 'CANCELLED'`,
      { orderBy: 'CREATEDTIME DESC', limit: 200 });

    // TEAM_MEMBER: restrict to tasks they created or are assigned to.
    // PROJECT_DATA_VIEW_ALL holders bypass this — they see the full backlog.
    if (role === 'TEAM_MEMBER' && !hasViewAll) {
      tasks = tasks.filter((t) => {
        if (String(t.created_by) === userId) return true;
        try { return JSON.parse(t.assignee_ids || '[]').map(String).includes(userId); }
        catch { return false; }
      });
    }

    return ResponseHelper.success(res, tasks);
  }

  // GET /api/ts/tasks/search?q=<term>
  // Requires Search Index enabled on 'title' and 'description' columns of the 'tasks' table.
  async searchMyTasks(req, res) {
    try {
      const { id: userId } = req.currentUser;
      const q = (req.query.q || '').trim();
      if (!q || q.length < 2) return ResponseHelper.validationError(res, 'Search term must be at least 2 characters');

      const results = await this.catalystApp.search().executeSearchQuery({
        search: q,
        search_table_columns: { [TABLES.TASKS]: ['title', 'description'] },
        select_table_columns: {
          [TABLES.TASKS]: ['ROWID', 'title', 'description', 'type', 'status', 'task_priority',
            'assignee_ids', 'created_by', 'due_date', 'project_id', 'sprint_id',
            'story_points', 'estimated_hours', 'labels', 'tenant_id'],
        },
      });

      const hits = (results[TABLES.TASKS] ?? []).filter((t) => {
        if (String(t.tenant_id) !== String(req.tenantId)) return false;
        if (String(t.created_by) === userId) return true;
        try { return JSON.parse(t.assignee_ids || '[]').map(String).includes(userId); } catch { return false; }
      });

      return ResponseHelper.success(res, hits);
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
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

// Convert rich HTML comment content to readable plain text for emails.
// @mention spans become @Name, block tags become spaces, all other tags are stripped.
function _htmlToText(html) {
  return String(html || '')
    .replace(/<span[^>]*data-mention[^>]*>([^<]*)<\/span>/gi, (_, inner) => inner.trim())
    .replace(/<\/?(p|div|br|li|blockquote|pre|h[1-6])[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = TaskController;
