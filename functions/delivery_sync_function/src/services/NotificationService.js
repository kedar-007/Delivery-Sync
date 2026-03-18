'use strict';

const DataStoreService = require('./DataStoreService');
const { TABLES, NOTIFICATION_TYPE } = require('../utils/Constants');

/**
 * NotificationService – sends emails via Catalyst Mail and logs all
 * notification events in the notification_events table.
 *
 * Architecture decision: Every sent notification is persisted so that
 * dashboards can show "last reminded", cron jobs can avoid spamming, and
 * analytics can report notification rates.
 */
class NotificationService {
  /**
   * @param {object} catalystApp   Initialised Catalyst SDK instance
   * @param {DataStoreService} db
   */
  constructor(catalystApp, db) {
    this.catalystApp = catalystApp;
    this.db = db;
  }

  // ─── Core Send ───────────────────────────────────────────────────────────────

  /**
   * Send an email via Catalyst Mail and log the event.
   * @param {object} params
   * @param {string}   params.tenantId
   * @param {string}   params.userId       Recipient user ROWID
   * @param {string}   params.toEmail      Recipient email address
   * @param {string}   params.toName       Recipient display name
   * @param {string}   params.subject
   * @param {string}   params.htmlBody
   * @param {string}   params.notificationType  NOTIFICATION_TYPE constant
   * @param {object}   [params.metadata]   Extra metadata to persist
   */
  async send({ tenantId, userId, toEmail, toName, subject, htmlBody, notificationType, metadata = {} }) {
    let status = 'SENT';
    let errorMsg = null;

    try {
      const mail = this.catalystApp.mail();
      await mail.sendMail({
        to_address: [{ user_name: toName, email_id: toEmail }],
        subject,
        content: htmlBody,
        is_html: true,
      });
    } catch (err) {
      console.error('[NotificationService] Mail send failed:', err.message);
      status = 'FAILED';
      errorMsg = err.message;
    }

    // Always log regardless of send success/failure
    await this._logEvent({
      tenantId,
      userId,
      notificationType,
      subject,
      message: htmlBody,
      status,
      metadata: { ...metadata, error: errorMsg },
    });

    return status === 'SENT';
  }

  // ─── Templated Notifications ─────────────────────────────────────────────────

  async sendStandupReminder({ tenantId, userId, toEmail, toName, projectName, date }) {
    const subject = `[Delivery Sync] Standup reminder – ${projectName}`;
    const htmlBody = this._standupReminderTemplate(toName, projectName, date);
    return this.send({
      tenantId, userId, toEmail, toName, subject, htmlBody,
      notificationType: NOTIFICATION_TYPE.STANDUP_REMINDER,
      metadata: { projectName, date },
    });
  }

  async sendEodReminder({ tenantId, userId, toEmail, toName, projectName, date }) {
    const subject = `[Delivery Sync] EOD update reminder – ${projectName}`;
    const htmlBody = this._eodReminderTemplate(toName, projectName, date);
    return this.send({
      tenantId, userId, toEmail, toName, subject, htmlBody,
      notificationType: NOTIFICATION_TYPE.EOD_REMINDER,
      metadata: { projectName, date },
    });
  }

  async sendActionOverdue({ tenantId, userId, toEmail, toName, actionTitle, dueDate, projectName }) {
    const subject = `[Delivery Sync] Overdue action – ${actionTitle}`;
    const htmlBody = this._actionOverdueTemplate(toName, actionTitle, dueDate, projectName);
    return this.send({
      tenantId, userId, toEmail, toName, subject, htmlBody,
      notificationType: NOTIFICATION_TYPE.ACTION_OVERDUE,
      metadata: { actionTitle, dueDate, projectName },
    });
  }

  async sendBlockerEscalation({ tenantId, userId, toEmail, toName, blockerTitle, severity, projectName, ageDays }) {
    const subject = `[Delivery Sync] CRITICAL blocker escalation – ${projectName}`;
    const htmlBody = this._blockerEscalationTemplate(toName, blockerTitle, severity, projectName, ageDays);
    return this.send({
      tenantId, userId, toEmail, toName, subject, htmlBody,
      notificationType: NOTIFICATION_TYPE.BLOCKER_ESCALATION,
      metadata: { blockerTitle, severity, projectName, ageDays },
    });
  }

  // ─── Log ─────────────────────────────────────────────────────────────────────

  async _logEvent({ tenantId, userId, notificationType, subject, message, status, metadata }) {
    try {
      await this.db.insert(TABLES.NOTIFICATION_EVENTS, {
        tenant_id: tenantId,
        user_id: String(userId),
        notification_type: notificationType,
        subject,
        message: message.substring(0, 1000), // trim for storage
        status,
        sent_at: new Date().toISOString(),
        metadata: JSON.stringify(metadata),
      });
    } catch (err) {
      console.error('[NotificationService] Log failed:', err.message);
    }
  }

