/**
 * user_confirmation — Zoho Catalyst Event Function
 *
 * Triggered by the UserManagement event when a user confirms their account.
 *
 * What it does:
 *  1. Validates the event payload (is_confirmed must be true)
 *  2. Looks up the user row in the `users` table by catalyst_user_id
 *  3. Updates the user's status from INVITED → ACTIVE
 *  4. Writes a structured audit log entry to `audit_logs`
 *
 * @param {import('./types/event').EventDetails} event
 * @param {import('./types/event').Context} context
 */

const catalyst = require('zcatalyst-sdk-node');

module.exports = async (event, context) => {
  try {
    const app       = catalyst.initialize(context);
    const datastore = app.datastore();
    const zcql      = app.zcql();

	console.log("EVENT DATA ---",event);

    const userDetails = event.getData();
    console.log('[user_confirmation] event data:', JSON.stringify(userDetails));

    // ── 1. Guard: only proceed for confirmed users ───────────────────────────
    if (!userDetails || userDetails.is_confirmed !== true) {
      console.log('[user_confirmation] Not a confirmed-user event. Skipping.');
      return context.closeWithSuccess();
    }

    const { user_id, email_id } = userDetails;

    if (!user_id) {
      console.warn('[user_confirmation] user_id missing in event payload. Skipping.');
      return context.closeWithSuccess();
    }

    // ── 2. Fetch matching row from users table ───────────────────────────────
    const fetchQuery = `
      SELECT ROWID, status, tenant_id
      FROM users
      WHERE catalyst_user_id = ${user_id}
      LIMIT 1
    `;

    const result = await zcql.executeZCQLQuery(fetchQuery);
    console.log('[user_confirmation] ZCQL result:', JSON.stringify(result));

    if (!result || result.length === 0) {
      console.warn(`[user_confirmation] No user row found for catalyst_user_id=${user_id}. Skipping.`);
      return context.closeWithSuccess();
    }

    const userRow   = result[0].users;
    const rowId     = userRow.ROWID;
    const oldStatus = userRow.status;
    const tenantId  = userRow.tenant_id;

    // Avoid unnecessary write if already ACTIVE
    if (oldStatus === 'ACTIVE') {
      console.log(`[user_confirmation] User ${email_id} is already ACTIVE. Skipping update.`);
      return context.closeWithSuccess();
    }

    // ── 3. Update status → ACTIVE ────────────────────────────────────────────
    const usersTable = datastore.table('users');

    const updated = await usersTable.updateRow({
      ROWID:  rowId,
      status: 'ACTIVE',
    });

    console.log(`[user_confirmation] User ${email_id} status updated: ${oldStatus} → ACTIVE`, updated);

    // ── 4. Write audit log ───────────────────────────────────────────────────
    try {
      const auditTable = datastore.table('audit_logs');

      await auditTable.insertRow({
        tenant_id:   String(tenantId  ?? ''),
        entity_type: 'USER',
        entity_id:   String(rowId),
        action:      'STATUS_CHANGE',
        old_value:   JSON.stringify({ status: oldStatus ?? 'INVITED' }),
        new_value:   JSON.stringify({ status: 'ACTIVE' }),
        performed_by: String(rowId),   // system action performed in context of the user
      });

      console.log(`[user_confirmation] Audit log written for user ${email_id} (ROWID=${rowId})`);
    } catch (auditErr) {
      // Audit failure must NOT prevent the status update from being considered successful
      console.error('[user_confirmation] Audit log insert failed (non-fatal):', auditErr.message);
    }

    return context.closeWithSuccess();

  } catch (err) {
    console.error('[user_confirmation] Event function failed:', err.message, err.stack);
    return context.closeWithFailure();
  }
};
