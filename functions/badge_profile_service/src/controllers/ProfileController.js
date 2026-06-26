'use strict';
const DataStoreService = require('../services/DataStoreService');
const AuditService     = require('../services/AuditService');
const WishCronService  = require('../services/WishCronService');
const ResponseHelper   = require('../utils/ResponseHelper');
const { TABLES, AUDIT_ACTION } = require('../utils/Constants');

class ProfileController {
  constructor(catalystApp, adminCatalystApp) {
    this.db           = new DataStoreService(catalystApp);
    this.audit        = new AuditService(this.db);
    this.adminApp     = adminCatalystApp || catalystApp;
  }

  async getMe(req, res) {
    return this._getProfile(req.currentUser.id, req.tenantId, res);
  }

  async getById(req, res) {
    return this._getProfile(req.params.userId, req.tenantId, res);
  }

  async _getProfile(userId, tenantId, res) {
    // Always fetch user data for avatar/name
    let u = null;
    try {
      const userRows = await this.db.query(`SELECT ROWID, name, email, avatar_url FROM ${TABLES.USERS} WHERE ROWID = '${userId}' LIMIT 1`);
      u = userRows[0] || null;
    } catch (_) {}

    const profiles = await this.db.findWhere(TABLES.USER_PROFILES, tenantId, `user_id = '${DataStoreService.escape(userId)}'`, { limit: 1 });
    if (profiles.length === 0) {
      return ResponseHelper.success(res, {
        user_id: userId,
        bio: '', photo_url: '',
        avatar_url: (u && u.avatar_url) || '',
        name:       (u && u.name)       || '',
        email:      (u && u.email)      || '',
        skills: [], experience: [], certifications: [], social_links: {}, badges: [],
      });
    }
    const p = profiles[0];
    const badges = await this.db.findWhere(TABLES.USER_BADGES, tenantId, `user_id = '${userId}'`, { limit: 50 });
    const badgeDetails = [];
    for (const ub of badges) {
      const def = await this.db.findById(TABLES.BADGE_DEFINITIONS, ub.badge_id, tenantId);
      if (def) badgeDetails.push({ ...ub, badge: def });
    }
    return ResponseHelper.success(res, {
      ...p,
      name:       (u && u.name)       || p.name  || '',
      email:      (u && u.email)      || p.email || '',
      avatar_url: (u && u.avatar_url) || p.photo_url || '',
      phone:      p.phone      || '',
      birth_date: p.birth_date || '',
      skills:         this._parse(p.skills, []),
      experience:     this._parse(p.experience, []),
      certifications: this._parse(p.certifications, []),
      social_links:   this._parse(p.social_links, {}),
      badges: badgeDetails,
    });
  }

