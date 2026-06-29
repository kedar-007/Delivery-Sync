'use strict';

const DataStoreService = require('../services/DataStoreService');
const AuditService = require('../services/AuditService');
const NotificationService = require('../services/NotificationService');
const TeamScopeService = require('../services/TeamScopeService');
const ResponseHelper = require('../utils/ResponseHelper');
const {
  TABLES, PERMISSIONS, REGULARIZATION_STATUS, ATTENDANCE_STATUS,
  AUDIT_ACTION, NOTIFICATION_TYPE,
} = require('../utils/Constants');

// Validate a check-in/out value is empty, an HH:MM[:SS] time, or a full datetime.
function isValidTimeInput(value) {
  if (!value) return true; // empty is allowed (only one end may be corrected)
  const raw = String(value).trim();
  return /^\d{1,2}:\d{2}(:\d{2})?$/.test(raw)
    || /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?/.test(raw);
}

// Normalise a client-supplied check-in/out value into a Catalyst DateTime
// string ('YYYY-MM-DD HH:MM:SS') anchored to the attendance date.
// Accepts 'HH:MM', 'HH:MM:SS', a full 'YYYY-MM-DD HH:MM[:SS]' or an ISO string.
function normaliseDateTime(date, value) {
  if (!value) return '';
  const raw = String(value).trim();
  // Time-only — combine with the attendance date
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(raw)) {
    const [h, m, s = '00'] = raw.split(':');
    return `${date} ${h.padStart(2, '0')}:${m.padStart(2, '0')}:${s.padStart(2, '0')}`;
  }
  // ISO / full datetime — normalise the separator and trim to seconds
  const normalised = raw.replace('T', ' ').replace(/\.\d+Z?$/, '').replace(/Z$/, '');
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(normalised)) {
    return normalised.length === 16 ? `${normalised}:00` : normalised;
  }
  return raw;
}

class RegularizationController {
  constructor(catalystApp, adminCatalystApp) {
    this.db = new DataStoreService(catalystApp);
    this.adminDb = new DataStoreService(adminCatalystApp || catalystApp);
    this.audit = new AuditService(this.db);
    this.notif = new NotificationService(catalystApp, this.db);
  }

  // Resolve the authenticated caller's users-table ROWID (the FK used everywhere).
  async _resolveCallerRowId(req) {
    const users = await this.db.findWhere(TABLES.USERS, req.tenantId,
      `email = '${req.currentUser.email}'`, { limit: 1 });
    return users.length ? String(users[0].ROWID) : null;
  }

