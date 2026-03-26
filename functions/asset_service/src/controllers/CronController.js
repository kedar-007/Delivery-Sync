'use strict';
const DataStoreService    = require('../services/DataStoreService');
const NotificationService = require('../services/NotificationService');
const ResponseHelper      = require('../utils/ResponseHelper');
const { TABLES, NOTIFICATION_TYPE } = require('../utils/Constants');

class CronController {
  static async maintenanceCheck(req, res) {
    const isCron = req.headers['x-zoho-catalyst-is-cron'] === 'true';
    const isInternal = req.headers['x-delivery-sync-internal'] === process.env.INTERNAL_SECRET;
    if (!isCron && !isInternal) return ResponseHelper.forbidden(res, 'Cron only');
    if (!req.catalystApp) return ResponseHelper.serverError(res, 'catalystApp not initialized');
    const db    = new DataStoreService(req.catalystApp);
    const notif = new NotificationService(req.catalystApp, db);
    const sevenDaysLater = new Date(); sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
    const cutoff = sevenDaysLater.toISOString().split('T')[0];
    const today  = DataStoreService.today();
    const due = await db.query(`SELECT m.ROWID, m.tenant_id, m.asset_id, m.type, m.scheduled_date, a.name as asset_name FROM ${TABLES.ASSET_MAINTENANCE} m JOIN ${TABLES.ASSETS} a ON m.asset_id = a.ROWID WHERE m.status = 'SCHEDULED' AND m.scheduled_date <= '${cutoff}' AND m.scheduled_date >= '${today}' LIMIT 100`);
    let notified = 0;
    for (const d of due) {
      const admins = await db.query(`SELECT ROWID FROM ${TABLES.USERS} WHERE tenant_id = '${d.tenant_id}' AND (role = 'TENANT_ADMIN' OR role = 'PMO') LIMIT 5`);
      for (const admin of admins) {
        await notif.sendInApp({ tenantId: d.tenant_id, userId: String(admin.ROWID), title: 'Asset Maintenance Due', message: `Asset "${d.asset_name}" has ${d.type} maintenance due on ${d.scheduled_date}`, type: NOTIFICATION_TYPE.ASSET_MAINTENANCE_DUE, entityType: 'ASSET_MAINTENANCE', entityId: d.ROWID });
        notified++;
      }
    }
    return ResponseHelper.success(res, { maintenance_due: due.length, notifications_sent: notified });
  }
}

module.exports = CronController;
