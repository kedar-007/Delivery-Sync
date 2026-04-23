'use strict';

const { TABLES } = require('../utils/Constants');
const ResponseHelper = require('../utils/ResponseHelper');

class AuthMiddleware {
  static async authenticate(req, res, next) {
    console.log(`[BotAuth] Step 1 — checking catalystApp initialisation`);
    try {
      if (!req.catalystApp) {
        console.warn('[BotAuth] Step 1 ✗ — catalystApp is null (missing Catalyst session)');
        return ResponseHelper.unauthorized(res, 'Authentication required');
      }
      console.log('[BotAuth] Step 1 ✓ — catalystApp present');

      // Step 2: resolve Catalyst user from session
      console.log('[BotAuth] Step 2 — resolving Catalyst session user');
      let catalystUser;
      try {
        catalystUser = await req.catalystApp.userManagement().getCurrentUser();
      } catch (err) {
        console.warn('[BotAuth] Step 2 ✗ — getCurrentUser failed:', err.message);
        return ResponseHelper.unauthorized(res, 'Invalid or expired session');
      }

      if (!catalystUser?.email_id) {
        console.warn('[BotAuth] Step 2 ✗ — session resolved but email_id missing');
        return ResponseHelper.unauthorized(res, 'Could not resolve authenticated user');
      }
      console.log(`[BotAuth] Step 2 ✓ — Catalyst user resolved: ${catalystUser.email_id}`);

      // Step 3: look up user record in DataStore
      const email = catalystUser.email_id.toLowerCase().replace(/'/g, "''");
      console.log(`[BotAuth] Step 3 — fetching user record from DataStore for email=${email}`);
      let rows;
      try {
        const raw = await req.catalystApp.zcql().executeZCQLQuery(
          `SELECT ROWID, tenant_id, name, email, role, status FROM ${TABLES.USERS}
           WHERE email = '${email}' LIMIT 1`
        );
        rows = (raw || []).map((r) => Object.assign({}, ...Object.values(r)));
      } catch (dbErr) {
        console.error('[BotAuth] Step 3 ✗ — DB query failed:', dbErr.message);
        return ResponseHelper.serverError(res, 'Authentication error');
      }

      if (rows.length === 0) {
        console.warn(`[BotAuth] Step 3 ✗ — no user record found for email=${email}`);
        return ResponseHelper.forbidden(res, 'User account not configured.');
      }

      const user = rows[0];
      console.log(`[BotAuth] Step 3 ✓ — user found: ROWID=${user.ROWID} role=${user.role} status=${user.status}`);

      if (user.status === 'INACTIVE') {
        console.warn(`[BotAuth] Step 3 ✗ — account is INACTIVE for ROWID=${user.ROWID}`);
        return ResponseHelper.forbidden(res, 'Your account has been deactivated.');
      }

      // Step 3b: check bot_enabled flag in tenant settings
      console.log(`[BotAuth] Step 3b — checking bot_enabled for tenant=${user.tenant_id}`);
      try {
        const tenantRows = await req.catalystApp.zcql().executeZCQLQuery(
          `SELECT settings FROM ${TABLES.TENANTS} WHERE ROWID = '${user.tenant_id}' LIMIT 1`
        );
        const tr = (tenantRows || []).map((r) => Object.assign({}, ...Object.values(r)))[0];
        const ts = (() => { try { return JSON.parse(tr?.settings || '{}'); } catch (_) { return {}; } })();
        if (ts.botEnabled === false) {
          console.warn(`[BotAuth] Step 3b ✗ — bot is disabled for tenant=${user.tenant_id}`);
          return ResponseHelper.forbidden(res, 'The AI assistant is not enabled for your organisation. Contact your admin.');
        }
        console.log(`[BotAuth] Step 3b ✓ — bot is enabled`);
      } catch (err) {
        console.warn('[BotAuth] Step 3b — could not read tenant settings (allowing):', err.message);
      }

      // Step 4: attach to request
      req.currentUser = {
        id:       String(user.ROWID),
        email:    user.email,
        name:     user.name,
        role:     user.role,
        tenantId: String(user.tenant_id),
        status:   user.status,
      };
      console.log(`[BotAuth] Step 4 ✓ — request authenticated: userId=${req.currentUser.id} tenantId=${req.currentUser.tenantId}`);

      next();
    } catch (err) {
      console.error('[BotAuth] Unexpected error:', err.message, err.stack);
      return ResponseHelper.serverError(res, 'Authentication error');
    }
  }
}

module.exports = AuthMiddleware;