  /**
   * Check if a notification of a given type was already sent to a user today.
   * Used by cron jobs to prevent duplicate sends.
   */
  async wasNotifiedToday(tenantId, userId, notificationType) {
    const today = DataStoreService.today();
    const rows = await this.db.findWhere(
      TABLES.NOTIFICATION_EVENTS,
      tenantId,
      `user_id = '${userId}' AND notification_type = '${notificationType}' AND sent_at LIKE '${today}%' AND status = 'SENT'`,
      { limit: 1 }
    );
    return rows.length > 0;
  }

  // ─── Email Templates ──────────────────────────────────────────────────────────

  _standupReminderTemplate(name, projectName, date) {
    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#1d4ed8;padding:20px;color:#fff">
          <h2 style="margin:0">Delivery Sync</h2>
        </div>
        <div style="padding:24px;background:#f9fafb">
          <p>Hi <strong>${name}</strong>,</p>
          <p>This is a reminder to submit your <strong>standup update</strong> for
             <strong>${projectName}</strong> for <strong>${date}</strong>.</p>
          <p>Keeping your standup up to date ensures the team stays aligned and
             blockers are surfaced early.</p>
          <a href="/projects" style="display:inline-block;margin-top:16px;padding:12px 24px;
             background:#1d4ed8;color:#fff;text-decoration:none;border-radius:6px">
            Submit Standup
          </a>
        </div>
        <div style="padding:16px;font-size:12px;color:#9ca3af;text-align:center">
          Delivery Sync – Automated Reminder
        </div>
      </div>`;
  }

  _eodReminderTemplate(name, projectName, date) {
    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#059669;padding:20px;color:#fff">
          <h2 style="margin:0">Delivery Sync</h2>
        </div>
        <div style="padding:24px;background:#f9fafb">
          <p>Hi <strong>${name}</strong>,</p>
          <p>Don't forget to submit your <strong>end-of-day update</strong> for
             <strong>${projectName}</strong> for <strong>${date}</strong>.</p>
          <p>Your EOD helps leadership stay informed and generates weekly reports automatically.</p>
          <a href="/projects" style="display:inline-block;margin-top:16px;padding:12px 24px;
             background:#059669;color:#fff;text-decoration:none;border-radius:6px">
            Submit EOD
          </a>
        </div>
        <div style="padding:16px;font-size:12px;color:#9ca3af;text-align:center">
          Delivery Sync – Automated Reminder
        </div>
      </div>`;
  }

  _actionOverdueTemplate(name, actionTitle, dueDate, projectName) {
    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#dc2626;padding:20px;color:#fff">
          <h2 style="margin:0">Delivery Sync – Action Overdue</h2>
        </div>
        <div style="padding:24px;background:#f9fafb">
          <p>Hi <strong>${name}</strong>,</p>
          <p>The following action assigned to you is <strong>overdue</strong>:</p>
          <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0">
            <p style="margin:0 0 8px"><strong>Action:</strong> ${actionTitle}</p>
            <p style="margin:0 0 8px"><strong>Project:</strong> ${projectName}</p>
            <p style="margin:0"><strong>Due Date:</strong> ${dueDate}</p>
          </div>
          <p>Please update the action status or reach out if you need help.</p>
          <a href="/actions" style="display:inline-block;margin-top:16px;padding:12px 24px;
             background:#dc2626;color:#fff;text-decoration:none;border-radius:6px">
            View Actions
          </a>
        </div>
        <div style="padding:16px;font-size:12px;color:#9ca3af;text-align:center">
          Delivery Sync – Automated Alert
        </div>
      </div>`;
  }

  _blockerEscalationTemplate(name, blockerTitle, severity, projectName, ageDays) {
    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#7c3aed;padding:20px;color:#fff">
          <h2 style="margin:0">Delivery Sync – Blocker Escalation</h2>
        </div>
        <div style="padding:24px;background:#f9fafb">
          <p>Hi <strong>${name}</strong>,</p>
          <p>A <strong>${severity}</strong> blocker has been unresolved for
             <strong>${ageDays} days</strong> and requires your attention:</p>
          <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0">
            <p style="margin:0 0 8px"><strong>Blocker:</strong> ${blockerTitle}</p>
            <p style="margin:0 0 8px"><strong>Project:</strong> ${projectName}</p>
            <p style="margin:0"><strong>Severity:</strong>
              <span style="color:#dc2626">${severity}</span></p>
          </div>
          <a href="/blockers" style="display:inline-block;margin-top:16px;padding:12px 24px;
             background:#7c3aed;color:#fff;text-decoration:none;border-radius:6px">
            View Blockers
          </a>
        </div>
        <div style="padding:16px;font-size:12px;color:#9ca3af;text-align:center">
          Delivery Sync – Automated Escalation
        </div>
      </div>`;
  }
}

module.exports = NotificationService;
