'use strict';

const { TABLES } = require('../utils/Constants');

/**
 * TeamScopeService
 *
 * Resolves the set of user IDs the current user is allowed to see under the
 * TIME_TEAM_VIEW permission. A user counts as a "team peer" if they share at
 * least one team with the caller — either as a co-member, or because the
 * caller is the team's designated lead (lead_user_id), or because the caller
 * holds a lead-level role in team_members.
 *
 * Always includes the caller themselves so queries filtered by this scope
 * still surface the caller's own entries.
 */
class TeamScopeService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Returns an array of string user IDs the caller may view under
   * TIME_TEAM_VIEW. Always includes the caller's own id.
   */
  async getTeamPeerUserIds(tenantId, selfUserId) {
    const self = String(selfUserId);
    const tid  = String(tenantId);
    const out  = new Set([self]);

    try {
      // 1. All teams the user is a member of
      const memberRows = await this.db.findWhere(
        TABLES.TEAM_MEMBERS, tid,
        `user_id = '${self}'`,
        { limit: 200 }
      );
      const myTeamIds = new Set(memberRows.map((m) => String(m.team_id)).filter(Boolean));

      // 2. All teams the user leads via lead_user_id
      const ledTeams = await this.db.findWhere(
        TABLES.TEAMS, tid,
        `lead_user_id = '${self}'`,
        { limit: 200 }
      );
      ledTeams.forEach((t) => myTeamIds.add(String(t.ROWID)));

      // Add the designated leads of the teams I'm in (member sees their TL's entries)
      if (memberRows.length > 0) {
        const teamIdList = Array.from(myTeamIds).filter(Boolean);
        if (teamIdList.length > 0) {
          const inList = teamIdList.map((id) => `'${id}'`).join(',');
          const teams = await this.db.findWhere(
            TABLES.TEAMS, tid, `ROWID IN (${inList})`, { limit: 200 }
          );
          teams.forEach((t) => { if (t.lead_user_id) out.add(String(t.lead_user_id)); });
        }
      }

      // 3. All members of every team I'm in or lead
      if (myTeamIds.size > 0) {
        const teamIdList = Array.from(myTeamIds);
        const chunkSize = 20;
        for (let i = 0; i < teamIdList.length; i += chunkSize) {
          const slice = teamIdList.slice(i, i + chunkSize);
          const inList = slice.map((id) => `'${id}'`).join(',');
          const allMembers = await this.db.findWhere(
            TABLES.TEAM_MEMBERS, tid, `team_id IN (${inList})`, { limit: 300 }
          );
          allMembers.forEach((m) => { if (m.user_id) out.add(String(m.user_id)); });
        }
      }
    } catch (err) {
      console.warn('[TeamScopeService.getTeamPeerUserIds]', err.message);
    }

    return Array.from(out);
  }
}

module.exports = TeamScopeService;
