'use strict';
const DataStoreService    = require('../services/DataStoreService');
const AuditService        = require('../services/AuditService');
const NotificationService = require('../services/NotificationService');
const ResponseHelper      = require('../utils/ResponseHelper');
const {
  TABLES, ASSET_STATUS, ASSET_REQ_STATUS, AUDIT_ACTION, NOTIFICATION_TYPE, PERMISSIONS,
} = require('../utils/Constants');

class AssetRequestController {
  constructor(catalystApp) {
    this.db    = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
    this.notif = new NotificationService(catalystApp, this.db);
  }

  _hasPerm(user, perm) {
    return Array.isArray(user.permissions) && user.permissions.includes(perm);
  }

  // ── GET /requests ─────────────────────────────────────────────────────────────
  async list(req, res) {
    const me = req.currentUser;
    const { status } = req.query;

    const canSeeAll = this._hasPerm(me, PERMISSIONS.ASSET_APPROVE) || this._hasPerm(me, PERMISSIONS.ASSET_ADMIN);
    const canSeeOpsQueue = this._hasPerm(me, PERMISSIONS.ASSET_ASSIGN);

    let visWhere = '';
    if (!canSeeAll) {
      // Own requests OR requests where this user is in the ops_assignees list
      if (canSeeOpsQueue) {
        visWhere = `(requested_by = '${me.id}' OR ops_assignees LIKE '%"${me.id}"%')`;
      } else {
        visWhere = `(requested_by = '${me.id}' OR ops_assignees LIKE '%"${me.id}"%')`;
      }
    }

    let where = visWhere;
    if (status) where += (where ? ' AND ' : '') + `status = '${DataStoreService.escape(status)}'`;

    const requests = await this.db.findWhere(
      TABLES.ASSET_REQUESTS, req.tenantId, where,
      { orderBy: 'CREATEDTIME DESC', limit: 200 },
    );
    if (!requests.length) return ResponseHelper.success(res, []);

    // Collect all user IDs for batch enrichment
    const allOpsIds = requests.flatMap((r) => {
      try { return JSON.parse(r.ops_assignees || '[]'); } catch { return []; }
    });
    const userIds = [...new Set([
      ...requests.map((r) => r.requested_by),
      ...requests.map((r) => r.approved_by),
      ...requests.map((r) => r.handover_by),
      ...allOpsIds,
    ].filter(Boolean))];
    const categoryIds = [...new Set(requests.map((r) => r.category_id).filter(Boolean))];
    const assetIds    = [...new Set(requests.map((r) => r.asset_id).filter(Boolean))];

    const [users, categories, assets] = await Promise.all([
      userIds.length
        ? this.db.query(`SELECT ROWID, name, email, avatar_url FROM ${TABLES.USERS} WHERE ROWID IN (${userIds.map((id) => `'${id}'`).join(',')}) LIMIT 300`)
        : [],
      categoryIds.length
        ? this.db.query(`SELECT ROWID, name FROM ${TABLES.ASSET_CATEGORIES} WHERE ROWID IN (${categoryIds.map((id) => `'${id}'`).join(',')}) LIMIT 100`)
        : [],
      assetIds.length
        ? this.db.query(`SELECT ROWID, name, asset_tag FROM ${TABLES.ASSETS} WHERE ROWID IN (${assetIds.map((id) => `'${id}'`).join(',')}) LIMIT 100`)
        : [],
    ]);

    const userMap  = Object.fromEntries(users.map((u) => [String(u.ROWID), u]));
    const catMap   = Object.fromEntries(categories.map((c) => [String(c.ROWID), c]));
    const assetMap = Object.fromEntries(assets.map((a) => [String(a.ROWID), a]));

    const enriched = requests.map((r) => {
      const user        = userMap[String(r.requested_by)] ?? {};
      const approver    = userMap[String(r.approved_by)]  ?? {};
      const handoverUsr = userMap[String(r.handover_by)]  ?? {};
      const cat         = catMap[String(r.category_id)]   ?? {};
      const asset       = assetMap[String(r.asset_id)]    ?? {};

      // Parse embedded needed_by / notes from reason field
      let cleanReason = r.reason ?? '';
      let neededBy = null, reqNotes = null;
      const nbMatch    = cleanReason.match(/\nNeeded by: (.+?)(?:\n|$)/);
      const notesMatch = cleanReason.match(/\nNotes: (.+?)(?:\n|$)/s);
      if (nbMatch)    { neededBy  = nbMatch[1].trim();    cleanReason = cleanReason.replace(nbMatch[0], ''); }
      if (notesMatch) { reqNotes  = notesMatch[1].trim(); cleanReason = cleanReason.replace(notesMatch[0], ''); }

      // Resolve ops assignees to user details
      let opsIds = [];
      try { opsIds = JSON.parse(r.ops_assignees || '[]'); } catch { opsIds = []; }
      const opsAssigneeDetails = opsIds
        .map((id) => userMap[String(id)])
        .filter(Boolean)
        .map((u) => ({ id: String(u.ROWID), name: u.name, email: u.email, avatarUrl: u.avatar_url }));

      return {
        ...r,
        reason:                cleanReason.trim(),
        needed_by:             neededBy,
        req_notes:             reqNotes,
        ops_assignees:         opsIds,
        ops_assignee_details:  opsAssigneeDetails,
        requested_by_name:     user.name      ?? null,
        requested_by_email:    user.email     ?? null,
        requested_by_avatar:   user.avatar_url ?? null,
        approved_by_name:      approver.name   ?? null,
        handover_by_name:      handoverUsr.name ?? null,
        category_name:         cat.name   ?? null,
        asset_name:            asset.name ?? null,
        asset_tag:             asset.asset_tag ?? null,
      };
    });

    return ResponseHelper.success(res, enriched);
  }

