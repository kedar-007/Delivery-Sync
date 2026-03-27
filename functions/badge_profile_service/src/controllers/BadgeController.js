'use strict';
const DataStoreService    = require('../services/DataStoreService');
const AuditService        = require('../services/AuditService');
const NotificationService = require('../services/NotificationService');
const ResponseHelper      = require('../utils/ResponseHelper');
const { TABLES, AUDIT_ACTION, NOTIFICATION_TYPE } = require('../utils/Constants');

class BadgeController {
  constructor(catalystApp) {
    this.db    = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
    this.notif = new NotificationService(catalystApp, this.db);
  }

  async list(req, res) {
    const badges = await this.db.findWhere(TABLES.BADGE_DEFINITIONS, req.tenantId, `is_active = 'true'`, { orderBy: 'name ASC', limit: 100 });
    return ResponseHelper.success(res, badges);
  }

  async create(req, res) {
    try {
      const catalyst = require('zcatalyst-sdk-node');
      const catalystApp = catalyst.initialize(req);

      const {
        name,
        category,
        level,
        description,
        criteria,
        icon_emoji
      } = req.body;

      if (!name || !category) {
        return ResponseHelper.validationError(res, 'name and category required');
      }

      let logo_url = '';

      // FILE UPLOAD via Catalyst Stratus (non-fatal — badge still creates if upload fails)
      if (req.files && req.files.file) {
        try {
          const file = req.files.file;
          const fs = require('fs');

          const stratus = catalystApp.stratus();
          const bucketName = process.env.STRATUS_BUCKET_NAME || 'badge-assets';
          const bucket = stratus.bucket(bucketName);
          const key = `badges/${Date.now()}_${file.name}`;

          const readStream = fs.createReadStream(file.tempFilePath || file.path);
          await bucket.putObject(key, readStream, {
            overwrite: true,
            contentType: file.mimetype || 'image/jpeg',
          });

          // Get bucket URL from details, fall back to env var
          let baseUrl = process.env.STRATUS_BASE_URL || '';
          try {
            const details = await bucket.getDetails();
            if (details.bucket_url) baseUrl = details.bucket_url.replace(/\/$/, '');
          } catch (_) { /* use env fallback */ }

          logo_url = `${baseUrl}/${key}`;
          console.log('[BadgeController] Stratus uploaded:', key, '->', logo_url);
        } catch (uploadErr) {
          console.error('[BadgeController] Stratus upload failed (badge still created):', uploadErr.message);
        }
      }

      // INSERT — use string 'true'/'false' for boolean columns
      const row = await this.db.insert(TABLES.BADGE_DEFINITIONS, {
        tenant_id: String(req.tenantId),
        name,
        category,
        level: level || 'BRONZE',
        description: description || '',
        logo_url,
        icon_emoji: icon_emoji || '🏅',
        criteria: criteria || '',
        is_auto_awardable: 'false',
        auto_award_config: JSON.stringify({}),
        is_active: 'true',
        created_by: String(req.currentUser.id)
      });

      await this.audit.log({
        tenantId: req.tenantId,
        entityType: 'BADGE',
        entityId: row.ROWID,
        action: 'CREATE',
        newValue: row,
        performedBy: req.currentUser.id
      });

      return ResponseHelper.created(res, row);

    } catch (error) {
      console.error('Create Badge Error:', error);
      return ResponseHelper.serverError(res, error.message || 'Internal Server Error');
    }
  }

