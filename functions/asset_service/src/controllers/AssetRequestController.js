'use strict';
const DataStoreService    = require('../services/DataStoreService');
const AuditService        = require('../services/AuditService');
const NotificationService = require('../services/NotificationService');
const ResponseHelper      = require('../utils/ResponseHelper');
const { TABLES, ASSET_STATUS, ASSET_REQ_STATUS, AUDIT_ACTION, NOTIFICATION_TYPE } = require('../utils/Constants');

class AssetRequestController {
  constructor(catalystApp) {
    this.db    = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
    this.notif = new NotificationService(catalystApp, this.db);
  }

  async list(req, res) {
    const me = req.currentUser;
    const { status } = req.query;
    let where = me.role === 'TEAM_MEMBER' ? `requested_by = '${me.id}'` : '';
    if (status) where += (where ? ' AND ' : '') + `status = '${DataStoreService.escape(status)}'`;
    const requests = await this.db.findWhere(TABLES.ASSET_REQUESTS, req.tenantId, where, { orderBy: 'CREATEDTIME DESC', limit: 100 });
    return ResponseHelper.success(res, requests);
  }

  async create(req, res) {
    const { category_id, reason, urgency, priority, asset_id, needed_by, notes } = req.body;
    if (!category_id || !reason) return ResponseHelper.validationError(res, 'category_id and reason required');
    const insertData = {
      tenant_id:    String(req.tenantId),
      requested_by: String(req.currentUser.id),
      category_id:  String(category_id),
      reason,
      urgency:      priority || urgency || 'NORMAL',
      status:       ASSET_REQ_STATUS.PENDING,
    };
    // Only set asset_id if a specific asset was chosen (avoid FK '0' violation)
    if (asset_id && String(asset_id) !== '0') insertData.asset_id = String(asset_id);
    if (needed_by) insertData.needed_by = needed_by;
    if (notes)     insertData.notes     = notes;
    const row = await this.db.insert(TABLES.ASSET_REQUESTS, insertData);
    await this.notif.sendInApp({ tenantId: req.tenantId, userId: req.currentUser.id, title: 'Asset Request Submitted', message: `Your asset request has been submitted`, type: NOTIFICATION_TYPE.ASSET_REQUEST_RAISED, entityType: 'ASSET_REQUEST', entityId: row.ROWID });
    await this.audit.log({ tenantId: req.tenantId, entityType: 'ASSET_REQUEST', entityId: row.ROWID, action: AUDIT_ACTION.CREATE, newValue: row, performedBy: req.currentUser.id });
    return ResponseHelper.created(res, row);
  }

  async approve(req, res) {
    const req_ = await this.db.findById(TABLES.ASSET_REQUESTS, req.params.requestId, req.tenantId);
    if (!req_) return ResponseHelper.notFound(res, 'Request not found');
    if (req_.status !== ASSET_REQ_STATUS.PENDING) return ResponseHelper.validationError(res, 'Only PENDING requests can be approved');
    await this.db.update(TABLES.ASSET_REQUESTS, { ROWID: req.params.requestId, status: ASSET_REQ_STATUS.APPROVED, approved_by: String(req.currentUser.id), approved_at: DataStoreService.fmtDT(new Date()) });
    const userRows = await this.db.query(`SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = '${req_.requested_by}' LIMIT 1`);
    if (userRows[0]) {
      await this.notif.sendInApp({ tenantId: req.tenantId, userId: req_.requested_by, title: 'Asset Request Approved', message: 'Your asset request has been approved', type: NOTIFICATION_TYPE.ASSET_REQUEST_APPROVED, entityType: 'ASSET_REQUEST', entityId: req.params.requestId });
    }
    await this.audit.log({ tenantId: req.tenantId, entityType: 'ASSET_REQUEST', entityId: req.params.requestId, action: AUDIT_ACTION.APPROVE, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, { message: 'Approved' });
  }

  async reject(req, res) {
    const req_ = await this.db.findById(TABLES.ASSET_REQUESTS, req.params.requestId, req.tenantId);
    if (!req_) return ResponseHelper.notFound(res, 'Request not found');
    await this.db.update(TABLES.ASSET_REQUESTS, { ROWID: req.params.requestId, status: ASSET_REQ_STATUS.REJECTED });
    const userRows = await this.db.query(`SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = '${req_.requested_by}' LIMIT 1`);
    if (userRows[0]) {
      await this.notif.sendInApp({ tenantId: req.tenantId, userId: req_.requested_by, title: 'Asset Request Rejected', message: 'Your asset request was rejected', type: NOTIFICATION_TYPE.ASSET_REQUEST_REJECTED, entityType: 'ASSET_REQUEST', entityId: req.params.requestId });
    }
    await this.audit.log({ tenantId: req.tenantId, entityType: 'ASSET_REQUEST', entityId: req.params.requestId, action: AUDIT_ACTION.REJECT, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, { message: 'Rejected' });
  }

  async fulfill(req, res) {
    const { asset_id, fulfillment_notes } = req.body;
    if (!asset_id) return ResponseHelper.validationError(res, 'asset_id required');
    const req_ = await this.db.findById(TABLES.ASSET_REQUESTS, req.params.requestId, req.tenantId);
    if (!req_) return ResponseHelper.notFound(res, 'Request not found');
    if (req_.status !== ASSET_REQ_STATUS.APPROVED) return ResponseHelper.validationError(res, 'Only APPROVED requests can be fulfilled');
    const asset = await this.db.findById(TABLES.ASSETS, asset_id, req.tenantId);
    if (!asset || asset.status !== ASSET_STATUS.AVAILABLE) return ResponseHelper.validationError(res, 'Asset not available');

    // Assign asset — use asset_condition (correct column name)
    await this.db.update(TABLES.ASSETS, { ROWID: asset_id, status: ASSET_STATUS.ASSIGNED, assigned_to: String(req_.requested_by), assigned_at: DataStoreService.fmtDT(new Date()) });
    await this.db.insert(TABLES.ASSET_ASSIGNMENTS, {
      tenant_id:              String(req.tenantId),
      asset_id:               String(asset_id),
      user_id:                String(req_.requested_by),
      assigned_by:            String(req.currentUser.id),
      request_id:             String(req.params.requestId),
      assigned_date:          DataStoreService.fmtDT(new Date()),
      condition_at_assignment: asset.asset_condition || 'GOOD',
    });
    await this.db.update(TABLES.ASSET_REQUESTS, { ROWID: req.params.requestId, status: ASSET_REQ_STATUS.FULFILLED, asset_id: String(asset_id), fulfilled_by: String(req.currentUser.id), fulfilled_at: DataStoreService.fmtDT(new Date()), fulfillment_notes: fulfillment_notes || '' });

    await this.notif.sendInApp({ tenantId: req.tenantId, userId: req_.requested_by, title: 'Asset Assigned', message: `"${asset.name}" has been assigned to you`, type: NOTIFICATION_TYPE.ASSET_ASSIGNED, entityType: 'ASSET', entityId: asset_id });
    await this.audit.log({ tenantId: req.tenantId, entityType: 'ASSET_REQUEST', entityId: req.params.requestId, action: AUDIT_ACTION.ASSIGN, newValue: { asset_id, fulfilled_by: req.currentUser.id }, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, { message: 'Asset fulfilled and assigned' });
  }
}

module.exports = AssetRequestController;