  // POST /api/people/regularization/apply
  // Body: { employeeId?, date, checkIn?, checkOut?, reason }
  async apply(req, res) {
    const tenantId = req.tenantId;
    const { date, reason } = req.body;
    const checkIn  = req.body.checkIn  ?? req.body.check_in  ?? '';
    const checkOut = req.body.checkOut ?? req.body.check_out ?? '';

    if (!date || !reason) return ResponseHelper.validationError(res, 'date and reason are required');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return ResponseHelper.validationError(res, 'date must be YYYY-MM-DD');
    if (!checkIn && !checkOut) return ResponseHelper.validationError(res, 'At least one of checkIn or checkOut is required');
    if (!isValidTimeInput(checkIn))  return ResponseHelper.validationError(res, 'checkIn must be a valid time (HH:MM)');
    if (!isValidTimeInput(checkOut)) return ResponseHelper.validationError(res, 'checkOut must be a valid time (HH:MM)');
    if (String(reason).trim().length > 1000) return ResponseHelper.validationError(res, 'reason is too long (max 1000 characters)');

    // Employees raise requests for themselves — the FK is always the
    // authenticated user, never a client-supplied id (prevents spoofing).
    const userRowId = await this._resolveCallerRowId(req);
    if (!userRowId) return ResponseHelper.notFound(res, 'User not found');

    // Reject future dates (you can't regularize a day that hasn't happened),
    // evaluated in the employee's own timezone so "today" is correct for them.
    const tz = await this._resolveUserTimezone(tenantId, userRowId);
    const todayInTz = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    if (date > todayInTz) return ResponseHelper.validationError(res, 'Cannot regularize a future date');

    // If both ends are supplied, check-out must be after check-in.
    const normIn  = normaliseDateTime(date, checkIn);
    const normOut = normaliseDateTime(date, checkOut);
    if (normIn && normOut && normOut <= normIn)
      return ResponseHelper.validationError(res, 'check-out must be after check-in');

    // Block a second open request for the same day.
    const existing = await this.db.findWhere(TABLES.REGULARIZATION_REQUESTS, tenantId,
      `user_id = '${userRowId}' AND attendance_date = '${DataStoreService.escape(date)}' AND status = '${REGULARIZATION_STATUS.PENDING}'`,
      { limit: 1 });
    if (existing.length > 0) return ResponseHelper.conflict(res, 'A pending regularization request already exists for this date');

    const record = await this.db.insert(TABLES.REGULARIZATION_REQUESTS, {
      tenant_id:           String(tenantId),
      user_id:             String(userRowId),
      attendance_date:     date,
      requested_check_in:  normIn,
      requested_check_out: normOut,
      reason,
      status:              REGULARIZATION_STATUS.PENDING,
      reviewed_by:         '',
      reviewer_notes:      '',
      reviewed_at:         '',
    });

    // Notify the reporting manager (in-app + email), best-effort.
    try {
      const profiles = await this.db.findWhere(TABLES.USER_PROFILES, tenantId,
        `user_id = '${userRowId}'`, { limit: 1 });
      const rmId = profiles[0]?.reporting_manager_id;
      if (rmId) {
        await this.notif.sendInApp({
          tenantId, userId: String(rmId),
          title: 'Attendance Regularization Request',
          message: `${req.currentUser.name} requested an attendance correction for ${date}`,
          type: NOTIFICATION_TYPE.REGULARIZATION_SUBMITTED,
          entityType: 'REGULARIZATION_REQUEST', entityId: record.ROWID,
        });
        const rmRows = await this.db.query(`SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = '${rmId}' LIMIT 1`);
        if (rmRows[0]?.email) {
          await this.notif.send({
            toEmail: rmRows[0].email,
            subject: `Attendance regularization request — ${req.currentUser.name} (${date})`,
            htmlBody: `<p>Hi ${_esc(rmRows[0].name)},</p>`
              + `<p><strong>${_esc(req.currentUser.name)}</strong> has requested an attendance correction.</p>`
              + `<ul><li><strong>Date:</strong> ${_esc(date)}</li>`
              + `<li><strong>Check-in:</strong> ${_esc(checkIn || '—')}</li>`
              + `<li><strong>Check-out:</strong> ${_esc(checkOut || '—')}</li>`
              + `<li><strong>Reason:</strong> ${_esc(reason)}</li></ul>`
              + `<p>Please review the request in DSV OpsPulse.</p>`,
          });
        }
      }
    } catch (_) { /* notification failures must not fail the request */ }

    await this.audit.log({
      tenantId, entityType: 'REGULARIZATION_REQUEST', entityId: record.ROWID,
      action: AUDIT_ACTION.CREATE,
      newValue: { attendance_date: date, requested_check_in: checkIn, requested_check_out: checkOut, reason },
      performedBy: userRowId,
    });

    return ResponseHelper.created(res, record);
  }

  // GET /api/people/regularization/status?employeeId=&fromDate=&toDate=
  // Employees check the status of their own requests.
  async status(req, res) {
    const tenantId = req.tenantId;
    const { fromDate, toDate } = req.query;

    const userRowId = await this._resolveCallerRowId(req);
    if (!userRowId) return ResponseHelper.notFound(res, 'User not found');

    let cond = `user_id = '${userRowId}'`;
    if (fromDate) cond += ` AND attendance_date >= '${DataStoreService.escape(fromDate)}'`;
    if (toDate)   cond += ` AND attendance_date <= '${DataStoreService.escape(toDate)}'`;

    const rows = await this.db.findWhere(TABLES.REGULARIZATION_REQUESTS, tenantId, cond,
      { orderBy: 'attendance_date DESC', limit: 200 });
    return ResponseHelper.success(res, rows);
  }

