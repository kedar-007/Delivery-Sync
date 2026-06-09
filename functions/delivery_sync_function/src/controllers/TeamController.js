'use strict';

const DataStoreService = require('../services/DataStoreService');
const NotificationService = require('../services/NotificationService');
const TeamScopeService = require('../services/TeamScopeService');
const ResponseHelper = require('../utils/ResponseHelper');
const { TABLES, NOTIFICATION_TYPE } = require('../utils/Constants');

const VALID_MEMBER_ROLES = [
  'DELIVERY_LEAD', 'LEAD', 'TECH_LEAD', 'SCRUM_MASTER', 'PRODUCT_OWNER',
  'SENIOR_DEVELOPER', 'DEVELOPER', 'DEVOPS_ENGINEER',
  'BUSINESS_ANALYST', 'MIS_ANALYST', 'DATA_ANALYST',
  'TESTER', 'DESIGNER', 'TRAINEE', 'INTERN', 'MEMBER',
];

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
    this.catalystApp = catalystApp;
    this.db = new DataStoreService(catalystApp);
    this.notifier = new NotificationService(catalystApp, this.db);
  }

  // ─── Reminder Cron Helpers ────────────────────────────────────────────────────

  // Create (or recreate) daily CALENDAR crons for standup and/or EOD.
  // Targets the `team_reminder` job function via its function job pool.
  // All strings must match Catalyst's expected uppercase enum values.
  async _upsertReminderCrons(teamId, tenantId, teamName, standupTime, eodTime, timezone) {
    const schedules = [];
    if (standupTime) schedules.push({ type: 'STANDUP', time: standupTime, cronName: `standup_rem_${teamId}` });
    if (eodTime)     schedules.push({ type: 'EOD',     time: eodTime,     cronName: `eod_rem_${teamId}` });

    if (!schedules.length) {
      console.log(`[Cron] Team ${teamId}: no schedule times — skipping`);
      return;
    }

    let cronApi;
    try {
      cronApi = this.catalystApp.jobScheduling().cron();
    } catch (e) {
      console.error(`[Cron] Team ${teamId}: jobScheduling().cron() init failed —`, e.message);
      return;
    }

    const tz = timezone || 'UTC';
    console.log(`[Cron] _upsertReminderCrons START team=${teamId} tz=${tz} standup=${standupTime || 'none'} eod=${eodTime || 'none'}`);

    for (const { type, time, cronName } of schedules) {
      try {
        const [h, m] = time.split(':').map(Number);
        let remH = h, remM = m - 15;
        if (remM < 0) { remM += 60; remH -= 1; }
        if (remH < 0)  remH += 24;
        const fireAt = `${String(remH).padStart(2,'0')}:${String(remM).padStart(2,'0')}`;
        console.log(`[Cron] ${cronName}: scheduled=${time} → reminder fires at ${fireAt} ${tz}`);

        const jobName  = (type === 'STANDUP' ? 's_' : 'e_') + String(teamId).slice(-17);
        const cronBody = {
          cron_name:   cronName,
          cron_status: true,
          cron_type:   'Calendar',
          cron_detail: {
            hour: remH, minute: remM, second: 0,
            repetition_type: 'daily',
            timezone: tz,
          },
          job_meta: {
            job_name:    jobName,
            jobpool_name: 'TeamReminder',
            jobpool_id:  '17682000001904407',
            target_type: 'Function',
            target_name: 'team_reminder',
            job_config: { number_of_retries: 2, retry_interval: 15 * 60 },
            params: { team_id: teamId, tenant_id: tenantId, type, time, team_name: teamName },
          },
        };

        // Try to update existing cron first; fall back to create if it doesn't exist yet
        let result;
        try {
          result = await cronApi.updateCron(cronName, cronBody);
          console.log(`[Cron] ${cronName}: UPDATED → id=${result?.cron_id || result?.id || JSON.stringify(result)}`);
        } catch (updateErr) {
          console.log(`[Cron] ${cronName}: update failed (${updateErr.message}) — attempting createCron`);
          result = await cronApi.createCron(cronBody);
          console.log(`[Cron] ${cronName}: CREATED → id=${result?.cron_id || result?.id || JSON.stringify(result)}`);
        }
      } catch (e) {
        console.error(`[Cron] ${cronName}: FAILED — ${e.message}`);
      }
    }

    console.log(`[Cron] _upsertReminderCrons DONE team=${teamId}`);
  }

  // Pause (disable) both reminder crons without deleting them.
  async _pauseReminderCrons(teamId) {
    let cronApi;
    try {
      cronApi = this.catalystApp.jobScheduling().cron();
    } catch (e) {
      console.error(`[Cron] _pauseReminderCrons team ${teamId}: init failed —`, e.message);
      return;
    }
    for (const cronName of [`standup_rem_${teamId}`, `eod_rem_${teamId}`]) {
      try {
        await cronApi.pauseCron(cronName);
        console.log(`[Cron] ${cronName}: PAUSED (reminders disabled)`);
      } catch (e) {
        console.warn(`[Cron] ${cronName}: pause skipped (may not exist) —`, e.message);
      }
    }
  }

  // Delete both reminder crons when a team is deleted.
  async _deleteReminderCrons(teamId) {
    let cronApi;
    try {
      cronApi = this.catalystApp.jobScheduling().cron();
    } catch (e) {
      console.error(`[Cron] _deleteReminderCrons team ${teamId}: jobScheduling().cron() failed —`, e.message);
      return;
    }
    for (const cronName of [`standup_rem_${teamId}`, `eod_rem_${teamId}`]) {
      try {
        await cronApi.deleteCron(cronName);
        console.log(`[Cron] ${cronName}: deleted on team removal`);
      } catch (e) {
        console.warn(`[Cron] ${cronName}: delete skipped (may not exist) —`, e.message);
      }
    }
  }

  /**
   * POST /api/teams
   */
  async createTeam(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const { name, description, project_id, lead_user_id } = req.body;

      if (!name) return ResponseHelper.validationError(res, 'Team name is required');

      const { standup_time, eod_time, timezone, reminders_enabled } = req.body;
      const remindersOn = String(reminders_enabled) !== 'false';

      const basePayload = {
        tenant_id: tenantId,
        name: name.trim(),
        created_by: userId,
      };
      if (project_id) basePayload.project_id = project_id;
      if (description)  basePayload.description = description;
      if (lead_user_id) basePayload.lead_user_id = lead_user_id;

      const schedulePayload = { ...basePayload };
      if (standup_time) schedulePayload.standup_time = standup_time;
      if (eod_time)     schedulePayload.eod_time = eod_time;
      if (timezone)     schedulePayload.timezone = timezone;
      schedulePayload.reminders_enabled = remindersOn;

      let team;
      try {
        team = await this.db.insert(TABLES.TEAMS, schedulePayload);
      } catch (scheduleErr) {
        console.warn('[TeamController] Schedule columns missing, retrying without them.', scheduleErr.message);
        team = await this.db.insert(TABLES.TEAMS, basePayload);
      }

      // Fire-and-forget: create daily reminder crons only if notifications are enabled
      if (remindersOn && (standup_time || eod_time)) {
        this._upsertReminderCrons(
          String(team.ROWID), tenantId, name.trim(), standup_time, eod_time, timezone
        ).catch(e => console.error('[TeamController] createTeam cron setup failed:', e.message));
      }

      return ResponseHelper.created(res, {
        team: {
          id: String(team.ROWID),
          name: basePayload.name,
          description: description || '',
          projectId: project_id || null,
          leadUserId: lead_user_id || null,
          standupTime: standup_time || null,
          eodTime: eod_time || null,
          timezone: timezone || null,
          remindersEnabled: remindersOn,
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
          remindersEnabled: String(t.reminders_enabled) !== 'false',
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
          remindersEnabled: String(team.reminders_enabled) !== 'false',
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

      const { standup_time, eod_time, timezone, reminders_enabled } = req.body;

      const baseUpdate = { ROWID: teamId };
      if (name)                       baseUpdate.name = name.trim();
      if (description !== undefined)  baseUpdate.description = description;
      if (lead_user_id !== undefined) baseUpdate.lead_user_id = lead_user_id;

      const fullUpdate = { ...baseUpdate };
      if (standup_time !== undefined)     fullUpdate.standup_time = standup_time;
      if (eod_time !== undefined)         fullUpdate.eod_time = eod_time;
      if (timezone !== undefined)         fullUpdate.timezone = timezone;
      if (reminders_enabled !== undefined) fullUpdate.reminders_enabled = String(reminders_enabled) !== 'false';

      try {
        await this.db.update(TABLES.TEAMS, fullUpdate);
      } catch (scheduleErr) {
        console.warn('[TeamController] Schedule columns missing, updating without them.', scheduleErr.message);
        await this.db.update(TABLES.TEAMS, baseUpdate);
      }

      // Fire-and-forget: handle crons whenever schedule or enabled flag changes
      const scheduleChanged = standup_time !== undefined || eod_time !== undefined || timezone !== undefined || reminders_enabled !== undefined;
      if (scheduleChanged) {
        const remindersOn = reminders_enabled !== undefined
          ? String(reminders_enabled) !== 'false'
          : String(team.reminders_enabled) !== 'false';

        if (!remindersOn) {
          this._pauseReminderCrons(teamId)
            .catch(e => console.error('[TeamController] updateTeam cron pause failed:', e.message));
        } else {
          const effectiveStandup = standup_time !== undefined ? standup_time : (team.standup_time || null);
          const effectiveEod     = eod_time     !== undefined ? eod_time     : (team.eod_time     || null);
          const effectiveTz      = timezone     !== undefined ? timezone     : (team.timezone      || 'UTC');
          this._upsertReminderCrons(
            teamId, tenantId, team.name, effectiveStandup, effectiveEod, effectiveTz
          ).catch(e => console.error('[TeamController] updateTeam cron setup failed:', e.message));
        }
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

      // Fire-and-forget: clean up daily reminder crons before deleting the team row
      this._deleteReminderCrons(teamId)
        .catch(e => console.error('[TeamController] deleteTeam cron cleanup failed:', e.message));

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

      const normalizedRole = VALID_MEMBER_ROLES.includes(role) ? role : 'MEMBER';
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
   * PATCH /api/teams/:teamId/members/:memberId
   */
  async updateTeamMember(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { teamId, memberId } = req.params;
      const { role } = req.body;

      if (!role) return ResponseHelper.validationError(res, 'role is required');

      const member = await this.db.findById(TABLES.TEAM_MEMBERS, memberId, tenantId);
      if (!member || String(member.team_id) !== teamId) {
        return ResponseHelper.notFound(res, 'Team member not found');
      }

      const normalizedRole = VALID_MEMBER_ROLES.includes(role) ? role : 'MEMBER';
      await this.db.update(TABLES.TEAM_MEMBERS, { ROWID: memberId, role: normalizedRole });

      return ResponseHelper.success(res, { memberId, role: normalizedRole }, 'Member role updated');
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

  /**
   * GET /api/teams/peers
   *
   * Returns the user roster the caller is allowed to see in the User filter
   * dropdown on Team Standups / Team EODs / Team Attendance:
   *
   *   - Org-wide callers (TENANT_ADMIN, or anyone whose dataScope is
   *     ORG_WIDE / SUBORDINATES) → every active user in the tenant. The
   *     *_TEAM_VIEW endpoints already grant these callers visibility on
   *     everyone, so the dropdown must match — otherwise admins see entries
   *     in the list that they can't actually filter by.
   *   - Everyone else → the set resolved by `TeamScopeService.getTeamPeerUserIds`
   *     (peers from teams the caller is in or leads).
   *
   * Open to any authenticated user — the result is scoped to what the caller
   * can already see elsewhere, so there's no extra data exposure.
   */
  async getMyTeamPeers(req, res) {
    try {
      const { tenantId, id: userId, role, dataScope } = req.currentUser;

      // Org-wide visibility — match what the *_TEAM_VIEW endpoints already
      // permit. A TENANT_ADMIN whose only "team" is themselves still needs to
      // see every user in the dropdown so they can filter the list.
      const isOrgWide =
        role === 'TENANT_ADMIN' ||
        role === 'SUPER_ADMIN'  ||
        dataScope === 'ORG_WIDE' ||
        dataScope === 'SUBORDINATES';

      console.log(`[TeamController.getMyTeamPeers] caller userId=${userId} tenantId=${tenantId} role=${role} dataScope=${dataScope} isOrgWide=${isOrgWide}`);

      if (isOrgWide) {
        // ZCQL caps LIMIT at 300 per query — overshoot errors the whole call.
        const allUsers = await this.db.findWhere(
          TABLES.USERS, tenantId, null,
          { orderBy: 'name ASC', limit: 300 }
        );
        const peers = allUsers
          .map((u) => ({
            id:        String(u.ROWID),
            name:      u.name || u.email || 'Team member',
            email:     u.email || null,
            avatarUrl: u.avatar_url || null,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        console.log(`[TeamController.getMyTeamPeers] org-wide path returning ${peers.length} peers`);
        return ResponseHelper.success(res, {
          peers,
          _debug: { caller: { userId, tenantId, role, dataScope }, isOrgWide: true, source: 'org-wide all-users', count: peers.length },
        });
      }

      const scope = new TeamScopeService(this.db);
      const userIds = await scope.getTeamPeerUserIds(tenantId, userId);
      console.log(`[TeamController.getMyTeamPeers] team-scope resolved userIds=${JSON.stringify(userIds)}`);
      if (!userIds.length) {
        return ResponseHelper.success(res, {
          peers: [],
          _debug: { caller: { userId, tenantId, role, dataScope }, isOrgWide: false, resolvedUserIds: userIds, reason: 'team-scope returned empty' },
        });
      }

      const inList = userIds.map((id) => `'${DataStoreService.escape(String(id))}'`).join(',');
      // ZCQL caps LIMIT at 300 per query.
      const rows = await this.db.query(
        `SELECT ROWID, name, email, avatar_url FROM ${TABLES.USERS} WHERE ROWID IN (${inList}) LIMIT 300`
      );
      console.log(`[TeamController.getMyTeamPeers] user lookup returned ${rows.length} rows`);

      const peers = rows
        .map((u) => ({
          id:        String(u.ROWID),
          name:      u.name || u.email || 'Team member',
          email:     u.email || null,
          avatarUrl: u.avatar_url || null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return ResponseHelper.success(res, {
        peers,
        _debug: { caller: { userId, tenantId, role, dataScope }, isOrgWide: false, resolvedUserIds: userIds, userLookupCount: rows.length },
      });
    } catch (err) {
      console.error('[TeamController.getMyTeamPeers] failed:', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = TeamController;
