'use strict';

const DataStoreService = require('./DataStoreService');
const { TABLES } = require('../utils/Constants');

/**
 * AuditService – writes structured audit log entries.
 */
class AuditService {
  constructor(dataStoreService) {
    this.db = dataStoreService;
  }

  /**
   * Write an audit log entry.
   * NOTE: performed_at is omitted — we rely on Catalyst's CREATEDTIME instead
   * to avoid column-type mismatches (datetime vs text).
   */
  async log({ tenantId, entityType, entityId, action, oldValue = null, newValue = null, performedBy }) {
    try {
      await this.db.insert(TABLES.AUDIT_LOGS, {
        tenant_id: tenantId,
        entity_type: entityType,
        entity_id: String(entityId),
        action,
        old_value: oldValue ? JSON.stringify(oldValue) : '',
        new_value: newValue ? JSON.stringify(newValue) : '',
        performed_by: String(performedBy),
      });
    } catch (err) {
      console.error('[AuditService] Failed to write audit log:', err.message);
    }
  }

  /**
   * Retrieve filtered audit logs for a tenant, enriched with performer name/email.
   * Supports filters: action, entityType, performedBy (user ROWID), dateFrom, dateTo.
   */
  async getFilteredLogs(tenantId, { action, entityType, performedBy, dateFrom, dateTo, limit = 100 } = {}) {
    const conditions = [];
    if (action) conditions.push(`action = '${DataStoreService.escape(action)}'`);
    if (entityType) conditions.push(`entity_type = '${DataStoreService.escape(entityType)}'`);
    if (performedBy) conditions.push(`performed_by = '${DataStoreService.escape(performedBy)}'`);
    if (dateFrom) conditions.push(`CREATEDTIME >= '${DataStoreService.escape(dateFrom)}'`);
    if (dateTo) conditions.push(`CREATEDTIME <= '${DataStoreService.escape(dateTo)}'`);

    const logs = await this.db.findWhere(
      TABLES.AUDIT_LOGS,
      tenantId,
      conditions.length > 0 ? conditions.join(' AND ') : null,
      { orderBy: 'CREATEDTIME DESC', limit }
    );

    if (logs.length === 0) return [];

    // Enrich with performer name/email from users table
    const performerIds = [...new Set(logs.map(l => l.performed_by).filter(Boolean))];
    let userMap = {};
    if (performerIds.length > 0) {
      const inClause = performerIds.map(id => `'${id}'`).join(',');
      const users = await this.db.query(
        `SELECT ROWID, name, email FROM ${TABLES.USERS} WHERE ROWID IN (${inClause}) LIMIT 200`
      );
      users.forEach(u => {
        userMap[String(u.ROWID)] = { name: u.name || '', email: u.email || '' };
      });
    }

    return logs.map(l => {
      const performer = userMap[String(l.performed_by)] || {};
      return {
        id: String(l.ROWID),
        action: l.action,
        entityType: l.entity_type,
        entityId: l.entity_id,
        performedById: l.performed_by,
        performedByName: performer.name || l.performed_by,
        performedByEmail: performer.email || '',
        oldValue: l.old_value || '',
        newValue: l.new_value || '',
        createdAt: l.CREATEDTIME,
      };
    });
  }

  async getLogsForEntity(tenantId, entityType) {
    return this.getFilteredLogs(tenantId, { entityType, limit: 100 });
  }

  async getRecentLogs(tenantId, limit = 100) {
    return this.getFilteredLogs(tenantId, { limit });
  }
}

module.exports = AuditService;
