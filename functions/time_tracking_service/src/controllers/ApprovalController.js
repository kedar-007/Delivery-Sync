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

      if (approvals.length === 0) return ResponseHelper.success(res, []);

      // Collect unique IDs for batch fetching
      const entryIds    = [...new Set(approvals.map(a => String(a.time_entry_id)).filter(Boolean))];
      const requesterIds = [...new Set(approvals.map(a => String(a.requested_by)).filter(Boolean))];

      // Batch fetch time entries
      const entriesMap = {};
      if (entryIds.length > 0) {
        const entryRows = await this.db.query(
          `SELECT * FROM ${TABLES.TIME_ENTRIES} WHERE ROWID IN (${entryIds.join(',')}) AND tenant_id = '${req.tenantId}' LIMIT 200`
        ).catch(() => []);
        entryRows.forEach(e => { entriesMap[String(e.ROWID)] = e; });
      }

      // Batch fetch requesters
      const usersMap = {};
      if (requesterIds.length > 0) {
        const userRows = await this.db.query(
          `SELECT ROWID, name, email, avatar_url FROM ${TABLES.USERS} WHERE ROWID IN (${requesterIds.join(',')}) LIMIT 200`
        ).catch(() => []);
        userRows.forEach(u => { usersMap[String(u.ROWID)] = u; });
      }

      // Collect unique project IDs from entries (tasks/sprints belong to task_sprint_service — not accessible here)
      const entries = Object.values(entriesMap);
      const projectIds = [...new Set(entries.map(e => String(e.project_id)).filter(id => id && id !== '0'))];

      // Batch fetch projects
      const projectsMap = {};
      if (projectIds.length > 0) {
        const projRows = await this.db.query(
          `SELECT ROWID, name FROM ${TABLES.PROJECTS} WHERE ROWID IN (${projectIds.join(',')}) LIMIT 200`
        ).catch(() => []);
        projRows.forEach(p => { projectsMap[String(p.ROWID)] = p.name || ''; });
      }

      // Assemble enriched approvals
      for (const a of approvals) {
        const entry = entriesMap[String(a.time_entry_id)] || null;
        if (entry) {
          entry.project_name = projectsMap[String(entry.project_id)] || '';
          entry.task_name    = '';
          entry.sprint_name  = '';
        }
        a.entry     = entry;
        a.requester = usersMap[String(a.requested_by)] || null;
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
      const hoursLabel = _formatHours(entry?.hours);
      const dateLabel  = _formatDate(entry?.entry_date);
      await this.notif.send({
        toEmail:  userRows[0].email,
        subject:  `[DSV OpsPulse] Your time entry was approved`,
        htmlBody: _approvalEmailHtml({
          recipientName: userRows[0].name,
          hoursLabel,
          dateLabel,
          description:   entry?.description || '',
        }),
      });
      await this.notif.sendInApp({ tenantId: req.tenantId, userId: approval.requested_by, title: 'Time Entry Approved', message: `Your ${hoursLabel} entry on ${dateLabel} was approved`, type: NOTIFICATION_TYPE.TIME_ENTRY_APPROVED, entityType: 'TIME_ENTRY', entityId: approval.time_entry_id });
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
    await this.db.update(TABLES.TIME_ENTRIES, { ROWID: approval.time_entry_id, status: TIME_STATUS.REJECTED });

    const entry = await this.db.findById(TABLES.TIME_ENTRIES, approval.time_entry_id, req.tenantId);
    const userRows = await this.db.query(`SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = '${approval.requested_by}' LIMIT 1`);
    if (userRows[0]) {
      const hoursLabel = _formatHours(entry?.hours);
      const dateLabel  = _formatDate(entry?.entry_date);
      await this.notif.send({
        toEmail:  userRows[0].email,
        subject:  `[DSV OpsPulse] Your time entry was rejected`,
        htmlBody: _rejectionEmailHtml({
          recipientName: userRows[0].name,
          hoursLabel,
          dateLabel,
          description:   entry?.description || '',
          reason:        notes,
        }),
      });
      await this.notif.sendInApp({ tenantId: req.tenantId, userId: approval.requested_by, title: 'Time Entry Rejected', message: `Your entry on ${dateLabel} was rejected: ${notes}`, type: NOTIFICATION_TYPE.TIME_ENTRY_REJECTED, entityType: 'TIME_ENTRY', entityId: approval.time_entry_id });
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

// ─── Email helpers ───────────────────────────────────────────────────────────

// Render decimal hours as a human-friendly label.
//   0.1 → "6 min"  (was the source of "0.1h" confusion in DSV-018)
//   1   → "1 hour"
//   1.5 → "1 h 30 min"
function _formatHours(raw) {
  const n = parseFloat(raw);
  if (!isFinite(n) || n <= 0) return '0 min';
  const totalMin = Math.round(n * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} ${h === 1 ? 'hour' : 'hours'}`;
  return `${h} h ${m} min`;
}

// Strip the time portion if a stored UTC datetime accidentally lands here
// ("2026-05-11 00:00:00" → "11 May 2026"). Falls back to the raw value if it
// can't be parsed.
function _formatDate(raw) {
  if (!raw) return '';
  const datePart = String(raw).slice(0, 10);
  const d = new Date(datePart + 'T00:00:00Z');
  if (isNaN(d.getTime())) return String(raw);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function _escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Polished approval email — proper greeting on its own line, clearly
// formatted hours, date and description, plus a regards/signature block.
function _approvalEmailHtml({ recipientName, hoursLabel, dateLabel, description }) {
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937;">
    <p style="margin:0 0 16px;font-size:15px;">Hi ${_escapeHtml(recipientName || 'there')},</p>

    <p style="margin:0 0 18px;font-size:14px;line-height:1.55;">
      Good news — your time entry has been <strong style="color:#16a34a;">approved</strong>.
    </p>

    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;width:100%;margin-bottom:20px;">
      <tr>
        <td style="padding:10px 14px;font-size:12px;color:#6b7280;width:90px;border-bottom:1px solid #e5e7eb;">Hours</td>
        <td style="padding:10px 14px;font-size:13px;color:#111827;font-weight:600;border-bottom:1px solid #e5e7eb;">${_escapeHtml(hoursLabel)}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;font-size:12px;color:#6b7280;${description ? 'border-bottom:1px solid #e5e7eb;' : ''}">Date</td>
        <td style="padding:10px 14px;font-size:13px;color:#111827;font-weight:600;${description ? 'border-bottom:1px solid #e5e7eb;' : ''}">${_escapeHtml(dateLabel)}</td>
      </tr>
      ${description ? `
      <tr>
        <td style="padding:10px 14px;font-size:12px;color:#6b7280;vertical-align:top;">Description</td>
        <td style="padding:10px 14px;font-size:13px;color:#374151;">${_escapeHtml(description)}</td>
      </tr>` : ''}
    </table>

    <p style="margin:0 0 4px;font-size:13px;color:#374151;">Thanks for keeping your hours up to date.</p>

    <p style="margin:24px 0 4px;font-size:13px;color:#374151;">Regards,</p>
    <p style="margin:0;font-size:13px;color:#4f46e5;font-weight:600;">DSV OpsPulse team</p>
  </div>`;
}

function _rejectionEmailHtml({ recipientName, hoursLabel, dateLabel, description, reason }) {
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937;">
    <p style="margin:0 0 16px;font-size:15px;">Hi ${_escapeHtml(recipientName || 'there')},</p>

    <p style="margin:0 0 18px;font-size:14px;line-height:1.55;">
      Your time entry has been <strong style="color:#dc2626;">rejected</strong>. Please review the note from your approver below and resubmit with the corrections.
    </p>

    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;width:100%;margin-bottom:16px;">
      <tr>
        <td style="padding:10px 14px;font-size:12px;color:#6b7280;width:90px;border-bottom:1px solid #e5e7eb;">Hours</td>
        <td style="padding:10px 14px;font-size:13px;color:#111827;font-weight:600;border-bottom:1px solid #e5e7eb;">${_escapeHtml(hoursLabel)}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;font-size:12px;color:#6b7280;${description ? 'border-bottom:1px solid #e5e7eb;' : ''}">Date</td>
        <td style="padding:10px 14px;font-size:13px;color:#111827;font-weight:600;${description ? 'border-bottom:1px solid #e5e7eb;' : ''}">${_escapeHtml(dateLabel)}</td>
      </tr>
      ${description ? `
      <tr>
        <td style="padding:10px 14px;font-size:12px;color:#6b7280;vertical-align:top;">Description</td>
        <td style="padding:10px 14px;font-size:13px;color:#374151;">${_escapeHtml(description)}</td>
      </tr>` : ''}
    </table>

    <div style="background:#fef2f2;border-left:4px solid #dc2626;border-radius:0 8px 8px 0;padding:12px 14px;margin-bottom:20px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:0.5px;">Reason</p>
      <p style="margin:0;font-size:13px;color:#7f1d1d;line-height:1.5;white-space:pre-wrap;">${_escapeHtml(reason)}</p>
    </div>

    <p style="margin:24px 0 4px;font-size:13px;color:#374151;">Regards,</p>
    <p style="margin:0;font-size:13px;color:#4f46e5;font-weight:600;">DSV OpsPulse team</p>
  </div>`;
}

module.exports = ApprovalController;