  async updateMe(req, res) {
    const tenantId = req.tenantId;
    const userId   = req.currentUser.id;

    console.log(
      `[ProfileController.updateMe] START userId=${userId} tenantId=${tenantId}` +
      ` birth_date=${req.body.birth_date !== undefined ? JSON.stringify(req.body.birth_date) : '(not sent)'}` +
      ` timezone=${req.body.timezone !== undefined ? JSON.stringify(req.body.timezone) : '(not sent)'}`
    );

    const profiles = await this.db.findWhere(TABLES.USER_PROFILES, tenantId, `user_id = '${userId}'`, { limit: 1 });
    console.log(
      `[ProfileController.updateMe] existing profile: found=${profiles.length > 0}` +
      (profiles.length
        ? ` birth_date=${profiles[0].birth_date} timezone=${profiles[0].timezone}`
        : '')
    );

    const fields = ['bio', 'date_of_joining', 'department', 'designation', 'employee_id', 'phone', 'timezone', 'is_profile_public', 'birth_date', 'resume_url', 'photo_url', 'work_hours_per_day', 'business_hours_label', 'working_days'];
    const arrayFields = ['skills', 'experience', 'certifications'];
    const jsonFields  = ['social_links'];

    const updates = {};
    fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    arrayFields.forEach(f => { if (req.body[f] !== undefined) updates[f] = JSON.stringify(req.body[f]); });
    jsonFields.forEach(f => { if (req.body[f] !== undefined) updates[f] = JSON.stringify(req.body[f]); });

    let row;
    if (profiles.length > 0) {
      row = await this.db.update(TABLES.USER_PROFILES, { ROWID: profiles[0].ROWID, ...updates });
      console.log(`[ProfileController.updateMe] user_profiles updated ROWID=${profiles[0].ROWID} fields=${Object.keys(updates).join(',')}`);
    } else {
      row = await this.db.insert(TABLES.USER_PROFILES, {
        tenant_id: tenantId, user_id: userId,
        bio: '', photo_url: '', skills: '[]', experience: '[]', certifications: '[]',
        resume_url: '', social_links: '{}', is_profile_public: 'false', ...updates,
      });
      console.log(`[ProfileController.updateMe] user_profiles inserted (new row) userId=${userId}`);
    }

    await this.audit.log({ tenantId, entityType: 'USER_PROFILE', entityId: userId, action: AUDIT_ACTION.UPDATE, newValue: updates, performedBy: userId });

    // Schedule/reschedule birthday cron whenever birth_date or timezone changes.
    if (updates.birth_date !== undefined || updates.timezone !== undefined) {
      const existing  = profiles.length ? profiles[0] : {};
      const finalDob  = updates.birth_date !== undefined ? updates.birth_date : (existing.birth_date || null);
      const finalTz   = updates.timezone   !== undefined ? updates.timezone   : (existing.timezone  || 'Asia/Kolkata');
      console.log(
        `[ProfileController.updateMe] cron trigger: finalDob=${JSON.stringify(finalDob)} finalTz=${finalTz}` +
        ` (birth_date changed=${updates.birth_date !== undefined} timezone changed=${updates.timezone !== undefined})`
      );
      const wishCrons = new WishCronService(this.adminApp);
      if (finalDob) {
        console.log(`[ProfileController.updateMe] calling WishCronService.upsert BIRTHDAY userId=${userId}`);
        wishCrons.upsert(userId, tenantId, 'BIRTHDAY', finalDob, finalTz)
          .catch(e => console.error('[ProfileController.updateMe] birthday cron upsert failed:', e.message, e.stack));
      } else {
        console.log(`[ProfileController.updateMe] birth_date cleared — calling WishCronService.delete BIRTHDAY userId=${userId}`);
        wishCrons.delete(userId, 'BIRTHDAY')
          .catch(e => console.error('[ProfileController.updateMe] birthday cron delete failed:', e.message));
      }
    }

    console.log(`[ProfileController.updateMe] DONE userId=${userId}`);
    return ResponseHelper.success(res, row);
  }

