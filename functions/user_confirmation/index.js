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

    console.log(`[user_confirmation] Processing confirmation for catalystUserId=${catalystUserId} email=${userEmail}`);

    // ── 5. Fetch matching row from users table ───────────────────────────────
    const zcql = app.zcql();
    let result = await zcql.executeZCQLQuery(
      `SELECT ROWID, status, tenant_id FROM users WHERE catalyst_user_id = ${catalystUserId} LIMIT 1`
    );
    console.log('[user_confirmation] ZCQL by catalyst_user_id result:', JSON.stringify(result));

    // Fallback: look up by email if catalyst_user_id lookup returned nothing
    if ((!result || result.length === 0) && userEmail) {
      result = await zcql.executeZCQLQuery(
        `SELECT ROWID, status, tenant_id FROM users WHERE email = '${userEmail}' LIMIT 1`
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

    return context.closeWithSuccess();

  } catch (err) {
    console.error('[user_confirmation] Event function failed:', err.message, err.stack);
    return context.closeWithFailure();
  }
};
