'use strict';

const DataStoreService = require('../services/DataStoreService');
const AuditService = require('../services/AuditService');
const ResponseHelper = require('../utils/ResponseHelper');
const Validator = require('../utils/Validator');
const { TABLES, ACTION_STATUS, AUDIT_ACTION } = require('../utils/Constants');

/**
 * ActionController – CRUD for action items with status tracking.
 */
class ActionController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
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

      if (data.status && data.status !== existing.status) {
        await this.audit.log({
          tenantId, entityType: 'action', entityId: actionId,
          action: AUDIT_ACTION.STATUS_CHANGE,
          oldValue: { status: existing.status },
          newValue: { status: data.status },
          performedBy: userId,
        });
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
