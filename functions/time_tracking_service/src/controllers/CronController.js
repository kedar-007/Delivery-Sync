'use strict';

const DataStoreService    = require('../services/DataStoreService');
const NotificationService = require('../services/NotificationService');
const ResponseHelper      = require('../utils/ResponseHelper');
const { TABLES, NOTIFICATION_TYPE } = require('../utils/Constants');

class CronController {
  // POST /api/time/cron/approval-reminder
  static async approvalReminder(req, res) {
    const isCron = req.headers['x-zoho-catalyst-is-cron'] === 'true';
    const isInternal = req.headers['x-delivery-sync-internal'] === process.env.INTERNAL_SECRET;
    if (!isCron && !isInternal) return ResponseHelper.forbidden(res, 'Cron only');
    if (!req.catalystApp) return ResponseHelper.serverError(res, 'catalystApp not initialized');

    const db    = new DataStoreService(req.catalystApp);
    const notif = new NotificationService(req.catalystApp, db);

    const cutoff = DataStoreService.daysAgo(2);
    const pending = await db.query(
      `SELECT ROWID, tenant_id, assigned_to, requested_by, time_entry_id FROM ${TABLES.TIME_APPROVAL_REQUESTS} WHERE status = 'PENDING' AND CREATEDTIME < '${cutoff}' LIMIT 200`
    );

    let sent = 0;
    for (const a of pending) {
      const rmRows = await db.query(`SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = '${a.assigned_to}' LIMIT 1`);
      const requesterRows = await db.query(`SELECT name FROM ${TABLES.USERS} WHERE ROWID = '${a.requested_by}' LIMIT 1`);
      if (rmRows[0]) {
        await notif.send({ toEmail: rmRows[0].email, subject: '[Delivery Sync] Time approval reminder', htmlBody: `<p>Hi ${rmRows[0].name}, ${requesterRows[0]?.name || 'a team member'} has a time entry pending your approval for over 2 days.</p>` });
        await notif.sendInApp({ tenantId: a.tenant_id, userId: a.assigned_to, title: 'Time Approval Reminder', message: `${requesterRows[0]?.name || 'A team member'} is waiting for time entry approval`, type: NOTIFICATION_TYPE.TIME_APPROVAL_REMINDER, entityType: 'TIME_APPROVAL', entityId: a.ROWID });
        sent++;
      }
    }

    return ResponseHelper.success(res, { reminders_sent: sent });
  }
}

module.exports = CronController;
