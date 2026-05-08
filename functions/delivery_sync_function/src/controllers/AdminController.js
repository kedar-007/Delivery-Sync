'use strict';

const DataStoreService = require('../services/DataStoreService');
const AuditService = require('../services/AuditService');
const ResponseHelper = require('../utils/ResponseHelper');
const Validator = require('../utils/Validator');
const { TABLES, USER_STATUS, AUDIT_ACTION, ROLES } = require('../utils/Constants');

// Catalyst role IDs — each DS role maps to a distinct Catalyst app role.
// Values come from env vars set in Catalyst Console → Function → Environment Variables.
const CATALYST_ROLE_MAP = {
  TENANT_ADMIN:  process.env.CATALYST_ROLE_TENANT_ADMIN  || '17682000000989450',
  DELIVERY_LEAD: process.env.CATALYST_ROLE_DELIVERY_LEAD || '17682000000989455',
  TEAM_MEMBER:   process.env.CATALYST_ROLE_TEAM_MEMBER   || '17682000000989460',
  PMO:           process.env.CATALYST_ROLE_PMO           || '17682000000989465',
  EXEC:          process.env.CATALYST_ROLE_EXEC          || '17682000000989470',
  CLIENT:        process.env.CATALYST_ROLE_CLIENT        || '17682000000989475',
  SUPER_ADMIN:   process.env.CATALYST_ROLE_SUPER_ADMIN   || '17682000001011209',
};

/**
 * AdminController – tenant admin operations: user management, invites, settings.
 * All new users are registered as TEAM_MEMBER in Catalyst; fine-grained permissions
 * are managed via org roles and per-user overrides.
 */
