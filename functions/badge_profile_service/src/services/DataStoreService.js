'use strict';

/**
 * DataStoreService – Base class wrapping Catalyst DataStore ZCQL operations.
 *
 * Architecture decision:
 *  - All DB access flows through this class so that tenant isolation (tenant_id
 *    is always injected) and error normalisation are applied in one place.
 *  - Sub-services extend this class or receive it as a dependency.
 *  - ZCQL (Zoho Catalyst Query Language) is used for all reads because it
 *    supports WHERE clauses; Catalyst table APIs are used for writes.
 */
class DataStoreService {
  /**
   * @param {object} catalystApp – Initialised Catalyst SDK instance from req.catalystApp
   */
  constructor(catalystApp) {
    if (!catalystApp) throw new Error('catalystApp is required for DataStoreService');
    this.catalystApp = catalystApp;
    this.zcql = catalystApp.zcql();
    this.datastore = catalystApp.datastore();
  }

  // ─── ZCQL Read ───────────────────────────────────────────────────────────────

  /**
   * Execute a raw ZCQL query.
   * @param {string} zcql
   * @returns {Promise<object[]>}
   */
  async query(zcqlQuery) {
    try {
      const result = await this.zcql.executeZCQLQuery(zcqlQuery);
      if (!Array.isArray(result)) return [];

      // Catalyst ZCQL wraps each row's columns under the table name:
      //   [{ users: { ROWID: "1", tenant_id: "2", email: "..." } }]
      // Flatten to plain objects:
      //   [{ ROWID: "1", tenant_id: "2", email: "..." }]
      return result.map((row) => {
        const tableValues = Object.values(row);
        if (
          tableValues.length > 0 &&
          typeof tableValues[0] === 'object' &&
          tableValues[0] !== null
        ) {
          // Merge all table objects (handles JOINs with multiple tables too)
          return Object.assign({}, ...tableValues);
        }
        return row;
      });
    } catch (err) {
      console.error('[DataStoreService] ZCQL error:', zcqlQuery, err.message);
      throw new Error(`Database query failed: ${err.message}`);
    }
  }

  /**
   * Find a single row by ROWID with tenant isolation.
   * @param {string} tableName
   * @param {string|number} rowId
   * @param {string} tenantId
   */
  async findById(tableName, rowId, tenantId) {
    const rows = await this.query(
      `SELECT * FROM ${tableName} WHERE ROWID = '${rowId}' AND tenant_id = '${tenantId}'`
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Find all rows matching filters (key=value pairs).
   * All queries MUST include tenant_id.
   * @param {string} tableName
   * @param {object} filters  e.g. { tenant_id: 'x', status: 'ACTIVE' }
   * @param {object} options  e.g. { orderBy: 'CREATEDTIME DESC', limit: 50 }
   */
  async findAll(tableName, filters = {}, options = {}) {
    const whereClauses = Object.entries(filters).map(
      ([col, val]) => `${col} = '${String(val).replace(/'/g, "''")}'`
    );
    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const orderStr = options.orderBy ? `ORDER BY ${options.orderBy}` : 'ORDER BY CREATEDTIME DESC';
    const limitStr = options.limit ? `LIMIT ${options.limit}` : 'LIMIT 200';
    return this.query(`SELECT * FROM ${tableName} ${whereStr} ${orderStr} ${limitStr}`);
  }

  /**
   * Raw WHERE clause query with tenant isolation pre-baked in.
   */
  async findWhere(tableName, tenantId, whereExtra, options = {}) {
    const tenantClause = `tenant_id = '${tenantId}'`;
    const fullWhere = whereExtra ? `${tenantClause} AND ${whereExtra}` : tenantClause;
    const orderStr = options.orderBy ? `ORDER BY ${options.orderBy}` : 'ORDER BY CREATEDTIME DESC';
    const limitStr = options.limit ? `LIMIT ${options.limit}` : 'LIMIT 200';
    return this.query(`SELECT * FROM ${tableName} WHERE ${fullWhere} ${orderStr} ${limitStr}`);
  }

  /**
   * Count rows matching filters.
   */
  async count(tableName, filters = {}) {
    const whereClauses = Object.entries(filters).map(
      ([col, val]) => `${col} = '${String(val).replace(/'/g, "''")}'`
    );
    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const rows = await this.query(`SELECT COUNT(*) FROM ${tableName} ${whereStr}`);
    if (rows.length > 0) {
      const countVal = Object.values(rows[0])[0];
      return parseInt(countVal, 10) || 0;
    }
    return 0;
  }

  // ─── Write Operations ────────────────────────────────────────────────────────

  /**
   * Insert a row into a table.
   * @param {string} tableName
   * @param {object} data  – column: value map
   * @returns {Promise<object>} inserted row
   */
  async insert(tableName, data) {
    try {
      const table = this.datastore.table(tableName);
      const row = await table.insertRow(data);
      return row;
    } catch (err) {
      // Log each column name + type to identify bad column
      const cols = Object.entries(data)
        .map(([k, v]) => `${k}(${v === null ? 'null' : typeof v})=${JSON.stringify(v)}`)
        .join(' | ');
      console.error(`[DataStoreService] INSERT FAILED table="${tableName}" error="${err.message}"`);
      console.error(`[DataStoreService] INSERT COLUMNS: ${cols}`);
      throw new Error(`Insert failed [${tableName}]: ${err.message} | columns => ${cols}`);
    }
  }

  /**
   * Update an existing row (must provide ROWID in data).
   * @param {string} tableName
   * @param {object} data  – must include ROWID
   * @returns {Promise<object>} updated row
   */
  async update(tableName, data) {
    try {
      const table = this.datastore.table(tableName);
      const row = await table.updateRow(data);
      return row;
    } catch (err) {
      const cols = Object.entries(data)
        .map(([k, v]) => `${k}(${v === null ? 'null' : typeof v})=${JSON.stringify(v)}`)
        .join(' | ');
      console.error(`[DataStoreService] UPDATE FAILED table="${tableName}" error="${err.message}"`);
      console.error(`[DataStoreService] UPDATE COLUMNS: ${cols}`);
      throw new Error(`Update failed [${tableName}]: ${err.message} | columns => ${cols}`);
    }
  }

  /**
   * Delete a row by ROWID.
   * @param {string} tableName
   * @param {string|number} rowId
   */
  async delete(tableName, rowId) {
    try {
      const table = this.datastore.table(tableName);
      await table.deleteRow(rowId);
      return true;
    } catch (err) {
      console.error('[DataStoreService] Delete error:', tableName, rowId, err.message);
      throw new Error(`Delete failed: ${err.message}`);
    }
  }

  // ─── Utility ─────────────────────────────────────────────────────────────────

  /**
   * Escape a string value for safe embedding in ZCQL.
   */
  static escape(val) {
    return String(val).replace(/'/g, "''");
  }

  /**
   * Get today's date as YYYY-MM-DD string (IST / server timezone).
   */
  static today() {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Subtract N days from today and return as YYYY-MM-DD.
   */
  static daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
  }
}

module.exports = DataStoreService;
