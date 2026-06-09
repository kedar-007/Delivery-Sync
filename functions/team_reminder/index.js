'use strict';

const ZCatalyst = require('zcatalyst-sdk-node');

// ─── Weekend / Holiday helpers ────────────────────────────────────────────────

function getNthSaturday(year, month, date) {
  let count = 0;
  for (let d = 1; d <= date; d++) {
    if (new Date(year, month, d).getDay() === 6) count++;
  }
  return count;
}

// Returns true if the given day is a non-working day under the tenant's
// weekend policy. Mirrors the logic in people_service LeaveController.
function isDayOff(dayOfWeek, year, month, date, policy) {
  if (policy === 'all_on') return false;
  if (dayOfWeek === 0) return true; // Sunday always off
  if (dayOfWeek !== 6) return false; // Mon–Fri always on
  if (policy === 'all_off') return true;
  const nth = getNthSaturday(year, month, date);
  if (policy === '1st_3rd_off')     return nth === 1 || nth === 3;
  if (policy === '2nd_4th_off')     return nth === 2 || nth === 4;
  if (policy === '2nd_4th_5th_off') return nth === 2 || nth === 4 || nth === 5;
  if (policy === 'alternate_off')   return nth % 2 === 1;
  if (policy === '5th_sat_working') return nth !== 5;
  return true; // unknown policy → treat as all_off
}

/**
 * Team Reminder Job Function
 *
 * Triggered by dynamic daily CALENDAR crons created from TeamController.
 * Skips on weekends (per tenant weekend policy) and mandatory public holidays
 * (non-optional entries in the leave_calendar table for this tenant).
 *
 * Job params (set via job_meta.params in createCron):
 *   team_id   – DataStore ROWID of the team
 *   tenant_id – DataStore ROWID of the tenant
 *   type      – 'STANDUP' | 'EOD'
 *   time      – scheduled time string e.g. '09:00'
 *   team_name – display name of the team
 *   timezone  – IANA timezone e.g. 'Asia/Kolkata'
 */
