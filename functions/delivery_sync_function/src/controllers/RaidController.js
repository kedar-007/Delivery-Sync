'use strict';

const DataStoreService = require('../services/DataStoreService');
const ResponseHelper = require('../utils/ResponseHelper');
const Validator = require('../utils/Validator');
const { TABLES } = require('../utils/Constants');

/**
 * RaidController – Risks, Issues, Dependencies, Assumptions (RAID register).
 */
class RaidController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
  }

  // ─── RISKS ───────────────────────────────────────────────────────────────────

  async createRisk(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const data = Validator.validateCreateRisk(req.body);

      const project = await this.db.findById(TABLES.PROJECTS, data.project_id, tenantId);
      if (!project) return ResponseHelper.notFound(res, 'Project not found');

      const riskPayload = {
        tenant_id: tenantId,
        project_id: data.project_id,
        title: data.title,
        probability: data.probability,
        impact: data.impact,
        owner_user_id: data.owner_user_id,
        status: 'OPEN',
      };
      if (data.description) riskPayload.description = data.description;
      if (data.mitigation) riskPayload.mitigation = data.mitigation;
      if (userId) riskPayload.created_by = userId;
      const risk = await this.db.insert(TABLES.RISKS, riskPayload);

      return ResponseHelper.created(res, { risk: { id: String(risk.ROWID), ...data, status: 'OPEN' } });
    } catch (err) {
      if (err.isValidation) return ResponseHelper.validationError(res, err.message, err.details);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  async updateRisk(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { riskId } = req.params;

      const existing = await this.db.findById(TABLES.RISKS, riskId, tenantId);
      if (!existing) return ResponseHelper.notFound(res, 'Risk not found');

      const { title, description, probability, impact, mitigation, status, owner_user_id } = req.body;
      const updatePayload = { ROWID: riskId };
      if (title) updatePayload.title = title;
      if (description !== undefined) updatePayload.description = description;
      if (probability) updatePayload.probability = probability;
      if (impact) updatePayload.impact = impact;
      if (mitigation !== undefined) updatePayload.mitigation = mitigation;
      if (status) updatePayload.status = status;
      if (owner_user_id) updatePayload.owner_user_id = owner_user_id;

      await this.db.update(TABLES.RISKS, updatePayload);
      return ResponseHelper.success(res, { riskId, updated: updatePayload });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  async listRisks(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { projectId, status } = req.query;

      const conditions = [];
      if (projectId) conditions.push(`project_id = '${DataStoreService.escape(projectId)}'`);
      if (status) conditions.push(`status = '${DataStoreService.escape(status)}'`);

      const risks = await this.db.findWhere(TABLES.RISKS, tenantId,
        conditions.length > 0 ? conditions.join(' AND ') : null,
        { orderBy: 'CREATEDTIME DESC', limit: 100 });

      return ResponseHelper.success(res, {
        risks: risks.map((r) => ({
          id: String(r.ROWID), projectId: r.project_id, title: r.title,
          description: r.description, probability: r.probability, impact: r.impact,
          mitigation: r.mitigation, ownerUserId: r.owner_user_id, status: r.status,
        })),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ─── ISSUES ───────────────────────────────────────────────────────────────────

  async createIssue(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const data = Validator.validateCreateIssue(req.body);

      const issuePayload = {
        tenant_id: tenantId,
        project_id: data.project_id,
        title: data.title,
        severity: data.severity,
        owner_user_id: data.owner_user_id,
        status: 'OPEN',
      };
      if (data.description) issuePayload.description = data.description;
      if (userId) issuePayload.created_by = userId;
      const issue = await this.db.insert(TABLES.ISSUES, issuePayload);

      return ResponseHelper.created(res, { issue: { id: String(issue.ROWID), ...data, status: 'OPEN' } });
    } catch (err) {
      if (err.isValidation) return ResponseHelper.validationError(res, err.message, err.details);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  async updateIssue(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { issueId } = req.params;

      const existing = await this.db.findById(TABLES.ISSUES, issueId, tenantId);
      if (!existing) return ResponseHelper.notFound(res, 'Issue not found');

      const { title, description, severity, status, owner_user_id } = req.body;
      const updatePayload = { ROWID: issueId };
      if (title) updatePayload.title = title;
      if (description !== undefined) updatePayload.description = description;
      if (severity) updatePayload.severity = severity;
      if (status) updatePayload.status = status;
      if (owner_user_id) updatePayload.owner_user_id = owner_user_id;

      await this.db.update(TABLES.ISSUES, updatePayload);
      return ResponseHelper.success(res, { issueId, updated: updatePayload });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  async listIssues(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { projectId, status, severity } = req.query;

      const conditions = [];
      if (projectId) conditions.push(`project_id = '${DataStoreService.escape(projectId)}'`);
      if (status) conditions.push(`status = '${DataStoreService.escape(status)}'`);
      if (severity) conditions.push(`severity = '${DataStoreService.escape(severity)}'`);

      const issues = await this.db.findWhere(TABLES.ISSUES, tenantId,
        conditions.length > 0 ? conditions.join(' AND ') : null,
        { orderBy: 'CREATEDTIME DESC', limit: 100 });

      return ResponseHelper.success(res, {
        issues: issues.map((i) => ({
          id: String(i.ROWID), projectId: i.project_id, title: i.title,
          description: i.description, severity: i.severity,
          ownerUserId: i.owner_user_id, status: i.status,
        })),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ─── DEPENDENCIES ──────────────────────────────────────────────────────────

  async createDependency(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const data = Validator.validateCreateDependency(req.body);

      const depPayload = {
        tenant_id: tenantId,
        project_id: data.project_id,
        title: data.title,
        dependency_type: data.dependency_type,
        owner_user_id: data.owner_user_id,
        status: 'PENDING',
      };
      if (data.description) depPayload.description = data.description;
      if (data.dependent_on) depPayload.dependent_on = data.dependent_on;
      if (data.due_date) depPayload.due_date = data.due_date;
      if (userId) depPayload.created_by = userId;
      const dep = await this.db.insert(TABLES.DEPENDENCIES, depPayload);

      return ResponseHelper.created(res, { dependency: { id: String(dep.ROWID), ...data, status: 'PENDING' } });
    } catch (err) {
      if (err.isValidation) return ResponseHelper.validationError(res, err.message, err.details);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  async listDependencies(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { projectId, status } = req.query;

      const conditions = [];
      if (projectId) conditions.push(`project_id = '${DataStoreService.escape(projectId)}'`);
      if (status) conditions.push(`status = '${DataStoreService.escape(status)}'`);

      const deps = await this.db.findWhere(TABLES.DEPENDENCIES, tenantId,
        conditions.length > 0 ? conditions.join(' AND ') : null,
        { orderBy: 'CREATEDTIME DESC', limit: 100 });

      return ResponseHelper.success(res, {
        dependencies: deps.map((d) => ({
          id: String(d.ROWID), projectId: d.project_id, title: d.title,
          description: d.description, dependencyType: d.dependency_type,
          dependentOn: d.dependent_on, dueDate: d.due_date,
          ownerUserId: d.owner_user_id, status: d.status,
        })),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  async updateDependency(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { dependencyId } = req.params;

      const existing = await this.db.findById(TABLES.DEPENDENCIES, dependencyId, tenantId);
      if (!existing) return ResponseHelper.notFound(res, 'Dependency not found');

      const { status, title, description, due_date } = req.body;
      const updatePayload = { ROWID: dependencyId };
      if (title) updatePayload.title = title;
      if (description !== undefined) updatePayload.description = description;
      if (status) updatePayload.status = status;
      if (due_date) updatePayload.due_date = due_date;

      await this.db.update(TABLES.DEPENDENCIES, updatePayload);
      return ResponseHelper.success(res, { dependencyId, updated: updatePayload });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ─── ASSUMPTIONS ──────────────────────────────────────────────────────────

  async createAssumption(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const data = Validator.validateCreateAssumption(req.body);

      const assumptionPayload = {
        tenant_id: tenantId,
        project_id: data.project_id,
        title: data.title,
        owner_user_id: data.owner_user_id,
        status: 'VALID',
      };
      if (data.description) assumptionPayload.description = data.description;
      if (data.impact_if_wrong) assumptionPayload.impact_if_wrong = data.impact_if_wrong;
      if (userId) assumptionPayload.created_by = userId;
      const assumption = await this.db.insert(TABLES.ASSUMPTIONS, assumptionPayload);

      return ResponseHelper.created(res, {
        assumption: { id: String(assumption.ROWID), ...data, status: 'VALID' },
      });
    } catch (err) {
      if (err.isValidation) return ResponseHelper.validationError(res, err.message, err.details);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  async listAssumptions(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { projectId, status } = req.query;

      const conditions = [];
      if (projectId) conditions.push(`project_id = '${DataStoreService.escape(projectId)}'`);
      if (status) conditions.push(`status = '${DataStoreService.escape(status)}'`);

      const assumptions = await this.db.findWhere(TABLES.ASSUMPTIONS, tenantId,
        conditions.length > 0 ? conditions.join(' AND ') : null,
        { orderBy: 'CREATEDTIME DESC', limit: 100 });

      return ResponseHelper.success(res, {
        assumptions: assumptions.map((a) => ({
          id: String(a.ROWID), projectId: a.project_id, title: a.title,
          description: a.description, impactIfWrong: a.impact_if_wrong,
          ownerUserId: a.owner_user_id, status: a.status,
        })),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  async updateAssumption(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { assumptionId } = req.params;

      const existing = await this.db.findById(TABLES.ASSUMPTIONS, assumptionId, tenantId);
      if (!existing) return ResponseHelper.notFound(res, 'Assumption not found');

      const { title, description, status, impact_if_wrong } = req.body;
      const updatePayload = { ROWID: assumptionId };
      if (title) updatePayload.title = title;
      if (description !== undefined) updatePayload.description = description;
      if (status) updatePayload.status = status;
      if (impact_if_wrong !== undefined) updatePayload.impact_if_wrong = impact_if_wrong;

      await this.db.update(TABLES.ASSUMPTIONS, updatePayload);
      return ResponseHelper.success(res, { assumptionId, updated: updatePayload });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = RaidController;
