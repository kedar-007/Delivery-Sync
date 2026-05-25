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
      console.log(`[TeamScope] self=${self} tid=${tid} memberRows=${memberRows.length} myTeamIds=${JSON.stringify(Array.from(myTeamIds))}`);

      // 2. Teams the user leads
      const ledTeams = await this.db.findWhere(
        TABLES.TEAMS, tid,
        `lead_user_id = '${self}'`,
        { limit: 200 }
      );
      ledTeams.forEach((t) => myTeamIds.add(String(t.ROWID)));
      console.log(`[TeamScope] ledTeams=${ledTeams.length} teamIds-after-led=${JSON.stringify(Array.from(myTeamIds))}`);

      // 3. Leads of teams I'm in (so a member sees their TL's records).
      //    Use IN(...) instead of "ROWID = 'A' OR ROWID = 'B' OR ..." — the OR
      //    form combined with findWhere's `tenant_id = X AND ${whereExtra}`
      //    parses as `(tenant_id = X AND ROWID = 'A') OR ROWID = 'B' OR ...`
      //    due to SQL AND/OR precedence, which drops the tenant filter for all
      //    but the first clause AND breaks ZCQL parsing for >1 team. Using IN
      //    keeps it as a single right-hand expression so the AND distributes
      //    correctly across every team.
      if (memberRows.length > 0 && myTeamIds.size > 0) {
        const teamIdList = Array.from(myTeamIds);
        const inList = teamIdList.map((id) => `'${id}'`).join(',');
        const teams = await this.db.findWhere(
          TABLES.TEAMS, tid, `ROWID IN (${inList})`, { limit: 200 }
        );
        teams.forEach((t) => { if (t.lead_user_id) out.add(String(t.lead_user_id)); });
        console.log(`[TeamScope] step3 teams.length=${teams.length} leads added`);
      }

      // 4. All members of teams I'm in or lead. Same IN(...) fix as step 3.
      // ZCQL caps LIMIT at 300 — overshooting that errors out the whole query,
      // not just truncates, so we have to stay at or below 300 here.
      if (myTeamIds.size > 0) {
        const teamIdList = Array.from(myTeamIds);
        const chunkSize  = 20;
        for (let i = 0; i < teamIdList.length; i += chunkSize) {
          const slice = teamIdList.slice(i, i + chunkSize);
          const inList = slice.map((id) => `'${id}'`).join(',');
          const allMembers = await this.db.findWhere(
            TABLES.TEAM_MEMBERS, tid, `team_id IN (${inList})`, { limit: 300 }
          );
          console.log(`[TeamScope] step4 slice=${JSON.stringify(slice)} allMembers.length=${allMembers.length} memberUserIds=${JSON.stringify(allMembers.map((m) => m.user_id))}`);
          allMembers.forEach((m) => { if (m.user_id) out.add(String(m.user_id)); });
        }
      }
      console.log(`[TeamScope] final out=${JSON.stringify(Array.from(out))}`);
    } catch (err) {
      console.warn('[TeamScopeService.getTeamPeerUserIds]', err.message);
    }

    return Array.from(out);
  }
}

module.exports = TeamScopeService;
