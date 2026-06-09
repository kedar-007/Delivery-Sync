'use strict';

/**
 * Leave Accrual Job Function
 *
 * Trigger this job on the 1st of every month at 1:00 AM via Catalyst Scheduler.
 *
 * What it does:
 *  1. Fetches every tenant that has accrualEnabled = true in their leave policy.
 *  2. For each tenant, fetches all ACTIVE users.
 *  3. Skips users still within their probation period (uses date_of_joining from user_profiles).
 *  4. For each leave type configured with accrualMethod = 'monthly':
 *       - Skips months listed in skipMonths.
 *       - Creates a new leave_balances row if one doesn't exist yet for this user/type/year.
 *       - Otherwise increments total_allocated and remaining_days by monthlyAmount.
 *  5. Logs a summary and closes the job with success (or failure on a fatal crash).
 *
 * @param {import("./types/job").JobRequest} jobRequest
 * @param {import("./types/job").Context} context
 */

const ZCatalyst        = require('zcatalyst-sdk-node');
const DataStoreService = require('./src/services/DataStoreService');
const { TABLES }       = require('./src/utils/constants');

module.exports = async (jobRequest, context) => {
  const app = ZCatalyst.initialize(context);
  const db  = new DataStoreService(app);

  const now          = new Date();
  const currentMonth = now.getMonth() + 1; // 1–12
  const currentYear  = now.getFullYear();
  const yearStr      = String(currentYear);
  const monthLabel   = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

  let totalAccrued = 0;
  let totalSkipped = 0;
  const errors = [];

  console.log(`[leave_policy] Starting monthly accrual run for ${monthLabel}`);

  try {
    // ── 1. Fetch all tenants (paginated) ────────────────────────────────────────
    const tenants = [];
    let tOffset = 0;
    while (true) {
      const page = await db.query(
        `SELECT ROWID, settings FROM ${TABLES.TENANTS} LIMIT 200 OFFSET ${tOffset}`
      );
      tenants.push(...page);
      if (page.length < 200) break;
      tOffset += 200;
    }

    console.log(`[leave_policy] Found ${tenants.length} tenant(s)`);

    for (const tenant of tenants) {
      // ── 2. Parse leave policy for this tenant ─────────────────────────────────
      let policy = {};
      try { policy = JSON.parse(tenant.settings || '{}').leavePolicy || {}; } catch (_) {}

      if (!policy.accrualEnabled) {
        console.log(`[leave_policy] Tenant ${tenant.ROWID}: accrual disabled — skipping`);
        continue;
      }

      const tenantId        = String(tenant.ROWID);
      const probationMonths = Number(policy.probationMonths ?? 3);
      const typesPolicies   = policy.leaveTypes || {};

      const leaveTypeCount = Object.values(typesPolicies).filter(
        (p) => p && p.accrualMethod === 'monthly'
      ).length;

      if (leaveTypeCount === 0) {
        console.log(`[leave_policy] Tenant ${tenantId}: no monthly leave types configured — skipping`);
        continue;
      }

      // ── 3. Fetch all active users for this tenant (paginated; ZCQL cap = 300) ─
      const users = [];
      let uOffset = 0;
      while (true) {
        const page = await db.query(
          `SELECT ROWID FROM ${TABLES.USERS}` +
          ` WHERE tenant_id = '${tenantId}' AND status = 'ACTIVE'` +
          ` LIMIT 300 OFFSET ${uOffset}`
        );
        users.push(...page);
        if (page.length < 300) break;
        uOffset += 300;
      }

      // ── 4. Build userId → date_of_joining map from user_profiles ─────────────
      // date_of_joining is the actual employment start date — used for probation checks.
      const joiningMap = {};
      let pOffset = 0;
      while (true) {
        const page = await db.query(
          `SELECT user_id, date_of_joining FROM ${TABLES.USER_PROFILES}` +
          ` WHERE tenant_id = '${tenantId}' AND date_of_joining IS NOT NULL` +
          ` LIMIT 200 OFFSET ${pOffset}`
        );
        for (const p of page) {
          if (p.user_id && p.date_of_joining) {
            joiningMap[String(p.user_id)] = p.date_of_joining;
          }
        }
        if (page.length < 200) break;
        pOffset += 200;
      }

      console.log(`[leave_policy] Tenant ${tenantId}: ${users.length} active user(s), ${leaveTypeCount} monthly leave type(s)`);

      for (const user of users) {
        const userId = String(user.ROWID);

        // ── 5. Probation check using date_of_joining from user_profiles ──────────
        // If no profile record exists yet, skip the probation gate (safe default).
        const joiningDateStr = joiningMap[userId];
        if (joiningDateStr) {
          const monthsSinceJoin = (now - new Date(joiningDateStr)) / (1000 * 60 * 60 * 24 * 30.44);
          if (monthsSinceJoin < probationMonths) {
            totalSkipped++;
            continue;
          }
        }

        // ── 6. Process each monthly leave type ─────────────────────────────────
        for (const [leaveTypeId, ltPolicy] of Object.entries(typesPolicies)) {
          if (!ltPolicy || ltPolicy.accrualMethod !== 'monthly') continue;

          const skipMonths = Array.isArray(ltPolicy.skipMonths) ? ltPolicy.skipMonths : [];
          if (skipMonths.includes(currentMonth)) continue;

          const monthlyAmount = parseFloat(ltPolicy.monthlyAmount ?? 0);
          if (monthlyAmount <= 0) continue;

          try {
            const balQ = `user_id = '${userId}' AND leave_type_id = '${leaveTypeId}' AND year = '${yearStr}'`;
            const bal  = await db.findWhere(TABLES.LEAVE_BALANCES, tenantId, balQ, { limit: 1 });

            if (bal.length === 0) {
              // No balance record yet for this year — create one
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
              // Balance exists — increment allocated and remaining
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
            errors.push(`tenant=${tenantId} user=${userId} leaveType=${leaveTypeId}: ${e.message}`);
          }
        }
      }
    }

    // ── 7. Summary log ──────────────────────────────────────────────────────────
    console.log(
      `[leave_policy] ${monthLabel} COMPLETE —` +
      ` accrued=${totalAccrued}, skipped=${totalSkipped}, errors=${errors.length}`
    );
    if (errors.length > 0) {
      console.error('[leave_policy] Error details (first 20):', JSON.stringify(errors.slice(0, 20)));
    }

    context.closeWithSuccess();
  } catch (fatalErr) {
    console.error('[leave_policy] FATAL:', fatalErr.message, fatalErr.stack);
    context.closeWithFailure();
  }
};
