'use strict';

const DataStoreService = require('../services/DataStoreService');
const CacheService = require('../services/CacheService');

// Service-scoped auth-context cache. 5-min TTL bounds the staleness window
// for role / permission changes — bump the version on shape changes.
const AUTH_CTX_TTL_HOURS    = 1 / 12;
const AUTH_CTX_KEY_VERSION  = 'v1';
const AUTH_CTX_SERVICE_NAME = 'tasks';
const ResponseHelper = require('../utils/ResponseHelper');
const { TABLES, USER_STATUS, PERMISSIONS, ROLE_PERMISSIONS } = require('../utils/Constants');

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

      const rows = await db.query(
        `SELECT * FROM ${TABLES.USERS} WHERE email = '${DataStoreService.escape(userEmail)}' LIMIT 1`
      );

      if (rows.length === 0) {
        // First-time login: create a bare user record so they can onboard
        return ResponseHelper.forbidden(res,
          'User account not set up. Please contact your tenant administrator.');
      }

      const user = rows[0];
      // console.log('[AuthMiddleware] raw user row keys:', Object.keys(user));
      // console.log('[AuthMiddleware] raw user row:', JSON.stringify(user));

      if (user.status === USER_STATUS.INACTIVE) {
        return ResponseHelper.forbidden(res, 'Your account has been deactivated.');
      }

      // ── Service-scoped auth-context cache (skips the 4 lookups below) ──
      const cache       = new CacheService(req.catalystApp);
      const authCtxKey  = `authCtx:${AUTH_CTX_SERVICE_NAME}:${AUTH_CTX_KEY_VERSION}:${String(user.ROWID)}`;
      try {
        const cachedCtx = await cache.get(authCtxKey);
        if (cachedCtx && cachedCtx.currentUser && cachedCtx.tenantId !== undefined) {
          req.currentUser = cachedCtx.currentUser;
          req.tenantId    = cachedCtx.tenantId;
          return next();
        }
      } catch (_) {
        // Cache outage — fall through to the DB path.
      }

      // 3. Attach to request context
      // Only use Catalyst role if it matches one of our known app roles.
      // "App Administrator" / "App User" are Catalyst system roles — fall back to DB role.
      const resolvedRole = user.role;

      // Fetch tenant name for sidebar display
      let tenantName = '';
      let tenantSlug = '';
      try {
        const tenantRows = await db.query(
          `SELECT name, slug FROM ${TABLES.TENANTS} WHERE ROWID = '${user.tenant_id}' LIMIT 1`
        );
        if (tenantRows.length > 0) {
          tenantName = tenantRows[0].name || '';
          tenantSlug = tenantRows[0].slug || '';
        }
      } catch (_) {}

      req.currentUser = {
        id: String(user.ROWID),
        email: user.email,
        name: user.name,
        role: resolvedRole,
        tenantId: String(user.tenant_id),
        tenantName,
        tenantSlug,
        status: user.status,
      };
      req.tenantId = String(user.tenant_id);

      // 4. Load org role + dataScope (mirrors delivery_sync_function AuthMiddleware)
      const isSuperAdmin = resolvedRole === 'SUPER_ADMIN';
      const isFullAdmin = isSuperAdmin || resolvedRole === 'TENANT_ADMIN';
      let orgRoleId = null;
      let orgRolePermissions = [];
      let dataScope = null;
      const userId = String(user.ROWID);
      const tenantId = String(user.tenant_id);

      if (!isFullAdmin && user.tenant_id) {
        try {
          const assignment = await db.query(
            `SELECT org_role_id FROM ${TABLES.USER_ORG_ROLES} WHERE tenant_id = '${tenantId}' AND user_id = '${userId}' AND is_active = 'true' LIMIT 1`
          );
          if (assignment.length > 0) {
            orgRoleId = String(assignment[0].org_role_id);
            const permsRows = await db.query(
              `SELECT permissions FROM ${TABLES.ORG_ROLE_PERMISSIONS} WHERE tenant_id = '${tenantId}' AND org_role_id = '${orgRoleId}' LIMIT 1`
            );
            if (permsRows.length > 0) {
              // Supports both formats:
              //   legacy: ["PERM1","PERM2",...]
              //   new:    { p: ["PERM1",...], m: ["module-key",...] }
              // The new object form broke the spread `[...orgRolePermissions]`
              // a few lines below, surfacing as a generic "Authentication error".
              try {
                const parsed = JSON.parse(permsRows[0].permissions || '[]');
                if (Array.isArray(parsed)) orgRolePermissions = parsed;
                else if (parsed && typeof parsed === 'object') orgRolePermissions = Array.isArray(parsed.p) ? parsed.p : [];
              } catch (_) { orgRolePermissions = []; }
            }

            const scopeRows = await db.query(
              `SELECT visibility_scope FROM ${TABLES.ORG_SHARING_RULES} WHERE tenant_id = '${tenantId}' AND role_id = '${orgRoleId}' AND visibility_scope != 'EXPLICIT' AND is_active = 'true' LIMIT 1`
            );
            if (scopeRows.length > 0) dataScope = scopeRows[0].visibility_scope;
          }
        } catch (_) {}
      }

      // Build effective permissions and auto-derive dataScope if needed
      try {
        const roleBase = isFullAdmin ? Object.values(PERMISSIONS || {}) : (ROLE_PERMISSIONS ? (ROLE_PERMISSIONS[resolvedRole] || []) : []);
        const base = new Set([...roleBase, ...(orgRoleId ? orgRolePermissions : [])]);
        const overrideRows = await db.query(
          `SELECT permissions FROM ${TABLES.PERMISSION_OVERRIDES} WHERE tenant_id = '${tenantId}' AND user_id = '${userId}' AND is_active = 'true' LIMIT 1`
        );
        if (overrideRows.length > 0) {
          const parsed = JSON.parse(overrideRows[0].permissions || '{}');
          (parsed.granted || []).forEach((p) => base.add(p));
          (parsed.revoked || []).forEach((p) => base.delete(p));
        }
        if (!dataScope && PERMISSIONS && base.has(PERMISSIONS.ORG_ROLE_READ)) {
          dataScope = 'ORG_WIDE';
        }
        req.currentUser.permissions = Array.from(base);
      } catch (_) {}

      req.currentUser.orgRoleId = orgRoleId;
      req.currentUser.dataScope = dataScope;

      // ── Write to cache so subsequent requests skip the lookups above ──
      try {
        await cache.set(authCtxKey, {
          currentUser: req.currentUser,
          tenantId:    req.tenantId,
        }, AUTH_CTX_TTL_HOURS);
      } catch (_) {}

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
