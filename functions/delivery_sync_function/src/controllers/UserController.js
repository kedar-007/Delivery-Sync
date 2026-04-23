'use strict';

const DataStoreService = require('../services/DataStoreService');
const ResponseHelper = require('../utils/ResponseHelper');
const { TABLES, USER_STATUS, AUDIT_ACTION} = require('../utils/Constants');
const { buildEmailUpdateHtml } = require('../utils/EmailTemplates.js');
const AuditService = require('../services/AuditService');

const BUCKET_NAME = process.env.STRATUS_BUCKET_NAME || 'profiles-users';
const BUCKET_BASE_URL = process.env.STRATUS_USER_AVATARS_URL || 'https://profiles-users-development.zohostratus.in';

/**
 * UserController – self-service profile management (name, avatar, email).
 *
 * Avatar storage: images are uploaded to Catalyst Stratus bucket "user-avatars".
 * Requires the bucket to exist: Catalyst Console → File Store → Buckets → Create "user-avatars".
 * Set STRATUS_USER_AVATARS_URL env var to the bucket's base URL.
 *
 * NOTE: Add an `avatar_url` TEXT column to the `users` table in Catalyst Console → DataStore.
 */
const CATALYST_ROLE_MAP = {
  TENANT_ADMIN:  process.env.CATALYST_ROLE_TENANT_ADMIN  || '17682000000989450',
  DELIVERY_LEAD: process.env.CATALYST_ROLE_DELIVERY_LEAD || '17682000000989455',
  TEAM_MEMBER:   process.env.CATALYST_ROLE_TEAM_MEMBER   || '17682000000989460',
  PMO:           process.env.CATALYST_ROLE_PMO           || '17682000000989465',
  EXEC:          process.env.CATALYST_ROLE_EXEC          || '17682000000989470',
  CLIENT:        process.env.CATALYST_ROLE_CLIENT        || '17682000000989475',
  SUPER_ADMIN:   process.env.CATALYST_ROLE_SUPER_ADMIN   || '17682000001011209',
};

