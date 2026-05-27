/**
 * user_confirmation — Zoho Catalyst Event Function
 *
 * Triggered by the UserManagement event (action: UserConfirmation) when a
 * user confirms their account email.
 *
 * What it does:
 *  1. Reads the Catalyst user ID from event.getSourceEntityId()
 *  2. Looks up the user row in the `users` table by catalyst_user_id
 *  3. Updates the user's status from INVITED → ACTIVE
 *  4. Writes a structured audit log entry to `audit_logs`
 *
 * NOTE: Catalyst UserManagement events do NOT populate event.getData() — the
 * user payload is not in event.data. The only reliable identifier is the
 * entity ID returned by event.getSourceEntityId().
 *
 * @param {import('./types/event').EventDetails} event
 * @param {import('./types/event').Context} context
 */

const catalyst = require('zcatalyst-sdk-node');

module.exports = async (event, context) => {
  try {
    const app = catalyst.initialize(context);

    // ── Unpack all available event fields for diagnostics ───────────────────
    const source   = typeof event.getSource         === 'function' ? event.getSource()         : null;
    const action   = typeof event.getAction         === 'function' ? event.getAction()         : null;
    const entityId = typeof event.getSourceEntityId === 'function' ? event.getSourceEntityId() : null;
    const rawData  = typeof event.getRawData        === 'function' ? event.getRawData()        : null;
    const evtData  = typeof event.getData           === 'function' ? event.getData()           : null;

    console.log('[user_confirmation] source:', source, '| action:', action, '| entityId:', entityId);
    console.log('[user_confirmation] getData:', JSON.stringify(evtData));
    console.log('[user_confirmation] getRawData:', JSON.stringify(rawData));

    // ── 1. Extract event payload ─────────────────────────────────────────────
    // Catalyst Signals-style events nest data inside rawData.events[0].data.
    // The standard event methods (getSource, getData, getSourceEntityId) return
    // null for this trigger type — rawData is the only reliable source.
    const eventPayload = rawData && Array.isArray(rawData.events) && rawData.events[0]
      ? rawData.events[0].data
      : null;
    const eventApiName = rawData && Array.isArray(rawData.events) && rawData.events[0]
      ? (rawData.events[0].event_config && rawData.events[0].event_config.api_name)
      : null;

    console.log('[user_confirmation] eventApiName:', eventApiName, '| eventPayload:', JSON.stringify(eventPayload));

    // ── 2. Guard: only proceed for user_confirmed events ────────────────────
    const resolvedAction = action || eventApiName || '';
    if (resolvedAction && !String(resolvedAction).toLowerCase().includes('confirm')) {
      console.log(`[user_confirmation] Action "${resolvedAction}" is not a confirmation event. Skipping.`);
      return context.closeWithSuccess();
    }

    // ── 3. Resolve catalyst user ID ─────────────────────────────────────────
    // Priority:
    //   a) getSourceEntityId()          — standard UserManagement events
    //   b) getData().user_id            — some SDK versions
    //   c) rawData.events[0].data.user_id — Signals-style payload (this project)
    let catalystUserId =
      entityId ||
      (evtData       && evtData.user_id)       ||
      (eventPayload  && eventPayload.user_id)  ||
      null;

    if (!catalystUserId) {
      console.warn('[user_confirmation] Could not determine catalyst_user_id from event. Skipping.');
      return context.closeWithSuccess();
    }

    catalystUserId = String(catalystUserId);

    // ── 4. Resolve user email ────────────────────────────────────────────────
    let userEmail =
      (evtData      && evtData.email_id)      ||
      (eventPayload && eventPayload.email_id) ||
      null;
    if (!userEmail) {
      try {
        const umUser = await app.userManagement().getUserDetails(catalystUserId);
        userEmail = umUser.email_id;
      } catch (umErr) {
        console.warn('[user_confirmation] Could not fetch user email from UserManagement:', umErr.message);
      }
    }

    // Don't log raw email (PII) — just confirm we have one for routing.
    console.log(`[user_confirmation] Processing confirmation for catalystUserId=${catalystUserId} hasEmail=${!!userEmail}`);

    // ── 5. Fetch matching row from users table ───────────────────────────────
    const zcql = app.zcql();
    let result = await zcql.executeZCQLQuery(
      `SELECT ROWID, status, tenant_id, name, email FROM users WHERE catalyst_user_id = ${catalystUserId} LIMIT 1`
    );
    console.log('[user_confirmation] ZCQL by catalyst_user_id result:', JSON.stringify(result));

    // Fallback: look up by email if catalyst_user_id lookup returned nothing
    if ((!result || result.length === 0) && userEmail) {
      result = await zcql.executeZCQLQuery(
        `SELECT ROWID, status, tenant_id, name, email FROM users WHERE email = '${userEmail}' LIMIT 1`
      );
      console.log('[user_confirmation] ZCQL by email result:', JSON.stringify(result));
    }

    if (!result || result.length === 0) {
      console.warn(`[user_confirmation] No user row found for catalyst_user_id=${catalystUserId} or email=${userEmail}. Skipping.`);
      return context.closeWithSuccess();
    }

    const userRow   = result[0].users;
    const rowId     = userRow.ROWID;
    const oldStatus = userRow.status;
    const tenantId  = userRow.tenant_id;
    const userName  = userRow.name  || (userEmail ? userEmail.split('@')[0] : 'there');
    const sendTo    = userRow.email || userEmail;

    // Avoid unnecessary write if already ACTIVE
    if (oldStatus === 'ACTIVE') {
      console.log(`[user_confirmation] User ${userEmail} (ROWID=${rowId}) is already ACTIVE. Skipping.`);
      return context.closeWithSuccess();
    }

    // ── 5. Update status → ACTIVE ────────────────────────────────────────────
    const datastore  = app.datastore();
    const usersTable = datastore.table('users');

    await usersTable.updateRow({ ROWID: rowId, status: 'ACTIVE' });
    console.log(`[user_confirmation] User ${userEmail} (ROWID=${rowId}) status updated: ${oldStatus} → ACTIVE`);

    // ── 6. Write audit log ───────────────────────────────────────────────────
    try {
      const auditTable = datastore.table('audit_logs');
      await auditTable.insertRow({
        tenant_id:    String(tenantId ?? ''),
        entity_type:  'USER',
        entity_id:    String(rowId),
        action:       'STATUS_CHANGE',
        old_value:    JSON.stringify({ status: oldStatus ?? 'INVITED' }),
        new_value:    JSON.stringify({ status: 'ACTIVE' }),
        performed_by: String(rowId),
      });
      console.log(`[user_confirmation] Audit log written for user ${userEmail} (ROWID=${rowId})`);
    } catch (auditErr) {
      // Audit failure must NOT prevent the status update being considered successful
      console.error('[user_confirmation] Audit log insert failed (non-fatal):', auditErr.message);
    }

    // ── 7. Welcome email ─────────────────────────────────────────────────────
    // Fires once: only on the INVITED → ACTIVE transition (we've already
    // returned early above if the user was ACTIVE). Failures must NOT mark
    // the event as failed — Catalyst will retry the whole function and we'd
    // end up double-emailing the user.
    if (sendTo) {
      try {
        // The SPA lives under {APP_URL}/app/#/<tenantSlug>/<route>. We look up
        // the tenant's slug to build a working deep-link; if the lookup fails
        // we fall back to {APP_URL}/app/#/ and the SPA can route the user to
        // their default tenant after login.
        let tenantSlug = '';
        if (tenantId) {
          try {
            const tRows = await zcql.executeZCQLQuery(
              `SELECT slug FROM tenants WHERE ROWID = ${tenantId} LIMIT 1`,
            );
            tenantSlug = tRows?.[0]?.tenants?.slug || '';
          } catch (slugErr) {
            console.warn('[user_confirmation] Could not look up tenant slug:', slugErr.message);
          }
        }

        const APP_URL  = (process.env.APP_URL || 'https://delivery-sync-60040289923.development.catalystserverless.in').replace(/\/$/, '');
        const slugPart = tenantSlug ? `/${String(tenantSlug).replace(/^\/+|\/+$/g, '')}` : '';
        const appUrl   = `${APP_URL}/app/#${slugPart}/dashboard`;

        const fromEmail = process.env.FROM_EMAIL || 'catalystadmin@dsv360.ai';
        // Normalise so any of "dev"/"DEV"/"Development"/"development" all map to
        // the same dev/staging branch and only "production" suppresses the banner.
        const envRaw    = String(process.env.ENVIRONMENT || 'development').trim().toLowerCase();
        const isProd    = envRaw === 'production' || envRaw === 'prod';
        const envLabel  = isProd ? 'PROD' : envRaw.toUpperCase();

        const subject  = isProd
          ? `Welcome to DSV OpsPulse, ${userName.split(' ')[0]}!`
          : `[${envLabel}] Welcome to DSV OpsPulse, ${userName.split(' ')[0]}!`;
        const htmlBody = welcomeEmailHtml({ name: userName, appUrl, envLabel, isProd });

        await app.email().sendMail({
          from_email: fromEmail,
          to_email:   [sendTo],
          subject,
          content:    htmlBody,
          html_mode:  true,
        });
        console.log(`[user_confirmation] Welcome email sent to ${sendTo} | env=${envLabel} appUrl=${appUrl}`);
      } catch (mailErr) {
        console.error('[user_confirmation] Welcome email send FAILED (non-fatal):', mailErr.message);
      }
    } else {
      console.warn('[user_confirmation] Welcome email skipped: no recipient email available.');
    }

    return context.closeWithSuccess();

  } catch (err) {
    console.error('[user_confirmation] Event function failed:', err.message, err.stack);
    return context.closeWithFailure();
  }
};

