'use strict';
const DataStoreService = require('../services/DataStoreService');
const AuditService     = require('../services/AuditService');
const ResponseHelper   = require('../utils/ResponseHelper');
const { TABLES, AUDIT_ACTION } = require('../utils/Constants');

class WorkflowController {
  constructor(catalystApp) {
    this.db    = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
  }

  async list(req, res) {
    const { entity_type } = req.query;
    let where = '';
    if (entity_type) where = `entity_type = '${DataStoreService.escape(entity_type)}'`;
    const workflows = await this.db.findWhere(TABLES.WORKFLOW_CONFIGS, req.tenantId, where, { orderBy: 'CREATEDTIME DESC', limit: 50 });
    return ResponseHelper.success(res, workflows.map(w => ({
      ...w,
      statuses:    this._parse(w.statuses, []),
      transitions: this._parse(w.transitions, []),
    })));
  }

  async create(req, res) {
    const { entity_type, name, statuses, transitions, is_default } = req.body;
    if (!entity_type || !name || !statuses) return ResponseHelper.validationError(res, 'entity_type, name and statuses required');
    const row = await this.db.insert(TABLES.WORKFLOW_CONFIGS, {
      tenant_id: req.tenantId, entity_type, name,
      statuses: JSON.stringify(statuses), transitions: JSON.stringify(transitions || []),
      is_default: is_default ? 'true' : 'false', is_active: 'true', created_by: req.currentUser.id,
    });
    await this.audit.log({ tenantId: req.tenantId, entityType: 'WORKFLOW_CONFIG', entityId: row.ROWID, action: AUDIT_ACTION.CREATE, newValue: { name, entity_type }, performedBy: req.currentUser.id });
    return ResponseHelper.created(res, row);
  }

  async update(req, res) {
    const wf = await this.db.findById(TABLES.WORKFLOW_CONFIGS, req.params.workflowId, req.tenantId);
    if (!wf) return ResponseHelper.notFound(res, 'Workflow not found');
    const updates = {};
    if (req.body.name)        updates.name        = req.body.name;
    if (req.body.statuses)    updates.statuses    = JSON.stringify(req.body.statuses);
    if (req.body.transitions) updates.transitions = JSON.stringify(req.body.transitions);
    if (req.body.is_active !== undefined) updates.is_active = req.body.is_active ? 'true' : 'false';
    const updated = await this.db.update(TABLES.WORKFLOW_CONFIGS, { ROWID: req.params.workflowId, ...updates });
    return ResponseHelper.success(res, updated);
  }

  async remove(req, res) {
    const wf = await this.db.findById(TABLES.WORKFLOW_CONFIGS, req.params.workflowId, req.tenantId);
    if (!wf) return ResponseHelper.notFound(res, 'Workflow not found');
    await this.db.delete(TABLES.WORKFLOW_CONFIGS, req.params.workflowId);
    return ResponseHelper.success(res, { message: 'Deleted' });
  }

  async activate(req, res) {
    const wf = await this.db.findById(TABLES.WORKFLOW_CONFIGS, req.params.workflowId, req.tenantId);
    if (!wf) return ResponseHelper.notFound(res, 'Workflow not found');
    // Deactivate other defaults for same entity_type
    const others = await this.db.findWhere(TABLES.WORKFLOW_CONFIGS, req.tenantId, `entity_type = '${DataStoreService.escape(wf.entity_type)}' AND is_default = 'true'`, { limit: 20 });
    for (const o of others) await this.db.update(TABLES.WORKFLOW_CONFIGS, { ROWID: o.ROWID, is_default: 'false' });
    await this.db.update(TABLES.WORKFLOW_CONFIGS, { ROWID: req.params.workflowId, is_default: 'true', is_active: 'true' });
    return ResponseHelper.success(res, { message: 'Set as default workflow' });
  }

  _parse(val, fallback) {
    try { return val ? JSON.parse(val) : fallback; } catch { return fallback; }
  }
}

module.exports = WorkflowController;
