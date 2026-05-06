'use strict';

const DataStoreService = require('../services/DataStoreService');
const ResponseHelper = require('../utils/ResponseHelper');
const Validator = require('../utils/Validator');
const { TABLES } = require('../utils/Constants');

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
      const { projectId, date, userId, startDate, endDate } = req.query;

      // TEAM_MEMBER can only see their own entries (unless their org role grants org-wide access)
      const isLimitedToOwn = role === 'TEAM_MEMBER' && req.currentUser.dataScope !== 'ORG_WIDE' && req.currentUser.dataScope !== 'SUBORDINATES';
      const effectiveUserId = isLimitedToOwn ? currentUserId : userId;

      let whereExtra = ''; // default: fetch across all projects
      if (projectId) whereExtra = `project_id = '${DataStoreService.escape(projectId)}'`;
      if (date) whereExtra += (whereExtra ? ' AND ' : '') + `entry_date = '${DataStoreService.escape(date)}'`;
      if (effectiveUserId) whereExtra += (whereExtra ? ' AND ' : '') + `user_id = '${DataStoreService.escape(effectiveUserId)}'`;
      if (startDate && endDate) {
        whereExtra += (whereExtra ? ' AND ' : '') + `entry_date >= '${DataStoreService.escape(startDate)}' AND entry_date <= '${DataStoreService.escape(endDate)}'`;
      }

      const standups = await this.db.findWhere(
        TABLES.STANDUP_ENTRIES, tenantId,
        whereExtra,
        { orderBy: 'entry_date DESC, CREATEDTIME DESC', limit: 100 }
      );

      // Enrich with project names
      const projectIds = [...new Set(standups.map((s) => s.project_id).filter(Boolean))];
      let projectMap = {};
      if (projectIds.length > 0) {
        const projects = await this.db.query(
          `SELECT ROWID, name FROM ${TABLES.PROJECTS} WHERE ROWID IN (${projectIds.map((id) => `'${id}'`).join(',')}) LIMIT 100`
        );
        projects.forEach((p) => { projectMap[String(p.ROWID)] = p.name; });
      }

      return ResponseHelper.success(res, {
        standups: standups.map((s) => ({
          id: String(s.ROWID),
          projectId: s.project_id,
          projectName: projectMap[String(s.project_id)] || null,
          userId: s.user_id,
          date: s.entry_date,
          yesterday: s.yesterday,
          today: s.today,
          blockers: s.blockers,
          status: s.status,
          submittedAt: s.submitted_at,
        })),
      });
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

      // TEAM_MEMBER only sees their own entries in rollup (unless org role grants org-wide access)
      const isLimitedToOwn = role === 'TEAM_MEMBER' && req.currentUser.dataScope !== 'ORG_WIDE' && req.currentUser.dataScope !== 'SUBORDINATES';
      const userFilter = isLimitedToOwn ? ` AND user_id = '${currentUserId}'` : '';

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
  // Requires Search Index enabled on 'yesterday', 'today', 'blockers' columns of 'standup_entries'.
  async searchMyStandups(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const q = (req.query.q || '').trim();
      if (!q || q.length < 2) return ResponseHelper.validationError(res, 'Search term must be at least 2 characters');

      const results = await this.catalystApp.search().executeSearchQuery({
        search: q,
        search_table_columns: { [TABLES.STANDUP_ENTRIES]: ['yesterday', 'today', 'blockers'] },
        select_table_columns: {
          [TABLES.STANDUP_ENTRIES]: ['ROWID', 'yesterday', 'today', 'blockers',
            'entry_date', 'project_id', 'user_id', 'tenant_id', 'submitted_at'],
        },
      });

      const hits = (results[TABLES.STANDUP_ENTRIES] ?? []).filter(
        (s) => String(s.tenant_id) === String(tenantId) && String(s.user_id) === String(userId)
      );

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
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = StandupController;