// ─── Welcome email template ────────────────────────────────────────────────────
//
// Inline HTML — table-based for broad mail-client support (Outlook still doesn't
// render flexbox). Visual language matches the rest of the product's transactional
// emails (see asset_service NotificationService._base).

function welcomeEmailHtml({ name, appUrl, envLabel = 'PROD', isProd = true }) {
  // Escape the dynamic name so a user with HTML in their display name can't
  // inject markup into the email body.
  const safeName = String(name || 'there').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);

  const features = [
    ['Projects & Sprints', 'Track delivery with kanban boards, sprint planning and burndown.'],
    ['Standups & EOD',     'Daily status check-ins, blockers, and end-of-day summaries.'],
    ['Time & Leave',       'Log billable hours, request leave and manage attendance.'],
    ['AI Insights',        'On-demand performance analysis, sprint reviews and next-step suggestions.'],
    ['Assets',             'Request, approve and track every device assigned to your team.'],
  ];

  const featureRows = features.map(([title, body]) => `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid #f3f4f6;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td valign="top" width="28">
              <div style="width:22px;height:22px;border-radius:6px;background:#eef2ff;color:#4f46e5;font-weight:700;font-size:12px;line-height:22px;text-align:center;">&#10003;</div>
            </td>
            <td style="padding-left:10px;">
              <div style="font-size:14px;font-weight:600;color:#111827;line-height:1.4;">${title}</div>
              <div style="font-size:13px;color:#6b7280;line-height:1.55;margin-top:2px;">${body}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to DSV OpsPulse</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;color:#f3f4f6;font-size:1px;">Your account is active — sign in to start collaborating with your team.</div>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

        ${isProd ? '' : `
        <!-- Non-prod environment banner — only rendered when ENVIRONMENT != production -->
        <tr>
          <td style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:10px 14px;margin-bottom:10px;text-align:center;">
            <div style="font-size:12px;font-weight:700;letter-spacing:1.5px;color:#92400e;text-transform:uppercase;">
              &#9888;&nbsp; ${envLabel} environment &mdash; this is a test message
            </div>
          </td>
        </tr>
        <tr><td style="height:12px;line-height:12px;font-size:0;">&nbsp;</td></tr>
        `}

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 50%,#ec4899 100%);border-radius:14px 14px 0 0;padding:36px 32px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:rgba(255,255,255,0.75);text-transform:uppercase;margin-bottom:8px;">DSV OpsPulse</div>
            <div style="font-size:26px;font-weight:700;color:#ffffff;line-height:1.25;">Welcome aboard, ${safeName}! &#x1F44B;</div>
            <div style="font-size:14px;color:rgba(255,255,255,0.9);margin-top:8px;line-height:1.5;">Your account is now active. Let's get you to your dashboard.</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:32px;">
            <p style="font-size:15px;color:#374151;margin:0 0 8px;line-height:1.55;">
              We're glad to have you here. DSV OpsPulse is your single workspace for project delivery,
              team operations and people insights — everything you need to ship calmly.
            </p>

            <!-- CTA -->
            <div style="text-align:center;margin:28px 0 8px;">
              <a href="${appUrl}" style="display:inline-block;background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#ffffff;font-size:15px;font-weight:600;padding:14px 36px;border-radius:10px;text-decoration:none;letter-spacing:0.2px;box-shadow:0 4px 12px rgba(79,70,229,0.25);">
                Open OpsPulse &nbsp;&rarr;
              </a>
              <div style="font-size:12px;color:#9ca3af;margin-top:10px;">
                Or paste this link in your browser:<br />
                <a href="${appUrl}" style="color:#4f46e5;text-decoration:none;word-break:break-all;">${appUrl}</a>
              </div>
            </div>

            <!-- Feature list -->
            <div style="font-size:12px;font-weight:700;color:#9ca3af;letter-spacing:1.5px;text-transform:uppercase;margin:32px 0 4px;">What you can do</div>
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              ${featureRows}
            </table>

            <p style="font-size:13px;color:#6b7280;margin:24px 0 0;line-height:1.6;">
              Need a hand? Your tenant admin can update permissions, invite teammates, and configure modules from the Admin panel.
              If anything looks off, reply to this email and we'll help out.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 14px 14px;padding:22px 32px;text-align:center;">
            <div style="font-size:12px;color:#9ca3af;line-height:1.6;">
              You received this welcome email because you just confirmed your DSV OpsPulse account.<br />
              &copy; ${new Date().getFullYear()} DSV. All rights reserved.
            </div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
