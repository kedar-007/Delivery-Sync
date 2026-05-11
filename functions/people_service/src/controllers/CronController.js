'use strict';

const DataStoreService    = require('../services/DataStoreService');
const NotificationService = require('../services/NotificationService');
const ResponseHelper      = require('../utils/ResponseHelper');
const { TABLES, NOTIFICATION_TYPE } = require('../utils/Constants');

const CRON_AUTH = (req) => {
  const isCron     = req.headers['x-zoho-catalyst-is-cron'] === 'true';
  const isInternal = req.headers['x-delivery-sync-internal'] === process.env.INTERNAL_SECRET;
  return isCron || isInternal;
};

class CronController {
  // POST /api/people/cron/attendance-anomaly  — 9:30 AM daily
  static async attendanceAnomaly(req, res) {
    if (!CRON_AUTH(req)) return ResponseHelper.forbidden(res, 'Cron only');
    if (!req.catalystApp) return ResponseHelper.serverError(res, 'catalystApp not initialized');

    const db    = new DataStoreService(req.catalystApp);
    const notif = new NotificationService(req.catalystApp, db);
    const today = DataStoreService.today();

    // Get all active users (paginated — ZCQL hard cap is 300 rows)
    const users = [];
    let _offset = 0;
    while (true) {
      const page = await db.query(`SELECT ROWID, tenant_id, name, email FROM ${TABLES.USERS} WHERE status = 'ACTIVE' LIMIT 300 OFFSET ${_offset}`);
      users.push(...page);
      if (page.length < 300) break;
      _offset += 300;
    }

    let flagged = 0;
    for (const user of users) {
      const record = await db.findWhere(TABLES.ATTENDANCE_RECORDS, user.tenant_id,
        `user_id = '${user.ROWID}' AND attendance_date = '${today}'`, { limit: 1 });

      // Flag if no check-in by 9:30 AM and no leave today
      if (record.length === 0 || record[0].status === 'ABSENT') {
        const onLeave = await db.findWhere(TABLES.LEAVE_REQUESTS, user.tenant_id,
          `user_id = '${user.ROWID}' AND status = 'APPROVED' AND start_date <= '${today}' AND end_date >= '${today}'`, { limit: 1 });
        if (onLeave.length === 0) {
          // Create ABSENT record
          if (record.length === 0) {
            await db.insert(TABLES.ATTENDANCE_RECORDS, {
              tenant_id:           String(user.tenant_id),
              user_id:             String(user.ROWID),
              attendance_date:     today,
              work_hours:          0,
              status:              'ABSENT',
              is_wfh:              'false',
              wfh_reason:          '',
              check_in_ip:         '',
              is_location_verified:'false',
              override_reason:     '',
            });
          }
          await notif.sendInApp({ tenantId: user.tenant_id, userId: String(user.ROWID), title: 'Attendance Alert', message: 'You have not checked in today', type: NOTIFICATION_TYPE.ATTENDANCE_ANOMALY, entityType: 'ATTENDANCE', entityId: 0 });
          flagged++;
        }
      }
    }

    return ResponseHelper.success(res, { anomalies_flagged: flagged, date: today });
  }

  // POST /api/people/cron/leave-approval-reminder — 9 AM daily
  static async leaveApprovalReminder(req, res) {
    if (!CRON_AUTH(req)) return ResponseHelper.forbidden(res, 'Cron only');
    if (!req.catalystApp) return ResponseHelper.serverError(res, 'catalystApp not initialized');

    const db    = new DataStoreService(req.catalystApp);
    const notif = new NotificationService(req.catalystApp, db);
    const cutoff = DataStoreService.daysAgo(1);

    const pending = await db.query(`SELECT lr.ROWID, lr.tenant_id, lr.user_id, lr.start_date, lr.end_date FROM ${TABLES.LEAVE_REQUESTS} lr WHERE lr.status = 'PENDING' AND lr.CREATEDTIME < '${cutoff}' LIMIT 200`);

    let sent = 0;
    for (const req_ of pending) {
      const profile = await db.findWhere(TABLES.USER_PROFILES, req_.tenant_id, `user_id = '${req_.user_id}'`, { limit: 1 });
      const rmId = profile[0]?.reporting_manager_id;
      if (rmId) {
        const requesterRows = await db.query(`SELECT name FROM ${TABLES.USERS} WHERE ROWID = '${req_.user_id}' LIMIT 1`);
        await notif.sendInApp({ tenantId: req_.tenant_id, userId: rmId, title: 'Leave Approval Reminder', message: `${requesterRows[0]?.name || 'A team member'} is waiting for leave approval`, type: NOTIFICATION_TYPE.LEAVE_APPROVAL_REMINDER, entityType: 'LEAVE', entityId: req_.ROWID });
        sent++;
      }
    }

    return ResponseHelper.success(res, { reminders_sent: sent });
  }