class UserController {
  constructor(catalystApp) {
    this.db             = new DataStoreService(catalystApp);
    this.catalystApp    = catalystApp;
    this.stratus        = catalystApp.stratus();
    this.userManagement = catalystApp.userManagement();
    this.email          = catalystApp.email();
    this.auth           = catalystApp.userManagement();   // registerUser + getUser live here
    this.audit          = new AuditService(this.db);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/users/me/email-update
  // Body: { email: string }
  //
  // Flow:
  //  1. Validate new email
  //  2. Guard: new email must differ from current
  //  3. Duplicate-email check within this tenant
  //  4. Delete old Catalyst user from org
  //  5. Re-invite via Catalyst registerUser() with new email   ← fatal if fails
  //  6. Update DB row (catalyst_user_id + email)               ← rollback Catalyst if fails
  //  7. Audit log
  // ─────────────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/users/me/email-update  —  revised operation order
  //
  // Why this order?
  //  Catalyst's DataStore updateRow authenticates as the calling user.
  //  If we delete the Catalyst user FIRST, their session token is immediately
  //  revoked, so any subsequent DB write fails with "Authentication failed".
  //  Solution: do all DB work BEFORE deleting the old Catalyst identity.
  //
  //  New flow:
  //   1. Validate + load user + duplicate-email guard
  //   2. Build invite config
  //   3. Register new Catalyst user (new email)   ← fatal if fails, nothing to undo
  //   4. Update DB (user session still valid)      ← rollback: delete new Catalyst user
  //   5. Delete old Catalyst user                  ← best-effort, non-fatal
  //   6. Audit log                                 ← non-fatal
  // ─────────────────────────────────────────────────────────────────────────────
  async updateEmail(req, res) {
    try {
      const { id: userId, tenantId, tenantName } = req.currentUser;
      console.log('[updateEmail] STEP 1 — Request received | userId:', userId, '| tenantId:', tenantId, '| body:', JSON.stringify(req.body));

      const data = req.body;

      // ── 1. Load current DB record ────────────────────────────────────────────
      console.log('[updateEmail] STEP 1 — Loading current user from DB | ROWID:', userId);
      const userRes = await this.db.findById(TABLES.USERS, userId, tenantId);
      if (!userRes) {
        console.warn('[updateEmail] STEP 1 FAIL — User not found in DB');
        return ResponseHelper.notFound(res, 'User not found');
      }

      const { catalyst_user_id, email: oldEmail, name: fullName, catalyst_org_id, role } = userRes;
      console.log('[updateEmail] STEP 1 OK — currentEmail:', oldEmail, '| catalyst_user_id:', catalyst_user_id, '| role:', role);

      if (data.email === oldEmail.toLowerCase()) {
        console.warn('[updateEmail] STEP 1 FAIL — New email same as current');
        return ResponseHelper.conflict(res, 'New email is the same as your current email');
      }

      // ── 2. Duplicate-email guard within tenant ───────────────────────────────
      console.log('[updateEmail] STEP 2 — Checking for duplicate email in tenant:', data.email);
      const existing = await this.db.query(
        `SELECT ROWID FROM ${TABLES.USERS} ` +
        `WHERE tenant_id = '${DataStoreService.escape(tenantId)}' ` +
        `AND email = '${DataStoreService.escape(data.email)}' LIMIT 1`
      );
      if (existing.length > 0) {
        console.warn('[updateEmail] STEP 2 FAIL — Email already exists in tenant:', data.email);
        return ResponseHelper.conflict(res, 'A user with this email already exists in your organisation');
      }
      console.log('[updateEmail] STEP 2 OK — Email is unique within tenant');

      // ── 3. Build invite config ───────────────────────────────────────────────
      const nameParts = fullName.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName  = nameParts.slice(1).join(' ') || '';

      const baseSignupConfig = {
        platform_type: 'web',
        template_details: {
          senders_mail: process.env.FROM_EMAIL || 'noreply@deliverysync.app',
          subject: `Action required: set up your password for ${tenantName} on Delivery Sync`,
        },
        redirect_url: `${process.env.APP_BASE_URL || req.headers.origin || 'https://your-app.com'}/__catalyst/auth/login`,
      };

      const baseUserConfig = {
        first_name: firstName,
        last_name:  lastName,
        role_id:    CATALYST_ROLE_MAP[role] || CATALYST_ROLE_MAP.TEAM_MEMBER,
        org_id:     catalyst_org_id,
      };

      console.log('[updateEmail] STEP 3 — Invite config built | firstName:', firstName, '| lastName:', lastName, '| role_id:', baseUserConfig.role_id, '| org_id:', baseUserConfig.org_id);

      // ── 4. Register new Catalyst user with new email ─────────────────────────
      // Old user is still active at this point — session remains valid.
      console.log('[updateEmail] STEP 4 — Registering new Catalyst user | newEmail:', data.email);
      let registeredUser;
      try {
        registeredUser = await this.auth.registerUser(
          {
            ...baseSignupConfig,
            template_details: {
              ...baseSignupConfig.template_details,
              message: buildEmailUpdateHtml({ firstName, lastName, tenantName, newEmail: data.email, oldEmail }),
            },
          },
          { ...baseUserConfig, email_id: data.email },
        );
        console.log('[updateEmail] STEP 4 OK — Catalyst registerUser response:', JSON.stringify(registeredUser?.user_details));
      } catch (inviteErr) {
        console.error('[updateEmail] STEP 4 FAIL — Catalyst registerUser error:', inviteErr.message);
        // Old user still alive — nothing to roll back.
        return ResponseHelper.serverError(
          res,
          'Could not register the new email with the identity provider. Your account has not been changed.'
        );
      }

      const newCatalystUserId = registeredUser.user_details.user_id;
      const newCatalystOrgId  = registeredUser.user_details.org_id || catalyst_org_id;
      console.log('[updateEmail] STEP 4 — newCatalystUserId:', newCatalystUserId, '| newCatalystOrgId:', newCatalystOrgId);

      // ── 5. Update DB (user session still valid — old user not yet deleted) ────
      console.log('[updateEmail] STEP 5 — Updating DB row | ROWID:', userId, '| newEmail:', data.email, '| newCatalystUserId:', newCatalystUserId);
      try {
        await this.db.update(TABLES.USERS, {
          ROWID:            userId,
          email:            data.email,
          catalyst_user_id: newCatalystUserId,
          catalyst_org_id:  newCatalystOrgId,
          status:           USER_STATUS.INVITED,
        });
        console.log('[updateEmail] STEP 5 OK — DB updated successfully');
      } catch (dbErr) {
        console.error('[updateEmail] STEP 5 FAIL — DB update error:', dbErr.message);

        // DB failed — delete the new Catalyst user we just created so nothing is orphaned.
        console.log('[updateEmail] STEP 5 ROLLBACK — Deleting new Catalyst user:', newCatalystUserId);
        try {
          await this.userManagement.deleteUser(newCatalystUserId);
          console.log('[updateEmail] STEP 5 ROLLBACK OK — New Catalyst user deleted');
        } catch (rollbackErr) {
          console.error('[updateEmail] STEP 5 ROLLBACK FAIL — Could not delete new Catalyst user:', rollbackErr.message);
        }

        // Old Catalyst user is still alive — no further rollback needed.
        return ResponseHelper.serverError(
          res,
          'Email update could not be saved. Your account has not been changed.'
        );
      }

      // ── 6. Delete old Catalyst user (best-effort — DB is already committed) ──
      console.log('[updateEmail] STEP 6 — Deleting old Catalyst user | catalyst_user_id:', catalyst_user_id);
      try {
        await this.userManagement.deleteUser(catalyst_user_id);
        console.log('[updateEmail] STEP 6 OK — Old Catalyst user deleted');
      } catch (deleteErr) {
        // Non-fatal: DB row already points to the new identity.
        // Old Catalyst user will simply be an orphan — admin can clean it up.
        console.warn('[updateEmail] STEP 6 WARN — Could not delete old Catalyst user (non-fatal):', deleteErr.message);
      }

      // ── 7. Audit log (non-fatal) ─────────────────────────────────────────────
      console.log('[updateEmail] STEP 7 — Writing audit log');
      try {
        await this.audit.log({
          tenantId,
          entityType:  'user',
          entityId:    String(userId),
          action:      AUDIT_ACTION.UPDATE,
          oldValue:    { email: oldEmail,   catalystUserId: catalyst_user_id },
          newValue:    { email: data.email, catalystUserId: newCatalystUserId },
          performedBy: userId,
        });
        console.log('[updateEmail] STEP 7 OK — Audit log written');
      } catch (auditErr) {
        console.warn('[updateEmail] STEP 7 WARN — Audit log failed (non-fatal):', auditErr.message);
      }

      console.log('[updateEmail] SUCCESS — Email updated from', oldEmail, '→', data.email);
      return ResponseHelper.success(
        res,
        { email: data.email, status: USER_STATUS.INVITED },
        `Email updated. A confirmation link has been sent to ${data.email} — please activate your new address.`
      );

    } catch (err) {
      console.error('[updateEmail] UNHANDLED ERROR:', err.message, err.stack);
      if (err.isValidation) return ResponseHelper.validationError(res, err.message, err.details);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /api/users/me
  // ─────────────────────────────────────────────────────────────────────────────
  async getProfile(req, res) {
    try {
      const { id: userId, tenantId } = req.currentUser;

      const user = await this.db.findById(TABLES.USERS, userId, tenantId);
      if (!user) return ResponseHelper.notFound(res, 'User not found');

      const tenant = await this.db.findeTenantById(TABLES.TENANTS, tenantId);
      if (!tenant) return ResponseHelper.notFound(res, 'Tenant not found');

      return ResponseHelper.success(res, {
        user: {
          id:         String(user.ROWID),
          name:       user.name,
          email:      user.email,
          role:       user.role,
          status:     user.status,
          avatarUrl:  user.avatar_url || '',
          tenantSlug: tenant.slug,
        },
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PATCH /api/users/me
  // Body: { name?: string, phone?: string, designation?: string }
  // ─────────────────────────────────────────────────────────────────────────────
  async updateProfile(req, res) {
    try {
      const { id: userId, tenantId } = req.currentUser;
      const { name, phone, designation } = req.body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        return ResponseHelper.validationError(res, 'name is required');
      }

      // Update name in users table
      await this.db.update(TABLES.USERS, { ROWID: userId, name: name.trim().slice(0, 100) });

      // Update phone/designation in user_profiles (where those columns live)
      if (phone !== undefined || designation !== undefined) {
        const profiles = await this.db.query(
          `SELECT ROWID FROM ${TABLES.USER_PROFILES} WHERE user_id = '${userId}' LIMIT 1`
        );
        const profileUpdates = {};
        if (phone !== undefined)       profileUpdates.phone       = String(phone || '').slice(0, 30);
        if (designation !== undefined) profileUpdates.designation = String(designation || '').slice(0, 200);

        if (profiles.length > 0) {
          await this.db.update(TABLES.USER_PROFILES, { ROWID: profiles[0].ROWID, ...profileUpdates });
        } else {
          await this.db.insert(TABLES.USER_PROFILES, {
            tenant_id: tenantId, user_id: userId,
            bio: '', photo_url: '', skills: '[]', experience: '[]', certifications: '[]',
            resume_url: '', social_links: '{}', is_profile_public: 'false',
            ...profileUpdates,
          });
        }
      }

      return ResponseHelper.success(res, { updated: true }, 'Profile updated');
    } catch (err) {
      console.error('[UserController.updateProfile]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/users/me/avatar/upload
  // Body: { fileName: string, contentType: string, base64: string }
  // ─────────────────────────────────────────────────────────────────────────────
  async uploadAvatar(req, res) {
    try {
      const { id: userId, tenantId } = req.currentUser;
      const { fileName, contentType, base64 } = req.body;

      if (!base64 || !fileName) {
        return ResponseHelper.validationError(res, 'fileName and base64 are required');
      }

      // Strip data-URI prefix if present (frontend may send full data-URL)
      const base64Data = base64.replace(/^data:image\/[\w+]+;base64,/, '');
      const buffer     = Buffer.from(base64Data, 'base64');
      const ext            = (fileName.split('.').pop() || 'jpg').toLowerCase();
      const uniqueFileName = `avatar_${userId}_${Date.now()}.${ext}`;

      // ── Try Stratus upload ────────────────────────────────────────────────
      let avatarUrl = '';
      let stratusOk = false;

      if (!process.env.STRATUS_BUCKET_NAME && !BUCKET_BASE_URL.includes('zohostratus')) {
        console.warn('[UserController] STRATUS_BUCKET_NAME not configured — skipping Stratus upload');
      } else {
        try {
          const bucket       = this.stratus.bucket(BUCKET_NAME);

          // Delete old avatar first (non-fatal)
          try {
            const existing = await this.db.findById(TABLES.USERS, userId, tenantId);
            if (existing?.avatar_url) {
              const oldName = existing.avatar_url.split('/').pop();
              if (oldName) await bucket.deleteObject(oldName).catch(() => {});
            }
          } catch (_) {}

          const result = await bucket.putObject(uniqueFileName, buffer, {
            contentType: contentType || 'image/jpeg',
          });

          if (result === true) {
            avatarUrl = `${BUCKET_BASE_URL}/${uniqueFileName}`;
            stratusOk = true;
            console.log('[UserController] Stratus upload OK:', avatarUrl);
          } else {
            console.warn('[UserController] Stratus putObject returned non-true:', result);
          }
        } catch (stratusErr) {
          console.error('[UserController] Stratus upload failed:', stratusErr.message);
          // Return a helpful error rather than a cryptic 500
          const hint = stratusErr.message?.toLowerCase().includes('bucket')
            ? 'Stratus bucket "profiles-users" not found. Create it in Catalyst Console → Object Storage, then set STRATUS_BUCKET_NAME env var.'
            : `Avatar storage error: ${stratusErr.message}. Check STRATUS_BUCKET_NAME and STRATUS_USER_AVATARS_URL env vars.`;
          return ResponseHelper.serverError(res, hint);
        }
      }

      if (!stratusOk) {
        return ResponseHelper.serverError(
          res,
          'Avatar storage is not configured. In Catalyst Console: (1) Create an Object Storage bucket named "profiles-users", (2) Add STRATUS_BUCKET_NAME=profiles-users and STRATUS_USER_AVATARS_URL=<bucket-base-url> env vars to delivery_sync_function.'
        );
      }

      // ── Persist URL to user_profiles.photo_url (primary) ─────────────────
      try {
        const profiles = await this.db.query(
          `SELECT ROWID FROM ${TABLES.USER_PROFILES} WHERE user_id = '${userId}' LIMIT 1`
        );
        if (profiles.length > 0) {
          await this.db.update(TABLES.USER_PROFILES, { ROWID: profiles[0].ROWID, photo_url: avatarUrl });
        } else {
          await this.db.insert(TABLES.USER_PROFILES, {
            tenant_id: tenantId, user_id: userId,
            photo_url: avatarUrl,
            bio: '', skills: '[]', experience: '[]', certifications: '[]',
            resume_url: '', social_links: '{}', is_profile_public: 'false',
          });
        }
      } catch (profileErr) {
        console.error('[UserController] user_profiles update failed:', profileErr.message);
      }

      // ── Also cache URL in users.avatar_url for fast lookups (non-fatal) ──
      try {
        await this.db.update(TABLES.USERS, { ROWID: userId, avatar_url: avatarUrl });
      } catch (_) {}

      return ResponseHelper.success(res, { avatarUrl }, 'Avatar uploaded successfully');
    } catch (err) {
      console.error('[UserController] uploadAvatar error:', err.message, err.stack);
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = UserController;