  // ── POST /requests ────────────────────────────────────────────────────────────
  async create(req, res) {
    const { category_id, reason, urgency, priority, asset_id, needed_by, notes } = req.body;
    if (!category_id || !reason) return ResponseHelper.validationError(res, 'category_id and reason required');

    let fullReason = String(reason);
    if (needed_by) fullReason += `\nNeeded by: ${needed_by}`;
    if (notes)     fullReason += `\nNotes: ${notes}`;

    const insertData = {
      tenant_id:    String(req.tenantId),
      requested_by: String(req.currentUser.id),
      category_id:  String(category_id),
      reason:       fullReason,
      urgency:      priority || urgency || 'NORMAL',
      status:       ASSET_REQ_STATUS.PENDING,
    };
    if (asset_id && String(asset_id) !== '0') insertData.asset_id = String(asset_id);

    const row = await this.db.insert(TABLES.ASSET_REQUESTS, insertData);
    await this.notif.sendInApp({
      tenantId: req.tenantId, userId: req.currentUser.id,
      title: 'Asset Request Submitted',
      message: 'Your asset request has been submitted and is under review',
      type: NOTIFICATION_TYPE.ASSET_REQUEST_RAISED, entityType: 'ASSET_REQUEST', entityId: row.ROWID,
    });
    await this.audit.log({
      tenantId: req.tenantId, entityType: 'ASSET_REQUEST', entityId: row.ROWID,
      action: AUDIT_ACTION.CREATE, newValue: row, performedBy: req.currentUser.id,
    });
    return ResponseHelper.created(res, row);
  }

