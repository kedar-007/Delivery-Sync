'use strict';

const ZCatalyst = require('zcatalyst-sdk-node');

/**
 * Team Reminder Job Function
 *
 * Triggered by dynamic daily CALENDAR crons created from TeamController
 * (one cron per team per schedule type: standup / EOD).
 *
 * Job params (set via job_meta.params in createCron):
 *   team_id   – DataStore ROWID of the team
 *   tenant_id – DataStore ROWID of the tenant
 *   type      – 'STANDUP' | 'EOD'
 *   time      – scheduled time string e.g. '09:00' (used in the notification message)
 *   team_name – display name of the team
 *
 * @param {import("./types/job").JobRequest} jobRequest
 * @param {import("./types/job").Context}    context
 */
module.exports = async (jobRequest, context) => {
  const app = ZCatalyst.initialize(context);

  try {
    const params = jobRequest.getAllJobParams();
    console.log('[team_reminder] params:', JSON.stringify(params));

    const { team_id, tenant_id, type, time, team_name } = params;

    if (!team_id || !tenant_id || !type) {
      console.error('[team_reminder] Missing required params — aborting');
      context.closeWithFailure();
      return;
    }

    const isStandup = type === 'STANDUP';
    const zcql      = app.zcql();
    const today     = new Date().toLocaleDateString('en-AU', {
      day: '2-digit', month: 'short', year: 'numeric',
    });

    // ── 1. Fetch team members (ZCQL cap is 300; 200 is safe) ─────────────────
    const membersRaw = await zcql.executeZCQLQuery(
      `SELECT user_id FROM team_members` +
      ` WHERE tenant_id = '${tenant_id}' AND team_id = '${team_id}' LIMIT 200`
    );
    const members = (Array.isArray(membersRaw) ? membersRaw : [])
      .map(r => r.team_members)
      .filter(r => r && r.user_id);

    if (!members.length) {
      console.log(`[team_reminder] No members for team ${team_id} — nothing to send`);
      context.closeWithSuccess();
      return;
    }

    // ── 2. Bulk-fetch user details in one query ───────────────────────────────
    const idList = members.map(m => `'${m.user_id}'`).join(',');
    const usersRaw = await zcql.executeZCQLQuery(
      `SELECT ROWID, name, email FROM users WHERE ROWID IN (${idList}) LIMIT 300`
    );
    const userMap = {};
    (Array.isArray(usersRaw) ? usersRaw : []).forEach(r => {
      const u = r.users;
      if (u && u.ROWID) userMap[String(u.ROWID)] = { name: u.name || '', email: u.email || '' };
    });

    // ── 3. Send in-app + email for each member ─────────────────────────────────
    const notifTable = app.datastore().table('notifications');
    const fromEmail  = process.env.FROM_EMAIL || 'catalystadmin@dsv360.ai';
    const envRaw     = String(process.env.ENVIRONMENT || 'development').trim().toLowerCase();
    const isProd     = envRaw === 'production' || envRaw === 'prod';
    const envLabel   = isProd ? 'PROD' : envRaw.toUpperCase();
    const label      = team_name || 'your team';
    const notifType  = isStandup ? 'STANDUP_REMINDER' : 'EOD_REMINDER';

    const title   = isStandup ? `Standup reminder – ${label}` : `EOD update reminder – ${label}`;
    const message = isStandup
      ? `Your standup for ${label} starts at ${time}. Submit your update now!`
      : `Your EOD update for ${label} is due at ${time}. Wrap it up before you sign off!`;

    let emailsSent = 0, notifsSent = 0;

    for (const member of members) {
      const userId = String(member.user_id);
      const user   = userMap[userId] || {};

      // In-app notification (insert into notifications table)
      try {
        await notifTable.insertRow({
          tenant_id:   tenant_id,
          user_id:     userId,
          title,
          message,
          type:        notifType,
          is_read:     'false',
          entity_type: 'TEAM',
          entity_id:   team_id,
          metadata:    JSON.stringify({ teamId: team_id, teamName: label, time }),
        });
        notifsSent++;
      } catch (e) {
        console.warn(`[team_reminder] in-app failed userId=${userId}:`, e.message);
      }

      // Email
      if (user.email) {
        try {
          await app.email().sendMail({
            from_email: fromEmail,
            to_email:   [user.email],
            subject:    isStandup
              ? (isProd ? `[Delivery Sync] Standup reminder – ${label}` : `[${envLabel}] [Delivery Sync] Standup reminder – ${label}`)
              : (isProd ? `[Delivery Sync] EOD update reminder – ${label}` : `[${envLabel}] [Delivery Sync] EOD update reminder – ${label}`),
            content:    isStandup
              ? _standupEmailHtml(user.name || 'Team member', label, today, isProd, envLabel)
              : _eodEmailHtml(user.name || 'Team member', label, today, isProd, envLabel),
            html_mode:  true,
          });
          emailsSent++;
        } catch (e) {
          console.warn(`[team_reminder] email failed ${user.email}:`, e.message);
        }
      }
    }

    console.log(
      `[team_reminder] DONE type=${type} team=${team_id} "${label}"` +
      ` members=${members.length} in-app=${notifsSent} emails=${emailsSent}`
    );
    context.closeWithSuccess();
  } catch (err) {
    console.error('[team_reminder] FATAL:', err.message, err.stack);
    context.closeWithFailure();
  }
};

