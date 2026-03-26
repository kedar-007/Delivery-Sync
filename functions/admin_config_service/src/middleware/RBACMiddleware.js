'use strict';

const ResponseHelper = require('../utils/ResponseHelper');
const { ROLE_PERMISSIONS, TABLES } = require('../utils/Constants');
const DataStoreService = require('../services/DataStoreService');

/**
 * RBACMiddleware – role-based access control.
 *
 * Architecture decision:
 *  - Permissions are statically defined in ROLE_PERMISSIONS.
 *  - Project-level membership checks are a secondary layer: a user must both
 *    have the right role permission AND be a member of the project they are
 *    accessing (unless they are TENANT_ADMIN or PMO).
 *  - Middleware factories return Express middleware functions so they compose
 *    cleanly in route definitions: router.get('/', auth, rbac.require('X'), handler)
 */
class RBACMiddleware {
  /**
   * Returns Express middleware that enforces a permission check.
   * @param {string} permission  One of PERMISSIONS.*
   */
  static require(permission) {
    return (req, res, next) => {
      const user = req.currentUser;
      if (!user) {
        return ResponseHelper.unauthorized(res);
      }

      const allowed = ROLE_PERMISSIONS[user.role] || [];
      if (!allowed.includes(permission)) {
        return ResponseHelper.forbidden(res,
          `Your role (${user.role}) does not have permission: ${permission}`);
      }

      next();
    };
  }

  /**
   * Returns Express middleware that enforces at least ONE of the listed permissions.
   */
  static requireAny(...permissions) {
    return (req, res, next) => {
      const user = req.currentUser;
      if (!user) return ResponseHelper.unauthorized(res);

      const allowed = ROLE_PERMISSIONS[user.role] || [];
      const hasAny = permissions.some((p) => allowed.includes(p));

      if (!hasAny) {
        return ResponseHelper.forbidden(res,
          `Your role (${user.role}) requires one of: ${permissions.join(', ')}`);
      }
      next();
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

      // Bypass for admin roles
      if (user.role === 'TENANT_ADMIN' || user.role === 'PMO' || user.role === 'EXEC') {
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
   * Ensures the authenticated user is a TENANT_ADMIN.
   */
  static requireAdmin() {
    return (req, res, next) => {
      if (!req.currentUser) return ResponseHelper.unauthorized(res);
      if (req.currentUser.role !== 'TENANT_ADMIN') {
        return ResponseHelper.forbidden(res, 'Admin access required');
      }
      next();
    };
  }
}

module.exports = RBACMiddleware;
