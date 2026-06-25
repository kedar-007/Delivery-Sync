'use strict';

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
    if (!catalystApp) throw new Error('catalystApp is required for DataStoreService');
    this.catalystApp = catalystApp;
    this.zcql = catalystApp.zcql();
    this.datastore = catalystApp.datastore();
  }

  // ─── ZCQL Read ───────────────────────────────────────────────────────────────

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
        if (!Array.isArray(result)) return [];
        return result.map((row) => {
          const tableValues = Object.values(row);
          if (tableValues.length > 0 && typeof tableValues[0] === 'object' && tableValues[0] !== null) {
            return Object.assign({}, ...tableValues);
          }
          return row;
        });
      }

      attempt += 1;
      if (/concurrency limit reached/i.test(error.message || '') && attempt < MAX_ATTEMPTS) {
        const delay = Math.min(2000, 100 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 100);
        console.warn(`[DataStoreService] concurrency limit hit, retry ${attempt}/${MAX_ATTEMPTS - 1} in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      console.error('[DataStoreService] ZCQL error:', zcqlQuery, error.message);
      throw new Error(`Database query failed: ${error.message}`);
    }
  }

  async findById(tableName, rowId, tenantId) {
    const rows = await this.query(
      `SELECT * FROM ${tableName} WHERE ROWID = '${rowId}' AND tenant_id = '${tenantId}'`
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async findWhere(tableName, tenantId, whereExtra, options = {}) {
    const tenantClause = `tenant_id = '${tenantId}'`;
    const fullWhere = whereExtra ? `${tenantClause} AND ${whereExtra}` : tenantClause;
    const orderStr = options.orderBy ? `ORDER BY ${options.orderBy}` : 'ORDER BY CREATEDTIME DESC';
    const limitStr = options.limit ? `LIMIT ${options.limit}` : 'LIMIT 200';
    return this.query(`SELECT * FROM ${tableName} WHERE ${fullWhere} ${orderStr} ${limitStr}`);
  }

  async fetchAll(tableName, tenantId, whereExtra, options = {}) {
    const tenantClause = `tenant_id = '${tenantId}'`;
    const fullWhere = whereExtra ? `${tenantClause} AND ${whereExtra}` : tenantClause;
    const orderStr = options.orderBy ? `ORDER BY ${options.orderBy}` : 'ORDER BY CREATEDTIME DESC';
    const all = [];
    let offset = 0;
    while (true) {
      const page = await this.query(
        `SELECT * FROM ${tableName} WHERE ${fullWhere} ${orderStr} LIMIT 200 OFFSET ${offset}`
      );
      all.push(...page);
      if (page.length < 200) break;
      offset += 200;
    }
    return all;
  }

  // ─── Write Operations ────────────────────────────────────────────────────────

  async insert(tableName, data) {
    try {
      const table = this.datastore.table(tableName);
      return await table.insertRow(data);
    } catch (err) {
      const cols = Object.entries(data)
        .map(([k, v]) => `${k}(${v === null ? 'null' : typeof v})=${JSON.stringify(v)}`)
        .join(' | ');
      console.error(`[DataStoreService] INSERT FAILED table="${tableName}" error="${err.message}"`);
      console.error(`[DataStoreService] INSERT COLUMNS: ${cols}`);
      throw new Error(`Insert failed [${tableName}]: ${err.message}`);
    }
  }

  async update(tableName, data) {
    try {
      const table = this.datastore.table(tableName);
      return await table.updateRow(data);
    } catch (err) {
      const cols = Object.entries(data)
        .map(([k, v]) => `${k}(${v === null ? 'null' : typeof v})=${JSON.stringify(v)}`)
        .join(' | ');
      console.error(`[DataStoreService] UPDATE FAILED table="${tableName}" error="${err.message}"`);
      console.error(`[DataStoreService] UPDATE COLUMNS: ${cols}`);
      throw new Error(`Update failed [${tableName}]: ${err.message}`);
    }
  }

  // ─── Utility ─────────────────────────────────────────────────────────────────

  static escape(val) {
    return String(val).replace(/'/g, "''");
  }

  static today() {
    return new Date().toISOString().split('T')[0];
  }
}

module.exports = DataStoreService;
