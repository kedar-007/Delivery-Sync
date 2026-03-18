'use strict';

const DataStoreService = require('../services/DataStoreService');
const ResponseHelper = require('../utils/ResponseHelper');
const { TABLES } = require('../utils/Constants');

const BUCKET_NAME = process.env.STRATUS_BUCKET_NAME || 'profiles-users';
const BUCKET_BASE_URL = process.env.STRATUS_USER_AVATARS_URL || 'https://profiles-users-development.zohostratus.in';

/**
 * UserController – self-service profile management (name, avatar).
 *
 * Avatar storage: images are uploaded to Catalyst Stratus bucket "user-avatars".
 * Requires the bucket to exist: Catalyst Console → File Store → Buckets → Create "user-avatars".
 * Set STRATUS_USER_AVATARS_URL env var to the bucket's base URL.
 *
 * NOTE: Add an `avatar_url` TEXT column to the `users` table in Catalyst Console → DataStore.
 */
class UserController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
    this.catalystApp = catalystApp;
    this.stratus = catalystApp.stratus();
  }

  /**
   * GET /api/users/me
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
   * Update display name.
   * Body: { name?: string }
   */
  async updateProfile(req, res) {
    try {
      const { id: userId } = req.currentUser;
      const { name } = req.body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        return ResponseHelper.validationError(res, 'name is required');
      }

      await this.db.update(TABLES.USERS, { ROWID: userId, name: name.trim().slice(0, 100) });
      return ResponseHelper.success(res, { updated: true }, 'Profile updated');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * POST /api/users/me/avatar/upload
   * Upload avatar image to Catalyst Stratus bucket and save the URL to the users table.
   * Body: { fileName: string, contentType: string, base64: string }
   */
  async uploadAvatar(req, res) {
    try {
      const { id: userId, tenantId } = req.currentUser;
      const { fileName, contentType, base64 } = req.body;

      if (!base64 || !fileName) {
        return ResponseHelper.validationError(res, 'fileName and base64 are required');
      }

      const bucket = this.stratus.bucket(BUCKET_NAME);

      // 1. Fetch existing user to get old avatar file name for deletion
      const existingUser = await this.db.findById(TABLES.USERS, userId, tenantId);
      if (existingUser && existingUser.avatar_url) {
        try {
          const oldFileName = existingUser.avatar_url.split('/').pop();
          if (oldFileName) {
            console.log('[UserController] Deleting old avatar:', oldFileName);
            await bucket.deleteObject(oldFileName);
          }
        } catch (delErr) {
          console.warn('[UserController] Failed to delete old avatar (non-fatal):', delErr.message);
        }
      }

      // 2. Decode base64 → Buffer
      const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      // 3. Build unique file name: userId_timestamp.ext
      const ext = fileName.split('.').pop() || 'jpg';
      const uniqueFileName = `${userId}_${Date.now()}.${ext}`;

      console.log('[UserController] Uploading avatar:', { uniqueFileName, contentType, size: buffer.length });

      // 4. Upload to Stratus bucket — same pattern as reference project
      const uploadResult = await bucket.putObject(uniqueFileName, buffer, {
        contentType: contentType || 'image/jpeg',
      });

      console.log('[UserController] Upload result:', uploadResult);

      if (uploadResult !== true) {
        return ResponseHelper.serverError(res, 'Avatar upload to Stratus failed');
      }

      const avatarUrl = `${BUCKET_BASE_URL}/${uniqueFileName}`;
      console.log('[UserController] Avatar URL:', avatarUrl);

      // 5. Persist URL to users table
      await this.db.update(TABLES.USERS, { ROWID: userId, avatar_url: avatarUrl });

      return ResponseHelper.success(res, { avatarUrl }, 'Avatar uploaded');
    } catch (err) {
      console.error('[UserController] uploadAvatar error:', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = UserController;
