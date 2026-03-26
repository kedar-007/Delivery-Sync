'use strict';

const DataStoreService = require('../services/DataStoreService');
const AuditService     = require('../services/AuditService');
const ResponseHelper   = require('../utils/ResponseHelper');
const { TABLES, AUDIT_ACTION } = require('../utils/Constants');

class OrgController {
  constructor(catalystApp) {
    this.db    = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
  }

  // GET /api/people/org/hierarchy — flat list enriched with manager info
  async hierarchy(req, res) {
    try {
      const profiles = await this.db.findWhere(TABLES.USER_PROFILES, req.tenantId, '', { limit: 200 });
      const users    = await this.db.findAll(TABLES.USERS, { tenant_id: req.tenantId }, { limit: 200 });
      const userMap  = {};
      users.forEach(u => { userMap[String(u.ROWID)] = u; });

      const tree = profiles.map(p => {
        const u = userMap[String(p.user_id)] || {};
        const mgr = p.reporting_manager_id ? (userMap[String(p.reporting_manager_id)] || {}) : null;
        return {
          user_id: String(p.user_id),
          name: u.name || '',
          email: u.email || '',
          avatar_url: u.avatar_url || p.photo_url || '',
          designation: p.designation || '',
          department: p.department || '',
          reporting_manager_id: p.reporting_manager_id ? String(p.reporting_manager_id) : null,
          reporting_manager_name: mgr ? mgr.name : null,
        };
      });
      return ResponseHelper.success(res, tree);
    } catch (err) {
      console.error('[OrgController.hierarchy]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // GET /api/people/org/reports/:userId
  async directReports(req, res) {
    try {
      const { userId } = req.params;
      const reports = await this.db.findWhere(TABLES.USER_PROFILES, req.tenantId,
        `reporting_manager_id = '${DataStoreService.escape(userId)}'`, { limit: 100 });
      const users = await this.db.findAll(TABLES.USERS, { tenant_id: req.tenantId }, { limit: 200 });
      const userMap = {};
      users.forEach(u => { userMap[String(u.ROWID)] = u; });
      return ResponseHelper.success(res, reports.map(p => ({ ...p, user: userMap[String(p.user_id)] || null })));
    } catch (err) {
      console.error('[OrgController.directReports]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // GET /api/people/org/manager/:userId
  async getManager(req, res) {
    try {
      const profile = await this.db.findWhere(TABLES.USER_PROFILES, req.tenantId, `user_id = '${req.params.userId}'`, { limit: 1 });
      if (!profile[0] || !profile[0].reporting_manager_id) return ResponseHelper.success(res, null);
      const managerRows = await this.db.query(`SELECT ROWID, name, email FROM ${TABLES.USERS} WHERE ROWID = '${profile[0].reporting_manager_id}' LIMIT 1`);
      return ResponseHelper.success(res, managerRows[0] || null);
    } catch (err) {
      console.error('[OrgController.getManager]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // PUT /api/people/org/manager
  async setManager(req, res) {
    try {
      const { user_id, manager_id } = req.body;
      if (!user_id) return ResponseHelper.validationError(res, 'user_id required');

      const profile = await this.db.findWhere(TABLES.USER_PROFILES, req.tenantId, `user_id = '${DataStoreService.escape(user_id)}'`, { limit: 1 });
      if (profile.length > 0) {
        await this.db.update(TABLES.USER_PROFILES, { ROWID: profile[0].ROWID, reporting_manager_id: manager_id || 0 });
      } else {
        await this.db.insert(TABLES.USER_PROFILES, { tenant_id: String(req.tenantId), user_id: String(user_id), reporting_manager_id: String(manager_id || 0), bio: '', photo_url: '' });
      }

      await this.audit.log({ tenantId: req.tenantId, entityType: 'USER_PROFILE', entityId: user_id, action: AUDIT_ACTION.UPDATE, newValue: { reporting_manager_id: manager_id }, performedBy: req.currentUser.id });
      return ResponseHelper.success(res, { message: 'Reporting manager updated' });
    } catch (err) {
      console.error('[OrgController.setManager]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = OrgController;