// ─── Email templates ──────────────────────────────────────────────────────────

function _standupEmailHtml(name, teamName, date, isProd = true, envLabel = 'PROD') {
  const envBanner = isProd ? '' : `
  <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:10px 14px;margin-bottom:12px;text-align:center;">
    <div style="font-size:12px;font-weight:700;letter-spacing:1.5px;color:#92400e;text-transform:uppercase;">&#9888;&nbsp; ${envLabel} environment &mdash; this is a test message</div>
  </div>`;
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;">
    ${envBanner}
    <div style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
    <div style="background:#1d4ed8;padding:28px 32px;">
      <p style="margin:0;color:#bfdbfe;font-size:12px;letter-spacing:.08em;text-transform:uppercase;">Delivery Sync</p>
      <h1 style="margin:6px 0 0;color:#fff;font-size:20px;font-weight:700;">Standup Reminder</h1>
      <p style="margin:4px 0 0;color:#93c5fd;font-size:13px;">${teamName} &middot; ${date}</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="font-size:15px;color:#374151;margin:0 0 16px;">Hi <strong>${name}</strong>,</p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 20px;">
        This is your daily reminder to submit your <strong style="color:#374151;">standup update</strong> for today.
        Keeping the team aligned starts with a quick update from everyone.
      </p>
      <table style="width:100%;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;border-collapse:collapse;margin-bottom:20px;">
        <tr><td style="padding:10px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;width:110px;">Team</td>
            <td style="padding:10px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;font-weight:600;">${teamName}</td></tr>
        <tr><td style="padding:10px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Date</td>
            <td style="padding:10px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">${date}</td></tr>
        <tr><td style="padding:10px 16px;font-size:13px;color:#6b7280;">Type</td>
            <td style="padding:10px 16px;font-size:13px;color:#111827;">Daily Standup</td></tr>
      </table>
      <p style="font-size:13px;color:#6b7280;margin:0 0 24px;">Just a few lines on what you did yesterday, what you're doing today, and any blockers. It takes less than 2 minutes!</p>
      <a href="/standup" style="display:inline-block;background:#1d4ed8;color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:6px;text-decoration:none;">Submit Standup</a>
    </div>
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">Delivery Sync &middot; You're receiving this because your team has daily standups configured.</p>
    </div>
  </div>
  </div>
</body>
</html>`;
}

function _eodEmailHtml(name, teamName, date, isProd = true, envLabel = 'PROD') {
  const envBanner = isProd ? '' : `
  <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:10px 14px;margin-bottom:12px;text-align:center;">
    <div style="font-size:12px;font-weight:700;letter-spacing:1.5px;color:#92400e;text-transform:uppercase;">&#9888;&nbsp; ${envLabel} environment &mdash; this is a test message</div>
  </div>`;
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;">
    ${envBanner}
    <div style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
    <div style="background:#059669;padding:28px 32px;">
      <p style="margin:0;color:#a7f3d0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;">Delivery Sync</p>
      <h1 style="margin:6px 0 0;color:#fff;font-size:20px;font-weight:700;">EOD Update Reminder</h1>
      <p style="margin:4px 0 0;color:#6ee7b7;font-size:13px;">${teamName} &middot; ${date}</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="font-size:15px;color:#374151;margin:0 0 16px;">Hi <strong>${name}</strong>,</p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 20px;">
        Don't forget to wrap up your day with an <strong style="color:#374151;">EOD update</strong>!
        It helps leadership stay informed and feeds into your weekly reports automatically.
      </p>
      <table style="width:100%;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;border-collapse:collapse;margin-bottom:20px;">
        <tr><td style="padding:10px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;width:110px;">Team</td>
            <td style="padding:10px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;font-weight:600;">${teamName}</td></tr>
        <tr><td style="padding:10px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Date</td>
            <td style="padding:10px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">${date}</td></tr>
        <tr><td style="padding:10px 16px;font-size:13px;color:#6b7280;">Type</td>
            <td style="padding:10px 16px;font-size:13px;color:#111827;">End-of-Day Update</td></tr>
      </table>
      <p style="font-size:13px;color:#6b7280;margin:0 0 24px;">Share what you completed today, any pending items, and note any blockers before you sign off.</p>
      <a href="/eod" style="display:inline-block;background:#059669;color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:6px;text-decoration:none;">Submit EOD Update</a>
    </div>
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">Delivery Sync &middot; You're receiving this because your team has daily EOD updates configured.</p>
    </div>
  </div>
  </div>
</body>
</html>`;
}
