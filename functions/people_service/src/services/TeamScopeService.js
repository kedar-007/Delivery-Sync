'use strict';

const { TABLES } = require('../utils/Constants');

/**
 * TeamScopeService
 *
 * Resolves the set of user IDs the current user is allowed to see for the
 * "*_TEAM_VIEW" family of permissions (ATTENDANCE_TEAM_VIEW, STANDUP_TEAM_VIEW,
 * EOD_TEAM_VIEW).
 *
 * A user counts as a "team peer" if they share at least one team with the
 * current user — either as a co-member, or because the current user is the
 * team's lead, or because the current user is a co-member of a team the
 * target user leads.
 *
 * Always includes the current user themselves so endpoints that filter by
 * "team peer ids" still surface the caller's own records.
 */
class TeamScopeService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Returns an array of string user IDs that the caller can see under a
   * *_TEAM_VIEW permission. Always includes the caller's own id. Empty array
   * is returned only if something fundamentally fails — callers should treat
   * `[selfId]` as the floor.
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

      // 2. All teams the user leads (lead_user_id on the teams table)
      const ledTeams = await this.db.findWhere(
        TABLES.TEAMS, tid,
        `lead_user_id = '${self}'`,
        { limit: 200 }
      );
      ledTeams.forEach((t) => myTeamIds.add(String(t.ROWID)));

      // Also add the leads of the teams I'm in (so a member sees their TL's records).
      // Uses IN(...) instead of "ROWID = 'A' OR ROWID = 'B' OR ..." — the OR form
      // combined with findWhere's `tenant_id = X AND ${whereExtra}` parses as
      // `(tenant_id = X AND ROWID = 'A') OR ROWID = 'B' OR ...` due to SQL
      // AND/OR precedence, which drops the tenant filter for all but the first
      // clause AND breaks ZCQL parsing for >1 team.
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

      // 3. For each team I'm in or lead, pull all its members.
      // Same IN(...) fix as above. Also LIMIT capped at 300 because ZCQL
      // rejects queries with LIMIT > 300 (errors out the whole query rather
      // than truncating).
      if (myTeamIds.size > 0) {
        const teamIdList = Array.from(myTeamIds);
        // Chunk to keep WHERE clauses reasonable
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
      // Non-fatal — log and return at least the caller themselves so the
      // user isn't completely locked out by an enrichment failure.
      console.warn('[TeamScopeService.getTeamPeerUserIds]', err.message);
    }

    return Array.from(out);
  }

  /** Convenience: does the current user have any of the given perms? */
  static hasAny(userPerms, perms) {
    if (!Array.isArray(userPerms)) return false;
    const set = new Set(userPerms);
    return perms.some((p) => set.has(p));
  }
}

module.exports = TeamScopeService;
