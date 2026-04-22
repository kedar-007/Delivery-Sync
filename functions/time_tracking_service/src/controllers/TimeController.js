'use strict';

const DataStoreService    = require('../services/DataStoreService');
const AuditService        = require('../services/AuditService');
const NotificationService = require('../services/NotificationService');
const ResponseHelper      = require('../utils/ResponseHelper');
const { TABLES, TIME_STATUS, AUDIT_ACTION, NOTIFICATION_TYPE } = require('../utils/Constants');

class TimeController {
  constructor(catalystApp) {
    this.db    = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
    this.notif = new NotificationService(catalystApp, this.db);
  }

  // GET /api/time/entries?project_id=&user_id=&date_from=&date_to=&status=&is_billable=
  async list(req, res) {
    const { project_id, task_id, user_id, date_from, date_to, status, is_billable } = req.query;
    const tenantId = req.tenantId;
    const me = req.currentUser;

    let where = '';
    // Restrict to own entries unless user has ORG_WIDE/SUBORDINATES data scope or is TENANT_ADMIN
    const canSeeAll = me.role === 'TENANT_ADMIN'
      || me.dataScope === 'ORG_WIDE'
      || me.dataScope === 'SUBORDINATES';
    const effectiveUserId = canSeeAll ? (user_id || null) : me.id;
    if (effectiveUserId) where += `user_id = '${DataStoreService.escape(effectiveUserId)}' AND `;
    if (project_id) where += `project_id = '${DataStoreService.escape(project_id)}' AND `;
    if (task_id)    where += `task_id = '${DataStoreService.escape(task_id)}' AND `;
    if (status)     where += `status = '${DataStoreService.escape(status)}' AND `;
    if (is_billable !== undefined) where += `is_billable = '${is_billable === 'true' ? 'true' : 'false'}' AND `;
    if (date_from)  where += `entry_date >= '${DataStoreService.escape(date_from)}' AND `;
    if (date_to)    where += `entry_date <= '${DataStoreService.escape(date_to)}' AND `;
    where = where.replace(/ AND $/, '');

    const entries = await this.db.findWhere(TABLES.TIME_ENTRIES, tenantId, where, { orderBy: 'entry_date DESC', limit: 200 });

    // Enrich with user info + project name
    const [users, projects] = await Promise.all([
      this.db.findAll(TABLES.USERS, { tenant_id: tenantId }, { limit: 200 }),
      this.db.findAll(TABLES.PROJECTS, { tenant_id: tenantId }, { limit: 200 }),
    ]);
    const userMap = {};
    users.forEach(u => { userMap[String(u.ROWID)] = u; });
    const projMap = {};
    projects.forEach(p => { projMap[String(p.ROWID)] = p.name || ''; });

    const enriched = entries.map(e => {
      const u = userMap[String(e.user_id)] || {};
      return {
        ...e,
        user_name:    u.name || '',
        user_avatar_url: u.avatar_url || '',
        project_name: projMap[String(e.project_id)] || '',
      };
    });

    return ResponseHelper.success(res, enriched);
  }

  // GET /api/time/entries/my-week
  async myWeek(req, res) {
    // Use IST (UTC+5:30) for week boundaries so the week aligns with the user's calendar day
    const istNow  = new Date(Date.now() + 5.5 * 3600000);
    const dayOfWk = istNow.getUTCDay(); // 0=Sun … 6=Sat
    const diffToMon = (dayOfWk === 0 ? -6 : 1 - dayOfWk); // offset to Monday
    const mon     = new Date(istNow); mon.setUTCDate(istNow.getUTCDate() + diffToMon);
    const sun     = new Date(mon);    sun.setUTCDate(mon.getUTCDate() + 6);
    const from    = mon.toISOString().split('T')[0];
    const to      = sun.toISOString().split('T')[0];
    const entries = await this.db.findWhere(TABLES.TIME_ENTRIES, req.tenantId,
      `user_id = '${req.currentUser.id}' AND entry_date >= '${from}' AND entry_date <= '${to}'`,
      { orderBy: 'entry_date ASC', limit: 100 });

    // Enrich entries with project name
    const projects = await this.db.findAll(TABLES.PROJECTS, { tenant_id: req.tenantId }, { limit: 200 });
    const projMap = {};
    projects.forEach(p => { projMap[String(p.ROWID)] = p.name || ''; });
    const enrichedEntries = entries.map(e => ({ ...e, project_name: projMap[String(e.project_id)] || '' }));

    const total   = entries.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
    const billable = entries.filter(e => e.is_billable === 'true').reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
    return ResponseHelper.success(res, { entries: enrichedEntries, total_hours: total, billable_hours: billable, week_start: from, week_end: to });
  }

