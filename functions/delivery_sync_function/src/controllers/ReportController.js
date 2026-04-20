'use strict';

const DataStoreService = require('../services/DataStoreService');
const ResponseHelper = require('../utils/ResponseHelper');
const Validator = require('../utils/Validator');
const { TABLES, ACTION_STATUS, BLOCKER_STATUS, REPORT_SUBTYPE } = require('../utils/Constants');

/**
 * ReportController – generates and stores weekly/monthly delivery reports.
 *
 * Architecture decision: Reports are generated on-demand by aggregating live
 * DataStore data into a structured JSON summary which is then persisted. This
 * avoids heavy pre-computation while giving leadership a snapshot they can
 * share or export.
 */
class ReportController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
  }

  /**
   * POST /api/reports/generate
   */
  async generateReport(req, res) {
    try {
      const { tenantId, id: userId, role } = req.currentUser;
      const data = Validator.validateGenerateReport(req.body);

      const project = await this.db.findById(TABLES.PROJECTS, data.project_id, tenantId);
      if (!project) return ResponseHelper.notFound(res, 'Project not found');

      // TEAM_MEMBER reports are scoped to their own standup/EOD activity only (unless org-wide access)
      const isLimitedToOwn = role === 'TEAM_MEMBER' && req.currentUser.dataScope !== 'ORG_WIDE' && req.currentUser.dataScope !== 'SUBORDINATES';
      const userFilter = isLimitedToOwn ? ` AND user_id = '${userId}'` : '';
      const actionFilter = isLimitedToOwn ? ` AND assigned_to = '${userId}'` : '';

      // Gather data for the period
      const [standups, eods, actions, blockers, milestones, decisions] = await Promise.all([
        this.db.findWhere(TABLES.STANDUP_ENTRIES, tenantId,
          `project_id = '${data.project_id}' AND entry_date >= '${data.period_start}' AND entry_date <= '${data.period_end}'${userFilter}`,
          { limit: 200 }),
        this.db.findWhere(TABLES.EOD_ENTRIES, tenantId,
          `project_id = '${data.project_id}' AND entry_date >= '${data.period_start}' AND entry_date <= '${data.period_end}'${userFilter}`,
          { limit: 200 }),
        this.db.findWhere(TABLES.ACTIONS, tenantId,
          `project_id = '${data.project_id}'${actionFilter}`,
          { limit: 200 }),
        this.db.findAll(TABLES.BLOCKERS, { tenant_id: tenantId, project_id: data.project_id }, { limit: 100 }),
        this.db.findAll(TABLES.MILESTONES, { tenant_id: tenantId, project_id: data.project_id }, { orderBy: 'due_date ASC', limit: 100 }),
        this.db.findAll(TABLES.DECISIONS, { tenant_id: tenantId, project_id: data.project_id }, { limit: 50 }),
      ]);

      const today = DataStoreService.today();

      // Compute summary
      const completedActions = actions.filter((a) => a.status === ACTION_STATUS.DONE);
      const overdueActions = actions.filter(
        (a) => a.due_date < today && a.status !== ACTION_STATUS.DONE && a.status !== ACTION_STATUS.CANCELLED
      );
      const resolvedBlockers = blockers.filter((b) => b.status === BLOCKER_STATUS.RESOLVED);
      const openBlockers = blockers.filter((b) => b.status !== BLOCKER_STATUS.RESOLVED);
      const avgProgress = eods.length > 0
        ? Math.round(eods.reduce((sum, e) => sum + Number(e.progress_percentage || 0), 0) / eods.length)
        : 0;

      // Unique submitters
      const standupSubmitters = new Set(standups.map((s) => s.user_id));
      const members = await this.db.findAll(TABLES.PROJECT_MEMBERS,
        { tenant_id: tenantId, project_id: data.project_id }, { limit: 100 });
      const submissionRate = members.length > 0
        ? Math.round((standupSubmitters.size / members.length) * 100)
        : 0;

      const summary = {
        projectName: project.name,
        ragStatus: project.rag_status,
        period: { start: data.period_start, end: data.period_end },
        standups: {
          total: standups.length,
          uniqueContributors: standupSubmitters.size,
          submissionRate: `${submissionRate}%`,
        },
        eods: {
          total: eods.length,
          avgProgressPercentage: avgProgress,
        },
        actions: {
          total: actions.length,
          completed: completedActions.length,
          open: actions.filter((a) => a.status === ACTION_STATUS.OPEN).length,
          overdue: overdueActions.length,
          completionRate: actions.length > 0 ? Math.round((completedActions.length / actions.length) * 100) : 0,
        },
        blockers: {
          total: blockers.length,
          open: openBlockers.length,
          resolved: resolvedBlockers.length,
          critical: blockers.filter((b) => b.severity === 'CRITICAL').length,
        },
        milestones: {
          total: milestones.length,
          completed: milestones.filter((m) => m.status === 'COMPLETED').length,
          delayed: milestones.filter((m) => m.due_date < today && m.status !== 'COMPLETED').length,
          upcoming: milestones.filter((m) => m.due_date >= today && m.status !== 'COMPLETED').length,
        },
        decisionsCount: decisions.length,
        keyBlockers: openBlockers.filter((b) => b.severity === 'CRITICAL' || b.severity === 'HIGH')
          .slice(0, 5).map((b) => ({ title: b.title, severity: b.severity })),
        overdueActionsPreview: overdueActions.slice(0, 5).map((a) => ({ title: a.title, dueDate: a.due_date })),
        upcomingMilestones: milestones
          .filter((m) => m.due_date >= today && m.status !== 'COMPLETED').slice(0, 5)
          .map((m) => ({ title: m.title, dueDate: m.due_date, status: m.status })),
      };

      const report = await this.db.insert(TABLES.REPORTS, {
        tenant_id: tenantId,
        project_id: data.project_id,
        report_type: data.report_type,
        period_start: data.period_start,
        period_end: data.period_end,
        summary: JSON.stringify(summary),
        generated_by: userId,
      });

      return ResponseHelper.created(res, {
        report: { id: String(report.ROWID), ...summary, reportType: data.report_type },
      }, 'Report generated');
    } catch (err) {
      if (err.isValidation) return ResponseHelper.validationError(res, err.message, err.details);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/reports?projectId=&reportType=
   */
  async getReports(req, res) {
    try {
      const { tenantId, id: currentUserId, role } = req.currentUser;
      const { projectId, reportType } = req.query;

      const conditions = [];
      if (projectId) conditions.push(`project_id = '${DataStoreService.escape(projectId)}'`);
      if (reportType) conditions.push(`report_type = '${DataStoreService.escape(reportType)}'`);
      // TEAM_MEMBER only sees reports they generated (unless org-wide access)
      const isLimitedToOwn = role === 'TEAM_MEMBER' && req.currentUser.dataScope !== 'ORG_WIDE' && req.currentUser.dataScope !== 'SUBORDINATES';
      if (isLimitedToOwn) conditions.push(`generated_by = '${DataStoreService.escape(currentUserId)}'`);

      const reports = await this.db.findWhere(TABLES.REPORTS, tenantId,
        conditions.length > 0 ? conditions.join(' AND ') : null,
        { orderBy: 'CREATEDTIME DESC', limit: 50 });

      return ResponseHelper.success(res, {
        reports: reports.map((r) => ({
          id: String(r.ROWID),
          projectId: r.project_id,
          reportType: r.report_type,
          periodStart: r.period_start,
          periodEnd: r.period_end,
          generatedBy: r.generated_by,
          generatedAt: r.generated_at,
          summary: (() => { try { return JSON.parse(r.summary); } catch { return {}; } })(),
        })),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/reports/public/:reportId  — no auth required, used for shareable links
   */
  async getReportPublic(req, res) {
    try {
      const { reportId } = req.params;
      const rows = await this.db.query(
        `SELECT * FROM ${TABLES.REPORTS} WHERE ROWID = '${DataStoreService.escape(reportId)}' LIMIT 1`
      );
      if (rows.length === 0) return ResponseHelper.notFound(res, 'Report not found');
      const report = rows[0];
      return ResponseHelper.success(res, {
        report: {
          id: String(report.ROWID),
          projectId: report.project_id,
          reportType: report.report_type,
          periodStart: report.period_start,
          periodEnd: report.period_end,
          generatedBy: report.generated_by,
          generatedAt: report.generated_at,
          summary: (() => { try { return JSON.parse(report.summary); } catch { return {}; } })(),
        },
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/reports/:reportId
   */
  async getReportById(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { reportId } = req.params;

      const report = await this.db.findById(TABLES.REPORTS, reportId, tenantId);
      if (!report) return ResponseHelper.notFound(res, 'Report not found');

      return ResponseHelper.success(res, {
        report: {
          id: String(report.ROWID),
          projectId: report.project_id,
          reportType: report.report_type,
          periodStart: report.period_start,
          periodEnd: report.period_end,
          generatedBy: report.generated_by,
          generatedAt: report.generated_at,
          summary: (() => { try { return JSON.parse(report.summary); } catch { return {}; } })(),
        },
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }
  // ─── Enhanced Reports ─────────────────────────────────────────────────────────

  /**
   * GET /api/reports/user-performance?projectId=&userId=&startDate=&endDate=
   * Shows standup/EOD consistency, actions completed, blockers raised for a user.
   */
  async getUserPerformanceReport(req, res) {
    try {
      const { tenantId, id: currentUserId, role } = req.currentUser;
      const { projectId, userId, startDate, endDate } = req.query;

      // TEAM_MEMBER can only see their own performance (unless org role grants org-wide access)
      const isLimitedToOwn = role === 'TEAM_MEMBER' && req.currentUser.dataScope !== 'ORG_WIDE' && req.currentUser.dataScope !== 'SUBORDINATES';
      const targetUserId = isLimitedToOwn ? currentUserId : (userId || currentUserId);
      const from = startDate || DataStoreService.daysAgo(30);
      const to = endDate || DataStoreService.today();

      const user = await this.db.findById(TABLES.USERS, targetUserId, tenantId);
      if (!user) return ResponseHelper.notFound(res, 'User not found');

      let projectFilter = projectId ? ` AND project_id = '${DataStoreService.escape(projectId)}'` : '';
      const dateFilter = `entry_date >= '${from}' AND entry_date <= '${to}'`;

      const [standups, eods, actions, blockers] = await Promise.all([
        this.db.findWhere(TABLES.STANDUP_ENTRIES, tenantId,
          `user_id = '${targetUserId}'${projectFilter} AND ${dateFilter}`, { limit: 200 }),
        this.db.findWhere(TABLES.EOD_ENTRIES, tenantId,
          `user_id = '${targetUserId}'${projectFilter} AND ${dateFilter}`, { limit: 200 }),
        this.db.findWhere(TABLES.ACTIONS, tenantId,
          `assigned_to = '${targetUserId}'${projectFilter}`, { limit: 200 }),
        this.db.findWhere(TABLES.BLOCKERS, tenantId,
          `raised_by = '${targetUserId}'${projectFilter}`, { limit: 100 }),
      ]);

      const today = DataStoreService.today();
      const completedActions = actions.filter((a) => a.status === ACTION_STATUS.DONE);
      const overdueActions = actions.filter(
        (a) => a.due_date < today && a.status !== ACTION_STATUS.DONE && a.status !== ACTION_STATUS.CANCELLED
      );

      // Calculate working days in range for submission rate
      const msPerDay = 86400000;
      const totalDays = Math.max(1, Math.ceil((new Date(to) - new Date(from)) / msPerDay) + 1);
      const workingDays = Math.round(totalDays * (5 / 7)); // approx weekdays

      const avgProgress = eods.length > 0
        ? Math.round(eods.reduce((s, e) => s + Number(e.progress_percentage || 0), 0) / eods.length)
        : 0;

      return ResponseHelper.success(res, {
        report: {
          subtype: REPORT_SUBTYPE.USER_PERFORMANCE,
          user: { id: String(user.ROWID), name: user.name, email: user.email, role: user.role },
          period: { from, to, workingDays },
          standup: {
            submitted: standups.length,
            submissionRate: `${Math.min(100, Math.round((standups.length / workingDays) * 100))}%`,
            byDate: standups.map((s) => ({ date: s.entry_date, projectId: s.project_id })),
          },
          eod: {
            submitted: eods.length,
            submissionRate: `${Math.min(100, Math.round((eods.length / workingDays) * 100))}%`,
            avgProgress,
          },
          actions: {
            total: actions.length,
            completed: completedActions.length,
            open: actions.filter((a) => a.status === ACTION_STATUS.OPEN).length,
            overdue: overdueActions.length,
            completionRate: actions.length > 0
              ? `${Math.round((completedActions.length / actions.length) * 100)}%` : '0%',
          },
          blockers: { raised: blockers.length },
        },
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/reports/team-performance?projectId=&startDate=&endDate=
   * Team productivity: per-member submission stats and action completion.
   */
  async getTeamPerformanceReport(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { projectId, startDate, endDate } = req.query;

      if (!projectId) return ResponseHelper.validationError(res, 'projectId is required');

      const project = await this.db.findById(TABLES.PROJECTS, projectId, tenantId);
      if (!project) return ResponseHelper.notFound(res, 'Project not found');

      const from = startDate || DataStoreService.daysAgo(30);
      const to = endDate || DataStoreService.today();
      const today = DataStoreService.today();
      const msPerDay = 86400000;
      const workingDays = Math.max(1, Math.round(
        Math.ceil((new Date(to) - new Date(from)) / msPerDay + 1) * (5 / 7)
      ));

      const members = await this.db.findAll(TABLES.PROJECT_MEMBERS,
        { tenant_id: tenantId, project_id: projectId }, { limit: 100 });

      const memberStats = await Promise.all(members.map(async (m) => {
        const uid = String(m.user_id);
        const user = await this.db.findById(TABLES.USERS, uid, tenantId);

        const [standups, eods, actions] = await Promise.all([
          this.db.findWhere(TABLES.STANDUP_ENTRIES, tenantId,
            `user_id = '${uid}' AND project_id = '${projectId}' AND entry_date >= '${from}' AND entry_date <= '${to}'`,
            { limit: 200 }),
          this.db.findWhere(TABLES.EOD_ENTRIES, tenantId,
            `user_id = '${uid}' AND project_id = '${projectId}' AND entry_date >= '${from}' AND entry_date <= '${to}'`,
            { limit: 200 }),
          this.db.findWhere(TABLES.ACTIONS, tenantId,
            `assigned_to = '${uid}' AND project_id = '${projectId}'`, { limit: 100 }),
        ]);

        const completed = actions.filter((a) => a.status === ACTION_STATUS.DONE).length;
        const overdue = actions.filter(
          (a) => a.due_date < today && a.status !== ACTION_STATUS.DONE && a.status !== ACTION_STATUS.CANCELLED
        ).length;

        return {
          userId: uid,
          name: user?.name || uid,
          email: user?.email || '',
          projectRole: m.role,
          standupSubmissions: standups.length,
          standupRate: `${Math.min(100, Math.round((standups.length / workingDays) * 100))}%`,
          eodSubmissions: eods.length,
          eodRate: `${Math.min(100, Math.round((eods.length / workingDays) * 100))}%`,
          actionsTotal: actions.length,
          actionsCompleted: completed,
          actionsOverdue: overdue,
          completionRate: actions.length > 0 ? `${Math.round((completed / actions.length) * 100)}%` : '0%',
        };
      }));

      return ResponseHelper.success(res, {
        report: {
          subtype: REPORT_SUBTYPE.TEAM_PERFORMANCE,
          project: { id: projectId, name: project.name },
          period: { from, to, workingDays },
          members: memberStats,
          summary: {
            totalMembers: memberStats.length,
            avgStandupRate: memberStats.length > 0
              ? `${Math.round(memberStats.reduce((s, m) => s + parseFloat(m.standupRate), 0) / memberStats.length)}%`
              : '0%',
            avgEodRate: memberStats.length > 0
              ? `${Math.round(memberStats.reduce((s, m) => s + parseFloat(m.eodRate), 0) / memberStats.length)}%`
              : '0%',
            totalActionsCompleted: memberStats.reduce((s, m) => s + m.actionsCompleted, 0),
            totalActionsOverdue: memberStats.reduce((s, m) => s + m.actionsOverdue, 0),
          },
        },
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/reports/daily-summary?projectId=&date=
   * Who submitted standup/EOD today, who missed.
   */
  async getDailySummaryReport(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { projectId, date } = req.query;

      if (!projectId) return ResponseHelper.validationError(res, 'projectId is required');

      const project = await this.db.findById(TABLES.PROJECTS, projectId, tenantId);
      if (!project) return ResponseHelper.notFound(res, 'Project not found');

      const targetDate = date || DataStoreService.today();

      const [members, standups, eods] = await Promise.all([
        this.db.findAll(TABLES.PROJECT_MEMBERS, { tenant_id: tenantId, project_id: projectId }, { limit: 100 }),
        this.db.findAll(TABLES.STANDUP_ENTRIES, { tenant_id: tenantId, project_id: projectId, entry_date: targetDate }, { limit: 200 }),
        this.db.findAll(TABLES.EOD_ENTRIES, { tenant_id: tenantId, project_id: projectId, entry_date: targetDate }, { limit: 200 }),
      ]);

      const standupUserIds = new Set(standups.map((s) => String(s.user_id)));
      const eodUserIds = new Set(eods.map((e) => String(e.user_id)));

      const memberDetails = await Promise.all(members.map(async (m) => {
        const uid = String(m.user_id);
        const user = await this.db.findById(TABLES.USERS, uid, tenantId);
        const standup = standups.find((s) => String(s.user_id) === uid);
        const eod = eods.find((e) => String(e.user_id) === uid);
        return {
          userId: uid,
          name: user?.name || uid,
          email: user?.email || '',
          avatarUrl: user?.avatar_url || user?.avtar_url || '',
          projectRole: m.role,
          standupSubmitted: standupUserIds.has(uid),
          eodSubmitted: eodUserIds.has(uid),
          standupMood: standup?.mood || null,
          eodMood: eod?.mood || null,
          eodProgress: eod ? Number(eod.progress_percentage || 0) : null,
        };
      }));

      return ResponseHelper.success(res, {
        report: {
          subtype: REPORT_SUBTYPE.DAILY_SUMMARY,
          project: { id: projectId, name: project.name },
          date: targetDate,
          summary: {
            totalMembers: members.length,
            standupSubmitted: standupUserIds.size,
            standupMissed: members.length - standupUserIds.size,
            eodSubmitted: eodUserIds.size,
            eodMissed: members.length - eodUserIds.size,
            standupRate: members.length > 0 ? `${Math.round((standupUserIds.size / members.length) * 100)}%` : '0%',
            eodRate: members.length > 0 ? `${Math.round((eodUserIds.size / members.length) * 100)}%` : '0%',
          },
          members: memberDetails,
        },
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }
  /**
   * PATCH /api/reports/:reportId  Added
   * Allows renaming the projectName inside the summary JSON.
   */
  async updateReport(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { reportId } = req.params;
      const { title } = req.body;
  
      if (!title || !title.trim()) {
        return ResponseHelper.validationError(res, 'Title is required');
      }
  
      const report = await this.db.findById(TABLES.REPORTS, reportId, tenantId);
      if (!report) return ResponseHelper.notFound(res, 'Report not found');
  
      // Parse existing summary, update projectName, re-stringify
      let summary = {};
      try { summary = JSON.parse(report.summary); } catch { /* keep empty */ }
      summary.projectName = title.trim();
  
      // Fix: Catalyst DataStore requires ROWID inside the row object
      await this.db.update(TABLES.REPORTS, {
        ROWID: reportId,
        summary: JSON.stringify(summary),
      });
  
      return ResponseHelper.success(res, {
        report: {
          id: String(report.ROWID),
          projectId: report.project_id,
          reportType: report.report_type,
          periodStart: report.period_start,
          periodEnd: report.period_end,
          summary,
        },
      }, 'Report updated');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

}

module.exports = ReportController;