  // GET /api/people/regularization/pending?managerId=&status=
  // Reviewers fetch requests they can act on. Scope (most permissive first):
  //   • ATTENDANCE_ADMIN          → every request in the tenant
  //   • REGULARIZATION_APPROVE    → direct reports + team peers
  //   • (reporting manager)       → direct reports only
  // Returns ALL statuses (not just PENDING) so approvers can see history too;
  // an optional ?status= filters server-side. Never includes the caller's own
  // requests (you can't review your own).
  async pending(req, res) {
    const tenantId = req.tenantId;
    const { status } = req.query;

    const reviewerRowId = await this._resolveCallerRowId(req);
    if (!reviewerRowId) return ResponseHelper.notFound(res, 'User not found');

    const allowedIds = await this._resolveReviewableUserIds(req, reviewerRowId);
    // null = unrestricted (admin); otherwise a concrete set of user IDs.
    if (allowedIds && allowedIds.size === 0) return ResponseHelper.success(res, []);

    let cond;
    if (allowedIds) {
      const inList = [...allowedIds].map(id => `'${DataStoreService.escape(id)}'`).join(',');
      cond = `user_id IN (${inList})`;
    } else {
      // Admin: everyone except self.
      cond = `user_id != '${DataStoreService.escape(reviewerRowId)}'`;
    }
    if (status) cond += ` AND status = '${DataStoreService.escape(String(status).toUpperCase())}'`;

    const rows = await this.db.findWhere(TABLES.REGULARIZATION_REQUESTS, tenantId, cond,
      { orderBy: 'attendance_date DESC', limit: 200 });

    // Enrich with employee name/email for the reviewer table.
    const userIds = [...new Set(rows.map(r => String(r.user_id)))];
    const userRows = userIds.length
      ? await this.db.findWhere(TABLES.USERS, tenantId, `ROWID IN (${userIds.map(id => `'${id}'`).join(',')})`, { limit: 200 })
      : [];
    const userMap = Object.fromEntries(userRows.map(u => [String(u.ROWID), u]));
    const enriched = rows.map(r => ({
      ...r,
      user_name:  userMap[String(r.user_id)]?.name  || '',
      user_email: userMap[String(r.user_id)]?.email || '',
    }));
    return ResponseHelper.success(res, enriched);
  }

  // Resolve the set of user IDs whose requests the caller may review.
  // Returns null for unrestricted (ATTENDANCE_ADMIN), or a Set<string> that
  // never contains the caller themselves.
  async _resolveReviewableUserIds(req, reviewerRowId) {
    const perms = Array.isArray(req.currentUser.permissions) ? req.currentUser.permissions : [];
    if (perms.includes(PERMISSIONS.ATTENDANCE_ADMIN)) return null; // sees everyone

    const ids = new Set();
    // Direct reports — managerial scope, no special permission needed.
    const reports = await this.db.findWhere(TABLES.USER_PROFILES, req.tenantId,
      `reporting_manager_id = '${reviewerRowId}'`, { limit: 200 });
    reports.forEach(r => ids.add(String(r.user_id)));

    // Team peers — only when the peer-approval permission is granted.
    if (perms.includes(PERMISSIONS.REGULARIZATION_APPROVE)) {
      const scope = new TeamScopeService(this.db);
      const peers = await scope.getTeamPeerUserIds(req.tenantId, reviewerRowId);
      peers.forEach(id => ids.add(String(id)));
    }

    ids.delete(String(reviewerRowId)); // never review your own request
    return ids;
  }

