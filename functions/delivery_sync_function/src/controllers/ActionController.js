'use strict';

const DataStoreService = require('../services/DataStoreService');
const AuditService = require('../services/AuditService');
const NotificationService = require('../services/NotificationService');
const ResponseHelper = require('../utils/ResponseHelper');
const Validator = require('../utils/Validator');
const { TABLES, ACTION_STATUS, AUDIT_ACTION, NOTIFICATION_TYPE } = require('../utils/Constants');

/**
 * ActionController – CRUD for action items with status tracking.
 */
class ActionController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
    this.notifier = new NotificationService(catalystApp, this.db);
  }

  /**
   * POST /api/actions
   */
  async createAction(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const data = Validator.validateCreateAction(req.body);

      // Verify project belongs to tenant
      const project = await this.db.findById(TABLES.PROJECTS, data.project_id, tenantId);
      if (!project) return ResponseHelper.notFound(res, 'Project not found');

      const action = await this.db.insert(TABLES.ACTIONS, {
        tenant_id: tenantId,
        project_id: data.project_id,
        title: data.title,
        description: data.description,
        assigned_to: data.owner_user_id,
        created_by: userId,
        due_date: data.due_date,
        status: ACTION_STATUS.OPEN,
        action_priority: data.priority,
        source: data.source,
      });

      await this.audit.log({
        tenantId, entityType: 'action', entityId: String(action.ROWID),
        action: AUDIT_ACTION.CREATE,
        newValue: { title: data.title, due_date: data.due_date, owner: data.owner_user_id },
        performedBy: userId,
      });

      // Notify the assignee (fire-and-forget, don't notify self)
      console.log(`[ActionNotify] owner_user_id=${data.owner_user_id} creator=${userId} same=${String(data.owner_user_id) === String(userId)}`);
      if (data.owner_user_id && String(data.owner_user_id) !== String(userId)) {
        (async () => {
          try {
            console.log(`[ActionNotify] fetching creator=${userId} and assignee=${data.owner_user_id}`);
            const [creator, assignee] = await Promise.all([
              this.db.findById(TABLES.USERS, userId, tenantId),
              this.db.findById(TABLES.USERS, data.owner_user_id, tenantId),
            ]);
            console.log(`[ActionNotify] creator found: ${!!creator} (${creator?.name}) | assignee found: ${!!assignee} (${assignee?.name}, email=${assignee?.email})`);

            const projectName = project.name;
            const creatorName = creator?.name || 'A lead';
            const notifyMsg = `${creatorName} assigned you an action on "${projectName}"${data.due_date ? ` due ${data.due_date}` : ''}.`;

            if (!assignee) {
              console.warn(`[ActionNotify] assignee user not found in DB for id=${data.owner_user_id}, skipping email`);
            } else if (!assignee.email) {
              console.warn(`[ActionNotify] assignee ${assignee.name} has no email stored, skipping email`);
            } else {
              console.log(`[ActionNotify] sending email to ${assignee.email}`);
            }

            const [, emailResult] = await Promise.all([
              this.notifier.sendInApp({
                tenantId,
                userId: data.owner_user_id,
                title: `New action assigned: ${data.title}`,
                message: notifyMsg,
                type: NOTIFICATION_TYPE.TASK_ASSIGNMENT,
                entityType: 'action',
                entityId: String(action.ROWID),
                metadata: { projectId: data.project_id, projectName, dueDate: data.due_date },
              }),
              assignee?.email
                ? this.notifier.sendTaskAssignment({
                    tenantId,
                    userId: data.owner_user_id,
                    toEmail: assignee.email,
                    toName: assignee.name || assignee.email,
                    actionTitle: data.title,
                    dueDate: data.due_date || null,
                    projectName,
                    assignedBy: creatorName,
                  })
                : Promise.resolve(null),
            ]);
            console.log(`[ActionNotify] email result: ${emailResult}`);

            // Audit log the notification outcome
            const noEmail = !assignee?.email;
            await this.audit.log({
              tenantId,
              entityType: 'notification',
              entityId: String(action.ROWID),
              action: noEmail
                ? AUDIT_ACTION.NOTIFY_SKIPPED
                : emailResult
                  ? AUDIT_ACTION.NOTIFY_SENT
                  : AUDIT_ACTION.NOTIFY_FAILED,
              newValue: {
                channel: 'email',
                event: 'ACTION_ASSIGNED',
                toUserId: data.owner_user_id,
                toEmail: assignee?.email || null,
                toName: assignee?.name || null,
                reason: noEmail ? 'no_email_on_user' : (emailResult ? 'ok' : 'send_failed'),
              },
              performedBy: userId,
            });
          } catch (e) {
            console.error('[ActionNotify] notify FAILED:', e.message, e.stack || '');
          }
        })();
      } else {
        const reason = !data.owner_user_id ? 'no_owner_user_id' : 'assigning_to_self';
        console.log(`[ActionNotify] skipped — ${reason}`);
        await this.audit.log({
          tenantId,
          entityType: 'notification',
          entityId: String(action.ROWID),
          action: AUDIT_ACTION.NOTIFY_SKIPPED,
          newValue: { channel: 'email', event: 'ACTION_ASSIGNED', reason },
          performedBy: userId,
        });
      }

      return ResponseHelper.created(res, {
        action: {
          id: String(action.ROWID), projectId: data.project_id,
          title: data.title, status: ACTION_STATUS.OPEN,
          dueDate: data.due_date, priority: data.priority,  // priority is the response field name (mapped from action_priority)
          ownerUserId: data.owner_user_id,
        },
      });
    } catch (err) {
      if (err.isValidation) return ResponseHelper.validationError(res, err.message, err.details);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/actions?projectId=&status=&ownerId=
   */
  async listActions(req, res) {
    try {
      const { tenantId, id: userId, role } = req.currentUser;
      const { projectId, status, ownerId } = req.query;

      let conditions = [];
      if (projectId) conditions.push(`project_id = '${DataStoreService.escape(projectId)}'`);
      if (status) conditions.push(`status = '${DataStoreService.escape(status)}'`);
      if (ownerId) conditions.push(`assigned_to = '${DataStoreService.escape(ownerId)}'`);
      // TEAM_MEMBER only sees their own actions unless a specific project is given
      if (role === 'TEAM_MEMBER' && !projectId) {
        conditions.push(`assigned_to = '${userId}'`);
      }

      const actions = await this.db.findWhere(
        TABLES.ACTIONS, tenantId,
        conditions.length > 0 ? conditions.join(' AND ') : null,
        { orderBy: 'due_date ASC', limit: 100 }
      );

      const today = DataStoreService.today();
      return ResponseHelper.success(res, {
        actions: actions.map((a) => ({
          id: String(a.ROWID),
          projectId: a.project_id,
          title: a.title,
          description: a.description,
          ownerUserId: a.assigned_to,
          assignedBy: a.assigned_by,
          dueDate: a.due_date,
          status: a.status,
          priority: a.action_priority,
          source: a.source,
          isOverdue: a.due_date < today && a.status !== ACTION_STATUS.DONE && a.status !== ACTION_STATUS.CANCELLED,
        })),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * PUT /api/actions/:actionId
   */
  async updateAction(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const { actionId } = req.params;

      const existing = await this.db.findById(TABLES.ACTIONS, actionId, tenantId);
      if (!existing) return ResponseHelper.notFound(res, 'Action not found');

      const data = Validator.validateUpdateAction(req.body);
      const updatePayload = { ROWID: actionId };
      if (data.title !== undefined) updatePayload.title = data.title;
      if (data.description !== undefined) updatePayload.description = data.description;
      if (data.owner_user_id !== undefined) updatePayload.assigned_to = data.owner_user_id;
      if (data.due_date !== undefined) updatePayload.due_date = data.due_date;
      if (data.priority !== undefined) updatePayload.action_priority = data.priority;
      if (data.status !== undefined) {
        updatePayload.status = data.status;
        if (data.status === ACTION_STATUS.DONE) {
          updatePayload.completed_date = DataStoreService.today();
        }
      }

      await this.db.update(TABLES.ACTIONS, updatePayload);

      // Notify new assignee if ownership changed
      if (
        data.owner_user_id &&
        String(data.owner_user_id) !== String(existing.assigned_to) &&
        String(data.owner_user_id) !== String(userId)
      ) {
        (async () => {
          try {
            const [updater, assignee, project] = await Promise.all([
              this.db.findById(TABLES.USERS, userId, tenantId),
              this.db.findById(TABLES.USERS, data.owner_user_id, tenantId),
              this.db.findById(TABLES.PROJECTS, existing.project_id, tenantId),
            ]);
            const projectName = project?.name || '';
            const updaterName = updater?.name || 'A lead';
            const actionTitle = data.title || existing.title;
            const dueDate = data.due_date || existing.due_date || null;

            await Promise.all([
              this.notifier.sendInApp({
                tenantId,
                userId: data.owner_user_id,
                title: `Action assigned to you: ${actionTitle}`,
                message: `${updaterName} assigned you an action on "${projectName}"${dueDate ? ` due ${dueDate}` : ''}.`,
                type: NOTIFICATION_TYPE.TASK_ASSIGNMENT,
                entityType: 'action',
                entityId: String(actionId),
                metadata: { projectId: existing.project_id, projectName, dueDate },
              }),
              assignee?.email
                ? this.notifier.sendTaskAssignment({
                    tenantId,
                    userId: data.owner_user_id,
                    toEmail: assignee.email,
                    toName: assignee.name || assignee.email,
                    actionTitle,
                    dueDate,
                    projectName,
                    assignedBy: updaterName,
                  })
                : Promise.resolve(),
            ]);
          } catch (e) {
            console.error('[ActionController] reassign notify failed:', e.message);
          }
        })();
      }

      if (data.status && data.status !== existing.status) {
        await this.audit.log({
          tenantId, entityType: 'action', entityId: actionId,
          action: AUDIT_ACTION.STATUS_CHANGE,
          oldValue: { status: existing.status },
          newValue: { status: data.status },
          performedBy: userId,
        });

        // Notify the action owner about the status change (if changed by someone else)
        const ownerId = data.owner_user_id || existing.assigned_to;
        if (ownerId && String(ownerId) !== String(userId)) {
          (async () => {
            try {
              const [owner, changer, project] = await Promise.all([
                this.db.findById(TABLES.USERS, ownerId, tenantId),
                this.db.findById(TABLES.USERS, userId, tenantId),
                this.db.findById(TABLES.PROJECTS, existing.project_id, tenantId),
              ]);
              const changerName = changer?.name || 'A lead';
              const projectName = project?.name || '';
              const actionTitle = data.title || existing.title;
              const dueDate = data.due_date || existing.due_date || null;

              console.log(`[ActionStatusNotify] owner=${owner?.name} email=${owner?.email} newStatus=${data.status} changedBy=${changerName}`);

              const [, emailResult] = await Promise.all([
                this.notifier.sendInApp({
                  tenantId,
                  userId: ownerId,
                  title: `Action "${actionTitle}" is now ${data.status}`,
                  message: `${changerName} updated the status of your action on "${projectName}" to ${data.status}.`,
                  type: NOTIFICATION_TYPE.TASK_ASSIGNMENT,
                  entityType: 'action',
                  entityId: String(actionId),
                  metadata: { projectId: existing.project_id, projectName, newStatus: data.status },
                }),
                owner?.email
                  ? this.notifier.sendActionStatusChanged({
                      toEmail: owner.email,
                      toName: owner.name || owner.email,
                      actionTitle,
                      projectName,
                      newStatus: data.status,
                      changedBy: changerName,
                      dueDate,
                    })
                  : Promise.resolve(null),
              ]);

              await this.audit.log({
                tenantId,
                entityType: 'notification',
                entityId: String(actionId),
                action: !owner?.email
                  ? AUDIT_ACTION.NOTIFY_SKIPPED
                  : emailResult ? AUDIT_ACTION.NOTIFY_SENT : AUDIT_ACTION.NOTIFY_FAILED,
                newValue: {
                  channel: 'email', event: 'ACTION_STATUS_CHANGED',
                  toUserId: String(ownerId), toEmail: owner?.email || null,
                  newStatus: data.status,
                  reason: !owner?.email ? 'no_email_on_user' : (emailResult ? 'ok' : 'send_failed'),
                },
                performedBy: userId,
              });
            } catch (e) {
              console.error('[ActionStatusNotify] failed:', e.message);
            }
          })();
        }
      }

      return ResponseHelper.success(res, { actionId, updated: data });
    } catch (err) {
      if (err.isValidation) return ResponseHelper.validationError(res, err.message, err.details);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * DELETE /api/actions/:actionId
   */
  async deleteAction(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { actionId } = req.params;

      const existing = await this.db.findById(TABLES.ACTIONS, actionId, tenantId);
      if (!existing) return ResponseHelper.notFound(res, 'Action not found');

      await this.db.delete(TABLES.ACTIONS, actionId);
      return ResponseHelper.success(res, null, 'Action deleted');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = ActionController;
