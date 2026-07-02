'use strict';

const ZCatalyst = require('zcatalyst-sdk-node');
const JobRunService = require('./src/services/JobRunService');

/**
 * People Wish Job Function
 *
 * Triggered by a per-user annual CALENDAR cron created from:
 *   UserController.updateProfile  → birthday   (user sets birth_date)
 *   AdminController.updateUser    → anniversary (admin sets date_of_joining)
 *
 * Job params:
 *   user_id   – DataStore ROWID of the user
 *   tenant_id – DataStore ROWID of the tenant
 *   type      – 'BIRTHDAY' | 'ANNIVERSARY'
 *
 * Cron naming:
 *   bday_${userId}   fires 08:00 user's local timezone on their birth month/day
 *   anniv_${userId}  fires 08:00 user's local timezone on their join month/day
 *
 * @param {import("./types/job").JobRequest} jobRequest
 * @param {import("./types/job").Context}    context
 */
module.exports = async (jobRequest, context) => {
  const app = ZCatalyst.initialize(context);

  // Record this run in the global job_runs table (Settings -> Background Jobs).
  // The real close is deferred until the status row is written; call sites
  // below stay unchanged.
  const run = await JobRunService.start(app, 'people-wish', 'people_wish');
  const _closeOk   = context.closeWithSuccess.bind(context);
  const _closeFail = context.closeWithFailure.bind(context);
  context.closeWithSuccess = () => { run.success().finally(_closeOk); };
  context.closeWithFailure = () => { run.fail('job closed with failure').finally(_closeFail); };

  try {
    const params = jobRequest.getAllJobParams();
    console.log('[people_wish] params:', JSON.stringify(params));

    const { user_id, tenant_id, type } = params;

    if (!user_id || !tenant_id || !type) {
      console.error('[people_wish] Missing required params — aborting');
      context.closeWithFailure();
      return;
    }

    const isBirthday = type === 'BIRTHDAY';
    const zcql       = app.zcql();

    // ── 1. Fetch user — bail if not found or inactive ─────────────────────────
    const userRaw = await zcql.executeZCQLQuery(
      `SELECT ROWID, name, email, status FROM users` +
      ` WHERE ROWID = '${user_id}' AND tenant_id = '${tenant_id}' LIMIT 1`
    );
    const userRows = Array.isArray(userRaw) ? userRaw : [];
    if (!userRows.length) {
      console.log(`[people_wish] User ${user_id} not found — skipping`);
      context.closeWithSuccess();
      return;
    }
    const user = userRows[0].users || userRows[0];

    if (String(user.status || '').toUpperCase() === 'INACTIVE') {
      console.log(`[people_wish] User ${user_id} is inactive — skipping`);
      context.closeWithSuccess();
      return;
    }
    if (!user.email) {
      console.log(`[people_wish] User ${user_id} has no email — skipping`);
      context.closeWithSuccess();
      return;
    }

    // ── 2. Fetch profile ───────────────────────────────────────────────────────
    const profileRaw = await zcql.executeZCQLQuery(
      `SELECT date_of_joining, designation FROM user_profiles` +
      ` WHERE user_id = '${user_id}' AND tenant_id = '${tenant_id}' LIMIT 1`
    );
    const profileRows = Array.isArray(profileRaw) ? profileRaw : [];
    const profile     = profileRows.length
      ? (profileRows[0].user_profiles || profileRows[0])
      : {};

    // ── 3. Fetch tenant name ───────────────────────────────────────────────────
    const tenantRaw = await zcql.executeZCQLQuery(
      `SELECT ROWID, name FROM tenants WHERE ROWID = '${tenant_id}' LIMIT 1`
    );
    const tenantRows = Array.isArray(tenantRaw) ? tenantRaw : [];
    const orgName    = tenantRows.length
      ? ((tenantRows[0].tenants || tenantRows[0]).name || 'Your Company')
      : 'Your Company';

    // ── 4. Compute year count for anniversary ─────────────────────────────────
    let years = 0;
    if (!isBirthday && profile.date_of_joining) {
      const joinYear = new Date(profile.date_of_joining).getFullYear();
      years = new Date().getFullYear() - joinYear;
      if (years <= 0) {
        console.log(`[people_wish] Anniversary year count ${years} — skipping`);
        context.closeWithSuccess();
        return;
      }
    }

    // ── 5. Setup shared values ─────────────────────────────────────────────────
    const fromEmail = process.env.FROM_EMAIL || 'catalystadmin@dsv360.ai';
    const envRaw    = String(process.env.ENVIRONMENT || 'development').trim().toLowerCase();
    const isProd    = envRaw === 'production' || envRaw === 'prod';
    const envLabel  = isProd ? 'PROD' : envRaw.toUpperCase();

    const userName    = user.name || 'Team member';
    const designation = profile.designation || '';

    // ── 6. In-app notification ────────────────────────────────────────────────
    const notifTable = app.datastore().table('notifications');
    const notifTitle = isBirthday
      ? `Happy Birthday, ${userName}!`
      : `Happy ${years} Year${years === 1 ? '' : 's'} Work Anniversary!`;
    const notifMsg = isBirthday
      ? `Wishing you a wonderful birthday today!`
      : `Congratulations on ${years} year${years === 1 ? '' : 's'} with ${orgName}!`;

    try {
      await notifTable.insertRow({
        tenant_id:   tenant_id,
        user_id:     user_id,
        title:       notifTitle,
        message:     notifMsg,
        type:        isBirthday ? 'BIRTHDAY_WISH' : 'WORK_ANNIVERSARY',
        is_read:     'false',
        entity_type: 'USER',
        entity_id:   user_id,
        metadata:    JSON.stringify({ wishType: type, years }),
      });
    } catch (e) {
      console.warn(`[people_wish] in-app notif failed userId=${user_id}:`, e.message);
    }

    // ── 7. Send email ─────────────────────────────────────────────────────────
    const yearLabel = `${years} Year${years === 1 ? '' : 's'}`;
    const subject   = isBirthday
      ? (isProd
          ? `Happy Birthday, ${userName}! | ${orgName}`
          : `[${envLabel}] Happy Birthday, ${userName}! | ${orgName}`)
      : (isProd
          ? `Happy ${yearLabel} Work Anniversary, ${userName}! | ${orgName}`
          : `[${envLabel}] Happy ${yearLabel} Work Anniversary, ${userName}! | ${orgName}`);

    try {
      await app.email().sendMail({
        from_email: fromEmail,
        to_email:   [user.email],
        subject,
        content:    isBirthday
          ? _birthdayHtml(userName, designation, orgName, isProd, envLabel)
          : _anniversaryHtml(userName, designation, orgName, years, isProd, envLabel),
        html_mode:  true,
      });
      console.log(`[people_wish] email sent → ${user.email} type=${type}`);
    } catch (e) {
      console.warn(`[people_wish] email failed ${user.email}:`, e.message);
    }

    console.log(`[people_wish] DONE userId=${user_id} type=${type} years=${years}`);
    context.closeWithSuccess();
  } catch (err) {
    console.error('[people_wish] FATAL:', err.message, err.stack);
    context.closeWithFailure();
  }
};