  // ── PATCH /requests/:id/approve ───────────────────────────────────────────────
  // Body: { ops_user_ids?: string[], ops_role_ids?: string[], approval_message?: string }
  async approve(req, res) {
    const { ops_user_ids = [], ops_role_ids = [], approval_message = '' } = req.body ?? {};
    const req_ = await this.db.findById(TABLES.ASSET_REQUESTS, req.params.requestId, req.tenantId);
    if (!req_) return ResponseHelper.notFound(res, 'Request not found');
    if (req_.status !== ASSET_REQ_STATUS.PENDING)
      return ResponseHelper.validationError(res, 'Only PENDING requests can be approved');

    // Expand org roles → user IDs
    const opsIds = [...ops_user_ids.map(String)];
    if (ops_role_ids.length) {
      const roleUsers = await this.db.query(
        `SELECT user_id FROM ${TABLES.USER_ORG_ROLES} WHERE org_role_id IN (${ops_role_ids.map((id) => `'${id}'`).join(',')}) AND tenant_id = '${req.tenantId}' AND is_active = 'true' LIMIT 300`,
      );
      opsIds.push(...roleUsers.map((u) => String(u.user_id)));
    }
    const uniqueOps = [...new Set(opsIds)].filter(Boolean);
    const newStatus = uniqueOps.length ? ASSET_REQ_STATUS.ASSIGNED_TO_OPS : ASSET_REQ_STATUS.APPROVED;

    const updateData = {
      ROWID: req.params.requestId,
      status: newStatus,
      approved_by: String(req.currentUser.id),
      approved_at: DataStoreService.fmtDT(new Date()),
    };
    if (uniqueOps.length) updateData.ops_assignees = JSON.stringify(uniqueOps);
    await this.db.update(TABLES.ASSET_REQUESTS, updateData);

    // Fetch names
    const [approverRows, requesterRows, catRows] = await Promise.all([
      this.db.query(`SELECT name FROM ${TABLES.USERS} WHERE ROWID = '${req.currentUser.id}' LIMIT 1`),
      this.db.query(`SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = '${req_.requested_by}' LIMIT 1`),
      this.db.query(`SELECT name FROM ${TABLES.ASSET_CATEGORIES} WHERE ROWID = '${req_.category_id}' LIMIT 1`),
    ]);
    const approverName   = approverRows[0]?.name   ?? 'Your manager';
    const requesterName  = requesterRows[0]?.name  ?? 'Team member';
    const categoryName   = catRows[0]?.name        ?? 'Asset';

    // Notify requester
    if (requesterRows[0]) {
      await this.notif.sendInApp({
        tenantId: req.tenantId, userId: req_.requested_by,
        title: 'Asset Request Approved',
        message: `${approverName} approved your asset request`,
        type: NOTIFICATION_TYPE.ASSET_REQUEST_APPROVED, entityType: 'ASSET_REQUEST', entityId: req.params.requestId,
      });
      await this.notif.send({
        toEmail: requesterRows[0].email,
        subject: '[Delivery Sync] Your asset request has been approved',
        htmlBody: this.notif._assetApprovedTemplate(requesterRows[0].name, approverName, categoryName, approval_message),
      });
    }

    // Notify ops team members
    if (uniqueOps.length) {
      const opsUserRows = await this.db.query(
        `SELECT ROWID, name, email FROM ${TABLES.USERS} WHERE ROWID IN (${uniqueOps.map((id) => `'${id}'`).join(',')}) LIMIT 200`,
      );
      for (const opsUser of opsUserRows) {
        await this.notif.sendInApp({
          tenantId: req.tenantId, userId: String(opsUser.ROWID),
          title: 'Asset Request — Action Required',
          message: `${approverName} assigned an asset request from ${requesterName} to you`,
          type: NOTIFICATION_TYPE.ASSET_OPS_ASSIGNED, entityType: 'ASSET_REQUEST', entityId: req.params.requestId,
        });
        await this.notif.send({
          toEmail: opsUser.email,
          subject: `[Delivery Sync] Asset request assigned — ${categoryName}`,
          htmlBody: this.notif._assetOpsAssignedTemplate(opsUser.name, approverName, requesterName, categoryName, approval_message),
        });
      }
    }

    await this.audit.log({
      tenantId: req.tenantId, entityType: 'ASSET_REQUEST', entityId: req.params.requestId,
      action: AUDIT_ACTION.APPROVE,
      newValue: { status: newStatus, ops_assignees: uniqueOps },
      performedBy: req.currentUser.id,
    });
    return ResponseHelper.success(res, { message: 'Approved', status: newStatus });
  }

