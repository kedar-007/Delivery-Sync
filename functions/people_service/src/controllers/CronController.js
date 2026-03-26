'use strict';

const DataStoreService    = require('../services/DataStoreService');
const NotificationService = require('../services/NotificationService');
const ResponseHelper      = require('../utils/ResponseHelper');
const { TABLES, NOTIFICATION_TYPE } = require('../utils/Constants');

class CronController {
  // POST /api/people/cron/attendance-anomaly  — 9:30 AM daily
  static async attendanceAnomaly(req, res) {
    const isCron = req.headers['x-zoho-catalyst-is-cron'] === 'true';
    const isInternal = req.headers['x-delivery-sync-internal'] === process.env.INTERNAL_SECRET;
    if (!isCron && !isInternal) return ResponseHelper.forbidden(res, 'Cron only');
    if (!req.catalystApp) return ResponseHelper.serverError(res, 'catalystApp not initialized');

    const db    = new DataStoreService(req.catalystApp);
    const notif = new NotificationService(req.catalystApp, db);
    const today = DataStoreService.today();

    // Get all active users
    const users = await db.query(`SELECT ROWID, tenant_id, name, email FROM ${TABLES.USERS} WHERE status = 'ACTIVE' LIMIT 1000`);

    let flagged = 0;
    for (const user of users) {
      const record = await db.findWhere(TABLES.ATTENDANCE_RECORDS, user.tenant_id,
        `user_id = '${user.ROWID}' AND attendance_date = '${today}'`, { limit: 1 });

      // Flag if no check-in by 9:30 AM and no leave today
      if (record.length === 0 || record[0].status === 'ABSENT') {
        const onLeave = await db.findWhere(TABLES.LEAVE_REQUESTS, user.tenant_id,
          `user_id = '${user.ROWID}' AND status = 'APPROVED' AND start_date <= '${today}' AND end_date >= '${today}'`, { limit: 1 });
        if (onLeave.length === 0) {
          // Create ABSENT record
          if (record.length === 0) {
            await db.insert(TABLES.ATTENDANCE_RECORDS, {
              tenant_id:           String(user.tenant_id),
              user_id:             String(user.ROWID),
              attendance_date:     today,
              work_hours:          0,
              status:              'ABSENT',
              is_wfh:              'false',
              wfh_reason:          '',
              check_in_ip:         '',
              is_location_verified:'false',
              override_reason:     '',
            });
          }
          await notif.sendInApp({ tenantId: user.tenant_id, userId: String(user.ROWID), title: 'Attendance Alert', message: 'You have not checked in today', type: NOTIFICATION_TYPE.ATTENDANCE_ANOMALY, entityType: 'ATTENDANCE', entityId: 0 });
          flagged++;
        }
      }
    }

    return ResponseHelper.success(res, { anomalies_flagged: flagged, date: today });
  }

  // POST /api/people/cron/leave-approval-reminder — 9 AM daily
  static async leaveApprovalReminder(req, res) {
    const isCron = req.headers['x-zoho-catalyst-is-cron'] === 'true';
    const isInternal = req.headers['x-delivery-sync-internal'] === process.env.INTERNAL_SECRET;
    if (!isCron && !isInternal) return ResponseHelper.forbidden(res, 'Cron only');
    if (!req.catalystApp) return ResponseHelper.serverError(res, 'catalystApp not initialized');

    const db    = new DataStoreService(req.catalystApp);
    const notif = new NotificationService(req.catalystApp, db);
    const cutoff = DataStoreService.daysAgo(1);

    const pending = await db.query(`SELECT lr.ROWID, lr.tenant_id, lr.user_id, lr.start_date, lr.end_date FROM ${TABLES.LEAVE_REQUESTS} lr WHERE lr.status = 'PENDING' AND lr.CREATEDTIME < '${cutoff}' LIMIT 200`);

    let sent = 0;
    for (const req_ of pending) {
      const profile = await db.findWhere(TABLES.USER_PROFILES, req_.tenant_id, `user_id = '${req_.user_id}'`, { limit: 1 });
      const rmId = profile[0]?.reporting_manager_id;
      if (rmId) {
        const requesterRows = await db.query(`SELECT name FROM ${TABLES.USERS} WHERE ROWID = '${req_.user_id}' LIMIT 1`);
        await notif.sendInApp({ tenantId: req_.tenant_id, userId: rmId, title: 'Leave Approval Reminder', message: `${requesterRows[0]?.name || 'A team member'} is waiting for leave approval`, type: NOTIFICATION_TYPE.LEAVE_APPROVAL_REMINDER, entityType: 'LEAVE', entityId: req_.ROWID });
        sent++;
      }
    }

    return ResponseHelper.success(res, { reminders_sent: sent });
  }
}

module.exports = CronController;
