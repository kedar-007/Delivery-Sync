'use strict';

const DataStoreService = require('./DataStoreService');
const { TABLES } = require('../utils/Constants');

class NotificationService {
  constructor(catalystApp, db) {
    this.catalystApp = catalystApp;
    this.db = db;
  }

  // ─── Core Send ───────────────────────────────────────────────────────────────

  async send({ toEmail, subject, htmlBody }) {
    const fromEmail = process.env.FROM_EMAIL || 'catalystadmin@dsv360.ai';

    try {
      const mail = this.catalystApp.email();
      // Catalyst docs: to_email is an array, html flag is html_mode (not is_html)
      const payload = {
        from_email: fromEmail,
        to_email: [toEmail],
        subject,
        content: htmlBody,
        html_mode: true,
      };
      await mail.sendMail(payload);
      return true;
    } catch (err) {
      console.error('[NotificationService] sendMail FAILED:', err.message);
      console.error('[NotificationService] sendMail error detail:', JSON.stringify({
        message: err.message,
        status: err.status,
        code: err.code,
        response: err.response?.data || err.response || null,
        cause: err.cause || null,
      }));
      return false;
    }
  }

  // ─── In-App ───────────────────────────────────────────────────────────────────

  async sendInApp({ tenantId, userId, title, message, type, entityType = '', entityId = '', metadata = {} }) {
    if (!userId || String(userId) === 'undefined' || String(userId) === '0') {
      console.warn('[NotificationService] sendInApp skipped: invalid userId:', userId, '| title:', title);
      return;
    }
    try {
      await this.db.insert(TABLES.NOTIFICATIONS, {
        tenant_id: tenantId,
        user_id: String(userId),
        title,
        message,
        type,
        is_read: 'false',
        entity_type: entityType,
        entity_id: entityId ? String(entityId) : '',
        metadata: JSON.stringify(metadata),
      });
    } catch (err) {
      console.error('[NotificationService] sendInApp failed:', err.message);
    }
  }

  // ─── Templated Email Senders ─────────────────────────────────────────────────

  async sendTaskAssignment({ toEmail, toName, actionTitle, dueDate, projectName, assignedBy }) {
    return this.send({
      toEmail,
      subject: `[Delivery Sync] New action assigned – ${actionTitle}`,
      htmlBody: this._taskAssignmentTemplate(toName, actionTitle, dueDate, projectName, assignedBy),
    });
  }

  async sendBlockerAdded({ toEmail, toName, blockerTitle, severity, projectName, raisedBy }) {
    return this.send({
      toEmail,
      subject: `[Delivery Sync] ${severity} blocker raised – ${projectName}`,
      htmlBody: this._blockerAddedTemplate(toName, blockerTitle, severity, projectName, raisedBy),
    });
  }

  async sendMemberAdded({ toEmail, toName, projectName, addedBy, projectRole }) {
    return this.send({
      toEmail,
      subject: `[Delivery Sync] You've been added to ${projectName}`,
      htmlBody: this._memberAddedTemplate(toName, projectName, addedBy, projectRole),
    });
  }

  async sendTeamMemberAdded({ toEmail, toName, teamName, projectName, addedBy, teamRole }) {
    return this.send({
      toEmail,
      subject: `[Delivery Sync] You've been added to team "${teamName}"`,
      htmlBody: this._teamMemberAddedTemplate(toName, teamName, projectName, addedBy, teamRole),
    });
  }

  async sendBlockerEscalation({ toEmail, toName, blockerTitle, severity, projectName, ageDays }) {
    return this.send({
      toEmail,
      subject: `[Delivery Sync] CRITICAL blocker escalation – ${projectName}`,
      htmlBody: this._blockerEscalationTemplate(toName, blockerTitle, severity, projectName, ageDays),
    });
  }

  async sendStandupReminder({ toEmail, toName, projectName, date }) {
    return this.send({
      toEmail,
      subject: `[Delivery Sync] Standup reminder – ${projectName}`,
      htmlBody: this._standupReminderTemplate(toName, projectName, date),
    });
  }

  async sendEodReminder({ toEmail, toName, projectName, date }) {
    return this.send({
      toEmail,
      subject: `[Delivery Sync] EOD update reminder – ${projectName}`,
      htmlBody: this._eodReminderTemplate(toName, projectName, date),
    });
  }

