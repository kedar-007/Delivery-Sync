'use strict';
const DataStoreService = require('../services/DataStoreService');
const AuditService     = require('../services/AuditService');
const ResponseHelper   = require('../utils/ResponseHelper');
const { TABLES, ASSET_STATUS, AUDIT_ACTION } = require('../utils/Constants');

class AssignmentController {
  constructor(catalystApp) {
    this.db    = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
  }

  async list(req, res) {
    const { user_id, asset_id } = req.query;
    let where = '';
    if (user_id)  where += `user_id = '${DataStoreService.escape(user_id)}' AND `;
    if (asset_id) where += `asset_id = '${DataStoreService.escape(asset_id)}' AND `;
    where = where.replace(/ AND $/, '');
    const assignments = await this.db.findWhere(TABLES.ASSET_ASSIGNMENTS, req.tenantId, where, { orderBy: 'CREATEDTIME DESC', limit: 100 });
    return ResponseHelper.success(res, assignments);
  }

  async create(req, res) {
    const { asset_id, user_id, expected_return_date, assignment_notes } = req.body;
    if (!asset_id || !user_id) return ResponseHelper.validationError(res, 'asset_id and user_id required');
    const asset = await this.db.findById(TABLES.ASSETS, asset_id, req.tenantId);
    if (!asset || asset.status !== ASSET_STATUS.AVAILABLE) return ResponseHelper.validationError(res, 'Asset not available');

    await this.db.update(TABLES.ASSETS, { ROWID: asset_id, status: ASSET_STATUS.ASSIGNED, assigned_to: String(user_id), assigned_at: DataStoreService.fmtDT(new Date()) });

    const insertData = {
      tenant_id:              String(req.tenantId),
      asset_id:               String(asset_id),
      user_id:                String(user_id),
      assigned_by:            String(req.currentUser.id),
      request_id:             '0',
      assigned_date:          DataStoreService.fmtDT(new Date()),
      condition_at_assignment: asset.asset_condition || 'GOOD',
    };
    if (expected_return_date) insertData.expected_return_date = expected_return_date;

    const row = await this.db.insert(TABLES.ASSET_ASSIGNMENTS, insertData);
    await this.audit.log({ tenantId: req.tenantId, entityType: 'ASSET_ASSIGNMENT', entityId: row.ROWID, action: AUDIT_ACTION.ASSIGN, newValue: row, performedBy: req.currentUser.id });
    return ResponseHelper.created(res, row);
  }

  async returnAsset(req, res) {
    const { condition_at_return, return_notes } = req.body;
    const assignment = await this.db.findById(TABLES.ASSET_ASSIGNMENTS, req.params.assignmentId, req.tenantId);
    if (!assignment) return ResponseHelper.notFound(res, 'Assignment not found');
    if (assignment.is_active !== 'true') return ResponseHelper.validationError(res, 'Assignment already returned');
    await this.db.update(TABLES.ASSET_ASSIGNMENTS, { ROWID: req.params.assignmentId, returned_date: DataStoreService.fmtDT(new Date()) });
    // Clear asset assignment — use empty string for assigned_at (Date column)
    await this.db.update(TABLES.ASSETS, { ROWID: assignment.asset_id, status: ASSET_STATUS.AVAILABLE, assigned_to: '0' });
    await this.audit.log({ tenantId: req.tenantId, entityType: 'ASSET_ASSIGNMENT', entityId: req.params.assignmentId, action: AUDIT_ACTION.RETURN, newValue: { returned: true }, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, { message: 'Asset returned' });
  }
}

module.exports = AssignmentController;