class AdminController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
    this.auth = catalystApp.userManagement();
  }

  /**
   * POST /api/admin/users/invite
   * Registers a new user in Catalyst as TEAM_MEMBER (lowest Catalyst privilege).
   * Fine-grained app permissions are managed via org roles and per-user overrides.
   * DB insert happens ONLY after Catalyst registration succeeds.
   */
  async inviteUserOrg(req, res) {
    try {
      const { tenantId, id: invitedBy, name: inviterName, tenantName } = req.currentUser;
      const data = Validator.validateInviteUser(req.body);

      // Duplicate email check within this tenant
      const existing = await this.db.query(
        `SELECT ROWID FROM ${TABLES.USERS} WHERE tenant_id = '${tenantId}' ` +
        `AND email = '${DataStoreService.escape(data.email)}' LIMIT 1`
      );
      if (existing.length > 0) {
        return ResponseHelper.conflict(res, 'A user with this email already exists in your organisation');
      }

      const nameParts = data.name.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName  = nameParts.slice(1).join(' ') || '';

      // Look up org role name for the email (non-fatal if not found)
      let orgRoleName = null;
      if (data.orgRoleId) {
        try {
          const orgRole = await this.db.findById(TABLES.ORG_ROLES, data.orgRoleId, tenantId);
          if (orgRole) orgRoleName = orgRole.name;
        } catch (_) {}
      }

      // Get the current user's Catalyst org_id — required by registerUser()
      const currentCatalystUser = await this.auth.getCurrentUser();
      const orgId = currentCatalystUser.org_id || '';

      /** Signup email config — Catalyst replaces %LINK% with the activation URL */
      const signupConfig = {
        platform_type: 'web',
        template_details: {
          senders_mail: process.env.FROM_EMAIL || 'noreply@dsvopspulse.app',
          subject: `${inviterName} invited you to join ${tenantName} on DSV OpsPulse`,
          message: buildInviteEmailHtml({ firstName, lastName, inviterName, tenantName, orgRoleName }),
        },
        redirect_url: `${process.env.APP_BASE_URL}`,
      };

      /** User config */
      const userConfig = {
        first_name: firstName,
        last_name:  lastName,
        email_id:   data.email.toLowerCase(),
        role_id:    CATALYST_ROLE_MAP.TEAM_MEMBER,
        org_id:     orgId,
      };

      /** Invite via Catalyst registerUser — fatal if fails, no DB insert */
      const registeredUser = await this.auth.registerUser(signupConfig, userConfig);

      /** DB insert ONLY after successful Catalyst registration */
      const user = await this.db.insert(TABLES.USERS, {
        tenant_id:        tenantId,
        catalyst_user_id: registeredUser.user_details.user_id,
        catalyst_org_id:  registeredUser.user_details.org_id || orgId,
        email:            registeredUser.user_details.email_id,
        name:             data.name,
        role:             ROLES.TEAM_MEMBER,
        status:           USER_STATUS.INVITED,
        invited_by:       invitedBy,
      });

      const userId = String(user.ROWID);

      // Optional: assign to an org role immediately on invite
      if (data.orgRoleId) {
        try {
          await this.db.insert(TABLES.USER_ORG_ROLES, {
            tenant_id:   String(tenantId),
            user_id:     userId,
            org_role_id: String(data.orgRoleId),
            assigned_by: String(invitedBy),
            is_active:   'true',
          });
        } catch (_) { /* non-fatal — user is still invited */ }
      }

      await this.audit.log({
        tenantId, entityType: 'user', entityId: String(user.ROWID),
        action: AUDIT_ACTION.CREATE,
        newValue: { email: data.email, role: ROLES.TEAM_MEMBER, catalystUserId: registeredUser.user_details.user_id },
        performedBy: invitedBy,
      });

      return ResponseHelper.created(res, {
        user: {
          id:        userId,
          email:     data.email,
          name:      data.name,
          role:      ROLES.TEAM_MEMBER,
          status:    USER_STATUS.INVITED,
          orgRoleId: data.orgRoleId || null,
        },
      }, `Invitation sent to ${data.email}. They'll receive an email to set up their account.`);
    } catch (err) {
      console.error('[AdminController] inviteUserOrg error:', err.message);
      if (err.isValidation) return ResponseHelper.validationError(res, err.message, err.details);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/admin/users
   */
  async listUsers(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { status, role } = req.query;

      const conditions = [`tenant_id = '${tenantId}'`];
      if (status) conditions.push(`status = '${DataStoreService.escape(status)}'`);
      if (role) conditions.push(`role = '${DataStoreService.escape(role)}'`);

      const users = await this.db.query(
        `SELECT * FROM ${TABLES.USERS} WHERE ${conditions.join(' AND ')} ORDER BY CREATEDTIME DESC LIMIT 200`
      );

      // Fetch org role assignments for all users in one query
      let orgRoleMap = {};
      try {
        const assignments = await this.db.query(
          `SELECT user_id, org_role_id FROM ${TABLES.USER_ORG_ROLES} WHERE tenant_id = '${tenantId}' AND is_active = 'true' LIMIT 300`
        );
        assignments.forEach((a) => { orgRoleMap[String(a.user_id)] = String(a.org_role_id); });
      } catch (_) {}

      // Fetch timezones and shift assignments from user_profiles
      let timezoneMap = {};
      let shiftIdMap = {};
      try {
        const profiles = await this.db.query(
          `SELECT user_id, timezone, shift_id FROM ${TABLES.USER_PROFILES} WHERE tenant_id = '${tenantId}' LIMIT 300`
        );
        profiles.forEach((p) => {
          const uid = String(p.user_id);
          if (p.timezone) timezoneMap[uid] = p.timezone;
          if (p.shift_id && String(p.shift_id) !== '0') shiftIdMap[uid] = String(p.shift_id);
        });
      } catch (_) {}

      // Fetch officeLocationId per user from permission_overrides
      let locationMap = {};
      try {
        const overrides = await this.db.query(
          `SELECT user_id, permissions FROM ${TABLES.PERMISSION_OVERRIDES} WHERE tenant_id = '${tenantId}' AND is_active = 'true' LIMIT 300`
        );
        overrides.forEach((o) => {
          try {
            const parsed = JSON.parse(o.permissions || '{}');
            if (parsed.officeLocationId) locationMap[String(o.user_id)] = String(parsed.officeLocationId);
          } catch (_) {}
        });
      } catch (_) {}

      return ResponseHelper.success(res, {
        users: users.map((u) => ({
          id: String(u.ROWID), name: u.name, email: u.email,
          role: u.role, status: u.status, avatarUrl: u.avatar_url || u.avtar_url || '',
          invitedBy: u.invited_by, createdAt: u.CREATEDTIME,
          orgRoleId: orgRoleMap[String(u.ROWID)] || null,
          timezone: timezoneMap[String(u.ROWID)] || '',
          shiftId: shiftIdMap[String(u.ROWID)] || null,
          officeLocationId: locationMap[String(u.ROWID)] || null,
        })),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * PUT /api/admin/users/:userId
   * Update role or status.
   */
  async updateUser(req, res) {
    try {
      const { tenantId, id: performedBy } = req.currentUser;
      const { userId } = req.params;

      const existing = await this.db.findById(TABLES.USERS, userId, tenantId);
      if (!existing) return ResponseHelper.notFound(res, 'User not found');

      const { role, status, timezone, shift_id } = req.body;

      if (role && !Object.values(ROLES).includes(role)) {
        return ResponseHelper.validationError(res, `Invalid role: ${role}`);
      }

      const updatePayload = { ROWID: userId };
      if (role) updatePayload.role = role;
      if (status) updatePayload.status = status;

      if (Object.keys(updatePayload).length > 1) {
        await this.db.update(TABLES.USERS, updatePayload);
      }

      // Update timezone / shift_id in user_profiles (separate table)
      if (timezone !== undefined || shift_id !== undefined) {
        try {
          const profiles = await this.db.query(
            `SELECT ROWID FROM ${TABLES.USER_PROFILES} WHERE user_id = '${userId}' AND tenant_id = '${tenantId}' LIMIT 1`
          );
          const profileUpdate = {};
          if (timezone !== undefined) profileUpdate.timezone = String(timezone || '');
          if (shift_id !== undefined) profileUpdate.shift_id = shift_id ? String(shift_id) : '';
          if (profiles.length > 0) {
            await this.db.update(TABLES.USER_PROFILES, { ROWID: profiles[0].ROWID, ...profileUpdate });
          } else {
            await this.db.insert(TABLES.USER_PROFILES, {
              tenant_id: tenantId, user_id: userId,
              timezone: String(timezone || ''), shift_id: shift_id ? String(shift_id) : '',
              bio: '', photo_url: '', skills: '[]', experience: '[]', certifications: '[]',
              resume_url: '', social_links: '{}', is_profile_public: 'false',
            });
          }
        } catch (profileErr) {
          console.warn('[AdminController.updateUser] profile update failed:', profileErr.message);
        }
      }

      if (role && role !== existing.role) {
        await this.audit.log({
          tenantId, entityType: 'user', entityId: userId,
          action: AUDIT_ACTION.ROLE_CHANGE,
          oldValue: { role: existing.role },
          newValue: { role },
          performedBy,
        });
      }

      return ResponseHelper.success(res, {
        userId, role: role || existing.role, status: status || existing.status,
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * PUT /api/admin/users/:userId/location
   * Assign a user to an office location (stored in PERMISSION_OVERRIDES JSON).
   */
  async updateUserLocation(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { userId } = req.params;
      const { officeLocationId } = req.body; // null to unassign

      const existing = await this.db.findById(TABLES.USERS, userId, tenantId);
      if (!existing) return ResponseHelper.notFound(res, 'User not found');

      // Read existing PERMISSION_OVERRIDES for this user
      const overrideRows = await this.db.query(
        `SELECT ROWID, permissions FROM ${TABLES.PERMISSION_OVERRIDES} WHERE tenant_id = '${tenantId}' AND user_id = '${userId}' AND is_active = 'true' LIMIT 1`
      );
      let currentOverride = { granted: [], revoked: [], moduleAccess: [] };
      let overrideRowId = null;
      if (overrideRows.length > 0) {
        try { currentOverride = JSON.parse(overrideRows[0].permissions || '{}'); } catch (_) {}
        overrideRowId = String(overrideRows[0].ROWID);
      }

      // Merge officeLocationId into existing override
      const updated = { ...currentOverride };
      if (officeLocationId) updated.officeLocationId = String(officeLocationId);
      else delete updated.officeLocationId;

      if (overrideRowId) {
        await this.db.update(TABLES.PERMISSION_OVERRIDES, {
          ROWID: overrideRowId,
          permissions: JSON.stringify(updated),
        });
      } else {
        await this.db.insert(TABLES.PERMISSION_OVERRIDES, {
          tenant_id: tenantId, user_id: userId,
          permissions: JSON.stringify(updated),
          is_active: 'true',
        });
      }

      return ResponseHelper.success(res, { userId, officeLocationId: officeLocationId || null });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/admin/office-locations
   * Returns office locations from tenant settings.
   */
  async getOfficeLocations(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const tenantRows = await this.db.query(
        `SELECT settings FROM ${TABLES.TENANTS} WHERE ROWID = '${tenantId}' LIMIT 1`
      );
      let settings = {};
      if (tenantRows.length > 0) {
        try { settings = JSON.parse(tenantRows[0].settings || '{}'); } catch (_) {}
      }
      return ResponseHelper.success(res, { locations: settings.officeLocations || [] });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * DELETE /api/admin/users/:userId
   * Deactivate (not hard-delete) to preserve audit history.
   */
  async deactivateUser(req, res) {
    try {
      const { tenantId, id: performedBy } = req.currentUser;
      const { userId } = req.params;

      if (userId === performedBy) {
        return ResponseHelper.validationError(res, 'You cannot deactivate yourself');
      }

      const existing = await this.db.findById(TABLES.USERS, userId, tenantId);
      if (!existing) return ResponseHelper.notFound(res, 'User not found');

      await this.db.update(TABLES.USERS, { ROWID: userId, status: USER_STATUS.INACTIVE });

      await this.audit.log({
        tenantId, entityType: 'user', entityId: userId,
        action: AUDIT_ACTION.STATUS_CHANGE,
        oldValue: { status: existing.status },
        newValue: { status: USER_STATUS.INACTIVE },
        performedBy,
      });

      return ResponseHelper.success(res, null, 'User deactivated');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * PATCH /api/admin/users/:userId/activate
   * Re-activate a previously deactivated user.
   */
  async activateUser(req, res) {
    try {
      const { tenantId, id: performedBy } = req.currentUser;
      const { userId } = req.params;

      const existing = await this.db.findById(TABLES.USERS, userId, tenantId);
      if (!existing) return ResponseHelper.notFound(res, 'User not found');
      if (existing.status !== USER_STATUS.INACTIVE) {
        return ResponseHelper.validationError(res, 'User is not deactivated');
      }

      await this.db.update(TABLES.USERS, { ROWID: userId, status: USER_STATUS.ACTIVE });

      await this.audit.log({
        tenantId, entityType: 'user', entityId: userId,
        action: AUDIT_ACTION.STATUS_CHANGE,
        oldValue: { status: USER_STATUS.INACTIVE },
        newValue: { status: USER_STATUS.ACTIVE },
        performedBy,
      });

      return ResponseHelper.success(res, null, 'User reactivated');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/admin/audit-logs?action=&entityType=&performedBy=&dateFrom=&dateTo=&limit=
   * Returns enriched audit logs (performer name + email resolved, changes parsed).
   */
  async getAuditLogs(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { action, entityType, performedBy, dateFrom, dateTo, limit } = req.query;

      const audit = new AuditService(this.db);
      const logs = await audit.getFilteredLogs(tenantId, {
        action: action || null,
        entityType: entityType || null,
        performedBy: performedBy || null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        limit: Math.min(Number(limit) || 100, 200),
      });

      return ResponseHelper.success(res, { logs });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/admin/tenant
   * Get tenant settings.
   */
  async getTenant(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const tenants = await this.db.query(
        `SELECT * FROM ${TABLES.TENANTS} WHERE ROWID = '${tenantId}' LIMIT 1`
      );
      if (tenants.length === 0) return ResponseHelper.notFound(res, 'Tenant not found');

      const t = tenants[0];
      return ResponseHelper.success(res, {
        tenant: {
          id: String(t.ROWID), name: t.name, slug: t.slug,
          plan: t.plan, status: t.status,
          settings: (() => { try { return JSON.parse(t.settings || '{}'); } catch { return {}; } })(),
        },
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * PATCH /api/admin/tenant/settings
   * Merges provided keys into tenants.settings JSON. TENANT_ADMIN only.
   */
  async updateTenantSettings(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const updates = req.body; // e.g. { botEnabled: false }
      if (!updates || typeof updates !== 'object') {
        return ResponseHelper.validationError(res, 'Request body must be a settings object');
      }

      const rows = await this.db.query(
        `SELECT ROWID, settings FROM ${TABLES.TENANTS} WHERE ROWID = '${tenantId}' LIMIT 1`
      );
      if (rows.length === 0) return ResponseHelper.notFound(res, 'Tenant not found');

      const current = (() => { try { return JSON.parse(rows[0].settings || '{}'); } catch { return {}; } })();
      const merged  = { ...current, ...updates };

      await this.db.update(TABLES.TENANTS, {
        ROWID:    String(rows[0].ROWID),
        settings: JSON.stringify(merged),
      });

      console.log(`[AdminController] updateTenantSettings tenantId=${tenantId} keys=${Object.keys(updates).join(',')}`);
      return ResponseHelper.success(res, { settings: merged });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/admin/my-permissions
   * Returns the calling user's effective permissions (role defaults + overrides).
   * Any authenticated user can call this — no admin required.
   */
  async getMyPermissions(req, res) {
    try {
      const { tenantId, id: userId, role } = req.currentUser;
      const { ROLE_PERMISSIONS } = require('../utils/Constants');
      const rolePerms = ROLE_PERMISSIONS[role] || [];

      let granted = [], revoked = [];
      try {
        const rows = await this.db.query(
          `SELECT permissions FROM ${TABLES.PERMISSION_OVERRIDES} ` +
          `WHERE tenant_id = '${tenantId}' AND user_id = '${userId}' AND is_active = 'true' LIMIT 1`
        );
        if (rows.length > 0) {
          const parsed = JSON.parse(rows[0].permissions || '{}');
          granted = parsed.granted || [];
          revoked = parsed.revoked || [];
        }
      } catch (_) { /* table not yet created — fall back to role defaults */ }

      // Compute effective: (role ∪ granted) \ revoked
      const effective = new Set(rolePerms);
      granted.forEach((p) => effective.add(p));
      revoked.forEach((p) => effective.delete(p));

      return ResponseHelper.success(res, {
        role,
        permissions: Array.from(effective),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/admin/users/:userId/permissions
   * Returns the role-default permissions plus any per-user overrides.
   */
  async getUserPermissions(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { userId } = req.params;

      const user = await this.db.findById(TABLES.USERS, userId, tenantId);
      if (!user) return ResponseHelper.notFound(res, 'User not found');

      const { ROLE_PERMISSIONS, PERMISSIONS } = require('../utils/Constants');
      const rolePerms = ROLE_PERMISSIONS[user.role] || [];

      // Load org role permissions and merge with base role permissions
      let allRolePerms = rolePerms;
      let orgRoleId = null;
      let orgRoleName = null;
      try {
        const orgRoleRows = await this.db.query(
          `SELECT org_role_id FROM ${TABLES.USER_ORG_ROLES} ` +
          `WHERE tenant_id = '${tenantId}' AND user_id = '${userId}' AND is_active != 'false' LIMIT 1`
        );
        if (orgRoleRows.length > 0) {
          orgRoleId = orgRoleRows[0].org_role_id;

          // Load org role permissions
          const orgRolePermRows = await this.db.query(
            `SELECT permissions FROM ${TABLES.ORG_ROLE_PERMISSIONS} ` +
            `WHERE org_role_id = '${orgRoleId}' LIMIT 1`
          );
          if (orgRolePermRows.length > 0) {
            let orgRolePermissions = [];
            try {
              const parsed = JSON.parse(orgRolePermRows[0].permissions || '[]');
              if (Array.isArray(parsed)) {
                // Legacy format: ["TASK_READ", ...]
                orgRolePermissions = parsed;
              } else if (parsed && Array.isArray(parsed.p)) {
                // New object format: { "p": ["TASK_READ", ...], "m": ["people"] }
                orgRolePermissions = parsed.p;
              }
            } catch (_) { /* malformed JSON — skip */ }
            allRolePerms = [...new Set([...rolePerms, ...orgRolePermissions])];
          }

          // Load org role name
          const orgRoleNameRows = await this.db.query(
            `SELECT name FROM ${TABLES.ORG_ROLES} WHERE ROWID = '${orgRoleId}' LIMIT 1`
          );
          if (orgRoleNameRows.length > 0) {
            orgRoleName = orgRoleNameRows[0].name;
          }
        }
      } catch (_) {
        // Org role tables not yet created or lookup failed — fall back to role defaults only
        allRolePerms = rolePerms;
      }

      // Load per-user overrides from permission_overrides table
      // Schema: tenant_id(bigint), user_id(varchar), role(varchar), permissions(text JSON), is_active(boolean)
      // permissions JSON format: { "granted": [...], "revoked": [...] }
      let granted = [], revoked = [], moduleAccess = [];
      try {
        const rows = await this.db.query(
          `SELECT permissions FROM ${TABLES.PERMISSION_OVERRIDES} ` +
          `WHERE tenant_id = '${tenantId}' AND user_id = '${userId}' AND is_active = 'true' LIMIT 1`
        );
        if (rows.length > 0) {
          const parsed = JSON.parse(rows[0].permissions || '{}');
          granted = parsed.granted || [];
          revoked = parsed.revoked || [];
          moduleAccess = parsed.moduleAccess || [];
        }
      } catch (_) {
        // Table not yet created or user_id column missing — return role defaults only
      }

      return ResponseHelper.success(res, {
        userId,
        role: user.role,
        rolePermissions: allRolePerms,
        orgRoleId,
        orgRoleName,
        granted,
        revoked,
        moduleAccess,
        allPermissions: Object.values(PERMISSIONS),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * PUT /api/admin/users/:userId/permissions
   * Body: { granted: string[], revoked: string[] }
   * Upserts the per-user permission override row.
   */
  async setUserPermissions(req, res) {
    try {
      const { tenantId, id: performedBy } = req.currentUser;
      const { userId } = req.params;
      const { granted = [], revoked = [], moduleAccess = [] } = req.body;

      const user = await this.db.findById(TABLES.USERS, userId, tenantId);
      if (!user) return ResponseHelper.notFound(res, 'User not found');

      // Accept any string that looks like a valid permission key (uppercase letters, digits, underscores).
      // We intentionally do NOT filter against Object.values(PERMISSIONS) here — that would silently
      // drop newly-added permissions if the backend hasn't been restarted after a Constants update.
      const isValidPermKey = (p) => typeof p === 'string' && /^[A-Z][A-Z0-9_]{1,99}$/.test(p);
      const cleanGranted = granted.filter(isValidPermKey);
      const cleanRevoked = revoked.filter(isValidPermKey);
      const cleanModuleAccess = Array.isArray(moduleAccess) ? moduleAccess.filter((m) => typeof m === 'string') : [];

      const permJson = JSON.stringify({ granted: cleanGranted, revoked: cleanRevoked, moduleAccess: cleanModuleAccess });

      const existing = await this.db.query(
        `SELECT ROWID FROM ${TABLES.PERMISSION_OVERRIDES} ` +
        `WHERE tenant_id = '${tenantId}' AND user_id = '${userId}' LIMIT 1`
      );

      if (existing.length > 0) {
        await this.db.update(TABLES.PERMISSION_OVERRIDES, {
          ROWID: String(existing[0].ROWID),
          permissions: permJson,
          role: user.role,
          is_active: true,
        });
      } else {
        await this.db.insert(TABLES.PERMISSION_OVERRIDES, {
          tenant_id: String(tenantId),
          user_id: String(userId),
          role: user.role,
          permissions: permJson,
          is_active: true,
        });
      }

      await this.audit.log({
        tenantId, entityType: 'user_permissions', entityId: userId,
        action: AUDIT_ACTION.UPDATE,
        newValue: { granted: cleanGranted, revoked: cleanRevoked },
        performedBy,
      });

      return ResponseHelper.success(res, { userId, granted: cleanGranted, revoked: cleanRevoked, moduleAccess: cleanModuleAccess });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /** PUT /api/admin/modules — TENANT_ADMIN saves module enabled/disabled state */
  async updateModulePermissions(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { modules } = req.body;
      if (!modules || typeof modules !== 'object' || Array.isArray(modules)) {
        return ResponseHelper.validationError(res, 'modules must be an object map of { key: boolean }');
      }

      const rows = await this.db.query(
        `SELECT ROWID, settings FROM ${TABLES.TENANTS} WHERE ROWID = '${tenantId}' LIMIT 1`
      );
      if (rows.length === 0) return ResponseHelper.notFound(res, 'Tenant not found');

      const current = (() => { try { return JSON.parse(rows[0].settings || '{}'); } catch { return {}; } })();
      current.modules = { ...(current.modules || {}), ...modules };

      await this.db.update(TABLES.TENANTS, {
        ROWID: String(rows[0].ROWID),
        settings: JSON.stringify(current),
      });

      return ResponseHelper.success(res, { modules: current.modules });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /** GET /api/admin/modules — returns module enabled/disabled state for this tenant */
  async getModulePermissions(req, res) {
    try {
      const { tenantId } = req;
      const ALL_MODULES = [
        { key: 'projects', label: 'Projects & Sprints',  defaultEnabled: true  },
        { key: 'people',   label: 'People & HR',         defaultEnabled: true  },
        { key: 'assets',   label: 'Asset Management',    defaultEnabled: true  },
        { key: 'time',     label: 'Time Tracking',       defaultEnabled: true  },
        { key: 'reports',  label: 'Reports & Analytics', defaultEnabled: true  },
        { key: 'ai',       label: 'AI Insights',         defaultEnabled: true  },
        { key: 'exec',     label: 'Executive Dashboard', defaultEnabled: true  },
      ];

      let savedModules = {};
      try {
        const rows = await this.db.query(
          `SELECT settings FROM ${TABLES.TENANTS} WHERE ROWID = '${tenantId}' LIMIT 1`
        );
        if (rows.length > 0) {
          savedModules = (JSON.parse(rows[0].settings || '{}').modules) || {};
        }
      } catch (_) {}

      const modules = Object.fromEntries(
        ALL_MODULES.map((m) => [
          m.key,
          Object.prototype.hasOwnProperty.call(savedModules, m.key)
            ? savedModules[m.key]
            : m.defaultEnabled,
        ])
      );

      return ResponseHelper.success(res, { modules });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

// ─── Email Template ───────────────────────────────────────────────────────────

// Role-specific feature bullets shown in the invite email
const ROLE_FEATURES = {
  TENANT_ADMIN: [
    { icon: '⚙️', text: '<strong>Full admin access</strong> — manage users, projects and workspace settings.' },
    { icon: '📊', text: '<strong>Portfolio dashboard</strong> — see RAG health across every project.' },
    { icon: '📋', text: '<strong>Reports & insights</strong> — generate and share delivery reports.' },
  ],
  DELIVERY_LEAD: [
    { icon: '🚀', text: '<strong>Lead your projects</strong> — manage milestones, blockers and RAID logs.' },
    { icon: '📝', text: '<strong>Submit standups & EODs</strong> — keep stakeholders informed daily.' },
    { icon: '⚡', text: '<strong>Action tracking</strong> — assign, follow up and close action items.' },
    { icon: '📊', text: '<strong>Project dashboard</strong> — real-time RAG status and delivery health.' },
  ],
  PMO: [
    { icon: '📊', text: '<strong>Portfolio view</strong> — track delivery health across all projects.' },
    { icon: '📋', text: '<strong>Generate reports</strong> — weekly, monthly and custom delivery reports.' },
    { icon: '🔍', text: '<strong>Risk & issue visibility</strong> — full RAID register across the portfolio.' },
  ],
  TEAM_MEMBER: [
    { icon: '📝', text: '<strong>Daily standups</strong> — submit your updates and blockers every morning.' },
    { icon: '✅', text: '<strong>Action items</strong> — view and complete actions assigned to you.' },
    { icon: '🚧', text: '<strong>Blocker register</strong> — raise and track blockers on your project.' },
    { icon: '📅', text: '<strong>Milestone tracking</strong> — stay on top of key delivery dates.' },
  ],
  EXEC: [
    { icon: '📊', text: '<strong>Executive dashboard</strong> — portfolio-level RAG status at a glance.' },
    { icon: '📋', text: '<strong>Delivery reports</strong> — access detailed project and portfolio reports.' },
    { icon: '🔍', text: '<strong>Risk visibility</strong> — escalated blockers and critical issues.' },
  ],
  CLIENT: [
    { icon: '📊', text: '<strong>Project dashboard</strong> — live status of your project delivery.' },
    { icon: '📅', text: '<strong>Milestone updates</strong> — see key dates and delivery progress.' },
    { icon: '📋', text: '<strong>Shared reports</strong> — access delivery reports prepared for you.' },
  ],
};

function buildInviteEmailHtml({ firstName, lastName, inviterName, tenantName, orgRoleName }) {
  firstName = firstName || 'there';
  lastName  = lastName  || '';
  const fullName        = lastName ? `${firstName} ${lastName}` : firstName;
  const inviterInitials = (inviterName || 'OP').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const roleBadge       = orgRoleName || 'Team Member';
  const ctaUrl          = '%LINK%';

  const roleStr = orgRoleName ? ` as <strong style="color:#374151">${escapeHtml(orgRoleName)}</strong>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif">

<table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f1f5f9">
<tr><td align="center" style="padding:20px 0">

  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width:520px">

    <!-- Top accent bar -->
    <tr><td height="4" bgcolor="#4f46e5" style="font-size:0;line-height:0">&nbsp;</td></tr>

    <!-- Header -->
    <tr><td bgcolor="#1e1b4b" style="padding:28px 20px 22px">
      <table width="100%" border="0" cellpadding="0" cellspacing="0">
      <tr>
        <td width="36" height="36" bgcolor="#4f46e5" style="border-radius:8px;text-align:center;vertical-align:middle;font-size:18px;font-weight:bold;color:#ffffff;line-height:36px">
          &#9889;
        </td>
        <td style="padding-left:10px;vertical-align:middle">
          <div style="color:#ffffff;font-size:15px;font-weight:bold;margin:0;padding:0">DSV OpsPulse</div>
          <div style="color:#a5b4fc;font-size:10px;margin-top:2px">Delivery Intelligence Platform</div>
        </td>
      </tr>
      </table>
      <div style="color:#ffffff;font-size:20px;font-weight:bold;line-height:1.3;margin-top:18px">You're invited to join</div>
      <div style="color:#a5b4fc;font-size:20px;font-weight:bold;line-height:1.3;margin-bottom:8px">${escapeHtml(tenantName)}</div>
      <div style="color:#c7d2fe;font-size:13px;line-height:1.5">${escapeHtml(inviterName)} has added you to this workspace.</div>
    </td></tr>

    <!-- Inviter strip — single column, no letter-spacing -->
    <tr><td bgcolor="#f5f3ff" style="border-bottom:1px solid #e5e7eb;padding:14px 20px">
      <table border="0" cellpadding="0" cellspacing="0">
      <tr>
        <td width="36" height="36" bgcolor="#4f46e5" style="border-radius:18px;text-align:center;line-height:36px;font-size:13px;font-weight:bold;color:#ffffff;vertical-align:middle">
          ${escapeHtml(inviterInitials)}
        </td>
        <td style="padding-left:10px;vertical-align:middle">
          <div style="font-size:11px;color:#7c3aed;font-weight:bold">Invited by</div>
          <div style="font-size:14px;font-weight:bold;color:#1e1b4b;margin-top:2px">${escapeHtml(inviterName)}</div>
          <table border="0" cellpadding="0" cellspacing="0" style="margin-top:6px">
          <tr>
            <td bgcolor="#4f46e5" style="border-radius:12px;padding:3px 12px">
              <span style="color:#ffffff;font-size:11px;font-weight:bold;white-space:nowrap">${escapeHtml(roleBadge)}</span>
            </td>
          </tr>
          </table>
        </td>
      </tr>
      </table>
    </td></tr>

    <!-- Body -->
    <tr><td bgcolor="#ffffff" style="padding:24px 20px 20px">

      <p style="margin:0 0 6px;font-size:15px;color:#111827;font-weight:bold">Hi ${escapeHtml(fullName)},</p>
      <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6">
        <strong style="color:#374151">${escapeHtml(inviterName)}</strong> has invited you to collaborate on the <strong style="color:#374151">${escapeHtml(tenantName)}</strong> workspace${roleStr}. Accept your invitation below to get started.
      </p>

      <!-- CTA — table-based button so Gmail can't break the text -->
      <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
      <tr><td align="center">
        <table border="0" cellpadding="0" cellspacing="0">
        <tr>
          <td bgcolor="#4f46e5" style="border-radius:8px;padding:0">
            <a href="${ctaUrl}" style="display:block;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:14px 36px;white-space:nowrap">Accept Invitation</a>
          </td>
        </tr>
        </table>
        <p style="margin:8px 0 0;font-size:11px;color:#9ca3af">Button not working? <a href="${ctaUrl}" style="color:#4f46e5;text-decoration:underline">Copy this link</a></p>
      </td></tr>
      </table>

      <!-- Divider -->
      <table width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid #f3f4f6;font-size:0;line-height:0;padding-bottom:18px">&nbsp;</td></tr></table>

      <div style="font-size:11px;font-weight:bold;color:#9ca3af;margin-bottom:14px">HOW TO GET STARTED</div>

      <!-- Steps — no letter-spacing anywhere -->
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:10px">
      <tr>
        <td width="26" height="26" bgcolor="#ede9fe" style="border-radius:13px;text-align:center;line-height:26px;font-size:11px;font-weight:bold;color:#4f46e5;vertical-align:middle">1</td>
        <td style="padding-left:10px;font-size:13px;color:#4b5563;line-height:1.5">Click <strong style="color:#374151">Accept Invitation</strong> in this email.</td>
      </tr>
      </table>
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:10px">
      <tr>
        <td width="26" height="26" bgcolor="#ede9fe" style="border-radius:13px;text-align:center;line-height:26px;font-size:11px;font-weight:bold;color:#4f46e5;vertical-align:middle">2</td>
        <td style="padding-left:10px;font-size:13px;color:#4b5563;line-height:1.5">Set your password on the next screen.</td>
      </tr>
      </table>
      <table border="0" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td width="26" height="26" bgcolor="#ede9fe" style="border-radius:13px;text-align:center;line-height:26px;font-size:11px;font-weight:bold;color:#4f46e5;vertical-align:middle">3</td>
        <td style="padding-left:10px;font-size:13px;color:#4b5563;line-height:1.5">Log in and start collaborating on <strong style="color:#374151">${escapeHtml(tenantName)}</strong>.</td>
      </tr>
      </table>

    </td></tr>

    <!-- Footer -->
    <tr><td bgcolor="#f9fafb" style="border-top:1px solid #e5e7eb;padding:16px 20px;text-align:center">
      <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.7">
        Sent by <strong style="color:#6b7280">${escapeHtml(inviterName)}</strong> on behalf of <strong style="color:#6b7280">${escapeHtml(tenantName)}</strong>.<br/>
        If you weren't expecting this, you can safely ignore this email.<br/>
        &copy; ${new Date().getFullYear()} DSV OpsPulse
      </p>
    </td></tr>

  </table>

</td></tr>
</table>

</body>
</html>`;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = AdminController;