  // ── PATCH /requests/:id/reject ────────────────────────────────────────────────
  async reject(req, res) {
    const req_ = await this.db.findById(TABLES.ASSET_REQUESTS, req.params.requestId, req.tenantId);
    if (!req_) return ResponseHelper.notFound(res, 'Request not found');
    if (![ASSET_REQ_STATUS.PENDING, ASSET_REQ_STATUS.APPROVED].includes(req_.status))
      return ResponseHelper.validationError(res, 'Request cannot be rejected at this stage');

    const { notes = '' } = req.body ?? {};
    await this.db.update(TABLES.ASSET_REQUESTS, {
      ROWID: req.params.requestId,
      status: ASSET_REQ_STATUS.REJECTED,
      rejection_notes: notes,
      rejected_by: String(req.currentUser.id),
      rejected_at: DataStoreService.fmtDT(new Date()),
    });
    const userRows = await this.db.query(`SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = '${req_.requested_by}' LIMIT 1`);
    if (userRows[0]) {
      await this.notif.sendInApp({
        tenantId: req.tenantId, userId: req_.requested_by,
        title: 'Asset Request Not Approved',
        message: 'Your asset request was not approved',
        type: NOTIFICATION_TYPE.ASSET_REQUEST_REJECTED, entityType: 'ASSET_REQUEST', entityId: req.params.requestId,
      });
    }
    await this.audit.log({
      tenantId: req.tenantId, entityType: 'ASSET_REQUEST', entityId: req.params.requestId,
      action: AUDIT_ACTION.REJECT, newValue: { notes }, performedBy: req.currentUser.id,
    });
    return ResponseHelper.success(res, { message: 'Rejected' });
  }

  // ── PATCH /requests/:id/assign-ops ────────────────────────────────────────────
  // Explicitly assign ops after approval (when not done at approve time)
  async assignOps(req, res) {
    const req_ = await this.db.findById(TABLES.ASSET_REQUESTS, req.params.requestId, req.tenantId);
    if (!req_) return ResponseHelper.notFound(res, 'Request not found');
    if (req_.status !== ASSET_REQ_STATUS.APPROVED)
      return ResponseHelper.validationError(res, 'Only APPROVED requests can be assigned to ops');

    const { ops_user_ids = [], ops_role_ids = [], message = '' } = req.body ?? {};
    const opsIds = [...ops_user_ids.map(String)];
    if (ops_role_ids.length) {
      const roleUsers = await this.db.query(
        `SELECT user_id FROM ${TABLES.USER_ORG_ROLES} WHERE org_role_id IN (${ops_role_ids.map((id) => `'${id}'`).join(',')}) AND tenant_id = '${req.tenantId}' AND is_active = 'true' LIMIT 300`,
      );
      opsIds.push(...roleUsers.map((u) => String(u.user_id)));
    }
    const uniqueOps = [...new Set(opsIds)].filter(Boolean);
    if (!uniqueOps.length) return ResponseHelper.validationError(res, 'At least one user or role must be selected');

    await this.db.update(TABLES.ASSET_REQUESTS, {
      ROWID: req.params.requestId,
      status: ASSET_REQ_STATUS.ASSIGNED_TO_OPS,
      ops_assignees: JSON.stringify(uniqueOps),
    });

    const [assignerRows, requesterRows, catRows] = await Promise.all([
      this.db.query(`SELECT name FROM ${TABLES.USERS} WHERE ROWID = '${req.currentUser.id}' LIMIT 1`),
      this.db.query(`SELECT name FROM ${TABLES.USERS} WHERE ROWID = '${req_.requested_by}' LIMIT 1`),
      this.db.query(`SELECT name FROM ${TABLES.ASSET_CATEGORIES} WHERE ROWID = '${req_.category_id}' LIMIT 1`),
    ]);
    const assignerName  = assignerRows[0]?.name  ?? 'A manager';
    const requesterName = requesterRows[0]?.name ?? 'Team member';
    const categoryName  = catRows[0]?.name       ?? 'Asset';

    const opsUserRows = await this.db.query(
      `SELECT ROWID, name, email FROM ${TABLES.USERS} WHERE ROWID IN (${uniqueOps.map((id) => `'${id}'`).join(',')}) LIMIT 200`,
    );
    for (const opsUser of opsUserRows) {
      await this.notif.sendInApp({
        tenantId: req.tenantId, userId: String(opsUser.ROWID),
        title: 'Asset Request — Action Required',
        message: `${assignerName} assigned an asset request from ${requesterName} to you`,
        type: NOTIFICATION_TYPE.ASSET_OPS_ASSIGNED, entityType: 'ASSET_REQUEST', entityId: req.params.requestId,
      });
      await this.notif.send({
        toEmail: opsUser.email,
        subject: `[Delivery Sync] Asset request assigned — ${categoryName}`,
        htmlBody: this.notif._assetOpsAssignedTemplate(opsUser.name, assignerName, requesterName, categoryName, message),
      });
    }

    await this.audit.log({
      tenantId: req.tenantId, entityType: 'ASSET_REQUEST', entityId: req.params.requestId,
      action: AUDIT_ACTION.ASSIGN, newValue: { ops_assignees: uniqueOps }, performedBy: req.currentUser.id,
    });
    return ResponseHelper.success(res, { message: 'Assigned to ops team' });
  }

