'use strict';

const { TABLES } = require('../utils/Constants');

/**
 * TeamScopeService — resolves the set of user IDs the current user can see
 * under any *_TEAM_VIEW permission (ATTENDANCE_TEAM_VIEW, STANDUP_TEAM_VIEW,
 * EOD_TEAM_VIEW).
 *
 * A user counts as a "team peer" if they share at least one team with the
 * current user — co-member of a team, lead of a team the current user is in,
 * or member of a team the current user leads. The caller's own id is always
 * included.
 */
class TeamScopeService {
  constructor(db) {
    this.db = db;
  }

  async getTeamPeerUserIds(tenantId, selfUserId) {
    const self = String(selfUserId);
    const tid  = String(tenantId);
    const out  = new Set([self]);

    try {
      // 1. Teams the user is a member of
      const memberRows = await this.db.findWhere(
        TABLES.TEAM_MEMBERS, tid,
        `user_id = '${self}'`,
        { limit: 200 }
      );
      const myTeamIds = new Set(memberRows.map((m) => String(m.team_id)).filter(Boolean));

      // 2. Teams the user leads
      const ledTeams = await this.db.findWhere(
        TABLES.TEAMS, tid,
        `lead_user_id = '${self}'`,
        { limit: 200 }
      );
      ledTeams.forEach((t) => myTeamIds.add(String(t.ROWID)));

      // 3. Leads of teams I'm in (so a member sees their TL's records)
      if (memberRows.length > 0 && myTeamIds.size > 0) {
        const teamIdList = Array.from(myTeamIds);
        const where = teamIdList.map((id) => `ROWID = '${id}'`).join(' OR ');
        const teams = await this.db.findWhere(TABLES.TEAMS, tid, where, { limit: 200 });
        teams.forEach((t) => { if (t.lead_user_id) out.add(String(t.lead_user_id)); });
      }

      // 4. All members of teams I'm in or lead
      if (myTeamIds.size > 0) {
        const teamIdList = Array.from(myTeamIds);
        const chunkSize  = 20;
        for (let i = 0; i < teamIdList.length; i += chunkSize) {
          const slice = teamIdList.slice(i, i + chunkSize);
          const where = slice.map((id) => `team_id = '${id}'`).join(' OR ');
          const allMembers = await this.db.findWhere(
            TABLES.TEAM_MEMBERS, tid, where, { limit: 500 }
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
