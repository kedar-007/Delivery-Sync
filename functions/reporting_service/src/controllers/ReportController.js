'use strict';

const DataStoreService = require('../services/DataStoreService');
const ResponseHelper   = require('../utils/ResponseHelper');
const { TABLES }       = require('../utils/Constants');

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Return the first and last day of a month as YYYY-MM-DD strings.
 * Defaults to the current month when month/year are omitted.
 */
function monthBounds(month, year) {
  const now = new Date();
  const m   = month ? parseInt(month, 10) - 1 : now.getMonth();   // 0-based
  const y   = year  ? parseInt(year,  10)     : now.getFullYear();
  const first = new Date(y, m, 1);
  const last  = new Date(y, m + 1, 0);
  const pad   = (n) => String(n).padStart(2, '0');
  const fmt   = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { from: fmt(first), to: fmt(last) };
}

/**
 * Return Jan-01 and Dec-31 for the given year (default: current year).
 */
function yearBounds(year) {
  const y = year ? parseInt(year, 10) : new Date().getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

class ReportController {
  constructor(catalystApp) {
    this.db          = new DataStoreService(catalystApp);
    this.catalystApp = catalystApp;
  }

  // ── 1. Delivery Health ───────────────────────────────────────────────────────

  /**
   * GET /api/reports/delivery-health
   * Returns health metrics for every project in the tenant.
   * Query params: date_from, date_to
   */
  async deliveryHealth(req, res) {
    try {
      const tenantId = req.tenantId;
      const today    = DataStoreService.today();
      const { date_from, date_to } = req.query;

      // Fetch all projects for this tenant
      const projects = await this.db.findWhere(
        TABLES.PROJECTS, tenantId, null,
        { orderBy: 'CREATEDTIME DESC', limit: 200 }
      );

      const report = await Promise.all(projects.map(async (p) => {
        const pid = String(p.ROWID);

        // Total tasks in project
        const [totalRows, doneRows, overdueRows] = await Promise.all([
          this.db.query(
            `SELECT COUNT(*) FROM ${TABLES.TASKS} WHERE tenant_id = '${tenantId}' AND project_id = '${pid}'`
          ),
          this.db.query(
            `SELECT COUNT(*) FROM ${TABLES.TASKS} WHERE tenant_id = '${tenantId}' AND project_id = '${pid}' AND status = 'DONE'`
          ),
          this.db.query(
            `SELECT COUNT(*) FROM ${TABLES.TASKS} WHERE tenant_id = '${tenantId}' AND project_id = '${pid}' AND status != 'DONE' AND due_date < '${today}'`
          ),
        ]);

        const total    = parseInt(Object.values(totalRows[0]   || {})[0] || 0, 10);
        const done     = parseInt(Object.values(doneRows[0]    || {})[0] || 0, 10);
        const overdue  = parseInt(Object.values(overdueRows[0] || {})[0] || 0, 10);

        // health_score: % of non-overdue tasks completed out of total
        const onTime     = done - 0; // done tasks (were done before becoming overdue — best-effort)
        const healthScore = total > 0 ? Math.round(((total - overdue) / total) * 100) : 100;

        return {
          project_id:        pid,
          project_name:      p.name,
          status:            p.status || 'ACTIVE',
          rag_status:        p.rag_status || 'GREEN',
          total_tasks:       total,
          completed_tasks:   done,
          overdue_tasks:     overdue,
          health_score:      healthScore,
          start_date:        p.start_date || null,
          end_date:          p.end_date   || null,
        };
      }));

      return ResponseHelper.success(res, {
        date_from: date_from || null,
        date_to:   date_to   || null,
        projects:  report,
        summary: {
          total_projects:    report.length,
          on_track:          report.filter((p) => p.health_score >= 70).length,
          at_risk:           report.filter((p) => p.health_score >= 40 && p.health_score < 70).length,
          critical:          report.filter((p) => p.health_score < 40).length,
        },
      });
    } catch (err) {
      console.error('[ReportController.deliveryHealth]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── 2. Project Health (single project) ──────────────────────────────────────

  /**
   * GET /api/reports/delivery-health/:projectId
   * Deep-dive for one project: sprint + task breakdown + velocity.
   */
  async projectHealth(req, res) {
    try {
      const tenantId  = req.tenantId;
      const projectId = DataStoreService.escape(req.params.projectId);

      // Project details
      const project = await this.db.findById(TABLES.PROJECTS, req.params.projectId, tenantId);
      if (!project) return ResponseHelper.notFound(res, 'Project not found');

      // Active sprint
      const activeSprints = await this.db.findWhere(
        TABLES.SPRINTS, tenantId,
        `project_id = '${projectId}' AND status = 'ACTIVE'`,
        { limit: 1 }
      );
      const activeSprint = activeSprints[0] || null;

      // Task breakdown by status
      const tasks = await this.db.findWhere(
        TABLES.TASKS, tenantId,
        `project_id = '${projectId}'`,
        { limit: 200 }
      );
      const today = DataStoreService.today();
      const taskBreakdown = tasks.reduce((acc, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
      }, {});
      const overdueTasks = tasks.filter(
        (t) => t.due_date && t.due_date < today && t.status !== 'DONE' && t.status !== 'CANCELLED'
      ).length;

      // Team members
      const members = await this.db.findWhere(
        TABLES.PROJECT_MEMBERS, tenantId,
        `project_id = '${projectId}'`,
        { limit: 100 }
      );

      // Velocity: last 3 completed sprints (completed_points avg)
      const completedSprints = await this.db.findWhere(
        TABLES.SPRINTS, tenantId,
        `project_id = '${projectId}' AND status = 'COMPLETED'`,
        { orderBy: 'CREATEDTIME DESC', limit: 3 }
      );
      const velocityPoints = completedSprints.map((s) => parseFloat(s.completed_points) || 0);
      const avgVelocity = velocityPoints.length > 0
        ? Math.round(velocityPoints.reduce((a, b) => a + b, 0) / velocityPoints.length)
        : 0;

      return ResponseHelper.success(res, {
        project,
        active_sprint:   activeSprint,
        task_breakdown:  taskBreakdown,
        total_tasks:     tasks.length,
        overdue_tasks:   overdueTasks,
        team_members:    members,
        velocity: {
          avg_points_per_sprint: avgVelocity,
          last_sprints_sampled:  completedSprints.length,
        },
      });
    } catch (err) {
      console.error('[ReportController.projectHealth]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── 3. People Summary ────────────────────────────────────────────────────────

  /**
   * GET /api/reports/people-summary
   * Headcount by department/designation, active vs inactive, new hires.
   * Query params: month (1-12), year (YYYY)
   */
  async peopleSummary(req, res) {
    try {
      const tenantId = req.tenantId;
      const { month, year } = req.query;
      const bounds = monthBounds(month, year);

      // All profiles for tenant
      const profiles = await this.db.findWhere(
        TABLES.USER_PROFILES, tenantId, null,
        { limit: 200 }
      );

      // Active users from users table
      const allUsers = await this.db.findWhere(
        TABLES.USERS, tenantId, null,
        { limit: 200 }
      );

      const activeUsers   = allUsers.filter((u) => u.status === 'ACTIVE');
      const inactiveUsers = allUsers.filter((u) => u.status === 'INACTIVE');

      // New hires: users created this month
      const newHires = allUsers.filter((u) => {
        if (!u.CREATEDTIME) return false;
        const created = String(u.CREATEDTIME).slice(0, 10);
        return created >= bounds.from && created <= bounds.to;
      });

      // Headcount by department
      const byDepartment = profiles.reduce((acc, p) => {
        const dept = p.department || 'Unassigned';
        acc[dept] = (acc[dept] || 0) + 1;
        return acc;
      }, {});

      // Headcount by designation
      const byDesignation = profiles.reduce((acc, p) => {
        const desig = p.designation || 'Unassigned';
        acc[desig] = (acc[desig] || 0) + 1;
        return acc;
      }, {});

      return ResponseHelper.success(res, {
        period:          { month: bounds.from.slice(0, 7) },
        total_headcount: allUsers.length,
        active:          activeUsers.length,
        inactive:        inactiveUsers.length,
        new_hires_this_period: newHires.length,
        by_department:   byDepartment,
        by_designation:  byDesignation,
      });
    } catch (err) {
      console.error('[ReportController.peopleSummary]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── 4. Attendance Report ─────────────────────────────────────────────────────

  /**
   * GET /api/reports/attendance-report
   * Per-user attendance aggregation for a date range.
   * Query params: date_from, date_to, user_id
   */
  async attendanceReport(req, res) {
    try {
      const tenantId = req.tenantId;
      const { user_id } = req.query;
      let { date_from, date_to } = req.query;

      // Default: current month
      if (!date_from || !date_to) {
        const bounds = monthBounds();
        date_from = bounds.from;
        date_to   = bounds.to;
      }

      let whereExtra = `attendance_date >= '${DataStoreService.escape(date_from)}' AND attendance_date <= '${DataStoreService.escape(date_to)}'`;
      if (user_id) whereExtra += ` AND user_id = '${DataStoreService.escape(user_id)}'`;

      const records = await this.db.findWhere(
        TABLES.ATTENDANCE_RECORDS, tenantId, whereExtra,
        { limit: 2000 }
      );

      // Aggregate per user
      const byUser = {};
      for (const r of records) {
        const uid = String(r.user_id);
        if (!byUser[uid]) {
          byUser[uid] = {
            user_id:       uid,
            user_name:     r.user_name || null,
            present_days:  0,
            absent_days:   0,
            wfh_days:      0,
            late_days:     0,
            half_days:     0,
            on_leave_days: 0,
            total_work_hours: 0,
            record_count:  0,
          };
        }
        const agg = byUser[uid];
        agg.record_count++;
        const status = (r.status || '').toUpperCase();
        if (status === 'PRESENT')  agg.present_days++;
        if (status === 'ABSENT')   agg.absent_days++;
        if (status === 'WFH')      agg.wfh_days++;
        if (status === 'LATE')     agg.late_days++;
        if (status === 'HALF_DAY') agg.half_days++;
        if (status === 'ON_LEAVE') agg.on_leave_days++;
        agg.total_work_hours += parseFloat(r.work_hours || 0);
      }

      const rows = Object.values(byUser).map((u) => ({
        ...u,
        avg_work_hours: u.record_count > 0
          ? Math.round((u.total_work_hours / u.record_count) * 100) / 100
          : 0,
        total_work_hours: Math.round(u.total_work_hours * 100) / 100,
      }));

      return ResponseHelper.success(res, {
        date_from,
        date_to,
        total_records: records.length,
        users: rows,
      });
    } catch (err) {
      console.error('[ReportController.attendanceReport]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── 5. Leave Report ──────────────────────────────────────────────────────────

  /**
   * GET /api/reports/leave-report
   * Per-user leave usage and balances.
   * Query params: year (YYYY), user_id
   */
  async leaveReport(req, res) {
    try {
      const tenantId = req.tenantId;
      const { user_id, year } = req.query;
      const bounds = yearBounds(year);

      let whereExtra =
        `status = 'APPROVED' AND start_date >= '${bounds.from}' AND end_date <= '${bounds.to}'`;
      if (user_id) whereExtra += ` AND user_id = '${DataStoreService.escape(user_id)}'`;

      const leaveRequests = await this.db.findWhere(
        TABLES.LEAVE_REQUESTS, tenantId, whereExtra,
        { limit: 2000 }
      );

      // Fetch balances
      let balanceWhere = null;
      if (user_id) balanceWhere = `user_id = '${DataStoreService.escape(user_id)}'`;
      const leaveBalances = await this.db.findWhere(
        TABLES.LEAVE_BALANCES, tenantId, balanceWhere,
        { limit: 200 }
      );

      // Index balances by user_id + leave_type
      const balanceIndex = {};
      for (const b of leaveBalances) {
        const key = `${b.user_id}::${b.leave_type}`;
        balanceIndex[key] = b;
      }

      // Aggregate taken days per user per leave_type
      const byUserType = {};
      for (const r of leaveRequests) {
        const uid  = String(r.user_id);
        const lt   = r.leave_type || 'UNKNOWN';
        const key  = `${uid}::${lt}`;
        if (!byUserType[key]) {
          byUserType[key] = {
            user_id:    uid,
            user_name:  r.user_name || null,
            leave_type: lt,
            days_taken: 0,
            requests:   0,
          };
        }
        byUserType[key].days_taken += parseFloat(r.total_days || 1);
        byUserType[key].requests++;
      }

      // Attach balance info
      const rows = Object.values(byUserType).map((entry) => {
        const balKey  = `${entry.user_id}::${entry.leave_type}`;
        const balance = balanceIndex[balKey];
        return {
          ...entry,
          days_taken:     Math.round(entry.days_taken * 100) / 100,
          days_allocated: balance ? parseFloat(balance.allocated_days  || 0) : null,
          days_remaining: balance ? parseFloat(balance.remaining_days  || 0) : null,
        };
      });

      return ResponseHelper.success(res, {
        year: bounds.from.slice(0, 4),
        total_leave_requests: leaveRequests.length,
        leave_details: rows,
      });
    } catch (err) {
      console.error('[ReportController.leaveReport]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── 6. Time Summary ──────────────────────────────────────────────────────────

  /**
   * GET /api/reports/time-summary
   * Per-user time aggregation (billable vs non-billable).
   * Query params: date_from, date_to, user_id
   */
  async timeSummary(req, res) {
    try {
      const tenantId = req.tenantId;
      const { user_id } = req.query;
      let { date_from, date_to } = req.query;

      if (!date_from || !date_to) {
        const bounds = monthBounds();
        date_from = bounds.from;
        date_to   = bounds.to;
      }

      let whereExtra =
        `status = 'APPROVED' AND entry_date >= '${DataStoreService.escape(date_from)}' AND entry_date <= '${DataStoreService.escape(date_to)}'`;
      if (user_id) whereExtra += ` AND user_id = '${DataStoreService.escape(user_id)}'`;

      const entries = await this.db.findWhere(
        TABLES.TIME_ENTRIES, tenantId, whereExtra,
        { limit: 200 }
      );

      // Aggregate per user
      const byUser = {};
      for (const e of entries) {
        const uid = String(e.user_id);
        if (!byUser[uid]) {
          byUser[uid] = {
            user_id:            uid,
            user_name:          e.user_name || null,
            total_hours:        0,
            billable_hours:     0,
            non_billable_hours: 0,
            entry_count:        0,
          };
        }
        const agg = byUser[uid];
        const hours = parseFloat(e.hours || 0);
        agg.total_hours += hours;
        agg.entry_count++;
        if (String(e.is_billable) === 'true' || e.is_billable === true || e.is_billable === 1) {
          agg.billable_hours += hours;
        } else {
          agg.non_billable_hours += hours;
        }
      }

      const rows = Object.values(byUser).map((u) => ({
        ...u,
        total_hours:        Math.round(u.total_hours        * 100) / 100,
        billable_hours:     Math.round(u.billable_hours     * 100) / 100,
        non_billable_hours: Math.round(u.non_billable_hours * 100) / 100,
      }));

      const grand = rows.reduce(
        (acc, u) => {
          acc.total_hours        += u.total_hours;
          acc.billable_hours     += u.billable_hours;
          acc.non_billable_hours += u.non_billable_hours;
          return acc;
        },
        { total_hours: 0, billable_hours: 0, non_billable_hours: 0 }
      );

      return ResponseHelper.success(res, {
        date_from,
        date_to,
        summary: {
          total_hours:        Math.round(grand.total_hours        * 100) / 100,
          billable_hours:     Math.round(grand.billable_hours     * 100) / 100,
          non_billable_hours: Math.round(grand.non_billable_hours * 100) / 100,
          billability_rate:   grand.total_hours > 0
            ? Math.round((grand.billable_hours / grand.total_hours) * 100)
            : 0,
        },
        users: rows,
      });
    } catch (err) {
      console.error('[ReportController.timeSummary]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── 7. Time by Project ───────────────────────────────────────────────────────

  /**
   * GET /api/reports/time-by-project
   * Aggregated time per project with project names.
   * Query params: date_from, date_to
   */
  async timeByProject(req, res) {
    try {
      const tenantId = req.tenantId;
      let { date_from, date_to } = req.query;

      if (!date_from || !date_to) {
        const bounds = monthBounds();
        date_from = bounds.from;
        date_to   = bounds.to;
      }

      const whereExtra =
        `status = 'APPROVED' AND entry_date >= '${DataStoreService.escape(date_from)}' AND entry_date <= '${DataStoreService.escape(date_to)}'`;

      const entries = await this.db.findWhere(
        TABLES.TIME_ENTRIES, tenantId, whereExtra,
        { limit: 200 }
      );

      // Aggregate per project
      const byProject = {};
      for (const e of entries) {
        const pid = String(e.project_id || 'NONE');
        if (!byProject[pid]) {
          byProject[pid] = {
            project_id:       pid,
            project_name:     null,
            total_hours:      0,
            billable_hours:   0,
            contributors:     new Set(),
          };
        }
        const agg   = byProject[pid];
        const hours = parseFloat(e.hours || 0);
        agg.total_hours += hours;
        if (String(e.is_billable) === 'true' || e.is_billable === true || e.is_billable === 1) {
          agg.billable_hours += hours;
        }
        if (e.user_id) agg.contributors.add(String(e.user_id));
      }

      // Resolve project names in one batch
      const projectIds = Object.keys(byProject).filter((id) => id !== 'NONE');
      if (projectIds.length > 0) {
        const projects = await this.db.findWhere(
          TABLES.PROJECTS, tenantId, null,
          { limit: 200 }
        );
        const nameMap = {};
        for (const p of projects) nameMap[String(p.ROWID)] = p.name;
        for (const pid of projectIds) {
          if (byProject[pid]) byProject[pid].project_name = nameMap[pid] || null;
        }
      }

      const rows = Object.values(byProject).map((p) => ({
        project_id:        p.project_id,
        project_name:      p.project_name,
        total_hours:       Math.round(p.total_hours    * 100) / 100,
        billable_hours:    Math.round(p.billable_hours * 100) / 100,
        contributor_count: p.contributors.size,
      })).sort((a, b) => b.total_hours - a.total_hours);

      return ResponseHelper.success(res, { date_from, date_to, projects: rows });
    } catch (err) {
      console.error('[ReportController.timeByProject]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── 8. Asset Summary ─────────────────────────────────────────────────────────

  /**
   * GET /api/reports/asset-summary
   * Assets by category/status + maintenance due in 30 days.
   */
  async assetSummary(req, res) {
    try {
      const tenantId = req.tenantId;

      const assets = await this.db.findWhere(
        TABLES.ASSETS, tenantId, null,
        { limit: 2000 }
      );

      // By status
      const byStatus = assets.reduce((acc, a) => {
        const s = a.status || 'UNKNOWN';
        acc[s] = (acc[s] || 0) + 1;
        return acc;
      }, {});

      // By category
      const byCategory = assets.reduce((acc, a) => {
        const c = a.category || 'Uncategorised';
        acc[c] = (acc[c] || 0) + 1;
        return acc;
      }, {});

      // Maintenance due in next 30 days
      const in30Days = DataStoreService.daysAgo(-30); // negative = future
      const maintenanceDue = await this.db.findWhere(
        TABLES.ASSET_MAINTENANCE, tenantId,
        `scheduled_date <= '${in30Days}' AND status != 'COMPLETED'`,
        { limit: 200 }
      );

      return ResponseHelper.success(res, {
        total_assets:        assets.length,
        available:           byStatus['AVAILABLE']    || 0,
        assigned:            byStatus['ASSIGNED']     || 0,
        in_maintenance:      byStatus['MAINTENANCE']  || 0,
        retired:             byStatus['RETIRED']      || 0,
        lost:                byStatus['LOST']         || 0,
        by_status:           byStatus,
        by_category:         byCategory,
        maintenance_due_next_30_days: maintenanceDue.length,
        maintenance_due_list: maintenanceDue,
      });
    } catch (err) {
      console.error('[ReportController.assetSummary]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── 9. Executive Brief ───────────────────────────────────────────────────────

  /**
   * GET /api/reports/executive-brief
   * C-level overview combining data from all domains.
   */
  async executiveBrief(req, res) {
    try {
      const tenantId = req.tenantId;
      const today    = DataStoreService.today();
      const bounds   = monthBounds();

      // ── Projects ────────────────────────────────────────────────────────────
      const projects = await this.db.findWhere(
        TABLES.PROJECTS, tenantId, `status = 'ACTIVE'`,
        { limit: 200 }
      );

      let projectsOnTrack = 0, projectsAtRisk = 0;
      for (const p of projects) {
        const rag = (p.rag_status || 'GREEN').toUpperCase();
        if (rag === 'GREEN')                     projectsOnTrack++;
        if (rag === 'AMBER' || rag === 'RED')    projectsAtRisk++;
      }

      // ── Workforce ───────────────────────────────────────────────────────────
      const [allUsersRows, activeUsersRows] = await Promise.all([
        this.db.query(`SELECT COUNT(*) FROM ${TABLES.USERS} WHERE tenant_id = '${tenantId}'`),
        this.db.query(`SELECT COUNT(*) FROM ${TABLES.USERS} WHERE tenant_id = '${tenantId}' AND status = 'ACTIVE'`),
      ]);
      const totalHeadcount  = parseInt(Object.values(allUsersRows[0]   || {})[0] || 0, 10);
      const activeHeadcount = parseInt(Object.values(activeUsersRows[0] || {})[0] || 0, 10);

      // ── Attendance rate this month ───────────────────────────────────────────
      const [presentRows, totalAttRows] = await Promise.all([
        this.db.query(
          `SELECT COUNT(*) FROM ${TABLES.ATTENDANCE_RECORDS} WHERE tenant_id = '${tenantId}' AND attendance_date >= '${bounds.from}' AND attendance_date <= '${bounds.to}' AND status = 'PRESENT'`
        ),
        this.db.query(
          `SELECT COUNT(*) FROM ${TABLES.ATTENDANCE_RECORDS} WHERE tenant_id = '${tenantId}' AND attendance_date >= '${bounds.from}' AND attendance_date <= '${bounds.to}'`
        ),
      ]);
      const presentCount   = parseInt(Object.values(presentRows[0]   || {})[0] || 0, 10);
      const totalAttCount  = parseInt(Object.values(totalAttRows[0]  || {})[0] || 0, 10);
      const attendanceRate = totalAttCount > 0
        ? Math.round((presentCount / totalAttCount) * 100)
        : null;

      // ── Leave utilisation this month ─────────────────────────────────────────
      const leaveThisMonthRows = await this.db.query(
        `SELECT COUNT(*) FROM ${TABLES.LEAVE_REQUESTS} WHERE tenant_id = '${tenantId}' AND status = 'APPROVED' AND start_date >= '${bounds.from}' AND start_date <= '${bounds.to}'`
      );
      const approvedLeaveCount = parseInt(Object.values(leaveThisMonthRows[0] || {})[0] || 0, 10);
      const leaveUtilisationRate = activeHeadcount > 0
        ? Math.round((approvedLeaveCount / activeHeadcount) * 100)
        : null;

      // ── Billable hours this month ────────────────────────────────────────────
      const timeEntries = await this.db.findWhere(
        TABLES.TIME_ENTRIES, tenantId,
        `status = 'APPROVED' AND is_billable = 'true' AND entry_date >= '${bounds.from}' AND entry_date <= '${bounds.to}'`,
        { limit: 200 }
      );
      const totalBillableHours = timeEntries.reduce(
        (sum, e) => sum + parseFloat(e.hours || 0), 0
      );

      // ── Asset utilisation ────────────────────────────────────────────────────
      const assets = await this.db.findWhere(
        TABLES.ASSETS, tenantId, null,
        { limit: 2000 }
      );
      const totalAssets    = assets.length;
      const assignedAssets = assets.filter((a) => a.status === 'ASSIGNED').length;
      const assetUtilRate  = totalAssets > 0
        ? Math.round((assignedAssets / totalAssets) * 100)
        : null;

      return ResponseHelper.success(res, {
        generated_at: new Date().toISOString(),
        period:       { month: bounds.from.slice(0, 7) },
        executive_brief: {
          projects: {
            active:    projects.length,
            on_track:  projectsOnTrack,
            at_risk:   projectsAtRisk,
          },
          workforce: {
            total_headcount:  totalHeadcount,
            active_headcount: activeHeadcount,
          },
          attendance: {
            rate_percent: attendanceRate,
          },
          leave: {
            approved_requests_this_month: approvedLeaveCount,
            utilisation_rate_percent:     leaveUtilisationRate,
          },
          time: {
            billable_hours_this_month: Math.round(totalBillableHours * 100) / 100,
          },
          assets: {
            total:              totalAssets,
            assigned:           assignedAssets,
            utilisation_rate_percent: assetUtilRate,
          },
        },
      });
    } catch (err) {
      console.error('[ReportController.executiveBrief]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── 10. Custom Report ────────────────────────────────────────────────────────

  /**
   * POST /api/reports/custom
   * Body: { report_type, filters, group_by, date_from, date_to }
   * Supported report_types: ATTENDANCE | LEAVE | TIME | TASKS | ASSETS
   */
  async customReport(req, res) {
    try {
      const tenantId = req.tenantId;
      const { report_type, filters = {}, group_by, date_from, date_to } = req.body;

      const SUPPORTED = ['ATTENDANCE', 'LEAVE', 'TIME', 'TASKS', 'ASSETS'];
      if (!report_type || !SUPPORTED.includes(report_type.toUpperCase())) {
        return ResponseHelper.validationError(
          res,
          `report_type must be one of: ${SUPPORTED.join(', ')}`
        );
      }

      const type = report_type.toUpperCase();

      // ── Table and date-column mapping ──────────────────────────────────────
      const TABLE_MAP = {
        ATTENDANCE: { table: TABLES.ATTENDANCE_RECORDS, dateCol: 'date' },
        LEAVE:      { table: TABLES.LEAVE_REQUESTS,     dateCol: 'start_date' },
        TIME:       { table: TABLES.TIME_ENTRIES,       dateCol: 'date' },
        TASKS:      { table: TABLES.TASKS,              dateCol: 'CREATEDTIME' },
        ASSETS:     { table: TABLES.ASSETS,             dateCol: 'CREATEDTIME' },
      };

      const { table, dateCol } = TABLE_MAP[type];

      // ── Build WHERE clauses dynamically ────────────────────────────────────
      const clauses = [];

      if (date_from) clauses.push(`${dateCol} >= '${DataStoreService.escape(date_from)}'`);
      if (date_to)   clauses.push(`${dateCol} <= '${DataStoreService.escape(date_to)}'`);

      // Apply arbitrary key=value filters (safe-escaped)
      for (const [col, val] of Object.entries(filters)) {
        if (val !== undefined && val !== null && val !== '') {
          clauses.push(`${DataStoreService.escape(col)} = '${DataStoreService.escape(String(val))}'`);
        }
      }

      const whereExtra = clauses.length > 0 ? clauses.join(' AND ') : null;
      const rows = await this.db.findWhere(table, tenantId, whereExtra, { limit: 1000 });

      // ── Basic aggregation ──────────────────────────────────────────────────
      let aggregation = null;
      if (group_by && rows.length > 0) {
        const grouped = {};
        for (const row of rows) {
          const key = String(row[group_by] || 'UNKNOWN');
          if (!grouped[key]) grouped[key] = { count: 0, rows: [] };
          grouped[key].count++;
          grouped[key].rows.push(row);
        }
        aggregation = Object.entries(grouped).map(([key, val]) => ({
          [group_by]: key,
          count:      val.count,
        })).sort((a, b) => b.count - a.count);
      }

      return ResponseHelper.success(res, {
        report_type: type,
        filters,
        group_by:    group_by || null,
        date_from:   date_from || null,
        date_to:     date_to   || null,
        total_rows:  rows.length,
        aggregation,
        rows,
      });
    } catch (err) {
      console.error('[ReportController.customReport]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = ReportController;
