'use strict';

const DataStoreService = require('../services/DataStoreService');
const ResponseHelper = require('../utils/ResponseHelper');
const Validator = require('../utils/Validator');
const { TABLES } = require('../utils/Constants');

/**
 * EodController – end-of-day updates.
 * Mirrors StandupController pattern with EOD-specific fields.
 */
class EodController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
  }

  /**
   * POST /api/eod
   */
  async submitEod(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const data = Validator.validateSubmitEod(req.body);

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
        submitted_at: new Date().toISOString(),
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

      // TEAM_MEMBER can only see their own EODs
      const effectiveUserId = role === 'TEAM_MEMBER' ? currentUserId : userId;

      let conditions = [];
      if (projectId) conditions.push(`project_id = '${DataStoreService.escape(projectId)}'`);
      if (date) conditions.push(`entry_date = '${DataStoreService.escape(date)}'`);
      if (effectiveUserId) conditions.push(`user_id = '${DataStoreService.escape(effectiveUserId)}'`);
      if (startDate && endDate) {
        conditions.push(`entry_date >= '${DataStoreService.escape(startDate)}'`);
        conditions.push(`entry_date <= '${DataStoreService.escape(endDate)}'`);
      }

      const whereExtra = conditions.length > 0 ? conditions.join(' AND ') : null;
      const eods = await this.db.findWhere(
        TABLES.EOD_ENTRIES, tenantId,
        whereExtra,
        { orderBy: 'CREATEDTIME DESC', limit: 100 }
      );

      return ResponseHelper.success(res, {
        eods: eods.map((e) => ({
          id: String(e.ROWID),
          projectId: e.project_id,
          userId: e.user_id,
          date: e.entry_date,
          accomplishments: e.accomplished,
          plannedTomorrow: e.plan_for_tomorrow,
          blockers: e.blockers,
          progressPercentage: Number(e.progress_percentage || 0),
          mood: e.mood,
          submittedAt: e.submitted_at,
        })),
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

      // TEAM_MEMBER only sees their own entries in rollup
      const userFilter = role === 'TEAM_MEMBER' ? ` AND user_id = '${currentUserId}'` : '';

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
}

module.exports = EodController;
