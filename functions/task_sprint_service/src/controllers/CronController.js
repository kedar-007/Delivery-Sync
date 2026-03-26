'use strict';

const DataStoreService    = require('../services/DataStoreService');
const NotificationService = require('../services/NotificationService');
const ResponseHelper      = require('../utils/ResponseHelper');
const { TABLES, NOTIFICATION_TYPE } = require('../utils/Constants');

class CronController {
  // POST /api/ts/cron/sprint-check  — called by Catalyst Cron daily at 8 AM
  static async sprintCheck(req, res) {
    const isCron = req.headers['x-zoho-catalyst-is-cron'] === 'true';
    const isInternal = req.headers['x-delivery-sync-internal'] === process.env.INTERNAL_SECRET;
    if (!isCron && !isInternal) return ResponseHelper.forbidden(res, 'Cron only');

    if (!req.catalystApp) return ResponseHelper.serverError(res, 'catalystApp not initialized');
    const db    = new DataStoreService(req.catalystApp);
    const notif = new NotificationService(req.catalystApp, db);

    const twoDaysLater = new Date();
    twoDaysLater.setDate(twoDaysLater.getDate() + 2);
    const cutoff = twoDaysLater.toISOString().split('T')[0];
    const today  = DataStoreService.today();

    // Sprints ending within 2 days
    const soonSprints = await db.query(
      `SELECT s.ROWID, s.tenant_id, s.name, s.end_date, s.project_id FROM ${TABLES.SPRINTS} s WHERE s.status = 'ACTIVE' AND s.end_date <= '${cutoff}' AND s.end_date >= '${today}' LIMIT 100`
    );

    let notified = 0;
    for (const sprint of soonSprints) {
      // Get project lead
      const members = await db.findWhere(TABLES.SPRINT_MEMBERS, sprint.tenant_id, `sprint_id = '${sprint.ROWID}'`, { limit: 50 });
      for (const m of members) {
        await notif.sendInApp({
          tenantId: sprint.tenant_id, userId: m.user_id,
          title: 'Sprint Ending Soon',
          message: `Sprint "${sprint.name}" ends on ${sprint.end_date}. Wrap up your tasks!`,
          type: NOTIFICATION_TYPE.SPRINT_ENDING_SOON, entityType: 'SPRINT', entityId: sprint.ROWID,
        });
        notified++;
      }
    }

    // Overdue tasks — notify assignees
    const overdueTasks = await db.query(
      `SELECT ROWID, tenant_id, title, assignee_id, due_date FROM ${TABLES.TASKS} WHERE due_date < '${today}' AND status != 'DONE' AND status != 'CANCELLED' AND assignee_id != '' LIMIT 200`
    );
    for (const task of overdueTasks) {
      await notif.sendInApp({
        tenantId: task.tenant_id, userId: task.assignee_id,
        title: 'Task Overdue',
        message: `Task "${task.title}" was due on ${task.due_date}`,
        type: NOTIFICATION_TYPE.TASK_OVERDUE, entityType: 'TASK', entityId: task.ROWID,
      });
      notified++;
    }

    return ResponseHelper.success(res, { processed: { soon_sprints: soonSprints.length, overdue_tasks: overdueTasks.length, notifications_sent: notified } });
  }
}

module.exports = CronController;
