'use strict';

const ResponseHelper = require('../utils/ResponseHelper');
const { ROLE_PERMISSIONS, TABLES } = require('../utils/Constants');
const DataStoreService = require('../services/DataStoreService');

class RBACMiddleware {
  static require(permission) {
    return (req, res, next) => {
      const user = req.currentUser;
      if (!user) return ResponseHelper.unauthorized(res);
      const allowed = Array.isArray(user.permissions) && user.permissions.length > 0
        ? user.permissions
        : (ROLE_PERMISSIONS[user.role] || []);
      if (!allowed.includes(permission)) {
        return ResponseHelper.forbidden(res,
          `Your role (${user.role}) does not have permission: ${permission}`);
      }
      next();
    };
  }

  static requireAny(...permissions) {
    return (req, res, next) => {
      const user = req.currentUser;
      if (!user) return ResponseHelper.unauthorized(res);
      const allowed = Array.isArray(user.permissions) && user.permissions.length > 0
        ? user.permissions
        : (ROLE_PERMISSIONS[user.role] || []);
      if (!permissions.some((p) => allowed.includes(p))) {
        return ResponseHelper.forbidden(res,
          `Your role (${user.role}) requires one of: ${permissions.join(', ')}`);
      }
      next();
    };
  }

  static requireProjectMember() {
    return async (req, res, next) => {
      const user = req.currentUser;
      if (!user) return ResponseHelper.unauthorized(res);
      if (user.role === 'TENANT_ADMIN' || user.role === 'PMO' || user.role === 'EXEC'
          || user.dataScope === 'ORG_WIDE' || user.dataScope === 'SUBORDINATES') {
        return next();
      }
      const projectId = req.params.projectId || req.body.project_id || req.query.projectId;
      if (!projectId) return next();
      try {
        const db = new DataStoreService(req.catalystApp);
        const rows = await db.query(
          `SELECT ROWID FROM ${TABLES.PROJECT_MEMBERS} ` +
          `WHERE tenant_id = '${user.tenantId}' ` +
          `AND project_id = '${DataStoreService.escape(projectId)}' ` +
          `AND user_id = '${user.id}' LIMIT 1`
        );
        if (rows.length === 0) return ResponseHelper.forbidden(res, 'You are not a member of this project');
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
      const user = req.currentUser;
      if (user.role === 'TENANT_ADMIN' || user.role === 'SUPER_ADMIN') return next();
      const allowed = Array.isArray(user.permissions) ? user.permissions : [];
      if (allowed.includes('ADMIN_USERS')) return next();
      return ResponseHelper.forbidden(res, 'Admin access required');
    };
  }
}

module.exports = RBACMiddleware;