  // ── PATCH /requests/:id/process ───────────────────────────────────────────────
  // Ops team marks they have started processing
  async startProcessing(req, res) {
    const req_ = await this.db.findById(TABLES.ASSET_REQUESTS, req.params.requestId, req.tenantId);
    if (!req_) return ResponseHelper.notFound(res, 'Request not found');
    if (req_.status !== ASSET_REQ_STATUS.ASSIGNED_TO_OPS)
      return ResponseHelper.validationError(res, 'Request must be ASSIGNED_TO_OPS to start processing');

    await this.db.update(TABLES.ASSET_REQUESTS, {
      ROWID: req.params.requestId,
      status: ASSET_REQ_STATUS.PROCESSING,
      processing_by: String(req.currentUser.id),
      processing_at: DataStoreService.fmtDT(new Date()),
    });
    await this.audit.log({
      tenantId: req.tenantId, entityType: 'ASSET_REQUEST', entityId: req.params.requestId,
      action: AUDIT_ACTION.STATUS_CHANGE,
      newValue: { status: ASSET_REQ_STATUS.PROCESSING }, performedBy: req.currentUser.id,
    });
    return ResponseHelper.success(res, { message: 'Processing started' });
  }

  // ── PATCH /requests/:id/handover ──────────────────────────────────────────────
  // Ops team hands over the asset (creates assignment, notifies requester + approver)
  // Body: { asset_id?, device_id?, device_username?, device_password?, notes? }
  async handover(req, res) {
    const { asset_id, device_id, device_username, device_password, notes } = req.body ?? {};
    const req_ = await this.db.findById(TABLES.ASSET_REQUESTS, req.params.requestId, req.tenantId);
    if (!req_) return ResponseHelper.notFound(res, 'Request not found');

    const validStatuses = [
      ASSET_REQ_STATUS.APPROVED,
      ASSET_REQ_STATUS.ASSIGNED_TO_OPS,
      ASSET_REQ_STATUS.PROCESSING,
    ];
    if (!validStatuses.includes(req_.status))
      return ResponseHelper.validationError(res, 'Request is not in a handover-eligible state');

    const resolvedAssetId = asset_id ? String(asset_id) : (req_.asset_id ? String(req_.asset_id) : null);
    if (!resolvedAssetId) return ResponseHelper.validationError(res, 'asset_id is required for handover');

    const asset = await this.db.findById(TABLES.ASSETS, resolvedAssetId, req.tenantId);
    if (!asset || asset.status !== ASSET_STATUS.AVAILABLE)
      return ResponseHelper.validationError(res, 'Asset is not available for handover');

    const updateData = {
      ROWID: req.params.requestId,
      status: ASSET_REQ_STATUS.HANDED_OVER,
      asset_id: resolvedAssetId,
      handover_by: String(req.currentUser.id),
      handover_at: DataStoreService.fmtDT(new Date()),
      handover_notes: notes || '',
    };
    if (device_id)       updateData.device_id       = String(device_id);
    if (device_username) updateData.device_username = String(device_username);
    if (device_password) updateData.device_password = String(device_password);

    await this.db.update(TABLES.ASSET_REQUESTS, updateData);

    // Assign the physical asset
    await this.db.update(TABLES.ASSETS, {
      ROWID: resolvedAssetId,
      status: ASSET_STATUS.ASSIGNED,
      assigned_to: String(req_.requested_by),
      assigned_at: DataStoreService.fmtDT(new Date()),
    });
    await this.db.insert(TABLES.ASSET_ASSIGNMENTS, {
      tenant_id:               String(req.tenantId),
      asset_id:                resolvedAssetId,
      user_id:                 String(req_.requested_by),
      assigned_by:             String(req.currentUser.id),
      request_id:              String(req.params.requestId),
      assigned_date:           DataStoreService.fmtDT(new Date()),
      condition_at_assignment: asset.asset_condition || 'GOOD',
      is_active:               'true',
    });

    // Fetch names for notifications
    const [handoverRows, requesterRows, approverRows] = await Promise.all([
      this.db.query(`SELECT name FROM ${TABLES.USERS} WHERE ROWID = '${req.currentUser.id}' LIMIT 1`),
      this.db.query(`SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = '${req_.requested_by}' LIMIT 1`),
      req_.approved_by
        ? this.db.query(`SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = '${req_.approved_by}' LIMIT 1`)
        : Promise.resolve([]),
    ]);
    const handoverName  = handoverRows[0]?.name  ?? 'Operations Team';
    const requesterName = requesterRows[0]?.name ?? 'Team member';

    // Notify requester (include device creds via email)
    if (requesterRows[0]) {
      await this.notif.sendInApp({
        tenantId: req.tenantId, userId: req_.requested_by,
        title: 'Asset Ready — Please Collect',
        message: `${handoverName} has processed your request. "${asset.name}" is ready for pickup.`,
        type: NOTIFICATION_TYPE.ASSET_ASSIGNED, entityType: 'ASSET_REQUEST', entityId: req.params.requestId,
      });
      await this.notif.send({
        toEmail: requesterRows[0].email,
        subject: `[Delivery Sync] Your asset "${asset.name}" is ready for pickup`,
        htmlBody: this.notif._assetHandoverTemplate(
          requesterRows[0].name, handoverName, asset.name,
          device_id, device_username, device_password, notes,
        ),
      });
    }

    // Notify approver (RM) — no device credentials in this email
    if (approverRows[0]) {
      await this.notif.sendInApp({
        tenantId: req.tenantId, userId: req_.approved_by,
        title: 'Asset Handed Over',
        message: `${handoverName} handed over "${asset.name}" to ${requesterName}`,
        type: NOTIFICATION_TYPE.ASSET_HANDOVER_COMPLETE, entityType: 'ASSET_REQUEST', entityId: req.params.requestId,
      });
      await this.notif.send({
        toEmail: approverRows[0].email,
        subject: `[Delivery Sync] Asset handed over to ${requesterName}`,
        htmlBody: this.notif._assetHandoverManagerTemplate(
          approverRows[0].name, handoverName, requesterName, asset.name, notes,
        ),
      });
    }

    await this.audit.log({
      tenantId: req.tenantId, entityType: 'ASSET_REQUEST', entityId: req.params.requestId,
      action: AUDIT_ACTION.HANDOVER,
      newValue: { asset_id: resolvedAssetId, handover_by: req.currentUser.id },
      performedBy: req.currentUser.id,
    });
    return ResponseHelper.success(res, { message: 'Asset handed over successfully' });
  }

