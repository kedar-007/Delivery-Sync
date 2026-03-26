'use strict';
const DataStoreService = require('../services/DataStoreService');
const AuditService     = require('../services/AuditService');
const ResponseHelper   = require('../utils/ResponseHelper');
const { TABLES, ROLE_PERMISSIONS, PERMISSIONS, AUDIT_ACTION } = require('../utils/Constants');

class PermissionController {
  constructor(catalystApp) {
    this.db    = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
  }

  async matrix(req, res) {
    const overrides = await this.db.findWhere(TABLES.PERMISSION_OVERRIDES, req.tenantId, `is_active = 'true'`, { limit: 20 });
    const matrix = { ...ROLE_PERMISSIONS };
    for (const o of overrides) {
      try { matrix[o.role] = JSON.parse(o.permissions); } catch { /* ignore */ }
    }
    return ResponseHelper.success(res, { matrix, all_permissions: Object.values(PERMISSIONS) });
  }

  async getRole(req, res) {
    const { role } = req.params;
    const override = await this.db.findWhere(TABLES.PERMISSION_OVERRIDES, req.tenantId, `role = '${DataStoreService.escape(role)}' AND is_active = 'true'`, { limit: 1 });
    const perms = override.length > 0 ? JSON.parse(override[0].permissions || '[]') : (ROLE_PERMISSIONS[role] || []);
    return ResponseHelper.success(res, { role, permissions: perms, is_overridden: override.length > 0 });
  }

  async overrideRole(req, res) {
    const { role }       = req.params;
    const { permissions, reason } = req.body;
    if (!permissions) return ResponseHelper.validationError(res, 'permissions array required');

    const existing = await this.db.findWhere(TABLES.PERMISSION_OVERRIDES, req.tenantId, `role = '${DataStoreService.escape(role)}' AND is_active = 'true'`, { limit: 1 });
    if (existing.length > 0) {
      await this.db.update(TABLES.PERMISSION_OVERRIDES, { ROWID: existing[0].ROWID, permissions: JSON.stringify(permissions), reason: reason || '', overridden_by: req.currentUser.id });
    } else {
      await this.db.insert(TABLES.PERMISSION_OVERRIDES, { tenant_id: req.tenantId, role, permissions: JSON.stringify(permissions), reason: reason || '', overridden_by: req.currentUser.id, is_active: 'true' });
    }
    await this.audit.log({ tenantId: req.tenantId, entityType: 'PERMISSION_OVERRIDE', entityId: role, action: AUDIT_ACTION.UPDATE, newValue: { role, permissions }, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, { message: 'Role permissions updated' });
  }

  async grantProject(req, res) {
    const { project_id, user_id, permissions } = req.body;
    if (!project_id || !user_id || !permissions) return ResponseHelper.validationError(res, 'project_id, user_id and permissions required');
    const existing = await this.db.findWhere(TABLES.PROJECT_PERMISSIONS, req.tenantId, `project_id = '${DataStoreService.escape(project_id)}' AND user_id = '${DataStoreService.escape(user_id)}'`, { limit: 1 });
    if (existing.length > 0) {
      await this.db.update(TABLES.PROJECT_PERMISSIONS, { ROWID: existing[0].ROWID, permissions: JSON.stringify(permissions), granted_by: req.currentUser.id });
    } else {
      await this.db.insert(TABLES.PROJECT_PERMISSIONS, { tenant_id: req.tenantId, project_id, user_id, permissions: JSON.stringify(permissions), granted_by: req.currentUser.id });
    }
    return ResponseHelper.success(res, { message: 'Project permissions granted' });
  }

  async revokeProject(req, res) {
    const override = await this.db.findById(TABLES.PROJECT_PERMISSIONS, req.params.overrideId, req.tenantId);
    if (!override) return ResponseHelper.notFound(res, 'Project permission not found');
    await this.db.delete(TABLES.PROJECT_PERMISSIONS, req.params.overrideId);
    return ResponseHelper.success(res, { message: 'Project permission revoked' });
  }
}

module.exports = PermissionController;
