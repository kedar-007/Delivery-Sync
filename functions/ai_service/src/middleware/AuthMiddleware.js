'use strict';

const { TABLES } = require('../constants');
const ResponseHelper = require('../utils/ResponseHelper');

/**
 * AuthMiddleware — resolves the Catalyst session to a DeliverSync user and
 * attaches `req.currentUser` to the request.
 *
 * This is a read-only mirror of the pattern in delivery_sync_function —
 * both services share the same Catalyst project, user table, and session cookie.
 */
class AuthMiddleware {
  static async authenticate(req, res, next) {
    try {
      if (!req.catalystApp) {
        return ResponseHelper.unauthorized(res, 'Authentication required');
      }

      // 1. Resolve the Catalyst session → Catalyst user object
      let catalystUser;
      try {
        catalystUser = await req.catalystApp.userManagement().getCurrentUser();
      } catch (_) {
        return ResponseHelper.unauthorized(res, 'Invalid or expired session');
      }

      if (!catalystUser?.email_id) {
        return ResponseHelper.unauthorized(res, 'Could not resolve authenticated user');
      }

      // 2. Look up the user in the DS users table
      const email = catalystUser.email_id.toLowerCase().replace(/'/g, "''");
      let rows;
      try {
        const raw = await req.catalystApp.zcql().executeZCQLQuery(
          `SELECT ROWID, tenant_id, name, email, role, status FROM ${TABLES.USERS}
           WHERE email = '${email}' LIMIT 1`
        );
        rows = (raw || []).map((r) => Object.assign({}, ...Object.values(r)));
      } catch (dbErr) {
        console.error('[AuthMiddleware] DB error:', dbErr.message);
        return ResponseHelper.serverError(res, 'Authentication error');
      }

      if (rows.length === 0) {
        return ResponseHelper.forbidden(res, 'User account not configured. Contact your administrator.');
      }

      const user = rows[0];
      if (user.status === 'INACTIVE') {
        return ResponseHelper.forbidden(res, 'Your account has been deactivated.');
      }

      // 3. Resolve role — prefer Catalyst role if it's a known DS role
      const role = user.role;

      req.currentUser = {
        id:       String(user.ROWID),
        email:    user.email,
        name:     user.name,
        role,
        tenantId: String(user.tenant_id),
        status:   user.status,
      };

      next();
    } catch (err) {
      console.error('[AuthMiddleware] Unexpected error:', err.message);
      return ResponseHelper.serverError(res, 'Authentication error');
    }
  }
}

module.exports = AuthMiddleware;
