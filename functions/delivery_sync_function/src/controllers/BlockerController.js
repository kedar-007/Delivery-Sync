'use strict';

const DataStoreService = require('../services/DataStoreService');
const AuditService = require('../services/AuditService');
const ResponseHelper = require('../utils/ResponseHelper');
const Validator = require('../utils/Validator');
const { TABLES, BLOCKER_STATUS, AUDIT_ACTION } = require('../utils/Constants');

/**
 * BlockerController – manage blockers with escalation capability.
 */
class BlockerController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
  }

  /**
   * POST /api/blockers
   */
  async createBlocker(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const data = Validator.validateCreateBlocker(req.body);

      const project = await this.db.findById(TABLES.PROJECTS, data.project_id, tenantId);
      if (!project) return ResponseHelper.notFound(res, 'Project not found');

      const blocker = await this.db.insert(TABLES.BLOCKERS, {
        tenant_id: tenantId,
        project_id: data.project_id,
        title: data.title,
        description: data.description,
        severity: data.severity,
        status: BLOCKER_STATUS.OPEN,
        owner_user_id: data.owner_user_id,
        raised_by: userId,
        resolution: '',
        resolved_date: '',
        escalated_to: '',
      });

      await this.audit.log({
        tenantId, entityType: 'blocker', entityId: String(blocker.ROWID),
        action: AUDIT_ACTION.CREATE,
        newValue: { title: data.title, severity: data.severity },
        performedBy: userId,
      });

      return ResponseHelper.created(res, {
        blocker: {
          id: String(blocker.ROWID), projectId: data.project_id,
          title: data.title, severity: data.severity,
          status: BLOCKER_STATUS.OPEN, ownerUserId: data.owner_user_id,
        },
      });
    } catch (err) {
      if (err.isValidation) return ResponseHelper.validationError(res, err.message, err.details);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/blockers?projectId=&status=&severity=
   */
  async listBlockers(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { projectId, status, severity } = req.query;

      const conditions = [];
      if (projectId) conditions.push(`project_id = '${DataStoreService.escape(projectId)}'`);
      if (status) conditions.push(`status = '${DataStoreService.escape(status)}'`);
      if (severity) conditions.push(`severity = '${DataStoreService.escape(severity)}'`);

      const blockers = await this.db.findWhere(
        TABLES.BLOCKERS, tenantId,
        conditions.length > 0 ? conditions.join(' AND ') : null,
        { orderBy: 'CREATEDTIME DESC', limit: 100 }
      );

      const today = DataStoreService.today();
      return ResponseHelper.success(res, {
        blockers: blockers.map((b) => {
          const createdDate = b.raised_date || today;
          const ageDays = Math.floor((new Date(today) - new Date(createdDate)) / 86400000);
          return {
            id: String(b.ROWID),
            projectId: b.project_id,
            title: b.title,
            description: b.description,
            severity: b.severity,
            status: b.status,
            ownerUserId: b.owner_user_id,
            raisedBy: b.raised_by,
            resolution: b.resolution,
            resolvedDate: b.resolved_date,
            escalatedTo: b.escalated_to,
            ageDays,
          };
        }),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * PUT /api/blockers/:blockerId
   */
  async updateBlocker(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const { blockerId } = req.params;

      const existing = await this.db.findById(TABLES.BLOCKERS, blockerId, tenantId);
      if (!existing) return ResponseHelper.notFound(res, 'Blocker not found');

      const data = Validator.validateUpdateBlocker(req.body);
      const updatePayload = { ROWID: blockerId };
      if (data.title !== undefined) updatePayload.title = data.title;
      if (data.description !== undefined) updatePayload.description = data.description;
      if (data.severity !== undefined) updatePayload.severity = data.severity;
      if (data.status !== undefined) updatePayload.status = data.status;
      if (data.resolution !== undefined) updatePayload.resolution = data.resolution;
      if (data.escalated_to !== undefined) updatePayload.escalated_to = data.escalated_to;

      if (data.status === BLOCKER_STATUS.RESOLVED && existing.status !== BLOCKER_STATUS.RESOLVED) {
        updatePayload.resolved_date = DataStoreService.today();
      }

      await this.db.update(TABLES.BLOCKERS, updatePayload);

      if (data.status && data.status !== existing.status) {
        await this.audit.log({
          tenantId, entityType: 'blocker', entityId: blockerId,
          action: data.status === BLOCKER_STATUS.ESCALATED ? AUDIT_ACTION.ESCALATE : AUDIT_ACTION.STATUS_CHANGE,
          oldValue: { status: existing.status },
          newValue: { status: data.status, resolution: data.resolution },
          performedBy: userId,
        });
      }

      return ResponseHelper.success(res, { blockerId, updated: data });
    } catch (err) {
      if (err.isValidation) return ResponseHelper.validationError(res, err.message, err.details);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * PATCH /api/blockers/:blockerId/resolve
   */
  async resolveBlocker(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const { blockerId } = req.params;
      const { resolution } = req.body;

      const existing = await this.db.findById(TABLES.BLOCKERS, blockerId, tenantId);
      if (!existing) return ResponseHelper.notFound(res, 'Blocker not found');
      if (existing.status === BLOCKER_STATUS.RESOLVED) {
        return ResponseHelper.conflict(res, 'Blocker is already resolved');
      }

      await this.db.update(TABLES.BLOCKERS, {
        ROWID: blockerId,
        status: BLOCKER_STATUS.RESOLVED,
        resolution: resolution || '',
        resolved_date: DataStoreService.today(),
      });

      await this.audit.log({
        tenantId, entityType: 'blocker', entityId: blockerId,
        action: AUDIT_ACTION.STATUS_CHANGE,
        oldValue: { status: existing.status },
        newValue: { status: BLOCKER_STATUS.RESOLVED, resolution },
        performedBy: userId,
      });

      return ResponseHelper.success(res, null, 'Blocker resolved');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = BlockerController;
