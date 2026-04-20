'use strict';

const ResponseHelper = require('../utils/ResponseHelper');
const { ROLE_PERMISSIONS, TABLES } = require('../utils/Constants');
const DataStoreService = require('../services/DataStoreService');

/**
 * RBACMiddleware – role-based access control with per-user permission overrides.
 * See delivery_sync_function/src/middleware/RBACMiddleware.js for full docs.
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

async function effectivePermissions(req) {
  const user = req.currentUser;
  if (Array.isArray(user.permissions) && user.permissions.length > 0) {
    return new Set(user.permissions);
  }
  // Fallback: recompute when AuthMiddleware didn't populate permissions
  const isFullAdmin = user.role === 'TENANT_ADMIN' || user.role === 'SUPER_ADMIN';
  const base = new Set(isFullAdmin ? Object.values(require('../utils/Constants').PERMISSIONS || {}) : (ROLE_PERMISSIONS[user.role] || []));
  const { granted, revoked } = await getUserOverrides(req);
  granted.forEach((p) => base.add(p));
  revoked.forEach((p) => base.delete(p));
  return base;
}

class RBACMiddleware {
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

  static requireProjectMember() {
    return async (req, res, next) => {
      const user = req.currentUser;
      if (!user) return ResponseHelper.unauthorized(res);

      if (user.role === 'TENANT_ADMIN' || user.role === 'PMO' || user.role === 'EXEC') {
        return next();
      }

      const projectId =
        req.params.projectId ||
        req.body.project_id ||
        req.query.projectId;

      if (!projectId) return next();

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
