'use strict';

const DataStoreService = require('../services/DataStoreService');
const CacheService = require('../services/CacheService');
const ResponseHelper = require('../utils/ResponseHelper');
const { TABLES, USER_STATUS } = require('../utils/Constants');

// Service-scoped auth-context cache. Each microservice has its own copy so a
// shape change in one service can't corrupt another. 5-min TTL bounds the
// staleness window for role / permission changes — same convention as
// delivery_sync_function. Bump the version to bust the cache on a shape change.
const AUTH_CTX_TTL_HOURS    = 1 / 12; // 5 minutes
const AUTH_CTX_KEY_VERSION  = 'v1';
const AUTH_CTX_SERVICE_NAME = 'people';

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
 *
 * Performance:
 *  - After the user row lookup we check a service-scoped cache key
 *    (`authCtx:people:v1:{userId}`) that stores the fully-resolved
 *    `req.currentUser`. On a hit, the org-role / permission / sharing-rule
 *    queries below are skipped entirely — replacing 4 DataStore selects with
 *    1 cache get. Cache misses fall through to the DB path; cache failures
 *    are silent.
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

      // ── Service-scoped auth-context cache — short-circuit the 4 lookups
      //   that follow (tenant, user_org_roles, org_role_permissions,
      //   org_sharing_rules, permission_overrides). Cache miss / failure
      //   silently falls through to the DB path. Invalidation: 5-min TTL —
      //   role-permission edits propagate within that window. ──
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

      // 4. Load org role permissions + individual overrides → req.currentUser.permissions
      const { ROLE_PERMISSIONS, PERMISSIONS } = require('../utils/Constants');
      const isSuperAdmin = !!(catalystUser.role_details && catalystUser.role_details.role_name === 'SUPER_ADMIN');
      const isFullAdmin = isSuperAdmin || resolvedRole === 'TENANT_ADMIN';
      let orgRoleId = null;
      let orgRolePermissions = [];
      // moduleAccess is also stored under the same JSON column when using the
      // new object format. We don't use it in this service but we need to
      // parse it correctly so it isn't treated as if it were the permissions
      // array.
      let orgModuleAccess = [];
      let dataScope = null;
      if (!isFullAdmin && user.tenant_id) {
        try {
          const userId = String(user.ROWID);
          const tenantId = String(user.tenant_id);
          const assignment = await db.query(
            `SELECT org_role_id FROM ${TABLES.USER_ORG_ROLES} WHERE tenant_id = '${tenantId}' AND user_id = '${userId}' AND is_active = 'true' LIMIT 1`
          );
          if (assignment.length > 0) {
            orgRoleId = String(assignment[0].org_role_id);
            // Parallelize perms + sharing-rule queries — same orgRoleId, no deps.
            const [permsRows, scopeRowsParallel] = await Promise.all([
              db.query(
                `SELECT permissions FROM ${TABLES.ORG_ROLE_PERMISSIONS} WHERE tenant_id = '${tenantId}' AND org_role_id = '${orgRoleId}' LIMIT 1`
              ),
              db.query(
                `SELECT visibility_scope FROM ${TABLES.ORG_SHARING_RULES} WHERE tenant_id = '${tenantId}' AND role_id = '${orgRoleId}' AND visibility_scope != 'EXPLICIT' AND is_active = 'true' LIMIT 1`
              ),
            ]);
            if (permsRows.length > 0) {
              // Permissions column supports TWO formats:
              //  - legacy: a raw JSON array of permission strings
              //  - new:    { p: [permission strings], m: [disabled module keys] }
              // Without this dual-format handling, parsing the new format
              // returned an object that wasn't iterable, blowing up the spread
              // on line 124 and surfacing as a generic "Authentication error".
              try {
                const parsed = JSON.parse(permsRows[0].permissions || '[]');
                if (Array.isArray(parsed)) {
                  orgRolePermissions = parsed;
                } else if (parsed && typeof parsed === 'object') {
                  orgRolePermissions = Array.isArray(parsed.p) ? parsed.p : [];
                  orgModuleAccess    = Array.isArray(parsed.m) ? parsed.m : [];
                }
              } catch (_) { /* malformed JSON — fall back to empty array */ }
            }
            // scopeRowsParallel was already fetched above in Promise.all
            if (scopeRowsParallel.length > 0) dataScope = scopeRowsParallel[0].visibility_scope;
          }
        } catch (_) {}
      }
      const roleBase = isFullAdmin ? Object.values(PERMISSIONS) : (ROLE_PERMISSIONS[resolvedRole] || []);
      // Defensive: coerce to array if parsing yielded anything else, so a
      // future schema change can't surface as "not iterable" here again.
      const safeRoleBase = Array.isArray(roleBase) ? roleBase : [];
      const safeOrgPerms = (orgRoleId && Array.isArray(orgRolePermissions)) ? orgRolePermissions : [];
      const base = new Set([...safeRoleBase, ...safeOrgPerms]);
      try {
        const userId = String(user.ROWID);
        const tenantId = String(user.tenant_id);
        const overrideRows = await db.query(
          `SELECT permissions FROM ${TABLES.PERMISSION_OVERRIDES} WHERE tenant_id = '${tenantId}' AND user_id = '${userId}' AND is_active = 'true' LIMIT 1`
        );
        if (overrideRows.length > 0) {
          const parsed = JSON.parse(overrideRows[0].permissions || '{}');
          (parsed.granted || []).forEach((p) => base.add(p));
          (parsed.revoked || []).forEach((p) => base.delete(p));
          if (parsed.officeLocationId) {
            req.currentUser.officeLocationId = String(parsed.officeLocationId);
          }
        }
      } catch (_) {}
      if (isFullAdmin) dataScope = 'ORG_WIDE';
      req.currentUser.permissions = Array.from(base);
      req.currentUser.orgRoleId = orgRoleId;
      req.currentUser.dataScope = dataScope;
      req.currentUser.moduleAccess = orgModuleAccess;

      // ── Write to cache so subsequent requests skip the lookups above ──
      try {
        await cache.set(authCtxKey, {
          currentUser: req.currentUser,
          tenantId:    req.tenantId,
        }, AUTH_CTX_TTL_HOURS);
      } catch (_) {
        // Cache write failure is non-fatal — request completes normally.
      }

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