  // PUT /api/people/regularization/approve
  // Body: { requestId, action: 'approve' | 'reject', comments }
  async approve(req, res) {
    const tenantId = req.tenantId;
    const { requestId, action, comments } = req.body;

    if (!requestId) return ResponseHelper.validationError(res, 'requestId is required');
    const act = String(action || '').toLowerCase();
    if (act !== 'approve' && act !== 'reject')
      return ResponseHelper.validationError(res, "action must be 'approve' or 'reject'");
    if (act === 'reject' && !comments)
      return ResponseHelper.validationError(res, 'comments are required when rejecting');

    const request = await this.db.findById(TABLES.REGULARIZATION_REQUESTS, requestId, tenantId);
    if (!request) return ResponseHelper.notFound(res, 'Regularization request not found');
    if (request.status !== REGULARIZATION_STATUS.PENDING)
      return ResponseHelper.conflict(res, 'Request is not pending');

    const reviewerRowId = await this._resolveCallerRowId(req);
    if (!reviewerRowId) return ResponseHelper.notFound(res, 'User not found');

    // Authorization: you may review a request only if it belongs to someone in
    // your reviewable scope (direct report, or team peer with the permission,
    // or you're an attendance admin) — and never your own request.
    if (String(request.user_id) === String(reviewerRowId))
      return ResponseHelper.forbidden(res, 'You cannot review your own regularization request');
    const allowedIds = await this._resolveReviewableUserIds(req, reviewerRowId);
    if (allowedIds !== null && !allowedIds.has(String(request.user_id)))
      return ResponseHelper.forbidden(res, 'You are not authorised to review this request');

    const reviewedAt = new Date().toISOString().replace('T', ' ').slice(0, 19); // UTC

    const newStatus = act === 'approve' ? REGULARIZATION_STATUS.APPROVED : REGULARIZATION_STATUS.REJECTED;

    await this.db.update(TABLES.REGULARIZATION_REQUESTS, {
      ROWID:          requestId,
      status:         newStatus,
      reviewed_by:    String(reviewerRowId || ''),
      reviewer_notes: comments || '',
      reviewed_at:    reviewedAt,
    });

    // On approval, actually correct the attendance record for that day so the
    // regularization has a real effect (mirrors the manual `override` flow).
    let correctedRecord = null;
    if (act === 'approve') {
      correctedRecord = await this._applyCorrection(tenantId, request, reviewerRowId);
    }

    // Notify the employee (in-app + email), best-effort.
    try {
      const empRows = await this.db.query(`SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = '${request.user_id}' LIMIT 1`);
      const emp = empRows[0] || {};
      if (act === 'approve') {
        await this.notif.sendInApp({
          tenantId, userId: String(request.user_id),
          title: 'Regularization Approved',
          message: `Your attendance correction for ${request.attendance_date} was approved`,
          type: NOTIFICATION_TYPE.REGULARIZATION_APPROVED,
          entityType: 'REGULARIZATION_REQUEST', entityId: requestId,
        });
        if (emp.email) {
          await this.notif.send({
            toEmail: emp.email,
            subject: `Attendance regularization approved — ${request.attendance_date}`,
            htmlBody: `<p>Hi ${_esc(emp.name)},</p><p>Your attendance correction for <strong>${_esc(request.attendance_date)}</strong> has been approved.</p>${comments ? `<p>Note: ${_esc(comments)}</p>` : ''}`,
          });
        }
      } else {
        await this.notif.sendInApp({
          tenantId, userId: String(request.user_id),
          title: 'Regularization Rejected',
          message: `Your attendance correction for ${request.attendance_date} was rejected. Reason: ${comments}`,
          type: NOTIFICATION_TYPE.REGULARIZATION_REJECTED,
          entityType: 'REGULARIZATION_REQUEST', entityId: requestId,
        });
        if (emp.email) {
          await this.notif.send({
            toEmail: emp.email,
            subject: `Attendance regularization not approved — ${request.attendance_date}`,
            htmlBody: `<p>Hi ${_esc(emp.name)},</p><p>Your attendance correction for <strong>${_esc(request.attendance_date)}</strong> was not approved.</p><p>Reason: ${_esc(comments)}</p>`,
          });
        }
      }
    } catch (_) { /* notification failures must not fail the decision */ }

    await this.audit.log({
      tenantId, entityType: 'REGULARIZATION_REQUEST', entityId: requestId,
      action: act === 'approve' ? AUDIT_ACTION.APPROVE : AUDIT_ACTION.REJECT,
      oldValue: { status: REGULARIZATION_STATUS.PENDING },
      newValue: { status: newStatus, reviewer_notes: comments || '' },
      performedBy: reviewerRowId,
    });

    return ResponseHelper.success(res, {
      message: act === 'approve' ? 'Regularization approved' : 'Regularization rejected',
      status: newStatus,
      record: correctedRecord,
    });
  }

  // Resolve the timezone to interpret a user's wall-clock times in.
  // Priority: assigned office location's timezone → per-user profile timezone →
  // Asia/Kolkata default. The user→location link lives in permission_overrides;
  // the location's timezone lives in tenant settings.officeLocations.
  async _resolveUserTimezone(tenantId, userId) {
    // 1. Office location timezone (preferred)
    try {
      const ovr = await this.db.query(
        `SELECT permissions FROM ${TABLES.PERMISSION_OVERRIDES} ` +
        `WHERE tenant_id = '${tenantId}' AND user_id = '${userId}' AND is_active = 'true' LIMIT 1`
      );
      const locId = ovr.length ? JSON.parse(ovr[0].permissions || '{}').officeLocationId : null;
      if (locId) {
        const tRows = await this.db.query(`SELECT settings FROM ${TABLES.TENANTS} WHERE ROWID = ${tenantId} LIMIT 1`);
        const settings = tRows.length ? JSON.parse(tRows[0].settings || '{}') : {};
        const loc = (settings.officeLocations || []).find((l) => String(l.id) === String(locId));
        if (loc && loc.timezone) return loc.timezone;
      }
    } catch (_) { /* fall through to profile timezone */ }

    // 2. Per-user profile timezone
    try {
      const profiles = await this.db.findWhere(TABLES.USER_PROFILES, tenantId, `user_id = '${userId}'`, { limit: 1 });
      if (profiles[0]?.timezone) return profiles[0].timezone;
    } catch (_) { /* fall through to default */ }

    // 3. Default
    return 'Asia/Kolkata';
  }

