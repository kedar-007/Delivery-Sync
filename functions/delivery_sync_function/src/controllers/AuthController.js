'use strict';

const DataStoreService = require('../services/DataStoreService');
const ResponseHelper = require('../utils/ResponseHelper');
const { TABLES, USER_STATUS } = require('../utils/Constants');

/**
 * AuthController – handles user session resolution and first-time registration.
 */
class AuthController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
  }

  /**
   * GET /api/auth/me
   * Returns the current authenticated user's DS profile.
   */
  async getCurrentUser(req, res) {
    console.log("Current User",req.currentUser);
    try {
      return ResponseHelper.success(res, { user: req.currentUser });
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
   * GET /api/auth/users
   * Returns active users in the current user's tenant (for assignment dropdowns).
   * Available to all authenticated users.
   */
  async listTenantUsers(req, res) {
    try {
      const { tenantId } = req.currentUser;
      // Include ACTIVE and INVITED so newly invited users appear in assignment dropdowns
      const users = await this.db.query(
        `SELECT * FROM ${require('../utils/Constants').TABLES.USERS} ` +
        `WHERE tenant_id = '${tenantId}' AND status IN ('ACTIVE','INVITED') ` +
        `ORDER BY name ASC LIMIT 200`
      );
      return ResponseHelper.success(res, {
        users: users.map((u) => ({
          id: String(u.ROWID),
          name: u.name,
          email: u.email,
          role: u.role,
          // Handle both correct spelling and historical typo in DB column name
          avatarUrl: u.avatar_url || u.avtar_url || '',
        })),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = AuthController;