  // POST /api/people/cron/monthly-accrual — runs 1st of each month
  static async monthlyAccrual(req, res) {
    if (!CRON_AUTH(req)) return ResponseHelper.forbidden(res, 'Cron only');
    if (!req.catalystApp && !req.adminCatalystApp) return ResponseHelper.serverError(res, 'catalystApp not initialized');

    const db  = new DataStoreService(req.adminCatalystApp || req.catalystApp);
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1–12
    const currentYear  = now.getFullYear();
    const yearStr      = String(currentYear);

    let totalAccrued = 0;
    let totalSkipped = 0;
    const errors = [];

    try {
      // Fetch all tenants
      const tenants = await db.query(`SELECT ROWID, settings FROM ${TABLES.TENANTS} LIMIT 200`);

      for (const tenant of tenants) {
        let policy = {};
        try { policy = JSON.parse(tenant.settings || '{}').leavePolicy || {}; } catch (_) {}
        if (!policy.accrualEnabled) continue;

        const probationMonths  = Number(policy.probationMonths ?? 3);
        const typesPolicies    = policy.leaveTypes || {};
        const tenantId         = String(tenant.ROWID);

        // Active users for this tenant
        const users = [];
        let uOffset = 0;
        while (true) {
          const page = await db.query(
            `SELECT ROWID, CREATEDTIME FROM ${TABLES.USERS} WHERE tenant_id = '${tenantId}' AND status = 'ACTIVE' LIMIT 300 OFFSET ${uOffset}`
          );
          users.push(...page);
          if (page.length < 300) break;
          uOffset += 300;
        }

        for (const user of users) {
          const userId = String(user.ROWID);

          // Probation check — CREATEDTIME is epoch ms
          const createdMs = Number(user.CREATEDTIME);
          if (createdMs) {
            const monthsSinceJoin = (now - new Date(createdMs)) / (1000 * 60 * 60 * 24 * 30.44);
            if (monthsSinceJoin < probationMonths) { totalSkipped++; continue; }
          }

          for (const [leaveTypeId, ltPolicy] of Object.entries(typesPolicies)) {
            if (!ltPolicy || ltPolicy.accrualMethod !== 'monthly') continue;

            const skipMonths    = Array.isArray(ltPolicy.skipMonths) ? ltPolicy.skipMonths : [];
            if (skipMonths.includes(currentMonth)) continue;

            const monthlyAmount = parseFloat(ltPolicy.monthlyAmount ?? 0);
            if (monthlyAmount <= 0) continue;

            try {
              const balQ = `user_id = '${userId}' AND leave_type_id = '${leaveTypeId}' AND year = '${yearStr}'`;
              const bal  = await db.findWhere(TABLES.LEAVE_BALANCES, tenantId, balQ, { limit: 1 });

              if (bal.length === 0) {
                await db.insert(TABLES.LEAVE_BALANCES, {
                  tenant_id:       tenantId,
                  user_id:         userId,
                  leave_type_id:   leaveTypeId,
                  year:            yearStr,
                  total_allocated: monthlyAmount,
                  opening_balance: 0,
                  remaining_days:  monthlyAmount,
                  used_days:       0,
                  pending_days:    0,
                });
              } else {
                const b            = bal[0];
                const newAllocated = parseFloat(b.total_allocated ?? b.allocated_days ?? 0) + monthlyAmount;
                const newRemaining = parseFloat(b.remaining_days ?? 0) + monthlyAmount;
                await db.update(TABLES.LEAVE_BALANCES, {
                  ROWID:           b.ROWID,
                  total_allocated: newAllocated,
                  remaining_days:  newRemaining,
                });
              }
              totalAccrued++;
            } catch (e) {
              errors.push(`user=${userId} lt=${leaveTypeId}: ${e.message}`);
            }
          }
        }
      }
    } catch (outerErr) {
      return ResponseHelper.serverError(res, outerErr.message);
    }

    return ResponseHelper.success(res, {
      month: currentMonth, year: currentYear,
      accrued: totalAccrued, skipped: totalSkipped,
      errors: errors.slice(0, 20),
    });
  }

