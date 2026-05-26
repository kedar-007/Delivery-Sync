'use strict';

const DataStoreService = require('../services/DataStoreService');
const CacheService = require('../services/CacheService');
const ResponseHelper = require('../utils/ResponseHelper');
const { TABLES, USER_STATUS } = require('../utils/Constants');

const AUTH_CTX_KEY_VERSION = 'v1';

/**
 * AuthController – handles user session resolution and first-time registration.
 */
class AuthController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
  }

  /**
   * GET /api/auth/me
   * Returns the current authenticated user's DS profile with effective permissions.
   * Permissions = base role defaults + org role permissions (org overrides loaded by AuthMiddleware).
   * Individual per-user overrides are excluded here for speed; use /admin/my-permissions for the full set.
   */
  async getCurrentUser(req, res) {
    try {
      const user = req.currentUser;
      // AuthMiddleware already built the full effective permissions (additive: role base + org role + individual overrides).
      // Use them directly — no need to rebuild here.
      const permissionsArray = Array.isArray(user.permissions) ? user.permissions : [];
      console.log(`[AuthController] /me user=${user.id} role=${user.role} orgRoleId=${user.orgRoleId} totalPerms=${permissionsArray.length}`);
      return ResponseHelper.success(res, {
        user: {
          ...user,
          permissions: permissionsArray,
        },
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * POST /api/auth/register-tenant
   * Called once by the very first user of a new tenant to create the tenant
   * record and set themselves as TENANT_ADMIN.
   * Body: { tenantName, domain }
   */
  async registerTenant(req, res) {
    try {
      const { tenantName, domain } = req.body;
      if (!tenantName || !domain) {
        return ResponseHelper.validationError(res, 'tenantName and domain are required');
      }

      // Get Catalyst user email
      const userManagement = req.catalystApp.userManagement();
      const catalystUser = await userManagement.getCurrentUser();
      const email = catalystUser.email_id.toLowerCase();
      const name = catalystUser.first_name
        ? `${catalystUser.first_name} ${catalystUser.last_name || ''}`.trim()
        : email;
      // Check slug uniqueness
      const existing = await this.db.query(
        `SELECT ROWID FROM ${TABLES.TENANTS} WHERE slug = '${DataStoreService.escape(domain)}' LIMIT 1`
      );
      if (existing.length > 0) {
        return ResponseHelper.conflict(res, 'Domain already taken');
      }

      // Create tenant
      const tenant = await this.db.insert(TABLES.TENANTS, {
        name: tenantName,
        slug: domain.toLowerCase(),
        plan: 'STARTER',
        status: 'ACTIVE',
        settings: '{}',
      });

      const tenantId = String(tenant.ROWID);

      // Create admin user
      const user = await this.db.insert(TABLES.USERS, {
        tenant_id: tenantId,
        catalyst_user_id: Number(catalystUser.user_id),
        email,
        name,
        role: 'TENANT_ADMIN',
        status: USER_STATUS.ACTIVE,
      });

      return ResponseHelper.created(res, {
        tenant: { id: tenantId, name: tenantName, domain },
        user: { id: String(user.ROWID), email, name, role: 'TENANT_ADMIN' },
      }, 'Tenant registered successfully');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * POST /api/auth/accept-invite
   * Called when an invited user logs in for the first time.
   * Body: { inviteToken } — token is the invite record ROWID (simplified flow).
   */
  async acceptInvite(req, res) {
    try {
      const userManagement = req.catalystApp.userManagement();
      const catalystUser = await userManagement.getCurrentUser();
      const email = catalystUser.email_id.toLowerCase();

      // Find pending user record created during invite
      const rows = await this.db.query(
        `SELECT * FROM ${TABLES.USERS} WHERE email = '${DataStoreService.escape(email)}' AND status = 'INVITED' LIMIT 1`
      );

      if (rows.length === 0) {
        return ResponseHelper.notFound(res, 'No pending invitation found for this email');
      }

      const pendingUser = rows[0];
      const name = catalystUser.first_name
        ? `${catalystUser.first_name} ${catalystUser.last_name || ''}`.trim()
        : email;

      // Activate the user
      await this.db.update(TABLES.USERS, {
        ROWID: pendingUser.ROWID,
        catalyst_user_id: Number(catalystUser.user_id),
        name,
        status: USER_STATUS.ACTIVE,
      });

      return ResponseHelper.success(res, {
        user: {
          id: String(pendingUser.ROWID),
          email,
          name,
          role: pendingUser.role,
          tenantId: String(pendingUser.tenant_id),
        },
      }, 'Invitation accepted');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }
  /**
   * POST /api/auth/setup-org
   * Called by an invited TENANT_ADMIN on first login (tenant_id='0' sentinel).
   * Creates the tenant record, links the user to it, and activates the account.
   * Body: { orgName, slug }
   * Not protected by full AuthMiddleware — only Catalyst session required.
   */
  async setupOrganisation(req, res) {
    try {
      const { orgName, slug } = req.body;
      if (!orgName || !slug) {
        return ResponseHelper.validationError(res, 'orgName and slug are required');
      }

      const slugClean = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!slugClean) {
        return ResponseHelper.validationError(res, 'slug must contain at least one letter or number');
      }

      const userManagement = req.catalystApp.userManagement();
      const catalystUser = await userManagement.getCurrentUser();
      const email = catalystUser.email_id.toLowerCase();
      const name  = catalystUser.first_name
        ? `${catalystUser.first_name} ${catalystUser.last_name || ''}`.trim()
        : email;

      // Find the TENANT_ADMIN with no org yet (status INVITED or ACTIVE with no tenant)
      const rows = await this.db.query(
        `SELECT * FROM ${TABLES.USERS} WHERE email = '${DataStoreService.escape(email)}' AND role = 'TENANT_ADMIN' AND status IN ('INVITED', 'ACTIVE') LIMIT 1`
      );

      if (rows.length === 0) {
        return ResponseHelper.notFound(res, 'No pending organisation setup found for this account');
      }

      const pendingUser = rows[0];

      // Check that tenant_id is the sentinel (no org yet), or that the linked tenant was deleted.
      if (pendingUser.tenant_id && String(pendingUser.tenant_id) !== '0') {
        const existingTenantRows = await this.db.query(
          `SELECT ROWID, slug FROM ${TABLES.TENANTS} WHERE ROWID = '${String(pendingUser.tenant_id)}' LIMIT 1`
        );
        if (existingTenantRows.length > 0) {
          // Org already exists — return the slug so the frontend can redirect to the dashboard
          // instead of leaving the user stranded on the org-setup page.
          return res.status(409).json({
            success: false,
            code: 'ALREADY_SETUP',
            message: 'Organisation already set up for this account',
            data: { tenantSlug: existingTenantRows[0].slug || '' },
          });
        }
        // Tenant was deleted — fall through and allow the user to create a new one.
      }

      // Slug uniqueness check
      const existingSlug = await this.db.query(
        `SELECT ROWID FROM ${TABLES.TENANTS} WHERE slug = '${DataStoreService.escape(slugClean)}' LIMIT 1`
      );
      if (existingSlug.length > 0) {
        return ResponseHelper.conflict(res, 'This domain slug is already taken — please choose another');
      }

      // Create tenant
      const tenant = await this.db.insert(TABLES.TENANTS, {
        name:     orgName.trim(),
        slug:     slugClean,
        plan:     'STARTER',
        status:   'ACTIVE',
        settings: '{}',
      });

      const tenantId = String(tenant.ROWID);

      // Activate the user and link to the new tenant
      await this.db.update(TABLES.USERS, {
        ROWID:            String(pendingUser.ROWID),
        tenant_id:        tenantId,
        catalyst_user_id: Number(catalystUser.user_id),
        name,
        status:           USER_STATUS.ACTIVE,
      });

      // Bust the server-side auth cache so the next /me call fetches fresh
      // tenant info (tenantName, tenantSlug) instead of serving stale data.
      try {
        const cache = new CacheService(req.catalystApp);
        await cache.invalidate(`authCtx:${AUTH_CTX_KEY_VERSION}:${String(pendingUser.ROWID)}`);
      } catch (_) { /* non-fatal */ }

      return ResponseHelper.created(res, {
        tenant: { id: tenantId, name: orgName.trim(), slug: slugClean },
        user:   { id: String(pendingUser.ROWID), email, name, role: 'TENANT_ADMIN', tenantId },
      }, 'Organisation created successfully');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/auth/users
   * Returns active users in the current user's tenant (for assignment dropdowns).
   * Available to all authenticated users.
   */
  async listTenantUsers(req, res) {
    try {
      const { tenantId } = req.currentUser;
      // Include ACTIVE and INVITED so newly invited users appear in assignment dropdowns
      const users = await this.db.query(
        `SELECT * FROM ${TABLES.USERS} ` +
        `WHERE tenant_id = '${tenantId}' AND status IN ('ACTIVE','INVITED') ` +
        `ORDER BY name ASC LIMIT 200`
      );

      // Build user → orgRoleName map via user_org_roles + org_roles
      const orgRoleMap = {};
      try {
        const assignments = await this.db.query(
          `SELECT user_id, org_role_id FROM ${TABLES.USER_ORG_ROLES} WHERE tenant_id = '${tenantId}' AND is_active = 'true' LIMIT 300`
        );
        if (assignments.length > 0) {
          const orgRoles = await this.db.query(
            `SELECT ROWID, name FROM ${TABLES.ORG_ROLES} WHERE tenant_id = '${tenantId}' LIMIT 200`
          );
          const roleNameMap = {};
          for (const r of orgRoles) roleNameMap[String(r.ROWID)] = r.name;
          for (const a of assignments) orgRoleMap[String(a.user_id)] = roleNameMap[String(a.org_role_id)] || null;
        }
      } catch (_) {}

      return ResponseHelper.success(res, {
        users: users.map((u) => ({
          id: String(u.ROWID),
          name: u.name,
          email: u.email,
          role: u.role,
          // Handle both correct spelling and historical typo in DB column name
          avatarUrl: u.avatar_url || u.avtar_url || '',
          orgRoleName: orgRoleMap[String(u.ROWID)] || null,
        })),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = AuthController;
