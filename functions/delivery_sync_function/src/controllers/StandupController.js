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
        { orderBy: 'CREATEDTIME DESC', limit: 100 }
      );

      return ResponseHelper.success(res, {
        standups: standups.map((s) => ({
          id: String(s.ROWID),
          projectId: s.project_id,
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
}

module.exports = StandupController;