  async directory(req, res) {
    try {
      const profiles = await this.db.findWhere(TABLES.USER_PROFILES, req.tenantId, '', { orderBy: 'CREATEDTIME ASC', limit: 200 });
      const users    = await this.db.findAll(TABLES.USERS, { tenant_id: req.tenantId }, { limit: 200 });

      // Build user lookup map (id → user row)
      const userMap  = {};
      users.forEach(u => { userMap[String(u.ROWID)] = u; });

      // Collect unique manager IDs from profiles
      const managerIds = [...new Set(
        profiles.map(p => p.reporting_manager_id).filter(Boolean).map(String)
      )];

      // Build manager lookup: manager user_id → { name, avatar_url }
      const managerMap = {};
      managerIds.forEach(mid => {
        const mu = userMap[mid];
        if (mu) managerMap[mid] = { name: mu.name || '', avatar_url: mu.avatar_url || '' };
      });

      return ResponseHelper.success(res, profiles.map(p => {
        const u   = userMap[String(p.user_id)] || null;
        const mid = p.reporting_manager_id ? String(p.reporting_manager_id) : null;
        const mgr = mid ? managerMap[mid] : null;
        return {
          ...p,
          user: u,
          name:              (u && u.name)       || p.name       || '',
          email:             (u && u.email)      || p.email      || '',
          avatar_url:        (u && u.avatar_url) || p.photo_url  || '',
          skills:            this._parse(p.skills, []),
          phone:      p.phone      || '',
          birth_date: p.birth_date || '',
          // Manager info
          manager_name:      mgr ? mgr.name      : null,
          manager_avatar_url: mgr ? mgr.avatar_url : null,
        };
      }));
    } catch (err) {
      console.error('[ProfileController.directory]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  async serveResume(req, res) {
    try {
      const catalyst = require('zcatalyst-sdk-node');
      const catalystApp = catalyst.initialize(req);

      const tenantId = req.tenantId;
      const userId = req.params.userId || req.currentUser.id;

      const profiles = await this.db.findWhere(TABLES.USER_PROFILES, tenantId, `user_id = '${DataStoreService.escape(userId)}'`, { limit: 1 });
      if (!profiles.length || !profiles[0].resume_url) {
        return res.status(404).json({ success: false, message: 'No resume found' });
      }

      const resumeUrl = profiles[0].resume_url;
      const bucketName = process.env.RESUME_BUCKET_NAME || 'resume-assets';
      const baseUrl = (process.env.RESUME_BASE_URL || process.env.STRATUS_BASE_URL || '').replace(/\/$/, '');

      // Extract the object key from the stored URL
      let key;
      if (baseUrl && resumeUrl.startsWith(baseUrl)) {
        key = resumeUrl.slice(baseUrl.length).replace(/^\//, '');
      } else {
        // Fallback: last 3 path segments (e.g. resumes/userId/timestamp_filename.pdf)
        const parts = resumeUrl.split('/').filter(Boolean);
        key = parts.slice(-3).join('/');
      }

      const bucket = catalystApp.stratus().bucket(bucketName);
      const fileData = await bucket.getObject(key);

      // Derive content-type from the filename embedded in the key
      const filename = key.split('/').pop() || 'resume';
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      const CONTENT_TYPES = {
        pdf:  'application/pdf',
        doc:  'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
      const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Cache-Control', 'private, max-age=300');

      if (Buffer.isBuffer(fileData)) {
        return res.end(fileData);
      } else if (fileData && typeof fileData.pipe === 'function') {
        return fileData.pipe(res);
      } else {
        return res.end(fileData);
      }
    } catch (err) {
      console.error('[ProfileController.serveResume]', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async uploadFile(req, res) {
    try {
      const catalyst = require('zcatalyst-sdk-node');
      const catalystApp = catalyst.initialize(req);

      const fileType = req.query.type || 'resume'; // 'resume' or 'photo'

      if (!req.files || !req.files.file) {
        return ResponseHelper.validationError(res, 'No file provided');
      }

      const file = req.files.file;
      const bucketName = fileType === 'photo'
        ? (process.env.STRATUS_BUCKET_NAME || 'badge-assets')
        : (process.env.RESUME_BUCKET_NAME  || 'resume-assets');
      const baseUrl = fileType === 'photo'
        ? process.env.STRATUS_BASE_URL
        : (process.env.RESUME_BASE_URL || process.env.STRATUS_BASE_URL);

      const fs      = require('fs');
      const stratus = catalystApp.stratus();
      const bucket  = stratus.bucket(bucketName);
      const key     = `${fileType}s/${req.currentUser.id}/${Date.now()}_${file.name}`;

      const readStream = fs.createReadStream(file.tempFilePath || file.path);
      await bucket.putObject(key, readStream, {
        overwrite: true,
        contentType: file.mimetype || 'application/octet-stream',
      });

      const url = `${baseUrl}/${key}`;

      // Persist to profile
      const tenantId = req.tenantId;
      const userId   = req.currentUser.id;
      const field    = fileType === 'photo' ? 'photo_url' : 'resume_url';

      const profiles = await this.db.findWhere(TABLES.USER_PROFILES, tenantId, `user_id = '${userId}'`, { limit: 1 });
      if (profiles.length > 0) {
        await this.db.update(TABLES.USER_PROFILES, { ROWID: profiles[0].ROWID, [field]: url });
      } else {
        await this.db.insert(TABLES.USER_PROFILES, {
          tenant_id: tenantId, user_id: userId,
          bio: '', photo_url: '', skills: '[]', experience: '[]',
          certifications: '[]', resume_url: '', social_links: '{}',
          is_profile_public: 'false', [field]: url,
        });
      }

      return ResponseHelper.success(res, { url, field });
    } catch (err) {
      console.error('[ProfileController.uploadFile]', err);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  _parse(val, fallback) {
    try { return val ? JSON.parse(val) : fallback; } catch { return fallback; }
  }
}

module.exports = ProfileController;
