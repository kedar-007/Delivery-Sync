'use strict';

const DataStoreService = require('../services/DataStoreService');
const TeamScopeService = require('../services/TeamScopeService');
const ResponseHelper = require('../utils/ResponseHelper');
const Validator = require('../utils/Validator');
const { TABLES, PERMISSIONS } = require('../utils/Constants');

/**
 * EodController – end-of-day updates.
 * Mirrors StandupController pattern with EOD-specific fields.
 */
class EodController {
  constructor(catalystApp) {
    this.catalystApp = catalystApp;
    this.db = new DataStoreService(catalystApp);
  }

  /**
   * POST /api/eod
   */
  async submitEod(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const data = Validator.validateSubmitEod(req.body);

      // ── Date-window enforcement ─────────────────────────────────────────
      // EODs can only be entered for today or up to 7 days back. Future
      // dates rejected. Defense in depth — the frontend already disables
      // out-of-range values, but a hand-crafted request would otherwise
      // slip through.
      const _windowCheck = _validateEodDateWindow(data.date);
      if (_windowCheck) return ResponseHelper.validationError(res, _windowCheck);

      // Uniqueness: one EOD per user per project per day
      const existing = await this.db.query(
        `SELECT ROWID FROM ${TABLES.EOD_ENTRIES} ` +
        `WHERE tenant_id = '${tenantId}' AND project_id = '${data.project_id}' ` +
        `AND user_id = '${userId}' AND entry_date = '${data.date}' LIMIT 1`
      );
      if (existing.length > 0) {
        return ResponseHelper.conflict(res, 'EOD already submitted for this project today.');
      }

      const project = await this.db.findById(TABLES.PROJECTS, data.project_id, tenantId);
      if (!project) return ResponseHelper.notFound(res, 'Project not found');

      const eod = await this.db.insert(TABLES.EOD_ENTRIES, {
        tenant_id: tenantId,
        project_id: data.project_id,
        user_id: userId,
        entry_date: data.date,
        accomplished: data.accomplishments,
        plan_for_tomorrow: data.planned_tomorrow,
        blockers: data.blockers,
        progress_percentage: String(data.progress_percentage),
        mood: data.mood,
        submitted_at: DataStoreService.fmtDT(new Date()),
      });

      return ResponseHelper.created(res, {
        eod: {
          id: String(eod.ROWID),
          projectId: data.project_id,
          date: data.date,
          userId,
          accomplishments: data.accomplishments,
          plannedTomorrow: data.planned_tomorrow,
          blockers: data.blockers,
          progressPercentage: data.progress_percentage,
          mood: data.mood,
        },
      }, 'EOD submitted');
    } catch (err) {
      if (err.isValidation) return ResponseHelper.validationError(res, err.message, err.details);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/eod?projectId=&date=&userId=
   */
  async getEod(req, res) {
    try {
      const { tenantId, id: currentUserId, role } = req.currentUser;
      const { projectId, date, userId, startDate, endDate } = req.query;

      // Visibility ladder (opt-in team scope via ?scope=team):
      //   - org-wide / privileged → see all (with optional ?userId)
      //   - ?scope=team + EOD_TEAM_VIEW perm → team peers
      //   - otherwise → own only (My Submissions tab keeps working unchanged)
      const userPerms      = Array.isArray(req.currentUser.permissions) ? req.currentUser.permissions : [];
      const isLimitedToOwn = role === 'TEAM_MEMBER' && req.currentUser.dataScope !== 'ORG_WIDE' && req.currentUser.dataScope !== 'SUBORDINATES';
      const hasTeamView    = userPerms.includes(PERMISSIONS.EOD_TEAM_VIEW);
      const wantsTeamScope = String(req.query.scope || '').toLowerCase() === 'team';

      let conditions = [];
      if (projectId) conditions.push(`project_id = '${DataStoreService.escape(projectId)}'`);
      if (date) conditions.push(`entry_date = '${DataStoreService.escape(date)}'`);

      if (!isLimitedToOwn) {
        if (userId) conditions.push(`user_id = '${DataStoreService.escape(userId)}'`);
      } else if (wantsTeamScope && hasTeamView) {
        const scope   = new TeamScopeService(this.db);
        const peerIds = await scope.getTeamPeerUserIds(tenantId, currentUserId);
        const allowed = userId
          ? peerIds.filter((id) => String(id) === String(userId))
          : peerIds;
        if (allowed.length === 0) {
          return ResponseHelper.success(res, { eods: [] });
        }
        if (allowed.length === 1) {
          conditions.push(`user_id = '${DataStoreService.escape(allowed[0])}'`);
        } else {
          const inList = allowed.map((id) => `'${DataStoreService.escape(id)}'`).join(',');
          conditions.push(`user_id IN (${inList})`);
        }
      } else if (wantsTeamScope && !hasTeamView) {
        return ResponseHelper.forbidden(res, 'Missing permission: EOD_TEAM_VIEW');
      } else {
        conditions.push(`user_id = '${DataStoreService.escape(currentUserId)}'`);
      }

      if (startDate && endDate) {
        conditions.push(`entry_date >= '${DataStoreService.escape(startDate)}'`);
        conditions.push(`entry_date <= '${DataStoreService.escape(endDate)}'`);
      }

      const whereExtra = conditions.length > 0 ? conditions.join(' AND ') : null;
      const eods = await this.db.findWhere(
        TABLES.EOD_ENTRIES, tenantId,
        whereExtra,
        { orderBy: 'entry_date DESC, CREATEDTIME DESC', limit: 100 }
      );

      // Enrich with project names
      const projectIds = [...new Set(eods.map((e) => e.project_id).filter(Boolean))];
      let projectMap = {};
      if (projectIds.length > 0) {
        const projects = await this.db.query(
          `SELECT ROWID, name FROM ${TABLES.PROJECTS} WHERE ROWID IN (${projectIds.map((id) => `'${id}'`).join(',')}) LIMIT 100`
        );
        projects.forEach((p) => { projectMap[String(p.ROWID)] = p.name; });
      }

      // Enrich with submitter names (needed by Team EOD view)
      const userIds = [...new Set(eods.map((e) => e.user_id).filter(Boolean).map(String))];
      let userMap = {};
      if (userIds.length > 1) {
        try {
          const inList = userIds.map((id) => `'${id}'`).join(',');
          const users  = await this.db.query(
            `SELECT ROWID, name, avatar_url FROM ${TABLES.USERS} WHERE ROWID IN (${inList}) LIMIT 100`
          );
          users.forEach((u) => { userMap[String(u.ROWID)] = u; });
        } catch (_) { /* enrichment is non-fatal */ }
      }

      return ResponseHelper.success(res, {
        eods: eods.map((e) => {
          const u = userMap[String(e.user_id)] || {};
          return {
            id: String(e.ROWID),
            projectId: e.project_id,
            projectName: projectMap[String(e.project_id)] || null,
            userId: e.user_id,
            userName:      u.name       || null,
            userAvatarUrl: u.avatar_url || null,
            date: e.entry_date,
            accomplishments: e.accomplished,
            plannedTomorrow: e.plan_for_tomorrow,
            blockers: e.blockers,
            progressPercentage: Number(e.progress_percentage || 0),
            mood: e.mood,
            submittedAt: e.submitted_at,
          };
        }),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/eod/rollup?projectId=&startDate=&endDate=
   */
  async getEodRollup(req, res) {
    try {
      const { tenantId, id: currentUserId, role } = req.currentUser;
      const { projectId, startDate, endDate } = req.query;

      if (!projectId) return ResponseHelper.validationError(res, 'projectId is required');

      const from = startDate || DataStoreService.daysAgo(7);
      const to = endDate || DataStoreService.today();

      // TEAM_MEMBER only sees their own entries in rollup (unless org role grants org-wide access)
      const userPerms      = Array.isArray(req.currentUser.permissions) ? req.currentUser.permissions : [];
      const isLimitedToOwn = role === 'TEAM_MEMBER' && req.currentUser.dataScope !== 'ORG_WIDE' && req.currentUser.dataScope !== 'SUBORDINATES';
      const hasTeamView    = userPerms.includes(PERMISSIONS.EOD_TEAM_VIEW);
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

      const eods = await this.db.findWhere(
        TABLES.EOD_ENTRIES, tenantId,
        `project_id = '${DataStoreService.escape(projectId)}' AND entry_date >= '${from}' AND entry_date <= '${to}'${userFilter}`,
        { orderBy: 'CREATEDTIME DESC', limit: 200 }
      );

      // Enrich with user info
      const userIds = [...new Set(eods.map((e) => `'${e.user_id}'`))].join(',');
      let userMap = {};
      if (userIds) {
        const users = await this.db.query(
          `SELECT ROWID, name, email FROM ${TABLES.USERS} WHERE ROWID IN (${userIds}) LIMIT 100`
        );
        users.forEach((u) => { userMap[String(u.ROWID)] = { name: u.name, email: u.email }; });
      }

      // Group by date
      const grouped = {};
      let totalProgress = 0;
      eods.forEach((e) => {
        if (!grouped[e.entry_date]) grouped[e.entry_date] = [];
        const user = userMap[String(e.user_id)] || {};
        totalProgress += Number(e.progress_percentage || 0);
        grouped[e.entry_date].push({
          id: String(e.ROWID),
          userId: e.user_id,
          userName: user.name || e.user_id,
          accomplishments: e.accomplished,
          plannedTomorrow: e.plan_for_tomorrow,
          blockers: e.blockers,
          progressPercentage: Number(e.progress_percentage || 0),
          mood: e.mood,
        });
      });

      const rollup = Object.entries(grouped)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, entries]) => ({
          date,
          entries,
          entryCount: entries.length,
          avgProgress: entries.length > 0
            ? Math.round(entries.reduce((sum, e) => sum + e.progressPercentage, 0) / entries.length)
            : 0,
        }));

      return ResponseHelper.success(res, { projectId, rollup, totalEntries: eods.length });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/eod/my-today?projectId=
   */
  async getMyTodayEod(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const { projectId } = req.query;
      const today = DataStoreService.today();

      let whereExtra = `user_id = '${userId}' AND entry_date = '${today}'`;
      if (projectId) whereExtra += ` AND project_id = '${DataStoreService.escape(projectId)}'`;

      const eods = await this.db.findWhere(TABLES.EOD_ENTRIES, tenantId, whereExtra, { limit: 10 });
      return ResponseHelper.success(res, { eods });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * PUT /api/eod/:id
   * Owner-only update — cannot change project or date, only content fields.
   */
  async updateEod(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const { id } = req.params;

      const existing = await this.db.query(
        `SELECT ROWID, user_id FROM ${TABLES.EOD_ENTRIES} ` +
        `WHERE ROWID = '${id}' AND tenant_id = '${tenantId}' LIMIT 1`
      );
      if (!existing.length) return ResponseHelper.notFound(res, 'EOD not found');
      if (String(existing[0].user_id) !== String(userId)) {
        return ResponseHelper.forbidden(res, 'You can only edit your own EOD');
      }

      const data = Validator.validateUpdateEod(req.body);

      await this.db.update(TABLES.EOD_ENTRIES, {
        ROWID:               id,
        accomplished:        data.accomplishments,
        plan_for_tomorrow:   data.planned_tomorrow,
        blockers:            data.blockers,
        progress_percentage: String(data.progress_percentage),
        mood:                data.mood,
      });

      return ResponseHelper.success(res, { message: 'EOD updated' });
    } catch (err) {
      if (err.isValidation) return ResponseHelper.validationError(res, err.message, err.details);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // GET /api/eod/search?q=<term>
  // Requires Search Index enabled on 'accomplished', 'plan_for_tomorrow', 'blockers' columns of 'eod_entries'.
  async searchMyEod(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const q = (req.query.q || '').trim();
      if (!q || q.length < 2) return ResponseHelper.validationError(res, 'Search term must be at least 2 characters');

      const results = await this.catalystApp.search().executeSearchQuery({
        search: q,
        search_table_columns: { [TABLES.EOD_ENTRIES]: ['accomplished', 'plan_for_tomorrow', 'blockers'] },
        select_table_columns: {
          [TABLES.EOD_ENTRIES]: ['ROWID', 'accomplished', 'plan_for_tomorrow', 'blockers',
            'entry_date', 'project_id', 'user_id', 'tenant_id', 'progress_percentage', 'mood', 'submitted_at'],
        },
      });

      const hits = (results[TABLES.EOD_ENTRIES] ?? []).filter(
        (e) => String(e.tenant_id) === String(tenantId) && String(e.user_id) === String(userId)
      );

      // Enrich with project name
      const projectIds = [...new Set(hits.map((e) => e.project_id).filter(Boolean))];
      const projectMap = {};
      if (projectIds.length) {
        const rows = await this.db.query(
          `SELECT ROWID, name FROM ${TABLES.PROJECTS} WHERE ROWID IN (${projectIds.map((id) => `'${id}'`).join(',')}) LIMIT 50`
        );
        rows.forEach((p) => { projectMap[String(p.ROWID)] = p.name; });
      }

      return ResponseHelper.success(res, {
        eods: hits.map((e) => ({
          id: String(e.ROWID),
          date: e.entry_date,
          projectId: e.project_id,
          projectName: projectMap[String(e.project_id)] || null,
          accomplishments: e.accomplished,
          plannedTomorrow: e.plan_for_tomorrow,
          blockers: e.blockers,
          progressPercentage: parseFloat(e.progress_percentage) || 0,
          mood: e.mood,
          submittedAt: e.submitted_at,
        })),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

// Returns an error string if the given YYYY-MM-DD date is outside the
// allowed entry window (today through 7 days back), otherwise null.
function _validateEodDateWindow(dateStr) {
  if (!dateStr) return 'Date is required';
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const sevenAgo = new Date(todayUtc.getTime() - 7 * 24 * 60 * 60 * 1000);
  const entry = new Date(dateStr + 'T00:00:00Z');
  if (isNaN(entry.getTime())) return 'Invalid date format';
  if (entry.getTime() > todayUtc.getTime())
    return "You can't submit an EOD for a future date.";
  if (entry.getTime() < sevenAgo.getTime())
    return 'Backdated entries are allowed only within the past 7 days.';
  return null;
}

module.exports = EodController;
