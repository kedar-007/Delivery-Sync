'use strict';

const DataStoreService = require('../services/DataStoreService');
const ResponseHelper = require('../utils/ResponseHelper');
const { TABLES, USER_STATUS } = require('../utils/Constants');

/**
 * AuthMiddleware – resolves the Catalyst Auth session to a Delivery Sync user
 * and attaches `req.currentUser` and `req.tenantId` to every request.
 *
 * Architecture decision:
 *  - Catalyst Auth issues the token; we do NOT re-implement auth ourselves.
 *  - We maintain a shadow `users` table that stores DS-specific metadata
 *    (role, tenant_id, status) keyed on the Catalyst user's email.
 *  - On every request the Catalyst SDK verifies the session cookie/header and
 *    returns the Catalyst user object. We then look up our users table.
 */
class AuthMiddleware {
  /**
   * Express middleware: authenticate + resolve tenant.
   * Attaches req.currentUser and req.tenantId on success.
   */
  static async authenticate(req, res, next) {
    try {
      if (!req.catalystApp) {
        return ResponseHelper.unauthorized(res, 'Authentication required');
      }

      // 1. Get Catalyst Auth user from the session
      let catalystUser;
      try {
        const userManagement = req.catalystApp.userManagement();
        catalystUser = await userManagement.getCurrentUser();
        // console.log("CURRENT USER C--",catalystUser);
      } catch (err) {
        return ResponseHelper.unauthorized(res, 'Invalid or expired session');
      }

      if (!catalystUser || !catalystUser.email_id) {
        return ResponseHelper.unauthorized(res, 'Could not resolve authenticated user');
      }

      // 2. Look up the user in our users table
      const db = new DataStoreService(req.catalystApp);
      const userEmail = catalystUser.email_id.toLowerCase();
      // console.log("QUERY--",`SELECT * FROM ${TABLES.USERS} WHERE email = '${DataStoreService.escape(userEmail)}' LIMIT 1`);

      // Check Catalyst-level role before hitting the DB
      const catalystRoleName = (catalystUser.role_details && catalystUser.role_details.role_name) || '';
      const isSuperAdmin = catalystRoleName === 'SUPER_ADMIN';

      const rows = await db.query(
        `SELECT * FROM ${TABLES.USERS} WHERE email = '${DataStoreService.escape(userEmail)}' LIMIT 1`
      );

      // SUPER_ADMIN users may not have a row in the DS users table — allow through
      if (rows.length === 0) {
        if (isSuperAdmin) {
          req.currentUser = {
            id: String(catalystUser.user_id),
            email: userEmail,
            name: catalystUser.first_name
              ? `${catalystUser.first_name} ${catalystUser.last_name || ''}`.trim()
              : userEmail,
            role: 'SUPER_ADMIN',
            tenantId: '',
            tenantName: '',
            tenantSlug: '',
            status: 'ACTIVE',
          };
          req.tenantId = '';
          return next();
        }
        return ResponseHelper.forbidden(res,
          'User account not set up. Please contact your tenant administrator.');
      }

      const user = rows[0];
      // console.log('[AuthMiddleware] raw user row keys:', Object.keys(user));
      // console.log('[AuthMiddleware] raw user row:', JSON.stringify(user));

      if (user.status === USER_STATUS.INACTIVE) {
        return ResponseHelper.forbidden(res, 'Your account has been deactivated.');
      }

      // 3. Attach to request context
      // SUPER_ADMIN always wins regardless of DB row value.
      // For other roles: only use Catalyst role if it matches a known app role.
      const KNOWN_ROLES = ['TENANT_ADMIN', 'DELIVERY_LEAD', 'TEAM_MEMBER', 'PMO', 'EXEC', 'CLIENT'];
      const resolvedRole = isSuperAdmin
        ? 'SUPER_ADMIN'
        : (catalystRoleName && KNOWN_ROLES.includes(catalystRoleName)) ? catalystRoleName : user.role;

      // Fetch tenant info for sidebar display + suspension check
      // Split into two queries: first get lightweight columns (name/domain/status),
      // then fetch settings only when tenant is suspended (TEXT column can be large).
      let tenantName = '';
      let tenantSlug = '';
      let tenantStatus = 'ACTIVE';
      try {
        const tenantRows = await db.query(
          `SELECT name, slug, status FROM ${TABLES.TENANTS} WHERE ROWID = '${user.tenant_id}' LIMIT 1`
        );
        if (tenantRows.length > 0) {
          const tenant = tenantRows[0];
          tenantName = tenant.name || '';
          tenantSlug = tenant.slug || '';
          tenantStatus = tenant.status || 'ACTIVE';
        }
      } catch (_) {}

      // If tenant is suspended or cancelled, block access and return lock details
      if (tenantStatus === 'SUSPENDED' || tenantStatus === 'CANCELLED') {
        let lockInfo = {};
        try {
          const settingsRows = await db.query(
            `SELECT settings FROM ${TABLES.TENANTS} WHERE ROWID = '${user.tenant_id}' LIMIT 1`
          );
          if (settingsRows.length > 0) {
            const parsed = JSON.parse(settingsRows[0].settings || '{}');
            lockInfo = parsed.lockInfo || {};
          }
        } catch (_) {}
        return res.status(403).json({
          success: false,
          code: 'TENANT_SUSPENDED',
          message: 'Organisation access is suspended.',
          suspension: {
            status: tenantStatus,
            tenantName,
            reason: lockInfo.reason || null,
            lockType: lockInfo.lockType || null,
            lockedAt: lockInfo.lockedAt || null,
            unlockDate: lockInfo.unlockDate || null,
          },
        });
      }

      req.currentUser = {
        id: String(user.ROWID),
        email: user.email,
        name: user.name,
        role: resolvedRole,
        tenantId: String(user.tenant_id),
        tenantName,
        tenantSlug,
        status: user.status,
        avatarUrl: user.avatar_url || user.avtar_url || '',
      };
      req.tenantId = String(user.tenant_id);

      next();
    } catch (err) {
      console.error('[AuthMiddleware]', err.message);
      return ResponseHelper.serverError(res, 'Authentication error');
    }
  }

  /**
   * Lightweight middleware for cron/internal routes that run under Catalyst
   * service credentials (not end-user sessions). Validates the request came
   * from Catalyst Cron by checking the special header.
   */
  static authenticateCron(req, res, next) {
    // Catalyst Cron requests contain 'x-zoho-catalyst-is-cron' header
    const isCron = req.headers['x-zoho-catalyst-is-cron'] === 'true';
    const isInternal = req.headers['x-delivery-sync-internal'] === process.env.INTERNAL_SECRET;

    if (!isCron && !isInternal) {
      return ResponseHelper.forbidden(res, 'Cron endpoint: unauthorized caller');
    }
    next();
  }
}

module.exports = AuthMiddleware;