module.exports = async (jobRequest, context) => {
  const app = ZCatalyst.initialize(context);

  try {
    const params = jobRequest.getAllJobParams();
    console.log('[team_reminder] params:', JSON.stringify(params));

    const { team_id, tenant_id, type, time, team_name, timezone } = params;

    if (!team_id || !tenant_id || !type) {
      console.error('[team_reminder] Missing required params — aborting');
      context.closeWithFailure();
      return;
    }

    const tz        = timezone || 'Asia/Kolkata';
    const isStandup = type === 'STANDUP';
    const zcql      = app.zcql();

    // ── 1. Resolve today's date in the team's timezone ────────────────────────
    // Parsing via en-US locale gives a real Date object adjusted to the tz,
    // from which we can reliably read getDay() / getFullYear() etc.
    const localNow   = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
    const localYear  = localNow.getFullYear();
    const localMonth = localNow.getMonth();    // 0-indexed
    const localDate  = localNow.getDate();
    const localDow   = localNow.getDay();      // 0=Sun … 6=Sat
    const todayStr   = `${localYear}-${String(localMonth + 1).padStart(2, '0')}-${String(localDate).padStart(2, '0')}`;
    const today      = new Date(localYear, localMonth, localDate).toLocaleDateString('en-AU', {
      day: '2-digit', month: 'short', year: 'numeric',
    });

    console.log(`[team_reminder] today=${todayStr} dow=${localDow} tz=${tz}`);

    // ── 2. Fetch tenant settings: weekend policy + mandatory holidays ─────────
    let weekendPolicyObj = { default: 'all_off', perLocation: {} };
    let isMandatoryHoliday = false;
    try {
      const tenantRows = await zcql.executeZCQLQuery(
        `SELECT settings FROM tenants WHERE ROWID = '${tenant_id}' LIMIT 1`
      );
      const settings = JSON.parse(tenantRows?.[0]?.tenants?.settings || '{}');
      weekendPolicyObj = settings?.weekendPolicy || { default: 'all_off', perLocation: {} };
    } catch (e) {
      console.warn('[team_reminder] Could not fetch tenant settings, defaulting to all_off:', e.message);
    }
    console.log(`[team_reminder] weekendPolicy default=${weekendPolicyObj.default} perLocation keys=${Object.keys(weekendPolicyObj.perLocation || {}).length}`);

    // ── 3. Check mandatory public holiday (tenant-wide → skip whole team) ────
    try {
      const holidayRows = await zcql.executeZCQLQuery(
        `SELECT ROWID, is_optional FROM leave_calendar` +
        ` WHERE tenant_id = '${tenant_id}' AND holiday_date = '${todayStr}' LIMIT 10`
      );
      isMandatoryHoliday = (Array.isArray(holidayRows) ? holidayRows : [])
        .map(r => r.leave_calendar)
        .some(h => h && String(h.is_optional) !== 'true');
    } catch (e) {
      console.warn('[team_reminder] Holiday check failed, proceeding anyway:', e.message);
    }
    if (isMandatoryHoliday) {
      console.log(`[team_reminder] SKIPPED — ${todayStr} is a mandatory public holiday`);
      context.closeWithSuccess();
      return;
    }

    // ── 4. Fetch team members (ZCQL cap is 300; 200 is safe) ─────────────────
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

    // ── 5. Bulk-fetch user details + office location overrides ───────────────
    const idList   = members.map(m => `'${m.user_id}'`).join(',');
    const [usersRaw, overridesRaw] = await Promise.all([
      zcql.executeZCQLQuery(
        `SELECT ROWID, name, email FROM users WHERE ROWID IN (${idList}) LIMIT 300`
      ),
      zcql.executeZCQLQuery(
        `SELECT user_id, permissions FROM permission_overrides` +
        ` WHERE tenant_id = '${tenant_id}' AND is_active = 'true' LIMIT 300`
      ).catch(() => []),
    ]);

    const userMap = {};
    (Array.isArray(usersRaw) ? usersRaw : []).forEach(r => {
      const u = r.users;
      if (u && u.ROWID) userMap[String(u.ROWID)] = { name: u.name || '', email: u.email || '' };
    });

    // Build userId → officeLocationId map from permission overrides
    const locationMap = {};
    (Array.isArray(overridesRaw) ? overridesRaw : []).forEach(r => {
      const o = r.permission_overrides;
      if (!o || !o.user_id) return;
      try {
        const parsed = JSON.parse(o.permissions || '{}');
        if (parsed.officeLocationId) locationMap[String(o.user_id)] = String(parsed.officeLocationId);
      } catch (_) {}
    });

    // ── 6. Send in-app + email for each member ────────────────────────────────
    const notifTable = app.datastore().table('notifications');
    const fromEmail  = process.env.FROM_EMAIL || 'catalystadmin@dsv360.ai';
    const label      = team_name || 'your team';
    const notifType  = isStandup ? 'STANDUP_REMINDER' : 'EOD_REMINDER';

    const title   = isStandup ? `Standup reminder – ${label}` : `EOD update reminder – ${label}`;
    const message = isStandup
      ? `Your standup for ${label} starts at ${time}. Submit your update now!`
      : `Your EOD update for ${label} is due at ${time}. Wrap it up before you sign off!`;

    let emailsSent = 0, notifsSent = 0, skippedWeekend = 0;

    for (const member of members) {
      const userId = String(member.user_id);
      const user   = userMap[userId] || {};

      // Per-user weekend check — apply location-specific policy if available
      const userLocId    = locationMap[userId];
      const userPolicy   = (userLocId && weekendPolicyObj.perLocation?.[userLocId])
        ? weekendPolicyObj.perLocation[userLocId]
        : (weekendPolicyObj.default || 'all_off');
      if (isDayOff(localDow, localYear, localMonth, localDate, userPolicy)) {
        skippedWeekend++;
        continue;
      }

      // In-app notification
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
              ? `[Delivery Sync] Standup reminder – ${label}`
              : `[Delivery Sync] EOD update reminder – ${label}`,
            content:    isStandup
              ? _standupEmailHtml(user.name || 'Team member', label, today)
              : _eodEmailHtml(user.name || 'Team member', label, today),
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
      ` members=${members.length} skipped_weekend=${skippedWeekend} in-app=${notifsSent} emails=${emailsSent}`
    );
    context.closeWithSuccess();
  } catch (err) {
    console.error('[team_reminder] FATAL:', err.message, err.stack);
    context.closeWithFailure();
  }
};

// ─── Email templates ──────────────────────────────────────────────────────────

function _standupEmailHtml(name, teamName, date) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
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
</body>
</html>`;
}

function _eodEmailHtml(name, teamName, date) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
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
</body>
</html>`;
}