// ─── Email templates ──────────────────────────────────────────────────────────

function _envBanner(isProd, envLabel) {
  if (isProd) return '';
  return `
  <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:10px 14px;margin-bottom:16px;text-align:center;">
    <div style="font-size:12px;font-weight:700;letter-spacing:1.5px;color:#92400e;text-transform:uppercase;">&#9888;&nbsp; ${envLabel} environment &mdash; this is a test message</div>
  </div>`;
}

function _birthdayHtml(name, designation, orgName, isProd, envLabel) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;padding:0 16px;">
    ${_envBanner(isProd, envLabel)}
    <div style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

      <!-- Header -->
      <div style="background:linear-gradient(135deg,#ec4899 0%,#f97316 100%);padding:40px 32px;text-align:center;">
        <div style="font-size:52px;line-height:1;margin-bottom:12px;">&#127874;</div>
        <p style="margin:0;color:rgba(255,255,255,.75);font-size:11px;letter-spacing:.12em;text-transform:uppercase;">${orgName}</p>
        <h1 style="margin:10px 0 6px;color:#fff;font-size:28px;font-weight:800;letter-spacing:-.02em;">Happy Birthday!</h1>
        ${designation ? `<p style="margin:0;color:rgba(255,255,255,.8);font-size:13px;">${designation}</p>` : ''}
      </div>

      <!-- Body -->
      <div style="padding:32px 32px 24px;">
        <p style="font-size:16px;color:#111827;margin:0 0 16px;font-weight:600;">Dear ${name},</p>
        <p style="font-size:14px;color:#6b7280;margin:0 0 14px;line-height:1.75;">
          On behalf of everyone at <strong style="color:#111827;">${orgName}</strong>, we want to wish you
          a truly wonderful <strong style="color:#ec4899;">Happy Birthday!</strong>
          Today is all about you — we hope it brings everything that makes you smile.
        </p>
        <p style="font-size:14px;color:#6b7280;margin:0 0 28px;line-height:1.75;">
          Your energy, creativity, and commitment make our team a better place every single day.
          Thank you for everything you bring — we're so glad to have you with us.
        </p>

        <!-- Wish card -->
        <div style="background:linear-gradient(135deg,#fdf2f8 0%,#fff7ed 100%);border:1px solid #f9a8d4;border-radius:12px;padding:24px;text-align:center;">
          <div style="font-size:32px;margin-bottom:10px;">&#127881;</div>
          <p style="margin:0;font-size:16px;color:#be185d;font-weight:700;">Wishing you a year filled with joy!</p>
          <p style="margin:8px 0 0;font-size:13px;color:#9d174d;line-height:1.6;">
            May this birthday mark the start of your best year yet &mdash;<br>full of happiness, health, and success.
          </p>
        </div>
      </div>

      <!-- Footer -->
      <div style="padding:16px 32px;background:#fafafa;border-top:1px solid #f3f4f6;text-align:center;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">With warm wishes &middot; The ${orgName} Team</p>
      </div>

    </div>
  </div>
