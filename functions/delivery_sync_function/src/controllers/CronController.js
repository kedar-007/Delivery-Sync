'use strict';

const DataStoreService = require('../services/DataStoreService');
const NotificationService = require('../services/NotificationService');
const AuditService = require('../services/AuditService');
const ResponseHelper = require('../utils/ResponseHelper');
const {
  TABLES, ACTION_STATUS, BLOCKER_STATUS, BLOCKER_ESCALATION_THRESHOLD_DAYS, AUDIT_ACTION, NOTIFICATION_TYPE,
} = require('../utils/Constants');

/**
 * CronController – scheduled job handlers invoked by Catalyst Cron.
 *
 * Architecture decision:
 *  - Cron functions are exposed as HTTP endpoints under /api/cron/*
 *  - They are protected by AuthMiddleware.authenticateCron (checks Catalyst cron header)
 *  - They iterate ALL active tenants so one cron config serves the whole multi-tenant fleet
 *  - Each job is idempotent: re-running it won't double-send notifications (checked via
 *    NotificationService.wasNotifiedToday)
 */
class CronController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
    this.notifier = new NotificationService(catalystApp, this.db);
    this.audit = new AuditService(this.db);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  async _getActiveTenants() {
    return this.db.query(
      `SELECT ROWID, name FROM ${TABLES.TENANTS} WHERE status = 'ACTIVE' LIMIT 100`
    );
  }

  async _getProjectsForTenant(tenantId) {
    return this.db.findAll(TABLES.PROJECTS,
      { tenant_id: tenantId, status: 'ACTIVE' }, { limit: 100 });
  }

  async _getUserById(tenantId, userId) {
    const rows = await this.db.query(
      `SELECT ROWID, name, email FROM ${TABLES.USERS} ` +
      `WHERE tenant_id = '${tenantId}' AND ROWID = '${userId}' AND status = 'ACTIVE' LIMIT 1`
    );
    return rows[0] || null;
  }

  // ─── Standup Reminder ────────────────────────────────────────────────────────

  /**
   * POST /api/cron/standup-reminder
   * Called at 09:00 every weekday via Catalyst Cron.
   */
  async standupReminderJob(req, res) {
    try {
      const today = DataStoreService.today();
      const tenants = await this._getActiveTenants();
      let totalSent = 0;

      for (const tenant of tenants) {
        const tenantId = String(tenant.ROWID);
        const projects = await this._getProjectsForTenant(tenantId);

        for (const project of projects) {
          const projectId = String(project.ROWID);

          // Get all active members of this project
          const members = await this.db.findAll(TABLES.PROJECT_MEMBERS,
            { tenant_id: tenantId, project_id: projectId }, { limit: 100 });

          // Get who already submitted today
          const submitted = await this.db.findAll(TABLES.STANDUP_ENTRIES,
            { tenant_id: tenantId, project_id: projectId, entry_date: today }, { limit: 200 });
          const submittedUserIds = new Set(submitted.map((s) => String(s.user_id)));

          for (const member of members) {
            const userId = String(member.user_id);
            if (submittedUserIds.has(userId)) continue;

            // Check if already notified today
            const alreadyNotified = await this.notifier.wasNotifiedToday(
              tenantId, userId, 'STANDUP_REMINDER'
            );
            if (alreadyNotified) continue;

            const user = await this._getUserById(tenantId, userId);
            if (!user || !user.email) continue;

            await this.notifier.sendStandupReminder({
              tenantId, userId, toEmail: user.email, toName: user.name,
              projectName: project.name, date: today,
            });
            await this.notifier.sendInApp({
              tenantId, userId,
              title: `Standup reminder – ${project.name}`,
              message: `You haven't submitted your standup for "${project.name}" today (${today}).`,
              type: NOTIFICATION_TYPE.STANDUP_REMINDER,
              entityType: 'project', entityId: String(project.ROWID),
              metadata: { projectName: project.name, date: today },
            });
            totalSent++;
          }
        }
      }

      console.log(`[CronJob:StandupReminder] Sent ${totalSent} reminders for ${today}`);
      return ResponseHelper.success(res, { totalSent, date: today }, 'Standup reminder job complete');
    } catch (err) {
      console.error('[CronJob:StandupReminder] Error:', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ─── EOD Reminder ────────────────────────────────────────────────────────────

  /**
   * POST /api/cron/eod-reminder
   * Called at 16:30 every weekday via Catalyst Cron.
   */
  async eodReminderJob(req, res) {
    try {
      const today = DataStoreService.today();
      const tenants = await this._getActiveTenants();
      let totalSent = 0;

      for (const tenant of tenants) {
        const tenantId = String(tenant.ROWID);
        const projects = await this._getProjectsForTenant(tenantId);

        for (const project of projects) {
          const projectId = String(project.ROWID);
          const members = await this.db.findAll(TABLES.PROJECT_MEMBERS,
            { tenant_id: tenantId, project_id: projectId }, { limit: 100 });

          const submitted = await this.db.findAll(TABLES.EOD_ENTRIES,
            { tenant_id: tenantId, project_id: projectId, entry_date: today }, { limit: 200 });
          const submittedUserIds = new Set(submitted.map((e) => String(e.user_id)));

          for (const member of members) {
            const userId = String(member.user_id);
            if (submittedUserIds.has(userId)) continue;

            const alreadyNotified = await this.notifier.wasNotifiedToday(tenantId, userId, 'EOD_REMINDER');
            if (alreadyNotified) continue;

            const user = await this._getUserById(tenantId, userId);
            if (!user || !user.email) continue;

            await this.notifier.sendEodReminder({
              tenantId, userId, toEmail: user.email, toName: user.name,
              projectName: project.name, date: today,
            });
            await this.notifier.sendInApp({
              tenantId, userId,
              title: `EOD reminder – ${project.name}`,
              message: `Don't forget your end-of-day update for "${project.name}" today (${today}).`,
              type: NOTIFICATION_TYPE.EOD_REMINDER,
              entityType: 'project', entityId: String(project.ROWID),
              metadata: { projectName: project.name, date: today },
            });
            totalSent++;
          }
        }
      }

      console.log(`[CronJob:EodReminder] Sent ${totalSent} reminders for ${today}`);
      return ResponseHelper.success(res, { totalSent, date: today }, 'EOD reminder job complete');
    } catch (err) {
      console.error('[CronJob:EodReminder] Error:', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ─── Overdue Action Escalation ───────────────────────────────────────────────

  /**
   * POST /api/cron/overdue-actions
   * Called daily at 08:00 via Catalyst Cron.
   */
  async overdueActionEscalationJob(req, res) {
    try {
      const today = DataStoreService.today();
      const tenants = await this._getActiveTenants();
      let totalEscalated = 0;

      for (const tenant of tenants) {
        const tenantId = String(tenant.ROWID);

        const overdueActions = await this.db.findWhere(
          TABLES.ACTIONS, tenantId,
          `due_date < '${today}' AND status != '${ACTION_STATUS.DONE}' AND status != '${ACTION_STATUS.CANCELLED}'`,
          { limit: 200 }
        );

        for (const action of overdueActions) {
          const userId = String(action.assigned_to);
          const alreadyNotified = await this.notifier.wasNotifiedToday(tenantId, userId, 'ACTION_OVERDUE');
          if (alreadyNotified) continue;

          const user = await this._getUserById(tenantId, userId);
          if (!user || !user.email) continue;

          // Get project name
          const projects = await this.db.query(
            `SELECT name FROM ${TABLES.PROJECTS} WHERE ROWID = '${action.project_id}' LIMIT 1`
          );
          const projectName = projects[0]?.name || 'Unknown Project';

          await this.notifier.sendActionOverdue({
            tenantId, userId, toEmail: user.email, toName: user.name,
            actionTitle: action.title, dueDate: action.due_date, projectName,
          });
          await this.notifier.sendInApp({
            tenantId, userId,
            title: `Overdue action: ${action.title}`,
            message: `Your action "${action.title}" on "${projectName}" was due ${action.due_date}.`,
            type: NOTIFICATION_TYPE.ACTION_OVERDUE,
            entityType: 'action', entityId: String(action.ROWID),
            metadata: { projectName, dueDate: action.due_date },
          });

          await this.audit.log({
            tenantId, entityType: 'action', entityId: String(action.ROWID),
            action: AUDIT_ACTION.ESCALATE,
            newValue: { reason: 'Overdue action escalation notification sent', dueDate: action.due_date },
            performedBy: 'SYSTEM',
          });

          totalEscalated++;
        }
      }

      console.log(`[CronJob:OverdueActions] Escalated ${totalEscalated} actions`);
      return ResponseHelper.success(res, { totalEscalated }, 'Overdue action escalation complete');
    } catch (err) {
      console.error('[CronJob:OverdueActions] Error:', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ─── Blocker Escalation ───────────────────────────────────────────────────────

  /**
   * POST /api/cron/blocker-escalation
   * Called daily at 08:30 via Catalyst Cron.
   * Escalates CRITICAL/HIGH blockers older than BLOCKER_ESCALATION_THRESHOLD_DAYS.
   */
  async blockerEscalationJob(req, res) {
    try {
      const today = DataStoreService.today();
      const thresholdDate = DataStoreService.daysAgo(BLOCKER_ESCALATION_THRESHOLD_DAYS);
      const tenants = await this._getActiveTenants();
      let totalEscalated = 0;

      for (const tenant of tenants) {
        const tenantId = String(tenant.ROWID);

        const criticalBlockers = await this.db.findWhere(
          TABLES.BLOCKERS, tenantId,
          `status != '${BLOCKER_STATUS.RESOLVED}' AND ` +
          `(severity = 'CRITICAL' OR severity = 'HIGH') AND ` +
          `raised_date <= '${thresholdDate}'`,
          { limit: 100 }
        );

        for (const blocker of criticalBlockers) {
          const userId = String(blocker.owner_user_id);
          const alreadyNotified = await this.notifier.wasNotifiedToday(tenantId, userId, 'BLOCKER_ESCALATION');
          if (alreadyNotified) continue;

          const user = await this._getUserById(tenantId, userId);
          if (!user || !user.email) continue;

          const projects = await this.db.query(
            `SELECT name FROM ${TABLES.PROJECTS} WHERE ROWID = '${blocker.project_id}' LIMIT 1`
          );
          const projectName = projects[0]?.name || 'Unknown Project';

          const createdDate = blocker.raised_date || thresholdDate;
          const ageDays = Math.floor(
            (new Date(today) - new Date(createdDate)) / 86400000
          );

          await this.notifier.sendBlockerEscalation({
            tenantId, userId, toEmail: user.email, toName: user.name,
            blockerTitle: blocker.title, severity: blocker.severity, projectName, ageDays,
          });

          // Mark as ESCALATED if still OPEN
          if (blocker.status === BLOCKER_STATUS.OPEN) {
            await this.db.update(TABLES.BLOCKERS, {
              ROWID: String(blocker.ROWID),
              status: BLOCKER_STATUS.ESCALATED,
            });
            await this.audit.log({
              tenantId, entityType: 'blocker', entityId: String(blocker.ROWID),
              action: AUDIT_ACTION.ESCALATE,
              oldValue: { status: BLOCKER_STATUS.OPEN },
              newValue: { status: BLOCKER_STATUS.ESCALATED, ageDays },
              performedBy: 'SYSTEM',
            });
          }

          totalEscalated++;
        }
      }

      console.log(`[CronJob:BlockerEscalation] Escalated ${totalEscalated} blockers`);
      return ResponseHelper.success(res, { totalEscalated }, 'Blocker escalation job complete');
    } catch (err) {
      console.error('[CronJob:BlockerEscalation] Error:', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ─── Daily Summary ────────────────────────────────────────────────────────────

  /**
   * POST /api/cron/daily-summary
   * Called daily at 18:00 via Catalyst Cron.
   * Sends delivery leads a summary of who submitted standup/EOD today.
   */
  async dailySummaryJob(req, res) {
    try {
      const today = DataStoreService.today();
      const tenants = await this._getActiveTenants();
      let totalSent = 0;

      for (const tenant of tenants) {
        const tenantId = String(tenant.ROWID);
        const projects = await this._getProjectsForTenant(tenantId);

        for (const project of projects) {
          const projectId = String(project.ROWID);

          const members = await this.db.findAll(TABLES.PROJECT_MEMBERS,
            { tenant_id: tenantId, project_id: projectId }, { limit: 100 });
          if (members.length === 0) continue;

          // Who submitted standup today
          const standups = await this.db.findAll(TABLES.STANDUP_ENTRIES,
            { tenant_id: tenantId, project_id: projectId, entry_date: today }, { limit: 200 });
          const standupUserIds = new Set(standups.map((s) => String(s.user_id)));

          // Build submitted/missed lists
          const allMemberUsers = await Promise.all(
            members.map((m) => this._getUserById(tenantId, String(m.user_id)))
          );
          const submitted = allMemberUsers.filter((u) => u && standupUserIds.has(String(u.ROWID))).map((u) => u.name || u.email);
          const missed = allMemberUsers.filter((u) => u && !standupUserIds.has(String(u.ROWID))).map((u) => u.name || u.email);

          // Send summary only to LEAD members
          const leads = members.filter((m) => m.role === 'LEAD');
          for (const lead of leads) {
            const leadUser = await this._getUserById(tenantId, String(lead.user_id));
            if (!leadUser) continue;

            await this.notifier.sendInApp({
              tenantId, userId: String(lead.user_id),
              title: `Daily summary – ${project.name} (${today})`,
              message: `${submitted.length}/${members.length} members submitted standup. ${missed.length > 0 ? `Missed: ${missed.slice(0, 3).join(', ')}${missed.length > 3 ? ` +${missed.length - 3}` : ''}` : 'All submitted! 🎉'}`,
              type: NOTIFICATION_TYPE.DAILY_SUMMARY,
              entityType: 'project', entityId: projectId,
              metadata: { date: today, submitted, missed, projectName: project.name },
            });

            if (leadUser.email) {
              await this.notifier.sendDailySummary({
                tenantId, userId: String(lead.user_id),
                toEmail: leadUser.email, toName: leadUser.name,
                date: today, submitted, missed, projectName: project.name,
              });
            }
            totalSent++;
          }
        }
      }

      console.log(`[CronJob:DailySummary] Sent ${totalSent} summaries for ${today}`);
      return ResponseHelper.success(res, { totalSent, date: today }, 'Daily summary job complete');
    } catch (err) {
      console.error('[CronJob:DailySummary] Error:', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/cron/health
   * Simple health check for the cron endpoint.
   */
  async health(req, res) {
    return ResponseHelper.success(res, {
      status: 'ok', timestamp: new Date().toISOString(), service: 'DeliverySync Cron',
    });
  }
}

module.exports = CronController;
