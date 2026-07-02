'use strict';

/**
 * Leave Accrual Job Function
 *
 * Trigger this job on the 1st of every month at 1:00 AM (project timezone)
 * via Catalyst Scheduler.
 *
 * How accrual works — RECONCILIATION, not blind increment:
 *  For each user and each leave type with accrualMethod = 'monthly', the job
 *  computes the months the user was ENTITLED to accrue this year:
 *    - from the policy's effectiveFrom month (stamped when accrual was enabled)
 *    - excluding skipMonths
 *    - only months whose 1st falls on/after the user's probation clear date
 *      (date_of_joining + probationMonths; falls back to account CREATEDTIME)
 *  It then compares  expected = monthlyAmount × eligibleMonths  against the
 *  `accrued_days` ledger column on leave_balances and tops up the difference.
 *
 *  This makes the job:
 *    - idempotent  (re-running in the same month adds nothing)
 *    - self-healing (a date_of_joining added/corrected later back-fills the
 *      missed months automatically on the next run — no change detection needed)
 *  Negative deltas (joining date moved later, policy reduced) are NEVER
 *  deducted — they are logged for an admin to resolve manually.
 *
 * @param {import("./types/job").JobRequest} jobRequest
 * @param {import("./types/job").Context} context
 */

const ZCatalyst        = require('zcatalyst-sdk-node');
const DataStoreService = require('./src/services/DataStoreService');
const JobRunService    = require('./src/services/JobRunService');
const { TABLES }       = require('./src/utils/constants');

// Catalyst schedules this job in the project timezone (Asia/Kolkata), but the
// function clock is UTC. At a 1:00 AM IST firing on the 1st, UTC is still
// 19:30 on the last day of the PREVIOUS month — so month/year must be derived
// in project time, never from now.getMonth()/getFullYear() directly.
const PROJECT_TZ = 'Asia/Kolkata';
const projectYearMonth = (date) => {
  const [year, month] = new Intl.DateTimeFormat('en-CA', {
    timeZone: PROJECT_TZ, year: 'numeric', month: '2-digit',
  }).format(date).split('-').map(Number);
  return { year, month };
};

const round2 = (n) => Math.round(n * 100) / 100;

const addMonthsUTC = (date, n) => {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + n);
  return d;
};

/**
 * Months (1–12) of currentYear, up to and including currentMonth, that the
 * user is entitled to accrue for.
 */
const eligibleMonths = ({ currentYear, currentMonth, effectiveFrom, skipMonths, probationClearMs }) => {
  let startMonth = 1;
  if (effectiveFrom) {
    const [efY, efM] = String(effectiveFrom).split('-').map(Number);
    if (efY > currentYear) return [];
    if (efY === currentYear) startMonth = efM || 1;
  } else {
    startMonth = currentMonth; // no anchor — never back-fill before this run
  }
  const months = [];
  for (let m = startMonth; m <= currentMonth; m++) {
    if (skipMonths.includes(m)) continue;
    // Entitled to month m only if probation cleared by the 1st of m
    if (probationClearMs != null && Date.UTC(currentYear, m - 1, 1) < probationClearMs) continue;
    months.push(m);
  }
  return months;
};