</body>
</html>`;
}

function _anniversaryHtml(name, designation, orgName, years, isProd, envLabel) {
  const milestone = `${years} Year${years === 1 ? '' : 's'}`;
  const milestoneMsg = years === 1
    ? 'One year in — and what a year it has been!'
    : years < 3  ? 'Your growth and dedication inspire the whole team.'
    : years < 5  ? 'Three-plus years of excellence — thank you for your continued commitment.'
    : years < 10 ? 'Half a decade of outstanding contributions. You\'re a cornerstone of this team.'
    :              'A decade or more — your loyalty and expertise are truly invaluable to us.';

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;padding:0 16px;">
    ${_envBanner(isProd, envLabel)}
    <div style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

      <!-- Header -->
      <div style="background:linear-gradient(135deg,#d97706 0%,#92400e 100%);padding:40px 32px;text-align:center;">
        <div style="font-size:52px;line-height:1;margin-bottom:12px;">&#127942;</div>
        <p style="margin:0;color:rgba(255,255,255,.75);font-size:11px;letter-spacing:.12em;text-transform:uppercase;">${orgName}</p>
        <h1 style="margin:10px 0 6px;color:#fff;font-size:28px;font-weight:800;letter-spacing:-.02em;">${milestone} Work Anniversary</h1>
        ${designation ? `<p style="margin:0;color:rgba(255,255,255,.8);font-size:13px;">${designation}</p>` : ''}
      </div>

      <!-- Body -->
      <div style="padding:32px 32px 24px;">
        <p style="font-size:16px;color:#111827;margin:0 0 16px;font-weight:600;">Congratulations, ${name}!</p>
        <p style="font-size:14px;color:#6b7280;margin:0 0 14px;line-height:1.75;">
          Today marks <strong style="color:#111827;">${milestone}</strong> since you joined the
          <strong style="color:#111827;">${orgName}</strong> family. We want to take a moment
          to celebrate this milestone and express our heartfelt appreciation for everything you do.
        </p>
        <p style="font-size:14px;color:#6b7280;margin:0 0 28px;line-height:1.75;">
          ${milestoneMsg} Your work has made a lasting impact, and we look forward to
          achieving even more together in the years ahead.
        </p>

        <!-- Milestone badge -->
        <div style="background:linear-gradient(135deg,#fffbeb 0%,#fef3c7 100%);border:1px solid #fcd34d;border-radius:12px;padding:24px;text-align:center;">
          <div style="display:inline-block;background:linear-gradient(135deg,#d97706 0%,#b45309 100%);color:#fff;font-size:20px;font-weight:800;padding:10px 28px;border-radius:50px;letter-spacing:.03em;margin-bottom:12px;">${milestone}</div>
          <p style="margin:0;font-size:14px;color:#92400e;font-weight:600;">of excellence, dedication &amp; growth</p>
          <p style="margin:8px 0 0;font-size:12px;color:#b45309;">Thank you for being an essential part of our journey.</p>
        </div>
      </div>

      <!-- Footer -->
      <div style="padding:16px 32px;background:#fafafa;border-top:1px solid #f3f4f6;text-align:center;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">With appreciation &middot; The ${orgName} Team</p>
      </div>

    </div>
  </div>
</body>
</html>`;
}
