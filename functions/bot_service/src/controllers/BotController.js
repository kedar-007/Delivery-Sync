'use strict';

const DataStoreService  = require('../services/DataStoreService');
const BotDataService    = require('../services/BotDataService');
const LLMService        = require('../services/LLMService');
const ModuleScanService = require('../services/ModuleScanService');
const ResponseHelper    = require('../utils/ResponseHelper');
const { TABLES, LLM_CONFIG, SCAN_STATUS, DEFAULT_QUICK_ACTIONS } = require('../utils/Constants');

const PERSONALITY_TONES = {
  FRIENDLY:     'You are warm, encouraging, and upbeat. Use light emoji occasionally. Celebrate wins.',
  PROFESSIONAL: 'You are precise, data-driven, and formal. No emoji. Use bullet points and structured summaries.',
  CONCISE:      'You are extremely brief and direct. Short sentences only. No fluff. Get to the point immediately.',
};

class BotController {
  constructor(catalystApp) {
    this.catalystApp = catalystApp;
    this.bot         = new BotDataService(catalystApp);
    this.llm         = new LLMService(catalystApp);
    this.scanner     = new ModuleScanService(catalystApp);
  }

  // ─── POST /api/bot/message ────────────────────────────────────────────────

  async message(req, res) {
    const { id: userId, name: userName, tenantId, role } = req.currentUser;
    const { session_id, message: userMessage, message_type = 'text' } = req.body;

    console.log(`[BotController] message — userId=${userId} tenantId=${tenantId} session=${session_id} type=${message_type} msg_len=${userMessage?.length}`);

    if (!session_id)   return ResponseHelper.validationError(res, 'session_id is required');
    if (!userMessage)  return ResponseHelper.validationError(res, 'message is required');

    // Step 1: load bot profile for name + personality
    console.log('[BotController] message Step 1 — loading bot profile');
    const profile     = await this.bot.getProfile(userId, tenantId);
    const botName     = profile?.bot_name        || 'ARIA';
    const personality = profile?.bot_personality || 'FRIENDLY';
    console.log(`[BotController] message Step 1 ✓ — botName=${botName} personality=${personality}`);

    // Step 2: load conversation history for context
    console.log('[BotController] message Step 2 — loading conversation history');
    const history = await this.bot.getConversationHistory(userId, tenantId, session_id, 20);
    console.log(`[BotController] message Step 2 ✓ — ${history.length} prior messages loaded`);

    // Step 3: build context block (scan vs smart)
    const isDailyPlan = message_type === 'daily_plan' || userMessage.toLowerCase().includes('daily plan');
    let scanResults   = [];
    let contextBlock  = '';

    if (isDailyPlan) {
      console.log('[BotController] message Step 3 — daily plan detected, running full module scan');
      scanResults  = await this.scanner.scanAll(userId, tenantId);
      contextBlock = this._buildScanContext(scanResults);
      console.log(`[BotController] message Step 3 ✓ — scan complete (${scanResults.length} modules)`);
    } else {
      console.log('[BotController] message Step 3 — building smart context from user message keywords');
      contextBlock = await this._buildSmartContext(userId, tenantId, userMessage);
      console.log(`[BotController] message Step 3 ✓ — context_len=${contextBlock.length}`);
    }

    // Step 4: assemble system prompt
    console.log('[BotController] message Step 4 — assembling system prompt');
    const today      = DataStoreService.today();
    const dayOfWeek  = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const tone       = PERSONALITY_TONES[personality] || PERSONALITY_TONES.FRIENDLY;

    const systemPrompt = `You are ${botName}, an AI-powered personal work assistant embedded in DeliverSync — a project management platform.

USER CONTEXT:
- Name: ${userName}
- Role: ${role}
- Today: ${dayOfWeek}, ${today}

PERSONALITY: ${tone}

CURRENT APP DATA:
${contextBlock}

RESPONSE FORMAT:
Return ONLY a valid JSON object with no surrounding text or markdown. Use one of these schemas:

For regular responses:
{"type":"text","content":"Your conversational response here"}

For daily plan generation:
{"type":"daily_plan","content":"Brief intro (1-2 sentences)","items":[{"title":"...","description":"...","module":"timelogs|standup|tasks|milestones|checkin","todo_priority":"high|medium|low","due_date":"YYYY-MM-DD or null"}]}

For data responses (time, tasks, etc.):
{"type":"data_response","content":"Natural language summary","data":{"key":"value"}}

Keep responses concise and actionable. For daily plans, generate 3-8 prioritized items.`;
    console.log(`[BotController] message Step 4 ✓ — system_prompt_len=${systemPrompt.length}`);

    // Step 5: call LLM
    console.log('[BotController] message Step 5 — calling LLM');
    const messages = [
      ...history.map((h) => ({ role: h.role, content: h.message })),
      { role: 'user', content: isDailyPlan ? 'Generate my daily plan based on the module scan data provided.' : userMessage },
    ];

    let llmResponse, parsedReply;
    try {
      const result = await this.llm.callWithHistory(
        messages,
        systemPrompt,
        { max_tokens: isDailyPlan ? LLM_CONFIG.MAX_PLAN_TOKENS : LLM_CONFIG.MAX_TOKENS }
      );
      llmResponse = result.response;
      console.log(`[BotController] message Step 5 ✓ — LLM responded, response_len=${llmResponse.length}`);
    } catch (llmErr) {
      console.error('[BotController] message Step 5 ✗ — LLM error:', llmErr.message, '— using fallback');
      llmResponse = JSON.stringify({
        type:    'text',
        content: isDailyPlan
          ? this._buildFallbackPlan(scanResults, userName)
          : "I'm having trouble connecting right now. Please try again in a moment.",
      });
    }

    // Step 6: parse LLM JSON response
    console.log('[BotController] message Step 6 — parsing LLM response as JSON');
    try {
      const cleaned = llmResponse.replace(/^```json?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      parsedReply   = JSON.parse(cleaned);
      console.log(`[BotController] message Step 6 ✓ — type=${parsedReply.type} items=${parsedReply.items?.length ?? 0}`);
    } catch (_) {
      console.warn('[BotController] message Step 6 — JSON parse failed, treating as plain text');
      parsedReply = { type: 'text', content: llmResponse };
    }

    // Step 7: persist conversation messages
    console.log('[BotController] message Step 7 — persisting conversation messages');
    await Promise.allSettled([
      this.bot.saveMessage(userId, tenantId, session_id, 'user',      userMessage,                              message_type),
      this.bot.saveMessage(userId, tenantId, session_id, 'assistant', parsedReply.content || llmResponse, parsedReply.type || 'text'),
    ]);
    console.log('[BotController] message Step 7 ✓ — messages persisted');

    // Step 8: persist daily plan todos (if applicable)
    let savedTodos = [];
    if (parsedReply.type === 'daily_plan' && Array.isArray(parsedReply.items)) {
      console.log(`[BotController] message Step 8 — persisting ${parsedReply.items.length} daily plan todo items`);
      const todoRows = parsedReply.items.map((item) => ({
        tenant_id:     String(tenantId),
        user_id:       String(userId),
        session_id:    String(session_id),
        title:         String(item.title || '').slice(0, 490),
        description:   String(item.description || '').slice(0, 1990),
        module:        item.module || 'tasks',
        todo_priority: item.todo_priority || item.priority || 'medium',
        is_pinned:     'true',
        is_completed:  'false',
        due_date:      item.due_date || null,
      }));
      savedTodos = await this.bot.bulkInsertTodos(todoRows);
      console.log(`[BotController] message Step 8 ✓ — ${savedTodos.length} todos saved`);
    } else {
      console.log('[BotController] message Step 8 — skipped (not a daily plan)');
    }

    console.log(`[BotController] message ✓ — complete, type=${parsedReply.type}`);
    return ResponseHelper.success(res, {
      reply:        parsedReply.content || llmResponse,
      message_type: parsedReply.type    || 'text',
      data:         parsedReply.data    || null,
      items:        parsedReply.items   || [],
      scan_results: scanResults,
      saved_todos:  savedTodos.map((t) => ({ id: t?.ROWID || null })),
    });
  }

  // ─── GET /api/bot/profile ──────────────────────────────────────────────────

  async getProfile(req, res) {
    const { id: userId, tenantId } = req.currentUser;
    console.log(`[BotController] getProfile — userId=${userId} tenantId=${tenantId}`);
    try {
      const profile = await this.bot.getProfile(userId, tenantId);
      if (profile) {
        console.log(`[BotController] getProfile ✓ — found ROWID=${profile.ROWID}`);
      } else {
        console.log('[BotController] getProfile ✓ — not found, returning defaults');
      }
      return ResponseHelper.success(res, profile ?? {
        bot_name:         'ARIA',
        bot_avatar_url:   '',
        bot_accent_color: '#00F5FF',
        bot_personality:  'FRIENDLY',
      });
    } catch (err) {
      console.error('[BotController] getProfile ✗ —', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ─── PUT /api/bot/profile ─────────────────────────────────────────────────

  async updateProfile(req, res) {
    const { id: userId, tenantId } = req.currentUser;
    const { bot_name, bot_avatar_url, bot_accent_color, bot_personality } = req.body;
    console.log(`[BotController] updateProfile — userId=${userId} tenantId=${tenantId}`);
    console.log(`[BotController] updateProfile — fields received: name=${bot_name} color=${bot_accent_color} personality=${bot_personality} avatar=${bot_avatar_url ? `[${bot_avatar_url.length} chars]` : 'none'}`);

    try {
      const fields = {};
      if (bot_name)         fields.bot_name         = String(bot_name).slice(0, 100);
      if (bot_avatar_url)   fields.bot_avatar_url   = String(bot_avatar_url);
      if (bot_accent_color) fields.bot_accent_color = String(bot_accent_color).slice(0, 20);
      if (bot_personality)  fields.bot_personality  = String(bot_personality).slice(0, 50);

      console.log(`[BotController] updateProfile — upserting with fields: ${JSON.stringify(Object.keys(fields))}`);
      await this.bot.upsertProfile(userId, tenantId, fields);

      console.log('[BotController] updateProfile — fetching updated profile to return');
      const updated = await this.bot.getProfile(userId, tenantId);
      console.log(`[BotController] updateProfile ✓ — ROWID=${updated?.ROWID}`);
      return ResponseHelper.success(res, updated);
    } catch (err) {
      console.error('[BotController] updateProfile ✗ —', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ─── GET /api/bot/todos ───────────────────────────────────────────────────

  async getTodos(req, res) {
    const { id: userId, tenantId } = req.currentUser;
    const { session_id } = req.query;
    console.log(`[BotController] getTodos — userId=${userId} tenantId=${tenantId} session=${session_id ?? 'all'}`);
    try {
      const todos = await this.bot.getTodos(userId, tenantId, session_id || null);
      console.log(`[BotController] getTodos ✓ — ${todos.length} items`);
      return ResponseHelper.success(res, { todos });
    } catch (err) {
      console.error('[BotController] getTodos ✗ —', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ─── PUT /api/bot/todos/:id ───────────────────────────────────────────────

  async updateTodo(req, res) {
    const { id: todoId } = req.params;
    const { is_pinned, is_completed } = req.body;
    console.log(`[BotController] updateTodo — id=${todoId} is_pinned=${is_pinned} is_completed=${is_completed}`);

    const fields = {};
    if (is_pinned    !== undefined) fields.is_pinned    = String(Boolean(is_pinned));
    if (is_completed !== undefined) fields.is_completed = String(Boolean(is_completed));

    if (Object.keys(fields).length === 0) {
      console.warn('[BotController] updateTodo — no valid fields provided');
      return ResponseHelper.validationError(res, 'No fields to update');
    }

    try {
      await this.bot.updateTodo(todoId, fields);
      console.log(`[BotController] updateTodo ✓ — id=${todoId}`);
      return ResponseHelper.success(res, { id: todoId, ...fields });
    } catch (err) {
      console.error('[BotController] updateTodo ✗ —', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ─── GET /api/bot/quick-actions ───────────────────────────────────────────

  async getQuickActions(req, res) {
    console.log('[BotController] getQuickActions — loading actions');
    try {
      const dbActions = await this.bot.getQuickActions();
      const actions   = dbActions.length > 0 ? dbActions : DEFAULT_QUICK_ACTIONS;
      console.log(`[BotController] getQuickActions ✓ — ${actions.length} actions (${dbActions.length > 0 ? 'from DB' : 'using built-in defaults'})`);
      return ResponseHelper.success(res, { actions });
    } catch (err) {
      console.error('[BotController] getQuickActions ✗ —', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ─── POST /api/bot/avatar ─────────────────────────────────────────────────

  async uploadAvatar(req, res) {
    const { id: userId } = req.currentUser;
    const { base64, content_type = 'image/jpeg', file_name } = req.body;
    console.log(`[BotController] uploadAvatar — userId=${userId} content_type=${content_type} base64_len=${base64?.length}`);

    if (!base64) return ResponseHelper.validationError(res, 'base64 image data required');

    try {
      // Strip data-URI prefix if the frontend sent a full data URL
      const base64Data = base64.replace(/^data:image\/[\w+]+;base64,/, '');
      const buffer     = Buffer.from(base64Data, 'base64');

      const ext            = (file_name?.split('.').pop() || 'jpg').toLowerCase();
      const uniqueFileName = `bot_avatar_${userId}_${Date.now()}.${ext}`;

      const BUCKET_NAME     = process.env.STRATUS_BUCKET_NAME     || 'profiles-users';
      const BUCKET_BASE_URL = process.env.STRATUS_USER_AVATARS_URL || 'https://profiles-users-development.zohostratus.in';

      console.log(`[BotController] uploadAvatar — uploading to Stratus bucket=${BUCKET_NAME} file=${uniqueFileName} size=${buffer.length}B`);

      const bucket = this.catalystApp.stratus().bucket(BUCKET_NAME);
      const result = await bucket.putObject(uniqueFileName, buffer, {
        contentType: content_type,
      });

      if (result !== true) {
        console.warn('[BotController] uploadAvatar — putObject returned:', result);
        return ResponseHelper.serverError(res, 'Stratus upload did not confirm success');
      }

      const fileUrl = `${BUCKET_BASE_URL}/${uniqueFileName}`;
      console.log(`[BotController] uploadAvatar ✓ — url=${fileUrl}`);
      return ResponseHelper.success(res, { url: fileUrl });
    } catch (err) {
      console.error('[BotController] uploadAvatar ✗ —', err.message);
      return ResponseHelper.serverError(res, 'Avatar upload failed: ' + err.message);
    }
  }

  // ─── Context Builders ─────────────────────────────────────────────────────

  _buildScanContext(scanResults) {
    return scanResults.map((s) =>
      `${s.label.toUpperCase()}: ${s.found} [Status: ${s.status}, Completion: ${s.completion_pct}%]`
    ).join('\n');
  }

  async _buildSmartContext(userId, tenantId, message) {
    const msg       = message.toLowerCase();
    const lines     = [];
    const today     = DataStoreService.today();
    const weekStart = DataStoreService.weekStart();

    try {
      if (msg.includes('billable') || msg.includes('time') || msg.includes('hours') || msg.includes('log')) {
        console.log('[BotController] _buildSmartContext — fetching time entries');
        const entries  = await this.bot.db.query(
          `SELECT * FROM ${TABLES.TIME_ENTRIES}
           WHERE tenant_id = '${DataStoreService.escape(tenantId)}'
             AND user_id = '${DataStoreService.escape(userId)}'
             AND entry_date >= '${weekStart}'
           LIMIT 200`
        );
        const total    = entries.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
        const billable = entries
          .filter((e) => String(e.is_billable).toLowerCase() === 'true')
          .reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
        lines.push(`Time this week: ${total.toFixed(1)}h total, ${billable.toFixed(1)}h billable, ${(total - billable).toFixed(1)}h non-billable`);
        console.log(`[BotController] _buildSmartContext — time: total=${total.toFixed(1)}h billable=${billable.toFixed(1)}h`);
      }

      if (msg.includes('task') || msg.includes('pending') || msg.includes('overdue') || msg.includes('todo')) {
        console.log('[BotController] _buildSmartContext — fetching tasks');
        const tasks   = await this.bot.db.query(
          `SELECT ROWID, title, status, due_date, task_priority FROM ${TABLES.TASKS}
           WHERE tenant_id = '${DataStoreService.escape(tenantId)}'
             AND assignee_id = '${DataStoreService.escape(userId)}'
             AND status != 'DONE' AND status != 'CANCELLED'
           ORDER BY due_date ASC LIMIT 20`
        );
        const overdue = tasks.filter((t) => t.due_date && t.due_date < today);
        lines.push(`Tasks: ${tasks.length} pending, ${overdue.length} overdue`);
        if (tasks.slice(0, 5).length > 0) {
          lines.push('Top tasks: ' + tasks.slice(0, 5).map((t) => `"${t.title}" [${t.status}]`).join(', '));
        }
        console.log(`[BotController] _buildSmartContext — tasks: ${tasks.length} pending, ${overdue.length} overdue`);
      }

      if (msg.includes('standup') || msg.includes('stand-up') || msg.includes('update')) {
        console.log('[BotController] _buildSmartContext — fetching standup');
        const standup = await this.bot.db.query(
          `SELECT * FROM ${TABLES.STANDUP_ENTRIES}
           WHERE tenant_id = '${DataStoreService.escape(tenantId)}'
             AND user_id = '${DataStoreService.escape(userId)}'
             AND entry_date = '${today}'
           LIMIT 1`
        );
        lines.push(`Today's standup: ${standup.length > 0 ? 'Submitted' : 'Not yet submitted'}`);
        console.log(`[BotController] _buildSmartContext — standup: ${standup.length > 0 ? 'submitted' : 'not submitted'}`);
      }

      if (msg.includes('check') || msg.includes('attendance') || msg.includes('missed')) {
        console.log('[BotController] _buildSmartContext — fetching attendance');
        const records   = await this.bot.db.query(
          `SELECT * FROM ${TABLES.ATTENDANCE_RECORDS}
           WHERE tenant_id = '${DataStoreService.escape(tenantId)}'
             AND user_id = '${DataStoreService.escape(userId)}'
             AND attendance_date >= '${weekStart}'
           LIMIT 10`
        );
        const checkedIn = records.filter((r) => r.check_in_time).length;
        lines.push(`Attendance this week: ${checkedIn} days checked in`);
        console.log(`[BotController] _buildSmartContext — attendance: ${checkedIn} days checked in`);
      }
    } catch (err) {
      console.warn('[BotController] _buildSmartContext — error fetching context (non-fatal):', err.message);
    }

    const result = lines.length > 0 ? lines.join('\n') : 'No specific context available for this query.';
    console.log(`[BotController] _buildSmartContext ✓ — ${lines.length} context lines built`);
    return result;
  }

  _buildFallbackPlan(scanResults, userName) {
    const items = [];
    for (const s of scanResults) {
      if (s.status !== SCAN_STATUS.ALL_GOOD) {
        items.push(`• [${s.label}] ${s.found}`);
      }
    }
    const intro = `Hi ${userName}! Here's what needs your attention today:`;
    return items.length > 0
      ? `${intro}\n${items.join('\n')}`
      : `${intro}\nEverything looks great — you're all caught up!`;
  }
}

module.exports = BotController;
