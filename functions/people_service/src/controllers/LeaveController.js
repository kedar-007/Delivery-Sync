'use strict';

const DataStoreService = require('../services/DataStoreService');
const AuditService = require('../services/AuditService');
const NotificationService = require('../services/NotificationService');
const ResponseHelper = require('../utils/ResponseHelper');
const TeamScopeService = require('../services/TeamScopeService');
const { TABLES, LEAVE_STATUS, AUDIT_ACTION, NOTIFICATION_TYPE, PERMISSIONS } = require('../utils/Constants');

const fmtDT = (d) => DataStoreService.fmtDT(d);

// ── Working-day helpers ────────────────────────────────────────────────────────

function getNthSaturday(year, month, date) {
  let count = 0;
  for (let d = 1; d <= date; d++) {
    if (new Date(year, month, d).getDay() === 6) count++;
  }
  return count;
}

// Returns true when the given dayOfWeek (0=Sun,6=Sat) is a non-working day
// under the supplied weekend policy string.
function isDayOff(dayOfWeek, year, month, date, policy) {
  if (policy === 'all_on') return false;
  if (dayOfWeek === 0) return true; // Sunday always off (except all_on)
  if (dayOfWeek !== 6) return false;
  // Saturday logic
  if (policy === 'all_off') return true;
  const nth = getNthSaturday(year, month, date);
  if (policy === '1st_3rd_off')     return nth === 1 || nth === 3;
  if (policy === '2nd_4th_off')     return nth === 2 || nth === 4;
  if (policy === '2nd_4th_5th_off') return nth === 2 || nth === 4 || nth === 5;
  if (policy === 'alternate_off')   return nth % 2 === 1;
  if (policy === '5th_sat_working') return nth !== 5;
  return true; // default: treat as all_off
}

