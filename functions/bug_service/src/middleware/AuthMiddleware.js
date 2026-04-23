'use strict';

const { TABLES } = require('../utils/Constants');
const ResponseHelper = require('../utils/ResponseHelper');

class AuthMiddleware {
  /**
   * authenticate — full auth, requires valid session + user record + bug reporting enabled.
   */
  static async authenticate(req, res, next) {
    console.log(`[BugAuth] Step 1 — checking catalystApp initialisation`);
    try {
      if (!req.catalystApp) {
        console.warn('[BugAuth] Step 1 ✗ — catalystApp is null (missing Catalyst session)');
        return ResponseHelper.unauthorized(res, 'Authentication required');
      }
      console.log('[BugAuth] Step 1 ✓ — catalystApp present');

      // Step 2: resolve Catalyst user from session
      console.log('[BugAuth] Step 2 — resolving Catalyst session user');
      let catalystUser;
      try {
        catalystUser = await req.catalystApp.userManagement().getCurrentUser();
      } catch (err) {
        console.warn('[BugAuth] Step 2 ✗ — getCurrentUser failed:', err.message);
        return ResponseHelper.unauthorized(res, 'Invalid or expired session');
      }

      if (!catalystUser?.email_id) {
        console.warn('[BugAuth] Step 2 ✗ — session resolved but email_id missing');
        return ResponseHelper.unauthorized(res, 'Could not resolve authenticated user');
      }
      console.log(`[BugAuth] Step 2 ✓ — Catalyst user resolved: ${catalystUser.email_id}`);

      // Step 2b: check if this is a Catalyst platform super admin (not an org user)
      const SUPER_ADMIN_ROLE_ID = process.env.CATALYST_ROLE_SUPER_ADMIN || '17682000001011209';
      const roleId = String(catalystUser?.role_details?.role_id ?? '');
      const isCatalystSuperAdmin = roleId === SUPER_ADMIN_ROLE_ID;

      if (isCatalystSuperAdmin) {
        console.log(`[BugAuth] Step 2b ✓ — Catalyst super admin detected (role_id=${roleId}), bypassing DataStore lookup`);
        req.currentUser = {
          id:       String(catalystUser.user_id || ''),
          email:    catalystUser.email_id,
          name:     catalystUser.display_name || catalystUser.email_id,
          role:     'SUPER_ADMIN',
          tenantId: '',
          status:   'ACTIVE',
        };
        return next();
      }

      // Step 3: look up user record in DataStore
      const email = catalystUser.email_id.toLowerCase().replace(/'/g, "''");
      console.log(`[BugAuth] Step 3 — fetching user record from DataStore for email=${email}`);
      let rows;
      try {
        const raw = await req.catalystApp.zcql().executeZCQLQuery(
          `SELECT ROWID, tenant_id, name, email, role, status FROM ${TABLES.USERS}
           WHERE email = '${email}' LIMIT 1`
        );
        rows = (raw || []).map((r) => Object.assign({}, ...Object.values(r)));
      } catch (dbErr) {
        console.error('[BugAuth] Step 3 ✗ — DB query failed:', dbErr.message);
        return ResponseHelper.serverError(res, 'Authentication error');
      }

      if (rows.length === 0) {
        console.warn(`[BugAuth] Step 3 ✗ — no user record found for email=${email}`);
        return ResponseHelper.forbidden(res, 'User account not configured.');
      }

      const user = rows[0];
      console.log(`[BugAuth] Step 3 ✓ — user found: ROWID=${user.ROWID} role=${user.role} status=${user.status}`);

      if (user.status === 'INACTIVE') {
        console.warn(`[BugAuth] Step 3 ✗ — account is INACTIVE for ROWID=${user.ROWID}`);
        return ResponseHelper.forbidden(res, 'Your account has been deactivated.');
      }

      // Step 3b: check bug_report_config enabled flag for tenant
      console.log(`[BugAuth] Step 3b — checking bug reporting enabled for tenant=${user.tenant_id}`);
      try {
        const configRaw = await req.catalystApp.zcql().executeZCQLQuery(
          `SELECT enabled FROM ${TABLES.BUG_REPORT_CONFIG}
           WHERE tenant_id = '${String(user.tenant_id).replace(/'/g, "''")}' LIMIT 1`
        );
        const configRows = (configRaw || []).map((r) => Object.assign({}, ...Object.values(r)));
        if (configRows.length > 0) {
          const enabledVal = configRows[0].enabled;
          // Catalyst DataStore stores booleans as strings; treat explicit 'false'/false as disabled
          const isDisabled =
            enabledVal === false ||
            String(enabledVal).toLowerCase() === 'false';
          if (isDisabled) {
            console.warn(`[BugAuth] Step 3b ✗ — bug reporting disabled for tenant=${user.tenant_id}`);
            return ResponseHelper.forbidden(res, 'Bug reporting is not enabled for your organisation.');
          }
        }
        console.log(`[BugAuth] Step 3b ✓ — bug reporting is enabled`);
      } catch (err) {
        console.warn('[BugAuth] Step 3b — could not read bug_report_config (allowing):', err.message);
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
      console.log(`[BugAuth] Step 4 ✓ — request authenticated: userId=${req.currentUser.id} tenantId=${req.currentUser.tenantId}`);

      next();
    } catch (err) {
      console.error('[BugAuth] Unexpected error:', err.message, err.stack);
      return ResponseHelper.serverError(res, 'Authentication error');
    }
  }

  /**
   * authenticateOptional — attaches currentUser if a valid session exists,
   * but always calls next() even when unauthenticated (for allow_anonymous flows).
   */
  static async authenticateOptional(req, res, next) {
    console.log(`[BugAuth] authenticateOptional — attempting optional auth`);
    try {
      if (!req.catalystApp) {
        console.log('[BugAuth] authenticateOptional — no catalystApp, proceeding anonymously');
        return next();
      }

      let catalystUser;
      try {
        catalystUser = await req.catalystApp.userManagement().getCurrentUser();
      } catch (_) {
        console.log('[BugAuth] authenticateOptional — no valid session, proceeding anonymously');
        return next();
      }

      if (!catalystUser?.email_id) {
        console.log('[BugAuth] authenticateOptional — session has no email, proceeding anonymously');
        return next();
      }

      // Bypass DataStore for Catalyst platform super admins
      const SUPER_ADMIN_ROLE_ID_OPT = process.env.CATALYST_ROLE_SUPER_ADMIN || '17682000001011209';
      const roleIdOpt = String(catalystUser?.role_details?.role_id ?? '');
      if (roleIdOpt === SUPER_ADMIN_ROLE_ID_OPT) {
        req.currentUser = {
          id:       String(catalystUser.user_id || ''),
          email:    catalystUser.email_id,
          name:     catalystUser.display_name || catalystUser.email_id,
          role:     'SUPER_ADMIN',
          tenantId: '',
          status:   'ACTIVE',
        };
        return next();
      }

      const email = catalystUser.email_id.toLowerCase().replace(/'/g, "''");
      let rows;
      try {
        const raw = await req.catalystApp.zcql().executeZCQLQuery(
          `SELECT ROWID, tenant_id, name, email, role, status FROM ${TABLES.USERS}
           WHERE email = '${email}' LIMIT 1`
        );
        rows = (raw || []).map((r) => Object.assign({}, ...Object.values(r)));
      } catch (_) {
        console.log('[BugAuth] authenticateOptional — DB lookup failed, proceeding anonymously');
        return next();
      }

      if (rows.length > 0 && rows[0].status !== 'INACTIVE') {
        const user = rows[0];
        req.currentUser = {
          id:       String(user.ROWID),
          email:    user.email,
          name:     user.name,
          role:     user.role,
          tenantId: String(user.tenant_id),
          status:   user.status,
        };
        console.log(`[BugAuth] authenticateOptional ✓ — attached user: userId=${req.currentUser.id}`);
      } else {
        console.log('[BugAuth] authenticateOptional — user not found or inactive, proceeding anonymously');
      }

      next();
    } catch (err) {
      console.warn('[BugAuth] authenticateOptional — unexpected error (proceeding anonymously):', err.message);
      next();
    }
  }
}

module.exports = AuthMiddleware;
