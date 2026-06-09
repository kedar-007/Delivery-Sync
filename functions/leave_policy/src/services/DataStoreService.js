'use strict';

class DataStoreService {
  constructor(catalystApp) {
    if (!catalystApp) throw new Error('catalystApp is required for DataStoreService');
    this.catalystApp = catalystApp;
    this.zcql = catalystApp.zcql();
    this.datastore = catalystApp.datastore();
  }

  // ─── ZCQL Read ───────────────────────────────────────────────────────────────

  async query(zcqlQuery) {
    try {
      const result = await this.zcql.executeZCQLQuery(zcqlQuery);
      if (!Array.isArray(result)) return [];
      return result.map((row) => {
        const tableValues = Object.values(row);
        if (tableValues.length > 0 && typeof tableValues[0] === 'object' && tableValues[0] !== null) {
          return Object.assign({}, ...tableValues);
        }
        return row;
      });
    } catch (err) {
      console.error('[DataStoreService] ZCQL error:', zcqlQuery, err.message);
      throw new Error(`Database query failed: ${err.message}`);
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
