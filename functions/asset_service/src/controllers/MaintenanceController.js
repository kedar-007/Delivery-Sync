'use strict';
const DataStoreService = require('../services/DataStoreService');
const AuditService     = require('../services/AuditService');
const NotificationService = require('../services/NotificationService');
const ResponseHelper   = require('../utils/ResponseHelper');
const { TABLES, ASSET_STATUS, AUDIT_ACTION, NOTIFICATION_TYPE } = require('../utils/Constants');

class MaintenanceController {
  constructor(catalystApp) {
    this.db    = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
    this.notif = new NotificationService(catalystApp, this.db);
  }

  async list(req, res) {
    const { asset_id, status } = req.query;
    let where = '';
    if (asset_id) where += `asset_id = '${DataStoreService.escape(asset_id)}' AND `;
    if (status)   where += `status = '${DataStoreService.escape(status)}' AND `;
    where = where.replace(/ AND $/, '');
    const records = await this.db.findWhere(TABLES.ASSET_MAINTENANCE, req.tenantId, where, { orderBy: 'scheduled_date ASC', limit: 100 });
    return ResponseHelper.success(res, records);
  }

  async schedule(req, res) {
    const { asset_id, type, description, scheduled_date, cost } = req.body;
    if (!asset_id || !type || !scheduled_date) return ResponseHelper.validationError(res, 'asset_id, type and scheduled_date required');
    const asset = await this.db.findById(TABLES.ASSETS, asset_id, req.tenantId);
    if (!asset) return ResponseHelper.notFound(res, 'Asset not found');
    await this.db.update(TABLES.ASSETS, { ROWID: asset_id, status: ASSET_STATUS.MAINTENANCE });
    const row = await this.db.insert(TABLES.ASSET_MAINTENANCE, { tenant_id: String(req.tenantId), asset_id: String(asset_id), type, description: description || '', scheduled_date, cost: String(cost || 0), performed_by: '0', status: 'SCHEDULED', created_by: String(req.currentUser.id) });
    await this.audit.log({ tenantId: req.tenantId, entityType: 'ASSET_MAINTENANCE', entityId: row.ROWID, action: AUDIT_ACTION.CREATE, newValue: row, performedBy: req.currentUser.id });
    return ResponseHelper.created(res, row);
  }

  async complete(req, res) {
    const record = await this.db.findById(TABLES.ASSET_MAINTENANCE, req.params.id, req.tenantId);
    if (!record) return ResponseHelper.notFound(res, 'Maintenance record not found');
    await this.db.update(TABLES.ASSET_MAINTENANCE, { ROWID: req.params.id, status: 'COMPLETED', completed_date: DataStoreService.fmtDT(new Date()), performed_by: req.currentUser.id });
    await this.db.update(TABLES.ASSETS, { ROWID: record.asset_id, status: ASSET_STATUS.AVAILABLE });
    return ResponseHelper.success(res, { message: 'Maintenance completed' });
  }
}

module.exports = MaintenanceController;