  async sendActionOverdue({ toEmail, toName, actionTitle, dueDate, projectName }) {
    return this.send({
      toEmail,
      subject: `[Delivery Sync] Overdue action – ${actionTitle}`,
      htmlBody: this._actionOverdueTemplate(toName, actionTitle, dueDate, projectName),
    });
  }

  async sendBlockerResolved({ toEmail, toName, blockerTitle, projectName, resolvedBy, resolution }) {
    return this.send({
      toEmail,
      subject: `[Delivery Sync] Blocker resolved – ${blockerTitle}`,
      htmlBody: this._blockerResolvedTemplate(toName, blockerTitle, projectName, resolvedBy, resolution),
    });
  }

  async sendActionStatusChanged({ toEmail, toName, actionTitle, projectName, newStatus, changedBy, dueDate }) {
    return this.send({
      toEmail,
      subject: `[Delivery Sync] Action status updated – ${actionTitle}`,
      htmlBody: this._actionStatusChangedTemplate(toName, actionTitle, projectName, newStatus, changedBy, dueDate),
    });
  }

  async sendDailySummary({ toEmail, toName, date, submitted, missed, projectName }) {
    return this.send({
      toEmail,
      subject: `[Delivery Sync] Daily Summary – ${projectName} – ${date}`,
      htmlBody: this._dailySummaryTemplate(toName, date, submitted, missed, projectName),
    });
  }

  async wasNotifiedToday(tenantId, userId, notificationType) {
    try {
      const today = DataStoreService.today();
      const rows = await this.db.findWhere(
        TABLES.NOTIFICATIONS, tenantId,
        `user_id = '${userId}' AND type = '${notificationType}' AND CREATEDTIME LIKE '${today}%'`,
        { limit: 1 }
      );
      return rows.length > 0;
    } catch {
      return false;
    }
  }

  // ─── Shared Template Base ─────────────────────────────────────────────────────

