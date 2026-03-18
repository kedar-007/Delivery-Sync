'use strict';

const DataStoreService = require('../services/DataStoreService');
const NotificationService = require('../services/NotificationService');
const ResponseHelper = require('../utils/ResponseHelper');
const { TABLES, NOTIFICATION_TYPE } = require('../utils/Constants');

/**
 * TeamController – Delivery Leads create/manage teams within projects.
 * Teams allow bulk-assigning users and tracking reporting structure.
 *
 * DB tables required (create in Catalyst Console):
 *   teams        – tenant_id, project_id, name, description, lead_user_id, created_by
 *   team_members – tenant_id, team_id, user_id, role
 */
class TeamController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
    this.notifier = new NotificationService(catalystApp, this.db);
  }

  /**
   * POST /api/teams
   */
  async createTeam(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const { name, description, project_id, lead_user_id } = req.body;

      if (!name) return ResponseHelper.validationError(res, 'Team name is required');
      if (!project_id) return ResponseHelper.validationError(res, 'project_id is required');

      const project = await this.db.findById(TABLES.PROJECTS, project_id, tenantId);
      if (!project) return ResponseHelper.notFound(res, 'Project not found');

      const { standup_time, eod_time, timezone } = req.body;

      const insertPayload = {
        tenant_id: tenantId,
        project_id,
        name: name.trim(),
        created_by: userId,
      };
      if (description)   insertPayload.description = description;
      if (lead_user_id)  insertPayload.lead_user_id = lead_user_id;
      if (standup_time)  insertPayload.standup_time = standup_time;
      if (eod_time)      insertPayload.eod_time = eod_time;
      if (timezone)      insertPayload.timezone = timezone;

      const team = await this.db.insert(TABLES.TEAMS, insertPayload);

      return ResponseHelper.created(res, {
        team: {
          id: String(team.ROWID),
          name: insertPayload.name,
          description: description || '',
          projectId: project_id,
          leadUserId: lead_user_id || null,
          memberCount: 0,
        },
      }, 'Team created');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/teams?projectId=
   */
  async getTeams(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { projectId } = req.query;

      const filters = { tenant_id: tenantId };
      if (projectId) filters.project_id = projectId;

      const teams = await this.db.findAll(TABLES.TEAMS, filters, { limit: 100 });

      // Enrich with member count and lead name
      const result = await Promise.all(teams.map(async (t) => {
        const members = await this.db.findAll(TABLES.TEAM_MEMBERS,
          { tenant_id: tenantId, team_id: String(t.ROWID) }, { limit: 100 });

        let leadName = '';
        if (t.lead_user_id) {
          const lead = await this.db.findById(TABLES.USERS, t.lead_user_id, tenantId);
          leadName = lead?.name || '';
        }

        return {
          id: String(t.ROWID),
          name: t.name,
          description: t.description || '',
          projectId: t.project_id,
          leadUserId: t.lead_user_id || null,
          leadName,
          memberCount: members.length,
          standupTime: t.standup_time || null,
          eodTime: t.eod_time || null,
          timezone: t.timezone || null,
        };
      }));

      return ResponseHelper.success(res, { teams: result });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/teams/:teamId
   */
  async getTeam(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { teamId } = req.params;

      const team = await this.db.findById(TABLES.TEAMS, teamId, tenantId);
      if (!team) return ResponseHelper.notFound(res, 'Team not found');

      const members = await this.db.findAll(TABLES.TEAM_MEMBERS,
        { tenant_id: tenantId, team_id: teamId }, { limit: 100 });

      // Collect all user IDs to fetch: members + lead (if not already in members)
      const memberUserIds = members.map((m) => String(m.user_id));
      const allUserIds = team.lead_user_id
        ? [...new Set([...memberUserIds, String(team.lead_user_id)])]
        : memberUserIds;

      let userMap = {};
      if (allUserIds.length > 0) {
        const idList = allUserIds.map((id) => `'${id}'`).join(',');
        const users = await this.db.query(
          `SELECT * FROM ${TABLES.USERS} WHERE ROWID IN (${idList}) LIMIT 200`
        );
        users.forEach((u) => { userMap[String(u.ROWID)] = u; });
      }

      // Build lead object from lead_user_id (authoritative source)
      let lead = null;
      if (team.lead_user_id) {
        const lu = userMap[String(team.lead_user_id)];
        if (lu) {
          lead = {
            userId: String(team.lead_user_id),
            name: lu.name || '',
            email: lu.email || '',
            avatarUrl: lu.avatar_url || lu.avtar_url || '',
          };
        }
      }

      return ResponseHelper.success(res, {
        team: {
          id: String(team.ROWID),
          name: team.name,
          description: team.description || '',
          projectId: team.project_id,
          leadUserId: team.lead_user_id || null,
          lead,
          standupTime: team.standup_time || null,
          eodTime: team.eod_time || null,
          timezone: team.timezone || null,
          members: members.map((m) => {
            const u = userMap[String(m.user_id)] || {};
            return {
              id: String(m.ROWID),
              userId: String(m.user_id),
              name: u.name || '',
              email: u.email || '',
              avatarUrl: u.avatar_url || u.avtar_url || '',
              role: m.role || 'MEMBER',
            };
          }),
        },
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * PUT /api/teams/:teamId
   */
  async updateTeam(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { teamId } = req.params;
      const { name, description, lead_user_id } = req.body;

      const team = await this.db.findById(TABLES.TEAMS, teamId, tenantId);
      if (!team) return ResponseHelper.notFound(res, 'Team not found');

      const { standup_time, eod_time, timezone } = req.body;

      const updatePayload = { ROWID: teamId };
      if (name)                        updatePayload.name = name.trim();
      if (description !== undefined)   updatePayload.description = description;
      if (lead_user_id !== undefined)  updatePayload.lead_user_id = lead_user_id;
      if (standup_time !== undefined)  updatePayload.standup_time = standup_time;
      if (eod_time !== undefined)      updatePayload.eod_time = eod_time;
      if (timezone !== undefined)      updatePayload.timezone = timezone;

      await this.db.update(TABLES.TEAMS, updatePayload);
      return ResponseHelper.success(res, { teamId }, 'Team updated');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * DELETE /api/teams/:teamId
   */
  async deleteTeam(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { teamId } = req.params;

      const team = await this.db.findById(TABLES.TEAMS, teamId, tenantId);
      if (!team) return ResponseHelper.notFound(res, 'Team not found');

      // Remove all team members first
      const members = await this.db.findAll(TABLES.TEAM_MEMBERS,
        { tenant_id: tenantId, team_id: teamId }, { limit: 100 });
      await Promise.all(members.map((m) => this.db.delete(TABLES.TEAM_MEMBERS, String(m.ROWID))));

      await this.db.delete(TABLES.TEAMS, teamId);
      return ResponseHelper.success(res, null, 'Team deleted');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * POST /api/teams/:teamId/members
   */
  async addTeamMember(req, res) {
    try {
      const { tenantId, id: addedBy } = req.currentUser;
      const { teamId } = req.params;
      const { user_id, role = 'MEMBER' } = req.body;

      if (!user_id) return ResponseHelper.validationError(res, 'user_id is required');

      const team = await this.db.findById(TABLES.TEAMS, teamId, tenantId);
      if (!team) return ResponseHelper.notFound(res, 'Team not found');

      const user = await this.db.findById(TABLES.USERS, user_id, tenantId);
      if (!user) return ResponseHelper.notFound(res, 'User not found');

      // Duplicate check
      const existing = await this.db.query(
        `SELECT ROWID FROM ${TABLES.TEAM_MEMBERS} ` +
        `WHERE tenant_id = '${tenantId}' AND team_id = '${teamId}' AND user_id = '${user_id}' LIMIT 1`
      );
      if (existing.length > 0) return ResponseHelper.conflict(res, 'User is already a team member');

      const normalizedRole = ['LEAD', 'MEMBER'].includes(role) ? role : 'MEMBER';
      const member = await this.db.insert(TABLES.TEAM_MEMBERS, {
        tenant_id: tenantId,
        team_id: teamId,
        user_id,
        role: normalizedRole,
      });

      // Notify added user — in-app + email (fire-and-forget)
      if (String(user_id) !== String(addedBy)) {
        (async () => {
          try {
            const [adder, project] = await Promise.all([
              this.db.findById(TABLES.USERS, addedBy, tenantId),
              this.db.findById(TABLES.PROJECTS, team.project_id, tenantId),
            ]);
            const adderName = adder?.name || 'A lead';
            const projectName = project?.name || '';
            await Promise.all([
              this.notifier.sendInApp({
                tenantId, userId: user_id,
                title: `Added to team "${team.name}"`,
                message: `${adderName} added you to the team "${team.name}" as ${normalizedRole}.`,
                type: NOTIFICATION_TYPE.TEAM_UPDATED,
                entityType: 'team',
                entityId: teamId,
                metadata: { teamName: team.name, role: normalizedRole, projectName },
              }),
              user.email
                ? this.notifier.sendTeamMemberAdded({
                    tenantId,
                    userId: user_id,
                    toEmail: user.email,
                    toName: user.name || user.email,
                    teamName: team.name,
                    projectName,
                    addedBy: adderName,
                    teamRole: normalizedRole,
                  })
                : Promise.resolve(),
            ]);
          } catch (e) {
            console.error('[TeamController] notify failed:', e.message);
          }
        })();
      }

      return ResponseHelper.created(res, {
        member: {
          id: String(member.ROWID),
          userId: user_id,
          name: user.name,
          email: user.email,
          role: normalizedRole,
        },
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * DELETE /api/teams/:teamId/members/:memberId
   */
  async removeTeamMember(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { teamId, memberId } = req.params;

      const member = await this.db.findById(TABLES.TEAM_MEMBERS, memberId, tenantId);
      if (!member || String(member.team_id) !== teamId) {
        return ResponseHelper.notFound(res, 'Team member not found');
      }

      await this.db.delete(TABLES.TEAM_MEMBERS, memberId);
      return ResponseHelper.success(res, null, 'Member removed from team');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = TeamController;
