'use strict';

const DataStoreService = require('../services/DataStoreService');
const ResponseHelper = require('../utils/ResponseHelper');
const Validator = require('../utils/Validator');
const { TABLES, ACTION_STATUS, BLOCKER_STATUS } = require('../utils/Constants');

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

      // TEAM_MEMBER reports are scoped to their own standup/EOD activity only
      const userFilter = role === 'TEAM_MEMBER' ? ` AND user_id = '${userId}'` : '';
      const actionFilter = role === 'TEAM_MEMBER' ? ` AND assigned_to = '${userId}'` : '';

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
      // TEAM_MEMBER only sees reports they generated
      if (role === 'TEAM_MEMBER') conditions.push(`generated_by = '${DataStoreService.escape(currentUserId)}'`);

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
}

module.exports = ReportController;
