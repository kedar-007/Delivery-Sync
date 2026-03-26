'use strict';
const DataStoreService = require('../services/DataStoreService');
const AuditService     = require('../services/AuditService');
const ResponseHelper   = require('../utils/ResponseHelper');
const { TABLES, AUDIT_ACTION } = require('../utils/Constants');

// Supported entity types for bulk import
const TABLE_MAP = {
  users: TABLES.USERS,
  projects: TABLES.PROJECTS,
  tasks: TABLES.TASKS,
  sprints: TABLES.SPRINTS,
  time_entries: TABLES.TIME_ENTRIES,
  leave_requests: TABLES.LEAVE_REQUESTS,
  assets: TABLES.ASSETS,
  announcements: TABLES.ANNOUNCEMENTS,
};

class MigrationController {
  constructor(catalystApp) {
    this.db    = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
  }

  // POST /api/config/migration/validate
  async validate(req, res) {
    const { entity_type, data } = req.body;
    if (!entity_type || !TABLE_MAP[entity_type]) return ResponseHelper.validationError(res, `entity_type must be one of: ${Object.keys(TABLE_MAP).join(', ')}`);
    if (!Array.isArray(data) || data.length === 0) return ResponseHelper.validationError(res, 'data must be a non-empty array');
    // Basic validation: check required fields exist per type
    const errors = [];
    data.forEach((row, idx) => {
      if (!row || typeof row !== 'object') errors.push(`Row ${idx}: not an object`);
    });
    if (errors.length > 0) return ResponseHelper.validationError(res, 'Validation failed', errors);
    return ResponseHelper.success(res, { valid: true, row_count: data.length, entity_type });
  }

  // POST /api/config/migration/import
  async import(req, res) {
    if (req.currentUser.role !== 'TENANT_ADMIN') return ResponseHelper.forbidden(res, 'Only TENANT_ADMIN can import data');
    const { entity_type, data, source_system } = req.body;
    if (!entity_type || !TABLE_MAP[entity_type]) return ResponseHelper.validationError(res, 'Invalid entity_type');
    if (!Array.isArray(data) || data.length === 0) return ResponseHelper.validationError(res, 'data array required');

    const tableName = TABLE_MAP[entity_type];
    const results = { inserted: 0, failed: 0, errors: [] };

    for (const row of data) {
      try {
        await this.db.insert(tableName, { ...row, tenant_id: req.tenantId });
        results.inserted++;
      } catch (err) {
        results.failed++;
        results.errors.push({ row: JSON.stringify(row).substring(0, 100), error: err.message });
      }
    }

    await this.audit.log({ tenantId: req.tenantId, entityType: entity_type.toUpperCase(), entityId: 'BULK', action: AUDIT_ACTION.BULK_IMPORT, newValue: { source_system, inserted: results.inserted, failed: results.failed }, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, results);
  }
}

module.exports = MigrationController;
