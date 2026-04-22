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
        return res.status(403).json({
          success: false,
          code: 'USER_DEACTIVATED',
          message: 'Your account has been deactivated. Please contact your administrator.',
        });
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

      // 4. Load org role assignment, permissions, and individual overrides
      const { ROLE_PERMISSIONS, PERMISSIONS } = require('../utils/Constants');
      let orgRoleId = null;
      let orgRoleName = null;
      let orgRolePermissions = [];
      let dataScope = null;
      if (!isSuperAdmin && user.tenant_id) {
        try {
          const userId = String(user.ROWID);
          const tenantId = String(user.tenant_id);

          const assignment = await db.query(
            `SELECT org_role_id FROM ${TABLES.USER_ORG_ROLES} WHERE tenant_id = '${tenantId}' AND user_id = '${userId}' AND is_active = 'true' LIMIT 1`
          );
          console.log(`[AuthMiddleware] org role lookup for user=${userId} tenant=${tenantId}: found=${assignment.length} rows`, assignment.length > 0 ? assignment[0] : 'none');

          if (assignment.length > 0) {
            orgRoleId = String(assignment[0].org_role_id);

            const orgRoleRows = await db.query(
              `SELECT name FROM ${TABLES.ORG_ROLES} WHERE ROWID = '${orgRoleId}' LIMIT 1`
            );
            console.log(`[AuthMiddleware] org_roles lookup for roleId=${orgRoleId}: found=${orgRoleRows.length}`, orgRoleRows.length > 0 ? { name: orgRoleRows[0].name } : 'none');
            if (orgRoleRows.length > 0) orgRoleName = orgRoleRows[0].name;

            const permsRows = await db.query(
              `SELECT permissions FROM ${TABLES.ORG_ROLE_PERMISSIONS} WHERE tenant_id = '${tenantId}' AND org_role_id = '${orgRoleId}' LIMIT 1`
            );
            console.log(`[AuthMiddleware] org_role_permissions lookup for roleId=${orgRoleId}: found=${permsRows.length}`, permsRows.length > 0 ? { raw: permsRows[0].permissions } : 'none');
            if (permsRows.length > 0) {
              orgRolePermissions = JSON.parse(permsRows[0].permissions || '[]');
              console.log(`[AuthMiddleware] parsed orgRolePermissions (${orgRolePermissions.length}):`, orgRolePermissions);
            }

            // Load default data visibility scope (ORG_WIDE / OWN_DATA / ROLE_PEERS / SUBORDINATES)
            const scopeRows = await db.query(
              `SELECT visibility_scope FROM ${TABLES.ORG_SHARING_RULES} WHERE tenant_id = '${tenantId}' AND role_id = '${orgRoleId}' AND visibility_scope != 'EXPLICIT' AND is_active = 'true' LIMIT 1`
            );
            if (scopeRows.length > 0) {
              dataScope = scopeRows[0].visibility_scope;
            }
            console.log(`[AuthMiddleware] dataScope for roleId=${orgRoleId}: ${dataScope || 'none (defaults to OWN_DATA)'}`);
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
        const roleBase = isFullAdmin ? Object.values(PERMISSIONS) : (ROLE_PERMISSIONS[resolvedRole] || []);
        const base = new Set([...roleBase, ...(orgRoleId ? orgRolePermissions : [])]);
        // Apply individual grants / revokes on top
        const overrideRows = await db.query(
          `SELECT permissions FROM ${TABLES.PERMISSION_OVERRIDES} WHERE tenant_id = '${tenantId}' AND user_id = '${userId}' AND is_active = 'true' LIMIT 1`
        );
        if (overrideRows.length > 0) {
          const parsed = JSON.parse(overrideRows[0].permissions || '{}');
          (parsed.granted || []).forEach((p) => base.add(p));
          (parsed.revoked || []).forEach((p) => base.delete(p));
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
      req.currentUser.permissions = effectivePermissions; // full effective permissions for this request
      req.currentUser.dataScope = dataScope; // ORG_WIDE | OWN_DATA | ROLE_PEERS | SUBORDINATES | null

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
