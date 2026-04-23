'use strict';

const DataStoreService = require('./DataStoreService');
const { TABLES } = require('../utils/Constants');

class BotDataService {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
  }

  // ─── Bot Profile ───────────────────────────────────────────────────────────

  async getProfile(userId, tenantId) {
    console.log(`[BotDataService] getProfile — userId=${userId} tenantId=${tenantId}`);
    try {
      const rows = await this.db.query(
        `SELECT * FROM ${TABLES.BOT_PROFILES}
         WHERE user_id = '${DataStoreService.escape(userId)}'
           AND tenant_id = '${DataStoreService.escape(tenantId)}' LIMIT 1`
      );
      const result = rows[0] ?? null;
      console.log(`[BotDataService] getProfile — ${result ? `found ROWID=${result.ROWID}` : 'not found (will use defaults)'}`);
      return result;
    } catch (err) {
      console.warn(`[BotDataService] getProfile — query error (returning null):`, err.message);
      return null;
    }
  }

  async upsertProfile(userId, tenantId, fields) {
    console.log(`[BotDataService] upsertProfile — userId=${userId} tenantId=${tenantId} fields=${JSON.stringify(Object.keys(fields))}`);
    try {
      const existing = await this.getProfile(userId, tenantId);
      if (existing) {
        console.log(`[BotDataService] upsertProfile — updating existing row ROWID=${existing.ROWID}`);
        const result = await this.db.update(TABLES.BOT_PROFILES, {
          ROWID: String(existing.ROWID),
          ...fields,
        });
        console.log(`[BotDataService] upsertProfile ✓ — updated`);
        return result;
      } else {
        console.log(`[BotDataService] upsertProfile — inserting new profile row`);
        const result = await this.db.insert(TABLES.BOT_PROFILES, {
          tenant_id: String(tenantId),
          user_id:   String(userId),
          ...fields,
        });
        console.log(`[BotDataService] upsertProfile ✓ — inserted ROWID=${result?.ROWID}`);
        return result;
      }
    } catch (err) {
      console.error('[BotDataService] upsertProfile — failed:', err.message);
      throw err;
    }
  }

  // ─── Conversation History ─────────────────────────────────────────────────

  async getConversationHistory(userId, tenantId, sessionId, limit = 20) {
    console.log(`[BotDataService] getConversationHistory — userId=${userId} sessionId=${sessionId} limit=${limit}`);
    try {
      const rows = await this.db.query(
        `SELECT * FROM ${TABLES.BOT_CONVERSATIONS}
         WHERE user_id = '${DataStoreService.escape(userId)}'
           AND tenant_id = '${DataStoreService.escape(tenantId)}'
           AND session_id = '${DataStoreService.escape(sessionId)}'
         ORDER BY CREATEDTIME ASC LIMIT ${limit}`
      );
      console.log(`[BotDataService] getConversationHistory ✓ — returned ${rows.length} messages`);
      return rows;
    } catch (err) {
      console.warn('[BotDataService] getConversationHistory — query error (returning []):', err.message);
      return [];
    }
  }

  async saveMessage(userId, tenantId, sessionId, role, content, messageType = 'text', metadata = null) {
    console.log(`[BotDataService] saveMessage — userId=${userId} sessionId=${sessionId} role=${role} type=${messageType} content_len=${content.length}`);
    try {
      const result = await this.db.insert(TABLES.BOT_CONVERSATIONS, {
        tenant_id:    String(tenantId),
        user_id:      String(userId),
        session_id:   String(sessionId),
        role,
        content:      String(content).slice(0, 4990),
        message_type: messageType,
        metadata:     metadata ? JSON.stringify(metadata).slice(0, 1990) : '',
      });
      console.log(`[BotDataService] saveMessage ✓ — ROWID=${result?.ROWID}`);
      return result;
    } catch (err) {
      console.warn('[BotDataService] saveMessage — failed (non-fatal):', err.message);
      return null;
    }
  }

  // ─── Todo Items ───────────────────────────────────────────────────────────

  async getTodos(userId, tenantId, sessionId = null) {
    console.log(`[BotDataService] getTodos — userId=${userId} tenantId=${tenantId} sessionId=${sessionId ?? 'all'}`);
    try {
      let where = `user_id = '${DataStoreService.escape(userId)}' AND tenant_id = '${DataStoreService.escape(tenantId)}'`;
      if (sessionId) where += ` AND session_id = '${DataStoreService.escape(sessionId)}'`;
      const rows = await this.db.query(
        `SELECT * FROM ${TABLES.BOT_TODO_ITEMS} WHERE ${where} ORDER BY is_pinned DESC, CREATEDTIME DESC LIMIT 200`
      );
      console.log(`[BotDataService] getTodos ✓ — returned ${rows.length} items`);
      return rows;
    } catch (err) {
      console.warn('[BotDataService] getTodos — query error (returning []):', err.message);
      return [];
    }
  }

  async bulkInsertTodos(items) {
    console.log(`[BotDataService] bulkInsertTodos — inserting ${items.length} items`);
    const results = [];
    for (let i = 0; i < items.length; i++) {
      try {
        const row = await this.db.insert(TABLES.BOT_TODO_ITEMS, items[i]);
        console.log(`[BotDataService] bulkInsertTodos — item ${i + 1}/${items.length} ✓ ROWID=${row?.ROWID} title="${items[i].title}"`);
        results.push(row);
      } catch (err) {
        console.warn(`[BotDataService] bulkInsertTodos — item ${i + 1}/${items.length} failed: ${err.message}`);
      }
    }
    console.log(`[BotDataService] bulkInsertTodos ✓ — ${results.length}/${items.length} inserted`);
    return results;
  }

  async updateTodo(rowId, fields) {
    console.log(`[BotDataService] updateTodo — ROWID=${rowId} fields=${JSON.stringify(fields)}`);
    try {
      const result = await this.db.update(TABLES.BOT_TODO_ITEMS, { ROWID: String(rowId), ...fields });
      console.log(`[BotDataService] updateTodo ✓ — ROWID=${rowId}`);
      return result;
    } catch (err) {
      console.error('[BotDataService] updateTodo — failed:', err.message);
      throw err;
    }
  }

  // ─── Quick Actions ────────────────────────────────────────────────────────

  async getQuickActions() {
    console.log('[BotDataService] getQuickActions — querying bot_quick_actions');
    try {
      const rows = await this.db.query(
        `SELECT * FROM ${TABLES.BOT_QUICK_ACTIONS} WHERE is_active = 'true' ORDER BY sort_order ASC LIMIT 20`
      );
      console.log(`[BotDataService] getQuickActions ✓ — ${rows.length} actions from DB`);
      return rows;
    } catch (err) {
      console.warn('[BotDataService] getQuickActions — query error (will use defaults):', err.message);
      return [];
    }
  }
}

module.exports = BotDataService;
