'use strict';

const DataStoreService = require('../services/DataStoreService');
const ResponseHelper = require('../utils/ResponseHelper');
const { TABLES } = require('../utils/Constants');

/**
 * UserController – self-service profile management (name, avatar).
 *
 * Avatar storage: images are stored as base64 data-URLs directly in the
 * users.avatar_url column (TEXT). For larger deployments, replace with
 * Catalyst File Store (Stratus) by uploading the buffer there and storing
 * the returned CDN URL instead.
 *
 * NOTE: You must add an `avatar_url` TEXT column to the `users` table in
 * Catalyst Console → DataStore before these endpoints will work.
 */
class UserController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
    this.catalystApp = catalystApp;
  }

  /**
   * GET /api/users/me
   * Returns the current user's full profile row.
   */
  async getProfile(req, res) {
    try {
      const { id: userId, tenantId } = req.currentUser;
      const user = await this.db.findById(TABLES.USERS, userId, tenantId);
      if (!user) return ResponseHelper.notFound(res, 'User not found');

      return ResponseHelper.success(res, {
        user: {
          id: String(user.ROWID),
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          avatarUrl: user.avatar_url || '',
        },
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * PATCH /api/users/me
   * Update name and/or avatarUrl.
   * Body: { name?: string, avatarUrl?: string }
   */
  async updateProfile(req, res) {
    try {
      const { id: userId, tenantId } = req.currentUser;
      const { name, avatarUrl } = req.body;

      const payload = { ROWID: userId };
      if (name && typeof name === 'string' && name.trim()) {
        payload.name = name.trim().slice(0, 100);
      }
      if (avatarUrl !== undefined) {
        // Accept a base64 data-URL or any HTTPS URL
        const isDataUrl = typeof avatarUrl === 'string' && avatarUrl.startsWith('data:image/');
        const isHttps = typeof avatarUrl === 'string' && avatarUrl.startsWith('https://');
        const isEmpty = avatarUrl === '';
        if (!isDataUrl && !isHttps && !isEmpty) {
          return ResponseHelper.validationError(res, 'avatarUrl must be a base64 data-URL, an https URL, or empty string');
        }
        payload.avatar_url = avatarUrl;
      }

      if (Object.keys(payload).length === 1) {
        return ResponseHelper.validationError(res, 'Nothing to update');
      }

      await this.db.update(TABLES.USERS, payload);

      return ResponseHelper.success(res, { updated: true }, 'Profile updated');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * POST /api/users/me/avatar/upload
   * Upload avatar to Catalyst File Store (Stratus) and store the file URL.
   * Body: { fileName: string, contentType: string, base64: string }
   *
   * Requires a folder named "user-avatars" in Catalyst Console → File Store.
   */
  async uploadAvatar(req, res) {
    try {
      const { id: userId } = req.currentUser;
      const { fileName, contentType, base64 } = req.body;

      if (!base64 || !fileName) {
        return ResponseHelper.validationError(res, 'fileName and base64 are required');
      }

      // Decode base64 to buffer
      const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      // Upload to Catalyst File Store
      const fileStore = this.catalystApp.filestore();
      const folder = fileStore.folder('user-avatars');

      const { Readable } = require('stream');
      const stream = Readable.from(buffer);

      const fileDetails = await folder.uploadFile(
        { fileName: `${userId}_${Date.now()}_${fileName}`, content: stream }
      );

      const avatarUrl = fileDetails.file_location || fileDetails.download_url || '';

      // Save URL to users table
      await this.db.update(TABLES.USERS, { ROWID: userId, avatar_url: avatarUrl });

      return ResponseHelper.success(res, { avatarUrl }, 'Avatar uploaded');
    } catch (err) {
      // Fallback: store base64 directly in DB if File Store fails
      try {
        const { id: userId } = req.currentUser;
        const { base64 } = req.body;
        if (base64) {
          await this.db.update(TABLES.USERS, { ROWID: userId, avatar_url: base64 });
          return ResponseHelper.success(res, { avatarUrl: base64, stored: 'inline' }, 'Avatar saved (inline)');
        }
      } catch { /* ignore fallback error */ }
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = UserController;
