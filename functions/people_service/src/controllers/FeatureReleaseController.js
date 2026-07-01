'use strict';

const DataStoreService    = require('../services/DataStoreService');
const AuditService        = require('../services/AuditService');
const NotificationService = require('../services/NotificationService');
const ResponseHelper      = require('../utils/ResponseHelper');
const { TABLES, AUDIT_ACTION, NOTIFICATION_TYPE } = require('../utils/Constants');

// Catalyst booleans read back as boolean true OR the string 'true'.
const isTrue = (v) => v === true || String(v).toLowerCase() === 'true';

// Robustly compare timestamps regardless of stored format (Varchar 'YYYY-MM-DD
// HH:MM:SS' or a DateTime read back with a 'T'/offset). Returns epoch ms, 0 if blank.
const toMs = (s) => {
  if (!s) return 0;
  const d = new Date(String(s).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
};
// A user has "seen" a release if they opened What's New at/after it went live.
const hasSeen = (lastSeenAt, publishedAt) => {
  const pub = toMs(publishedAt);
  return pub > 0 && toMs(lastSeenAt) >= pub;
};

class FeatureReleaseController {
  constructor(catalystApp) {
    this.db    = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
    this.notif = new NotificationService(catalystApp, this.db);
  }

  // ── per-user "seen" timestamp (one row per user in feature_release_views) ──
  async _lastSeenAt(tenantId, userId) {
    try {
      const rows = await this.db.findWhere(TABLES.FEATURE_RELEASE_VIEWS, tenantId,
        `user_id = '${DataStoreService.escape(String(userId))}'`, { limit: 1 });
      return rows.length ? (rows[0].last_seen_at || null) : null;
    } catch (_) { return null; }
  }

  // GET /api/people/feature-releases — published releases for the current user,
  // each flagged is_new vs their last-seen time, plus an unread count.
  // Degrades to an empty list if the table doesn't exist yet, so the header
  // widget never crashes before the DataStore tables are created.
  async list(req, res) {
    try {
      const me = req.currentUser;
      const all = await this.db.findWhere(TABLES.FEATURE_RELEASES, req.tenantId,
        '', { orderBy: 'CREATEDTIME DESC', limit: 100 });
      const published = all
        .filter((r) => isTrue(r.is_published))
        .sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')));

      const lastSeenAt = await this._lastSeenAt(req.tenantId, me.id);
      const isNew = (r) => !hasSeen(lastSeenAt, r.published_at);

      const releases = published.map((r) => ({ ...r, is_new: isNew(r) }));
      const unreadCount = releases.filter((r) => r.is_new).length;
      return ResponseHelper.success(res, { releases, unreadCount, lastSeenAt });
    } catch (err) {
      console.warn('[FeatureReleaseController.list]', err.message);
      return ResponseHelper.success(res, { releases: [], unreadCount: 0, lastSeenAt: null });
    }
  }

  // GET /api/people/feature-releases/manage — all releases incl. drafts (admins),
  // each enriched with a "seen by" count: users who opened What's New after the
  // release went live (their last_seen_at >= published_at).
  async listManage(req, res) {
    try {
      const all = await this.db.findWhere(TABLES.FEATURE_RELEASES, req.tenantId,
        '', { orderBy: 'CREATEDTIME DESC', limit: 200 });

      // Count seen the SAME way as the seen-by modal: one entry per real user
      // whose last-seen time is at/after the release went live.
      let users = [];
      let seenMap = {};
      try {
        const views = await this.db.findWhere(TABLES.FEATURE_RELEASE_VIEWS, req.tenantId, '', { limit: 2000 });
        views.forEach((v) => { seenMap[String(v.user_id)] = v.last_seen_at || ''; });
      } catch (_) { seenMap = {}; }
      try {
        users = await this.db.findWhere(TABLES.USERS, req.tenantId, '', { limit: 2000 });
      } catch (_) { users = []; }
      const totalUsers = users.length;

      const releases = all.map((r) => {
        const seen_count = users.filter((u) => hasSeen(seenMap[String(u.ROWID)], r.published_at)).length;
        return { ...r, is_published: isTrue(r.is_published), seen_count };
      });
      return ResponseHelper.success(res, { releases, totalUsers });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // GET /api/people/feature-releases/:id/seen-status — who has / hasn't seen it
  async seenStatus(req, res) {
    try {
      const rel = await this.db.findById(TABLES.FEATURE_RELEASES, req.params.id, req.tenantId);
      if (!rel) return ResponseHelper.notFound(res, 'Release not found');

      const [users, views] = await Promise.all([
        this.db.findWhere(TABLES.USERS, req.tenantId, '', { limit: 2000 }),
        this.db.findWhere(TABLES.FEATURE_RELEASE_VIEWS, req.tenantId, '', { limit: 2000 }),
      ]);
      const seenMap = {};
      views.forEach((v) => { seenMap[String(v.user_id)] = v.last_seen_at || ''; });

      const seen = [];
      const notSeen = [];
      users.forEach((u) => {
        const id = String(u.ROWID);
        const info = { id, name: u.name || u.email || id, email: u.email || '', avatar_url: u.avatar_url || '' };
        const sa = seenMap[id];
        if (hasSeen(sa, rel.published_at)) seen.push({ ...info, seen_at: sa });
        else notSeen.push(info);
      });
      seen.sort((a, b) => String(b.seen_at).localeCompare(String(a.seen_at)));
      notSeen.sort((a, b) => a.name.localeCompare(b.name));
      return ResponseHelper.success(res, { seen, notSeen, total: users.length });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  _payload(body) {
    const data = {};
    ['title', 'description', 'category', 'version', 'media_url', 'cta_label', 'cta_route'].forEach((f) => {
      if (body[f] !== undefined) data[f] = body[f] == null ? '' : String(body[f]);
    });
    return data;
  }

  // POST /api/people/feature-releases
  async create(req, res) {
    try {
      const { title } = req.body;
      if (!title) return ResponseHelper.validationError(res, 'title is required');
      const publish = isTrue(req.body.is_published);
      const row = await this.db.insert(TABLES.FEATURE_RELEASES, {
        tenant_id: String(req.tenantId),
        ...this._payload(req.body),
        title: String(title),
        is_published: publish ? 'true' : 'false',
        published_at: publish ? DataStoreService.fmtDT(new Date()) : '',
        created_by: String(req.currentUser.id),
      });
      await this.audit.log({ tenantId: req.tenantId, entityType: 'FEATURE_RELEASE', entityId: row.ROWID, action: AUDIT_ACTION.CREATE, newValue: row, performedBy: req.currentUser.id });
      return ResponseHelper.created(res, row);
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // PUT /api/people/feature-releases/:id
  async update(req, res) {
    try {
      const existing = await this.db.findById(TABLES.FEATURE_RELEASES, req.params.id, req.tenantId);
      if (!existing) return ResponseHelper.notFound(res, 'Release not found');
      const updates = { ROWID: req.params.id, ...this._payload(req.body) };
      // Toggling publish: stamp published_at the first time it goes live.
      if (req.body.is_published !== undefined) {
        const publish = isTrue(req.body.is_published);
        updates.is_published = publish ? 'true' : 'false';
        if (publish && !existing.published_at) updates.published_at = DataStoreService.fmtDT(new Date());
      }
      const updated = await this.db.update(TABLES.FEATURE_RELEASES, updates);
      await this.audit.log({ tenantId: req.tenantId, entityType: 'FEATURE_RELEASE', entityId: req.params.id, action: AUDIT_ACTION.UPDATE, oldValue: existing, newValue: updated, performedBy: req.currentUser.id });
      return ResponseHelper.success(res, updated);
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // PATCH /api/people/feature-releases/:id/publish  { publish: bool }
  async publish(req, res) {
    try {
      const existing = await this.db.findById(TABLES.FEATURE_RELEASES, req.params.id, req.tenantId);
      if (!existing) return ResponseHelper.notFound(res, 'Release not found');
      const publish = req.body.publish === undefined ? true : isTrue(req.body.publish);
      const updates = { ROWID: req.params.id, is_published: publish ? 'true' : 'false' };
      if (publish && !existing.published_at) updates.published_at = DataStoreService.fmtDT(new Date());
      const updated = await this.db.update(TABLES.FEATURE_RELEASES, updates);

      // Notify the publisher (lightweight); broad fan-out is intentionally avoided.
      if (publish) {
        await this.notif.sendInApp({ tenantId: req.tenantId, userId: req.currentUser.id, title: 'Feature Released', message: `"${existing.title}" is now live`, type: NOTIFICATION_TYPE.FEATURE_RELEASE_PUBLISHED, entityType: 'FEATURE_RELEASE', entityId: req.params.id }).catch(() => {});
      }
      return ResponseHelper.success(res, updated);
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // DELETE /api/people/feature-releases/:id
  async remove(req, res) {
    try {
      const existing = await this.db.findById(TABLES.FEATURE_RELEASES, req.params.id, req.tenantId);
      if (!existing) return ResponseHelper.notFound(res, 'Release not found');
      await this.db.delete(TABLES.FEATURE_RELEASES, req.params.id);
      await this.audit.log({ tenantId: req.tenantId, entityType: 'FEATURE_RELEASE', entityId: req.params.id, action: AUDIT_ACTION.DELETE, oldValue: existing, performedBy: req.currentUser.id });
      return ResponseHelper.success(res, { deleted: true });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // PATCH /api/people/feature-releases/seen — mark all current releases seen
  async markSeen(req, res) {
    try {
      const now = DataStoreService.fmtDT(new Date());
      const rows = await this.db.findWhere(TABLES.FEATURE_RELEASE_VIEWS, req.tenantId,
        `user_id = '${DataStoreService.escape(String(req.currentUser.id))}'`, { limit: 1 });
      if (rows.length) {
        await this.db.update(TABLES.FEATURE_RELEASE_VIEWS, { ROWID: rows[0].ROWID, last_seen_at: now });
      } else {
        await this.db.insert(TABLES.FEATURE_RELEASE_VIEWS, {
          tenant_id: String(req.tenantId), user_id: String(req.currentUser.id), last_seen_at: now,
        });
      }
      return ResponseHelper.success(res, { lastSeenAt: now });
    } catch (err) {
      // Non-fatal — seen tracking shouldn't surface an error to the user.
      console.warn('[FeatureReleaseController.markSeen]', err.message);
      return ResponseHelper.success(res, { lastSeenAt: null });
    }
  }
}

module.exports = FeatureReleaseController;
