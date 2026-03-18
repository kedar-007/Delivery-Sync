'use strict';

const DataStoreService = require('../services/DataStoreService');
const ResponseHelper = require('../utils/ResponseHelper');
const Validator = require('../utils/Validator');
const { TABLES } = require('../utils/Constants');

/**
 * DecisionController – decision log management.
 */
class DecisionController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
  }

  /**
   * POST /api/decisions
   */
  async createDecision(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const data = Validator.validateCreateDecision(req.body);

      const project = await this.db.findById(TABLES.PROJECTS, data.project_id, tenantId);
      if (!project) return ResponseHelper.notFound(res, 'Project not found');

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
      const { tenantId } = req.currentUser;
      const { projectId, status } = req.query;

      const conditions = [];
      if (projectId) conditions.push(`project_id = '${DataStoreService.escape(projectId)}'`);
      if (status) conditions.push(`status = '${DataStoreService.escape(status)}'`);

      const decisions = await this.db.findWhere(TABLES.DECISIONS, tenantId,
        conditions.length > 0 ? conditions.join(' AND ') : null,
        { orderBy: 'decision_date DESC', limit: 100 });

      return ResponseHelper.success(res, {
        decisions: decisions.map((d) => ({
          id: String(d.ROWID), projectId: d.project_id, title: d.title,
          description: d.description, decisionDate: d.decision_date,
          madeBy: d.made_by, impact: d.impact, rationale: d.rationale,
          status: d.status,
        })),
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
      const { tenantId } = req.currentUser;
      const { decisionId } = req.params;

      const existing = await this.db.findById(TABLES.DECISIONS, decisionId, tenantId);
      if (!existing) return ResponseHelper.notFound(res, 'Decision not found');

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
      const { tenantId } = req.currentUser;
      const { decisionId } = req.params;

      const existing = await this.db.findById(TABLES.DECISIONS, decisionId, tenantId);
      if (!existing) return ResponseHelper.notFound(res, 'Decision not found');

      await this.db.delete(TABLES.DECISIONS, decisionId);
      return ResponseHelper.success(res, null, 'Decision deleted');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = DecisionController;
