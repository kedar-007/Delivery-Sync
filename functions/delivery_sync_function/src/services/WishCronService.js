'use strict';

/**
 * WishCronService — manages annual CALENDAR crons for birthday and work
 * anniversary wishes. Each user gets at most two crons:
 *   bday_${userId}   — fires at 08:00 on birth month/day in their timezone
 *   anniv_${userId}  — fires at 08:00 on join month/day in their timezone
 *
 * Called from:
 *   UserController.updateProfile  — birthday cron (user sets own birth_date)
 *   AdminController.updateUser    — anniversary cron (admin sets date_of_joining)
 *   AdminController.deactivateUser — cleanup (deleteAll)
 */
class WishCronService {
  constructor(catalystApp) {
    this.catalystApp = catalystApp;
  }

  _cronName(userId, type) {
    return type === 'BIRTHDAY' ? `bday_${userId}` : `anniv_${userId}`;
  }

  /**
   * Create or update an annual cron for the given user + type.
   * dateStr  – ISO date string from user_profiles (birth_date or date_of_joining)
   * timezone – IANA timezone string e.g. 'Australia/Sydney' (falls back to 'UTC')
   */
  async upsert(userId, tenantId, type, dateStr, timezone) {
    if (!dateStr) return;

    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      console.warn(`[WishCronService] Invalid date "${dateStr}" userId=${userId} type=${type}`);
      return;
    }

    // Use UTC accessors so "1990-03-15" (parsed as UTC midnight) always gives day=15
    // regardless of the Catalyst server's local timezone offset.
    const day   = d.getUTCDate();        // 1–31
    const month = d.getUTCMonth() + 1;   // 1–12
    const tz    = timezone || 'UTC';

    const cronName = this._cronName(userId, type);
    const jobName  = (type === 'BIRTHDAY' ? 'bd_' : 'an_') + String(userId).slice(-15);

    // Read env vars fresh on every call — module-level constants can be stale
    // if the function cold-started before the new catalyst-config.json was deployed.
    const poolName = process.env.WISHES_POOL_NAME || 'PeopleWishes';
    const poolId   = process.env.WISHES_POOL_ID   || '';

    if (!poolId) {
      console.error(
        `[WishCronService] WISHES_POOL_ID is not set — skipping cron ${cronName}.` +
        ` Add WISHES_POOL_ID to delivery_sync_function catalyst-config.json and redeploy.`
      );
      return;
    }

    const cronBody = {
      cron_name:   cronName,
      cron_status: true,
      cron_type:   'Calendar',
      cron_detail: {
        hour:            8,
        minute:          0,
        second:          0,
        days:            [day],    // array — Catalyst SDK requires days/months as arrays
        months:          [month],  // array
        repetition_type: 'yearly',
        timezone:        tz,
      },
      job_meta: {
        job_name:     jobName,
        jobpool_name: poolName,
        jobpool_id:   poolId,
        target_type:  'Function',
        target_name:  'people_wish',
        job_config:   { number_of_retries: 1, retry_interval: 15 * 60 },
        params:       { user_id: String(userId), tenant_id: String(tenantId), type },
      },
    };

    console.log(
      `[WishCronService] ${cronName}: upsert start` +
      ` day=${day} month=${month} tz=${tz} poolId=${poolId} poolName=${poolName}`
    );

    let cronApi;
    try {
      cronApi = this.catalystApp.jobScheduling().cron();
    } catch (e) {
      console.error(`[WishCronService] jobScheduling init failed userId=${userId}:`, e.message);
      return;
    }

    try {
      await cronApi.updateCron(cronName, cronBody);
      console.log(`[WishCronService] ${cronName}: UPDATED`);
    } catch (updateErr) {
      console.log(`[WishCronService] ${cronName}: update skipped (${updateErr.message}) — trying createCron`);
      try {
        await cronApi.createCron(cronBody);
        console.log(`[WishCronService] ${cronName}: CREATED`);
      } catch (createErr) {
        console.error(
          `[WishCronService] ${cronName}: CREATE FAILED —`,
          createErr.message,
          '| body sent:', JSON.stringify(cronBody)
        );
      }
    }
  }

  /**
   * Delete a single wish cron (e.g. when date is cleared).
   */
  async delete(userId, type) {
    const cronName = this._cronName(userId, type);
    let cronApi;
    try {
      cronApi = this.catalystApp.jobScheduling().cron();
    } catch (e) {
      console.error(`[WishCronService] init failed userId=${userId}:`, e.message);
      return;
    }
    try {
      await cronApi.deleteCron(cronName);
      console.log(`[WishCronService] ${cronName}: DELETED`);
    } catch (e) {
      console.warn(`[WishCronService] ${cronName}: delete skipped (may not exist) —`, e.message);
    }
  }

  /**
   * Delete both birthday and anniversary crons (called on user deactivation).
   */
  async deleteAll(userId) {
    await Promise.all([
      this.delete(userId, 'BIRTHDAY'),
      this.delete(userId, 'ANNIVERSARY'),
    ]);
  }
}

module.exports = WishCronService;
