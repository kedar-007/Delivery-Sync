'use strict';

/**
 * Minimal DataStoreService for bot_service.
 * Wraps Catalyst ZCQL queries and DataStore write operations.
 */
// ── Process-wide ZCQL concurrency gate ───────────────────────────────────────
// Catalyst caps the number of simultaneous DataStore operations per app. We
// bound how many ZCQL queries this function process keeps in flight so that
// bursts (parallel endpoints, Promise.all fan-outs) QUEUE instead of
// overflowing the cap. Tunable via CATALYST_ZCQL_CONCURRENCY (default 8).
const ZCQL_MAX_CONCURRENCY = parseInt(process.env.CATALYST_ZCQL_CONCURRENCY, 10) || 8;

class ZcqlSemaphore {
  constructor(max) { this._max = max; this._active = 0; this._queue = []; }
  acquire() {
    if (this._active < this._max) { this._active += 1; return Promise.resolve(); }
    return new Promise((resolve) => { this._queue.push(resolve); });
  }
  release() {
    const next = this._queue.shift();
    if (next) next();            // hand the slot straight to the next waiter
    else this._active -= 1;      // no waiter: free the slot
  }
}
const zcqlGate = new ZcqlSemaphore(ZCQL_MAX_CONCURRENCY);

class DataStoreService {
  constructor(catalystApp) {
    this.zcql      = catalystApp.zcql();
    this.datastore = catalystApp.datastore();
  }

  // ─── ZCQL Read ─────────────────────────────────────────────────────────────

  async query(zcqlQuery) {
    // Catalyst caps the number of *concurrent* DataStore operations. Under a
    // burst, queries fail transiently with "Concurrency limit reached for the
    // feature COMPONENT". Retry those with exponential backoff + jitter.
    const MAX_ATTEMPTS = 5;
    let attempt = 0;
    for (;;) {
      await zcqlGate.acquire();
      let result;
      let error;
      try {
        result = await this.zcql.executeZCQLQuery(zcqlQuery);
      } catch (err) {
        error = err;
      } finally {
        zcqlGate.release(); // free the slot before any backoff sleep
      }

      if (!error) {
        return (result || []).map((row) => {
          const vals = Object.values(row);
          if (vals.length > 0 && typeof vals[0] === 'object' && vals[0] !== null) {
            return Object.assign({}, ...vals);
          }
          return row;
        });
      }

      // Table may not exist yet — return empty array gracefully
      if (error.message?.includes('Table') || error.message?.includes('table')) {
        console.warn(`[DataStore] Table not found for query: ${zcqlQuery.slice(0, 80)}`);
        return [];
      }
      attempt += 1;
      if (/concurrency limit reached/i.test(error.message || '') && attempt < MAX_ATTEMPTS) {
        const delay = Math.min(2000, 100 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 100);
        console.warn(`[DataStore] concurrency limit hit, retry ${attempt}/${MAX_ATTEMPTS - 1} in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }

  /** Paginate past the 300-row ZCQL hard limit. */
  async queryAll(baseQuery, batchSize = 200) {
    const all = [];
    let offset = 0;
    while (true) {
      const batch = await this.query(`${baseQuery} LIMIT ${batchSize} OFFSET ${offset}`);
      all.push(...batch);
      if (batch.length < batchSize) break;
      offset += batchSize;
    }
    return all;
  }

  // ─── DataStore Write ───────────────────────────────────────────────────────

  async insert(tableName, data) {
    const table = this.datastore.table(tableName);
    return await table.insertRow(data);
  }

  async update(tableName, data) {
    // data must include ROWID
    const table = this.datastore.table(tableName);
    return await table.updateRow(data);
  }

  async delete(tableName, rowId) {
    const table = this.datastore.table(tableName);
    await table.deleteRow(rowId);
    return true;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  static escape(val) {
    return String(val).replace(/'/g, "''");
  }

  static today() {
    return new Date().toISOString().split('T')[0];
  }

  static yesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }

  static weekStart() {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - (day === 0 ? 6 : day - 1); // Monday start
    d.setDate(diff);
    return d.toISOString().split('T')[0];
  }

  static fmtDT(date) {
    const d = date instanceof Date ? date : new Date(date);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
}

module.exports = DataStoreService;
