'use strict';

const DataStoreService    = require('../services/DataStoreService');
const AuditService        = require('../services/AuditService');
const NotificationService = require('../services/NotificationService');
const ResponseHelper      = require('../utils/ResponseHelper');
const { TABLES, TIME_STATUS, AUDIT_ACTION, NOTIFICATION_TYPE } = require('../utils/Constants');

class ApprovalController {
  constructor(catalystApp) {
    this.db    = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
    this.notif = new NotificationService(catalystApp, this.db);
  }

  // GET /api/time/approvals — pending approvals for current RM
  async list(req, res) {
    try {
      const { status } = req.query;
      const where = `assigned_to = ${req.currentUser.id}` + (status ? ` AND status = '${DataStoreService.escape(status)}'` : ` AND status = 'PENDING'`);
      const approvals = await this.db.findWhere(TABLES.TIME_APPROVAL_REQUESTS, req.tenantId, where, { orderBy: 'CREATEDTIME ASC', limit: 100 });

      // Enrich with entry + requester + project/task/sprint names
      for (const a of approvals) {
        const [entry, userRows] = await Promise.all([
          this.db.findById(TABLES.TIME_ENTRIES, a.time_entry_id, req.tenantId),
          this.db.query(`SELECT name, email, avatar_url FROM ${TABLES.USERS} WHERE ROWID = '${a.requested_by}' LIMIT 1`),
        ]);

        if (entry) {
          // Project name
          try {
            const projRows = await this.db.query(
              `SELECT name FROM ${TABLES.PROJECTS} WHERE ROWID = '${entry.project_id}' LIMIT 1`
            );
            entry.project_name = projRows[0]?.name || '';
          } catch (_) { entry.project_name = ''; }

          // Task name + sprint name — tables may not be accessible from this service
          entry.task_name   = '';
          entry.sprint_name = '';
          const taskId = String(entry.task_id || '');
          if (taskId && taskId !== '0') {
            try {
              const taskRows = await this.db.query(
                `SELECT name, sprint_id FROM ${TABLES.TASKS} WHERE ROWID = '${taskId}' LIMIT 1`
              );
              if (taskRows[0]) {
                entry.task_name = taskRows[0].name || '';
                const sprintId = String(taskRows[0].sprint_id || '');
                if (sprintId && sprintId !== '0') {
                  try {
                    const sprintRows = await this.db.query(
                      `SELECT name FROM ${TABLES.SPRINTS} WHERE ROWID = '${sprintId}' LIMIT 1`
                    );
                    entry.sprint_name = sprintRows[0]?.name || '';
                  } catch (_) {}
                }
              }
            } catch (_) {}
          }
        }

        a.entry     = entry;
        a.requester = userRows[0] || null;
      }

      return ResponseHelper.success(res, approvals);
    } catch (err) {
      console.error('[ApprovalController] list error:', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // GET /api/time/approvals/history
  async history(req, res) {
    const where = `assigned_to = ${req.currentUser.id} AND (status = 'APPROVED' OR status = 'REJECTED')`;
    const approvals = await this.db.findWhere(TABLES.TIME_APPROVAL_REQUESTS, req.tenantId, where, { orderBy: 'CREATEDTIME DESC', limit: 100 });
    return ResponseHelper.success(res, approvals);
  }

  // PATCH /api/time/approvals/:requestId/approve
  async approve(req, res) {
    const approval = await this.db.findById(TABLES.TIME_APPROVAL_REQUESTS, req.params.requestId, req.tenantId);
    if (!approval) return ResponseHelper.notFound(res, 'Approval request not found');
    if (String(approval.assigned_to) !== req.currentUser.id) return ResponseHelper.forbidden(res, 'Not your approval queue');
    if (approval.status !== 'PENDING') return ResponseHelper.validationError(res, 'Already reviewed');

    await this.db.update(TABLES.TIME_APPROVAL_REQUESTS, { ROWID: req.params.requestId, status: 'APPROVED', notes: req.body.notes || '' });
    await this.db.update(TABLES.TIME_ENTRIES, { ROWID: approval.time_entry_id, status: TIME_STATUS.APPROVED, approved_by: req.currentUser.id, approved_at: DataStoreService.fmtDT(new Date()) });

    const entry = await this.db.findById(TABLES.TIME_ENTRIES, approval.time_entry_id, req.tenantId);
    const userRows = await this.db.query(`SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = '${approval.requested_by}' LIMIT 1`);
    if (userRows[0]) {
      await this.notif.send({ toEmail: userRows[0].email, subject: '[Delivery Sync] Time entry approved', htmlBody: `<p>Hi ${userRows[0].name}, your time entry of ${entry?.hours}h on ${entry?.entry_date} has been approved.</p>` });
      await this.notif.sendInApp({ tenantId: req.tenantId, userId: approval.requested_by, title: 'Time Entry Approved', message: `Your ${entry?.hours}h entry on ${entry?.entry_date} was approved`, type: NOTIFICATION_TYPE.TIME_ENTRY_APPROVED, entityType: 'TIME_ENTRY', entityId: approval.time_entry_id });
    }

    await this.audit.log({ tenantId: req.tenantId, entityType: 'TIME_APPROVAL', entityId: req.params.requestId, action: AUDIT_ACTION.APPROVE, newValue: { status: 'APPROVED' }, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, { message: 'Approved' });
  }

  // PATCH /api/time/approvals/:requestId/reject
  async reject(req, res) {
    const { notes } = req.body;
    if (!notes) return ResponseHelper.validationError(res, 'notes (rejection reason) is required');

    const approval = await this.db.findById(TABLES.TIME_APPROVAL_REQUESTS, req.params.requestId, req.tenantId);
    if (!approval) return ResponseHelper.notFound(res, 'Approval request not found');
    if (String(approval.assigned_to) !== req.currentUser.id) return ResponseHelper.forbidden(res, 'Not your approval queue');
    if (approval.status !== 'PENDING') return ResponseHelper.validationError(res, 'Already reviewed');

    await this.db.update(TABLES.TIME_APPROVAL_REQUESTS, { ROWID: req.params.requestId, status: 'REJECTED', notes });
    await this.db.update(TABLES.TIME_ENTRIES, { ROWID: approval.time_entry_id, status: TIME_STATUS.REJECTED, notes });

    const entry = await this.db.findById(TABLES.TIME_ENTRIES, approval.time_entry_id, req.tenantId);
    const userRows = await this.db.query(`SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = '${approval.requested_by}' LIMIT 1`);
    if (userRows[0]) {
      await this.notif.send({ toEmail: userRows[0].email, subject: '[Delivery Sync] Time entry rejected', htmlBody: `<p>Hi ${userRows[0].name}, your time entry of ${entry?.hours}h on ${entry?.entry_date} was rejected. Reason: ${notes}</p>` });
      await this.notif.sendInApp({ tenantId: req.tenantId, userId: approval.requested_by, title: 'Time Entry Rejected', message: `Your entry on ${entry?.entry_date} was rejected: ${notes}`, type: NOTIFICATION_TYPE.TIME_ENTRY_REJECTED, entityType: 'TIME_ENTRY', entityId: approval.time_entry_id });
    }

    await this.audit.log({ tenantId: req.tenantId, entityType: 'TIME_APPROVAL', entityId: req.params.requestId, action: AUDIT_ACTION.REJECT, newValue: { status: 'REJECTED', notes }, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, { message: 'Rejected' });
  }

  // PATCH /api/time/approvals/:requestId/escalate
  async escalate(req, res) {
    const { escalate_to } = req.body;
    if (!escalate_to) return ResponseHelper.validationError(res, 'escalate_to user_id is required');

    const approval = await this.db.findById(TABLES.TIME_APPROVAL_REQUESTS, req.params.requestId, req.tenantId);
    if (!approval) return ResponseHelper.notFound(res, 'Approval request not found');

    await this.db.update(TABLES.TIME_APPROVAL_REQUESTS, { ROWID: req.params.requestId, status: 'ESCALATED', escalated_to: escalate_to, escalated_at: DataStoreService.fmtDT(new Date()) });
    await this.audit.log({ tenantId: req.tenantId, entityType: 'TIME_APPROVAL', entityId: req.params.requestId, action: AUDIT_ACTION.ESCALATE, newValue: { escalated_to }, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, { message: 'Escalated' });
  }
}

module.exports = ApprovalController;
