'use strict';

const ResponseHelper = require('../utils/ResponseHelper');
const { ROLE_PERMISSIONS, PERMISSIONS, TABLES } = require('../utils/Constants');
const DataStoreService = require('../services/DataStoreService');

/**
 * RBACMiddleware – role-based access control with per-user permission overrides.
 *
 * Permission resolution order:
 *   1. Start with ROLE_PERMISSIONS[user.role]
 *   2. Add any `granted` permissions from permission_overrides table
 *   3. Remove any `revoked` permissions from permission_overrides table
 *
 * This allows admins to grant extra permissions (e.g. ATTENDANCE_ADMIN to a
 * TEAM_MEMBER) or revoke role defaults without changing the user's role.
 */

/**
 * Fetch per-user permission overrides from the DB.
 * Returns { granted: string[], revoked: string[] }
 * Result is cached on req._permOverrides to avoid repeat queries per request.
 */
async function getUserOverrides(req) {
  if (req._permOverrides !== undefined) return req._permOverrides;
  try {
    const db = new DataStoreService(req.catalystApp);
    const rows = await db.query(
      `SELECT permissions FROM ${TABLES.PERMISSION_OVERRIDES} ` +
      `WHERE tenant_id = '${req.currentUser.tenantId}' ` +
      `AND user_id = '${req.currentUser.id}' AND is_active = 'true' LIMIT 1`
    );
    if (rows.length === 0) {
      req._permOverrides = { granted: [], revoked: [] };
    } else {
      const parsed = JSON.parse(rows[0].permissions || '{}');
      req._permOverrides = {
        granted: parsed.granted || [],
        revoked: parsed.revoked || [],
      };
    }
  } catch (_) {
    req._permOverrides = { granted: [], revoked: [] };
  }
  return req._permOverrides;
}

/** Compute effective permissions for the current user.
 *
 * Resolution order:
 *   - TENANT_ADMIN / SUPER_ADMIN          → system role permissions (all)
 *   - User has org role assigned          → ONLY org role permissions (sole source)
 *   - User has NO org role (plain member) → base TEAM_MEMBER system-role permissions
 *   + per-user grants/revokes on top in all cases
 */
async function effectivePermissions(req) {
  const user = req.currentUser;
  // AuthMiddleware already computed the full effective permissions (org role + individual
  // overrides). Use them directly to avoid a second DB round-trip and any divergence.
  if (Array.isArray(user.permissions) && user.permissions.length > 0) {
    console.log(`[RBACMiddleware] effectivePermissions user=${user.id} role=${user.role} orgRoleId=${user.orgRoleId} precomputed=${user.permissions.length}`);
    return new Set(user.permissions);
  }
  // Fallback for edge cases where AuthMiddleware didn't populate permissions
  const isFullAdmin = user.role === 'TENANT_ADMIN' || user.role === 'SUPER_ADMIN';
  const basePerms = isFullAdmin
    ? Object.values(PERMISSIONS)
    : user.orgRoleId
      ? (user.orgRolePermissions || [])
      : (ROLE_PERMISSIONS[user.role] || []);
  const base = new Set(basePerms);
  const { granted, revoked } = await getUserOverrides(req);
  granted.forEach((p) => base.add(p));
  revoked.forEach((p) => base.delete(p));
  console.log(`[RBACMiddleware] effectivePermissions user=${user.id} role=${user.role} orgRoleId=${user.orgRoleId} basePerms=${basePerms.length} totalEffective=${base.size}`);
  return base;
}

class RBACMiddleware {
  /**
   * Returns Express middleware that enforces a permission check.
   * @param {string} permission  One of PERMISSIONS.*
   */
  static require(permission) {
    return async (req, res, next) => {
      const user = req.currentUser;
      if (!user) return ResponseHelper.unauthorized(res);
      try {
        const allowed = await effectivePermissions(req);
        if (!allowed.has(permission)) {
          return ResponseHelper.forbidden(res,
            `Your role (${user.role}) does not have permission: ${permission}`);
        }
        next();
      } catch (err) {
        console.error('[RBACMiddleware]', err.message);
        return ResponseHelper.serverError(res, 'Authorisation check failed');
      }
    };
  }

  /**
   * Returns Express middleware that enforces at least ONE of the listed permissions.
   */
  static requireAny(...permissions) {
    return async (req, res, next) => {
      const user = req.currentUser;
      if (!user) return ResponseHelper.unauthorized(res);
      try {
        const allowed = await effectivePermissions(req);
        const hasAny = permissions.some((p) => allowed.has(p));
        if (!hasAny) {
          return ResponseHelper.forbidden(res,
            `Your role (${user.role}) requires one of: ${permissions.join(', ')}`);
        }
        next();
      } catch (err) {
        return ResponseHelper.serverError(res, 'Authorisation check failed');
      }
    };
  }

  /**
   * Returns Express middleware that verifies the authenticated user is a
   * member of the project specified in req.params.projectId or req.body.project_id.
   *
   * Bypass roles: TENANT_ADMIN, PMO (they have cross-project visibility).
   */
  static requireProjectMember() {
    return async (req, res, next) => {
      const user = req.currentUser;
      if (!user) return ResponseHelper.unauthorized(res);

      // Bypass for admin roles and org-role users with org-wide data scope
      if (user.role === 'TENANT_ADMIN' || user.role === 'PMO' || user.role === 'EXEC'
          || user.dataScope === 'ORG_WIDE' || user.dataScope === 'SUBORDINATES') {
        return next();
      }

      const projectId =
        req.params.projectId ||
        req.body.project_id ||
        req.query.projectId;

      if (!projectId) {
        // No project context – pass through (controller will handle)
        return next();
      }

      try {
        const db = new DataStoreService(req.catalystApp);
        const rows = await db.query(
          `SELECT ROWID FROM ${TABLES.PROJECT_MEMBERS} ` +
          `WHERE tenant_id = '${user.tenantId}' ` +
          `AND project_id = '${DataStoreService.escape(projectId)}' ` +
          `AND user_id = '${user.id}' LIMIT 1`
        );

        if (rows.length === 0) {
          return ResponseHelper.forbidden(res, 'You are not a member of this project');
        }

        next();
      } catch (err) {
        console.error('[RBACMiddleware] Project membership check failed:', err.message);
        return ResponseHelper.serverError(res, 'Authorisation check failed');
      }
    };
  }

  /**
   * Ensures the authenticated user is a TENANT_ADMIN or has ADMIN_USERS permission
   * (which org roles like CEO can grant).
   */
  static requireAdmin() {
    return async (req, res, next) => {
      if (!req.currentUser) return ResponseHelper.unauthorized(res);
      if (req.currentUser.role === 'TENANT_ADMIN' || req.currentUser.role === 'SUPER_ADMIN') {
        return next();
      }
      try {
        const allowed = await effectivePermissions(req);
        if (allowed.has(PERMISSIONS.ADMIN_USERS)) return next();
      } catch (_) {}
      return ResponseHelper.forbidden(res, 'Admin access required');
    };
  }
}

module.exports = RBACMiddleware;