  // ── POST /requests/:id/return ─────────────────────────────────────────────────
  // Requester initiates the return
  async initiateReturn(req, res) {
    const req_ = await this.db.findById(TABLES.ASSET_REQUESTS, req.params.requestId, req.tenantId);
    if (!req_) return ResponseHelper.notFound(res, 'Request not found');
    if (req_.status !== ASSET_REQ_STATUS.HANDED_OVER)
      return ResponseHelper.validationError(res, 'Asset must be in HANDED_OVER status to return');
    if (String(req_.requested_by) !== String(req.currentUser.id))
      return ResponseHelper.forbidden(res, 'Only the asset recipient can initiate a return');

    const { reason = '' } = req.body ?? {};
    await this.db.update(TABLES.ASSET_REQUESTS, {
      ROWID: req.params.requestId,
      status: ASSET_REQ_STATUS.RETURNED,
      return_by: String(req.currentUser.id),
      return_at: DataStoreService.fmtDT(new Date()),
      return_reason: reason,
    });

    // Notify ops assignees
    let opsIds = [];
    try { opsIds = JSON.parse(req_.ops_assignees || '[]'); } catch { opsIds = []; }
    if (opsIds.length) {
      const opsUsers = await this.db.query(
        `SELECT ROWID, name, email FROM ${TABLES.USERS} WHERE ROWID IN (${opsIds.map((id) => `'${id}'`).join(',')}) LIMIT 200`,
      );
      const requesterRows = await this.db.query(
        `SELECT name FROM ${TABLES.USERS} WHERE ROWID = '${req.currentUser.id}' LIMIT 1`,
      );
      const requesterName = requesterRows[0]?.name ?? 'A team member';
      for (const opsUser of opsUsers) {
        await this.notif.sendInApp({
          tenantId: req.tenantId, userId: String(opsUser.ROWID),
          title: 'Asset Return — Verify Required',
          message: `${requesterName} has returned an asset. Please verify and process.`,
          type: NOTIFICATION_TYPE.ASSET_RETURNED, entityType: 'ASSET_REQUEST', entityId: req.params.requestId,
        });
      }
    }

    await this.audit.log({
      tenantId: req.tenantId, entityType: 'ASSET_REQUEST', entityId: req.params.requestId,
      action: AUDIT_ACTION.RETURN_INITIATE,
      newValue: { reason }, performedBy: req.currentUser.id,
    });
    return ResponseHelper.success(res, { message: 'Return initiated. Awaiting ops verification.' });
  }

