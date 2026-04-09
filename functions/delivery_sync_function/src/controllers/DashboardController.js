'use strict';

const DataStoreService = require('../services/DataStoreService');
const ResponseHelper = require('../utils/ResponseHelper');
const { TABLES, ACTION_STATUS, BLOCKER_STATUS, RAG_STATUS } = require('../utils/Constants');

/**
 * DashboardController – aggregates delivery intelligence for dashboards.
 *
 * Three dashboard types:
 *  1. Delivery Lead – personal project health snapshot
 *  2. Project – deep dive for one project
 *  3. Portfolio – cross-project executive view
 */
class DashboardController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
  }

  /**
   * GET /api/dashboard/summary
   * Delivery Lead dashboard: my projects, RAG status, missing standups/EOD,
   * overdue actions, critical blockers.
   */
  async getSummary(req, res) {
    try {
      const { tenantId, id: userId, role } = req.currentUser;
      const today = DataStoreService.today();
      const isAdmin = role === 'TENANT_ADMIN' || role === 'PMO' || role === 'EXEC';

      // ── My Projects (fetch up to 100 for list + RAG display) ─────────────────
      let projects = [];
      let totalProjectsCount = 0;
      if (isAdmin) {
        [projects, totalProjectsCount] = await Promise.all([
          this.db.findAll(TABLES.PROJECTS,
            { tenant_id: tenantId, status: 'ACTIVE' },
            { orderBy: 'CREATEDTIME DESC', limit: 100 }),
          this.db.count(TABLES.PROJECTS, { tenant_id: tenantId, status: 'ACTIVE' }),
        ]);
      } else {
        const memberships = await this.db.findAll(TABLES.PROJECT_MEMBERS,
          { tenant_id: tenantId, user_id: userId },
          { limit: 200 });
        if (memberships.length > 0) {
          const projectIds = memberships.map((m) => `'${m.project_id}'`).join(',');
          projects = await this.db.query(
            `SELECT * FROM ${TABLES.PROJECTS} WHERE tenant_id = '${tenantId}' ` +
            `AND ROWID IN (${projectIds}) AND status = 'ACTIVE' LIMIT 200`
          );
        }
        totalProjectsCount = projects.length;
      }

      const ragCounts = { RED: 0, AMBER: 0, GREEN: 0 };
      projects.forEach((p) => { if (ragCounts[p.rag_status] !== undefined) ragCounts[p.rag_status]++; });

      // ── Missing Standups Today ────────────────────────────────────────────────
      const standupRows = await this.db.findAll(TABLES.STANDUP_ENTRIES,
        { tenant_id: tenantId, entry_date: today, user_id: userId },
        { limit: 200 });
      const submittedProjectIds = new Set(standupRows.map((s) => String(s.project_id)));
      const missingStandups = projects.filter((p) => !submittedProjectIds.has(String(p.ROWID)));

      // ── Missing EOD Today ─────────────────────────────────────────────────────
      const eodRows = await this.db.findAll(TABLES.EOD_ENTRIES,
        { tenant_id: tenantId, entry_date: today, user_id: userId },
        { limit: 200 });
      const eodProjectIds = new Set(eodRows.map((e) => String(e.project_id)));
      const missingEod = projects.filter((p) => !eodProjectIds.has(String(p.ROWID)));

      // ── Overdue Actions + count ───────────────────────────────────────────────
      const overdueWhere = `assigned_to = '${userId}' AND due_date < '${today}' ` +
        `AND status != '${ACTION_STATUS.DONE}' AND status != '${ACTION_STATUS.CANCELLED}'`;
      const [overdueActions, overdueActionsCount] = await Promise.all([
        this.db.findWhere(TABLES.ACTIONS, tenantId, overdueWhere, { orderBy: 'due_date ASC', limit: 20 }),
        this.db.countWhere(TABLES.ACTIONS, tenantId, overdueWhere),
      ]);

      // ── Critical Blockers + count ─────────────────────────────────────────────
      const blockersWhere = `severity = 'CRITICAL' AND status != '${BLOCKER_STATUS.RESOLVED}'`;
      const [criticalBlockers, criticalBlockersCount] = await Promise.all([
        this.db.findWhere(TABLES.BLOCKERS, tenantId, blockersWhere, { orderBy: 'CREATEDTIME ASC', limit: 20 }),
        this.db.countWhere(TABLES.BLOCKERS, tenantId, blockersWhere),
      ]);

      return ResponseHelper.success(res, {
        projects: projects.map((p) => ({
          id: String(p.ROWID), name: p.name, ragStatus: p.rag_status, status: p.status,
          startDate: p.start_date, endDate: p.end_date,
        })),
        ragSummary: ragCounts,
        missingStandups: missingStandups.map((p) => ({ id: String(p.ROWID), name: p.name })),
        missingEod: missingEod.map((p) => ({ id: String(p.ROWID), name: p.name })),
        overdueActions: overdueActions.map((a) => ({
          id: String(a.ROWID), title: a.title, dueDate: a.due_date,
          priority: a.action_priority, projectId: a.project_id,
        })),
        criticalBlockers: criticalBlockers.map((b) => ({
          id: String(b.ROWID), title: b.title, severity: b.severity,
          status: b.status, projectId: b.project_id,
        })),
        stats: {
          totalProjects: totalProjectsCount,
          overdueActionsCount,
          criticalBlockersCount,
          missingStandupsCount: missingStandups.length,
          missingEodCount: missingEod.length,
        },
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/dashboard/project/:projectId
   * Project-level dashboard.
   */
  async getProjectDashboard(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { projectId } = req.params;
      const today = DataStoreService.today();
      const sevenDaysAgo = DataStoreService.daysAgo(7);

      const [project] = await this.db.query(
        `SELECT * FROM ${TABLES.PROJECTS} WHERE ROWID = '${projectId}' AND tenant_id = '${tenantId}' LIMIT 1`
      );
      if (!project) return ResponseHelper.notFound(res, 'Project not found');

      const [standups, eods, actions, blockers, milestones, members] = await Promise.all([
        this.db.findWhere(TABLES.STANDUP_ENTRIES, tenantId,
          `project_id = '${projectId}' AND entry_date >= '${sevenDaysAgo}'`,
          { orderBy: 'entry_date DESC', limit: 100 }),
        this.db.findWhere(TABLES.EOD_ENTRIES, tenantId,
          `project_id = '${projectId}' AND entry_date >= '${sevenDaysAgo}'`,
          { orderBy: 'entry_date DESC', limit: 100 }),
        this.db.findAll(TABLES.ACTIONS,
          { tenant_id: tenantId, project_id: projectId },
          { orderBy: 'due_date ASC', limit: 50 }),
        this.db.findAll(TABLES.BLOCKERS,
          { tenant_id: tenantId, project_id: projectId },
          { orderBy: 'CREATEDTIME DESC', limit: 30 }),
        this.db.findAll(TABLES.MILESTONES,
          { tenant_id: tenantId, project_id: projectId },
          { orderBy: 'due_date ASC', limit: 30 }),
        this.db.findAll(TABLES.PROJECT_MEMBERS,
          { tenant_id: tenantId, project_id: projectId },
          { limit: 50 }),
      ]);

      const overdueActions = actions.filter(
        (a) => a.due_date < today && a.status !== ACTION_STATUS.DONE && a.status !== ACTION_STATUS.CANCELLED
      );
      const openBlockers = blockers.filter((b) => b.status !== BLOCKER_STATUS.RESOLVED);
      const delayedMilestones = milestones.filter(
        (m) => m.due_date < today && m.status !== 'COMPLETED'
      );

      return ResponseHelper.success(res, {
        project: {
          id: String(project.ROWID), name: project.name, ragStatus: project.rag_status,
          status: project.status, startDate: project.start_date, endDate: project.end_date,
          description: project.description,
        },
        stats: {
          totalStandups: standups.length,
          totalEods: eods.length,
          openActions: actions.filter((a) => a.status === ACTION_STATUS.OPEN).length,
          overdueActions: overdueActions.length,
          openBlockers: openBlockers.length,
          criticalBlockers: openBlockers.filter((b) => b.severity === 'CRITICAL').length,
          totalMilestones: milestones.length,
          delayedMilestones: delayedMilestones.length,
          totalMembers: members.length,
        },
        recentStandups: standups.slice(0, 10),
        recentEods: eods.slice(0, 10),
        openActionsPreview: overdueActions.slice(0, 5).map((a) => ({
          id: String(a.ROWID), title: a.title, dueDate: a.due_date, priority: a.action_priority,
        })),
        openBlockersPreview: openBlockers.slice(0, 5).map((b) => ({
          id: String(b.ROWID), title: b.title, severity: b.severity, status: b.status,
        })),
        milestones: milestones.map((m) => ({
          id: String(m.ROWID), title: m.title, dueDate: m.due_date, status: m.status,
        })),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/dashboard/portfolio
   * Portfolio dashboard: cross-project RAG, delayed milestones, top blockers.
   */
  async getPortfolioDashboard(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const today = DataStoreService.today();

      const [projects, allBlockers, allMilestones, allActions] = await Promise.all([
        this.db.findAll(TABLES.PROJECTS, { tenant_id: tenantId, status: 'ACTIVE' }, { limit: 100 }),
        this.db.findWhere(TABLES.BLOCKERS, tenantId, `status != 'RESOLVED'`, { limit: 100 }),
        this.db.findAll(TABLES.MILESTONES, { tenant_id: tenantId }, { orderBy: 'due_date ASC', limit: 200 }),
        this.db.findWhere(TABLES.ACTIONS, tenantId,
          `status != '${ACTION_STATUS.DONE}' AND status != '${ACTION_STATUS.CANCELLED}'`, { limit: 200 }),
      ]);

      const ragBreakdown = {
        [RAG_STATUS.RED]: projects.filter((p) => p.rag_status === RAG_STATUS.RED),
        [RAG_STATUS.AMBER]: projects.filter((p) => p.rag_status === RAG_STATUS.AMBER),
        [RAG_STATUS.GREEN]: projects.filter((p) => p.rag_status === RAG_STATUS.GREEN),
      };

      const delayedMilestones = allMilestones.filter(
        (m) => m.due_date < today && m.status !== 'COMPLETED'
      );

      const topBlockers = allBlockers
        .filter((b) => b.severity === 'CRITICAL' || b.severity === 'HIGH')
        .slice(0, 10);

      const overdueActionsCount = allActions.filter((a) => a.due_date < today).length;

      return ResponseHelper.success(res, {
        summary: {
          totalProjects: projects.length,
          redProjects: ragBreakdown.RED.length,
          amberProjects: ragBreakdown.AMBER.length,
          greenProjects: ragBreakdown.GREEN.length,
          delayedMilestones: delayedMilestones.length,
          openBlockers: allBlockers.length,
          overdueActions: overdueActionsCount,
        },
        projectsByRAG: {
          RED: ragBreakdown.RED.map((p) => ({ id: String(p.ROWID), name: p.name, endDate: p.end_date })),
          AMBER: ragBreakdown.AMBER.map((p) => ({ id: String(p.ROWID), name: p.name, endDate: p.end_date })),
          GREEN: ragBreakdown.GREEN.map((p) => ({ id: String(p.ROWID), name: p.name, endDate: p.end_date })),
        },
        delayedMilestones: delayedMilestones.slice(0, 20).map((m) => ({
          id: String(m.ROWID), title: m.title, dueDate: m.due_date,
          projectId: m.project_id, status: m.status,
        })),
        topBlockers: topBlockers.map((b) => ({
          id: String(b.ROWID), title: b.title, severity: b.severity,
          projectId: b.project_id, status: b.status,
        })),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = DashboardController;
