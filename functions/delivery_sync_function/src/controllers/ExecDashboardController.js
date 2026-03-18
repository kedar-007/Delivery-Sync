'use strict';

const DataStoreService = require('../services/DataStoreService');
const ResponseHelper = require('../utils/ResponseHelper');
const { TABLES, ACTION_STATUS, BLOCKER_STATUS } = require('../utils/Constants');

/**
 * ExecDashboardController
 * Aggregates organisation-wide delivery intelligence for CEO and CTO dashboards.
 * A single endpoint returns all required stats in one round-trip.
 */
class ExecDashboardController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
  }

  /** Add N days to today, return YYYY-MM-DD */
  static daysAhead(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  }

  /**
   * GET /api/dashboard/exec-summary
   * Role guard: EXEC, TENANT_ADMIN, PMO (enforced in route).
   */
  async getSummary(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const today      = DataStoreService.today();
      const ago7       = DataStoreService.daysAgo(7);
      const ago30      = DataStoreService.daysAgo(30);
      const ahead7     = ExecDashboardController.daysAhead(7);

      // ── Parallel fetch of all required tables ──────────────────────────────
      const [
        allProjects,
        allBlockers,
        allMilestones,
        allActions,
        allRisks,
        allDecisions,
        allDependencies,
        allUsers,
        allTeams,
        standups7d,
        eods7d,
        standupsToday,
        eodsToday,
      ] = await Promise.all([
        this.db.findAll(TABLES.PROJECTS,      { tenant_id: tenantId }, { limit: 200 }),
        this.db.findAll(TABLES.BLOCKERS,      { tenant_id: tenantId }, { limit: 200 }),
        this.db.findAll(TABLES.MILESTONES,    { tenant_id: tenantId }, { orderBy: 'due_date ASC', limit: 200 }),
        this.db.findAll(TABLES.ACTIONS,       { tenant_id: tenantId }, { limit: 200 }),
        this.db.findAll(TABLES.RISKS,         { tenant_id: tenantId }, { limit: 200 }),
        this.db.findAll(TABLES.DECISIONS,     { tenant_id: tenantId }, { limit: 200 }),
        this.db.findAll(TABLES.DEPENDENCIES,  { tenant_id: tenantId }, { limit: 200 }),
        this.db.findAll(TABLES.USERS,         { tenant_id: tenantId }, { limit: 200 }),
        this.db.findAll(TABLES.TEAMS,         { tenant_id: tenantId }, { limit: 100 }),
        this.db.findWhere(TABLES.STANDUP_ENTRIES, tenantId, `entry_date >= '${ago7}'`,  { limit: 200 }),
        this.db.findWhere(TABLES.EOD_ENTRIES,     tenantId, `entry_date >= '${ago7}'`,  { limit: 200 }),
        this.db.findAll(TABLES.STANDUP_ENTRIES, { tenant_id: tenantId, entry_date: today }, { limit: 200 }),
        this.db.findAll(TABLES.EOD_ENTRIES,     { tenant_id: tenantId, entry_date: today }, { limit: 200 }),
      ]);

      // ── Portfolio ──────────────────────────────────────────────────────────
      const activeProjects    = allProjects.filter(p => p.status === 'ACTIVE');
      const completedProjects = allProjects.filter(p => p.status === 'COMPLETED');
      const onHoldProjects    = allProjects.filter(p => p.status === 'ON_HOLD');
      const ragCounts = { RED: 0, AMBER: 0, GREEN: 0 };
      activeProjects.forEach(p => { if (ragCounts[p.rag_status] !== undefined) ragCounts[p.rag_status]++; });

      // ── Milestones ─────────────────────────────────────────────────────────
      const completedMilestones = allMilestones.filter(m => m.status === 'COMPLETED');
      const overdueMilestones   = allMilestones.filter(m => m.due_date < today && m.status !== 'COMPLETED');
      const upcoming7d          = allMilestones.filter(m => m.due_date >= today && m.due_date <= ahead7 && m.status !== 'COMPLETED');
      const msCompletionRate    = allMilestones.length > 0
        ? Math.round((completedMilestones.length / allMilestones.length) * 100) : 0;

      // ── Actions ────────────────────────────────────────────────────────────
      const doneActions     = allActions.filter(a => a.status === ACTION_STATUS.DONE);
      const openActions     = allActions.filter(a => a.status === ACTION_STATUS.OPEN || a.status === 'IN_PROGRESS');
      const overdueActions  = allActions.filter(a =>
        a.due_date < today &&
        a.status !== ACTION_STATUS.DONE &&
        a.status !== ACTION_STATUS.CANCELLED);
      const actionCompRate  = allActions.length > 0
        ? Math.round((doneActions.length / allActions.length) * 100) : 0;

      // ── Blockers ───────────────────────────────────────────────────────────
      const openBlockers     = allBlockers.filter(b => b.status !== BLOCKER_STATUS.RESOLVED);
      const criticalBlockers = openBlockers.filter(b => b.severity === 'CRITICAL');
      const highBlockers     = openBlockers.filter(b => b.severity === 'HIGH');
      const mediumBlockers   = openBlockers.filter(b => b.severity === 'MEDIUM');

      // ── Risks ──────────────────────────────────────────────────────────────
      const openRisks    = allRisks.filter(r => r.status !== 'CLOSED' && r.status !== 'RESOLVED');
      const criticalRisks = openRisks.filter(r => r.severity === 'CRITICAL' || r.severity === 'HIGH');

      // ── Teams / People ─────────────────────────────────────────────────────
      const activeUsers = allUsers.filter(u => u.status === 'ACTIVE');

      // ── Activity Trend – last 7 days ───────────────────────────────────────
      const activityTrend = [];
      for (let i = 6; i >= 0; i--) {
        const day = DataStoreService.daysAgo(i);
        activityTrend.push({
          date:     day,
          standups: standups7d.filter(s => s.entry_date === day).length,
          eods:     eods7d.filter(e => e.entry_date === day).length,
        });
      }

      // ── Submission rates ───────────────────────────────────────────────────
      const expectedPerDay    = Math.max(1, activeUsers.length);
      const avgStandupRate    = activityTrend.length > 0
        ? Math.min(100, Math.round(
            activityTrend.reduce((s, d) => s + d.standups, 0) /
            (activityTrend.length * expectedPerDay) * 100
          )) : 0;

      // ── Portfolio health score (composite) ────────────────────────────────
      // Weighted: RAG 40 % + milestone completion 30 % + action completion 20 % + blocker penalty 10 %
      const ragScore       = activeProjects.length > 0
        ? Math.round(((ragCounts.GREEN * 100 + ragCounts.AMBER * 50) / (activeProjects.length * 100)) * 100) : 0;
      const blockerPenalty = Math.min(50, criticalBlockers.length * 10 + highBlockers.length * 5);
      const healthScore    = Math.max(0, Math.round(
        ragScore * 0.4 +
        msCompletionRate * 0.3 +
        actionCompRate * 0.2 +
        (100 - blockerPenalty) * 0.1
      ));

      // ── Per-project summaries ──────────────────────────────────────────────
      const projects = activeProjects.map(p => {
        const pid  = String(p.ROWID);
        const pMs  = allMilestones.filter(m => String(m.project_id) === pid);
        const pBlk = openBlockers.filter(b => String(b.project_id) === pid);
        const pAct = allActions.filter(a => String(a.project_id) === pid);
        const pOvr = pAct.filter(a =>
          a.due_date < today &&
          a.status !== ACTION_STATUS.DONE &&
          a.status !== ACTION_STATUS.CANCELLED);
        const pDone = pMs.filter(m => m.status === 'COMPLETED');
        const msProgress = pMs.length > 0
          ? Math.round((pDone.length / pMs.length) * 100) : 0;

        // Per-project health score
        const pRag = p.rag_status === 'GREEN' ? 100 : p.rag_status === 'AMBER' ? 50 : 0;
        const pHealth = Math.max(0, Math.round(
          pRag * 0.5 +
          msProgress * 0.3 +
          Math.max(0, 100 - pOvr.length * 10) * 0.2
        ));

        return {
          id:                 pid,
          name:               p.name,
          status:             p.status,
          ragStatus:          p.rag_status,
          startDate:          p.start_date,
          endDate:            p.end_date,
          openBlockers:       pBlk.length,
          criticalBlockers:   pBlk.filter(b => b.severity === 'CRITICAL').length,
          overdueActions:     pOvr.length,
          totalActions:       pAct.length,
          totalMilestones:    pMs.length,
          completedMilestones: pDone.length,
          milestoneProgress:  msProgress,
          overdueMilestones:  pMs.filter(m => m.due_date < today && m.status !== 'COMPLETED').length,
          healthScore:        pHealth,
        };
      });

      // ── Decisions this month ───────────────────────────────────────────────
      const monthStart = new Date();
      monthStart.setDate(1);
      const monthStartStr = monthStart.toISOString().slice(0, 10);
      const decisionsThisMonth = allDecisions.filter(d =>
        (d.CREATEDTIME || '').slice(0, 10) >= monthStartStr
      ).length;

      // ── Open dependencies ──────────────────────────────────────────────────
      const openDeps = allDependencies.filter(d =>
        d.status !== 'RESOLVED' && d.status !== 'CLOSED'
      );

      return ResponseHelper.success(res, {
        portfolio: {
          total:       allProjects.length,
          active:      activeProjects.length,
          completed:   completedProjects.length,
          onHold:      onHoldProjects.length,
          byRag:       ragCounts,
          healthScore,
        },
        milestones: {
          total:          allMilestones.length,
          completed:      completedMilestones.length,
          overdue:        overdueMilestones.length,
          upcoming7days:  upcoming7d.length,
          completionRate: msCompletionRate,
        },
        actions: {
          total:          allActions.length,
          open:           openActions.length,
          overdue:        overdueActions.length,
          done:           doneActions.length,
          completionRate: actionCompRate,
        },
        blockers: {
          open:     openBlockers.length,
          critical: criticalBlockers.length,
          high:     highBlockers.length,
          medium:   mediumBlockers.length,
          low:      openBlockers.filter(b => b.severity === 'LOW').length,
        },
        risks: {
          open:     openRisks.length,
          critical: criticalRisks.length,
          high:     openRisks.filter(r => r.severity === 'HIGH').length,
        },
        decisions: {
          total:      allDecisions.length,
          thisMonth:  decisionsThisMonth,
        },
        dependencies: { open: openDeps.length },
        teams: {
          total:       allTeams.length,
          memberCount: activeUsers.length,
        },
        standups: {
          submittedToday:      standupsToday.length,
          last7DaysTotal:      standups7d.length,
          submissionRateLast7d: avgStandupRate,
        },
        eods: {
          submittedToday:  eodsToday.length,
          last7DaysTotal:  eods7d.length,
        },
        activityTrend,
        projects,
        topBlockers: openBlockers
          .filter(b => b.severity === 'CRITICAL' || b.severity === 'HIGH')
          .slice(0, 12)
          .map(b => ({
            id:         String(b.ROWID),
            title:      b.title,
            severity:   b.severity,
            status:     b.status,
            projectId:  String(b.project_id),
            raisedDate: b.raised_date,
          })),
        upcomingMilestones: upcoming7d.slice(0, 10).map(m => ({
          id:        String(m.ROWID),
          title:     m.title,
          dueDate:   m.due_date,
          projectId: String(m.project_id),
          status:    m.status,
        })),
        overdueMilestones: overdueMilestones.slice(0, 10).map(m => ({
          id:        String(m.ROWID),
          title:     m.title,
          dueDate:   m.due_date,
          projectId: String(m.project_id),
        })),
      });
    } catch (err) {
      console.error('[ExecDashboard]', err.message, err.stack);
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = ExecDashboardController;
