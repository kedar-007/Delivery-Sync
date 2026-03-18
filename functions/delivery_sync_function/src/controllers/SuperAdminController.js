'use strict';

const DataStoreService = require('../services/DataStoreService');
const ResponseHelper = require('../utils/ResponseHelper');
const { TABLES } = require('../utils/Constants');

/**
 * SuperAdminController – SaaS operator-level management.
 * Only accessible to users with role = 'SUPER_ADMIN'.
 */
class SuperAdminController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
  }

  /** GET /api/super-admin/tenants */
  async listTenants(req, res) {
    try {
      const tenants = await this.db.query(
        `SELECT * FROM ${TABLES.TENANTS} ORDER BY CREATEDTIME DESC LIMIT 200`
      );
      // Count users per tenant
      const tenantIds = tenants.map(t => `'${t.ROWID}'`).join(',');
      let userCounts = {};
      if (tenantIds) {
        const users = await this.db.query(
          `SELECT tenant_id, COUNT(ROWID) as cnt FROM ${TABLES.USERS} WHERE tenant_id IN (${tenantIds}) GROUP BY tenant_id`
        );
        users.forEach(r => { userCounts[String(r.tenant_id)] = Number(r.cnt || 0); });
      }
      return ResponseHelper.success(res, {
        tenants: tenants.map(t => ({
          id: String(t.ROWID),
          name: t.name,
          slug: t.slug,
          plan: t.plan,
          status: t.status,
          userCount: userCounts[String(t.ROWID)] || 0,
          createdAt: t.CREATEDTIME,
        })),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /** PATCH /api/super-admin/tenants/:tenantId/status */
  async updateTenantStatus(req, res) {
    try {
      const { tenantId } = req.params;
      const { status } = req.body;
      if (!['ACTIVE', 'SUSPENDED', 'CANCELLED'].includes(status)) {
        return ResponseHelper.validationError(res, 'Invalid status');
      }
      await this.db.update(TABLES.TENANTS, { ROWID: tenantId, status });
      return ResponseHelper.success(res, null, 'Tenant status updated');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /** GET /api/super-admin/stats */
  async getStats(req, res) {
    try {
      const [tenants, users, projects] = await Promise.all([
        this.db.query(`SELECT ROWID, status FROM ${TABLES.TENANTS} ORDER BY CREATEDTIME DESC LIMIT 300`),
        this.db.query(`SELECT ROWID, status FROM ${TABLES.USERS} ORDER BY CREATEDTIME DESC LIMIT 300`),
        this.db.query(`SELECT ROWID, status FROM ${TABLES.PROJECTS} ORDER BY CREATEDTIME DESC LIMIT 300`),
      ]);
      return ResponseHelper.success(res, {
        stats: {
          totalTenants: tenants.length,
          activeTenants: tenants.filter(t => t.status === 'ACTIVE').length,
          totalUsers: users.length,
          activeUsers: users.filter(u => u.status === 'ACTIVE').length,
          totalProjects: projects.length,
          activeProjects: projects.filter(p => p.status === 'ACTIVE').length,
        },
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /** GET /api/super-admin/tenants/:tenantId/users */
  async listTenantUsers(req, res) {
    try {
      const { tenantId } = req.params;
      const users = await this.db.findAll(TABLES.USERS, { tenant_id: tenantId }, { orderBy: 'CREATEDTIME DESC', limit: 200 });
      return ResponseHelper.success(res, {
        users: users.map(u => ({
          id: String(u.ROWID),
          name: u.name,
          email: u.email,
          role: u.role,
          status: u.status,
        })),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = SuperAdminController;
