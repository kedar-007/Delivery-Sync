'use strict';

const DataStoreService = require('../services/DataStoreService');
const AuditService = require('../services/AuditService');
const NotificationService = require('../services/NotificationService');
const ResponseHelper = require('../utils/ResponseHelper');
const { TABLES, ATTENDANCE_STATUS, AUDIT_ACTION, NOTIFICATION_TYPE } = require('../utils/Constants');

/**
 * Format current time as 'YYYY-MM-DD HH:MM:SS' in the given IANA timezone.
 * Falls back to Asia/Kolkata (IST, UTC+5:30) if the timezone is invalid/missing.
 */
// Extract the real client IP from a request, trying all common headers.
// x-forwarded-for may be a comma-separated chain "clientIP, proxy1, proxy2".
function extractClientIp(req) {
  const PRIVATE_RE = /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1$|fd[0-9a-f]{2}:)/i;
  const headers = [
    'x-real-ip',
    'x-forwarded-for',
    'x-client-ip',
    'cf-connecting-ip',
    'true-client-ip',
  ];
  for (const h of headers) {
    const val = req.headers[h];
    if (!val) continue;
    const parts = String(val).split(',').map(s => s.trim().replace(/^::ffff:/, ''));
    const pub = parts.find(ip => ip && !PRIVATE_RE.test(ip));
    if (pub) return pub;
  }
  // All candidates are private/loopback — return first available header value (still useful for LAN whitelists)
  for (const h of headers) {
    const val = req.headers[h];
    if (!val) continue;
    const first = String(val).split(',')[0].trim().replace(/^::ffff:/, '');
    if (first) return first;
  }
  const sock = (req.socket?.remoteAddress || req.connection?.remoteAddress || '').replace(/^::ffff:/, '');
  return sock || '127.0.0.1';
}

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

    const ip = extractClientIp(req);
    const { is_wfh, wfh_reason } = req.body;

    // IP validation before any DB write — prevents orphaned records on rejection
    const ipCheck = await this._validateIpAllowed(req.tenantId, ip);
    if (!ipCheck.allowed && !is_wfh) {
      console.log(`[checkIn] IP blocked: detected="${ip}" headers=${JSON.stringify({ xfwd: req.headers['x-forwarded-for'], xreal: req.headers['x-real-ip'], remote: req.connection?.remoteAddress })}`);
      return ResponseHelper.forbidden(res, `Check-in not allowed from this network (${ip || 'unknown IP'}). Please use the WFH option if working remotely.`);
    }

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

    // Notify reporting manager when checking in as WFH
    if (is_wfh) {
      try {
        const profileRows = await this.db.findWhere(TABLES.USER_PROFILES, tenantId, `user_id = '${userRowId}'`, { limit: 1 });
        const rmId = profileRows[0]?.reporting_manager_id;
        if (rmId) {
          const rmRows = await this.db.query(`SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = '${rmId}' LIMIT 1`);
          if (rmRows[0]) {
            await this.notif.send({
              toEmail: rmRows[0].email,
              subject: `[Delivery Sync] ${req.currentUser.name} is working from home today`,
              htmlBody: `<p>Hi ${rmRows[0].name}, ${req.currentUser.name} has checked in as WFH today (${today}).${wfh_reason ? ' Reason: ' + wfh_reason : ''}</p>`,
            });
            await this.notif.sendInApp({
              tenantId, userId: rmId,
              title: 'WFH Check-in',
              message: `${req.currentUser.name} is working from home today`,
              type: NOTIFICATION_TYPE.GENERAL,
              entityType: 'ATTENDANCE', entityId: record.ROWID,
            });
          }
        }
      } catch (_) {}
    }

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
    const breakMins  = parseFloat(existing[0].total_break_minutes ?? 0);
    const netHours   = Math.max(0, Math.round((workHours - breakMins / 60) * 100) / 100);

    const record = await this.db.update(TABLES.ATTENDANCE_RECORDS, {
      ROWID: existing[0].ROWID,
      check_out_time: formattedNow,
      work_hours: workHours,
      net_work_hours: netHours,
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
    if (!users || users.length === 0) return ResponseHelper.success(res, []);
    const userRowId = users[0].ROWID;
    const records = await this.db.findWhere(TABLES.ATTENDANCE_RECORDS, req.tenantId,
      `user_id = '${userRowId}'`, { orderBy: 'attendance_date DESC', limit: 30 });

    // Attach break summary to today's record so widget can show typed break info
    const profiles = await this.db.findWhere(TABLES.USER_PROFILES, req.tenantId, `user_id = '${userRowId}'`, { limit: 1 });
    const today = getNowInTZ(profiles[0]?.timezone).split(' ')[0];
    const breakSummary = await this._buildBreakSummary(req.tenantId, String(userRowId), today);

    const enriched = records.map(r => {
      if (r.attendance_date === today) return { ...r, break_summary: breakSummary };
      return r;
    });
    return ResponseHelper.success(res, enriched);
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

  // POST /api/people/attendance/break-start
  async breakStart(req, res) {
    const tenantId = req.tenantId;
    const users = await this.db.findWhere(TABLES.USERS, tenantId, `email = '${req.currentUser.email}'`, { limit: 1 });
    if (!users.length) return ResponseHelper.notFound(res, 'User not found');
    const userRowId = users[0].ROWID;

    const ip = extractClientIp(req);
    const ipCheck = await this._validateIpAllowed(tenantId, ip);
    if (!ipCheck.allowed) {
      return ResponseHelper.forbidden(res, `Breaks can only be recorded from an allowed network (${ip || 'unknown IP'}).`);
    }

    const break_type = ((req.body.break_type || 'SHORT') + '').toUpperCase();
    if (!['LUNCH', 'SHORT'].includes(break_type)) {
      return ResponseHelper.validationError(res, 'break_type must be LUNCH or SHORT');
    }

    let formattedNow;
    if (req.body.client_time) {
      formattedNow = String(req.body.client_time).replace('T', ' ').slice(0, 19);
    } else {
      const profiles = await this.db.findWhere(TABLES.USER_PROFILES, tenantId, `user_id = '${userRowId}'`, { limit: 1 });
      formattedNow = getNowInTZ(profiles[0]?.timezone);
    }
    const today = formattedNow.split(' ')[0];

    const existing = await this.db.findWhere(TABLES.ATTENDANCE_RECORDS, tenantId,
      `user_id = '${userRowId}' AND attendance_date = '${today}'`, { limit: 1 });
    if (!existing.length || !existing[0].check_in_time) return ResponseHelper.validationError(res, 'Must be checked in before starting a break');
    if (existing[0].check_out_time) return ResponseHelper.validationError(res, 'Already checked out');

    // Check for any currently active break in the new breaks table
    let activeBreaks = [];
    try {
      activeBreaks = await this.db.findWhere(TABLES.ATTENDANCE_BREAKS, tenantId,
        `user_id = '${userRowId}' AND attendance_date = '${today}' AND status = 'ACTIVE'`, { limit: 1 });
    } catch (_) {}
    if (activeBreaks.length > 0) {
      return ResponseHelper.conflict(res, `A ${activeBreaks[0].break_type} break is already in progress`);
    }

    // Insert new typed break record — no empty strings, all numeric values stored as strings
    try {
      await this.db.insert(TABLES.ATTENDANCE_BREAKS, {
        tenant_id:        String(tenantId),
        user_id:          String(userRowId),
        attendance_date:  today,
        break_type,
        break_start:      formattedNow,
        break_end:        formattedNow,   // placeholder overwritten on end; queried by status not break_end
        status:           'ACTIVE',
        duration_minutes: '0',
        exceeded_minutes: '0',
      });
    } catch (e) {
      if (e.message && (e.message.includes('No privileges') || e.message.includes('Invalid input'))) {
        return ResponseHelper.serverError(res, `attendance_breaks table error: ${e.message}. Ensure the table exists with correct columns.`);
      }
      throw e;
    }

    // Keep attendance_records.break_start updated for backward compat
    await this.db.update(TABLES.ATTENDANCE_RECORDS, { ROWID: existing[0].ROWID, break_start: formattedNow, break_end: '' });
    return ResponseHelper.success(res, { message: 'Break started', break_type, break_start: formattedNow });
  }

  // POST /api/people/attendance/break-end
  async breakEnd(req, res) {
    const tenantId = req.tenantId;
    const users = await this.db.findWhere(TABLES.USERS, tenantId, `email = '${req.currentUser.email}'`, { limit: 1 });
    if (!users.length) return ResponseHelper.notFound(res, 'User not found');
    const userRowId = users[0].ROWID;

    const ip = extractClientIp(req);
    const ipCheck = await this._validateIpAllowed(tenantId, ip);
    if (!ipCheck.allowed) {
      return ResponseHelper.forbidden(res, `Breaks can only be ended from an allowed network (${ip || 'unknown IP'}).`);
    }

    let formattedNow;
    if (req.body.client_time) {
      formattedNow = String(req.body.client_time).replace('T', ' ').slice(0, 19);
    } else {
      const profiles = await this.db.findWhere(TABLES.USER_PROFILES, tenantId, `user_id = '${userRowId}'`, { limit: 1 });
      formattedNow = getNowInTZ(profiles[0]?.timezone);
    }
    const today = formattedNow.split(' ')[0];

    // Find active break using status column — avoids empty-string comparison issues
    let activeBreaks = [];
    let useNewTable = false;
    try {
      activeBreaks = await this.db.findWhere(TABLES.ATTENDANCE_BREAKS, tenantId,
        `user_id = '${userRowId}' AND attendance_date = '${today}' AND status = 'ACTIVE'`, { limit: 1 });
      useNewTable = true;
    } catch (_) {}

    if (!useNewTable || activeBreaks.length === 0) {
      // Backward compat: fall back to attendance_records columns
      const existing = await this.db.findWhere(TABLES.ATTENDANCE_RECORDS, tenantId,
        `user_id = '${userRowId}' AND attendance_date = '${today}'`, { limit: 1 });
      if (!existing.length) return ResponseHelper.notFound(res, 'No attendance record for today');
      if (!existing[0].break_start || existing[0].break_end) return ResponseHelper.validationError(res, 'No active break found');
      const ms = Math.round((new Date(formattedNow.replace(' ', 'T') + 'Z') - new Date(existing[0].break_start.replace(' ', 'T') + 'Z')) / 60000);
      const total = (parseFloat(existing[0].total_break_minutes ?? 0) + ms);
      await this.db.update(TABLES.ATTENDANCE_RECORDS, { ROWID: existing[0].ROWID, break_end: formattedNow, total_break_minutes: total });
      return ResponseHelper.success(res, { message: 'Break ended', break_minutes: ms, total_break_minutes: total });
    }

    const active = activeBreaks[0];
    const durationMins = Math.round(
      (new Date(formattedNow.replace(' ', 'T') + 'Z') - new Date(active.break_start.replace(' ', 'T') + 'Z')) / 60000
    );
    const ALLOWANCES = { LUNCH: 60, SHORT: 15 };
    const allowance = ALLOWANCES[active.break_type] || 15;
    const exceededMins = Math.max(0, durationMins - allowance);

    // Mark break as DONE and persist exceeded_minutes — store numerics as strings
    await this.db.update(TABLES.ATTENDANCE_BREAKS, {
      ROWID:            active.ROWID,
      break_end:        formattedNow,
      status:           'DONE',
      duration_minutes: String(durationMins),
      exceeded_minutes: String(exceededMins),
    });

    // Recalculate total break minutes from all DONE breaks today
    let allBreaks = [];
    try {
      allBreaks = await this.db.findWhere(TABLES.ATTENDANCE_BREAKS, tenantId,
        `user_id = '${userRowId}' AND attendance_date = '${today}' AND status = 'DONE'`, { limit: 100 });
    } catch (_) {}
    const totalMins = allBreaks.reduce((sum, b) => sum + (parseFloat(b.duration_minutes) || 0), 0);

    // Update attendance_records with running totals
    const recRows = await this.db.findWhere(TABLES.ATTENDANCE_RECORDS, tenantId,
      `user_id = '${userRowId}' AND attendance_date = '${today}'`, { limit: 1 });
    if (recRows.length) {
      await this.db.update(TABLES.ATTENDANCE_RECORDS, {
        ROWID: recRows[0].ROWID,
        break_end: formattedNow,
        total_break_minutes: totalMins,
      });
    }

    return ResponseHelper.success(res, {
      message: 'Break ended',
      break_type:       active.break_type,
      break_minutes:    durationMins,
      exceeded_minutes: exceededMins,
      total_break_minutes: totalMins,
    });
  }

  // GET /api/people/attendance/ip-config
  async getIpConfig(req, res) {
    try {
      const rows = await this.db.findWhere(TABLES.IP_WHITELISTS, req.tenantId, `is_active = 'true'`, { orderBy: 'CREATEDTIME ASC', limit: 100 });
      return ResponseHelper.success(res, rows);
    } catch (_) {
      return ResponseHelper.success(res, []);
    }
  }

  // POST /api/people/attendance/ip-config
  async addIpConfig(req, res) {
    const { label, ip_address } = req.body;
    if (!label || !ip_address) return ResponseHelper.validationError(res, 'label and ip_address are required');
    try {
      const row = await this.db.insert(TABLES.IP_WHITELISTS, {
        tenant_id: String(req.tenantId),
        label: DataStoreService.escape(label),
        ip_address: DataStoreService.escape(ip_address),
        is_active: 'true',
        created_by: String(req.currentUser.id),
      });
      return ResponseHelper.created(res, row);
    } catch (e) {
      if (e.message && e.message.includes('No privileges')) {
        return ResponseHelper.serverError(res, 'The ip_whitelists table does not exist in Catalyst DataStore. Please create it first — see setup instructions.');
      }
      return ResponseHelper.serverError(res, e.message || 'Failed to add IP address');
    }
  }

  // DELETE /api/people/attendance/ip-config/:configId
  async deleteIpConfig(req, res) {
    const row = await this.db.findById(TABLES.IP_WHITELISTS, req.params.configId, req.tenantId);
    if (!row) return ResponseHelper.notFound(res, 'IP config not found');
    await this.db.update(TABLES.IP_WHITELISTS, { ROWID: req.params.configId, is_active: 'false' });
    return ResponseHelper.success(res, { message: 'IP removed' });
  }

  // GET /api/people/attendance/ip-config/settings
  async getIpSettings(req, res) {
    try {
      const rows = await this.db.query(
        `SELECT settings FROM ${TABLES.TENANTS} WHERE ROWID = ${req.tenantId} LIMIT 1`
      );
      const settings = rows.length > 0 ? JSON.parse(rows[0].settings || '{}') : {};
      return ResponseHelper.success(res, { enabled: !!settings.ip_restrictions_enabled });
    } catch (_) {
      return ResponseHelper.success(res, { enabled: false });
    }
  }

  // PUT /api/people/attendance/ip-config/settings
  async updateIpSettings(req, res) {
    const enabled = !!req.body.enabled;
    try {
      const rows = await this.db.query(
        `SELECT ROWID, settings FROM ${TABLES.TENANTS} WHERE ROWID = ${req.tenantId} LIMIT 1`
      );
      if (!rows.length) return ResponseHelper.notFound(res, 'Tenant not found');
      const settings = JSON.parse(rows[0].settings || '{}');
      settings.ip_restrictions_enabled = enabled;
      await this.db.update(TABLES.TENANTS, { ROWID: rows[0].ROWID, settings: JSON.stringify(settings) });
      return ResponseHelper.success(res, { enabled });
    } catch (e) {
      return ResponseHelper.serverError(res, e.message || 'Failed to update IP settings');
    }
  }

  // Build break summary for a given user+date. Returns { lunch: {...}, short: {...} }
  async _buildBreakSummary(tenantId, userRowId, date) {
    const ALLOWANCES = { LUNCH: 60, SHORT: 15 };
    const summary = {
      lunch: { allowance_minutes: 60, used_minutes: 0, exceeded_minutes: 0, remaining_minutes: 60, active: null },
      short: { allowance_minutes: 15, used_minutes: 0, exceeded_minutes: 0, remaining_minutes: 15, active: null },
    };
    try {
      const breaks = await this.db.findWhere(TABLES.ATTENDANCE_BREAKS, tenantId,
        `user_id = '${userRowId}' AND attendance_date = '${date}'`, { orderBy: 'CREATEDTIME ASC', limit: 100 });
      const nowMs = Date.now();
      for (const b of breaks) {
        const type = b.break_type === 'LUNCH' ? 'lunch' : 'short';
        if (b.status === 'DONE') {
          // Completed — use persisted values from DB
          summary[type].used_minutes     += parseFloat(b.duration_minutes) || 0;
          summary[type].exceeded_minutes += parseFloat(b.exceeded_minutes) || 0;
        } else {
          // ACTIVE — compute elapsed client-side from break_start
          const elapsed = Math.floor((nowMs - new Date(b.break_start.replace(' ', 'T') + 'Z').getTime()) / 60000);
          const liveExceeded = Math.max(0, elapsed - (ALLOWANCES[b.break_type] || 15));
          summary[type].active = {
            id: String(b.ROWID), break_type: b.break_type,
            break_start: b.break_start, elapsed_minutes: elapsed,
            exceeded_minutes: liveExceeded,
          };
          summary[type].used_minutes     += elapsed;
          summary[type].exceeded_minutes += liveExceeded;
        }
      }
      for (const type of ['lunch', 'short']) {
        summary[type].remaining_minutes = Math.max(0, summary[type].allowance_minutes - summary[type].used_minutes);
      }
    } catch (_) {}
    return summary;
  }

  // GET /api/people/attendance/breaks/today
  async getBreakSummary(req, res) {
    const users = await this.db.findWhere(TABLES.USERS, req.tenantId, `email = '${req.currentUser.email}'`, { limit: 1 });
    if (!users.length) return ResponseHelper.notFound(res, 'User not found');
    const userRowId = String(users[0].ROWID);
    const profiles = await this.db.findWhere(TABLES.USER_PROFILES, req.tenantId, `user_id = '${userRowId}'`, { limit: 1 });
    const today = getNowInTZ(profiles[0]?.timezone).split(' ')[0];
    const summary = await this._buildBreakSummary(req.tenantId, userRowId, today);
    return ResponseHelper.success(res, summary);
  }

  // Helper — returns { allowed: true } if IP restrictions disabled, no IPs configured, or IP matches
  async _validateIpAllowed(tenantId, clientIp) {
    try {
      // Check master toggle — if disabled, allow all traffic
      const tenantRows = await this.db.query(
        `SELECT settings FROM ${TABLES.TENANTS} WHERE ROWID = ${tenantId} LIMIT 1`
      );
      if (tenantRows.length > 0) {
        const settings = JSON.parse(tenantRows[0].settings || '{}');
        if (!settings.ip_restrictions_enabled) return { allowed: true };
      } else {
        return { allowed: true };
      }

      const rows = await this.db.findWhere(TABLES.IP_WHITELISTS, tenantId, `is_active = 'true'`, { limit: 100 });
      if (!rows || rows.length === 0) return { allowed: true }; // no IPs configured yet

      const normalised = (clientIp || '').split(',')[0].trim().replace(/^::ffff:/, '');
      for (const row of rows) {
        const allowed = (row.ip_address || '').trim();
        if (this._ipMatches(normalised, allowed)) return { allowed: true };
      }
      return { allowed: false };
    } catch (_) {
      return { allowed: true }; // fail open on any error
    }
  }

  // Simple exact IP or /24 CIDR check
  _ipMatches(ip, cidr) {
    if (!cidr.includes('/')) return ip === cidr;
    try {
      const [base, bits] = cidr.split('/');
      const mask = ~((1 << (32 - parseInt(bits))) - 1) >>> 0;
      const toInt = (a) => a.split('.').reduce((acc, o) => (acc << 8) | parseInt(o), 0) >>> 0;
      return (toInt(ip) & mask) === (toInt(base) & mask);
    } catch (_) { return false; }
  }

  // Check if user has ATTENDANCE_ADMIN via role or permission_overrides
  async _checkAttendanceAdmin(req) {
    try {
      const rows = await this.db.query(
        `SELECT permissions FROM ${TABLES.PERMISSION_OVERRIDES} ` +
        `WHERE tenant_id = '${req.tenantId}' AND user_id = '${req.currentUser.id}' AND is_active = 'true' LIMIT 1`
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
