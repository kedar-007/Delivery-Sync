'use strict';

const DataStoreService = require('../services/DataStoreService');
const TeamScopeService = require('../services/TeamScopeService');
const ResponseHelper = require('../utils/ResponseHelper');
const Validator = require('../utils/Validator');
const { TABLES, PERMISSIONS } = require('../utils/Constants');

/**
 * StandupController – submit and retrieve daily standup entries.
 * Enforces uniqueness: one standup per user per project per day.
 */
class StandupController {
  constructor(catalystApp) {
    this.catalystApp = catalystApp;
    this.db = new DataStoreService(catalystApp);
  }

  /**
   * POST /api/standups
   */
  async submitStandup(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const data = Validator.validateSubmitStandup(req.body);

      // ── Date-window enforcement ─────────────────────────────────────────
      // Standups can only be entered for today or up to 7 days back.
      // Future dates are rejected. Defense in depth — the frontend already
      // disables the date picker for out-of-range values, but a hand-crafted
      // request would otherwise sneak through.
      // Normalise to bare YYYY-MM-DD before window-check + persistence so a
      // full-ISO value from the client (e.g. Date.toISOString()) doesn't leak
      // a timestamp into the DB's DATE column.
      data.date = String(data.date).split('T')[0].split(' ')[0].trim();
      const _windowCheck = _validateDateWindow(data.date);
      if (_windowCheck) return ResponseHelper.validationError(res, _windowCheck);

      // Enforce uniqueness: one standup per user per project per day
      const existing = await this.db.query(
        `SELECT ROWID FROM ${TABLES.STANDUP_ENTRIES} ` +
        `WHERE tenant_id = '${tenantId}' AND project_id = '${data.project_id}' ` +
        `AND user_id = '${userId}' AND entry_date = '${data.date}' LIMIT 1`
      );
      if (existing.length > 0) {
        return ResponseHelper.conflict(res,
          'Standup already submitted for this project today. Use update instead.');
      }

      // Verify project membership
      const project = await this.db.findById(TABLES.PROJECTS, data.project_id, tenantId);
      if (!project) return ResponseHelper.notFound(res, 'Project not found');

      const standup = await this.db.insert(TABLES.STANDUP_ENTRIES, {
        tenant_id: tenantId,
        project_id: data.project_id,
        user_id: userId,
        entry_date: data.date,
        yesterday: data.yesterday,
        today: data.today,
        blockers: data.blockers,
        submitted_at: DataStoreService.fmtDT(new Date()),
      });

      return ResponseHelper.created(res, {
        standup: {
          id: String(standup.ROWID),
          projectId: data.project_id,
          date: data.date,
          userId,
          yesterday: data.yesterday,
          today: data.today,
          blockers: data.blockers,
          status: 'SUBMITTED',
        },
      }, 'Standup submitted');
    } catch (err) {
      if (err.isValidation) return ResponseHelper.validationError(res, err.message, err.details);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/standups?projectId=&date=&userId=
   */
  async getStandups(req, res) {
    try {
      const { tenantId, id: currentUserId, role } = req.currentUser;
      const { projectId, date, userId, startDate, endDate, scope: queryScope } = req.query;
      const userPerms = Array.isArray(req.currentUser.permissions) ? req.currentUser.permissions : [];

      // Visibility ladder:
      //   - Caller is org-wide / privileged → see all (with optional ?userId filter)
      //   - Caller passes ?scope=team AND has STANDUP_TEAM_VIEW → team peers
      //   - Otherwise → own entries only
      //
      // NOTE: team-peer scope is opt-in via `scope=team` so the legacy "My
      // Submissions" view (which calls this endpoint with no params) keeps
      // showing only the caller's own standups even after the permission is
      // granted. A separate "Team Standups" tab passes scope=team explicitly.
      const isLimitedToOwn = role === 'TEAM_MEMBER'
        && req.currentUser.dataScope !== 'ORG_WIDE'
        && req.currentUser.dataScope !== 'SUBORDINATES';
      const hasTeamView    = userPerms.includes(PERMISSIONS.STANDUP_TEAM_VIEW);
      const wantsTeamScope = String(queryScope || '').toLowerCase() === 'team';

      let whereExtra = ''; // default: fetch across all projects
      if (projectId) whereExtra = `project_id = '${DataStoreService.escape(projectId)}'`;
      if (date) whereExtra += (whereExtra ? ' AND ' : '') + `entry_date = '${DataStoreService.escape(date)}'`;

      if (!isLimitedToOwn) {
        // Org-wide / privileged caller — optional userId filter passes through.
        if (userId) whereExtra += (whereExtra ? ' AND ' : '') + `user_id = '${DataStoreService.escape(userId)}'`;
      } else if (wantsTeamScope && hasTeamView) {
        // Team-peer scope. Intersect with explicit ?userId if provided.
        const scope = new TeamScopeService(this.db);
        const peerIds = await scope.getTeamPeerUserIds(tenantId, currentUserId);
        const allowed = userId
          ? peerIds.filter((id) => String(id) === String(userId))
          : peerIds;
        if (allowed.length === 0) {
          return ResponseHelper.success(res, { standups: [] });
        }
        if (allowed.length === 1) {
          whereExtra += (whereExtra ? ' AND ' : '') + `user_id = '${DataStoreService.escape(allowed[0])}'`;
        } else {
          const inList = allowed.map((id) => `'${DataStoreService.escape(id)}'`).join(',');
          whereExtra += (whereExtra ? ' AND ' : '') + `user_id IN (${inList})`;
        }
      } else if (wantsTeamScope && !hasTeamView) {
        // Asked for team scope but lacks the permission — refuse rather than
        // silently fall back to own-only (which would mask the missing perm).
        return ResponseHelper.forbidden(res, 'Missing permission: STANDUP_TEAM_VIEW');
      } else {
        // Own-only (legacy behaviour for the My Submissions tab).
        whereExtra += (whereExtra ? ' AND ' : '') + `user_id = '${DataStoreService.escape(currentUserId)}'`;
      }

      if (startDate && endDate) {
        whereExtra += (whereExtra ? ' AND ' : '') + `entry_date >= '${DataStoreService.escape(startDate)}' AND entry_date <= '${DataStoreService.escape(endDate)}'`;
      }

      // Opt-in pagination: present only when `page` is in the query string.
      // Backwards compatible — Submit/My Submissions tabs don't pass it and
      // keep getting the legacy `{ standups: [...] }` array shape.
      const paginated  = req.query.page !== undefined;
      const page       = Math.max(1,   parseInt(req.query.page,     10) || 1);
      const pageSize   = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
      const offset     = (page - 1) * pageSize;

      const tenantClause = `tenant_id = '${DataStoreService.escape(String(tenantId))}'`;
      const fullWhere    = whereExtra ? `${tenantClause} AND ${whereExtra}` : tenantClause;

      const [standups, countRows] = await Promise.all([
        this.db.findWhere(
          TABLES.STANDUP_ENTRIES, tenantId, whereExtra,
          {
            orderBy: 'entry_date DESC, CREATEDTIME DESC',
            limit:   paginated ? pageSize : 100,
            offset:  paginated ? offset   : undefined,
          }
        ),
        paginated
          ? this.db.query(`SELECT COUNT(ROWID) FROM ${TABLES.STANDUP_ENTRIES} WHERE ${fullWhere}`)
          : Promise.resolve(null),
      ]);

      // Enrich with project names
      const projectIds = [...new Set(standups.map((s) => s.project_id).filter(Boolean))];
      let projectMap = {};
      if (projectIds.length > 0) {
        const projects = await this.db.query(
          `SELECT ROWID, name FROM ${TABLES.PROJECTS} WHERE ROWID IN (${projectIds.map((id) => `'${id}'`).join(',')}) LIMIT 100`
        );
        projects.forEach((p) => { projectMap[String(p.ROWID)] = p.name; });
      }

      // Enrich with submitter names. We need this whenever the response can
      // contain entries from people other than the caller — i.e. team scope
      // or any privileged (non-own-only) view. The previous `userIds.length > 1`
      // gate skipped enrichment when only one peer had posted, leaving the
      // UI to fall back to "Team member" without a name or avatar.
      const needsUserEnrichment = wantsTeamScope || !isLimitedToOwn;
      const userIds = [...new Set(standups.map((s) => s.user_id).filter(Boolean).map(String))];
      let userMap = {};
      if (needsUserEnrichment && userIds.length > 0) {
        try {
          const inList = userIds.map((id) => `'${id}'`).join(',');
          const users  = await this.db.query(
            `SELECT ROWID, name, avatar_url FROM ${TABLES.USERS} WHERE ROWID IN (${inList}) LIMIT 100`
          );
          users.forEach((u) => { userMap[String(u.ROWID)] = u; });
        } catch (_) { /* enrichment is non-fatal — fall back to IDs */ }
      }

      const items = standups.map((s) => {
        const u = userMap[String(s.user_id)] || {};
        return {
          id: String(s.ROWID),
          projectId: s.project_id,
          projectName: projectMap[String(s.project_id)] || null,
          userId: s.user_id,
          userName:      u.name       || null,
          userAvatarUrl: u.avatar_url || null,
          date: s.entry_date,
          yesterday: s.yesterday,
          today: s.today,
          blockers: s.blockers,
          status: s.status,
          submittedAt: s.submitted_at,
        };
      });

      if (paginated) {
        // ZCQL returns the COUNT under an unpredictable column name (alias
        // isn't always preserved). Grab the first value of the first row.
        let total = 0;
        if (Array.isArray(countRows) && countRows.length > 0) {
          const firstVal = Object.values(countRows[0])[0];
          total = parseInt(String(firstVal), 10) || 0;
        }
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        return ResponseHelper.success(res, {
          standups: items,
          pagination: { page, pageSize, total, totalPages, hasMore: page < totalPages },
        });
      }
      return ResponseHelper.success(res, { standups: items });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/standups/rollup?projectId=&startDate=&endDate=
   * Returns standups grouped by date for a rollup view.
   */
  async getStandupRollup(req, res) {
    try {
      const { tenantId, id: currentUserId, role } = req.currentUser;
      const { projectId, startDate, endDate } = req.query;

      if (!projectId) return ResponseHelper.validationError(res, 'projectId is required');

      const today = DataStoreService.today();
      const from = startDate || DataStoreService.daysAgo(7);
      const to = endDate || today;

      // Same visibility ladder as getStandups: org-wide → all, STANDUP_TEAM_VIEW → peers, else own.
      const userPerms      = Array.isArray(req.currentUser.permissions) ? req.currentUser.permissions : [];
      const isLimitedToOwn = role === 'TEAM_MEMBER' && req.currentUser.dataScope !== 'ORG_WIDE' && req.currentUser.dataScope !== 'SUBORDINATES';
      const hasTeamView    = userPerms.includes(PERMISSIONS.STANDUP_TEAM_VIEW);
      let userFilter = '';
      if (isLimitedToOwn) {
        if (hasTeamView) {
          const scope   = new TeamScopeService(this.db);
          const peerIds = await scope.getTeamPeerUserIds(tenantId, currentUserId);
          if (peerIds.length === 1) {
            userFilter = ` AND user_id = '${DataStoreService.escape(peerIds[0])}'`;
          } else if (peerIds.length > 1) {
            const inList = peerIds.map((id) => `'${DataStoreService.escape(id)}'`).join(',');
            userFilter = ` AND user_id IN (${inList})`;
          } else {
            userFilter = ` AND user_id = '${currentUserId}'`;
          }
        } else {
          userFilter = ` AND user_id = '${currentUserId}'`;
        }
      }

      const standups = await this.db.findWhere(
        TABLES.STANDUP_ENTRIES, tenantId,
        `project_id = '${DataStoreService.escape(projectId)}' AND entry_date >= '${from}' AND entry_date <= '${to}'${userFilter}`,
        { orderBy: 'entry_date DESC, CREATEDTIME ASC', limit: 200 }
      );

      // Enrich with user names
      const userIds = [...new Set(standups.map((s) => `'${s.user_id}'`))].join(',');
      let userMap = {};
      if (userIds) {
        const users = await this.db.query(
          `SELECT ROWID, name, email FROM ${TABLES.USERS} WHERE ROWID IN (${userIds}) LIMIT 100`
        );
        users.forEach((u) => { userMap[String(u.ROWID)] = { name: u.name, email: u.email }; });
      }

      // Group by date
      const grouped = {};
      standups.forEach((s) => {
        if (!grouped[s.entry_date]) grouped[s.entry_date] = [];
        const user = userMap[String(s.user_id)] || {};
        grouped[s.entry_date].push({
          id: String(s.ROWID),
          userId: s.user_id,
          userName: user.name || s.user_id,
          userEmail: user.email || '',
          yesterday: s.yesterday,
          today: s.today,
          blockers: s.blockers,
          status: s.status,
        });
      });

      const rollup = Object.entries(grouped)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, entries]) => ({ date, entries, entryCount: entries.length }));

      return ResponseHelper.success(res, { projectId, rollup, totalEntries: standups.length });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/standups/my-today?projectId=
   */
  async getMyTodayStandup(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const { projectId } = req.query;
      const today = DataStoreService.today();

      let whereExtra = `user_id = '${userId}' AND entry_date = '${today}'`;
      if (projectId) whereExtra += ` AND project_id = '${DataStoreService.escape(projectId)}'`;

      const standups = await this.db.findWhere(TABLES.STANDUP_ENTRIES, tenantId, whereExtra, { limit: 10 });

      return ResponseHelper.success(res, {
        standups: standups.map((s) => ({
          id: String(s.ROWID), projectId: s.project_id, date: s.entry_date,
          yesterday: s.yesterday, today: s.today, blockers: s.blockers, status: s.status,
        })),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * PUT /api/standups/:id
   * Owner-only update — cannot change project or date, only text fields.
   */
  async updateStandup(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const { id } = req.params;

      const existing = await this.db.query(
        `SELECT ROWID, user_id FROM ${TABLES.STANDUP_ENTRIES} ` +
        `WHERE ROWID = '${id}' AND tenant_id = '${tenantId}' LIMIT 1`
      );
      if (!existing.length) return ResponseHelper.notFound(res, 'Standup not found');
      if (String(existing[0].user_id) !== String(userId)) {
        return ResponseHelper.forbidden(res, 'You can only edit your own standup');
      }

      const data = Validator.validateUpdateStandup(req.body);

      await this.db.update(TABLES.STANDUP_ENTRIES, {
        ROWID: id,
        yesterday: data.yesterday,
        today:     data.today,
        blockers:  data.blockers,
      });

      return ResponseHelper.success(res, { message: 'Standup updated' });
    } catch (err) {
      if (err.isValidation) return ResponseHelper.validationError(res, err.message, err.details);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // GET /api/standups/search?q=<term>
  //
  // Originally used Catalyst's Search Index (executeSearchQuery), which
  // requires the index to be explicitly enabled per-column in the Catalyst
  // console. When that wasn't configured the endpoint always returned zero
  // hits, surfacing as "No records found" in the UI for every search (DSV-011).
  //
  // Switched to a ZCQL LIKE-based fallback so the feature works regardless
  // of search-index configuration. Trade-off: it's a table scan capped at
  // 500 rows, which is fine for per-user standup search.
  async searchMyStandups(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const q = (req.query.q || '').trim();
      if (!q || q.length < 2) return ResponseHelper.validationError(res, 'Search term must be at least 2 characters');

      // Escape single quotes for the LIKE pattern
      const safeQ = q.replace(/'/g, "''");
      const sql = `SELECT * FROM ${TABLES.STANDUP_ENTRIES}
                   WHERE tenant_id = '${tenantId}'
                     AND user_id = '${userId}'
                     AND (yesterday LIKE '%${safeQ}%'
                          OR today LIKE '%${safeQ}%'
                          OR blockers LIKE '%${safeQ}%')
                   ORDER BY ROWID DESC
                   LIMIT 100`;
      const rawRows = await this.db.query(sql);
      // Catalyst returns rows wrapped under the table name — flatten just in case
      const hits = (rawRows || []).map((r) => r[TABLES.STANDUP_ENTRIES] || r);

      // Enrich with project name
      const projectIds = [...new Set(hits.map((s) => s.project_id).filter(Boolean))];
      const projectMap = {};
      if (projectIds.length) {
        const rows = await this.db.query(
          `SELECT ROWID, name FROM ${TABLES.PROJECTS} WHERE ROWID IN (${projectIds.map((id) => `'${id}'`).join(',')}) LIMIT 50`
        );
        rows.forEach((p) => { projectMap[String(p.ROWID)] = p.name; });
      }

      return ResponseHelper.success(res, {
        standups: hits.map((s) => ({
          id: String(s.ROWID),
          date: s.entry_date,
          projectId: s.project_id,
          projectName: projectMap[String(s.project_id)] || null,
          yesterday: s.yesterday,
          today: s.today,
          blockers: s.blockers,
          submittedAt: s.submitted_at,
        })),
      });
    } catch (err) {
      console.error('[StandupController.searchMyStandups]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * DELETE /api/standups/:id
   * Owner can always delete their own. Elevated roles or STANDUP_DELETE perm
   * are required to delete someone else's entry.
   */
  async deleteStandup(req, res) {
    try {
      const { id } = req.params;
      const { tenantId, id: userId, role, permissions: perms = [] } = req.currentUser;

      const rows = await this.db.query(
        `SELECT ROWID, user_id FROM ${TABLES.STANDUP_ENTRIES} WHERE ROWID = '${id}' AND tenant_id = '${tenantId}' LIMIT 1`
      );
      if (!rows[0]) return ResponseHelper.notFound(res, 'Standup not found');

      const row = rows[0][TABLES.STANDUP_ENTRIES] || rows[0];
      const isOwner = String(row.user_id) === String(userId);
      const canDeleteAny = role === 'TENANT_ADMIN' || role === 'SUPER_ADMIN' || perms.includes(PERMISSIONS.STANDUP_DELETE);

      if (!isOwner && !canDeleteAny) {
        return ResponseHelper.forbidden(res, 'You can only delete your own standup');
      }

      await this.db.delete(TABLES.STANDUP_ENTRIES, id);
      return ResponseHelper.success(res, null, 'Standup deleted');
    } catch (err) {
      console.error('[StandupController.deleteStandup]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

// Returns an error string if the given date is outside the allowed entry
// window (today through 7 days back), otherwise null.
//
// Accepts both bare-date and full-ISO inputs:
//   "2026-05-13"
//   "2026-05-13T10:30:00.000Z"
//   "2026-05-13T00:00:00"
// Anything with a time component is normalised to the date prefix first so
// the subsequent UTC concatenation can't produce a malformed string. This
// fixes the "Invalid date format" 400 when a client sends a Date.toISOString().
function _validateDateWindow(dateStr) {
  if (!dateStr) return 'Date is required';
  const dateOnly = String(dateStr).split('T')[0].split(' ')[0].trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return 'Invalid date format';
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const sevenAgo = new Date(todayUtc.getTime() - 7 * 24 * 60 * 60 * 1000);
  const entry = new Date(dateOnly + 'T00:00:00Z');
  if (isNaN(entry.getTime())) return 'Invalid date format';
  if (entry.getTime() > todayUtc.getTime())
    return "You can't submit a standup for a future date.";
  if (entry.getTime() < sevenAgo.getTime())
    return 'Backdated entries are allowed only within the past 7 days.';
  return null;
}

module.exports = StandupController;
