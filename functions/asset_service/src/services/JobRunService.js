'use strict';

/**
 * JobRunService — per-run status rows in the global `job_runs` table so admins
 * can monitor background jobs from Settings → System → Background Jobs.
 *
 * Usage:
 *   const run = await JobRunService.start(catalystApp, 'monthly-accrual', 'people_service');
 *   ... do work ...
 *   await run.success({ accrued: 12, skipped: 3 });     // or
 *   await run.fail(err.message, { partial: true });
 *
 * Every write is fail-soft: a logging failure is logged to console and
 * swallowed — it must never break the job being tracked.
 */

const TABLE = 'job_runs';
const MAX_FIELD = 30000; // keep summary/error well under Text column limits

class JobRunService {
  static async start(catalystApp, jobName, service) {
    const datastore = catalystApp.datastore();
    const startedMs = Date.now();
    let rowId = null;

    try {
      const row = await datastore.table(TABLE).insertRow({
        job_name:    jobName,
        service:     service,
        status:      'RUNNING',
        started_at:  new Date(startedMs).toISOString(),
        finished_at: '',
        duration_ms: 0,
        summary:     '',
        error:       '',
      });
      rowId = row.ROWID;
    } catch (e) {
      console.error(`[JobRunService] failed to record start of "${jobName}":`, e.message);
    }

    const finish = async (status, summary, error) => {
      if (!rowId) return;
      try {
        await datastore.table(TABLE).updateRow({
          ROWID:       rowId,
          status,
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - startedMs,
          summary:     summary ? JSON.stringify(summary).slice(0, MAX_FIELD) : '',
          error:       error ? String(error).slice(0, MAX_FIELD) : '',
        });
      } catch (e) {
        console.error(`[JobRunService] failed to record finish of "${jobName}":`, e.message);
      }
    };

    return {
      success: (summary) => finish('SUCCESS', summary, null),
      fail:    (error, summary) => finish('FAILED', summary, error),
    };
  }
}

module.exports = JobRunService;