// Count calendar days between two ISO date strings, excluding weekends (per
// policy) and any dates in the holidaySet.  Half-days must be handled
// by the caller before invoking this function.
function calcWorkingDays(startDate, endDate, policy, holidaySet) {
  const start = new Date(startDate);
  const end   = new Date(endDate);
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow  = cur.getDay();
    const yr   = cur.getFullYear();
    const mo   = cur.getMonth();
    const d    = cur.getDate();
    const ds   = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (!isDayOff(dow, yr, mo, d, policy) && !(holidaySet && holidaySet.has(ds))) {
      count++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

class LeaveController {
  constructor(catalystApp, adminCatalystApp) {
    this.db = new DataStoreService(catalystApp);
    this.adminDb = new DataStoreService(adminCatalystApp || catalystApp);
    this.audit = new AuditService(this.db);
    this.notif = new NotificationService(catalystApp, this.db);
  }

  // ── Leave Types ───────────────────────────────────────────────────────────────
  async listTypes(req, res) {
    const types = await this.db.findWhere(TABLES.LEAVE_TYPES, req.tenantId, `is_active = 'true'`, { orderBy: 'name ASC', limit: 50 });
    return ResponseHelper.success(res, types);
  }

  async createType(req, res) {
    const { name, code, days_per_year, carry_forward_days, requires_approval, min_days, max_days, notice_days, is_paid } = req.body;
    if (!name || !code || !days_per_year) return ResponseHelper.validationError(res, 'name, code and days_per_year required');
    const row = await this.db.insert(TABLES.LEAVE_TYPES, {
      tenant_id: String(req.tenantId),
      name, code,
      days_per_year: String(days_per_year),
      carry_forward_days: String(carry_forward_days || 0),
      requires_approval: requires_approval !== false ? 'true' : 'false',
      min_days: String(min_days || 0.5),
      max_days: String(max_days || 30),
      notice_days: String(notice_days || 1),
      is_paid: is_paid !== false ? 'true' : 'false',
      is_active: 'true',
      created_by: String(req.currentUser.id),
    });
    await this.audit.log({ tenantId: req.tenantId, entityType: 'LEAVE_TYPE', entityId: String(row.ROWID), action: AUDIT_ACTION.CREATE, newValue: { name, code, days_per_year }, performedBy: req.currentUser.id });
    return ResponseHelper.created(res, row);
  }

  async updateType(req, res) {
    const type = await this.db.findById(TABLES.LEAVE_TYPES, req.params.typeId, req.tenantId);
    if (!type) return ResponseHelper.notFound(res, 'Leave type not found');
    const allowed = ['name', 'days_per_year', 'carry_forward_days', 'requires_approval', 'min_days', 'max_days', 'notice_days', 'is_paid', 'is_active'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const updated = await this.db.update(TABLES.LEAVE_TYPES, { ROWID: req.params.typeId, ...updates });
    await this.audit.log({ tenantId: req.tenantId, entityType: 'LEAVE_TYPE', entityId: String(req.params.typeId), action: AUDIT_ACTION.UPDATE, oldValue: type, newValue: updates, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, updated);
  }

  // ── Leave Balance ─────────────────────────────────────────────────────────────
  async getBalance(req, res) {
    try {
      let userId = req.params.userId || req.currentUser.id;

      if (
        req.params.userId &&
        req.currentUser.role === 'TEAM_MEMBER' &&
        userId !== req.currentUser.id
      ) {
        return ResponseHelper.forbidden(
          res,
          "Cannot view another user's leave balance"
        );
      }

      const year = new Date().getFullYear();
      // IMPORTANT: Never convert Catalyst IDs to Number — they exceed Number.MAX_SAFE_INTEGER
      // (9×10^15), so JS float64 rounds the last digit and produces the wrong ID.
      // Always keep as string and use quoted comparisons in ZCQL.
      let userIdStr = String(userId || '');
      if (!userIdStr) {
        const uRows = await this.db.findWhere(TABLES.USERS, req.tenantId,
          `email = '${req.currentUser.email}'`, { limit: 1 });
        if (!uRows.length) return ResponseHelper.notFound(res, 'User not found');
        userIdStr = String(uRows[0].ROWID);
      }

      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;

      console.log('[getBalance] userId:', userIdStr, 'year:', year);

      // 1. Fetch balances — always quoted strings; never Number() convert large IDs
      const balances = await this.db.findWhere(
        TABLES.LEAVE_BALANCES,
        req.tenantId,
        `user_id = '${userIdStr}' AND year = '${year}'`,
        { limit: 50 }
      );
      console.log('[getBalance] balance rows found:', balances.length, JSON.stringify(balances));

      // 2. Fetch leave types
      const types = await this.db.findWhere(
        TABLES.LEAVE_TYPES,
        req.tenantId,
        `is_active = 'true'`,
        { limit: 50 }
      );

      const typeMap = {};
      types.forEach(t => {
        typeMap[String(t.ROWID)] = t;
      });

      // 3. Fetch APPROVED leaves — user_id quoted string to match leave_requests schema
      const approvedLeaves = await this.db.findWhere(
        TABLES.LEAVE_REQUESTS,
        req.tenantId,
        `user_id = '${userIdStr}' AND status = 'APPROVED' AND start_date >= '${startDate}' AND start_date <= '${endDate}'`,
        { limit: 200 }
      );

      console.log('[getBalance] approvedLeaves count:', approvedLeaves.length);

      // 4. Fetch PENDING leaves
      const pendingLeaves = await this.db.findWhere(
        TABLES.LEAVE_REQUESTS,
        req.tenantId,
        `user_id = '${userIdStr}' AND status = 'PENDING' AND start_date >= '${startDate}' AND start_date <= '${endDate}'`,
        { limit: 200 }
      );

      console.log('[getBalance] pendingLeaves count:', pendingLeaves.length);

      // 5. Aggregate used_days
      const usedMap = {};
      approvedLeaves.forEach(lr => {
        const ltId = String(lr.leave_type_id);
        const days = Number(lr.days_count || 0);

        if (!usedMap[ltId]) usedMap[ltId] = 0;
        usedMap[ltId] += days;
      });

      // 6. Aggregate pending_days
      const pendingMap = {};
      pendingLeaves.forEach(lr => {
        const ltId = String(lr.leave_type_id);
        const days = Number(lr.days_count || 0);

        if (!pendingMap[ltId]) pendingMap[ltId] = 0;
        pendingMap[ltId] += days;
      });

      console.log('[getBalance] usedMap:', usedMap);
      console.log('[getBalance] pendingMap:', pendingMap);

      // 7. Build response
      // If no balance rows exist for this user+year, return zero-balance rows — do NOT
      // synthesise from days_per_year; balance must be set via admin setBalance or cron accrual.
      const sourceRows = balances.length > 0
        ? balances
        : types.map(t => ({
            leave_type_id: String(t.ROWID),
            carry_forward_days: 0,
            allocated_days: 0,
            total_allocated: 0,
          }));

      const result = sourceRows.map(b => {
        const ltId = String(b.leave_type_id);

        // Support both column name conventions
        const opening   = Number(b.carry_forward_days ?? b.opening_balance ?? 0);
        const allocated = Number(b.allocated_days ?? b.total_allocated ?? 0);

        // Prefer stored DB fields (maintained by apply/approve/cancel).
        // Fall back to the leave-request aggregates only when no balance record exists
        // (b.used_days undefined means the row was synthesised from leave_types).
        const used    = b.used_days    !== undefined ? parseFloat(b.used_days    || 0) : (usedMap[ltId]    || 0);
        const pending = b.pending_days !== undefined ? parseFloat(b.pending_days || 0) : (pendingMap[ltId] || 0);

        const totalAvailable = Math.max(0, allocated - used);
        const remaining      = Math.max(0, totalAvailable - pending);

        return {
          leave_type_id: ltId,
          leave_type: typeMap[ltId] || null,
          opening_balance: opening,
          total_allocated: allocated,
          total_available: totalAvailable,
          used_days: used,
          pending_days: pending,
          remaining_days: remaining,
        };
      });

      return ResponseHelper.success(res, result);

    } catch (err) {
      console.error('[LeaveController.getBalance] ERROR:', err);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── Leave Requests ────────────────────────────────────────────────────────────
  async listRequests(req, res) {
    const { status, mine, team } = req.query;
    const me = req.currentUser;
    let where = '';

    // `team=true` must take precedence: the project uses TEAM_MEMBER as the
    // only non-admin role, and reporting managers are themselves TEAM_MEMBERs
    // who hold LEAVE_APPROVE via their org role. The previous role-string
    // short-circuit (`me.role === 'TEAM_MEMBER'`) forced every RM into a
    // "mine only" view, hiding their reportees' leave requests. The route
    // already gates on LEAVE_READ; team-scoped reads are further constrained
    // to the caller's direct reports below.
    if (team === 'true') {
      const reporteeProfiles = await this.db.findWhere(
        TABLES.USER_PROFILES, req.tenantId,
        `reporting_manager_id = '${me.id}'`, { limit: 200 }
      );
      if (reporteeProfiles.length === 0) {
        return ResponseHelper.success(res, []);
      }
      const validIds = reporteeProfiles.map(p => p.user_id).filter(id => id && String(id) !== 'null');
      if (validIds.length === 0) {
        return ResponseHelper.success(res, []);
      }
      const ids = validIds.map(id => `'${id}'`).join(',');
      where = `user_id IN (${ids})`;
    } else if (mine === 'true' || (me.role === 'TEAM_MEMBER' && !(Array.isArray(me.permissions) && me.permissions.includes('PROJECT_DATA_VIEW_ALL')))) {
      // My own leaves only (default for any non-admin caller without org-wide access).
      where = `user_id = '${me.id}'`;
    }

    if (status) where += (where ? ' AND ' : '') + `status = '${DataStoreService.escape(status)}'`;
    const requests = await this.db.fetchAll(
      TABLES.LEAVE_REQUESTS, req.tenantId, where || null, { orderBy: 'CREATEDTIME DESC' }
    );

    // Enrich with user and leave type info
    const users = await this.db.fetchAll(TABLES.USERS, req.tenantId, null);
    const types = await this.db.findWhere(TABLES.LEAVE_TYPES, req.tenantId, '', { limit: 50 });
    const userMap = {};
    users.forEach(u => { userMap[String(u.ROWID)] = u; });
    const typeMap = {};
    types.forEach(t => { typeMap[String(t.ROWID)] = t; });

    const enriched = requests.map(r => {
      const u = userMap[String(r.user_id)] || {};
      const t = typeMap[String(r.leave_type_id)] || {};
      return { ...r, user_name: u.name || '', user_avatar_url: u.avatar_url || '', leave_type_name: t.name || '' };
    });
    return ResponseHelper.success(res, enriched);
  }

  async getRequest(req, res) {
    const req_ = await this.db.findById(TABLES.LEAVE_REQUESTS, req.params.requestId, req.tenantId);
    if (!req_) return ResponseHelper.notFound(res, 'Leave request not found');
    return ResponseHelper.success(res, req_);
  }

  async applyLeave(req, res) {
    try {
      const { leave_type_id, start_date, end_date, is_half_day, half_day_session, reason } = req.body;

      if (!leave_type_id || !start_date || !end_date || !reason)
        return ResponseHelper.validationError(res, 'leave_type_id, start_date, end_date and reason required');

      const tenantId = req.tenantId;
      const userId = req.currentUser.id;
      const year = new Date(start_date).getFullYear();

      console.log('leave_type_id raw:', leave_type_id, typeof leave_type_id);

      // ── Resolve leave_type_id (ROWID or name string) ───────────────────────
      const rawId = typeof leave_type_id === 'object'
        ? leave_type_id?.id
        : String(leave_type_id).trim();

      let leaveTypeId;    // kept as string throughout to avoid precision loss + serialization issues
      let leaveTypeName = null;
      let leaveTypeRow  = null;  // captured for auto-create balance below

      try {
        // Validate it's a valid integer string — throws if name like "Sick Leave"
        if (!/^\d+$/.test(rawId)) throw new Error('not a numeric id');
        leaveTypeId = rawId; // keep as string

        const typeRows = await this.db.findWhere(TABLES.LEAVE_TYPES, tenantId,
          `ROWID = ${leaveTypeId} AND is_active = 'true'`, { limit: 1 });
        if (typeRows.length === 0)
          return ResponseHelper.validationError(res, `Leave type not found or inactive`);
        leaveTypeName = typeRows[0].name;
        leaveTypeRow  = typeRows[0];
      } catch {
        // rawId is a name string — look up by name
        const typeRows = await this.db.findWhere(TABLES.LEAVE_TYPES, tenantId,
          `name = '${DataStoreService.escape(rawId)}' AND is_active = 'true'`, { limit: 1 });
        if (typeRows.length === 0)
          return ResponseHelper.validationError(res, `Leave type '${rawId}' not found`);
        leaveTypeId = String(typeRows[0].ROWID); // keep as string ✅
        leaveTypeName = typeRows[0].name;
        leaveTypeRow  = typeRows[0];
      }

      console.log('Resolved leaveTypeId:', leaveTypeId, 'leaveTypeName:', leaveTypeName);

      // ── Overlap check ──────────────────────────────────────────────────────
      const overlap = await this.db.findWhere(TABLES.LEAVE_REQUESTS, tenantId,
        `user_id = '${userId}' AND status != 'REJECTED' AND status != 'CANCELLED' ` +
        `AND start_date <= '${DataStoreService.escape(end_date)}' ` +
        `AND end_date >= '${DataStoreService.escape(start_date)}'`, { limit: 1 });

      if (overlap.length > 0)
        return ResponseHelper.conflict(res, 'Leave dates overlap with an existing request');

      // ── Days calculation (working days only — excludes weekends + holidays) ──
      let days_count;
      if (is_half_day) {
        days_count = 0.5;
      } else {
        // Resolve weekend policy for the applicant's office location
        let policy = 'all_off';
        let holidaySet = new Set();
        try {
          const tenantRows = await this.db.query(
            `SELECT settings FROM ${TABLES.TENANTS} WHERE ROWID = '${tenantId}' LIMIT 1`
          );
          if (tenantRows.length > 0) {
            const settings = JSON.parse(tenantRows[0].settings || '{}');
            const wp = settings.weekendPolicy || { default: 'all_off', perLocation: {} };
            const locId = req.currentUser.officeLocationId;
            policy = (locId && wp.perLocation?.[locId]) ? wp.perLocation[locId] : (wp.default || 'all_off');

            // Collect non-optional public holidays within the date range
            const startYr = new Date(start_date).getFullYear();
            const endYr   = new Date(end_date).getFullYear();
            const yearsToFetch = [...new Set([String(startYr), String(endYr)])];
            for (const yr of yearsToFetch) {
              const dbHols = await this.db.findWhere(TABLES.LEAVE_CALENDAR, tenantId,
                `year = '${yr}' AND is_optional = 'false'`, { limit: 200 });
              dbHols.forEach(h => { if (h.holiday_date) holidaySet.add(h.holiday_date); });
            }

            // Location-specific non-optional holidays
            if (locId && settings.locationCalendar?.[locId]) {
              const locCal = settings.locationCalendar[locId];
              for (const yr of yearsToFetch) {
                (locCal[yr] || []).forEach(h => {
                  if (h.holiday_date && !h.is_optional) holidaySet.add(h.holiday_date);
                });
              }
            }
          }
        } catch (_) { /* calendar config unavailable — fall back to policy=all_off */ }

        days_count = calcWorkingDays(start_date, end_date, policy, holidaySet);
        if (days_count === 0)
          return ResponseHelper.validationError(res, 'Selected date range has no working days (all days are weekends or public holidays)');
      }

      // ── Balance check + auto-create if missing ────────────────────────────
      // Always use quoted string IDs — Catalyst BigInt IDs exceed JS Number.MAX_SAFE_INTEGER
      // so Number() conversion silently corrupts them.
      const balanceQuery = `user_id = '${userId}' AND leave_type_id = '${leaveTypeId}' AND year = '${year}'`;
      console.log('[applyLeave] balance lookup query:', balanceQuery);
      let balance = await this.db.findWhere(TABLES.LEAVE_BALANCES, tenantId, balanceQuery, { limit: 1 });
      console.log('[applyLeave] balance row found:', balance.length > 0 ? JSON.stringify(balance[0]) : 'NONE');

      if (balance.length === 0) {
        // No balance row — admin must set the balance via setBalance or cron accrual.
        // Do not auto-create from leave type defaults.
        return ResponseHelper.validationError(res,
          `No leave balance found for this leave type. Please contact your administrator to set your leave balance.`);
      }

      if (balance.length > 0 && parseFloat(balance[0].remaining_days) < days_count)
        return ResponseHelper.validationError(res,
          `Insufficient ${leaveTypeName} balance. Available: ${parseFloat(balance[0].remaining_days)} days, Requested: ${days_count} days`);

      // ── Insert request ─────────────────────────────────────────────────────
      //   Pass as strings — avoids both precision loss and BigInt serialization error
      const row = await this.db.insert(TABLES.LEAVE_REQUESTS, {
        tenant_id: String(tenantId),
        user_id: String(userId),
        leave_type_id: String(leaveTypeId),
        start_date,
        end_date,
        days_count: Number(days_count),
        reason,
        is_half_day: !!is_half_day,
        half_day_session: half_day_session || '',
        status: LEAVE_STATUS.PENDING,
        reviewer_notes: '',
      });
      console.log('[applyLeave] leave request inserted, ROWID:', row.ROWID);

      // ── Deduct from balance ────────────────────────────────────────────────
      if (balance.length > 0) {
        const newPending   = parseFloat(balance[0].pending_days   ?? 0) + days_count;
        const newRemaining = parseFloat(balance[0].remaining_days ?? 0) - days_count;
        console.log('[applyLeave] updating balance — pending:', newPending, 'remaining:', newRemaining);
        await this.db.update(TABLES.LEAVE_BALANCES, {
          ROWID: balance[0].ROWID,
          pending_days: newPending,
          remaining_days: Math.max(0, newRemaining),
        });
        console.log('[applyLeave] balance update done');
      } else {
        console.warn('[applyLeave] balance row still missing after auto-create — DB insert may have failed');
      }

      // ── Notify RM ──────────────────────────────────────────────────────────
      const profileRows = await this.db.findWhere(TABLES.USER_PROFILES, tenantId,
        `user_id = '${userId}'`, { limit: 1 });
      const rmId = profileRows[0]?.reporting_manager_id;

      if (rmId) {
        const rmRows = await this.db.query(
          `SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = '${rmId}' LIMIT 1`);
        if (rmRows[0]) {
          // Branded HTML template — the wrapper auto-escapes free-text fields
          // (applicant name, reason) so they can't break the email markup.
          await this.notif.sendLeaveRequested({
            toEmail:        rmRows[0].email,
            toName:         rmRows[0].name,
            applicantName:  req.currentUser.name,
            leaveTypeName,
            startDate:      start_date,
            endDate:        end_date,
            daysCount:      days_count,
            reason,
          });
          await this.notif.sendInApp({
            tenantId,
            userId: rmId,
            title: 'Leave Request',
            message: `${req.currentUser.name} requested ${days_count} day(s) leave (${leaveTypeName ?? ''})`,
            type: NOTIFICATION_TYPE.LEAVE_APPROVAL_NEEDED,
            entityType: 'LEAVE',
            entityId: row.ROWID,
          });
        }
      }

      await this.audit.log({
        tenantId,
        entityType: 'LEAVE',
        entityId: row.ROWID,
        action: AUDIT_ACTION.CREATE,
        newValue: row,
        performedBy: userId,
      });

      return ResponseHelper.created(res, row);
    } catch (err) {
      console.error('[LeaveController.applyLeave]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }
  async cancelRequest(req, res) {
    const leave = await this.db.findById(TABLES.LEAVE_REQUESTS, req.params.requestId, req.tenantId);
    if (!leave) return ResponseHelper.notFound(res, 'Leave request not found');
    if (String(leave.user_id) !== req.currentUser.id) return ResponseHelper.forbidden(res, 'Cannot cancel another user\'s leave');
    if (leave.status !== LEAVE_STATUS.PENDING) return ResponseHelper.validationError(res, 'Only PENDING requests can be cancelled');

    await this.db.update(TABLES.LEAVE_REQUESTS, { ROWID: req.params.requestId, status: LEAVE_STATUS.CANCELLED });

    // Restore pending balance
    const balance = await this.db.findWhere(TABLES.LEAVE_BALANCES, req.tenantId,
      `user_id = '${leave.user_id}' AND leave_type_id = '${leave.leave_type_id}' AND year = '${new Date(leave.start_date).getFullYear()}'`, { limit: 1 });
    if (balance.length > 0) {
      await this.db.update(TABLES.LEAVE_BALANCES, {
        ROWID: balance[0].ROWID,
        pending_days: Math.max(0, parseFloat(balance[0].pending_days || 0) - parseFloat(leave.days_count)),
        remaining_days: parseFloat(balance[0].remaining_days || 0) + parseFloat(leave.days_count),
      });
    }
    return ResponseHelper.success(res, { message: 'Leave cancelled' });
  }

  async approveRequest(req, res) {
    this.notif.tenantSlug = req.currentUser?.tenantSlug || '';
    const leave = await this.db.findById(TABLES.LEAVE_REQUESTS, req.params.requestId, req.tenantId);
    if (!leave) return ResponseHelper.notFound(res, 'Leave request not found');
    if (leave.status !== LEAVE_STATUS.PENDING) return ResponseHelper.validationError(res, 'Only PENDING requests can be approved');

    await this.db.update(TABLES.LEAVE_REQUESTS, {
      ROWID: req.params.requestId, status: LEAVE_STATUS.APPROVED,
      reviewed_by: req.currentUser.id, reviewer_notes: req.body.notes || '', reviewed_at: fmtDT(new Date()),
    });

    // Move from pending to used in balance
    const year = new Date(leave.start_date).getFullYear();
    const balQuery = `user_id = '${leave.user_id}' AND leave_type_id = '${leave.leave_type_id}' AND year = '${year}'`;
    console.log('[approveRequest] balance lookup query:', balQuery);
    let balance = await this.db.findWhere(TABLES.LEAVE_BALANCES, req.tenantId, balQuery, { limit: 1 });
    console.log('[approveRequest] balance row:', balance.length > 0 ? JSON.stringify(balance[0]) : 'NONE');

    if (balance.length === 0) {
      // No balance row exists — balance must be set by admin or cron accrual.
      // Do not auto-create from leave type defaults; log and skip balance deduction.
      console.log('[approveRequest] no balance row found for user', leave.user_id, '— skipping balance deduction');
    }

    if (balance.length > 0) {
      const b = balance[0];
      const daysCount = parseFloat(leave.days_count);
      const totalAllocated = parseFloat(b.total_allocated ?? b.allocated_days ?? 0);
      const newUsed    = parseFloat(b.used_days    || 0) + daysCount;
      const newPending = Math.max(0, parseFloat(b.pending_days || 0) - daysCount);
      // Recompute remaining from source-of-truth to self-heal any prior missed updates
      const newRemaining = Math.max(0, totalAllocated - newUsed - newPending);
      console.log('[approveRequest] updating balance — used:', newUsed, 'pending:', newPending, 'remaining:', newRemaining);
      await this.db.update(TABLES.LEAVE_BALANCES, {
        ROWID: b.ROWID,
        used_days: newUsed,
        pending_days: newPending,
        remaining_days: newRemaining,
      });
      console.log('[approveRequest] balance update done');
    } else {
      console.warn('[approveRequest] WARNING: balance row still missing after auto-create for user_id:', leave.user_id, 'leave_type_id:', leave.leave_type_id, 'year:', year);
    }

    // Notify applicant — branded approval email + in-app notification.
    // Fetch leave type label so the email can show "Annual leave" rather
    // than a numeric ID; non-fatal if the lookup fails.
    const userRows = await this.db.query(`SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = '${leave.user_id}' LIMIT 1`);
    if (userRows[0]) {
      let leaveTypeName = '';
      try {
        const typeRows = await this.db.findWhere(TABLES.LEAVE_TYPES, req.tenantId,
          `ROWID = ${leave.leave_type_id}`, { limit: 1 });
        leaveTypeName = typeRows[0]?.name || '';
      } catch (_) { /* leave type lookup is non-fatal */ }

      await this.notif.sendLeaveApproved({
        toEmail:       userRows[0].email,
        toName:        userRows[0].name,
        leaveTypeName,
        startDate:     leave.start_date,
        endDate:       leave.end_date,
        daysCount:     parseFloat(leave.days_count) || 0,
        approverName:  req.currentUser.name,
        approverNotes: req.body.notes || '',
        leaveId:       req.params.requestId,
      });
      await this.notif.sendInApp({ tenantId: req.tenantId, userId: leave.user_id, title: 'Leave Approved', message: `Your leave from ${leave.start_date} to ${leave.end_date} was approved`, type: NOTIFICATION_TYPE.LEAVE_APPROVED, entityType: 'LEAVE', entityId: req.params.requestId });
    }

    await this.audit.log({ tenantId: req.tenantId, entityType: 'LEAVE', entityId: req.params.requestId, action: AUDIT_ACTION.APPROVE, newValue: { status: LEAVE_STATUS.APPROVED }, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, { message: 'Leave approved' });
  }

  async rejectRequest(req, res) {
    this.notif.tenantSlug = req.currentUser?.tenantSlug || '';
    const { notes } = req.body;
    if (!notes) return ResponseHelper.validationError(res, 'Rejection reason (notes) is required');

    const leave = await this.db.findById(TABLES.LEAVE_REQUESTS, req.params.requestId, req.tenantId);
    if (!leave) return ResponseHelper.notFound(res, 'Leave request not found');
    if (leave.status !== LEAVE_STATUS.PENDING) return ResponseHelper.validationError(res, 'Only PENDING requests can be rejected');

    await this.db.update(TABLES.LEAVE_REQUESTS, {
      ROWID: req.params.requestId, status: LEAVE_STATUS.REJECTED,
      reviewed_by: req.currentUser.id, reviewer_notes: notes, reviewed_at: fmtDT(new Date()),
    });

    // Restore balance
    const year = new Date(leave.start_date).getFullYear();
    const balance = await this.db.findWhere(TABLES.LEAVE_BALANCES, req.tenantId,
      `user_id = '${leave.user_id}' AND leave_type_id = '${leave.leave_type_id}' AND year = '${year}'`, { limit: 1 });
    if (balance.length > 0) {
      await this.db.update(TABLES.LEAVE_BALANCES, {
        ROWID: balance[0].ROWID,
        pending_days: Math.max(0, parseFloat(balance[0].pending_days || 0) - parseFloat(leave.days_count)),
        remaining_days: parseFloat(balance[0].remaining_days || 0) + parseFloat(leave.days_count),
      });
    }

    const userRows = await this.db.query(`SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = '${leave.user_id}' LIMIT 1`);
    if (userRows[0]) {
      let leaveTypeName = '';
      try {
        const typeRows = await this.db.findWhere(TABLES.LEAVE_TYPES, req.tenantId,
          `ROWID = ${leave.leave_type_id}`, { limit: 1 });
        leaveTypeName = typeRows[0]?.name || '';
      } catch (_) { /* leave type lookup is non-fatal */ }

      await this.notif.sendLeaveRejected({
        toEmail:      userRows[0].email,
        toName:       userRows[0].name,
        leaveTypeName,
        startDate:    leave.start_date,
        endDate:      leave.end_date,
        daysCount:    parseFloat(leave.days_count) || 0,
        approverName: req.currentUser.name,
        reason:       notes,
        leaveId:      req.params.requestId,
      });
      await this.notif.sendInApp({ tenantId: req.tenantId, userId: leave.user_id, title: 'Leave Rejected', message: `Your leave was rejected: ${notes}`, type: NOTIFICATION_TYPE.LEAVE_REJECTED, entityType: 'LEAVE', entityId: req.params.requestId });
    }

    await this.audit.log({ tenantId: req.tenantId, entityType: 'LEAVE', entityId: req.params.requestId, action: AUDIT_ACTION.REJECT, newValue: { status: LEAVE_STATUS.REJECTED, notes }, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, { message: 'Leave rejected' });
  }

  // GET /api/people/leave/calendar?scope=team|org&date_from=&date_to=
  // scope=team (default): leaves for the caller + their team peers only
  // scope=org:            all org leaves — requires LEAVE_ORG_VIEW permission
  async calendar(req, res) {
    const { date_from, date_to, scope } = req.query;
    const from = date_from || DataStoreService.today();
    const to   = date_to   || DataStoreService.daysAgo(-30);

    let approved = await this.db.findWhere(TABLES.LEAVE_REQUESTS, req.tenantId,
      `status = 'APPROVED' AND start_date <= '${DataStoreService.escape(to)}' AND end_date >= '${DataStoreService.escape(from)}'`,
      { limit: 300 });

    if (scope === 'org') {
      // Org-wide: verify the caller has LEAVE_ORG_VIEW
      const perms = req.currentUser.permissions || [];
      const isSuperAdmin  = req.currentUser.role === 'SUPER_ADMIN';
      const isTenantAdmin = req.currentUser.role === 'TENANT_ADMIN';
      if (!isSuperAdmin && !isTenantAdmin && !perms.includes(PERMISSIONS.LEAVE_ORG_VIEW)) {
        return ResponseHelper.forbidden(res, 'LEAVE_ORG_VIEW permission required for org-wide calendar');
      }
      // No additional filtering — return all approved leaves
    } else {
      // Default team scope: only the caller's own team peers
      const teamScope = new TeamScopeService(this.db);
      const peerIds   = await teamScope.getTeamPeerUserIds(req.tenantId, req.currentUser.id);
      const peerSet   = new Set(peerIds.map(String));
      approved = approved.filter(r => peerSet.has(String(r.user_id)));
    }

    // Enrich with user and leave type info
    const users = await this.db.findAll(TABLES.USERS, { tenant_id: req.tenantId }, { limit: 300 });
    const types = await this.db.findWhere(TABLES.LEAVE_TYPES, req.tenantId, '', { limit: 50 });
    const userMap = {};
    users.forEach(u => { userMap[String(u.ROWID)] = u; });
    const typeMap = {};
    types.forEach(t => { typeMap[String(t.ROWID)] = t; });

    const enriched = approved.map(r => {
      const u = userMap[String(r.user_id)] || {};
      const t = typeMap[String(r.leave_type_id)] || {};
      return { ...r, user_name: u.name || '', user_avatar_url: u.avatar_url || '', leave_type_name: t.name || '' };
    });
    return ResponseHelper.success(res, enriched);
  }

  // GET /api/people/leave/overlaps?start_date=&end_date=
  async checkOverlap(req, res) {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) return ResponseHelper.validationError(res, 'start_date and end_date required');
    const overlapping = await this.db.findWhere(TABLES.LEAVE_REQUESTS, req.tenantId,
      `status = 'APPROVED' AND start_date <= '${DataStoreService.escape(end_date)}' AND end_date >= '${DataStoreService.escape(start_date)}'`,
      { limit: 100 });
    return ResponseHelper.success(res, { has_overlap: overlapping.length > 0, overlapping_requests: overlapping });
  }

  async getCompanyCalendar(req, res) {
    try {
      // If caller doesn't pass locationId but the authenticated user has one, use it as default
      const { year } = req.query;
      const locationId = req.query.locationId || req.currentUser.officeLocationId || null;
      const y = year || new Date().getFullYear();

      // Fetch org-wide holidays from leave_calendar table
      const dbHolidays = await this.db.findWhere(TABLES.LEAVE_CALENDAR, req.tenantId,
        `year = '${y}'`, { orderBy: 'holiday_date ASC', limit: 200 });
      const orgHolidays = dbHolidays.map(h => ({ ...h, id: String(h.ROWID), source: 'org' }));

      // Include location-specific holidays from tenant settings
      // If locationId provided: fetch only that location; otherwise fetch all locations
      let locationHolidays = [];
      try {
        const tenantRows = await this.db.query(
          `SELECT settings FROM ${TABLES.TENANTS} WHERE ROWID = '${req.tenantId}' LIMIT 1`
        );
        if (tenantRows.length > 0) {
          const settings = JSON.parse(tenantRows[0].settings || '{}');
          const locationCalendar = settings.locationCalendar || {};
          const locIds = locationId ? [locationId] : Object.keys(locationCalendar);
          for (const locId of locIds) {
            const locYearEntries = (locationCalendar[locId] || {})[String(y)] || [];
            const mapped = locYearEntries.map(h => ({
              ...h,
              id: String(h.id ?? ''),
              locationId: h.location_id || locId,
              source: 'location',
            }));
            locationHolidays.push(...mapped);
          }
        }
      } catch (_) { /* settings not available — return org holidays only */ }

      return ResponseHelper.success(res, [...orgHolidays, ...locationHolidays]);
    } catch (err) {
      console.error('[LeaveController.getCompanyCalendar]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  async createHoliday(req, res) {
    try {
      const { name, holiday_date, year, is_optional, location_id } = req.body;
      if (!name || !holiday_date) return ResponseHelper.validationError(res, 'name and holiday_date required');
      const y = String(year || holiday_date.slice(0, 4));

      if (location_id) {
        // Location-specific holiday — store in tenant settings.locationCalendar
        let tenantRow = null;
        let settings = {};
        try {
          const tenantRows = await this.db.query(
            `SELECT ROWID, settings FROM ${TABLES.TENANTS} WHERE ROWID = '${req.tenantId}' LIMIT 1`
          );
          if (tenantRows.length > 0) {
            tenantRow = tenantRows[0];
            settings = JSON.parse(tenantRow.settings || '{}');
          }
        } catch (_) { /* settings not yet available */ }

        if (!tenantRow) return ResponseHelper.notFound(res, 'Tenant not found');

        const locationCalendar = settings.locationCalendar || {};
        if (!locationCalendar[location_id]) locationCalendar[location_id] = {};
        if (!locationCalendar[location_id][y]) locationCalendar[location_id][y] = [];

        const newHoliday = {
          id: 'loc_' + Date.now(),
          name,
          holiday_date,
          year: y,
          is_optional: !!is_optional,
          location_id,
        };
        locationCalendar[location_id][y].push(newHoliday);
        settings.locationCalendar = locationCalendar;

        await this.adminDb.update(TABLES.TENANTS, {
          ROWID: String(tenantRow.ROWID),
          settings: JSON.stringify(settings),
        });

        await this.audit.log({ tenantId: req.tenantId, entityType: 'HOLIDAY', entityId: newHoliday.id, action: AUDIT_ACTION.CREATE, newValue: newHoliday, performedBy: req.currentUser.id });
        return ResponseHelper.created(res, newHoliday);
      }

      // Org-wide holiday — insert into leave_calendar table
      const row = await this.db.insert(TABLES.LEAVE_CALENDAR, {
        tenant_id: String(req.tenantId),
        name, holiday_date, year: y,
        is_optional: is_optional ? 'true' : 'false',
        created_by: String(req.currentUser.id),
      });
      await this.audit.log({ tenantId: req.tenantId, entityType: 'HOLIDAY', entityId: String(row.ROWID), action: AUDIT_ACTION.CREATE, newValue: { name, holiday_date, year: y, is_optional }, performedBy: req.currentUser.id });
      return ResponseHelper.created(res, row);
    } catch (err) {
      console.error('[LeaveController.createHoliday]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  async deleteHoliday(req, res) {
    try {
      const { locationId } = req.query;

      if (locationId) {
        // Remove from tenant settings.locationCalendar
        let tenantRow = null;
        let settings = {};
        try {
          const tenantRows = await this.db.query(
            `SELECT ROWID, settings FROM ${TABLES.TENANTS} WHERE ROWID = '${req.tenantId}' LIMIT 1`
          );
          if (tenantRows.length > 0) {
            tenantRow = tenantRows[0];
            settings = JSON.parse(tenantRow.settings || '{}');
          }
        } catch (_) { /* settings not available */ }

        if (!tenantRow) return ResponseHelper.notFound(res, 'Tenant not found');

        const holidayId = req.params.holidayId;
        const locationCalendar = settings.locationCalendar || {};
        const locEntry = locationCalendar[locationId] || {};
        for (const yr of Object.keys(locEntry)) {
          locEntry[yr] = (locEntry[yr] || []).filter(h => h.id !== holidayId);
        }
        settings.locationCalendar = locationCalendar;

        await this.adminDb.update(TABLES.TENANTS, {
          ROWID: String(tenantRow.ROWID),
          settings: JSON.stringify(settings),
        });

        await this.audit.log({ tenantId: req.tenantId, entityType: 'HOLIDAY', entityId: req.params.holidayId, action: AUDIT_ACTION.DELETE, oldValue: { location_id: locationId }, performedBy: req.currentUser.id });
        return ResponseHelper.success(res, { message: 'Holiday deleted' });
      }

      // Org-wide holiday — delete from leave_calendar table
      const holiday = await this.db.findById(TABLES.LEAVE_CALENDAR, req.params.holidayId, req.tenantId);
      if (!holiday) return ResponseHelper.notFound(res, 'Holiday not found');
      await this.db.delete(TABLES.LEAVE_CALENDAR, req.params.holidayId);
      await this.audit.log({ tenantId: req.tenantId, entityType: 'HOLIDAY', entityId: String(req.params.holidayId), action: AUDIT_ACTION.DELETE, oldValue: { name: holiday.name, holiday_date: holiday.holiday_date }, performedBy: req.currentUser.id });
      return ResponseHelper.success(res, { message: 'Holiday deleted' });
    } catch (err) {
      console.error('[LeaveController.deleteHoliday]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  async updateHoliday(req, res) {
    try {
      const { holidayId } = req.params;
      const { locationId } = req.query;
      const { name, holiday_date, is_optional } = req.body;
      if (!name || !holiday_date) return ResponseHelper.validationError(res, 'name and holiday_date required');

      if (locationId) {
        // Location-specific — update in tenant settings JSON
        const tenantRows = await this.db.query(
          `SELECT ROWID, settings FROM ${TABLES.TENANTS} WHERE ROWID = '${req.tenantId}' LIMIT 1`
        );
        if (!tenantRows.length) return ResponseHelper.notFound(res, 'Tenant not found');
        const tenantRow = tenantRows[0];
        let settings = {};
        try { settings = JSON.parse(tenantRow.settings || '{}'); } catch (_) {}

        const locationCalendar = settings.locationCalendar || {};
        const locEntry = locationCalendar[locationId] || {};
        let found = false;
        for (const yr of Object.keys(locEntry)) {
          locEntry[yr] = (locEntry[yr] || []).map(h => {
            if (h.id === holidayId) {
              found = true;
              return { ...h, name, holiday_date, year: holiday_date.slice(0, 4), is_optional: !!is_optional };
            }
            return h;
          });
        }
        if (!found) return ResponseHelper.notFound(res, 'Holiday not found');
        settings.locationCalendar = locationCalendar;
        await this.adminDb.update(TABLES.TENANTS, { ROWID: String(tenantRow.ROWID), settings: JSON.stringify(settings) });
        await this.audit.log({ tenantId: req.tenantId, entityType: 'HOLIDAY', entityId: holidayId, action: AUDIT_ACTION.UPDATE, newValue: { name, holiday_date, is_optional: !!is_optional, location_id: locationId }, performedBy: req.currentUser.id });
        return ResponseHelper.success(res, { id: holidayId, name, holiday_date, is_optional: !!is_optional });
      }

      // Org-wide holiday — update in leave_calendar table
      const holiday = await this.db.findById(TABLES.LEAVE_CALENDAR, holidayId, req.tenantId);
      if (!holiday) return ResponseHelper.notFound(res, 'Holiday not found');
      await this.db.update(TABLES.LEAVE_CALENDAR, {
        ROWID: holidayId,
        name,
        holiday_date,
        year: holiday_date.slice(0, 4),
        is_optional: is_optional ? 'true' : 'false',
      });
      await this.audit.log({ tenantId: req.tenantId, entityType: 'HOLIDAY', entityId: String(holidayId), action: AUDIT_ACTION.UPDATE, oldValue: { name: holiday.name, holiday_date: holiday.holiday_date }, newValue: { name, holiday_date, is_optional: !!is_optional }, performedBy: req.currentUser.id });
      return ResponseHelper.success(res, { id: holidayId, name, holiday_date, is_optional: !!is_optional });
    } catch (err) {
      console.error('[LeaveController.updateHoliday]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  async getCalendarConfig(req, res) {
    try {
      const tenantRows = await this.db.query(
        `SELECT settings FROM ${TABLES.TENANTS} WHERE ROWID = '${req.tenantId}' LIMIT 1`
      );
      let settings = {};
      if (tenantRows.length > 0) {
        try { settings = JSON.parse(tenantRows[0].settings || '{}'); } catch (_) { /* malformed JSON */ }
      }
      const locations = settings.officeLocations || [];
      const weekendPolicy = settings.weekendPolicy || { default: 'all_off', perLocation: {} };
      const locationCalendar = settings.locationCalendar || {};
      return ResponseHelper.success(res, { locations, weekendPolicy, locationCalendar });
    } catch (err) {
      console.error('[LeaveController.getCalendarConfig]', err.message);
      return ResponseHelper.success(res, {
        locations: [],
        weekendPolicy: { default: 'all_off', perLocation: {} },
        locationCalendar: {},
      });
    }
  }

  async saveCalendarConfig(req, res) {
    try {
      const { locations, weekendPolicy, locationCalendar } = req.body;

      let tenantRow = null;
      let settings = {};
      try {
        const tenantRows = await this.db.query(
          `SELECT ROWID, settings FROM ${TABLES.TENANTS} WHERE ROWID = '${req.tenantId}' LIMIT 1`
        );
        if (tenantRows.length > 0) {
          tenantRow = tenantRows[0];
          settings = JSON.parse(tenantRow.settings || '{}');
        }
      } catch (_) { /* settings not yet available */ }

      if (!tenantRow) return ResponseHelper.notFound(res, 'Tenant not found');

      // Merge — only update provided fields
      const updatedSettings = { ...settings };
      if (locations !== undefined) updatedSettings.officeLocations = locations;
      if (weekendPolicy !== undefined) updatedSettings.weekendPolicy = weekendPolicy;
      if (locationCalendar !== undefined) updatedSettings.locationCalendar = locationCalendar;

      await this.adminDb.update(TABLES.TENANTS, {
        ROWID: String(tenantRow.ROWID),
        settings: JSON.stringify(updatedSettings),
      });

      await this.audit.log({ tenantId: req.tenantId, entityType: 'CALENDAR_CONFIG', entityId: String(req.tenantId), action: AUDIT_ACTION.UPDATE, newValue: { locations: locations !== undefined, weekendPolicy: weekendPolicy !== undefined, locationCalendar: locationCalendar !== undefined }, performedBy: req.currentUser.id });
      return ResponseHelper.success(res, {
        locations: updatedSettings.officeLocations || [],
        weekendPolicy: updatedSettings.weekendPolicy || { default: 'all_off', perLocation: {} },
        locationCalendar: updatedSettings.locationCalendar || {},
      });
    } catch (err) {
      console.error('[LeaveController.saveCalendarConfig]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── Leave Accrual Policy ──────────────────────────────────────────────────────
  async getLeavePolicy(req, res) {
    try {
      const tenantRows = await this.db.query(
        `SELECT settings FROM ${TABLES.TENANTS} WHERE ROWID = '${req.tenantId}' LIMIT 1`
      );
      let settings = {};
      if (tenantRows.length > 0) {
        try { settings = JSON.parse(tenantRows[0].settings || '{}'); } catch (_) {}
      }
      return ResponseHelper.success(res, settings.leavePolicy || {
        accrualEnabled: false,
        probationMonths: 3,
        leaveTypes: {},
      });
    } catch (err) {
      console.error('[LeaveController.getLeavePolicy]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  async saveLeavePolicy(req, res) {
    try {
      const { accrualEnabled, probationMonths, leaveTypes } = req.body;

      let tenantRow = null;
      let settings = {};
      try {
        const tenantRows = await this.db.query(
          `SELECT ROWID, settings FROM ${TABLES.TENANTS} WHERE ROWID = '${req.tenantId}' LIMIT 1`
        );
        if (tenantRows.length > 0) {
          tenantRow = tenantRows[0];
          settings = JSON.parse(tenantRow.settings || '{}');
        }
      } catch (_) {}

      if (!tenantRow) return ResponseHelper.notFound(res, 'Tenant not found');

      // effectiveFrom anchors accrual reconciliation (CronController.monthlyAccrual):
      // back-fill never reaches before the month accrual was first enabled.
      // Stamped once (project timezone) and preserved across policy edits.
      const prevPolicy = settings.leavePolicy || {};
      let effectiveFrom = prevPolicy.effectiveFrom;
      if (accrualEnabled && !effectiveFrom) {
        effectiveFrom = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit',
        }).format(new Date());
      }

      settings.leavePolicy = {
        accrualEnabled: !!accrualEnabled,
        probationMonths: Number(probationMonths ?? 3),
        leaveTypes: leaveTypes || {},
        ...(effectiveFrom ? { effectiveFrom } : {}),
      };

      await this.adminDb.update(TABLES.TENANTS, {
        ROWID: String(tenantRow.ROWID),
        settings: JSON.stringify(settings),
      });

      await this.audit.log({
        tenantId: req.tenantId,
        entityType: 'LEAVE_POLICY',
        entityId: String(req.tenantId),
        action: AUDIT_ACTION.UPDATE,
        newValue: settings.leavePolicy,
        performedBy: req.currentUser.id,
      });

      return ResponseHelper.success(res, settings.leavePolicy);
    } catch (err) {
      console.error('[LeaveController.saveLeavePolicy]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  async setBalance(req, res) {
    try {
      const {
        user_id,
        leave_type_id,
        allocated_days,
        year,
        carry_forward_days
      } = req.body;

      // Validation
      if (!user_id || !leave_type_id || allocated_days === undefined) {
        return ResponseHelper.validationError(
          res,
          'user_id, leave_type_id, and allocated_days are required'
        );
      }

      // Validate leave_type_id (must be numeric)
      const ltId = String(leave_type_id).trim();
      if (!/^\d+$/.test(ltId)) {
        return ResponseHelper.validationError(
          res,
          `Invalid leave_type_id: ${ltId}`
        );
      }

      const y = year || new Date().getFullYear();

      // Convert values properly (keep as strings to avoid BigInt precision loss)
      const userIdNum = String(user_id);
      const leaveTypeIdNum = String(ltId);

      const allocNum = parseFloat(allocated_days);
      const cfNum = parseFloat(carry_forward_days || 0);

      if (isNaN(allocNum) || isNaN(cfNum)) {
        return ResponseHelper.validationError(
          res,
          'allocated_days and carry_forward_days must be valid numbers'
        );
      }

      // Check existing record
      const existing = await this.db.findWhere(
        TABLES.LEAVE_BALANCES,
        req.tenantId,
        `user_id = '${userIdNum}' AND leave_type_id = '${leaveTypeIdNum}' AND year = '${String(y)}'`,
        { limit: 1 }
      );

      if (existing.length > 0) {
        // UPDATE — recalculate remaining so used/pending in-flight are preserved
        const existingUsed    = parseFloat(existing[0].used_days    || 0);
        const existingPending = parseFloat(existing[0].pending_days || 0);
        const newRemaining    = Math.max(0, allocNum - existingUsed - existingPending);
        await this.db.update(TABLES.LEAVE_BALANCES, {
          ROWID: String(existing[0].ROWID),
          total_allocated: allocNum,
          opening_balance: cfNum,
          remaining_days: newRemaining,
        });

        return ResponseHelper.success(res, {
          message: 'Leave balance updated successfully'
        });
      } else {
        // INSERT — FK columns (user_id, leave_type_id) must be String per Catalyst FK rules
        await this.db.insert(TABLES.LEAVE_BALANCES, {
          tenant_id: String(req.tenantId),
          user_id: String(user_id),
          leave_type_id: String(ltId),
          year: String(y),
          total_allocated: allocNum,
          opening_balance: cfNum,
          remaining_days: allocNum,
          used_days: 0,
          pending_days: 0,
        });

        return ResponseHelper.success(res, {
          message: 'Leave balance created successfully'
        });
      }
    } catch (err) {
      console.error('[LeaveController.setBalance]', err);

      return ResponseHelper.serverError(
        res,
        err.message || 'Failed to set leave balance'
      );
    }
  }

  async deleteBalance(req, res) {
    try {
      const { balanceId } = req.params;
      if (!balanceId || !/^\d+$/.test(balanceId)) {
        return ResponseHelper.validationError(res, 'Invalid balance ID');
      }

      const existing = await this.db.findWhere(
        TABLES.LEAVE_BALANCES,
        req.tenantId,
        `ROWID = ${balanceId}`,
        { limit: 1 }
      );
      if (existing.length === 0) {
        return ResponseHelper.notFound(res, 'Leave balance record not found');
      }

      await this.db.delete(TABLES.LEAVE_BALANCES, balanceId);
      console.log('[deleteBalance] deleted balance ROWID:', balanceId);

      return ResponseHelper.success(res, { message: 'Leave balance deleted successfully' });
    } catch (err) {
      console.error('[LeaveController.deleteBalance]', err);
      return ResponseHelper.serverError(res, err.message || 'Failed to delete leave balance');
    }
  }

  async getAllBalances(req, res) {
    try {
      const { year } = req.query;
      const y = year || new Date().getFullYear();
      const tenantId = req.tenantId;

      // ── Paginated fetch helper ─────────────────────────────────────────────
      const fetchAll = async (table, where = '') => {
        const results = [];
        const pageSize = 200;
        let offset = 0;

        while (true) {
          const sql =
            `SELECT * FROM ${table} ` +
            `WHERE tenant_id = '${tenantId}'` +
            (where ? ` AND ${where}` : '') +
            ` ORDER BY CREATEDTIME DESC` +
            ` LIMIT ${pageSize} OFFSET ${offset}`;

          console.log(`[fetchAll] ${sql}`);
          const rows = await this.db.query(sql);
          results.push(...rows);
          if (rows.length < pageSize) break;
          offset += pageSize;
        }

        return results;
      };

      // ── Fetch all data with pagination ─────────────────────────────────────
      const [balances, users, types] = await Promise.all([
        fetchAll(TABLES.LEAVE_BALANCES, `year = '${y}'`),
        fetchAll(TABLES.USERS, ''),   // no status filter — fetch all tenant users
        fetchAll(TABLES.LEAVE_TYPES, ''),
      ]);

      // ── Build lookup maps ──────────────────────────────────────────────────
      const userMap = {};
      users.forEach((u) => { userMap[String(u.ROWID)] = u; });

      const typeMap = {};
      types.forEach((t) => { typeMap[String(t.ROWID)] = t; });

      // ── Enrich and return ──────────────────────────────────────────────────
      const enriched = balances.map((b) => ({
        id: String(b.ROWID),
        userId: String(b.user_id),
        userName: userMap[String(b.user_id)]?.name ?? '',
        userAvatarUrl: userMap[String(b.user_id)]?.avatar_url ?? null,
        leaveTypeId: String(b.leave_type_id),
        leaveTypeName: typeMap[String(b.leave_type_id)]?.name ?? '',
        // Support both column name conventions
        allocated: parseFloat(b.allocated_days ?? b.total_allocated ?? 0),
        used: parseFloat(b.used_days ?? 0),
        pending: parseFloat(b.pending_days ?? 0),
        remaining: parseFloat(b.remaining_days ?? 0),
      }));

      return ResponseHelper.success(res, enriched);
    } catch (err) {
      console.error('[LeaveController.getAllBalances]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
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

module.exports = LeaveController;