module.exports = async (jobRequest, context) => {
  const app = ZCatalyst.initialize(context);
  const db  = new DataStoreService(app);
  const run = await JobRunService.start(app, 'leave-accrual', 'leave_policy');

  const now = new Date();
  const { year: currentYear, month: currentMonth } = projectYearMonth(now);
  const yearStr    = String(currentYear);
  const monthLabel = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

  let totalAccrued = 0;   // balance rows topped up
  let totalSkipped = 0;   // users with no eligible months yet (probation)
  const errors = [];
  const warnings = [];

  console.log(`[leave_policy] Starting accrual reconciliation for ${monthLabel}`);

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
      let settings = {};
      try { settings = JSON.parse(tenant.settings || '{}'); } catch (_) {}
      const policy = settings.leavePolicy || {};

      if (!policy.accrualEnabled) {
        console.log(`[leave_policy] Tenant ${tenant.ROWID}: accrual disabled — skipping`);
        continue;
      }

      const tenantId        = String(tenant.ROWID);
      const probationMonths = Number(policy.probationMonths ?? 3);
      const typesPolicies   = policy.leaveTypes || {};

      // ── 2b. Anchor effectiveFrom if the policy predates this field ────────────
      // Without an anchor, reconciliation would back-fill everyone to January.
      // Stamp the current month once and persist it so the anchor is stable.
      let effectiveFrom = policy.effectiveFrom;
      if (!effectiveFrom) {
        effectiveFrom = monthLabel;
        try {
          settings.leavePolicy = { ...policy, effectiveFrom };
          await db.update(TABLES.TENANTS, {
            ROWID: tenantId,
            settings: JSON.stringify(settings),
          });
          console.log(`[leave_policy] Tenant ${tenantId}: stamped effectiveFrom=${effectiveFrom}`);
        } catch (e) {
          warnings.push(`tenant=${tenantId}: could not persist effectiveFrom: ${e.message}`);
        }
      }

      const monthlyTypes = Object.entries(typesPolicies).filter(
        ([, p]) => p && p.accrualMethod === 'monthly' && parseFloat(p.monthlyAmount ?? 0) > 0
      );

      if (monthlyTypes.length === 0) {
        console.log(`[leave_policy] Tenant ${tenantId}: no monthly leave types configured — skipping`);
        continue;
      }

      // ── 3. Fetch all active users for this tenant (paginated; ZCQL cap = 300) ─
      const users = [];
      let uOffset = 0;
      while (true) {
        const page = await db.query(
          `SELECT ROWID, CREATEDTIME FROM ${TABLES.USERS}` +
          ` WHERE tenant_id = '${tenantId}' AND status = 'ACTIVE'` +
          ` LIMIT 300 OFFSET ${uOffset}`
        );
        users.push(...page);
        if (page.length < 300) break;
        uOffset += 300;
      }

      // ── 4. Build userId → date_of_joining map from user_profiles ─────────────
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

      console.log(`[leave_policy] Tenant ${tenantId}: ${users.length} active user(s), ${monthlyTypes.length} monthly leave type(s), effectiveFrom=${effectiveFrom}`);

      for (const user of users) {
        const userId = String(user.ROWID);

        // ── 5. Probation clear date ────────────────────────────────────────────
        // Prefer the explicit date_of_joining (admin-set employment start date).
        // Fall back to account creation time so brand-new joiners are still
        // gated by probation (fail-safe). If the joining date is filled in
        // later, the reconciliation below back-fills the missed months.
        const joiningDateStr = joiningMap[userId];
        let probationStart   = null;
        if (joiningDateStr) {
          probationStart = new Date(joiningDateStr);
        } else if (user.CREATEDTIME) {
          probationStart = new Date(Number(user.CREATEDTIME));
        }
        let probationClearMs = null;
        if (probationStart && !isNaN(probationStart.getTime())) {
          probationClearMs = addMonthsUTC(probationStart, probationMonths).getTime();
        }

        let userHadEligibleMonth = false;

        // ── 6. Reconcile each monthly leave type ───────────────────────────────
        for (const [leaveTypeId, ltPolicy] of monthlyTypes) {
          const skipMonths    = Array.isArray(ltPolicy.skipMonths) ? ltPolicy.skipMonths : [];
          const monthlyAmount = parseFloat(ltPolicy.monthlyAmount ?? 0);

          const months = eligibleMonths({
            currentYear, currentMonth, effectiveFrom, skipMonths, probationClearMs,
          });
          if (months.length > 0) userHadEligibleMonth = true;

          const expected = round2(monthlyAmount * months.length);

          try {
            const balQ = `user_id = '${userId}' AND leave_type_id = '${leaveTypeId}' AND year = '${yearStr}'`;
            const bal  = await db.findWhere(TABLES.LEAVE_BALANCES, tenantId, balQ, { limit: 1 });

            if (bal.length === 0) {
              if (expected <= 0) continue;
              await db.insert(TABLES.LEAVE_BALANCES, {
                tenant_id:       tenantId,
                user_id:         userId,
                leave_type_id:   leaveTypeId,
                year:            yearStr,
                total_allocated: expected,
                opening_balance: 0,
                remaining_days:  expected,
                used_days:       0,
                pending_days:    0,
                accrued_days:    expected,
              });
              totalAccrued++;
            } else {
              const b       = bal[0];
              const alloc   = parseFloat(b.total_allocated ?? b.allocated_days ?? 0) || 0;
              const opening = parseFloat(b.opening_balance ?? 0) || 0;
              const rem     = parseFloat(b.remaining_days ?? 0) || 0;

              // First reconciled run: rows created before the accrued_days
              // ledger existed — assume prior allocation minus carry-forward
              // came from accrual, so history isn't double-credited.
              let accrued = parseFloat(b.accrued_days);
              if (isNaN(accrued)) accrued = Math.max(0, round2(alloc - opening));

              const delta = round2(expected - accrued);
              if (delta > 0) {
                await db.update(TABLES.LEAVE_BALANCES, {
                  ROWID:           b.ROWID,
                  accrued_days:    round2(accrued + delta),
                  total_allocated: round2(alloc + delta),
                  remaining_days:  round2(rem + delta),
                });
                totalAccrued++;
              } else if (delta < 0) {
                // Over-accrued vs current policy/joining date — never deduct.
                warnings.push(
                  `tenant=${tenantId} user=${userId} leaveType=${leaveTypeId}:` +
                  ` accrued ${accrued} exceeds entitlement ${expected} — manual review`
                );
              }
            }
          } catch (e) {
            errors.push(`tenant=${tenantId} user=${userId} leaveType=${leaveTypeId}: ${e.message}`);
          }
        }

        if (!userHadEligibleMonth) totalSkipped++;
      }
    }

    // ── 7. Summary log + job-run record ─────────────────────────────────────────
    const summary = {
      month: monthLabel,
      accrued: totalAccrued,
      skipped: totalSkipped,
      warnings: warnings.slice(0, 20),
      errors: errors.slice(0, 20),
    };
    console.log(`[leave_policy] ${monthLabel} COMPLETE —`, JSON.stringify(summary));

    if (errors.length > 0) {
      await run.fail(`${errors.length} balance update(s) failed`, summary);
    } else {
      await run.success(summary);
    }
    context.closeWithSuccess();
  } catch (fatalErr) {
    console.error('[leave_policy] FATAL:', fatalErr.message, fatalErr.stack);
    await run.fail(fatalErr.message, { month: monthLabel, accrued: totalAccrued });
    context.closeWithFailure();
  }
};
