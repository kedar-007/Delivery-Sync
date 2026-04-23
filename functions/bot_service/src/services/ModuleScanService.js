'use strict';

const DataStoreService = require('./DataStoreService');
const { TABLES, SCAN_STATUS } = require('../utils/Constants');

/**
 * ModuleScanService — scans all relevant modules for a user's daily plan.
 * Each scan returns: { module, status, found, completion_pct, items[] }
 */
class ModuleScanService {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
  }

  async scanAll(userId, tenantId) {
    const [timeLogs, standup, tasks, milestones, checkIn] = await Promise.allSettled([
      this._scanTimeLogs(userId, tenantId),
      this._scanStandup(userId, tenantId),
      this._scanTasks(userId, tenantId),
      this._scanMilestones(userId, tenantId),
      this._scanCheckIn(userId, tenantId),
    ]);

    return [
      timeLogs.status   === 'fulfilled' ? timeLogs.value   : this._errorScan('timelogs'),
      standup.status    === 'fulfilled' ? standup.value    : this._errorScan('standup'),
      tasks.status      === 'fulfilled' ? tasks.value      : this._errorScan('tasks'),
      milestones.status === 'fulfilled' ? milestones.value : this._errorScan('milestones'),
      checkIn.status    === 'fulfilled' ? checkIn.value    : this._errorScan('checkin'),
    ];
  }

  // ─── Time Logs ─────────────────────────────────────────────────────────────

  async _scanTimeLogs(userId, tenantId) {
    const yesterday = DataStoreService.yesterday();
    const weekStart = DataStoreService.weekStart();

    const [yesterdayEntries, weekEntries] = await Promise.all([
      this.db.query(
        `SELECT * FROM ${TABLES.TIME_ENTRIES}
         WHERE tenant_id = '${DataStoreService.escape(tenantId)}'
           AND user_id = '${DataStoreService.escape(userId)}'
           AND entry_date = '${yesterday}'
         LIMIT 50`
      ),
      this.db.query(
        `SELECT * FROM ${TABLES.TIME_ENTRIES}
         WHERE tenant_id = '${DataStoreService.escape(tenantId)}'
           AND user_id = '${DataStoreService.escape(userId)}'
           AND entry_date >= '${weekStart}'
         LIMIT 200`
      ),
    ]);

    const submitted      = yesterdayEntries.filter((e) => e.status !== 'DRAFT');
    const totalYestHours = yesterdayEntries.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
    const weekHours      = weekEntries.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
    const weekBillable   = weekEntries
      .filter((e) => String(e.is_billable).toLowerCase() === 'true')
      .reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);

    let status = SCAN_STATUS.ALL_GOOD;
    let found  = `${totalYestHours.toFixed(1)}h logged yesterday, ${weekHours.toFixed(1)}h this week (${weekBillable.toFixed(1)}h billable)`;

    if (yesterdayEntries.length === 0) {
      status = SCAN_STATUS.NEEDS_ATTENTION;
      found  = `No time logged for yesterday (${yesterday}). ${weekHours.toFixed(1)}h logged this week.`;
    } else if (submitted.length === 0) {
      status = SCAN_STATUS.NEEDS_ATTENTION;
      found  = `${totalYestHours.toFixed(1)}h logged yesterday but not yet submitted.`;
    }

    return {
      module:         'timelogs',
      icon:           '⏱',
      label:          'Time Logs',
      status,
      found,
      completion_pct: yesterdayEntries.length > 0 ? (submitted.length > 0 ? 100 : 50) : 0,
      data: {
        yesterday_hours:  totalYestHours,
        yesterday_entries: yesterdayEntries.length,
        week_hours:       weekHours,
        week_billable:    weekBillable,
        is_submitted:     submitted.length > 0,
      },
    };
  }

  // ─── Standup ──────────────────────────────────────────────────────────────

  async _scanStandup(userId, tenantId) {
    const today = DataStoreService.today();

    const entries = await this.db.query(
      `SELECT * FROM ${TABLES.STANDUP_ENTRIES}
       WHERE tenant_id = '${DataStoreService.escape(tenantId)}'
         AND user_id = '${DataStoreService.escape(userId)}'
         AND entry_date = '${today}'
       LIMIT 1`
    );

    const submitted = entries.length > 0;
    return {
      module:         'standup',
      icon:           '🗣',
      label:          'Standup',
      status:         submitted ? SCAN_STATUS.ALL_GOOD : SCAN_STATUS.NEEDS_ATTENTION,
      found:          submitted
        ? `Standup submitted today at ${today}`
        : `No standup submitted yet for today (${today})`,
      completion_pct: submitted ? 100 : 0,
      data:           { submitted, today },
    };
  }

  // ─── Tasks ────────────────────────────────────────────────────────────────

  async _scanTasks(userId, tenantId) {
    const today = DataStoreService.today();

    const [pending, overdue] = await Promise.all([
      this.db.query(
        `SELECT ROWID, title, status, due_date, task_priority FROM ${TABLES.TASKS}
         WHERE tenant_id = '${DataStoreService.escape(tenantId)}'
           AND assignee_id = '${DataStoreService.escape(userId)}'
           AND status != 'DONE' AND status != 'CANCELLED'
         ORDER BY due_date ASC LIMIT 50`
      ),
      this.db.query(
        `SELECT ROWID, title, status, due_date, task_priority FROM ${TABLES.TASKS}
         WHERE tenant_id = '${DataStoreService.escape(tenantId)}'
           AND assignee_id = '${DataStoreService.escape(userId)}'
           AND status != 'DONE' AND status != 'CANCELLED'
           AND due_date < '${today}'
         ORDER BY due_date ASC LIMIT 20`
      ),
    ]);

    const status = overdue.length > 0
      ? SCAN_STATUS.OVERDUE
      : pending.length > 0
      ? SCAN_STATUS.NEEDS_ATTENTION
      : SCAN_STATUS.ALL_GOOD;

    return {
      module:         'tasks',
      icon:           '📌',
      label:          'Tasks',
      status,
      found:          `${pending.length} pending task${pending.length !== 1 ? 's' : ''}, ${overdue.length} overdue`,
      completion_pct: pending.length > 0 ? Math.round(((pending.length - overdue.length) / pending.length) * 100) : 100,
      data: {
        pending_count: pending.length,
        overdue_count: overdue.length,
        pending:       pending.slice(0, 10),
        overdue:       overdue.slice(0, 10),
      },
    };
  }

  // ─── Milestones ───────────────────────────────────────────────────────────

  async _scanMilestones(userId, tenantId) {
    const today = DataStoreService.today();

    // Get user's project IDs first
    const projectRows = await this.db.query(
      `SELECT project_id FROM ${TABLES.PROJECT_MEMBERS ?? 'project_members'}
       WHERE tenant_id = '${DataStoreService.escape(tenantId)}'
         AND user_id = '${DataStoreService.escape(userId)}'
       LIMIT 20`
    );

    if (projectRows.length === 0) {
      return {
        module: 'milestones', icon: '🏁', label: 'Milestones',
        status: SCAN_STATUS.ALL_GOOD, found: 'Not a member of any projects',
        completion_pct: 100, data: { overdue: [], at_risk: [] },
      };
    }

    const projectIds = projectRows.map((r) => `'${r.project_id}'`).join(',');

    const [overdue, atRisk] = await Promise.all([
      this.db.query(
        `SELECT ROWID, title, due_date, status, project_id FROM ${TABLES.MILESTONES}
         WHERE tenant_id = '${DataStoreService.escape(tenantId)}'
           AND project_id IN (${projectIds})
           AND status != 'COMPLETED'
           AND due_date < '${today}'
         ORDER BY due_date ASC LIMIT 20`
      ),
      this.db.query(
        `SELECT ROWID, title, due_date, status, project_id FROM ${TABLES.MILESTONES}
         WHERE tenant_id = '${DataStoreService.escape(tenantId)}'
           AND project_id IN (${projectIds})
           AND status != 'COMPLETED'
           AND due_date >= '${today}'
         ORDER BY due_date ASC LIMIT 10`
      ),
    ]);

    const status = overdue.length > 0
      ? SCAN_STATUS.OVERDUE
      : SCAN_STATUS.ALL_GOOD;

    return {
      module:         'milestones',
      icon:           '🏁',
      label:          'Milestones',
      status,
      found:          overdue.length > 0
        ? `${overdue.length} overdue milestone${overdue.length !== 1 ? 's' : ''} need attention`
        : `All milestones on track (${atRisk.length} upcoming)`,
      completion_pct: overdue.length === 0 ? 100 : Math.max(0, 100 - overdue.length * 15),
      data:           { overdue: overdue.slice(0, 5), at_risk: atRisk.slice(0, 5) },
    };
  }

  // ─── Check-in / Attendance ────────────────────────────────────────────────

  async _scanCheckIn(userId, tenantId) {
    const weekStart = DataStoreService.weekStart();
    const today     = DataStoreService.today();

    const records = await this.db.query(
      `SELECT * FROM ${TABLES.ATTENDANCE_RECORDS}
       WHERE tenant_id = '${DataStoreService.escape(tenantId)}'
         AND user_id = '${DataStoreService.escape(userId)}'
         AND attendance_date >= '${weekStart}'
       ORDER BY attendance_date ASC LIMIT 20`
    );

    // Count working days Mon-today
    const start  = new Date(weekStart);
    const end    = new Date(today);
    let workDays = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) workDays++;
    }

    const checkedIn    = records.filter((r) => r.check_in_time);
    const missedDays   = Math.max(0, workDays - checkedIn.length);
    const todayChecked = records.some((r) => {
      const ds = String(r.attendance_date).split('T')[0].split(' ')[0];
      return ds === today && r.check_in_time;
    });

    const status = missedDays > 1
      ? SCAN_STATUS.NEEDS_ATTENTION
      : SCAN_STATUS.ALL_GOOD;

    return {
      module:         'checkin',
      icon:           '✅',
      label:          'Attendance',
      status,
      found:          todayChecked
        ? `Checked in today. ${checkedIn.length}/${workDays} days this week.`
        : `Not checked in today. ${missedDays} day${missedDays !== 1 ? 's' : ''} missed this week.`,
      completion_pct: workDays > 0 ? Math.round((checkedIn.length / workDays) * 100) : 100,
      data: {
        checked_in_days: checkedIn.length,
        work_days:       workDays,
        missed_days:     missedDays,
        today_checked:   todayChecked,
        records:         records.slice(0, 7),
      },
    };
  }

  // ─── Helper ───────────────────────────────────────────────────────────────

  _errorScan(module) {
    return {
      module,
      icon:           '❓',
      label:          module.charAt(0).toUpperCase() + module.slice(1),
      status:         SCAN_STATUS.ALL_GOOD,
      found:          'Unable to fetch data',
      completion_pct: 0,
      data:           {},
    };
  }
}

module.exports = ModuleScanService;
