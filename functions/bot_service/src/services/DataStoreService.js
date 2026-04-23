'use strict';

/**
 * Minimal DataStoreService for bot_service.
 * Wraps Catalyst ZCQL queries and DataStore write operations.
 */
class DataStoreService {
  constructor(catalystApp) {
    this.zcql      = catalystApp.zcql();
    this.datastore = catalystApp.datastore();
  }

  // ─── ZCQL Read ─────────────────────────────────────────────────────────────

  async query(zcqlQuery) {
    try {
      const result = await this.zcql.executeZCQLQuery(zcqlQuery);
      return (result || []).map((row) => {
        const vals = Object.values(row);
        if (vals.length > 0 && typeof vals[0] === 'object' && vals[0] !== null) {
          return Object.assign({}, ...vals);
        }
        return row;
      });
    } catch (err) {
      // Table may not exist yet — return empty array gracefully
      if (err.message?.includes('Table') || err.message?.includes('table')) {
        console.warn(`[DataStore] Table not found for query: ${zcqlQuery.slice(0, 80)}`);
        return [];
      }
      throw err;
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
