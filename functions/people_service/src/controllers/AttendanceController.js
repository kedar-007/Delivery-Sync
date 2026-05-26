'use strict';

const DataStoreService = require('../services/DataStoreService');
const AuditService = require('../services/AuditService');
const NotificationService = require('../services/NotificationService');
const TeamScopeService = require('../services/TeamScopeService');
const ResponseHelper = require('../utils/ResponseHelper');
const { TABLES, PERMISSIONS, ATTENDANCE_STATUS, AUDIT_ACTION, NOTIFICATION_TYPE } = require('../utils/Constants');

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
  constructor(catalystApp, adminCatalystApp) {
    this.db = new DataStoreService(catalystApp);
    this.adminDb = new DataStoreService(adminCatalystApp || catalystApp);
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

    // Store check-in time as UTC so all clients parse it consistently.
    // Use the user's shift timezone only to determine attendance_date (which day they're on).
    const profiles = await this.db.findWhere(TABLES.USER_PROFILES, tenantId,
      `user_id = '${userRowId}'`, { limit: 1 });
    const tz = profiles[0]?.timezone || 'Asia/Kolkata';
    const today = getNowInTZ(tz).split(' ')[0]; // attendance date in the user's shift timezone
    const formattedNow = new Date().toISOString().replace('T', ' ').slice(0, 19); // UTC

    // Check for duplicate
    const existing = await this.db.findWhere(TABLES.ATTENDANCE_RECORDS, tenantId,
      `user_id = '${userRowId}' AND attendance_date = '${today}'`, { limit: 1 });

    if (existing.length > 0 && existing[0].check_in_time)
      return ResponseHelper.conflict(res, 'Already checked in today');

    const ip = extractClientIp(req);
    const { is_wfh, wfh_reason } = req.body;

    // IP + Geo validation run concurrently before any DB write — prevents orphaned records on rejection
    const [ipCheck, { countryCheck, zoneCheck }] = await Promise.all([
      this._validateIpAllowed(req.tenantId, ip),
      this._runLocationChecks(req.tenantId, ip),
    ]);
    if (is_wfh) {
      const approvedWfh = await this.db.findWhere(TABLES.WFH_REQUESTS, tenantId,
        `user_id = '${userRowId}' AND wfh_date <= '${today}' AND (wfh_date_to >= '${today}' OR (wfh_date_to = '' AND wfh_date = '${today}')) AND status = 'APPROVED'`, { limit: 1 });
      if (approvedWfh.length === 0)
        return ResponseHelper.forbidden(res, 'You need an approved WFH request for today before checking in as WFH. Please submit a request first.');
    }

    if (!is_wfh) {
      if (!ipCheck.allowed) {
        console.log(`[checkIn] IP blocked: detected="${ip}" headers=${JSON.stringify({ xfwd: req.headers['x-forwarded-for'], xreal: req.headers['x-real-ip'], remote: req.connection?.remoteAddress })}`);
        return ResponseHelper.forbidden(res, `Check-in not allowed from this network (${ip || 'unknown IP'}). Please use the WFH option if working remotely.`);
      }
      if (!countryCheck.allowed) {
        console.log(`[checkIn] Country blocked: detected="${countryCheck.country}" (${countryCheck.countryCode}) ip="${ip}"`);
        return ResponseHelper.forbidden(res, `Check-in not allowed from your country (${countryCheck.country || countryCheck.countryCode || 'unknown'}). Please use the WFH option if working remotely.`);
      }
      if (!zoneCheck.allowed) {
        const loc = [zoneCheck.city, zoneCheck.regionName].filter(Boolean).join(', ') || 'unknown location';
        console.log(`[checkIn] Zone blocked: detected="${loc}" ip="${ip}"`);
        return ResponseHelper.forbidden(res, `Check-in not allowed from your location (${loc}). Please use the WFH option if working remotely.`);
      }
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

    // Late check-in detection — runs after record is created, non-blocking
    if (!is_wfh) {
      try {
        const shift = await this._getUserShift(tenantId, userRowId);
        if (shift) {
          const shiftStartUTC = this._shiftStartUTC(today, shift.start_time, shift.timezone || 'Asia/Kolkata');
          const checkInUTC = new Date(formattedNow.replace(' ', 'T') + 'Z');
          const diffMs = checkInUTC.getTime() - shiftStartUTC.getTime();
          const graceMs = (parseInt(shift.grace_minutes) || 15) * 60000;
          if (diffMs > graceMs) {
            const minutesLate = Math.floor(diffMs / 60000);
            await this._handleLateCheckIn(tenantId, userRowId, req, record, minutesLate, shift);
          }
        }
      } catch (lateErr) {
        console.warn('[checkIn] late detection error (non-fatal):', lateErr.message);
      }
    }

    // Notify reporting manager when checking in as WFH
    if (is_wfh) {
      try {
        const profileRows = await this.db.findWhere(TABLES.USER_PROFILES, tenantId, `user_id = '${userRowId}'`, { limit: 1 });
        const rmId = profileRows[0]?.reporting_manager_id;
        if (rmId) {
          const rmRows = await this.db.query(`SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = '${rmId}' LIMIT 1`);
          if (rmRows[0]) {
            // Escape free-text fields (names, reason) before injecting into HTML
            await this.notif.send({
              toEmail: rmRows[0].email,
              subject: `[Delivery Sync] ${req.currentUser.name} is working from home today`,
              htmlBody: `<p>Hi ${_escapeHtml(rmRows[0].name)}, ${_escapeHtml(req.currentUser.name)} has checked in as WFH today (${_escapeHtml(today)}).${wfh_reason ? ' Reason: ' + _escapeHtml(wfh_reason) : ''}</p>`,
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

    // Store checkout time as UTC; use shift timezone only for attendance_date lookup.
    const coProfiles = await this.db.findWhere(TABLES.USER_PROFILES, tenantId,
      `user_id = '${userRowId}'`, { limit: 1 });
    const coTz = coProfiles[0]?.timezone || 'Asia/Kolkata';
    const today = getNowInTZ(coTz).split(' ')[0];
    const formattedNow = new Date().toISOString().replace('T', ' ').slice(0, 19); // UTC

    // First try today's date; if not found, look for the most recent open check-in within 36 hours
    // This handles cross-midnight shifts (e.g., US shift workers in India checking out the next morning)
    let existing = await this.db.findWhere(TABLES.ATTENDANCE_RECORDS, tenantId,
      `user_id = '${userRowId}' AND attendance_date = '${today}'`, { limit: 1 });

    if (existing.length === 0 || !existing[0].check_in_time) {
      // Look for the most recent open record (checked in but not yet checked out) within last 36 hours
      const cutoff = new Date(Date.now() - 36 * 3600000).toISOString().replace('T', ' ').slice(0, 19);
      const recent = await this.db.findWhere(TABLES.ATTENDANCE_RECORDS, tenantId,
        `user_id = '${userRowId}' AND check_in_time > '${cutoff}'`,
        { orderBy: 'check_in_time DESC', limit: 5 });
      const openRecord = recent.find(r => r.check_in_time && !r.check_out_time);
      if (!openRecord) return ResponseHelper.validationError(res, 'No open check-in found (checked in within the last 36 hours)');
      existing = [openRecord];
    }

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

      // Team-scope filter: managers see all; team leads see their team; others see all.
      const allowedIds = await this._resolveTeamAllowedIds(req);

      const visible = allowedIds
        ? records.filter(r => allowedIds.has(String(r.user_id)))
        : records;

      const enriched = visible.map(r => {
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

    // Visibility ladder (most permissive first):
    //   1. ATTENDANCE_ADMIN or legacy manager role → see everyone
    //   2. ATTENDANCE_TEAM_VIEW                    → see team peers only
    //   3. (fallback)                              → own records only
    const MANAGER_ROLES = ['TENANT_ADMIN', 'PMO', 'DELIVERY_LEAD'];
    const isManager     = MANAGER_ROLES.includes(req.currentUser.role);
    const hasAdminPerm  = await this._checkAttendanceAdmin(req);
    const userPerms     = Array.isArray(req.currentUser.permissions) ? req.currentUser.permissions : [];
    const hasTeamView   = userPerms.includes(PERMISSIONS.ATTENDANCE_TEAM_VIEW);

    // Resolve caller's own row id once — used for both own-only and team-view
    // branches.
    let callerUid = null;
    {
      const users = await this.db.findWhere(TABLES.USERS, req.tenantId,
        `email = '${req.currentUser.email}'`, { limit: 1 });
      callerUid = users && users.length > 0 ? String(users[0].ROWID) : req.currentUser.id;
    }

    if (isManager || hasAdminPerm) {
      // No additional restriction — optional user_id filter passes through.
      if (uid) where += `user_id = '${DataStoreService.escape(uid)}' AND `;
    } else if (hasTeamView || await this._isTeamLead(req.tenantId, callerUid)) {
      // Team peer scope. Build a list of allowed user IDs and intersect with
      // any explicit user_id query param (so a manager can drill into one
      // peer at a time without accidentally seeing someone outside their
      // teams).
      const scope = new TeamScopeService(this.db);
      const peerIds = await scope.getTeamPeerUserIds(req.tenantId, callerUid);
      let allowed = peerIds;
      if (uid) {
        allowed = peerIds.filter((id) => String(id) === String(uid));
        if (allowed.length === 0) {
          return ResponseHelper.success(res, []);  // requested user isn't a peer
        }
      }
      if (allowed.length === 0) {
        // Shouldn't happen (scope always includes self), but guard anyway.
        where += `user_id = '${DataStoreService.escape(callerUid)}' AND `;
      } else if (allowed.length === 1) {
        where += `user_id = '${DataStoreService.escape(allowed[0])}' AND `;
      } else {
        const inList = allowed.map((id) => `'${DataStoreService.escape(id)}'`).join(',');
        where += `user_id IN (${inList}) AND `;
      }
    } else {
      // No elevated permission — restrict to own records (legacy behaviour).
      uid = callerUid;
      where += `user_id = '${DataStoreService.escape(uid)}' AND `;
    }

    if (date_from) where += `attendance_date >= '${DataStoreService.escape(date_from)}' AND `;
    if (date_to)   where += `attendance_date <= '${DataStoreService.escape(date_to)}' AND `;
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

    const break_type = ((req.body.break_type || 'SHORT') + '').toUpperCase();
    if (!['LUNCH', 'SHORT'].includes(break_type)) {
      return ResponseHelper.validationError(res, 'break_type must be LUNCH or SHORT');
    }

    // Store break time as UTC; use shift timezone only for attendance_date lookup.
    const bsProfiles = await this.db.findWhere(TABLES.USER_PROFILES, tenantId, `user_id = '${userRowId}'`, { limit: 1 });
    const bsTz = bsProfiles[0]?.timezone || 'Asia/Kolkata';
    const today = getNowInTZ(bsTz).split(' ')[0];
    const formattedNow = new Date().toISOString().replace('T', ' ').slice(0, 19); // UTC

    const existing = await this.db.findWhere(TABLES.ATTENDANCE_RECORDS, tenantId,
      `user_id = '${userRowId}' AND attendance_date = '${today}'`, { limit: 1 });
    if (!existing.length || !existing[0].check_in_time) return ResponseHelper.validationError(res, 'Must be checked in before starting a break');
    if (existing[0].check_out_time) return ResponseHelper.validationError(res, 'Already checked out');

    // IP + Geo check for office workers only — WFH workers are already remote.
    const isWfhRecord = existing[0].is_wfh === 'true' || existing[0].is_wfh === true;
    if (!isWfhRecord) {
      const ip = extractClientIp(req);
      const [ipCheck, { countryCheck, zoneCheck }] = await Promise.all([
        this._validateIpAllowed(tenantId, ip),
        this._runLocationChecks(tenantId, ip),
      ]);
      if (!ipCheck.allowed) {
        console.log(`[breakStart] IP blocked: user=${req.currentUser.email} detected="${ip}" headers=${JSON.stringify({ xfwd: req.headers['x-forwarded-for'], xreal: req.headers['x-real-ip'] })}`);
        return ResponseHelper.forbidden(res, `Breaks can only be recorded from the office network. Detected IP: ${ip || 'unknown'}`);
      }
      if (!countryCheck.allowed) {
        console.log(`[breakStart] Country blocked: user=${req.currentUser.email} country="${countryCheck.country}" ip="${ip}"`);
        return ResponseHelper.forbidden(res, `Breaks can only be recorded from an allowed country. Detected: ${countryCheck.country || 'unknown'}`);
      }
      if (!zoneCheck.allowed) {
        const loc = [zoneCheck.city, zoneCheck.regionName].filter(Boolean).join(', ') || 'unknown location';
        console.log(`[breakStart] Zone blocked: user=${req.currentUser.email} location="${loc}" ip="${ip}"`);
        return ResponseHelper.forbidden(res, `Breaks can only be recorded from an allowed zone. Detected: ${loc}`);
      }
    }

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

    // Store break-end time as UTC; use shift timezone only for attendance_date lookup.
    const beProfiles = await this.db.findWhere(TABLES.USER_PROFILES, tenantId, `user_id = '${userRowId}'`, { limit: 1 });
    const beTz = beProfiles[0]?.timezone || 'Asia/Kolkata';
    const today = getNowInTZ(beTz).split(' ')[0];
    const formattedNow = new Date().toISOString().replace('T', ' ').slice(0, 19); // UTC

    // IP + Geo check for office workers only — WFH workers are already remote.
    const todayRecord = await this.db.findWhere(TABLES.ATTENDANCE_RECORDS, tenantId,
      `user_id = '${userRowId}' AND attendance_date = '${today}'`, { limit: 1 });
    const isWfhRecord = todayRecord[0]?.is_wfh === 'true' || todayRecord[0]?.is_wfh === true;
    if (!isWfhRecord) {
      const ip = extractClientIp(req);
      const [ipCheck, { countryCheck, zoneCheck }] = await Promise.all([
        this._validateIpAllowed(tenantId, ip),
        this._runLocationChecks(tenantId, ip),
      ]);
      if (!ipCheck.allowed) {
        console.log(`[breakEnd] IP blocked: user=${req.currentUser.email} detected="${ip}" headers=${JSON.stringify({ xfwd: req.headers['x-forwarded-for'], xreal: req.headers['x-real-ip'] })}`);
        return ResponseHelper.forbidden(res, `Breaks can only be ended from the office network. Detected IP: ${ip || 'unknown'}`);
      }
      if (!countryCheck.allowed) {
        console.log(`[breakEnd] Country blocked: user=${req.currentUser.email} country="${countryCheck.country}" ip="${ip}"`);
        return ResponseHelper.forbidden(res, `Breaks can only be ended from an allowed country. Detected: ${countryCheck.country || 'unknown'}`);
      }
      if (!zoneCheck.allowed) {
        const loc = [zoneCheck.city, zoneCheck.regionName].filter(Boolean).join(', ') || 'unknown location';
        console.log(`[breakEnd] Zone blocked: user=${req.currentUser.email} location="${loc}" ip="${ip}"`);
        return ResponseHelper.forbidden(res, `Breaks can only be ended from an allowed zone. Detected: ${loc}`);
      }
    }

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
      await this.audit.log({ tenantId: req.tenantId, entityType: 'IP_CONFIG', entityId: String(row.ROWID), action: AUDIT_ACTION.CREATE, newValue: { label, ip_address }, performedBy: req.currentUser.id });
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
    await this.audit.log({ tenantId: req.tenantId, entityType: 'IP_CONFIG', entityId: String(req.params.configId), action: AUDIT_ACTION.DELETE, oldValue: { label: row.label, ip_address: row.ip_address }, performedBy: req.currentUser.id });
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
      await this.adminDb.update(TABLES.TENANTS, { ROWID: rows[0].ROWID, settings: JSON.stringify(settings) });
      await this.audit.log({ tenantId: req.tenantId, entityType: 'IP_SETTINGS', entityId: String(req.tenantId), action: AUDIT_ACTION.UPDATE, newValue: { ip_restrictions_enabled: enabled }, performedBy: req.currentUser.id });
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

  // ─── Geo restriction CRUD ────────────────────────────────────────────────────

  // GET /api/people/attendance/geo-config/settings
  async getGeoSettings(req, res) {
    try {
      const rows = await this.db.query(
        `SELECT settings FROM ${TABLES.TENANTS} WHERE ROWID = ${req.tenantId} LIMIT 1`
      );
      const settings = rows.length > 0 ? JSON.parse(rows[0].settings || '{}') : {};
      return ResponseHelper.success(res, { enabled: !!settings.geo_restrictions_enabled });
    } catch (_) {
      return ResponseHelper.success(res, { enabled: false });
    }
  }

  // PUT /api/people/attendance/geo-config/settings
  async updateGeoSettings(req, res) {
    const enabled = !!req.body.enabled;
    try {
      const rows = await this.db.query(
        `SELECT ROWID, settings FROM ${TABLES.TENANTS} WHERE ROWID = ${req.tenantId} LIMIT 1`
      );
      if (!rows.length) return ResponseHelper.notFound(res, 'Tenant not found');
      const settings = JSON.parse(rows[0].settings || '{}');
      settings.geo_restrictions_enabled = enabled;
      await this.adminDb.update(TABLES.TENANTS, { ROWID: rows[0].ROWID, settings: JSON.stringify(settings) });
      await this.audit.log({ tenantId: req.tenantId, entityType: 'GEO_SETTINGS', entityId: String(req.tenantId), action: AUDIT_ACTION.UPDATE, newValue: { geo_restrictions_enabled: enabled }, performedBy: req.currentUser.id });
      return ResponseHelper.success(res, { enabled });
    } catch (e) {
      return ResponseHelper.serverError(res, e.message || 'Failed to update geo settings');
    }
  }

  // GET /api/people/attendance/geo-config
  async getGeoConfig(req, res) {
    try {
      const rows = await this.db.findWhere(TABLES.GEO_RESTRICTIONS, req.tenantId, `is_active = 'true'`, { orderBy: 'CREATEDTIME ASC', limit: 200 });
      return ResponseHelper.success(res, rows);
    } catch (_) {
      return ResponseHelper.success(res, []);
    }
  }

  // POST /api/people/attendance/geo-config
  async addGeoConfig(req, res) {
    const { country_code, country_name } = req.body;
    if (!country_code || !country_name) return ResponseHelper.validationError(res, 'country_code and country_name are required');
    try {
      const existing = await this.db.findWhere(TABLES.GEO_RESTRICTIONS, req.tenantId,
        `country_code = '${DataStoreService.escape(country_code)}' AND is_active = 'true'`, { limit: 1 });
      if (existing.length > 0) return ResponseHelper.conflict(res, 'Country already added');
      const row = await this.db.insert(TABLES.GEO_RESTRICTIONS, {
        tenant_id:    String(req.tenantId),
        country_code: DataStoreService.escape(country_code.toUpperCase()),
        country_name: DataStoreService.escape(country_name),
        is_active:    'true',
        created_by:   String(req.currentUser.id),
      });
      await this.audit.log({ tenantId: req.tenantId, entityType: 'GEO_CONFIG', entityId: String(row.ROWID), action: AUDIT_ACTION.CREATE, newValue: { country_code: country_code.toUpperCase(), country_name }, performedBy: req.currentUser.id });
      return ResponseHelper.created(res, row);
    } catch (e) {
      if (e.message && e.message.includes('No privileges')) {
        return ResponseHelper.serverError(res, 'The geo_restrictions table does not exist in Catalyst DataStore. Please create it first.');
      }
      return ResponseHelper.serverError(res, e.message || 'Failed to add country');
    }
  }

  // DELETE /api/people/attendance/geo-config/:configId
  async deleteGeoConfig(req, res) {
    const row = await this.db.findById(TABLES.GEO_RESTRICTIONS, req.params.configId, req.tenantId);
    if (!row) return ResponseHelper.notFound(res, 'Geo config not found');
    await this.db.update(TABLES.GEO_RESTRICTIONS, { ROWID: req.params.configId, is_active: 'false' });
    await this.audit.log({ tenantId: req.tenantId, entityType: 'GEO_CONFIG', entityId: String(req.params.configId), action: AUDIT_ACTION.DELETE, oldValue: { country_code: row.country_code, country_name: row.country_name }, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, { message: 'Country removed' });
  }

  // ─── Geo validation helpers ───────────────────────────────────────────────────

  // Single GeoIP lookup — returns { country, countryCode, lat, lon, city, regionName } or null.
  // Uses ip-api.com free tier (no API key, 150 req/min). Fails open for private/loopback IPs.
  _lookupGeo(ip) {
    const PRIVATE_RE = /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1$|fd[0-9a-f]{2}:)/i;
    if (!ip || PRIVATE_RE.test(ip)) return Promise.resolve(null);
    return new Promise((resolve) => {
      const https = require('https');
      const reqObj = https.get(
        `https://ip-api.com/json/${ip}?fields=status,country,countryCode,lat,lon,city,regionName`,
        { timeout: 4000 },
        (httpRes) => {
          let data = '';
          httpRes.on('data', (chunk) => { data += chunk; });
          httpRes.on('end', () => {
            try {
              const p = JSON.parse(data);
              if (p.status === 'success') resolve({ country: p.country, countryCode: p.countryCode, lat: p.lat, lon: p.lon, city: p.city, regionName: p.regionName });
              else resolve(null);
            } catch { resolve(null); }
          });
        }
      );
      reqObj.on('error', () => resolve(null));
      reqObj.on('timeout', () => { reqObj.destroy(); resolve(null); });
    });
  }

  // Country-level check — accepts pre-fetched geoData (from _lookupGeo) to avoid a second API call.
  async _validateGeoAllowed(tenantId, geoData) {
    try {
      const tenantRows = await this.db.query(
        `SELECT settings FROM ${TABLES.TENANTS} WHERE ROWID = ${tenantId} LIMIT 1`
      );
      if (!tenantRows.length) return { allowed: true };
      const settings = JSON.parse(tenantRows[0].settings || '{}');
      if (!settings.geo_restrictions_enabled) return { allowed: true };

      const rows = await this.db.findWhere(TABLES.GEO_RESTRICTIONS, tenantId, `is_active = 'true'`, { limit: 200 });
      if (!rows || rows.length === 0) return { allowed: true };

      if (!geoData) return { allowed: true }; // lookup failed — fail open
      const allowed = rows.some((r) => r.country_code === geoData.countryCode);
      return { allowed, countryCode: geoData.countryCode, country: geoData.country };
    } catch (_) {
      return { allowed: true };
    }
  }

  // Haversine distance between two coordinates in km.
  _haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Zone-level (radius) check — accepts pre-fetched geoData.
  async _validateZoneAllowed(tenantId, geoData) {
    try {
      const tenantRows = await this.db.query(
        `SELECT settings FROM ${TABLES.TENANTS} WHERE ROWID = ${tenantId} LIMIT 1`
      );
      if (!tenantRows.length) return { allowed: true };
      const settings = JSON.parse(tenantRows[0].settings || '{}');
      if (!settings.geo_zones_enabled) return { allowed: true };

      const zones = await this.db.findWhere(TABLES.GEO_ZONES, tenantId, `is_active = 'true'`, { limit: 100 });
      if (!zones || zones.length === 0) return { allowed: true };

      if (!geoData || geoData.lat == null || geoData.lon == null) return { allowed: true }; // fail open if no coords

      for (const zone of zones) {
        const dist = this._haversineKm(parseFloat(zone.latitude), parseFloat(zone.longitude), geoData.lat, geoData.lon);
        if (dist <= parseFloat(zone.radius_km)) return { allowed: true, zone: zone.name };
      }
      return { allowed: false, city: geoData.city, regionName: geoData.regionName };
    } catch (_) {
      return { allowed: true };
    }
  }

  // Run one GeoIP lookup then validate country + zone concurrently. Used by checkIn/breakStart/breakEnd.
  async _runLocationChecks(tenantId, ip) {
    const geoData = await this._lookupGeo(ip); // single external API call
    const [countryCheck, zoneCheck] = await Promise.all([
      this._validateGeoAllowed(tenantId, geoData),
      this._validateZoneAllowed(tenantId, geoData),
    ]);
    return { countryCheck, zoneCheck };
  }

  // ─── Geo zone CRUD ────────────────────────────────────────────────────────────

  async getGeoZoneSettings(req, res) {
    try {
      const rows = await this.db.query(`SELECT settings FROM ${TABLES.TENANTS} WHERE ROWID = ${req.tenantId} LIMIT 1`);
      const settings = rows.length > 0 ? JSON.parse(rows[0].settings || '{}') : {};
      return ResponseHelper.success(res, { enabled: !!settings.geo_zones_enabled });
    } catch (_) { return ResponseHelper.success(res, { enabled: false }); }
  }

  async updateGeoZoneSettings(req, res) {
    const enabled = !!req.body.enabled;
    try {
      const rows = await this.db.query(`SELECT ROWID, settings FROM ${TABLES.TENANTS} WHERE ROWID = ${req.tenantId} LIMIT 1`);
      if (!rows.length) return ResponseHelper.notFound(res, 'Tenant not found');
      const settings = JSON.parse(rows[0].settings || '{}');
      settings.geo_zones_enabled = enabled;
      await this.adminDb.update(TABLES.TENANTS, { ROWID: rows[0].ROWID, settings: JSON.stringify(settings) });
      await this.audit.log({ tenantId: req.tenantId, entityType: 'GEO_ZONE_SETTINGS', entityId: String(req.tenantId), action: AUDIT_ACTION.UPDATE, newValue: { geo_zones_enabled: enabled }, performedBy: req.currentUser.id });
      return ResponseHelper.success(res, { enabled });
    } catch (e) { return ResponseHelper.serverError(res, e.message || 'Failed to update geo zone settings'); }
  }

  async getGeoZones(req, res) {
    try {
      const rows = await this.db.findWhere(TABLES.GEO_ZONES, req.tenantId, `is_active = 'true'`, { orderBy: 'CREATEDTIME ASC', limit: 100 });
      return ResponseHelper.success(res, rows);
    } catch (_) { return ResponseHelper.success(res, []); }
  }

  async addGeoZone(req, res) {
    const { name, latitude, longitude, radius_km } = req.body;
    if (!name || latitude == null || longitude == null || !radius_km)
      return ResponseHelper.validationError(res, 'name, latitude, longitude, and radius_km are required');
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    const radius = parseFloat(radius_km);
    if (isNaN(lat) || lat < -90 || lat > 90) return ResponseHelper.validationError(res, 'latitude must be between -90 and 90');
    if (isNaN(lon) || lon < -180 || lon > 180) return ResponseHelper.validationError(res, 'longitude must be between -180 and 180');
    if (isNaN(radius) || radius <= 0 || radius > 500) return ResponseHelper.validationError(res, 'radius_km must be between 0.1 and 500');
    try {
      const row = await this.db.insert(TABLES.GEO_ZONES, {
        tenant_id:  String(req.tenantId),
        name:       DataStoreService.escape(name),
        latitude:   String(lat),
        longitude:  String(lon),
        radius_km:  String(radius),
        is_active:  'true',
        created_by: String(req.currentUser.id),
      });
      await this.audit.log({ tenantId: req.tenantId, entityType: 'GEO_ZONE', entityId: String(row.ROWID), action: AUDIT_ACTION.CREATE, newValue: { name, latitude: lat, longitude: lon, radius_km: radius }, performedBy: req.currentUser.id });
      return ResponseHelper.created(res, row);
    } catch (e) {
      if (e.message && e.message.includes('No privileges'))
        return ResponseHelper.serverError(res, 'The geo_zones table does not exist in Catalyst DataStore. Please create it first.');
      return ResponseHelper.serverError(res, e.message || 'Failed to add zone');
    }
  }

  async deleteGeoZone(req, res) {
    const row = await this.db.findById(TABLES.GEO_ZONES, req.params.zoneId, req.tenantId);
    if (!row) return ResponseHelper.notFound(res, 'Geo zone not found');
    await this.db.update(TABLES.GEO_ZONES, { ROWID: req.params.zoneId, is_active: 'false' });
    await this.audit.log({ tenantId: req.tenantId, entityType: 'GEO_ZONE', entityId: String(req.params.zoneId), action: AUDIT_ACTION.DELETE, oldValue: { name: row.name, radius_km: row.radius_km }, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, { message: 'Zone removed' });
  }

  // ─── Shift helpers ────────────────────────────────────────────────────────────

  // Convert "HH:MM" in a named timezone to a UTC Date for a given attendanceDate (YYYY-MM-DD).
  _shiftStartUTC(dateStr, startTimeStr, timezone) {
    try {
      const safeZone = timezone && timezone.trim() ? timezone.trim() : 'Asia/Kolkata';
      // Treat start time as if it were UTC to get a reference point, then correct for the actual offset.
      const asUTC = new Date(`${dateStr}T${startTimeStr}:00Z`);
      const inTZ = new Intl.DateTimeFormat('sv', {
        timeZone: safeZone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).format(asUTC);
      const tzMs = new Date(inTZ.replace(' ', 'T') + 'Z').getTime();
      const offsetMs = tzMs - asUTC.getTime();
      return new Date(asUTC.getTime() - offsetMs);
    } catch (_) {
      return new Date(`${dateStr}T${startTimeStr}:00Z`);
    }
  }

  // Look up the shift assigned to a user via user_profiles.shift_id.
  async _getUserShift(tenantId, userRowId) {
    try {
      const profiles = await this.db.findWhere(TABLES.USER_PROFILES, tenantId,
        `user_id = '${userRowId}'`, { limit: 1 });
      const shiftId = profiles[0]?.shift_id;
      if (!shiftId || String(shiftId) === '0' || String(shiftId) === '') return null;
      const shifts = await this.db.findWhere(TABLES.SHIFTS, tenantId,
        `ROWID = '${DataStoreService.escape(String(shiftId))}' AND is_active = 'true'`, { limit: 1 });
      return shifts[0] || null;
    } catch (_) { return null; }
  }

  // Mark attendance LATE and send email + in-app notification to reporting manager.
  async _handleLateCheckIn(tenantId, userRowId, req, record, minutesLate, shift) {
    await this.db.update(TABLES.ATTENDANCE_RECORDS, {
      ROWID: record.ROWID, status: ATTENDANCE_STATUS.LATE,
    });
    try {
      const profiles = await this.db.findWhere(TABLES.USER_PROFILES, tenantId,
        `user_id = '${userRowId}'`, { limit: 1 });
      const rmId = profiles[0]?.reporting_manager_id;
      if (!rmId) return;
      const rmRows = await this.db.query(
        `SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = '${rmId}' LIMIT 1`
      );
      if (!rmRows[0]) return;

      const safeZone = shift.timezone || 'Asia/Kolkata';
      const checkInLocalTime = new Intl.DateTimeFormat('en-GB', {
        timeZone: safeZone, hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date(record.check_in_time.replace(' ', 'T') + 'Z'));

      const totalSecs = minutesLate * 60;
      const hh = String(Math.floor(totalSecs / 3600)).padStart(2, '0');
      const mm = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, '0');
      const ss = String(totalSecs % 60).padStart(2, '0');
      const lateFormatted = `${hh}:${mm}:${ss}`;

      const userName = req.currentUser.name || req.currentUser.email;
      const subject  = `[Delivery Sync] ${userName} checked in late — ${lateFormatted} late (${shift.name})`;
      const htmlBody = `<p>Hi ${rmRows[0].name},</p>
<p><strong>${userName}</strong> checked in late today.</p>
<ul>
  <li><strong>Shift:</strong> ${shift.name}</li>
  <li><strong>Expected by:</strong> ${shift.start_time} + ${shift.grace_minutes || 15} min grace</li>
  <li><strong>Actual check-in:</strong> ${checkInLocalTime} (${safeZone})</li>
  <li><strong>Late by:</strong> ${lateFormatted}</li>
</ul>`;

      await this.notif.send({ toEmail: rmRows[0].email, subject, htmlBody });
      await this.notif.sendInApp({
        tenantId, userId: rmId,
        title: 'Late Check-in',
        message: `${userName} checked in ${lateFormatted} late (${shift.name})`,
        type: NOTIFICATION_TYPE.GENERAL,
        entityType: 'ATTENDANCE', entityId: record.ROWID,
      });
    } catch (err) {
      console.warn('[_handleLateCheckIn] notification failed (non-fatal):', err.message);
    }
  }

  // ─── Shift CRUD ───────────────────────────────────────────────────────────────

  async getShifts(req, res) {
    try {
      const rows = await this.db.findWhere(TABLES.SHIFTS, req.tenantId,
        `is_active = 'true'`, { orderBy: 'CREATEDTIME ASC', limit: 50 });
      return ResponseHelper.success(res, rows);
    } catch (_) { return ResponseHelper.success(res, []); }
  }

  async addShift(req, res) {
    const { name, start_time, end_time, timezone, grace_minutes } = req.body;
    if (!name || !start_time || !timezone)
      return ResponseHelper.validationError(res, 'name, start_time, and timezone are required');
    if (!/^\d{2}:\d{2}$/.test(start_time))
      return ResponseHelper.validationError(res, 'start_time must be HH:MM (e.g. 06:00)');
    try {
      const row = await this.db.insert(TABLES.SHIFTS, {
        tenant_id:     String(req.tenantId),
        name:          DataStoreService.escape(name),
        start_time:    start_time,
        end_time:      end_time || '',
        timezone:      DataStoreService.escape(timezone),
        grace_minutes: String(parseInt(grace_minutes) || 15),
        is_active:     'true',
        created_by:    String(req.currentUser.id),
      });
      await this.audit.log({ tenantId: req.tenantId, entityType: 'SHIFT', entityId: String(row.ROWID), action: AUDIT_ACTION.CREATE, newValue: { name, start_time, end_time, timezone }, performedBy: req.currentUser.id });
      return ResponseHelper.created(res, row);
    } catch (e) {
      if (e.message && e.message.includes('No privileges'))
        return ResponseHelper.serverError(res, 'The shifts table does not exist. Please create it in Catalyst DataStore.');
      return ResponseHelper.serverError(res, e.message || 'Failed to add shift');
    }
  }

  async updateShift(req, res) {
    const { shiftId } = req.params;
    const { name, start_time, end_time, timezone, grace_minutes } = req.body;
    const row = await this.db.findById(TABLES.SHIFTS, shiftId, req.tenantId);
    if (!row) return ResponseHelper.notFound(res, 'Shift not found');
    const updates = { ROWID: shiftId };
    if (name)          updates.name          = DataStoreService.escape(name);
    if (start_time)    updates.start_time    = start_time;
    if (end_time !== undefined) updates.end_time = end_time;
    if (timezone)      updates.timezone      = DataStoreService.escape(timezone);
    if (grace_minutes !== undefined) updates.grace_minutes = String(parseInt(grace_minutes) || 15);
    await this.db.update(TABLES.SHIFTS, updates);
    await this.audit.log({ tenantId: req.tenantId, entityType: 'SHIFT', entityId: String(shiftId), action: AUDIT_ACTION.UPDATE, oldValue: { name: row.name, start_time: row.start_time }, newValue: updates, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, { message: 'Shift updated' });
  }

  async deleteShift(req, res) {
    const row = await this.db.findById(TABLES.SHIFTS, req.params.shiftId, req.tenantId);
    if (!row) return ResponseHelper.notFound(res, 'Shift not found');
    await this.db.update(TABLES.SHIFTS, { ROWID: req.params.shiftId, is_active: 'false' });
    await this.audit.log({ tenantId: req.tenantId, entityType: 'SHIFT', entityId: String(req.params.shiftId), action: AUDIT_ACTION.DELETE, oldValue: { name: row.name }, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, { message: 'Shift deleted' });
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

  // Returns true if userId is a designated team lead (teams.lead_user_id) or
  // holds a lead-level role in team_members for any team in the tenant.
  async _isTeamLead(tenantId, userId) {
    const self = String(userId);
    const tid  = String(tenantId);
    const ledTeams = await this.db.findWhere(
      TABLES.TEAMS, tid, `lead_user_id = '${self}'`, { limit: 1 }
    );
    if (ledTeams && ledTeams.length > 0) return true;
    const LEAD_ROLES = new Set(['DELIVERY_LEAD', 'LEAD', 'TECH_LEAD', 'SCRUM_MASTER', 'PROJECT_MANAGER']);
    const memberRows = await this.db.findWhere(
      TABLES.TEAM_MEMBERS, tid, `user_id = '${self}'`, { limit: 200 }
    );
    return memberRows.some(m => LEAD_ROLES.has(m.role));
  }

  // Returns null (unrestricted) for managers/admins, or a Set<string> of
  // allowed user IDs for team leads. Used by live(), anomalies(), notCheckedIn().
  async _resolveTeamAllowedIds(req) {
    const MANAGER_ROLES = ['TENANT_ADMIN', 'PMO', 'DELIVERY_LEAD'];
    if (MANAGER_ROLES.includes(req.currentUser.role)) return null;
    if (await this._checkAttendanceAdmin(req)) return null;

    const userPerms = Array.isArray(req.currentUser.permissions) ? req.currentUser.permissions : [];
    const hasTeamView = userPerms.includes(PERMISSIONS.ATTENDANCE_TEAM_VIEW);

    const callerRows = await this.db.findWhere(TABLES.USERS, req.tenantId,
      `email = '${req.currentUser.email}'`, { limit: 1 });
    const callerUid = callerRows && callerRows.length > 0 ? String(callerRows[0].ROWID) : String(req.currentUser.id);

    if (hasTeamView || await this._isTeamLead(req.tenantId, callerUid)) {
      const scope = new TeamScopeService(this.db);
      const ids = await scope.getTeamPeerUserIds(req.tenantId, callerUid);
      return new Set(ids.map(String));
    }
    return null; // non-leads see all on dashboard widgets (existing behaviour)
  }

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

    const approvedWfh = await this.db.findWhere(TABLES.WFH_REQUESTS, req.tenantId,
      `user_id = '${userRowId}' AND wfh_date <= '${today}' AND (wfh_date_to >= '${today}' OR (wfh_date_to = '' AND wfh_date = '${today}')) AND status = 'APPROVED'`, { limit: 1 });
    if (approvedWfh.length === 0)
      return ResponseHelper.forbidden(res, 'You need an approved WFH request for today. Please submit a request first.');

    const existing = await this.db.findWhere(TABLES.ATTENDANCE_RECORDS, req.tenantId,
      `user_id = '${userRowId}' AND attendance_date = '${today}'`, { limit: 1 });

    if (existing.length > 0) {
      await this.db.update(TABLES.ATTENDANCE_RECORDS, { ROWID: existing[0].ROWID, is_wfh: 'true', wfh_reason: wfh_reason || approvedWfh[0].reason || '', status: ATTENDANCE_STATUS.WFH });
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
      // Fetch absent/late records AND all today's check-in records in parallel
      const [absentRecords, checkedInRecords, users] = await Promise.all([
        this.db.findWhere(TABLES.ATTENDANCE_RECORDS, req.tenantId,
          `attendance_date = '${today}' AND (status = 'ABSENT' OR status = 'LATE') AND (check_in_time IS NULL OR check_in_time = '')`,
          { limit: 100 }),
        // Any record today with a check_in_time means that user is actually present
        this.db.findWhere(TABLES.ATTENDANCE_RECORDS, req.tenantId,
          `attendance_date = '${today}' AND check_in_time IS NOT NULL AND check_in_time != ''`,
          { limit: 200 }),
        this.db.findAll(TABLES.USERS, { tenant_id: req.tenantId }, { limit: 200 }),
      ]);

      // Build set of user_ids who have actually checked in today (handles two-record scenario)
      const checkedInUserIds = new Set(checkedInRecords.map(r => String(r.user_id)));

      // Filter out anyone who has checked in under any record
      let absent = absentRecords.filter(r => !checkedInUserIds.has(String(r.user_id)));

      // Team-scope filter: team leads see only their team's anomalies.
      const allowedIds = await this._resolveTeamAllowedIds(req);
      if (allowedIds) absent = absent.filter(r => allowedIds.has(String(r.user_id)));

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

  // GET /api/people/attendance/not-checked-in
  async notCheckedIn(req, res) {
    try {
      const today = todayIST();
      const [allUsers, checkedInRecords] = await Promise.all([
        this.db.findAll(TABLES.USERS, { tenant_id: req.tenantId }, { limit: 200 }),
        this.db.findWhere(TABLES.ATTENDANCE_RECORDS, req.tenantId,
          `attendance_date = '${today}' AND check_in_time IS NOT NULL AND check_in_time != ''`,
          { limit: 200 }),
      ]);
      const checkedInUserIds = new Set(checkedInRecords.map(r => String(r.user_id)));

      // Team-scope filter: team leads see only their team members.
      const allowedIds = await this._resolveTeamAllowedIds(req);

      const notIn = allUsers.filter(u => {
        if (checkedInUserIds.has(String(u.ROWID))) return false;
        if (allowedIds && !allowedIds.has(String(u.ROWID))) return false;
        return true;
      });
      return ResponseHelper.success(res, notIn.map(u => ({
        id:        u.ROWID,
        userId:    u.ROWID,
        name:      u.name      || 'Unknown',
        email:     u.email     || '',
        avatarUrl: u.avatar_url || '',
      })));
    } catch (err) {
      console.error('[AttendanceController.notCheckedIn]', err.message);
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
  // ── WFH Requests ────────────────────────────────────────────────────────────

  // POST /api/people/attendance/wfh-requests
  async submitWfhRequest(req, res) {
    const { date_from, date_to, reason } = req.body;
    if (!date_from || !date_to || !reason) return ResponseHelper.validationError(res, 'date_from, date_to and reason are required');
    if (date_to < date_from) return ResponseHelper.validationError(res, 'date_to must be on or after date_from');

    const users = await this.db.findWhere(TABLES.USERS, req.tenantId,
      `email = '${req.currentUser.email}'`, { limit: 1 });
    if (!users.length) return ResponseHelper.notFound(res, 'User not found');
    const userRowId = users[0].ROWID;

    // Check for any overlapping non-cancelled request in the requested range
    const existing = await this.db.findWhere(TABLES.WFH_REQUESTS, req.tenantId,
      `user_id = '${userRowId}' AND status != 'CANCELLED' AND wfh_date <= '${date_to}' AND (wfh_date_to >= '${date_from}' OR (wfh_date_to = '' AND wfh_date >= '${date_from}'))`,
      { limit: 1 });
    if (existing.length > 0) return ResponseHelper.conflict(res, 'A WFH request already exists overlapping this date range');

    const dateLabel = date_from === date_to ? date_from : `${date_from} to ${date_to}`;
    const record = await this.db.insert(TABLES.WFH_REQUESTS, {
      tenant_id:      String(req.tenantId),
      user_id:        String(userRowId),
      wfh_date:       date_from,
      wfh_date_to:    date_to,
      reason,
      status:         'PENDING',
      reviewed_by:    '',
      reviewer_notes: '',
      reviewed_at:    '',
    });

    const profiles = await this.db.findWhere(TABLES.USER_PROFILES, req.tenantId,
      `user_id = '${userRowId}'`, { limit: 1 });
    const rmId = profiles[0]?.reporting_manager_id;
    if (rmId) {
      try {
        await this.notif.sendInApp({
          tenantId: req.tenantId, userId: String(rmId),
          title: 'WFH Request',
          message: `${req.currentUser.name} has requested to work from home on ${dateLabel}`,
          type: NOTIFICATION_TYPE.WFH_REQUEST_SUBMITTED,
          entityType: 'WFH_REQUEST', entityId: record.ROWID,
        });
      } catch (_) {}
    }

    await this.audit.log({ tenantId: req.tenantId, entityType: 'WFH_REQUEST', entityId: record.ROWID, action: AUDIT_ACTION.CREATE, newValue: { date_from, date_to, reason }, performedBy: userRowId });
    return ResponseHelper.created(res, record);
  }

  // GET /api/people/attendance/wfh-requests
  async listWfhRequests(req, res) {
    const users = await this.db.findWhere(TABLES.USERS, req.tenantId,
      `email = '${req.currentUser.email}'`, { limit: 1 });
    if (!users.length) return ResponseHelper.notFound(res, 'User not found');
    const userRowId = String(users[0].ROWID);

    const { mine, team, status, date_from, date_to } = req.query;

    let rows = [];
    if (team === 'true') {
      const reports = await this.db.findWhere(TABLES.USER_PROFILES, req.tenantId,
        `reporting_manager_id = '${userRowId}'`, { limit: 200 });
      const reportIds = reports.map(r => String(r.user_id));
      if (!reportIds.length) return ResponseHelper.success(res, []);
      let cond = `user_id IN (${reportIds.map(id => `'${id}'`).join(',')})`;
      if (status) cond += ` AND status = '${status}'`;
      if (date_from) cond += ` AND wfh_date >= '${date_from}'`;
      if (date_to) cond += ` AND wfh_date <= '${date_to}'`;
      rows = await this.db.findWhere(TABLES.WFH_REQUESTS, req.tenantId, cond, { limit: 200 });

      // Enrich with user names
      const userIds = [...new Set(rows.map(r => String(r.user_id)))];
      const userRows = userIds.length
        ? await this.db.findWhere(TABLES.USERS, req.tenantId, `ROWID IN (${userIds.map(id => `'${id}'`).join(',')})`, { limit: 200 })
        : [];
      const userMap = Object.fromEntries(userRows.map(u => [String(u.ROWID), u]));
      rows = rows.map(r => ({ ...r, user_name: userMap[String(r.user_id)]?.name || '', user_email: userMap[String(r.user_id)]?.email || '' }));
    } else {
      let cond = `user_id = '${userRowId}'`;
      if (status) cond += ` AND status = '${status}'`;
      if (date_from) cond += ` AND wfh_date >= '${date_from}'`;
      if (date_to) cond += ` AND wfh_date <= '${date_to}'`;
      rows = await this.db.findWhere(TABLES.WFH_REQUESTS, req.tenantId, cond, { limit: 100 });
    }

    return ResponseHelper.success(res, rows);
  }

  // PATCH /api/people/attendance/wfh-requests/:id/approve
  async approveWfhRequest(req, res) {
    const { reviewer_notes } = req.body;
    const request = await this.db.findById(TABLES.WFH_REQUESTS, req.params.id, req.tenantId);
    if (!request) return ResponseHelper.notFound(res, 'WFH request not found');
    if (request.status !== 'PENDING') return ResponseHelper.conflict(res, 'Request is not pending');

    const reviewerUsers = await this.db.findWhere(TABLES.USERS, req.tenantId,
      `email = '${req.currentUser.email}'`, { limit: 1 });
    const reviewerRowId = reviewerUsers[0]?.ROWID;

    await this.db.update(TABLES.WFH_REQUESTS, {
      ROWID:          req.params.id,
      status:         'APPROVED',
      reviewed_by:    String(reviewerRowId || ''),
      reviewer_notes: reviewer_notes || '',
      reviewed_at:    new Date().toISOString().replace('T', ' ').slice(0, 19),
    });

    try {
      await this.notif.sendInApp({
        tenantId: req.tenantId, userId: String(request.user_id),
        title: 'WFH Request Approved',
        message: `Your WFH request for ${request.wfh_date_to && request.wfh_date_to !== request.wfh_date ? `${request.wfh_date} to ${request.wfh_date_to}` : request.wfh_date} has been approved`,
        type: NOTIFICATION_TYPE.WFH_APPROVED,
        entityType: 'WFH_REQUEST', entityId: req.params.id,
      });
    } catch (_) {}

    await this.audit.log({ tenantId: req.tenantId, entityType: 'WFH_REQUEST', entityId: req.params.id, action: AUDIT_ACTION.APPROVE, newValue: { status: 'APPROVED' }, performedBy: reviewerRowId });
    return ResponseHelper.success(res, { message: 'WFH request approved' });
  }

  // PATCH /api/people/attendance/wfh-requests/:id/reject
  async rejectWfhRequest(req, res) {
    const { reviewer_notes } = req.body;
    if (!reviewer_notes) return ResponseHelper.validationError(res, 'reviewer_notes required when rejecting');

    const request = await this.db.findById(TABLES.WFH_REQUESTS, req.params.id, req.tenantId);
    if (!request) return ResponseHelper.notFound(res, 'WFH request not found');
    if (request.status !== 'PENDING') return ResponseHelper.conflict(res, 'Request is not pending');

    const reviewerUsers = await this.db.findWhere(TABLES.USERS, req.tenantId,
      `email = '${req.currentUser.email}'`, { limit: 1 });
    const reviewerRowId = reviewerUsers[0]?.ROWID;

    await this.db.update(TABLES.WFH_REQUESTS, {
      ROWID:          req.params.id,
      status:         'REJECTED',
      reviewed_by:    String(reviewerRowId || ''),
      reviewer_notes,
      reviewed_at:    new Date().toISOString().replace('T', ' ').slice(0, 19),
    });

    try {
      await this.notif.sendInApp({
        tenantId: req.tenantId, userId: String(request.user_id),
        title: 'WFH Request Rejected',
        message: `Your WFH request for ${request.wfh_date_to && request.wfh_date_to !== request.wfh_date ? `${request.wfh_date} to ${request.wfh_date_to}` : request.wfh_date} was rejected. Reason: ${reviewer_notes}`,
        type: NOTIFICATION_TYPE.WFH_REJECTED,
        entityType: 'WFH_REQUEST', entityId: req.params.id,
      });
    } catch (_) {}

    await this.audit.log({ tenantId: req.tenantId, entityType: 'WFH_REQUEST', entityId: req.params.id, action: AUDIT_ACTION.REJECT, newValue: { status: 'REJECTED', reviewer_notes }, performedBy: reviewerRowId });
    return ResponseHelper.success(res, { message: 'WFH request rejected' });
  }

  // DELETE /api/people/attendance/wfh-requests/:id
  async cancelWfhRequest(req, res) {
    const request = await this.db.findById(TABLES.WFH_REQUESTS, req.params.id, req.tenantId);
    if (!request) return ResponseHelper.notFound(res, 'WFH request not found');
    if (request.status !== 'PENDING') return ResponseHelper.conflict(res, 'Only pending requests can be cancelled');

    await this.db.update(TABLES.WFH_REQUESTS, { ROWID: req.params.id, status: 'CANCELLED' });
    return ResponseHelper.success(res, { message: 'WFH request cancelled' });
  }
}

function _escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = AttendanceController;
