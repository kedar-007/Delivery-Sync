'use strict';

const DataStoreService = require('../services/DataStoreService');
const AuditService = require('../services/AuditService');
const NotificationService = require('../services/NotificationService');
const ResponseHelper = require('../utils/ResponseHelper');
const { TABLES, ATTENDANCE_STATUS, AUDIT_ACTION } = require('../utils/Constants');

/**
 * Format current time as 'YYYY-MM-DD HH:MM:SS' in the given IANA timezone.
 * Falls back to Asia/Kolkata (IST, UTC+5:30) if the timezone is invalid/missing.
 */
function getNowInTZ(tz) {
  const safeZone = tz && tz.trim() ? tz.trim() : 'Asia/Kolkata';
  try {
    // Intl.DateTimeFormat with sv locale gives ISO-like 'YYYY-MM-DD HH:MM:SS'
    return new Intl.DateTimeFormat('sv', {
      timeZone: safeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).format(new Date()).replace('T', ' ');
  } catch (_) {
    // Unknown timezone — fall back to IST
    const ist = new Date(Date.now() + 5.5 * 3600000);
    return ist.toISOString().replace('T', ' ').slice(0, 19);
  }
}

// Return today's date (YYYY-MM-DD) in the given timezone, default IST
const todayIST = (tz) => getNowInTZ(tz || 'Asia/Kolkata').split(' ')[0];

class AttendanceController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
    this.notif = new NotificationService(catalystApp, this.db);
  }

  // POST /api/people/attendance/check-in
  async checkIn(req, res) {
    const tenantId = req.tenantId;

    // Fetch the actual user ROWID from DB to ensure we have the correct FK value
    const users = await this.db.findWhere(TABLES.USERS, tenantId,
      `email = '${req.currentUser.email}'`, { limit: 1 });
    if (!users || users.length === 0)
      return ResponseHelper.notFound(res, 'User not found');
    const userRowId = users[0].ROWID;

    // Resolve the datetime to store:
    //  1. client_time from the request body (browser local time, most accurate)
    //  2. user's timezone from their profile → compute server-side in that zone
    //  3. default: Asia/Kolkata (IST)
    let formattedNow;
    if (req.body.client_time) {
      formattedNow = String(req.body.client_time).replace('T', ' ').slice(0, 19);
    } else {
      const profiles = await this.db.findWhere(TABLES.USER_PROFILES, tenantId,
        `user_id = '${userRowId}'`, { limit: 1 });
      const tz = profiles[0]?.timezone || 'Asia/Kolkata';
      formattedNow = getNowInTZ(tz);
    }
    const today = formattedNow.split(' ')[0];

    // Check for duplicate
    const existing = await this.db.findWhere(TABLES.ATTENDANCE_RECORDS, tenantId,
      `user_id = '${userRowId}' AND attendance_date = '${today}'`, { limit: 1 });

    if (existing.length > 0 && existing[0].check_in_time)
      return ResponseHelper.conflict(res, 'Already checked in today');

    const ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '';
    const { is_wfh, wfh_reason } = req.body;

    let record;
    if (existing.length > 0) {
      record = await this.db.update(TABLES.ATTENDANCE_RECORDS, {
        ROWID: existing[0].ROWID,
        check_in_time: formattedNow,
        status: is_wfh ? ATTENDANCE_STATUS.WFH : ATTENDANCE_STATUS.PRESENT,
        is_wfh: is_wfh ? 'true' : 'false',
        wfh_reason: wfh_reason || '',
        check_in_ip: ip,
      });
    } else {
      record = await this.db.insert(TABLES.ATTENDANCE_RECORDS, {
        tenant_id:           String(tenantId),
        user_id:             String(userRowId),
        attendance_date:     today,
        check_in_time:       formattedNow,
        work_hours:          0,
        status:              is_wfh ? ATTENDANCE_STATUS.WFH : ATTENDANCE_STATUS.PRESENT,
        is_wfh:              is_wfh ? 'true' : 'false',
        wfh_reason:          wfh_reason || '',
        check_in_ip:         ip,
        is_location_verified:'false',
        override_reason:     '',
      });
    }

    await this.audit.log({
      tenantId,
      entityType: 'ATTENDANCE',
      entityId: record.ROWID,
      action: AUDIT_ACTION.CREATE,
      newValue: { check_in: formattedNow, status: record.status },
      performedBy: userRowId,
    });

    return ResponseHelper.created(res, record);
  }

  // POST /api/people/attendance/check-out
  async checkOut(req, res) {
    const tenantId = req.tenantId;

    // Fetch actual DB ROWID same as checkIn does
    const users = await this.db.findWhere(TABLES.USERS, tenantId,
      `email = '${req.currentUser.email}'`, { limit: 1 });
    if (!users || users.length === 0)
      return ResponseHelper.notFound(res, 'User not found');
    const userRowId = users[0].ROWID;

    // Resolve checkout datetime (same priority as checkIn: client_time > profile tz > IST)
    let formattedNow;
    if (req.body.client_time) {
      formattedNow = String(req.body.client_time).replace('T', ' ').slice(0, 19);
    } else {
      const profiles = await this.db.findWhere(TABLES.USER_PROFILES, tenantId,
        `user_id = '${userRowId}'`, { limit: 1 });
      const tz = profiles[0]?.timezone || 'Asia/Kolkata';
      formattedNow = getNowInTZ(tz);
    }
    const today = formattedNow.split(' ')[0];

    const existing = await this.db.findWhere(TABLES.ATTENDANCE_RECORDS, tenantId,
      `user_id = '${userRowId}' AND attendance_date = '${today}'`, { limit: 1 });
    if (existing.length === 0 || !existing[0].check_in_time)
      return ResponseHelper.validationError(res, 'No check-in found for today');
    if (existing[0].check_out_time)
      return ResponseHelper.conflict(res, 'Already checked out today');

    // Compute work hours: parse both times as if in same timezone (append 'Z' for safe arithmetic)
    const checkInMs  = new Date(existing[0].check_in_time.replace(' ', 'T') + 'Z').getTime();
    const checkOutMs = new Date(formattedNow.replace(' ', 'T') + 'Z').getTime();
    const workHours  = Math.round(((checkOutMs - checkInMs) / 3600000) * 100) / 100;

    const record = await this.db.update(TABLES.ATTENDANCE_RECORDS, {
      ROWID: existing[0].ROWID,
      check_out_time: formattedNow,
      work_hours: workHours,
    });
    await this.audit.log({ tenantId, entityType: 'ATTENDANCE', entityId: existing[0].ROWID, action: AUDIT_ACTION.UPDATE, newValue: { check_out: formattedNow, work_hours: workHours }, performedBy: userRowId });
    return ResponseHelper.success(res, record);
  }

  // GET /api/people/attendance/live
  async live(req, res) {
    try {
      const today = todayIST();
      const allToday = await this.db.findWhere(TABLES.ATTENDANCE_RECORDS, req.tenantId,
        `attendance_date = '${today}'`, { limit: 200 });
      const records = allToday.filter(r => r.check_in_time && !r.check_out_time);

      // Enrich with user name and avatar
      const users = await this.db.findAll(TABLES.USERS, { tenant_id: req.tenantId }, { limit: 200 });
      const userMap = {};
      users.forEach(u => { userMap[String(u.ROWID)] = u; });

      const enriched = records.map(r => {
        const u = userMap[String(r.user_id)] || {};
        return {
          ...r,
          name: u.name || 'Unknown',
          email: u.email || '',
          avatar_url: u.avatar_url || '',
        };
      });
      return ResponseHelper.success(res, enriched);
    } catch (err) {
      console.error('[AttendanceController.live]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // GET /api/people/attendance/my-record
  async myRecord(req, res) {
    const users = await this.db.findWhere(TABLES.USERS, req.tenantId,
      `email = '${req.currentUser.email}'`, { limit: 1 });
    if (!users || users.length === 0)
      return ResponseHelper.success(res, []);
    const records = await this.db.findWhere(TABLES.ATTENDANCE_RECORDS, req.tenantId,
      `user_id = '${users[0].ROWID}'`, { orderBy: 'attendance_date DESC', limit: 30 });
    return ResponseHelper.success(res, records);
  }

  // Fetch all rows up to maxRows by paginating in chunks of 200 (Catalyst ZCQL max)
  async _fetchAllPaginated(tableName, tenantId, whereExtra, orderBy, maxRows = 2000) {
    const PAGE = 200;
    const results = [];
    let offset = 0;
    while (results.length < maxRows) {
      const tenantClause = `tenant_id = '${tenantId}'`;
      const fullWhere = whereExtra ? `${tenantClause} AND ${whereExtra}` : tenantClause;
      const sql = `SELECT * FROM ${tableName} WHERE ${fullWhere} ORDER BY ${orderBy} LIMIT ${PAGE} OFFSET ${offset}`;
      let page;
      try { page = await this.db.query(sql); } catch (_) { break; }
      if (!page || page.length === 0) break;
      results.push(...page);
      if (page.length < PAGE) break;
      offset += PAGE;
    }
    return results;
  }

  // GET /api/people/attendance/records?user_id=&date_from=&date_to=
  async records(req, res) {
    const { user_id, date_from, date_to } = req.query;
    let where = '';
    let uid = user_id || null;

    // Restrict to own records unless user has ATTENDANCE_ADMIN permission
    // RBAC already enforced ATTENDANCE_READ; check if they also have ATTENDANCE_ADMIN
    const MANAGER_ROLES = ['TENANT_ADMIN', 'PMO', 'DELIVERY_LEAD'];
    const isManager = MANAGER_ROLES.includes(req.currentUser.role);
    const hasAdminPerm = await this._checkAttendanceAdmin(req);

    if (!isManager && !hasAdminPerm) {
      // Restrict to own records
      const users = await this.db.findWhere(TABLES.USERS, req.tenantId,
        `email = '${req.currentUser.email}'`, { limit: 1 });
      uid = users && users.length > 0 ? String(users[0].ROWID) : req.currentUser.id;
    }

    if (uid) where += `user_id = '${DataStoreService.escape(uid)}' AND `;
    if (date_from) where += `attendance_date >= '${DataStoreService.escape(date_from)}' AND `;
    if (date_to) where += `attendance_date <= '${DataStoreService.escape(date_to)}' AND `;
    where = where.replace(/ AND $/, '');

    const recs = await this.db.findWhere(TABLES.ATTENDANCE_RECORDS, req.tenantId, where, { orderBy: 'attendance_date DESC', limit: 200 });
    const users = await this._fetchAllPaginated(TABLES.USERS, req.tenantId, '', 'CREATEDTIME DESC', 1000);
    const userMap = {};
    users.forEach(u => { userMap[String(u.ROWID)] = u; });
    const enriched = recs.map(r => {
      const u = userMap[String(r.user_id)] || {};
      return { ...r, name: u.name || 'Unknown', email: u.email || '', avatar_url: u.avatar_url || '' };
    });
    return ResponseHelper.success(res, enriched);
  }

  // Check if user has ATTENDANCE_ADMIN via role or permission_overrides
  async _checkAttendanceAdmin(req) {
    try {
      const rows = await this.db.query(
        `SELECT permissions FROM ${TABLES.PERMISSION_OVERRIDES} ` +
        `WHERE tenant_id = '${req.tenantId}' AND user_id = '${req.currentUser.id}' AND is_active = true LIMIT 1`
      );
      if (rows.length > 0) {
        const parsed = JSON.parse(rows[0].permissions || '{}');
        const granted = parsed.granted || [];
        const revoked = parsed.revoked || [];
        if (revoked.includes('ATTENDANCE_ADMIN')) return false;
        if (granted.includes('ATTENDANCE_ADMIN')) return true;
      }
    } catch (_) { /* table not created yet */ }
    return false;
  }

  // POST /api/people/attendance/wfh
  async markWfh(req, res) {
    const { wfh_reason } = req.body;

    const users = await this.db.findWhere(TABLES.USERS, req.tenantId,
      `email = '${req.currentUser.email}'`, { limit: 1 });
    if (!users || users.length === 0)
      return ResponseHelper.notFound(res, 'User not found');
    const userRowId = users[0].ROWID;

    const profiles = await this.db.findWhere(TABLES.USER_PROFILES, req.tenantId,
      `user_id = '${userRowId}'`, { limit: 1 });
    const today = todayIST(profiles[0]?.timezone);

    const existing = await this.db.findWhere(TABLES.ATTENDANCE_RECORDS, req.tenantId,
      `user_id = '${userRowId}' AND attendance_date = '${today}'`, { limit: 1 });

    if (existing.length > 0) {
      await this.db.update(TABLES.ATTENDANCE_RECORDS, { ROWID: existing[0].ROWID, is_wfh: 'true', wfh_reason: wfh_reason || '', status: ATTENDANCE_STATUS.WFH });
    } else {
      await this.db.insert(TABLES.ATTENDANCE_RECORDS, {
        tenant_id:           String(req.tenantId),
        user_id:             String(userRowId),
        attendance_date:     today,
        work_hours:          0,
        status:              ATTENDANCE_STATUS.WFH,
        is_wfh:              'true',
        wfh_reason:          wfh_reason || '',
        is_location_verified:'false',
        check_in_ip:         '',
        override_reason:     '',
      });
    }
    return ResponseHelper.success(res, { message: 'WFH marked for today' });
  }

  // PATCH /api/people/attendance/:recordId/override
  async override(req, res) {
    const { status, override_reason } = req.body;
    if (!status || !override_reason) return ResponseHelper.validationError(res, 'status and override_reason required');
    const record = await this.db.findById(TABLES.ATTENDANCE_RECORDS, req.params.recordId, req.tenantId);
    if (!record) return ResponseHelper.notFound(res, 'Attendance record not found');
    await this.db.update(TABLES.ATTENDANCE_RECORDS, { ROWID: req.params.recordId, status, override_reason, overridden_by: String(req.currentUser.id) });
    await this.audit.log({ tenantId: req.tenantId, entityType: 'ATTENDANCE', entityId: req.params.recordId, action: AUDIT_ACTION.UPDATE, oldValue: { status: record.status }, newValue: { status, override_reason }, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, { message: 'Attendance overridden' });
  }

  // GET /api/people/attendance/anomalies
  async anomalies(req, res) {
    try {
      const today = todayIST();
      const absent = await this.db.findWhere(TABLES.ATTENDANCE_RECORDS, req.tenantId,
        `attendance_date = '${today}' AND (status = 'ABSENT' OR status = 'LATE')`, { limit: 100 });

      // Enrich with user name and avatar
      const users = await this.db.findAll(TABLES.USERS, { tenant_id: req.tenantId }, { limit: 200 });
      const userMap = {};
      users.forEach(u => { userMap[String(u.ROWID)] = u; });

      const enriched = absent.map(r => {
        const u = userMap[String(r.user_id)] || {};
        return { ...r, name: u.name || 'Unknown', email: u.email || '', avatar_url: u.avatar_url || '' };
      });
      return ResponseHelper.success(res, enriched);
    } catch (err) {
      console.error('[AttendanceController.anomalies]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // GET /api/people/attendance/summary
  async summary(req, res) {
    const { user_id, year, month } = req.query;
    let uid = user_id;
    if (!uid) {
      const users = await this.db.findWhere(TABLES.USERS, req.tenantId,
        `email = '${req.currentUser.email}'`, { limit: 1 });
      uid = users && users.length > 0 ? users[0].ROWID : req.currentUser.id;
    }
    const istNow = new Date(Date.now() + 5.5 * 3600000);
    const y = year || istNow.getUTCFullYear();
    const m = String(month || istNow.getUTCMonth() + 1).padStart(2, '0');
    const from = `${y}-${m}-01`;
    const to   = `${y}-${m}-31`;
    const records = await this.db.findWhere(TABLES.ATTENDANCE_RECORDS, req.tenantId,
      `user_id = '${DataStoreService.escape(uid)}' AND attendance_date >= '${from}' AND attendance_date <= '${to}'`, { limit: 35 });

    const summary = { present: 0, absent: 0, wfh: 0, late: 0, total_hours: 0 };
    for (const r of records) {
      if (r.status === 'PRESENT') summary.present++;
      else if (r.status === 'ABSENT') summary.absent++;
      else if (r.status === 'WFH') { summary.wfh++; summary.present++; }
      else if (r.status === 'LATE') { summary.late++; summary.present++; }
      summary.total_hours += parseFloat(r.work_hours) || 0;
    }
    return ResponseHelper.success(res, { summary, records });
  }

  // GET /api/people/attendance/export?date_from=&date_to=&user_id=
  // Returns CSV — ATTENDANCE_ADMIN permission required
  async exportCsv(req, res) {
    try {
      const { date_from, date_to, user_id } = req.query;

      let where = '';
      if (user_id) where += `user_id = '${DataStoreService.escape(user_id)}' AND `;
      if (date_from) where += `attendance_date >= '${DataStoreService.escape(date_from)}' AND `;
      if (date_to) where += `attendance_date <= '${DataStoreService.escape(date_to)}' AND `;
      where = where.replace(/ AND $/, '');

      // Paginate — Catalyst ZCQL max is 200 rows per query
      const recs = await this._fetchAllPaginated(
        TABLES.ATTENDANCE_RECORDS, req.tenantId, where, 'attendance_date DESC'
      );

      // Fetch all users for name enrichment (paginated too)
      const users = await this._fetchAllPaginated(TABLES.USERS, req.tenantId, '', 'CREATEDTIME DESC');
      const userMap = {};
      users.forEach(u => { userMap[String(u.ROWID)] = u; });

      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const rows = recs.map(r => {
        const u = userMap[String(r.user_id)] || {};
        return [
          esc(u.name || 'Unknown'),
          esc(u.email || ''),
          esc(r.attendance_date || ''),
          esc(r.status || ''),
          esc(r.check_in_time || ''),
          esc(r.check_out_time || ''),
          esc(r.work_hours ?? ''),
          esc(r.is_wfh === 'true' ? 'Yes' : 'No'),
          esc(r.override_reason || ''),
        ].join(',');
      });

      const csv = [
        'Name,Email,Date,Status,Check In,Check Out,Hours,WFH,Override Reason',
        ...rows,
      ].join('\n');

      // Filename: "{UserName}_attendance_{from}_to_{to}.csv" or "all_users_attendance_{from}_to_{to}.csv"
      let nameSlug = 'all_users';
      if (user_id && userMap[String(user_id)]) {
        nameSlug = (userMap[String(user_id)].name || 'user').replace(/\s+/g, '_');
      }
      const filename = `${nameSlug}_attendance_${date_from || 'all'}_to_${date_to || 'all'}.csv`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (err) {
      console.error('[AttendanceController.exportCsv]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = AttendanceController;