  // ── PATCH /requests/:id/verify-return ─────────────────────────────────────────
  // Ops team verifies return with checklist
  async verifyReturn(req, res) {
    const { condition = 'GOOD', checklist = [], notes = '' } = req.body ?? {};
    const req_ = await this.db.findById(TABLES.ASSET_REQUESTS, req.params.requestId, req.tenantId);
    if (!req_) return ResponseHelper.notFound(res, 'Request not found');
    if (req_.status !== ASSET_REQ_STATUS.RETURNED)
      return ResponseHelper.validationError(res, 'Request must be in RETURNED status to verify');

    await this.db.update(TABLES.ASSET_REQUESTS, {
      ROWID: req.params.requestId,
      status: ASSET_REQ_STATUS.RETURN_VERIFIED,
      return_condition:    condition,
      return_checklist:    JSON.stringify(checklist),
      return_notes:        notes,
      return_verified_by:  String(req.currentUser.id),
      return_verified_at:  DataStoreService.fmtDT(new Date()),
    });

    // Free the asset
    if (req_.asset_id) {
      await this.db.update(TABLES.ASSETS, {
        ROWID: req_.asset_id,
        status: ASSET_STATUS.AVAILABLE,
        assigned_to: '0',
      });
      // Close the active assignment record
      const assignments = await this.db.findWhere(
        TABLES.ASSET_ASSIGNMENTS, req.tenantId,
        `request_id = '${req.params.requestId}' AND is_active = 'true'`,
        { limit: 1 },
      );
      if (assignments[0]) {
        await this.db.update(TABLES.ASSET_ASSIGNMENTS, {
          ROWID: assignments[0].ROWID,
          returned_date:      DataStoreService.fmtDT(new Date()),
          condition_at_return: condition,
          return_notes:        notes,
          is_active:           'false',
        });
      }
    }

    // Notify requester
    const requesterRows = await this.db.query(
      `SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = '${req_.requested_by}' LIMIT 1`,
    );
    if (requesterRows[0]) {
      await this.notif.sendInApp({
        tenantId: req.tenantId, userId: req_.requested_by,
        title: 'Asset Return Verified',
        message: 'Your asset return has been verified. Thank you!',
        type: NOTIFICATION_TYPE.ASSET_RETURN_VERIFIED, entityType: 'ASSET_REQUEST', entityId: req.params.requestId,
      });
    }

    await this.audit.log({
      tenantId: req.tenantId, entityType: 'ASSET_REQUEST', entityId: req.params.requestId,
      action: AUDIT_ACTION.RETURN_VERIFY,
      newValue: { condition, checklist }, performedBy: req.currentUser.id,
    });
    return ResponseHelper.success(res, { message: 'Return verified' });
  }

