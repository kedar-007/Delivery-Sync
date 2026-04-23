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

  // GET /api/time/analytics/team?period=week|month|last_month|custom&date_from=&date_to=&user_id=&project_id=
  async teamAnalytics(req, res) {
    const { period = 'week', date_from, date_to, user_id, project_id } = req.query;
    const tenantId = req.tenantId;

    // Compute date range from period
    const istNow = new Date(Date.now() + 5.5 * 3600000);
    let from, to;
    if (period === 'week') {
      const dayOfWk  = istNow.getUTCDay();
      const diffToMon = (dayOfWk === 0 ? -6 : 1 - dayOfWk);
      const mon = new Date(istNow); mon.setUTCDate(istNow.getUTCDate() + diffToMon);
      const sun = new Date(mon);    sun.setUTCDate(mon.getUTCDate() + 6);
      from = mon.toISOString().split('T')[0];
      to   = sun.toISOString().split('T')[0];
    } else if (period === 'month') {
      from = `${istNow.getUTCFullYear()}-${String(istNow.getUTCMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(istNow.getUTCFullYear(), istNow.getUTCMonth() + 1, 0);
      to   = lastDay.toISOString().split('T')[0];
    } else if (period === 'last_month') {
      const lastMonth = new Date(istNow.getUTCFullYear(), istNow.getUTCMonth() - 1, 1);
      from = `${lastMonth.getUTCFullYear()}-${String(lastMonth.getUTCMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(istNow.getUTCFullYear(), istNow.getUTCMonth(), 0);
      to   = lastDay.toISOString().split('T')[0];
    } else {
      // custom — caller must supply date_from / date_to
      from = date_from;
      to   = date_to;
    }
    if (!from || !to) return ResponseHelper.validationError(res, 'date_from and date_to are required for period=custom');

    // Build query for tenant
    let where = `entry_date >= '${DataStoreService.escape(from)}' AND entry_date <= '${DataStoreService.escape(to)}'`;
    if (user_id)    where += ` AND user_id = '${DataStoreService.escape(user_id)}'`;
    if (project_id) where += ` AND project_id = '${DataStoreService.escape(project_id)}'`;

    const [entries, users, projects] = await Promise.all([
      this.db.queryAll(
        `SELECT * FROM ${TABLES.TIME_ENTRIES} WHERE tenant_id = '${DataStoreService.escape(tenantId)}' AND ${where} ORDER BY entry_date ASC`
      ),
      this.db.findAll(TABLES.USERS,    { tenant_id: tenantId }, { limit: 200 }),
      this.db.findAll(TABLES.PROJECTS, { tenant_id: tenantId }, { limit: 200 }),
    ]);

    // Fetch org role names for users
    const orgRoleRows = await this.db.queryAll(
      `SELECT * FROM ${TABLES.USER_ORG_ROLES} WHERE tenant_id = '${DataStoreService.escape(tenantId)}'`
    ).catch(() => []);
    const orgRoleIdToName = {};
    const orgRoleDefs = await this.db.findAll(TABLES.ORG_ROLES, { tenant_id: tenantId }, { limit: 200 }).catch(() => []);
    orgRoleDefs.forEach(r => { orgRoleIdToName[String(r.ROWID)] = r.name || ''; });
    const userOrgRoleMap = {};
    orgRoleRows.forEach(r => { userOrgRoleMap[String(r.user_id)] = orgRoleIdToName[String(r.org_role_id)] || ''; });

    const userMap = {};
    users.forEach(u => { userMap[String(u.ROWID)] = u; });
    const projMap = {};
    projects.forEach(p => { projMap[String(p.ROWID)] = { name: p.name || '', id: String(p.ROWID) }; });

    // Aggregate per member
    const byMember = {};
    for (const e of entries) {
      const uid = String(e.user_id);
      const hrs = parseFloat(e.hours) || 0;
      // Catalyst may return boolean true or string 'true' depending on column type
      const isBillable = String(e.is_billable).toLowerCase() === 'true';
      const pid = String(e.project_id);
      const entryDate = String(e.entry_date).split('T')[0].split(' ')[0];
      const status = e.status || TIME_STATUS.DRAFT;

      if (!byMember[uid]) {
        const u = userMap[uid] || {};
        byMember[uid] = {
          user_id:        uid,
          user_name:      u.name || 'Unknown',
          user_avatar_url: u.avatar_url || '',
          org_role_name:  userOrgRoleMap[uid] || '',
          total_hours:    0,
          billable_hours: 0,
          non_billable_hours: 0,
          entries_count:  0,
          days_logged:    new Set(),
          approved_hours: 0,
          submitted_hours: 0,
          draft_hours:    0,
          by_project:     {},
        };
      }

      const m = byMember[uid];
      m.total_hours    += hrs;
      m.entries_count  += 1;
      m.days_logged.add(entryDate);
      if (isBillable) m.billable_hours += hrs; else m.non_billable_hours += hrs;
      if (status === TIME_STATUS.APPROVED)   m.approved_hours  += hrs;
      else if (status === TIME_STATUS.SUBMITTED) m.submitted_hours += hrs;
      else m.draft_hours += hrs;

      // Per-project breakdown
      if (!m.by_project[pid]) {
        m.by_project[pid] = {
          project_id:     pid,
          project_name:   projMap[pid]?.name || 'Unknown Project',
          total_hours:    0,
          billable_hours: 0,
          non_billable_hours: 0,
          entries_count:  0,
        };
      }
      m.by_project[pid].total_hours    += hrs;
      m.by_project[pid].entries_count  += 1;
      if (isBillable) m.by_project[pid].billable_hours += hrs;
      else m.by_project[pid].non_billable_hours += hrs;
    }

    // Serialise
    const members = Object.values(byMember).map(m => ({
      ...m,
      total_hours:        Math.round(m.total_hours * 100) / 100,
      billable_hours:     Math.round(m.billable_hours * 100) / 100,
      non_billable_hours: Math.round(m.non_billable_hours * 100) / 100,
      approved_hours:     Math.round(m.approved_hours * 100) / 100,
      submitted_hours:    Math.round(m.submitted_hours * 100) / 100,
      draft_hours:        Math.round(m.draft_hours * 100) / 100,
      billable_pct:       m.total_hours > 0 ? Math.round((m.billable_hours / m.total_hours) * 1000) / 10 : 0,
      days_logged:        m.days_logged.size,
      by_project:         Object.values(m.by_project).sort((a, b) => b.total_hours - a.total_hours),
    })).sort((a, b) => b.total_hours - a.total_hours);

    const totalHours    = Math.round(members.reduce((s, m) => s + m.total_hours, 0) * 100) / 100;
    const billableHours = Math.round(members.reduce((s, m) => s + m.billable_hours, 0) * 100) / 100;

    return ResponseHelper.success(res, {
      period: { from, to, label: period },
      summary: {
        total_hours:        totalHours,
        billable_hours:     billableHours,
        non_billable_hours: Math.round((totalHours - billableHours) * 100) / 100,
        billable_pct:       totalHours > 0 ? Math.round((billableHours / totalHours) * 1000) / 10 : 0,
        active_members:     members.length,
        total_entries:      entries.length,
      },
      members,
    });
  }

  // GET /api/time/entries/analytics/user?user_id=...&period=week|month|last_month|custom&date_from=&date_to=
  async userActivity(req, res) {
    const { user_id, period = 'month', date_from, date_to } = req.query;
    const tenantId = req.tenantId;
    if (!user_id) return ResponseHelper.validationError(res, 'user_id is required');

    const istNow = new Date(Date.now() + 5.5 * 3600000);
    let from, to;
    if (period === 'week') {
      const dow = istNow.getUTCDay();
      const mon = new Date(istNow); mon.setUTCDate(istNow.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
      const sun = new Date(mon);   sun.setUTCDate(mon.getUTCDate() + 6);
      from = mon.toISOString().split('T')[0];
      to   = sun.toISOString().split('T')[0];
    } else if (period === 'month') {
      from = `${istNow.getUTCFullYear()}-${String(istNow.getUTCMonth() + 1).padStart(2, '0')}-01`;
      to   = new Date(istNow.getUTCFullYear(), istNow.getUTCMonth() + 1, 0).toISOString().split('T')[0];
    } else if (period === 'last_month') {
      const lm = new Date(istNow.getUTCFullYear(), istNow.getUTCMonth() - 1, 1);
      from = `${lm.getUTCFullYear()}-${String(lm.getUTCMonth() + 1).padStart(2, '0')}-01`;
      to   = new Date(istNow.getUTCFullYear(), istNow.getUTCMonth(), 0).toISOString().split('T')[0];
    } else {
      from = date_from; to = date_to;
    }
    if (!from || !to) return ResponseHelper.validationError(res, 'date_from and date_to required for custom period');

    const entries = await this.db.queryAll(
      `SELECT * FROM ${TABLES.TIME_ENTRIES} WHERE tenant_id = '${DataStoreService.escape(tenantId)}' AND user_id = '${DataStoreService.escape(user_id)}' AND entry_date >= '${from}' AND entry_date <= '${to}' ORDER BY entry_date ASC`
    );

    // Aggregate by day
    const byDay = {};
    for (const e of entries) {
      const date   = String(e.entry_date).split('T')[0].split(' ')[0];
      const hrs    = parseFloat(e.hours) || 0;
      const bill   = String(e.is_billable).toLowerCase() === 'true';
      const status = e.status || TIME_STATUS.DRAFT;
      if (!byDay[date]) byDay[date] = { date, total_hours: 0, billable_hours: 0, non_billable_hours: 0, entries_count: 0, approved_hours: 0, submitted_hours: 0, draft_hours: 0 };
      const d = byDay[date];
      d.total_hours    += hrs; d.entries_count += 1;
      if (bill) d.billable_hours += hrs; else d.non_billable_hours += hrs;
      if (status === TIME_STATUS.APPROVED)        d.approved_hours  += hrs;
      else if (status === TIME_STATUS.SUBMITTED)  d.submitted_hours += hrs;
      else                                        d.draft_hours     += hrs;
    }

    const daily = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({
      date:               d.date,
      total_hours:        Math.round(d.total_hours        * 100) / 100,
      billable_hours:     Math.round(d.billable_hours     * 100) / 100,
      non_billable_hours: Math.round(d.non_billable_hours * 100) / 100,
      entries_count:      d.entries_count,
      approved_hours:     Math.round(d.approved_hours     * 100) / 100,
      submitted_hours:    Math.round(d.submitted_hours    * 100) / 100,
      draft_hours:        Math.round(d.draft_hours        * 100) / 100,
    }));

    return ResponseHelper.success(res, { period: { from, to }, daily });
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
