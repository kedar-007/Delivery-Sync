'use strict';

const DataStoreService = require('../services/DataStoreService');
const ResponseHelper = require('../utils/ResponseHelper');
const Validator = require('../utils/Validator');
const { TABLES } = require('../utils/Constants');

/**
 * MemberController – manages project membership.
 */
class MemberController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
  }

  /**
   * GET /api/projects/:projectId/members
   */
  async listMembers(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { projectId } = req.params;

      const members = await this.db.findAll(TABLES.PROJECT_MEMBERS,
        { tenant_id: tenantId, project_id: projectId }, { limit: 100 });

      if (members.length === 0) return ResponseHelper.success(res, { members: [] });

      // Enrich with user details
      const userIds = [...new Set(members.map((m) => `'${m.user_id}'`))].join(',');
      const users = await this.db.query(
        `SELECT * FROM ${TABLES.USERS} ` +
        `WHERE tenant_id = '${tenantId}' AND ROWID IN (${userIds}) LIMIT 100`
      );
      const userMap = {};
      users.forEach((u) => { userMap[String(u.ROWID)] = u; });

      return ResponseHelper.success(res, {
        members: members.map((m) => {
          const u = userMap[String(m.user_id)] || {};
          return {
            id: String(m.ROWID),
            userId: String(m.user_id),
            name: u.name || '',
            email: u.email || '',
            userRole: u.role || '',
            projectRole: m.role,
            avatarUrl: u.avatar_url || u.avtar_url || '',
            addedBy: m.added_by,
          };
        }),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * POST /api/projects/:projectId/members
   */
  async addMember(req, res) {
    try {
      const { tenantId, id: addedBy } = req.currentUser;
      const { projectId } = req.params;
      const data = Validator.validateAddMember(req.body);

      // Verify project exists in this tenant
      const project = await this.db.findById(TABLES.PROJECTS, projectId, tenantId);
      if (!project) return ResponseHelper.notFound(res, 'Project not found');

      // Verify user exists in this tenant
      const user = await this.db.findById(TABLES.USERS, data.user_id, tenantId);
      if (!user) return ResponseHelper.notFound(res, 'User not found in this tenant');

      // Check for duplicate membership
      const existing = await this.db.query(
        `SELECT ROWID FROM ${TABLES.PROJECT_MEMBERS} WHERE tenant_id = '${tenantId}' ` +
        `AND project_id = '${projectId}' AND user_id = '${data.user_id}' LIMIT 1`
      );
      if (existing.length > 0) return ResponseHelper.conflict(res, 'User is already a project member');

      const member = await this.db.insert(TABLES.PROJECT_MEMBERS, {
        tenant_id: tenantId,
        project_id: projectId,
        user_id: data.user_id,
        role: data.role,
      });

      return ResponseHelper.created(res, {
        member: {
          id: String(member.ROWID),
          userId: data.user_id,
          projectRole: data.role,
          name: user.name,
          email: user.email,
        },
      });
    } catch (err) {
      if (err.isValidation) return ResponseHelper.validationError(res, err.message, err.details);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * DELETE /api/projects/:projectId/members/:memberId
   */
  async removeMember(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { projectId, memberId } = req.params;

      const member = await this.db.findById(TABLES.PROJECT_MEMBERS, memberId, tenantId);
      if (!member || String(member.project_id) !== projectId) {
        return ResponseHelper.notFound(res, 'Member record not found');
      }

      await this.db.delete(TABLES.PROJECT_MEMBERS, memberId);
      return ResponseHelper.success(res, null, 'Member removed');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = MemberController;
