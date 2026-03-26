'use strict';
const DataStoreService = require('../services/DataStoreService');
const AuditService     = require('../services/AuditService');
const ResponseHelper   = require('../utils/ResponseHelper');
const { TABLES, AUDIT_ACTION } = require('../utils/Constants');

class FeatureFlagController {
  constructor(catalystApp) {
    this.db    = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
  }

  async list(req, res) {
    const flags = await this.db.findWhere(TABLES.FEATURE_FLAGS, req.tenantId, '', { orderBy: 'feature_name ASC', limit: 100 });
    return ResponseHelper.success(res, flags);
  }

  async create(req, res) {
    const { feature_name, is_enabled, config, enabled_for_roles, enabled_for_users } = req.body;
    if (!feature_name) return ResponseHelper.validationError(res, 'feature_name required');
    const existing = await this.db.findWhere(TABLES.FEATURE_FLAGS, req.tenantId, `feature_name = '${DataStoreService.escape(feature_name)}'`, { limit: 1 });
    if (existing.length > 0) return ResponseHelper.conflict(res, 'Feature flag already exists');
    const row = await this.db.insert(TABLES.FEATURE_FLAGS, {
      tenant_id: req.tenantId, feature_name,
      is_enabled: is_enabled ? 'true' : 'false',
      config: config ? JSON.stringify(config) : '{}',
      enabled_for_roles: enabled_for_roles ? JSON.stringify(enabled_for_roles) : '[]',
      enabled_for_users: enabled_for_users ? JSON.stringify(enabled_for_users) : '[]',
      updated_by: req.currentUser.id,
    });
    return ResponseHelper.created(res, row);
  }

  async update(req, res) {
    const flags = await this.db.findWhere(TABLES.FEATURE_FLAGS, req.tenantId, `feature_name = '${DataStoreService.escape(req.params.flagName)}'`, { limit: 1 });
    if (flags.length === 0) return ResponseHelper.notFound(res, 'Feature flag not found');
    const flag = flags[0];
    const updates = { updated_by: req.currentUser.id };
    if (req.body.is_enabled !== undefined) updates.is_enabled = req.body.is_enabled ? 'true' : 'false';
    if (req.body.config !== undefined)     updates.config = JSON.stringify(req.body.config);
    if (req.body.enabled_for_roles)        updates.enabled_for_roles = JSON.stringify(req.body.enabled_for_roles);
    if (req.body.enabled_for_users)        updates.enabled_for_users = JSON.stringify(req.body.enabled_for_users);
    const updated = await this.db.update(TABLES.FEATURE_FLAGS, { ROWID: flag.ROWID, ...updates });
    await this.audit.log({ tenantId: req.tenantId, entityType: 'FEATURE_FLAG', entityId: flag.ROWID, action: AUDIT_ACTION.UPDATE, oldValue: flag, newValue: updates, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, updated);
  }

  // GET /api/config/features/enabled — for client-side feature checks
  async enabled(req, res) {
    const flags = await this.db.findWhere(TABLES.FEATURE_FLAGS, req.tenantId, `is_enabled = 'true'`, { limit: 100 });
    const me    = req.currentUser;
    const active = flags.filter(f => {
      try {
        const roles = JSON.parse(f.enabled_for_roles || '[]');
        const users = JSON.parse(f.enabled_for_users || '[]');
        if (roles.length === 0 && users.length === 0) return true;
        return roles.includes(me.role) || users.includes(me.id);
      } catch { return true; }
    });
    return ResponseHelper.success(res, active.map(f => f.feature_name));
  }
}

module.exports = FeatureFlagController;