  async update(req, res) {
    const badge = await this.db.findById(TABLES.BADGE_DEFINITIONS, req.params.badgeId, req.tenantId);
    if (!badge) return ResponseHelper.notFound(res, 'Badge not found');
    const allowed = ['name', 'category', 'level', 'description', 'criteria', 'is_active', 'is_auto_awardable'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const updated = await this.db.update(TABLES.BADGE_DEFINITIONS, { ROWID: req.params.badgeId, ...updates });
    return ResponseHelper.success(res, updated);
  }

  async award(req, res) {
    const { user_id, reason, is_featured } = req.body;
    if (!user_id || !reason) return ResponseHelper.validationError(res, 'user_id and reason required');
    console.log("Badge Id and tenant--",req.params.badgeId,req.tenantId);
    const badge = await this.db.findById(TABLES.BADGE_DEFINITIONS, req.params.badgeId, req.tenantId);
    if (!badge || (badge.is_active !== true && badge.is_active !== 'true')) return ResponseHelper.notFound(res, 'Badge not found or inactive');
    const row = await this.db.insert(TABLES.USER_BADGES, {
      tenant_id: req.tenantId, user_id, badge_id: req.params.badgeId,
      awarded_by: req.currentUser.id, reason,
      is_featured: is_featured ? 'true' : 'false', is_public: 'true',
    });
    const userRows = await this.db.query(`SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = '${user_id}' LIMIT 1`);
    if (userRows[0]) {
      await this.notif.send({ toEmail: userRows[0].email, subject: `[Delivery Sync] You earned a badge: ${badge.name}!`, htmlBody: `<p>Hi ${userRows[0].name}, congratulations! You have been awarded the <strong>${badge.name}</strong> (${badge.level}) badge. Reason: ${reason}</p>` });
      await this.notif.sendInApp({ tenantId: req.tenantId, userId: user_id, title: 'Badge Awarded!', message: `You earned the "${badge.name}" badge`, type: NOTIFICATION_TYPE.BADGE_AWARDED, entityType: 'BADGE', entityId: req.params.badgeId });
    }
    await this.audit.log({ tenantId: req.tenantId, entityType: 'USER_BADGE', entityId: row.ROWID, action: AUDIT_ACTION.ASSIGN, newValue: { badge_id: req.params.badgeId, user_id, reason }, performedBy: req.currentUser.id });
    return ResponseHelper.created(res, row);
  }

  async revoke(req, res) {
    const award = await this.db.findById(TABLES.USER_BADGES, req.params.awardId, req.tenantId);
    if (!award) return ResponseHelper.notFound(res, 'Badge award not found');
    await this.db.delete(TABLES.USER_BADGES, req.params.awardId);
    await this.notif.sendInApp({ tenantId: req.tenantId, userId: award.user_id, title: 'Badge Revoked', message: 'A badge has been removed from your profile', type: NOTIFICATION_TYPE.BADGE_REVOKED, entityType: 'BADGE', entityId: award.badge_id });
    await this.audit.log({ tenantId: req.tenantId, entityType: 'USER_BADGE', entityId: req.params.awardId, action: AUDIT_ACTION.DELETE, oldValue: award, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, { message: 'Badge revoked' });
  }

  async leaderboard(req, res) {
    try {
      const awards = await this.db.findWhere(TABLES.USER_BADGES, req.tenantId, `is_public = 'true'`, { limit: 200 });
      const byUser = {};
      for (const a of awards) {
        if (!byUser[a.user_id]) byUser[a.user_id] = { user_id: a.user_id, badge_count: 0, award_ids: [] };
        byUser[a.user_id].badge_count++;
        byUser[a.user_id].award_ids.push(a);
      }
      const sorted = Object.values(byUser).sort((a, b) => b.badge_count - a.badge_count).slice(0, 20);
      if (sorted.length === 0) return ResponseHelper.success(res, []);

      // Enrich with user info, profile info, and badge definitions
      const [users, profiles, badgeDefs] = await Promise.all([
        this.db.findAll(TABLES.USERS, { tenant_id: req.tenantId }, { limit: 200 }),
        this.db.findWhere(TABLES.USER_PROFILES, req.tenantId, '', { limit: 200 }),
        this.db.findWhere(TABLES.BADGE_DEFINITIONS, req.tenantId, '', { limit: 200 }),
      ]);
      const userMap = {};
      users.forEach(u => { userMap[String(u.ROWID)] = u; });
      const profileMap = {};
      profiles.forEach(p => { profileMap[String(p.user_id)] = p; });
      const badgeDefMap = {};
      badgeDefs.forEach(b => { badgeDefMap[String(b.ROWID)] = b; });

      const enriched = sorted.map(entry => {
        const u = userMap[String(entry.user_id)] || {};
        const p = profileMap[String(entry.user_id)] || {};
        const badges = entry.award_ids.map(a => {
          const def = badgeDefMap[String(a.badge_id)] || {};
          return {
            award_id: String(a.ROWID),
            badge_id: String(a.badge_id),
            name: def.name || '',
            logo_url: def.logo_url || '',
            icon_emoji: def.icon_emoji || '🏅',
          };
        });
        return {
          user_id: entry.user_id,
          badge_count: entry.badge_count,
          name: u.name || 'Unknown',
          email: u.email || '',
          avatar_url: u.avatar_url || p.photo_url || '',
          designation: p.designation || '',
          department: p.department || '',
          badges,
        };
      });
      return ResponseHelper.success(res, enriched);
    } catch (err) {
      console.error('[BadgeController.leaderboard]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = BadgeController;