  // Convert a wall-clock datetime ('YYYY-MM-DD HH:MM[:SS]', interpreted in the
  // given IANA timezone) into a UTC datetime string ('YYYY-MM-DD HH:MM:SS').
  // Returns '' for empty input. This keeps regularized times consistent with
  // live check-in, which stores UTC — otherwise the value is later read back as
  // UTC and shifted by the user's offset (e.g. 09:00 IST shown as 14:30 IST).
  _wallClockToUTC(fallbackDate, wallDateTime, timezone) {
    if (!wallDateTime) return '';
    const safeZone = timezone && timezone.trim() ? timezone.trim() : 'Asia/Kolkata';
    const m = String(wallDateTime).trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/);
    const datePart = m ? m[1] : fallbackDate;
    let timePart = m ? m[2] : String(wallDateTime).trim();
    if (/^\d{2}:\d{2}$/.test(timePart)) timePart += ':00';
    try {
      // Treat the wall time as UTC first, then measure how that instant renders
      // in the target zone to recover the offset, and subtract it.
      const asUTC = new Date(`${datePart}T${timePart}Z`);
      if (Number.isNaN(asUTC.getTime())) return wallDateTime;
      const inTZ = new Intl.DateTimeFormat('sv', {
        timeZone: safeZone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).format(asUTC);
      const tzMs = new Date(inTZ.replace(' ', 'T') + 'Z').getTime();
      const offsetMs = tzMs - asUTC.getTime();
      const utc = new Date(asUTC.getTime() - offsetMs);
      return utc.toISOString().replace('T', ' ').slice(0, 19);
    } catch (_) {
      return wallDateTime;
    }
  }

  // Work hours between two UTC datetime strings, or null if not computable.
  _computeWorkHours(inUTC, outUTC) {
    if (!inUTC || !outUTC) return null;
    const inMs  = new Date(inUTC.replace(' ', 'T') + 'Z').getTime();
    const outMs = new Date(outUTC.replace(' ', 'T') + 'Z').getTime();
    if (Number.isNaN(inMs) || Number.isNaN(outMs) || outMs <= inMs) return null;
    return Math.round(((outMs - inMs) / 3600000) * 100) / 100;
  }

  // Upsert the attendance_records row for the request's user+date with the
  // requested times, recomputing work hours. Returns the written record.
  async _applyCorrection(tenantId, request, reviewerRowId) {
    const userId = String(request.user_id);
    const date   = request.attendance_date;

    // Employees enter wall-clock times in their own timezone, but
    // attendance_records stores check-in/out as UTC. Convert before writing so
    // the corrected time renders correctly instead of being shifted by the
    // user's UTC offset. Timezone is resolved from the user's office location.
    const tz = await this._resolveUserTimezone(tenantId, userId);
    const checkIn  = this._wallClockToUTC(date, request.requested_check_in, tz);
    const checkOut = this._wallClockToUTC(date, request.requested_check_out, tz);

    const overrideReason = `Regularized: ${request.reason || ''}`.trim();
    const existing = await this.db.findWhere(TABLES.ATTENDANCE_RECORDS, tenantId,
      `user_id = '${userId}' AND attendance_date = '${DataStoreService.escape(date)}'`, { limit: 1 });

    // Effective check-in/out after applying the correction — fall back to the
    // existing record for whichever side wasn't corrected, so a partial
    // correction (only check-in or only check-out) still recomputes hours.
    const effIn  = checkIn  || existing[0]?.check_in_time  || '';
    const effOut = checkOut || existing[0]?.check_out_time || '';
    const workHours = this._computeWorkHours(effIn, effOut);

    if (existing.length > 0) {
      const patch = {
        ROWID:           existing[0].ROWID,
        status:          ATTENDANCE_STATUS.PRESENT,
        override_reason: overrideReason,
        overridden_by:   String(reviewerRowId || ''),
      };
      if (checkIn)  patch.check_in_time  = checkIn;
      if (checkOut) patch.check_out_time = checkOut;
      if (workHours != null) patch.work_hours = workHours;
      return this.db.update(TABLES.ATTENDANCE_RECORDS, patch);
    }

    return this.db.insert(TABLES.ATTENDANCE_RECORDS, {
      tenant_id:            String(tenantId),
      user_id:              userId,
      attendance_date:      date,
      check_in_time:        checkIn,
      check_out_time:       checkOut,
      work_hours:           workHours == null ? 0 : workHours,
      status:               ATTENDANCE_STATUS.PRESENT,
      is_wfh:               'false',
      wfh_reason:           '',
      is_location_verified: 'false',
      check_in_ip:          '',
      override_reason:      overrideReason,
      overridden_by:        String(reviewerRowId || ''),
    });
  }
}

// HTML-escape helper for free-text fields embedded into notification emails.
function _esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = RegularizationController;
