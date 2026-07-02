'use strict';

const DataStoreService = require('../services/DataStoreService');
const NotificationService = require('../services/NotificationService');
const ResponseHelper = require('../utils/ResponseHelper');
const Validator = require('../utils/Validator');
const { TABLES, NOTIFICATION_TYPE, PROJECT_MEMBER_ROLES } = require('../utils/Constants');

/**
 * MemberController – manages project membership.
 */
class MemberController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
    this.notifier = new NotificationService(catalystApp, this.db);
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

      // Notify the added user — in-app + email (fire-and-forget)
      if (String(data.user_id) !== String(addedBy)) {
        (async () => {
          try {
            const adder = await this.db.findById(TABLES.USERS, addedBy, tenantId);
            const adderName = adder?.name || 'An admin';
            await Promise.all([
              this.notifier.sendInApp({
                tenantId,
                userId: data.user_id,
                title: `Added to project "${project.name}"`,
                message: `${adderName} added you to project "${project.name}" as ${data.role}.`,
                type: NOTIFICATION_TYPE.MEMBER_ADDED,
                entityType: 'project',
                entityId: projectId,
                metadata: { projectName: project.name, role: data.role },
              }),
              user.email
                ? this.notifier.sendMemberAdded({
                    tenantId,
                    userId: data.user_id,
                    toEmail: user.email,
                    toName: user.name || user.email,
                    projectName: project.name,
                    addedBy: adderName,
                    projectRole: data.role,
                  })
                : Promise.resolve(),
            ]);
          } catch (e) {
            console.error('[MemberController] notify failed:', e.message);
          }
        })();
      }

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
   * POST /api/projects/:projectId/members/team
   * Adds all members of a team to the project at once (skips existing members).
   */
  async addTeamMembers(req, res) {
    try {
      const { tenantId, id: addedBy } = req.currentUser;
      const { projectId } = req.params;
      const { team_id } = req.body;

      if (!team_id) return ResponseHelper.validationError(res, 'team_id is required');

      const project = await this.db.findById(TABLES.PROJECTS, projectId, tenantId);
      if (!project) return ResponseHelper.notFound(res, 'Project not found');

      const teamMembers = await this.db.findAll(TABLES.TEAM_MEMBERS,
        { tenant_id: tenantId, team_id }, { limit: 200 });

      if (teamMembers.length === 0) {
        return ResponseHelper.success(res, { added: 0, skipped: 0 }, 'Team has no members');
      }

      // ZCQL caps LIMIT at 300 per query — overshooting errors the entire
      // query, so we must stay at or below 300 here.
      const existingRows = await this.db.query(
        `SELECT user_id FROM ${TABLES.PROJECT_MEMBERS} WHERE tenant_id = '${tenantId}' AND project_id = '${projectId}' LIMIT 300`
      );
      const existingUserIds = new Set(existingRows.map((r) => String(r.user_id)));

      const userIds = teamMembers.map((m) => String(m.user_id));
      const usersRows = await this.db.query(
        `SELECT ROWID, name, email, catalyst_user_id FROM ${TABLES.USERS} WHERE tenant_id = '${tenantId}' AND ROWID IN (${userIds.map((id) => `'${id}'`).join(',')}) LIMIT 200`
      );
      const userMap = {};
      usersRows.forEach((u) => { userMap[String(u.ROWID)] = u; });

      const adder = await this.db.findById(TABLES.USERS, addedBy, tenantId);
      const adderName = adder?.name || 'An admin';

      let added = 0;
      let skipped = 0;

      for (const tm of teamMembers) {
        const uid = String(tm.user_id);
        if (existingUserIds.has(uid)) { skipped++; continue; }

        const memberRole = tm.role || 'MEMBER';

        // Match the single-user `addMember` shape — the project_members table
        // does not have an `added_by` column, so including it makes Catalyst
        // reject the insert with "Invalid input value for column name".
        await this.db.insert(TABLES.PROJECT_MEMBERS, {
          tenant_id: tenantId,
          project_id: projectId,
          user_id: uid,
          role: memberRole,
        });
        added++;

        const u = userMap[uid];
        if (u && String(uid) !== String(addedBy)) {
          (async () => {
            try {
              await Promise.all([
                this.notifier.sendInApp({
                  tenantId,
                  userId: uid,
                  title: `Added to project "${project.name}"`,
                  message: `${adderName} added you to project "${project.name}" as ${memberRole}.`,
                  type: NOTIFICATION_TYPE.MEMBER_ADDED,
                  entityType: 'project',
                  entityId: projectId,
                  metadata: { projectName: project.name, role: memberRole },
                }),
                u.email
                  ? this.notifier.sendMemberAdded({
                      tenantId,
                      userId: uid,
                      toEmail: u.email,
                      toName: u.name || u.email,
                      projectName: project.name,
                      addedBy: adderName,
                      projectRole: memberRole,
                    })
                  : Promise.resolve(),
              ]);
            } catch (e) {
              console.error('[MemberController] addTeamMembers notify failed:', e.message);
            }
          })();
        }
      }

      return ResponseHelper.success(res, { added, skipped }, `${added} member(s) added, ${skipped} already in project`);
    } catch (err) {
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

  /**
   * PATCH /api/projects/:projectId/members/:memberId
   * Update a member's project role (e.g. fix a mistakenly-assigned role).
   */
  async updateMember(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { projectId, memberId } = req.params;
      const role = String(req.body?.role ?? '').trim();

      if (!PROJECT_MEMBER_ROLES.includes(role)) {
        return ResponseHelper.validationError(res, 'Invalid project role');
      }

      const member = await this.db.findById(TABLES.PROJECT_MEMBERS, memberId, tenantId);
      if (!member || String(member.project_id) !== projectId) {
        return ResponseHelper.notFound(res, 'Member record not found');
      }

      const updated = await this.db.update(TABLES.PROJECT_MEMBERS, { ROWID: String(memberId), role });
      return ResponseHelper.success(res, updated, 'Member role updated');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = MemberController;
