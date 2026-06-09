'use strict';

const WISHES_POOL_NAME = process.env.WISHES_POOL_NAME || 'PeopleWishes';
const WISHES_POOL_ID   = process.env.WISHES_POOL_ID   || '';

/**
 * WishCronService — manages annual CALENDAR crons for birthday and work
 * anniversary wishes. Each user gets at most two crons:
 *   bday_${userId}   — fires at 08:00 on birth month/day in their timezone
 *   anniv_${userId}  — fires at 08:00 on join month/day in their timezone
 *
 * Called from:
 *   UserController.updateProfile  — birthday cron (user sets own date_of_birth)
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
   * dateStr  – ISO date string from user_profiles (date_of_birth or date_of_joining)
   * timezone – IANA timezone string e.g. 'Australia/Sydney' (falls back to 'UTC')
   */
  async upsert(userId, tenantId, type, dateStr, timezone) {
    if (!dateStr) return;

    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      console.warn(`[WishCronService] Invalid date "${dateStr}" userId=${userId} type=${type}`);
      return;
    }

    const day      = d.getDate();        // 1–31
    const month    = d.getMonth() + 1;   // 1–12
    const tz       = timezone || 'UTC';
    const cronName = this._cronName(userId, type);
    const jobName  = (type === 'BIRTHDAY' ? 'bd_' : 'an_') + String(userId).slice(-15);

    const cronBody = {
      cron_name:   cronName,
      cron_status: true,
      cron_type:   'Calendar',
      cron_detail: {
        hour:            8,
        minute:          0,
        second:          0,
        day_of_month:    day,
        month:           month,
        repetition_type: 'yearly',
        timezone:        tz,
      },
      job_meta: {
        job_name:     jobName,
        jobpool_name: WISHES_POOL_NAME,
        jobpool_id:   WISHES_POOL_ID,
        target_type:  'Function',
        target_name:  'people_wish',
        job_config:   { number_of_retries: 1, retry_interval: 15 * 60 },
        params:       { user_id: String(userId), tenant_id: String(tenantId), type },
      },
    };

    let cronApi;
    try {
      cronApi = this.catalystApp.jobScheduling().cron();
    } catch (e) {
      console.error(`[WishCronService] jobScheduling init failed userId=${userId}:`, e.message);
      return;
    }

    try {
      await cronApi.updateCron(cronName, cronBody);
      console.log(`[WishCronService] ${cronName}: UPDATED (${day}/${month} tz=${tz})`);
    } catch (_) {
      try {
        await cronApi.createCron(cronBody);
        console.log(`[WishCronService] ${cronName}: CREATED (${day}/${month} tz=${tz})`);
      } catch (createErr) {
        console.error(`[WishCronService] ${cronName}: FAILED —`, createErr.message);
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