  // POST /api/people/cron/year-end-carry-forward — runs 1 Jan each year
  static async yearEndCarryForward(req, res) {
    if (!CRON_AUTH(req)) return ResponseHelper.forbidden(res, 'Cron only');
    if (!req.catalystApp && !req.adminCatalystApp) return ResponseHelper.serverError(res, 'catalystApp not initialized');

    const db       = new DataStoreService(req.adminCatalystApp || req.catalystApp);
    const now      = new Date();
    const lastYear = now.getFullYear() - 1;
    const thisYear = now.getFullYear();
    const lastYearStr = String(lastYear);
    const thisYearStr = String(thisYear);

    let totalCarried = 0;
    let totalSkipped = 0;
    const errors = [];

    try {
      const tenants = await db.query(`SELECT ROWID, settings FROM ${TABLES.TENANTS} LIMIT 200`);

      for (const tenant of tenants) {
        let policy = {};
        try { policy = JSON.parse(tenant.settings || '{}').leavePolicy || {}; } catch (_) {}
        if (!policy.accrualEnabled) continue;

        const typesPolicies = policy.leaveTypes || {};
        const tenantId      = String(tenant.ROWID);

        // Find all last-year balances for this tenant
        const lastYearBals = [];
        let bOffset = 0;
        while (true) {
          const page = await db.query(
            `SELECT * FROM ${TABLES.LEAVE_BALANCES} WHERE tenant_id = '${tenantId}' AND year = '${lastYearStr}' LIMIT 200 OFFSET ${bOffset}`
          );
          lastYearBals.push(...page);
          if (page.length < 200) break;
          bOffset += 200;
        }

        for (const bal of lastYearBals) {
          const ltId    = String(bal.leave_type_id);
          const ltPol   = typesPolicies[ltId];
          if (!ltPol || !ltPol.carryForwardEnabled) { totalSkipped++; continue; }

          const maxCF         = parseFloat(ltPol.maxCarryForwardDays ?? 0);
          const remaining     = parseFloat(bal.remaining_days ?? 0);
          const carryAmount   = Math.min(remaining, maxCF);
          if (carryAmount <= 0) { totalSkipped++; continue; }

          const userId = String(bal.user_id);

          try {
            const thisYearBalQ = `user_id = '${userId}' AND leave_type_id = '${ltId}' AND year = '${thisYearStr}'`;
            const thisYearBal  = await db.findWhere(TABLES.LEAVE_BALANCES, tenantId, thisYearBalQ, { limit: 1 });

            if (thisYearBal.length === 0) {
              await db.insert(TABLES.LEAVE_BALANCES, {
                tenant_id:       tenantId,
                user_id:         userId,
                leave_type_id:   ltId,
                year:            thisYearStr,
                total_allocated: carryAmount,
                opening_balance: carryAmount,
                remaining_days:  carryAmount,
                used_days:       0,
                pending_days:    0,
              });
            } else {
              const b             = thisYearBal[0];
              const newOpening    = parseFloat(b.opening_balance ?? 0) + carryAmount;
              const newAllocated  = parseFloat(b.total_allocated ?? b.allocated_days ?? 0) + carryAmount;
              const newRemaining  = parseFloat(b.remaining_days ?? 0) + carryAmount;
              await db.update(TABLES.LEAVE_BALANCES, {
                ROWID:           b.ROWID,
                opening_balance: newOpening,
                total_allocated: newAllocated,
                remaining_days:  newRemaining,
              });
            }
            totalCarried++;
          } catch (e) {
            errors.push(`user=${userId} lt=${ltId}: ${e.message}`);
          }
        }
      }
    } catch (outerErr) {
      return ResponseHelper.serverError(res, outerErr.message);
    }

    return ResponseHelper.success(res, {
      from_year: lastYear, to_year: thisYear,
      carried: totalCarried, skipped: totalSkipped,
      errors: errors.slice(0, 20),
    });
  }
}

module.exports = CronController;
