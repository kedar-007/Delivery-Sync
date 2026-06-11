'use strict';

/**
 * WishCronService — creates/updates/deletes annual CALENDAR crons for birthday
 * and work anniversary wishes.
 *   bday_${userId}   fires at 08:00 on birth month/day in the user's timezone
 *   anniv_${userId}  fires at 08:00 on join month/day in the user's timezone
 *
 * Requires an admin-scoped catalystApp for jobScheduling() access.
 */
class WishCronService {
  constructor(adminCatalystApp) {
    this.catalystApp = adminCatalystApp;
  }

  _cronName(userId, type) {
    return type === 'BIRTHDAY' ? `bday_${userId}` : `anniv_${userId}`;
  }

  async upsert(userId, tenantId, type, dateStr, timezone) {
    if (!dateStr) return;

    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      console.warn(`[WishCronService] Invalid date "${dateStr}" userId=${userId} type=${type}`);
      return;
    }

    // UTC accessors so "1990-03-15" (parsed as UTC midnight) always yields day=15.
    const day   = d.getUTCDate();
    const month = d.getUTCMonth() + 1;
    const tz    = timezone || 'UTC';

    const cronName = this._cronName(userId, type);
    const jobName  = (type === 'BIRTHDAY' ? 'bd_' : 'an_') + String(userId).slice(-15);

    // Read fresh every call — avoids stale module-level constants on cold starts.
    const poolName = process.env.WISHES_POOL_NAME || 'PeopleWishes';
    const poolId   = process.env.WISHES_POOL_ID   || '';

    if (!poolId) {
      console.error(
        `[WishCronService] WISHES_POOL_ID not set — skipping cron ${cronName}.` +
        ` Add WISHES_POOL_ID to badge_profile_service catalyst-config.json and redeploy.`
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
      console.warn(`[WishCronService] ${cronName}: delete skipped —`, e.message);
    }
  }
}

module.exports = WishCronService;