  // ── PATCH /requests/:id/fulfill (legacy) ──────────────────────────────────────
  async fulfill(req, res) {
    const { asset_id, fulfillment_notes } = req.body ?? {};
    if (!asset_id) return ResponseHelper.validationError(res, 'asset_id required');

    const req_ = await this.db.findById(TABLES.ASSET_REQUESTS, req.params.requestId, req.tenantId);
    if (!req_) return ResponseHelper.notFound(res, 'Request not found');
    if (![ASSET_REQ_STATUS.APPROVED, ASSET_REQ_STATUS.ASSIGNED_TO_OPS].includes(req_.status))
      return ResponseHelper.validationError(res, 'Only APPROVED or ASSIGNED_TO_OPS requests can be fulfilled');

    const asset = await this.db.findById(TABLES.ASSETS, asset_id, req.tenantId);
    if (!asset || asset.status !== ASSET_STATUS.AVAILABLE)
      return ResponseHelper.validationError(res, 'Asset not available');

    await this.db.update(TABLES.ASSETS, {
      ROWID: asset_id,
      status: ASSET_STATUS.ASSIGNED,
      assigned_to: String(req_.requested_by),
      assigned_at: DataStoreService.fmtDT(new Date()),
    });
    await this.db.insert(TABLES.ASSET_ASSIGNMENTS, {
      tenant_id:               String(req.tenantId),
      asset_id:                String(asset_id),
      user_id:                 String(req_.requested_by),
      assigned_by:             String(req.currentUser.id),
      request_id:              String(req.params.requestId),
      assigned_date:           DataStoreService.fmtDT(new Date()),
      condition_at_assignment: asset.asset_condition || 'GOOD',
      is_active:               'true',
    });
    await this.db.update(TABLES.ASSET_REQUESTS, {
      ROWID: req.params.requestId,
      status: ASSET_REQ_STATUS.FULFILLED,
      asset_id: String(asset_id),
      fulfilled_by: String(req.currentUser.id),
      fulfilled_at: DataStoreService.fmtDT(new Date()),
      fulfillment_notes: fulfillment_notes || '',
    });

    await this.notif.sendInApp({
      tenantId: req.tenantId, userId: req_.requested_by,
      title: 'Asset Assigned',
      message: `"${asset.name}" has been assigned to you`,
      type: NOTIFICATION_TYPE.ASSET_ASSIGNED, entityType: 'ASSET', entityId: asset_id,
    });
    await this.audit.log({
      tenantId: req.tenantId, entityType: 'ASSET_REQUEST', entityId: req.params.requestId,
      action: AUDIT_ACTION.ASSIGN,
      newValue: { asset_id, fulfilled_by: req.currentUser.id }, performedBy: req.currentUser.id,
    });
    return ResponseHelper.success(res, { message: 'Asset fulfilled and assigned' });
  }

  // ── GET /requests/assignable-users ────────────────────────────────────────────
  async listAssignableUsers(req, res) {
    const users = await this.db.query(
      `SELECT ROWID, name, email, avatar_url FROM ${TABLES.USERS} WHERE tenant_id = '${req.tenantId}' AND status = 'ACTIVE' ORDER BY name ASC LIMIT 300`,
    );
    return ResponseHelper.success(res, users.map((u) => ({
      id: String(u.ROWID), name: u.name, email: u.email, avatarUrl: u.avatar_url,
    })));
  }

  // ── GET /requests/org-roles ───────────────────────────────────────────────────
  async listOrgRoles(req, res) {
    const roles = await this.db.query(
      `SELECT ROWID, name, description FROM ${TABLES.ORG_ROLES} WHERE tenant_id = '${req.tenantId}' AND is_active = 'true' ORDER BY name ASC LIMIT 200`,
    );
    return ResponseHelper.success(res, roles.map((r) => ({
      id: String(r.ROWID), name: r.name, description: r.description,
    })));
  }
}

module.exports = AssetRequestController;
