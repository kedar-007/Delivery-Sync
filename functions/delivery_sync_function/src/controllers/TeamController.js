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

      const basePayload = {
        tenant_id: tenantId,
        project_id,
        name: name.trim(),
        created_by: userId,
      };
      if (description)  basePayload.description = description;
      if (lead_user_id) basePayload.lead_user_id = lead_user_id;

      // Schedule fields require standup_time, eod_time, timezone columns in the teams table.
      // Try inserting with them first; if Catalyst rejects (columns not yet added), fall back
      // to inserting without them so team creation never fails.
      const schedulePayload = { ...basePayload };
      if (standup_time) schedulePayload.standup_time = standup_time;
      if (eod_time)     schedulePayload.eod_time = eod_time;
      if (timezone)     schedulePayload.timezone = timezone;

      let team;
      try {
        team = await this.db.insert(TABLES.TEAMS, schedulePayload);
      } catch (scheduleErr) {
        // Column doesn't exist yet — retry without schedule fields
        console.warn(
          '[TeamController] Schedule columns missing in teams table, retrying without them.',
          'Add standup_time (TEXT), eod_time (TEXT), timezone (TEXT) columns to the teams table in Catalyst Console.',
          'Error:', scheduleErr.message
        );
        team = await this.db.insert(TABLES.TEAMS, basePayload);
      }

      return ResponseHelper.created(res, {
        team: {
          id: String(team.ROWID),
          name: basePayload.name,
          description: description || '',
          projectId: project_id,
          leadUserId: lead_user_id || null,
          standupTime: standup_time || null,
          eodTime: eod_time || null,
          timezone: timezone || null,
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

      let teams;
      try {
        teams = await this.db.findAll(TABLES.TEAMS, filters, { limit: 100 });
      } catch (tableErr) {
        console.warn('[TeamController.getTeams] teams table may not exist yet:', tableErr.message);
        return ResponseHelper.success(res, { teams: [] });
      }

      if (teams.length === 0) return ResponseHelper.success(res, { teams: [] });

      // Fetch ALL team_members and ALL users in 2 bulk queries — avoids N concurrent
      // queries that hit Catalyst's COMPONENT concurrency limit.
      let allMembers = [];
      try {
        allMembers = await this.db.fetchAll(TABLES.TEAM_MEMBERS, tenantId, null);
      } catch (_) {}

      let allUsers = [];
      try {
        allUsers = await this.db.fetchAll(TABLES.USERS, tenantId, null);
      } catch (_) {}

      const userMap = {};
      allUsers.forEach(u => { userMap[String(u.ROWID)] = u.name || u.email || ''; });

      // Group member rows by team_id
      const membersByTeam = {};
      allMembers.forEach(m => {
        const tid = String(m.team_id);
        (membersByTeam[tid] = membersByTeam[tid] || []).push(m);
      });

      // Also build avatarUrl map
      const avatarMap = {};
      allUsers.forEach(u => {
        avatarMap[String(u.ROWID)] = u.avatar_url || u.avtar_url || '';
      });

      const result = teams.map(t => {
        const teamMembers = (membersByTeam[String(t.ROWID)] || []).map(m => ({
          id: String(m.user_id),
          name: userMap[String(m.user_id)] || '',
          avatarUrl: avatarMap[String(m.user_id)] || '',
          role: m.role || 'MEMBER',
        }));
        return {
          id: String(t.ROWID),
          name: t.name,
          description: t.description || '',
          projectId: t.project_id,
          leadUserId: t.lead_user_id || null,
          leadName: t.lead_user_id ? (userMap[String(t.lead_user_id)] || '') : '',
          memberCount: teamMembers.length,
          members: teamMembers,
          standupTime: t.standup_time || null,
          eodTime: t.eod_time || null,
          timezone: t.timezone || null,
        };
      });

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

      const baseUpdate = { ROWID: teamId };
      if (name)                       baseUpdate.name = name.trim();
      if (description !== undefined)  baseUpdate.description = description;
      if (lead_user_id !== undefined) baseUpdate.lead_user_id = lead_user_id;

      const fullUpdate = { ...baseUpdate };
      if (standup_time !== undefined) fullUpdate.standup_time = standup_time;
      if (eod_time !== undefined)     fullUpdate.eod_time = eod_time;
      if (timezone !== undefined)     fullUpdate.timezone = timezone;

      try {
        await this.db.update(TABLES.TEAMS, fullUpdate);
      } catch (scheduleErr) {
        console.warn('[TeamController] Schedule columns missing, updating without them. Add standup_time, eod_time, timezone columns to teams table.', scheduleErr.message);
        await this.db.update(TABLES.TEAMS, baseUpdate);
      }

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
