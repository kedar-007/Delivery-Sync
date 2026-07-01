'use strict';

const DataStoreService = require('../services/DataStoreService');
const AuditService = require('../services/AuditService');
const ResponseHelper = require('../utils/ResponseHelper');
const Validator = require('../utils/Validator');
const { TABLES, AUDIT_ACTION } = require('../utils/Constants');

/**
 * DecisionController – decision log management.
 */
class DecisionController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
  }

  /**
   * POST /api/decisions
   */
  async createDecision(req, res) {
    try {
      const { tenantId, id: userId, role } = req.currentUser;
      const data = Validator.validateCreateDecision(req.body);

      const project = await this.db.findById(TABLES.PROJECTS, data.project_id, tenantId);
      if (!project) return ResponseHelper.notFound(res, 'Project not found');

      // Verify caller is a member of the project (admins bypass)
      const isAdmin = role === 'TENANT_ADMIN' || role === 'SUPER_ADMIN';
      const hasOrgWide = req.currentUser.dataScope === 'ORG_WIDE' || req.currentUser.dataScope === 'SUBORDINATES';
      const hasViewAll = Array.isArray(req.currentUser.permissions) &&
        req.currentUser.permissions.includes('PROJECT_DATA_VIEW_ALL');
      if (!isAdmin && !hasOrgWide && !hasViewAll) {
        const membership = await this.db.query(
          `SELECT ROWID FROM ${TABLES.PROJECT_MEMBERS} ` +
          `WHERE tenant_id = '${tenantId}' ` +
          `AND project_id = '${DataStoreService.escape(String(data.project_id))}' ` +
          `AND user_id = '${userId}' LIMIT 1`
        );
        if (membership.length === 0) {
          return ResponseHelper.forbidden(res, 'You are not a member of this project');
        }
      }

      const decision = await this.db.insert(TABLES.DECISIONS, {
        tenant_id: tenantId,
        project_id: data.project_id,
        title: data.title,
        description: data.description,
        decision_date: data.decision_date,
        made_by: userId,
        impact: data.impact,
        rationale: data.rationale,
        status: 'OPEN',
      });

      return ResponseHelper.created(res, {
        decision: {
          id: String(decision.ROWID), projectId: data.project_id,
          title: data.title, decisionDate: data.decision_date,
          status: 'OPEN', madeBy: userId,
        },
      });
    } catch (err) {
      if (err.isValidation) return ResponseHelper.validationError(res, err.message, err.details);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/decisions?projectId=&status=
   */
  async listDecisions(req, res) {
    try {
      const { tenantId, id: userId, role, dataScope } = req.currentUser;
      const { projectId, status } = req.query;

      const hasOrgWide = role === 'TENANT_ADMIN' || role === 'SUPER_ADMIN'
        || dataScope === 'ORG_WIDE' || dataScope === 'SUBORDINATES';
      const hasViewAll = Array.isArray(req.currentUser.permissions) &&
        req.currentUser.permissions.includes('PROJECT_DATA_VIEW_ALL');
      const canViewAllProjects = hasOrgWide || hasViewAll;

      const conditions = ['deleted_at IS NULL'];

      if (projectId) {
        // Specific project — middleware already verified membership for restricted users
        conditions.push(`project_id = '${DataStoreService.escape(projectId)}'`);
      } else if (!canViewAllProjects) {
        // No project filter: restrict to projects the caller belongs to
        const memberships = await this.db.findAll(
          TABLES.PROJECT_MEMBERS,
          { tenant_id: tenantId, user_id: userId },
          { limit: 200 }
        );
        if (memberships.length === 0) {
          return ResponseHelper.success(res, { decisions: [] });
        }
        const pids = memberships.map((m) => `'${m.project_id}'`).join(',');
        conditions.push(`project_id IN (${pids})`);
      }

      if (status) conditions.push(`status = '${DataStoreService.escape(status)}'`);

      const decisions = await this.db.findWhere(TABLES.DECISIONS, tenantId,
        conditions.length > 0 ? conditions.join(' AND ') : null,
        { orderBy: 'decision_date DESC', limit: 100 });

      // Enrich with user name + avatar so the frontend can show a proper
      // "made by" chip instead of a raw user ID.
      const userIds = [...new Set(decisions.map((d) => d.made_by).filter(Boolean).map(String))];
      const userMap = {};
      if (userIds.length > 0) {
        try {
          const userRows = await this.db.query(
            `SELECT ROWID, name, avatar_url FROM ${TABLES.USERS} ` +
            `WHERE ROWID IN (${userIds.map((id) => `'${id}'`).join(',')}) LIMIT ${userIds.length}`
          );
          userRows.forEach((u) => { userMap[String(u.ROWID)] = u; });
        } catch (_) { /* enrichment is non-fatal — fall back to IDs */ }
      }

      return ResponseHelper.success(res, {
        decisions: decisions.map((d) => {
          const u = userMap[String(d.made_by)] || {};
          return {
            id: String(d.ROWID), projectId: d.project_id, title: d.title,
            description: d.description, decisionDate: d.decision_date,
            madeBy: d.made_by,
            madeByName:      u.name       || null,
            madeByAvatarUrl: u.avatar_url || null,
            impact: d.impact, rationale: d.rationale,
            status: d.status,
          };
        }),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * PUT /api/decisions/:decisionId
   */
  async updateDecision(req, res) {
    try {
      const { tenantId, id: userId, role } = req.currentUser;
      const { decisionId } = req.params;

      const existing = await this.db.findById(TABLES.DECISIONS, decisionId, tenantId);
      if (!existing) return ResponseHelper.notFound(res, 'Decision not found');

      // Edits are restricted to the original creator or a tenant/super admin.
      // The route already requires DECISION_WRITE, but that permission alone
      // was letting any junior with the perm rewrite decisions made by senior
      // leads. Admin override stays so an admin can correct/clean up entries.
      const isAdmin   = role === 'TENANT_ADMIN' || role === 'SUPER_ADMIN';
      const isCreator = String(existing.made_by) === String(userId);
      if (!isAdmin && !isCreator) {
        return ResponseHelper.forbidden(res, 'Only the decision owner or an admin can edit this decision');
      }

      const data = Validator.validateUpdateDecision(req.body);
      const updatePayload = { ROWID: decisionId };
      if (data.title !== undefined) updatePayload.title = data.title;
      if (data.description !== undefined) updatePayload.description = data.description;
      if (data.decision_date !== undefined) updatePayload.decision_date = data.decision_date;
      if (data.rationale !== undefined) updatePayload.rationale = data.rationale;
      if (data.impact !== undefined) updatePayload.impact = data.impact;
      if (data.status !== undefined) updatePayload.status = data.status;

      await this.db.update(TABLES.DECISIONS, updatePayload);
      return ResponseHelper.success(res, { decisionId, updated: data });
    } catch (err) {
      if (err.isValidation) return ResponseHelper.validationError(res, err.message, err.details);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * DELETE /api/decisions/:decisionId
   */
  async deleteDecision(req, res) {
    try {
      const { tenantId, id: userId, role } = req.currentUser;
      const { decisionId } = req.params;

      const existing = await this.db.findById(TABLES.DECISIONS, decisionId, tenantId);
      if (!existing || existing.deleted_at) return ResponseHelper.notFound(res, 'Decision not found');

      // Same creator-or-admin guard as updateDecision.
      const isAdmin   = role === 'TENANT_ADMIN' || role === 'SUPER_ADMIN';
      const isCreator = String(existing.made_by) === String(userId);
      if (!isAdmin && !isCreator) {
        return ResponseHelper.forbidden(res, 'Only the decision owner or an admin can delete this decision');
      }

      await this.db.softDelete(TABLES.DECISIONS, decisionId, userId);
      await this.audit.log({ tenantId, entityType: 'DECISION', entityId: decisionId, action: AUDIT_ACTION.DELETE, oldValue: { title: existing.title }, newValue: { soft: true }, performedBy: userId });
      return ResponseHelper.success(res, null, 'Decision moved to Recycle Bin');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = DecisionController;
