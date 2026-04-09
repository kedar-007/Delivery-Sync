'use strict';

const DataStoreService    = require('../services/DataStoreService');
const AuditService        = require('../services/AuditService');
const NotificationService = require('../services/NotificationService');
const ResponseHelper      = require('../utils/ResponseHelper');
const { TABLES, AUDIT_ACTION, NOTIFICATION_TYPE } = require('../utils/Constants');

class AnnouncementController {
  constructor(catalystApp) {
    this.db    = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
    this.notif = new NotificationService(catalystApp, this.db);
  }

  // GET /api/people/announcements — visible to current user based on role/targeting
  async list(req, res) {
    try {
      const me    = req.currentUser;
      const today = DataStoreService.today();
      const all   = await this.db.findWhere(TABLES.ANNOUNCEMENTS, req.tenantId,
        '', { orderBy: 'is_pinned DESC, CREATEDTIME DESC', limit: 50 });

      // Filter expired announcements in JS (avoids ZCQL DateTime column issues)
      const active = all.filter(a => !a.expires_at || a.expires_at >= today);

      const visible = active.filter(a => {
        if (a.type === 'GLOBAL') return true;
        if (a.type === 'ROLE_TARGETED') {
          try { const roles = JSON.parse(a.target_roles || '[]'); return roles.includes(me.role); } catch { return false; }
        }
        if (a.type === 'USER_TARGETED') {
          try { const ids = JSON.parse(a.target_user_ids || '[]'); return ids.includes(me.id); } catch { return false; }
        }
        return false;
      });

      // Add read status
      const readRows = await this.db.findWhere(TABLES.ANNOUNCEMENT_READS, req.tenantId,
        `user_id = '${me.id}'`, { limit: 200 });
      const readSet = new Set(readRows.map(r => String(r.announcement_id)));

      // Enrich with author name
      const creatorIds = [...new Set(visible.map(a => String(a.created_by)).filter(Boolean))];
      const userMap = {};
      if (creatorIds.length > 0) {
        const users = await this.db.findAll(TABLES.USERS, { tenant_id: req.tenantId }, { limit: 200 });
        users.forEach(u => { userMap[String(u.ROWID)] = u.name || u.email || ''; });
      }

      return ResponseHelper.success(res, visible.map(a => ({
        ...a,
        is_read:     readSet.has(String(a.ROWID)),
        author_name: userMap[String(a.created_by)] || '',
      })));
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // POST /api/people/announcements
  async create(req, res) {
    try {
      const { title, content, type, subtype, festival_key, target_roles, target_user_ids, is_pinned, priority, expires_at } = req.body;
      if (!title || !content) return ResponseHelper.validationError(res, 'title and content required');

      // Base fields that always exist in the table
      const baseData = {
        tenant_id: String(req.tenantId), title, content,
        type: type || 'GLOBAL',
        target_roles: target_roles ? JSON.stringify(target_roles) : '[]',
        target_user_ids: target_user_ids ? JSON.stringify(target_user_ids) : '[]',
        is_pinned: is_pinned ? 'true' : 'false',
        announcement_priority: priority || 'NORMAL',
        ...(expires_at ? { expires_at } : {}),
        view_count: '0',
        created_by: String(req.currentUser.id),
      };

      let row;
      try {
        // Try inserting with new optional columns (subtype, festival_key)
        // These columns must be added to the DataStore table first.
        row = await this.db.insert(TABLES.ANNOUNCEMENTS, {
          ...baseData,
          subtype: subtype || 'GENERAL',
          festival_key: festival_key || '',
        });
      } catch (colErr) {
        // Columns not yet in DataStore — insert without them
        console.warn('[AnnouncementController.create] subtype/festival_key columns missing, falling back:', colErr.message);
        row = await this.db.insert(TABLES.ANNOUNCEMENTS, baseData);
      }

      await this.notif.sendInApp({ tenantId: req.tenantId, userId: req.currentUser.id, title: 'Announcement Published', message: `"${title}" published`, type: NOTIFICATION_TYPE.ANNOUNCEMENT_PUBLISHED, entityType: 'ANNOUNCEMENT', entityId: row.ROWID });
      await this.audit.log({ tenantId: req.tenantId, entityType: 'ANNOUNCEMENT', entityId: row.ROWID, action: AUDIT_ACTION.CREATE, newValue: row, performedBy: req.currentUser.id });
      return ResponseHelper.created(res, row);
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // PUT /api/people/announcements/:id
  async update(req, res) {
    try {
      const ann = await this.db.findById(TABLES.ANNOUNCEMENTS, req.params.id, req.tenantId);
      if (!ann) return ResponseHelper.notFound(res, 'Announcement not found');

      // Base allowed fields (always exist in table)
      const baseAllowed = ['title', 'content', 'is_pinned', 'announcement_priority', 'expires_at', 'target_roles', 'target_user_ids'];
      const updates = {};
      baseAllowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = Array.isArray(req.body[f]) ? JSON.stringify(req.body[f]) : req.body[f]; });
      if (req.body.priority !== undefined) updates.announcement_priority = req.body.priority;

      let updated;
      try {
        // Try updating with new optional columns
        const extraUpdates = { ...updates };
        if (req.body.subtype !== undefined) extraUpdates.subtype = req.body.subtype;
        if (req.body.festival_key !== undefined) extraUpdates.festival_key = req.body.festival_key;
        updated = await this.db.update(TABLES.ANNOUNCEMENTS, { ROWID: req.params.id, ...extraUpdates });
      } catch (colErr) {
        console.warn('[AnnouncementController.update] subtype/festival_key columns missing, falling back:', colErr.message);
        updated = await this.db.update(TABLES.ANNOUNCEMENTS, { ROWID: req.params.id, ...updates });
      }

      return ResponseHelper.success(res, updated);
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // DELETE /api/people/announcements/:id
  async remove(req, res) {
    try {
      const ann = await this.db.findById(TABLES.ANNOUNCEMENTS, req.params.id, req.tenantId);
      if (!ann) return ResponseHelper.notFound(res, 'Announcement not found');
      await this.db.delete(TABLES.ANNOUNCEMENTS, req.params.id);
      return ResponseHelper.success(res, { message: 'Deleted' });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // PATCH /api/people/announcements/:id/read
  async markRead(req, res) {
    try {
      const existing = await this.db.findWhere(TABLES.ANNOUNCEMENT_READS, req.tenantId,
        `announcement_id = '${req.params.id}' AND user_id = '${req.currentUser.id}'`, { limit: 1 });
      if (existing.length === 0) {
        await this.db.insert(TABLES.ANNOUNCEMENT_READS, {
          tenant_id: req.tenantId, announcement_id: req.params.id, user_id: req.currentUser.id,
        });
        const ann = await this.db.findById(TABLES.ANNOUNCEMENTS, req.params.id, req.tenantId);
        if (ann) await this.db.update(TABLES.ANNOUNCEMENTS, { ROWID: req.params.id, view_count: (parseInt(ann.view_count) || 0) + 1 });
      }
      return ResponseHelper.success(res, { message: 'Marked as read' });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // GET /api/people/announcements/:id/read-status
  async readStatus(req, res) {
    try {
      const reads = await this.db.findWhere(TABLES.ANNOUNCEMENT_READS, req.tenantId,
        `announcement_id = '${req.params.id}'`, { limit: 200 });
      return ResponseHelper.success(res, { read_count: reads.length, readers: reads });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = AnnouncementController;