  // GET /api/time/entries/summary
  async summary(req, res) {
    const { project_id, date_from, date_to } = req.query;
    const tenantId = req.tenantId;
    let where = '';
    if (project_id) where += `project_id = '${DataStoreService.escape(project_id)}' AND `;
    if (date_from)  where += `entry_date >= '${DataStoreService.escape(date_from)}' AND `;
    if (date_to)    where += `entry_date <= '${DataStoreService.escape(date_to)}' AND `;
    where = where.replace(/ AND $/, '');

    const entries = await this.db.findWhere(TABLES.TIME_ENTRIES, tenantId, where, { limit: 200 });

    // Aggregate per user
    const byUser = {};
    for (const e of entries) {
      if (!byUser[e.user_id]) byUser[e.user_id] = { user_id: e.user_id, total: 0, billable: 0, entries: 0 };
      byUser[e.user_id].total    += parseFloat(e.hours) || 0;
      byUser[e.user_id].billable += (e.is_billable === 'true') ? (parseFloat(e.hours) || 0) : 0;
      byUser[e.user_id].entries  += 1;
    }

    return ResponseHelper.success(res, { by_user: Object.values(byUser), total_hours: entries.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0) });
  }

  // GET /api/time/entries/:entryId
  async getById(req, res) {
    const entry = await this.db.findById(TABLES.TIME_ENTRIES, req.params.entryId, req.tenantId);
    if (!entry) return ResponseHelper.notFound(res, 'Time entry not found');
    if (req.currentUser.role === 'TEAM_MEMBER' && String(entry.user_id) !== req.currentUser.id)
      return ResponseHelper.forbidden(res, 'Cannot view another user\'s time entry');
    return ResponseHelper.success(res, entry);
  }

  // POST /api/time/entries
  async create(req, res) {
    const { project_id, task_id, hours, description, is_billable, start_time, end_time } = req.body;
    // Accept both `entry_date` (preferred) and legacy `date`
    const entryDate = req.body.entry_date || req.body.date;
    const tenantId = req.tenantId;
    const userId   = req.currentUser.id;

    // Calculate effective hours from start_time/end_time if hours not provided
    let effectiveHours = parseFloat(hours);
    if (start_time && end_time && !hours) {
      const [sh, sm] = start_time.split(':').map(Number);
      const [eh, em] = end_time.split(':').map(Number);
      effectiveHours = Math.round(((eh * 60 + em) - (sh * 60 + sm)) / 60 * 4) / 4; // round to 0.25
    }

    if (!project_id || !entryDate || !effectiveHours) return ResponseHelper.validationError(res, 'project_id, entry_date and hours are required');
    if (effectiveHours < 0.25 || effectiveHours > 24) return ResponseHelper.validationError(res, 'hours must be between 0.25 and 24');

    const insertPayload = {
      tenant_id:   String(tenantId),
      project_id:  String(project_id),
      task_id:     String(task_id || 0),
      user_id:     String(userId),
      entry_date:  entryDate,
      hours:       effectiveHours,
      description: description || '',
      is_billable: String(is_billable) === 'true' ? 'true' : 'false',
      status:      TIME_STATUS.DRAFT,
    };
    const row = await this.db.insert(TABLES.TIME_ENTRIES, insertPayload);

    await this.audit.log({ tenantId, entityType: 'TIME_ENTRY', entityId: row.ROWID, action: AUDIT_ACTION.CREATE, newValue: row, performedBy: userId });
    return ResponseHelper.created(res, row);
  }

  // PUT /api/time/entries/:entryId
  async update(req, res) {
    const entry = await this.db.findById(TABLES.TIME_ENTRIES, req.params.entryId, req.tenantId);
    if (!entry) return ResponseHelper.notFound(res, 'Time entry not found');
    if (entry.status !== TIME_STATUS.DRAFT && entry.status !== TIME_STATUS.REJECTED)
      return ResponseHelper.validationError(res, 'Only DRAFT or REJECTED entries can be edited');
    if (String(entry.user_id) !== req.currentUser.id)
      return ResponseHelper.forbidden(res, 'Cannot edit another user\'s time entry');

    const { hours, description, is_billable, task_id, start_time, end_time } = req.body;
    const updates = {};
    if (hours !== undefined) { if (parseFloat(hours) < 0.25 || parseFloat(hours) > 24) return ResponseHelper.validationError(res, 'hours must be 0.25–24'); updates.hours = parseFloat(hours); }
    if (description !== undefined) updates.description = description;
    if (is_billable !== undefined) updates.is_billable = is_billable ? 'true' : 'false';
    if (task_id !== undefined)     updates.task_id     = task_id;

    const updated = await this.db.update(TABLES.TIME_ENTRIES, { ROWID: req.params.entryId, ...updates, status: TIME_STATUS.DRAFT });
    await this.audit.log({ tenantId: req.tenantId, entityType: 'TIME_ENTRY', entityId: req.params.entryId, action: AUDIT_ACTION.UPDATE, oldValue: entry, newValue: updated, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, updated);
  }

  // DELETE /api/time/entries/:entryId
  async remove(req, res) {
    const entry = await this.db.findById(TABLES.TIME_ENTRIES, req.params.entryId, req.tenantId);
    if (!entry) return ResponseHelper.notFound(res, 'Time entry not found');
    if (entry.status !== TIME_STATUS.DRAFT) return ResponseHelper.validationError(res, 'Only DRAFT entries can be deleted');
    if (String(entry.user_id) !== req.currentUser.id) return ResponseHelper.forbidden(res, 'Cannot delete another user\'s entry');
    await this.db.delete(TABLES.TIME_ENTRIES, req.params.entryId);
    return ResponseHelper.success(res, { message: 'Entry deleted' });
  }

  // PATCH /api/time/entries/:entryId/submit
  async submit(req, res) {
    const entry = await this.db.findById(TABLES.TIME_ENTRIES, req.params.entryId, req.tenantId);
    if (!entry) return ResponseHelper.notFound(res, 'Time entry not found');
    if (entry.status !== TIME_STATUS.DRAFT && entry.status !== TIME_STATUS.REJECTED)
      return ResponseHelper.validationError(res, 'Only DRAFT or REJECTED entries can be submitted');
    if (String(entry.user_id) !== req.currentUser.id) return ResponseHelper.forbidden(res, 'Cannot submit another user\'s entry');

    // Find RM
    const profileRows = await this.db.findWhere(TABLES.USER_PROFILES, req.tenantId, `user_id = '${req.currentUser.id}'`, { limit: 1 });
    const rmId = profileRows[0]?.reporting_manager_id || '';

    await this.db.update(TABLES.TIME_ENTRIES, { ROWID: req.params.entryId, status: TIME_STATUS.SUBMITTED, submitted_at: DataStoreService.fmtDT(new Date()) });

    // Create approval request
    if (rmId) {
      const approval = await this.db.insert(TABLES.TIME_APPROVAL_REQUESTS, {
        tenant_id: req.tenantId, time_entry_id: req.params.entryId,
        requested_by: req.currentUser.id, assigned_to: rmId, status: 'PENDING',
      });

      const rmRows = await this.db.query(`SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = '${rmId}' LIMIT 1`);
      if (rmRows[0]) {
        await this.notif.send({ toEmail: rmRows[0].email, subject: `[Delivery Sync] Time entry awaiting your approval`, htmlBody: `<p>Hi ${rmRows[0].name}, ${req.currentUser.name} has submitted a time entry of ${entry.hours} hours for approval.</p>` });
        await this.notif.sendInApp({ tenantId: req.tenantId, userId: rmId, title: 'Time Approval Needed', message: `${req.currentUser.name} submitted ${entry.hours}h for approval`, type: NOTIFICATION_TYPE.TIME_APPROVAL_NEEDED, entityType: 'TIME_ENTRY', entityId: req.params.entryId });
      }
    }

    await this.audit.log({ tenantId: req.tenantId, entityType: 'TIME_ENTRY', entityId: req.params.entryId, action: AUDIT_ACTION.SUBMIT, newValue: { status: TIME_STATUS.SUBMITTED }, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, { message: 'Entry submitted for approval' });
  }

  // PATCH /api/time/entries/:entryId/retract
  async retract(req, res) {
    const entry = await this.db.findById(TABLES.TIME_ENTRIES, req.params.entryId, req.tenantId);
    if (!entry) return ResponseHelper.notFound(res, 'Time entry not found');
    if (entry.status !== TIME_STATUS.SUBMITTED) return ResponseHelper.validationError(res, 'Only SUBMITTED entries can be retracted');
    if (String(entry.user_id) !== req.currentUser.id) return ResponseHelper.forbidden(res, 'Cannot retract another user\'s entry');

    await this.db.update(TABLES.TIME_ENTRIES, { ROWID: req.params.entryId, status: TIME_STATUS.DRAFT });

    // Cancel pending approval request
    const approvalRows = await this.db.findWhere(TABLES.TIME_APPROVAL_REQUESTS, req.tenantId, `time_entry_id = ${req.params.entryId} AND status = 'PENDING'`, { limit: 1 });
    if (approvalRows[0]) await this.db.update(TABLES.TIME_APPROVAL_REQUESTS, { ROWID: approvalRows[0].ROWID, status: 'CANCELLED' });

    return ResponseHelper.success(res, { message: 'Entry retracted to DRAFT' });
  }

  // POST /api/time/entries/bulk-submit
  async bulkSubmit(req, res) {
    const { entry_ids } = req.body;
    if (!Array.isArray(entry_ids) || entry_ids.length === 0) return ResponseHelper.validationError(res, 'entry_ids array is required');

    const results = { submitted: [], failed: [] };
    for (const id of entry_ids) {
      const entry = await this.db.findById(TABLES.TIME_ENTRIES, id, req.tenantId);
      if (!entry || String(entry.user_id) !== req.currentUser.id || entry.status !== TIME_STATUS.DRAFT) {
        results.failed.push({ id, reason: 'Not found or not in DRAFT' });
      } else {
        await this.db.update(TABLES.TIME_ENTRIES, { ROWID: id, status: TIME_STATUS.SUBMITTED, submitted_at: DataStoreService.fmtDT(new Date()) });
        results.submitted.push(id);
      }
    }
    return ResponseHelper.success(res, results);
  }
}

module.exports = TimeController;
