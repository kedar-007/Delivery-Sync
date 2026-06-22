'use strict';

const { TABLES } = require('../utils/Constants');

class NotificationService {
  constructor(catalystApp, db) {
    this.catalystApp = catalystApp;
    this.db = db;
  }

  async sendInApp({ tenantId, userId, title, message, type, entityType = '', entityId = '', metadata = {} }) {
    if (!userId || String(userId) === 'undefined' || String(userId) === '0') {
      console.warn('[NotificationService] sendInApp skipped: invalid userId:', userId);
      return;
    }
    try {
      await this.db.insert(TABLES.NOTIFICATIONS, {
        tenant_id: tenantId,
        user_id: String(userId),
        title,
        message,
        type,
        is_read: 'false',
        entity_type: entityType,
        entity_id: entityId ? String(entityId) : '',
        metadata: JSON.stringify(metadata),
      });
      this._sendWebPush(userId, title, message).catch(() => {});
    } catch (err) {
      console.error('[NotificationService] sendInApp FAILED:', err.message);
    }
  }

  async _sendWebPush(userId, title, message) {
    try {
      const rows = await this.db.query(
        `SELECT catalyst_user_id FROM users WHERE ROWID = '${userId}' LIMIT 1`
      );
      const uid = Number(rows[0]?.catalyst_user_id);
      if (!uid) return;
      await this.catalystApp.pushNotification().web().sendNotification(
        `${title}: ${message}`, [uid]
      );
    } catch (_) {}
  }
}

module.exports = NotificationService;
