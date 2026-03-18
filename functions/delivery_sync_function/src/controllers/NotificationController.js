'use strict';

const DataStoreService = require('../services/DataStoreService');
const ResponseHelper = require('../utils/ResponseHelper');
const { TABLES } = require('../utils/Constants');

/**
 * NotificationController – in-app notification management.
 *
 * Architecture: Notifications are stored per-user in the notifications table
 * and are created by trigger points (ActionController, BlockerController, etc.)
 * as well as cron jobs. This controller handles reading and marking as read.
 */
class NotificationController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
  }

  /**
   * GET /api/notifications?unreadOnly=true
   */
  async getNotifications(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const { unreadOnly } = req.query;

      let where = `user_id = '${userId}'`;
      if (unreadOnly === 'true') where += ` AND is_read = 'false'`;

      const notifications = await this.db.findWhere(
        TABLES.NOTIFICATIONS, tenantId, where,
        { orderBy: 'CREATEDTIME DESC', limit: 50 }
      );

      const unreadCount = notifications.filter((n) => n.is_read === 'false').length;

      return ResponseHelper.success(res, {
        notifications: notifications.map((n) => ({
          id: String(n.ROWID),
          title: n.title,
          message: n.message,
          type: n.type,
          isRead: n.is_read === 'true',
          entityType: n.entity_type || '',
          entityId: n.entity_id || '',
          metadata: (() => { try { return JSON.parse(n.metadata || '{}'); } catch { return {}; } })(),
          createdAt: n.CREATEDTIME,
        })),
        unreadCount,
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/notifications/count
   */
  async getUnreadCount(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;

      const unread = await this.db.findWhere(
        TABLES.NOTIFICATIONS, tenantId,
        `user_id = '${userId}' AND is_read = 'false'`,
        { limit: 100 }
      );

      return ResponseHelper.success(res, { count: unread.length });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * PATCH /api/notifications/:notificationId/read
   */
  async markRead(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const { notificationId } = req.params;

      const notification = await this.db.findById(TABLES.NOTIFICATIONS, notificationId, tenantId);
      if (!notification || String(notification.user_id) !== String(userId)) {
        return ResponseHelper.notFound(res, 'Notification not found');
      }

      await this.db.update(TABLES.NOTIFICATIONS, { ROWID: notificationId, is_read: 'true' });
      return ResponseHelper.success(res, null, 'Marked as read');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * PATCH /api/notifications/read-all
   */
  async markAllRead(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;

      const unread = await this.db.findWhere(
        TABLES.NOTIFICATIONS, tenantId,
        `user_id = '${userId}' AND is_read = 'false'`,
        { limit: 100 }
      );

      await Promise.all(
        unread.map((n) => this.db.update(TABLES.NOTIFICATIONS, { ROWID: String(n.ROWID), is_read: 'true' }))
      );

      return ResponseHelper.success(res, { marked: unread.length }, 'All marked as read');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * DELETE /api/notifications/:notificationId
   */
  async deleteNotification(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const { notificationId } = req.params;

      const notification = await this.db.findById(TABLES.NOTIFICATIONS, notificationId, tenantId);
      if (!notification || String(notification.user_id) !== String(userId)) {
        return ResponseHelper.notFound(res, 'Notification not found');
      }

      await this.db.delete(TABLES.NOTIFICATIONS, notificationId);
      return ResponseHelper.success(res, null, 'Notification deleted');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = NotificationController;
