'use strict';

const DataStoreService = require('../services/DataStoreService');
const CacheService = require('../services/CacheService');
const ResponseHelper = require('../utils/ResponseHelper');
const { TABLES, USER_STATUS } = require('../utils/Constants');

// Single TTL for the unified auth-context cache. Kept short (5 min) so that
// admin permission changes propagate quickly even when explicit invalidation
// is missed.
//
// COST NOTE: Catalyst Cache pricing is per-call (₹2.4 / 2k gets, ₹3.6 / 6k
// puts beyond the free tier). The original design did 6 cache calls per
// authenticated request — that scaled to ~₹2,300/month at moderate load.
// This unified key collapses to 1 cache call per request (+ 1 put per TTL
// window per user), which is roughly 6× cheaper while keeping the same
// DB-reduction benefit. The single get replaces 6 DataStore queries.
const AUTH_CTX_TTL_HOURS = 1 / 12; // 5 minutes
const AUTH_CTX_KEY_VERSION = 'v1'; // bump to bust the cache on schema changes

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
    // Shared cache instance — used to short-circuit slow-changing lookups
    // (tenant info, org role permissions, sharing rules, etc.). All ops
    // degrade gracefully if cache is unavailable; the middleware still
    // works exactly as before.
    let cache = null;
    try {
      if (!req.catalystApp) {
        return ResponseHelper.unauthorized(res, 'Authentication required');
      }
      cache = new CacheService(req.catalystApp);

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
        return res.status(403).json({
          success: false,
          code: 'USER_DEACTIVATED',
          message: 'Your account has been deactivated. Please contact your administrator.',
        });
      }

      // Invited TENANT_ADMIN with no org yet (tenant_id='0') — legacy safety fallback
      if (
        user.role === 'TENANT_ADMIN' &&
        user.status === 'INVITED' &&
        (!user.tenant_id || String(user.tenant_id) === '0')
      ) {
        return res.status(403).json({
          success: false,
          code: 'NEEDS_ORG_SETUP',
          message: 'Please set up your organisation to continue.',
        });
      }

      // INVITED user with a real org — auto-activate on first login
      // Catalyst's invite link already verified the email; accepting the invite = active
      if (user.status === 'INVITED' && user.tenant_id && String(user.tenant_id) !== '0') {
        try {
          await db.update(TABLES.USERS, { ROWID: String(user.ROWID), status: USER_STATUS.ACTIVE });
          user.status = USER_STATUS.ACTIVE;
        } catch (activateErr) {
          console.warn('[AuthMiddleware] auto-activate failed:', activateErr.message);
        }
      }

      // ── 2b. Try the unified auth-context cache (1 cache call, replaces 6) ──
      //   Stores the fully-resolved req.currentUser + tenantId together. On a
      //   hit we skip all the tenant/role/permission lookups below.
      //   Invalidation:
      //     - user role change      → AdminController/OrgRolesController clears this key
      //     - user override change  → same
      //     - role permission change→ relies on TTL (5 min) — iterating all
      //       members of a role to invalidate is more expensive than the wait
      const authCtxKey = `authCtx:${AUTH_CTX_KEY_VERSION}:${String(user.ROWID)}`;
      try {
        const cachedCtx = await cache.get(authCtxKey);
        if (cachedCtx && cachedCtx.currentUser && cachedCtx.tenantId) {
          req.currentUser = cachedCtx.currentUser;
          req.tenantId    = cachedCtx.tenantId;
          return next();
        }
      } catch (_) {
        // Cache outage — fall through to the DB path.
      }

      // 3. Attach to request context
      // SUPER_ADMIN always wins regardless of DB row value.
      // For other roles: only use Catalyst role if it matches a known app role.
      const resolvedRole = isSuperAdmin ? 'SUPER_ADMIN' : user.role;

      // Fetch tenant info for sidebar display + suspension check
      // Split into two queries: first get lightweight columns (name/domain/status),
      // then fetch settings only when tenant is suspended (TEXT column can be large).
      let tenantName = '';
      let tenantSlug = '';
      let tenantStatus = 'ACTIVE';
      let botEnabled = true;
      // Tenant info — direct DB call (the unified authCtx cache above already
      // short-circuited if this was a warm session). Caching this separately
      // would add a second cache call per request and double our cache cost.
      try {
        const tenantRows = await db.query(
          `SELECT name, slug, status, settings FROM ${TABLES.TENANTS} WHERE ROWID = '${user.tenant_id}' LIMIT 1`
        );
        if (tenantRows.length > 0) {
          const tenant = tenantRows[0];
          tenantName   = tenant.name   || '';
          tenantSlug   = tenant.slug   || '';
          tenantStatus = tenant.status || 'ACTIVE';
          try {
            const ts = JSON.parse(tenant.settings || '{}');
            botEnabled = ts.botEnabled !== false;
          } catch (_) {}
        }
      } catch (_) {}

      // TENANT_ADMIN with a stale tenant_id (tenant was deleted) — treat as needing org setup.
      // This prevents an infinite redirect loop: /org-setup shows the form, but setupOrganisation
      // would reject with 'conflict' because tenant_id != '0'. Catching it here sends the
      // correct NEEDS_ORG_SETUP signal so the frontend shows the creation form and the
      // endpoint allows the user to create a fresh org.
      if (
        user.role === 'TENANT_ADMIN' &&
        user.tenant_id && String(user.tenant_id) !== '0' &&
        !tenantSlug
      ) {
        return res.status(403).json({
          success: false,
          code: 'NEEDS_ORG_SETUP',
          message: 'Please set up your organisation to continue.',
        });
      }

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
        botEnabled,
      };
      req.tenantId = String(user.tenant_id);

      // 4. Load org role assignment, permissions, and individual overrides
      const { ROLE_PERMISSIONS, PERMISSIONS } = require('../utils/Constants');
      let orgRoleId = null;
      let orgRoleName = null;
      let orgRolePermissions = [];
      let orgModuleAccess = [];
      let dataScope = null;
      if (!isSuperAdmin && user.tenant_id) {
        try {
          const userId = String(user.ROWID);
          const tenantId = String(user.tenant_id);

          let assignment = await db.query(
            `SELECT org_role_id FROM ${TABLES.USER_ORG_ROLES} WHERE tenant_id = '${tenantId}' AND user_id = '${userId}' AND is_active != 'false' LIMIT 1`
          );
          // Fallback: tenant_id stored with precision loss (Number() rounding on old records) — query by user_id only
          if (assignment.length === 0) {
            assignment = await db.query(
              `SELECT org_role_id FROM ${TABLES.USER_ORG_ROLES} WHERE user_id = '${userId}' AND is_active != 'false' LIMIT 1`
            );
          }

          if (assignment.length > 0) {
            orgRoleId = String(assignment[0].org_role_id);

            // These three queries are all keyed off the same `orgRoleId`
            // and none depend on each other — run them in parallel instead
            // of serially. Same DB cost, ~3× faster cold auth latency.
            const [orgRoleRows, permsRows, scopeRows] = await Promise.all([
              db.query(
                `SELECT name FROM ${TABLES.ORG_ROLES} WHERE ROWID = '${orgRoleId}' LIMIT 1`
              ),
              db.query(
                `SELECT permissions FROM ${TABLES.ORG_ROLE_PERMISSIONS} WHERE tenant_id = '${tenantId}' AND org_role_id = '${orgRoleId}' LIMIT 1`
              ),
              db.query(
                `SELECT visibility_scope FROM ${TABLES.ORG_SHARING_RULES} WHERE tenant_id = '${tenantId}' AND role_id = '${orgRoleId}' AND visibility_scope != 'EXPLICIT' AND is_active = 'true' LIMIT 1`
              ),
            ]);

            if (orgRoleRows.length > 0) orgRoleName = orgRoleRows[0].name;

            if (permsRows.length > 0) {
              // Supports both legacy array format and new object format { p: [...], m: [...] }
              try {
                const parsedPerms = JSON.parse(permsRows[0].permissions || '[]');
                if (Array.isArray(parsedPerms)) {
                  orgRolePermissions = parsedPerms;
                } else if (parsedPerms && typeof parsedPerms === 'object') {
                  orgRolePermissions = Array.isArray(parsedPerms.p) ? parsedPerms.p : [];
                  orgModuleAccess    = Array.isArray(parsedPerms.m) ? parsedPerms.m : [];
                }
              } catch (_) {}
            }

            if (scopeRows.length > 0) dataScope = scopeRows[0].visibility_scope;
          }
        } catch (orgErr) {
          console.error('[AuthMiddleware] org role lookup failed:', orgErr.message);
        }
      }

      // 5. Build effective permissions = base (org role or system role) + individual overrides
      //    Then auto-derive dataScope from permissions when no explicit sharing rule exists.
      let effectivePermissions = [];
      try {
        const userId = String(user.ROWID);
        const tenantId = String(user.tenant_id);
        const isFullAdmin = isSuperAdmin || resolvedRole === 'TENANT_ADMIN';
        let roleBase = isFullAdmin ? Object.values(PERMISSIONS) : (ROLE_PERMISSIONS[resolvedRole] || []);
        // AI perms carve-out: when a user has an explicit org-role assignment,
        // the org-role is authoritative for AI permissions even if the user's
        // system role is TENANT_ADMIN. This is what makes "Self+Team only" stick
        // for a Delivery Lead who happens to be TENANT_ADMIN at the Catalyst layer.
        // SUPER_ADMIN keeps the bypass (system-level, not tenant-scoped).
        const AI_GATED = new Set(['AI_INSIGHTS', 'AI_PERFORMANCE_SELF', 'AI_PERFORMANCE', 'AI_TEAM_ANALYSIS']);
        if (orgRoleId && !isSuperAdmin) {
          roleBase = roleBase.filter((p) => !AI_GATED.has(p));
        }
        const base = new Set([...roleBase, ...(orgRoleId ? orgRolePermissions : [])]);
        // Per-user permission overrides — direct DB call. The unified
        // authCtx cache above short-circuits this whole path on a warm session.
        const overrideRows = await db.query(
          `SELECT permissions FROM ${TABLES.PERMISSION_OVERRIDES} WHERE tenant_id = '${tenantId}' AND user_id = '${userId}' AND is_active = 'true' LIMIT 1`
        );
        if (overrideRows.length > 0) {
          const parsed = JSON.parse(overrideRows[0].permissions || '{}');
          (parsed.granted || []).forEach((p) => base.add(p));
          (parsed.revoked || []).forEach((p) => base.delete(p));
          // Merge per-user module disables on top of org role's module disables
          const userModuleAccess = parsed.moduleAccess || [];
          if (userModuleAccess.length > 0) {
            const merged = new Set([...orgModuleAccess, ...userModuleAccess]);
            orgModuleAccess = Array.from(merged);
          }
          if (parsed.officeLocationId) {
            req.currentUser.officeLocationId = String(parsed.officeLocationId);
          }
        }
        effectivePermissions = Array.from(base);

        // TENANT_ADMIN always gets ORG_WIDE data scope regardless of org role assignment
        if (isFullAdmin) {
          dataScope = 'ORG_WIDE';
        }
        // Note: dataScope=null means no sharing rule is configured → controllers default to OWN_DATA (membership-based).
        // Do NOT auto-derive ORG_WIDE from any permission — ORG_ROLE_READ means "can view role definitions",
        // not "can see all org data". Explicit sharing rules are the only source of ORG_WIDE scope.
      } catch (permErr) {
        console.error('[AuthMiddleware] effective permissions build failed:', permErr.message);
      }

      console.log(`[AuthMiddleware] final currentUser: id=${String(user.ROWID)} role=${resolvedRole} orgRoleId=${orgRoleId} orgRoleName=${orgRoleName} effectivePerms=${effectivePermissions.length} dataScope=${dataScope}`);
      req.currentUser.orgRoleId = orgRoleId;
      req.currentUser.orgRoleName = orgRoleName;
      req.currentUser.orgRolePermissions = orgRolePermissions;
      req.currentUser.moduleAccess = orgModuleAccess; // disabled sidebar module keys for this org role
      req.currentUser.permissions = effectivePermissions; // full effective permissions for this request
      req.currentUser.dataScope = dataScope; // ORG_WIDE | OWN_DATA | ROLE_PEERS | SUBORDINATES | null

      // ── Write the unified auth-context cache ───────────────────────────
      // ONE put per user per TTL window replaces the 6 DataStore queries
      // above on every subsequent request. Cache misses (this branch) cost
      // 1 put; cache hits (the get above) cost 1 get. Total: 6 DB → 1 cache.
      try {
        await cache.set(authCtxKey, {
          currentUser: req.currentUser,
          tenantId:    req.tenantId,
        }, AUTH_CTX_TTL_HOURS);
      } catch (_) {
        // Cache write failure is non-fatal — the request completes normally,
        // the next request will just have to re-do the DB work.
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