  _base({ accentColor, preheader, headerTitle, headerSubtitle, body, ctaUrl, ctaLabel, footerNote = '' }) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${headerTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;color:#f3f4f6;font-size:1px;">${preheader}</div>` : ''}
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:${accentColor};border-radius:12px 12px 0 0;padding:28px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:rgba(255,255,255,0.7);text-transform:uppercase;margin-bottom:6px;">Delivery Sync</div>
                  <div style="font-size:22px;font-weight:700;color:#ffffff;line-height:1.3;">${headerTitle}</div>
                  ${headerSubtitle ? `<div style="font-size:14px;color:rgba(255,255,255,0.85);margin-top:6px;">${headerSubtitle}</div>` : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:32px;">
            ${body}
            ${ctaUrl && ctaLabel ? `
            <div style="margin-top:28px;">
              <a href="${ctaUrl}" style="display:inline-block;background:${accentColor};color:#ffffff;font-size:14px;font-weight:600;padding:13px 28px;border-radius:8px;text-decoration:none;letter-spacing:0.3px;">${ctaLabel}</a>
            </div>` : ''}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
            <div style="font-size:12px;color:#9ca3af;line-height:1.6;">
              This is an automated notification from <strong style="color:#6b7280;">Delivery Sync</strong>.<br />
              ${footerNote || 'You received this because you are a member of this project.'}
            </div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  _infoCard(rows) {
    const rowsHtml = rows.map(([label, value, valueColor]) => `
      <tr>
        <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;">
          <span style="font-size:12px;color:#9ca3af;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;">${label}</span>
        </td>
        <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;text-align:right;">
          <span style="font-size:14px;color:${valueColor || '#111827'};font-weight:600;">${value || '—'}</span>
        </td>
      </tr>`).join('');
    return `
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin:20px 0;">
        ${rowsHtml}
      </table>`;
  }

  // ─── Email Templates ──────────────────────────────────────────────────────────

  _taskAssignmentTemplate(name, actionTitle, dueDate, projectName, assignedBy) {
    const body = `
      <p style="font-size:15px;color:#374151;margin:0 0 20px;">Hi <strong>${name}</strong>,</p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 8px;">
        <strong style="color:#374151;">${assignedBy || 'A team lead'}</strong> has assigned you a new action item that needs your attention.
      </p>
      ${this._infoCard([
        ['Action', actionTitle],
        ['Project', projectName],
        ['Due Date', dueDate || 'No due date set', dueDate ? '#dc2626' : '#9ca3af'],
        ['Assigned By', assignedBy || 'Team Lead'],
      ])}
      <p style="font-size:13px;color:#9ca3af;margin:16px 0 0;">
        Please review and update the action status as you make progress.
      </p>`;

    return this._base({
      accentColor: '#0891b2',
      preheader: `${assignedBy} assigned you: ${actionTitle}`,
      headerTitle: 'New Action Assigned',
      headerSubtitle: `On project: ${projectName}`,
      body,
      ctaUrl: '/actions',
      ctaLabel: 'View My Actions',
    });
  }

  _blockerAddedTemplate(name, blockerTitle, severity, projectName, raisedBy) {
    const severityColors = { CRITICAL: '#dc2626', HIGH: '#ea580c', MEDIUM: '#d97706', LOW: '#65a30d' };
    const color = severityColors[severity] || '#dc2626';
    const body = `
      <p style="font-size:15px;color:#374151;margin:0 0 20px;">Hi <strong>${name}</strong>,</p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 8px;">
        A new blocker has been raised on <strong style="color:#374151;">${projectName}</strong> by
        <strong style="color:#374151;">${raisedBy || 'a team member'}</strong> that requires your attention.
      </p>
      ${this._infoCard([
        ['Blocker', blockerTitle],
        ['Project', projectName],
        ['Severity', severity, color],
        ['Raised By', raisedBy || 'Team Member'],
      ])}
      <div style="background:#fef2f2;border-left:4px solid ${color};border-radius:0 6px 6px 0;padding:14px 16px;margin:16px 0;">
        <p style="margin:0;font-size:13px;color:#991b1b;font-weight:500;">
          &#9888;&nbsp; As a project lead, please review this blocker and take action to unblock the team.
        </p>
      </div>`;

    return this._base({
      accentColor: color,
      preheader: `${severity} blocker on ${projectName}: ${blockerTitle}`,
      headerTitle: `${severity} Blocker Raised`,
      headerSubtitle: `Project: ${projectName}`,
      body,
      ctaUrl: '/blockers',
      ctaLabel: 'View Blockers',
    });
  }

  _memberAddedTemplate(name, projectName, addedBy, projectRole) {
    const body = `
      <p style="font-size:15px;color:#374151;margin:0 0 20px;">Hi <strong>${name}</strong>,</p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 8px;">
        Welcome aboard! <strong style="color:#374151;">${addedBy || 'An admin'}</strong> has added you to a new project.
      </p>
      ${this._infoCard([
        ['Project', projectName],
        ['Your Role', (projectRole || 'MEMBER').replace(/_/g, ' ')],
        ['Added By', addedBy || 'Admin'],
      ])}
      <p style="font-size:13px;color:#6b7280;margin:16px 0 0;">
        You can now access the project dashboard, submit standups, log blockers, and track actions.
      </p>`;

    return this._base({
      accentColor: '#7c3aed',
      preheader: `You've been added to project ${projectName}`,
      headerTitle: 'Project Invitation',
      headerSubtitle: `You are now part of: ${projectName}`,
      body,
      ctaUrl: '/projects',
      ctaLabel: 'Go to Project',
    });
  }

  _teamMemberAddedTemplate(name, teamName, projectName, addedBy, teamRole) {
    const body = `
      <p style="font-size:15px;color:#374151;margin:0 0 20px;">Hi <strong>${name}</strong>,</p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 8px;">
        <strong style="color:#374151;">${addedBy || 'A lead'}</strong> has added you to a team within
        <strong style="color:#374151;">${projectName}</strong>.
      </p>
      ${this._infoCard([
        ['Team', teamName],
        ['Project', projectName],
        ['Your Role', (teamRole || 'MEMBER').replace(/_/g, ' ')],
        ['Added By', addedBy || 'Lead'],
      ])}
      <p style="font-size:13px;color:#6b7280;margin:16px 0 0;">
        You are now part of the <strong>${teamName}</strong> team. Collaborate with your teammates in the Teams section.
      </p>`;

    return this._base({
      accentColor: '#4f46e5',
      preheader: `You've been added to team "${teamName}" on ${projectName}`,
      headerTitle: 'Added to Team',
      headerSubtitle: `Team: ${teamName} · Project: ${projectName}`,
      body,
      ctaUrl: '/teams',
      ctaLabel: 'View Teams',
    });
  }

  _actionOverdueTemplate(name, actionTitle, dueDate, projectName) {
    const body = `
      <p style="font-size:15px;color:#374151;margin:0 0 20px;">Hi <strong>${name}</strong>,</p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 8px;">
        An action assigned to you is past its due date and still open. Please update its status or raise a blocker if you're stuck.
      </p>
      ${this._infoCard([
        ['Action', actionTitle],
        ['Project', projectName],
        ['Due Date', dueDate, '#dc2626'],
        ['Status', 'OVERDUE', '#dc2626'],
      ])}
      <div style="background:#fef2f2;border-left:4px solid #dc2626;border-radius:0 6px 6px 0;padding:14px 16px;margin:16px 0;">
        <p style="margin:0;font-size:13px;color:#991b1b;font-weight:500;">
          &#9888;&nbsp; Overdue actions impact project health scores. Please take action today.
        </p>
      </div>`;

    return this._base({
      accentColor: '#dc2626',
      preheader: `Overdue: ${actionTitle} – was due ${dueDate}`,
      headerTitle: 'Action Overdue',
      headerSubtitle: `Project: ${projectName}`,
      body,
      ctaUrl: '/actions',
      ctaLabel: 'View Actions',
    });
  }

  _standupReminderTemplate(name, projectName, date) {
    const body = `
      <p style="font-size:15px;color:#374151;margin:0 0 20px;">Hi <strong>${name}</strong>,</p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 20px;">
        This is your daily reminder to submit your <strong style="color:#374151;">standup update</strong> for today.
        Keeping the team aligned starts with a quick update from everyone.
      </p>
      ${this._infoCard([
        ['Project', projectName],
        ['Date', date],
        ['Type', 'Daily Standup'],
      ])}
      <p style="font-size:13px;color:#6b7280;margin:16px 0 0;">
        Just a few lines on what you did yesterday, what you're doing today, and any blockers. It takes less than 2 minutes!
      </p>`;

    return this._base({
      accentColor: '#1d4ed8',
      preheader: `Time to submit your standup for ${projectName}`,
      headerTitle: 'Standup Reminder',
      headerSubtitle: `${projectName} · ${date}`,
      body,
      ctaUrl: '/standup',
      ctaLabel: 'Submit Standup',
    });
  }

  _eodReminderTemplate(name, projectName, date) {
    const body = `
      <p style="font-size:15px;color:#374151;margin:0 0 20px;">Hi <strong>${name}</strong>,</p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 20px;">
        Don't forget to wrap up your day with an <strong style="color:#374151;">EOD update</strong>!
        It helps leadership stay informed and feeds into your weekly reports automatically.
      </p>
      ${this._infoCard([
        ['Project', projectName],
        ['Date', date],
        ['Type', 'End-of-Day Update'],
      ])}
      <p style="font-size:13px;color:#6b7280;margin:16px 0 0;">
        Share what you completed today, any pending items, and note any blockers before you sign off.
      </p>`;

    return this._base({
      accentColor: '#059669',
      preheader: `Submit your EOD update for ${projectName}`,
      headerTitle: 'EOD Update Reminder',
      headerSubtitle: `${projectName} · ${date}`,
      body,
      ctaUrl: '/eod',
      ctaLabel: 'Submit EOD Update',
    });
  }

  _blockerEscalationTemplate(name, blockerTitle, severity, projectName, ageDays) {
    const body = `
      <p style="font-size:15px;color:#374151;margin:0 0 20px;">Hi <strong>${name}</strong>,</p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 8px;">
        A <strong style="color:#dc2626;">${severity}</strong> blocker on your project has been unresolved for
        <strong style="color:#dc2626;">${ageDays} day${ageDays !== 1 ? 's' : ''}</strong> and has been automatically escalated.
      </p>
      ${this._infoCard([
        ['Blocker', blockerTitle],
        ['Project', projectName],
        ['Severity', severity, '#dc2626'],
        ['Age', `${ageDays} day${ageDays !== 1 ? 's' : ''} overdue`, '#dc2626'],
      ])}
      <div style="background:#fdf4ff;border-left:4px solid #7c3aed;border-radius:0 6px 6px 0;padding:14px 16px;margin:16px 0;">
        <p style="margin:0;font-size:13px;color:#6d28d9;font-weight:500;">
          &#128680;&nbsp; This blocker requires immediate intervention. Please escalate to stakeholders or assign an owner to resolve it.
        </p>
      </div>`;

    return this._base({
      accentColor: '#7c3aed',
      preheader: `ESCALATED: ${severity} blocker on ${projectName} – ${ageDays} days unresolved`,
      headerTitle: 'Blocker Escalation Alert',
      headerSubtitle: `${severity} · ${projectName} · ${ageDays} days unresolved`,
      body,
      ctaUrl: '/blockers',
      ctaLabel: 'View Blocker',
    });
  }

  _blockerResolvedTemplate(name, blockerTitle, projectName, resolvedBy, resolution) {
    const body = `
      <p style="font-size:15px;color:#374151;margin:0 0 20px;">Hi <strong>${name}</strong>,</p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 8px;">
        Great news! A blocker you raised on <strong style="color:#374151;">${projectName}</strong> has been resolved by
        <strong style="color:#374151;">${resolvedBy || 'a project lead'}</strong>.
      </p>
      ${this._infoCard([
        ['Blocker', blockerTitle],
        ['Project', projectName],
        ['Resolved By', resolvedBy || 'Project Lead'],
        ['Status', 'RESOLVED', '#16a34a'],
      ])}
      ${resolution ? `
      <div style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:0 6px 6px 0;padding:14px 16px;margin:16px 0;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#15803d;text-transform:uppercase;letter-spacing:0.5px;">Resolution Note</p>
        <p style="margin:0;font-size:14px;color:#166534;">${resolution}</p>
      </div>` : ''}
      <p style="font-size:13px;color:#6b7280;margin:16px 0 0;">
        The blocker has been closed. You can view the full details in the project dashboard.
      </p>`;

    return this._base({
      accentColor: '#16a34a',
      preheader: `Blocker resolved: ${blockerTitle} on ${projectName}`,
      headerTitle: 'Blocker Resolved',
      headerSubtitle: `Project: ${projectName}`,
      body,
      ctaUrl: '/blockers',
      ctaLabel: 'View Blockers',
    });
  }

  _actionStatusChangedTemplate(name, actionTitle, projectName, newStatus, changedBy, dueDate) {
    const statusColors = {
      DONE: '#16a34a', IN_PROGRESS: '#2563eb', OPEN: '#6b7280',
      ON_HOLD: '#d97706', CANCELLED: '#dc2626',
    };
    const statusLabels = {
      DONE: 'Completed', IN_PROGRESS: 'In Progress', OPEN: 'Open',
      ON_HOLD: 'On Hold', CANCELLED: 'Cancelled',
    };
    const color = statusColors[newStatus] || '#6b7280';
    const statusLabel = statusLabels[newStatus] || newStatus;

    const body = `
      <p style="font-size:15px;color:#374151;margin:0 0 20px;">Hi <strong>${name}</strong>,</p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 8px;">
        The status of an action assigned to you has been updated by
        <strong style="color:#374151;">${changedBy || 'a lead'}</strong>.
      </p>
      ${this._infoCard([
        ['Action', actionTitle],
        ['Project', projectName],
        ['New Status', statusLabel, color],
        ['Due Date', dueDate || 'No due date'],
        ['Updated By', changedBy || 'Lead'],
      ])}
      ${newStatus === 'DONE' ? `
      <div style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:0 6px 6px 0;padding:14px 16px;margin:16px 0;">
        <p style="margin:0;font-size:13px;color:#166534;font-weight:500;">
          &#10003;&nbsp; This action has been marked as complete. Great work!
        </p>
      </div>` : newStatus === 'ON_HOLD' ? `
      <div style="background:#fffbeb;border-left:4px solid #d97706;border-radius:0 6px 6px 0;padding:14px 16px;margin:16px 0;">
        <p style="margin:0;font-size:13px;color:#92400e;font-weight:500;">
          &#9432;&nbsp; This action is on hold. Check with your lead for further instructions.
        </p>
      </div>` : ''}`;

    return this._base({
      accentColor: color,
      preheader: `Action "${actionTitle}" is now ${statusLabel}`,
      headerTitle: `Action ${statusLabel}`,
      headerSubtitle: `Project: ${projectName}`,
      body,
      ctaUrl: '/actions',
      ctaLabel: 'View My Actions',
    });
  }

  _assetApprovedTemplate(name, approverName, categoryName, message) {
    const body = `
      <p style="font-size:15px;color:#374151;margin:0 0 20px;">Hi <strong>${name}</strong>,</p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 8px;">
        Great news! <strong style="color:#374151;">${approverName}</strong> has approved your asset request.
        The operations team has been notified and will process it shortly.
      </p>
      ${this._infoCard([
        ['Category',    categoryName],
        ['Approved By', approverName],
        ['Status',      'APPROVED', '#16a34a'],
      ])}
      ${message ? `<div style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:0 6px 6px 0;padding:14px 16px;margin:16px 0;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#15803d;text-transform:uppercase;letter-spacing:0.5px;">Note from Approver</p>
        <p style="margin:0;font-size:14px;color:#166534;">${message}</p>
      </div>` : ''}
      <p style="font-size:13px;color:#6b7280;margin:16px 0 0;">You will be notified again when the asset is ready for pickup.</p>`;
    return this._base({
      accentColor: '#16a34a',
      preheader: `${approverName} approved your asset request`,
      headerTitle: 'Asset Request Approved',
      headerSubtitle: `Category: ${categoryName}`,
      body, ctaUrl: '/assets', ctaLabel: 'View Asset Requests',
    });
  }

  _assetOpsAssignedTemplate(name, approverName, requesterName, categoryName, message) {
    const body = `
      <p style="font-size:15px;color:#374151;margin:0 0 20px;">Hi <strong>${name}</strong>,</p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 8px;">
        <strong style="color:#374151;">${approverName}</strong> has assigned an asset request to you for processing.
        Please source the asset, add device details if applicable, and hand it over to the requester.
      </p>
      ${this._infoCard([
        ['Requested By', requesterName],
        ['Category',     categoryName],
        ['Approved By',  approverName],
        ['Action Required', 'Process & Hand Over', '#d97706'],
      ])}
      ${message ? `<div style="background:#fffbeb;border-left:4px solid #d97706;border-radius:0 6px 6px 0;padding:14px 16px;margin:16px 0;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;">Message from Approver</p>
        <p style="margin:0;font-size:14px;color:#92400e;">${message}</p>
      </div>` : ''}`;
    return this._base({
      accentColor: '#d97706',
      preheader: `Asset request assigned to you by ${approverName}`,
      headerTitle: 'Asset Request — Action Required',
      headerSubtitle: `Please process and hand over to ${requesterName}`,
      body, ctaUrl: '/assets', ctaLabel: 'View Request',
    });
  }

  _assetHandoverTemplate(name, handoverName, assetName, deviceId, deviceUsername, devicePassword, notes) {
    const credRows = [];
    if (deviceId)       credRows.push(['Device ID',       deviceId]);
    if (deviceUsername) credRows.push(['Username / Login', deviceUsername]);
    if (devicePassword) credRows.push(['Password',         devicePassword]);
    const credBlock = credRows.length ? `
      <p style="font-size:13px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.5px;margin:20px 0 6px;">🔐 Device Credentials</p>
      ${this._infoCard(credRows.map(([l, v]) => [l, v]))}
      <p style="font-size:12px;color:#9ca3af;margin:4px 0 0;">Please save these credentials securely and delete this email after noting them down.</p>` : '';
    const body = `
      <p style="font-size:15px;color:#374151;margin:0 0 20px;">Hi <strong>${name}</strong>,</p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 8px;">
        <strong style="color:#374151;">${handoverName}</strong> has processed your asset request.
        Your asset is now ready for pickup.
      </p>
      ${this._infoCard([
        ['Asset',        assetName],
        ['Processed By', handoverName],
        ['Status',       'READY FOR PICKUP', '#7c3aed'],
      ])}
      ${credBlock}
      ${notes ? `<div style="background:#f5f3ff;border-left:4px solid #7c3aed;border-radius:0 6px 6px 0;padding:14px 16px;margin:16px 0;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#5b21b6;text-transform:uppercase;letter-spacing:0.5px;">Handover Notes</p>
        <p style="margin:0;font-size:14px;color:#4c1d95;">${notes}</p>
      </div>` : ''}`;
    return this._base({
      accentColor: '#7c3aed',
      preheader: `Your asset "${assetName}" is ready for pickup`,
      headerTitle: 'Asset Ready for Pickup',
      headerSubtitle: `Processed by: ${handoverName}`,
      body, ctaUrl: '/assets', ctaLabel: 'View My Assets',
    });
  }

  _assetHandoverManagerTemplate(name, handoverName, requesterName, assetName, notes) {
    const body = `
      <p style="font-size:15px;color:#374151;margin:0 0 20px;">Hi <strong>${name}</strong>,</p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 8px;">
        This is a confirmation that the asset request you approved has been processed and handed over.
      </p>
      ${this._infoCard([
        ['Asset',        assetName],
        ['Given To',     requesterName],
        ['Processed By', handoverName],
        ['Status',       'HANDED OVER', '#0891b2'],
      ])}
      ${notes ? `<div style="background:#f0f9ff;border-left:4px solid #0891b2;border-radius:0 6px 6px 0;padding:14px 16px;margin:16px 0;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#0e7490;text-transform:uppercase;letter-spacing:0.5px;">Handover Notes</p>
        <p style="margin:0;font-size:14px;color:#164e63;">${notes}</p>
      </div>` : ''}`;
    return this._base({
      accentColor: '#0891b2',
      preheader: `Asset "${assetName}" handed over to ${requesterName}`,
      headerTitle: 'Asset Handover Complete',
      headerSubtitle: `${assetName} → ${requesterName}`,
      body, ctaUrl: '/assets', ctaLabel: 'View Asset Requests',
    });
  }

  _dailySummaryTemplate(name, date, submitted, missed, projectName) {
    const submittedRows = submitted.map((s) =>
      `<tr><td style="padding:8px 16px;border-bottom:1px solid #f3f4f6;">
        <span style="color:#059669;font-size:13px;">&#10003;&nbsp;</span>
        <span style="font-size:14px;color:#374151;">${s}</span>
      </td></tr>`).join('');

    const missedRows = missed.map((s) =>
      `<tr><td style="padding:8px 16px;border-bottom:1px solid #f3f4f6;">
        <span style="color:#dc2626;font-size:13px;">&#10007;&nbsp;</span>
        <span style="font-size:14px;color:#374151;">${s}</span>
      </td></tr>`).join('');

    const submittedBlock = submitted.length > 0 ? `
      <p style="font-size:13px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:0.5px;margin:20px 0 6px;">
        &#10003; Submitted (${submitted.length})
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        ${submittedRows}
      </table>` : '';

    const missedBlock = missed.length > 0 ? `
      <p style="font-size:13px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:0.5px;margin:20px 0 6px;">
        &#10007; Missed (${missed.length})
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #fecaca;border-radius:8px;overflow:hidden;background:#fffafa;">
        ${missedRows}
      </table>` : `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0;text-align:center;">
        <p style="margin:0;font-size:14px;color:#166534;font-weight:600;">&#127881; All team members submitted today!</p>
      </div>`;

    const body = `
      <p style="font-size:15px;color:#374151;margin:0 0 20px;">Hi <strong>${name}</strong>,</p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 8px;">
        Here is today's participation summary for <strong style="color:#374151;">${projectName}</strong>.
      </p>
      ${this._infoCard([
        ['Project', projectName],
        ['Date', date],
        ['Submitted', String(submitted.length), '#059669'],
        ['Missed', String(missed.length), missed.length > 0 ? '#dc2626' : '#059669'],
      ])}
      ${submittedBlock}
      ${missedBlock}`;

    return this._base({
      accentColor: '#1e3a5f',
      preheader: `Daily summary for ${projectName} – ${submitted.length} submitted, ${missed.length} missed`,
      headerTitle: 'Daily Summary',
      headerSubtitle: `${projectName} · ${date}`,
      body,
      ctaUrl: '/reports',
      ctaLabel: 'View Full Report',
      footerNote: 'This summary is sent to project leads each evening.',
    });
  }
}

module.exports = NotificationService;
