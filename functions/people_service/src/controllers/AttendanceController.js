'use strict';

const DataStoreService = require('../services/DataStoreService');
const AuditService = require('../services/AuditService');
const NotificationService = require('../services/NotificationService');
const ResponseHelper = require('../utils/ResponseHelper');
const { TABLES, ATTENDANCE_STATUS, AUDIT_ACTION } = require('../utils/Constants');

class AttendanceController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
    this.notif = new NotificationService(catalystApp, this.db);
  }

  // POST /api/people/attendance/check-in
  async checkIn(req, res) {
    const tenantId = req.tenantId;
    const today = DataStoreService.today();

    // Fetch the actual user ROWID from DB to ensure we have the correct FK value
    const users = await this.db.findWhere(TABLES.USERS, tenantId,
      `email = '${req.currentUser.email}'`, { limit: 1 });
    if (!users || users.length === 0)
      return ResponseHelper.notFound(res, 'User not found');

    const userRowId = users[0].ROWID;

    // Check for duplicate
    const existing = await this.db.findWhere(TABLES.ATTENDANCE_RECORDS, tenantId,
      `user_id = '${userRowId}' AND attendance_date = '${today}'`, { limit: 1 });

    if (existing.length > 0 && existing[0].check_in_time)
      return ResponseHelper.conflict(res, 'Already checked in today');

    // Format datetime as 'YYYY-MM-DD HH:MM:SS' for Catalyst DateTime column
    const now = new Date();
    const formattedNow = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0') + ' ' +
      String(now.getHours()).padStart(2, '0') + ':' +
      String(now.getMinutes()).padStart(2, '0') + ':' +
      String(now.getSeconds()).padStart(2, '0');

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
    const today = DataStoreService.today();

    // Fetch actual DB ROWID same as checkIn does
    const users = await this.db.findWhere(TABLES.USERS, tenantId,
      `email = '${req.currentUser.email}'`, { limit: 1 });
    if (!users || users.length === 0)
      return ResponseHelper.notFound(res, 'User not found');
    const userRowId = users[0].ROWID;

    const existing = await this.db.findWhere(TABLES.ATTENDANCE_RECORDS, tenantId,
      `user_id = '${userRowId}' AND attendance_date = '${today}'`, { limit: 1 });
    if (existing.length === 0 || !existing[0].check_in_time)
      return ResponseHelper.validationError(res, 'No check-in found for today');
    if (existing[0].check_out_time)
      return ResponseHelper.conflict(res, 'Already checked out today');

    const now = new Date();
    const checkIn = new Date(existing[0].check_in_time.replace(' ', 'T'));
    const workHours = Math.round(((now - checkIn) / 3600000) * 100) / 100;
    const formattedNow = DataStoreService.fmtDT(now);

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
      const today = DataStoreService.today();
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

  // GET /api/people/attendance/records?user_id=&date_from=&date_to=
  async records(req, res) {
    const { user_id, date_from, date_to } = req.query;
    let where = '';
    let uid = user_id || null;
    if (req.currentUser.role === 'TEAM_MEMBER') {
      // Must use DB ROWID — same pattern as checkIn/checkOut
      const users = await this.db.findWhere(TABLES.USERS, req.tenantId,
        `email = '${req.currentUser.email}'`, { limit: 1 });
      uid = users && users.length > 0 ? String(users[0].ROWID) : req.currentUser.id;
    }
    if (uid) where += `user_id = '${DataStoreService.escape(uid)}' AND `;
    if (date_from) where += `attendance_date >= '${DataStoreService.escape(date_from)}' AND `;
    if (date_to) where += `attendance_date <= '${DataStoreService.escape(date_to)}' AND `;
    where = where.replace(/ AND $/, '');
    const recs = await this.db.findWhere(TABLES.ATTENDANCE_RECORDS, req.tenantId, where, { orderBy: 'attendance_date DESC', limit: 200 });
    // Enrich with user info
    const users = await this.db.findAll(TABLES.USERS, { tenant_id: req.tenantId }, { limit: 200 });
    const userMap = {};
    users.forEach(u => { userMap[String(u.ROWID)] = u; });
    const enriched = recs.map(r => {
      const u = userMap[String(r.user_id)] || {};
      return { ...r, name: u.name || 'Unknown', email: u.email || '', avatar_url: u.avatar_url || '' };
    });
    return ResponseHelper.success(res, enriched);
  }

  // POST /api/people/attendance/wfh
  async markWfh(req, res) {
    const { wfh_reason } = req.body;
    const today = DataStoreService.today();

    const users = await this.db.findWhere(TABLES.USERS, req.tenantId,
      `email = '${req.currentUser.email}'`, { limit: 1 });
    if (!users || users.length === 0)
      return ResponseHelper.notFound(res, 'User not found');
    const userRowId = users[0].ROWID;

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
      const today = DataStoreService.today();
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
    const y = year || new Date().getFullYear();
    const m = String(month || new Date().getMonth() + 1).padStart(2, '0');
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
}

module.exports = AttendanceController;
