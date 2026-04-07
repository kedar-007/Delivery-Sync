'use strict';

const DataStoreService = require('../services/DataStoreService');
const AuditService = require('../services/AuditService');
const NotificationService = require('../services/NotificationService');
const ResponseHelper = require('../utils/ResponseHelper');
const { TABLES, LEAVE_STATUS, AUDIT_ACTION, NOTIFICATION_TYPE } = require('../utils/Constants');

const fmtDT = (d) => DataStoreService.fmtDT(d);

class LeaveController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
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
    return ResponseHelper.created(res, row);
  }

  async updateType(req, res) {
    const type = await this.db.findById(TABLES.LEAVE_TYPES, req.params.typeId, req.tenantId);
    if (!type) return ResponseHelper.notFound(res, 'Leave type not found');
    const allowed = ['name', 'days_per_year', 'carry_forward_days', 'requires_approval', 'min_days', 'max_days', 'notice_days', 'is_paid', 'is_active'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const updated = await this.db.update(TABLES.LEAVE_TYPES, { ROWID: req.params.typeId, ...updates });
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
      // Resolve userId — it must be a numeric ROWID for BigInt FK queries
      let userIdNum = Number(userId);
      if (isNaN(userIdNum) || !userId) {
        const uRows = await this.db.findWhere(TABLES.USERS, req.tenantId,
          `email = '${req.currentUser.email}'`, { limit: 1 });
        if (!uRows.length) return ResponseHelper.notFound(res, 'User not found');
        userId = String(uRows[0].ROWID);
        userIdNum = Number(userId);
      }

      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;

      console.log('[getBalance] userId:', userIdNum, 'year:', year);

      // 1. Fetch balances
      const balances = await this.db.findWhere(
        TABLES.LEAVE_BALANCES,
        req.tenantId,
        `user_id = ${userIdNum} AND year = '${year}'`,
        { limit: 50 }
      );

      // 2. Fetch leave types
      const types = await this.db.findWhere(
        TABLES.LEAVE_TYPES,
        req.tenantId,
        `is_active = true`,
        { limit: 50 }
      );

      const typeMap = {};
      types.forEach(t => {
        typeMap[String(t.ROWID)] = t;
      });

      // 3. Fetch APPROVED leaves (FIXED COLUMN NAMES)
      const approvedLeaves = await this.db.findWhere(
        TABLES.LEAVE_REQUESTS,
        req.tenantId,
        `user_id = ${userIdNum} AND status = 'APPROVED' AND start_date >= '${startDate}' AND start_date <= '${endDate}'`,
        { limit: 200 }
      );

      console.log('[getBalance] approvedLeaves:', JSON.stringify(approvedLeaves, null, 2));

      // 4. Fetch PENDING leaves (optional but recommended)
      const pendingLeaves = await this.db.findWhere(
        TABLES.LEAVE_REQUESTS,
        req.tenantId,
        `user_id = ${userIdNum} AND status = 'PENDING' AND start_date >= '${startDate}' AND start_date <= '${endDate}'`,
        { limit: 200 }
      );

      console.log('[getBalance] pendingLeaves:', JSON.stringify(pendingLeaves, null, 2));

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
      const result = balances.map(b => {
        const ltId = String(b.leave_type_id);

        // Support both column name conventions
        const opening = Number(b.carry_forward_days ?? b.opening_balance ?? 0);
        const allocated = Number(b.allocated_days ?? b.total_allocated ?? 0);

        const used = usedMap[ltId] || 0;
        const pending = pendingMap[ltId] || 0;

        const totalAvailable = Math.max(0, allocated - used);
        const remaining = Math.max(0, totalAvailable - pending);

        console.log('[getBalance] computed:', {
          ltId,
          opening,
          allocated,
          used,
          pending,
          remaining
        });

        return {
          leave_type_id: ltId,
          leave_type: typeMap[ltId] || null,
          opening_balance: opening,
          total_allocated: allocated,
          total_available: totalAvailable,
          used_days: used,
          pending_days: pending,
          remaining_days: remaining
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
    const { status, mine } = req.query;
    const me = req.currentUser;
    let where = '';
    // Filter to own leaves when: ?mine=true is set, OR role is TEAM_MEMBER
    if (mine === 'true' || me.role === 'TEAM_MEMBER') {
      where = `user_id = '${me.id}'`;
    }
    if (status) where += (where ? ' AND ' : '') + `status = '${DataStoreService.escape(status)}'`;
    const requests = await this.db.findWhere(TABLES.LEAVE_REQUESTS, req.tenantId, where, { orderBy: 'CREATEDTIME DESC', limit: 100 });

    // Enrich with user and leave type info
    const users = await this.db.findAll(TABLES.USERS, { tenant_id: req.tenantId }, { limit: 200 });
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

      try {
        // Validate it's a valid integer string — throws if name like "Sick Leave"
        if (!/^\d+$/.test(rawId)) throw new Error('not a numeric id');
        leaveTypeId = rawId; // keep as string 

        const typeRows = await this.db.findWhere(TABLES.LEAVE_TYPES, tenantId,
          `ROWID = ${leaveTypeId} AND is_active = true`, { limit: 1 });
        if (typeRows.length === 0)
          return ResponseHelper.validationError(res, `Leave type not found or inactive`);
        leaveTypeName = typeRows[0].name;
      } catch {
        // rawId is a name string — look up by name
        const typeRows = await this.db.findWhere(TABLES.LEAVE_TYPES, tenantId,
          `name = '${DataStoreService.escape(rawId)}' AND is_active = true`, { limit: 1 });
        if (typeRows.length === 0)
          return ResponseHelper.validationError(res, `Leave type '${rawId}' not found`);
        leaveTypeId = String(typeRows[0].ROWID); // keep as string ✅
        leaveTypeName = typeRows[0].name;
      }

      console.log('Resolved leaveTypeId:', leaveTypeId, 'leaveTypeName:', leaveTypeName);

      // ── Overlap check ──────────────────────────────────────────────────────
      const overlap = await this.db.findWhere(TABLES.LEAVE_REQUESTS, tenantId,
        `user_id = '${userId}' AND status != 'REJECTED' AND status != 'CANCELLED' ` +
        `AND start_date <= '${DataStoreService.escape(end_date)}' ` +
        `AND end_date >= '${DataStoreService.escape(start_date)}'`, { limit: 1 });

      if (overlap.length > 0)
        return ResponseHelper.conflict(res, 'Leave dates overlap with an existing request');

      // ── Days calculation ───────────────────────────────────────────────────
      const ms = new Date(end_date) - new Date(start_date);
      let days_count = Math.round(ms / 86400000) + 1;
      if (is_half_day) days_count = 0.5;

      // ── Balance check ──────────────────────────────────────────────────────
      const balance = await this.db.findWhere(TABLES.LEAVE_BALANCES, tenantId,
        `user_id = '${userId}' AND leave_type_id = ${leaveTypeId} AND year = '${year}'`, { limit: 1 });

      console.log("Leave Balances--",balance);

      if (balance.length > 0 && parseFloat(balance[0].remaining_days) < days_count)
        return ResponseHelper.validationError(res,
          `Insufficient leave balance. Available: ${balance[0].remaining_days} days`);

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

      // ── Deduct from balance ────────────────────────────────────────────────
      if (balance.length > 0) {
        await this.db.update(TABLES.LEAVE_BALANCES, {
          ROWID: balance[0].ROWID,
          pending_days: parseFloat(balance[0].pending_days ?? 0) + days_count,
          remaining_days: parseFloat(balance[0].remaining_days ?? 0) - days_count,
        });
      }

      // ── Notify RM ──────────────────────────────────────────────────────────
      const profileRows = await this.db.findWhere(TABLES.USER_PROFILES, tenantId,
        `user_id = '${userId}'`, { limit: 1 });
      const rmId = profileRows[0]?.reporting_manager_id;

      if (rmId) {
        const rmRows = await this.db.query(
          `SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = '${rmId}' LIMIT 1`);
        if (rmRows[0]) {
          await this.notif.send({
            toEmail: rmRows[0].email,
            subject: `[Delivery Sync] Leave request from ${req.currentUser.name}`,
            htmlBody: `<p>Hi ${rmRows[0].name}, ${req.currentUser.name} has applied for ` +
              `${days_count} day(s) leave from ${start_date} to ${end_date}. ` +
              `Reason: ${reason}</p>`,
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
    const leave = await this.db.findById(TABLES.LEAVE_REQUESTS, req.params.requestId, req.tenantId);
    if (!leave) return ResponseHelper.notFound(res, 'Leave request not found');
    if (leave.status !== LEAVE_STATUS.PENDING) return ResponseHelper.validationError(res, 'Only PENDING requests can be approved');

    await this.db.update(TABLES.LEAVE_REQUESTS, {
      ROWID: req.params.requestId, status: LEAVE_STATUS.APPROVED,
      reviewed_by: req.currentUser.id, reviewer_notes: req.body.notes || '', reviewed_at: fmtDT(new Date()),
    });

    // Move from pending to used in balance
    const year = new Date(leave.start_date).getFullYear();
    const balance = await this.db.findWhere(TABLES.LEAVE_BALANCES, req.tenantId,
      `user_id = '${leave.user_id}' AND leave_type_id = '${leave.leave_type_id}' AND year = '${year}'`, { limit: 1 });
    if (balance.length > 0) {
      await this.db.update(TABLES.LEAVE_BALANCES, {
        ROWID: balance[0].ROWID,
        used_days: parseFloat(balance[0].used_days || 0) + parseFloat(leave.days_count),
        pending_days: Math.max(0, parseFloat(balance[0].pending_days || 0) - parseFloat(leave.days_count)),
      });
    }

    // Notify applicant
    const userRows = await this.db.query(`SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = '${leave.user_id}' LIMIT 1`);
    if (userRows[0]) {
      await this.notif.send({ toEmail: userRows[0].email, subject: '[Delivery Sync] Leave request approved', htmlBody: `<p>Hi ${userRows[0].name}, your leave from ${leave.start_date} to ${leave.end_date} has been approved.</p>` });
      await this.notif.sendInApp({ tenantId: req.tenantId, userId: leave.user_id, title: 'Leave Approved', message: `Your leave from ${leave.start_date} to ${leave.end_date} was approved`, type: NOTIFICATION_TYPE.LEAVE_APPROVED, entityType: 'LEAVE', entityId: req.params.requestId });
    }

    await this.audit.log({ tenantId: req.tenantId, entityType: 'LEAVE', entityId: req.params.requestId, action: AUDIT_ACTION.APPROVE, newValue: { status: LEAVE_STATUS.APPROVED }, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, { message: 'Leave approved' });
  }

  async rejectRequest(req, res) {
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
      await this.notif.send({ toEmail: userRows[0].email, subject: '[Delivery Sync] Leave request rejected', htmlBody: `<p>Hi ${userRows[0].name}, your leave request was rejected. Reason: ${notes}</p>` });
      await this.notif.sendInApp({ tenantId: req.tenantId, userId: leave.user_id, title: 'Leave Rejected', message: `Your leave was rejected: ${notes}`, type: NOTIFICATION_TYPE.LEAVE_REJECTED, entityType: 'LEAVE', entityId: req.params.requestId });
    }

    await this.audit.log({ tenantId: req.tenantId, entityType: 'LEAVE', entityId: req.params.requestId, action: AUDIT_ACTION.REJECT, newValue: { status: LEAVE_STATUS.REJECTED, notes }, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, { message: 'Leave rejected' });
  }

  // GET /api/people/leave/calendar
  async calendar(req, res) {
    const { date_from, date_to } = req.query;
    const from = date_from || DataStoreService.today();
    const to = date_to || DataStoreService.daysAgo(-30);
    const approved = await this.db.findWhere(TABLES.LEAVE_REQUESTS, req.tenantId,
      `status = 'APPROVED' AND start_date <= '${DataStoreService.escape(to)}' AND end_date >= '${DataStoreService.escape(from)}'`,
      { limit: 200 });

    // Enrich with user and leave type info
    const users = await this.db.findAll(TABLES.USERS, { tenant_id: req.tenantId }, { limit: 200 });
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
      const { year } = req.query;
      const y = year || new Date().getFullYear();
      const holidays = await this.db.findWhere(TABLES.LEAVE_CALENDAR, req.tenantId,
        `year = '${y}'`, { orderBy: 'holiday_date ASC', limit: 200 });
      return ResponseHelper.success(res, holidays);
    } catch (err) {
      console.error('[LeaveController.getCompanyCalendar]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  async createHoliday(req, res) {
    try {
      const { name, holiday_date, year, is_optional } = req.body;
      if (!name || !holiday_date) return ResponseHelper.validationError(res, 'name and holiday_date required');
      const y = year || holiday_date.slice(0, 4);
      const row = await this.db.insert(TABLES.LEAVE_CALENDAR, {
        tenant_id: String(req.tenantId),
        name, holiday_date, year: String(y),
        is_optional: is_optional ? 'true' : 'false',
        created_by: String(req.currentUser.id),
      });
      return ResponseHelper.created(res, row);
    } catch (err) {
      console.error('[LeaveController.createHoliday]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  async deleteHoliday(req, res) {
    try {
      const holiday = await this.db.findById(TABLES.LEAVE_CALENDAR, req.params.holidayId, req.tenantId);
      if (!holiday) return ResponseHelper.notFound(res, 'Holiday not found');
      await this.db.delete(TABLES.LEAVE_CALENDAR, req.params.holidayId);
      return ResponseHelper.success(res, { message: 'Holiday deleted' });
    } catch (err) {
      console.error('[LeaveController.deleteHoliday]', err.message);
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
        // UPDATE — use actual schema column names
        await this.db.update(TABLES.LEAVE_BALANCES, {
          ROWID: String(existing[0].ROWID),
          total_allocated: allocNum,
          opening_balance: cfNum,
          remaining_days: allocNum,
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

module.exports = LeaveController;
