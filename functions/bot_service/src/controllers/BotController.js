'use strict';

const DataStoreService  = require('../services/DataStoreService');
const BotDataService    = require('../services/BotDataService');
const LLMService        = require('../services/LLMService');
const ModuleScanService = require('../services/ModuleScanService');
const MCPService        = require('../services/MCPService');
const ResponseHelper    = require('../utils/ResponseHelper');
const { TABLES, LLM_CONFIG, SCAN_STATUS, DEFAULT_QUICK_ACTIONS } = require('../utils/Constants');

const PERSONALITY_TONES = {
  FRIENDLY:     'Warm, encouraging. Light emoji ok.',
  PROFESSIONAL: 'Precise, formal, no emoji.',
  CONCISE:      'Brief and direct only.',
};

// Module-level session history cache — persists for 1 hr per session across requests on the same instance
const _historyCache = new Map(); // key: `${tenantId}:${sessionId}`
const HISTORY_CACHE_TTL = 60 * 60 * 1000;

function _cacheKey(tenantId, sessionId) { return `${tenantId}:${sessionId}`; }

function _getCached(tenantId, sessionId) {
  const entry = _historyCache.get(_cacheKey(tenantId, sessionId));
  if (!entry || entry.expiry < Date.now()) return null;
  return entry.messages;
}

function _setCached(tenantId, sessionId, messages) {
  _historyCache.set(_cacheKey(tenantId, sessionId), {
    messages: messages.slice(-24), // keep up to 24 turns in memory
    expiry:   Date.now() + HISTORY_CACHE_TTL,
  });
}

function _appendCached(tenantId, sessionId, userMsg, botMsg, botType) {
  const existing = _getCached(tenantId, sessionId) || [];
  const updated  = [
    ...existing,
    { role: 'user',      message: userMsg, content: userMsg },
    { role: 'assistant', message: botMsg,  content: botMsg, message_type: botType },
  ];
  _setCached(tenantId, sessionId, updated);
}

// Extract all top-level JSON objects from an LLM response string.
// If the LLM output two objects (text + action_execute), we prefer the action one.
function _extractBestJson(raw) {
  const cleaned = raw.replace(/^```json?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const objects = [];
  let depth = 0, start = -1;
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (cleaned[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try { objects.push(JSON.parse(cleaned.slice(start, i + 1))); } catch {}
        start = -1;
      }
    }
  }
  if (objects.length === 0) return JSON.parse(cleaned); // will throw naturally
  const priority = ['action_execute', 'create_time_entry', 'daily_plan', 'leave_balance', 'action_form', 'choice_list', 'text'];
  objects.sort((a, b) => {
    const ai = priority.indexOf(a.type ?? '');
    const bi = priority.indexOf(b.type ?? '');
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return objects[0];
}

class BotController {
  constructor(catalystApp) {
    this.catalystApp = catalystApp;
    this.bot         = new BotDataService(catalystApp);
    this.llm         = new LLMService(catalystApp);
    this.scanner     = new ModuleScanService(catalystApp);
    this.mcp         = new MCPService(catalystApp);
  }

  // ─── POST /api/bot/message ────────────────────────────────────────────────

  async message(req, res) {
    const { id: userId, name: userName, tenantId, role } = req.currentUser;
    const { session_id, message: userMessage, message_type = 'text' } = req.body;

    console.log(`[BotController] message — userId=${userId} tenantId=${tenantId} session=${session_id} type=${message_type} msg_len=${userMessage?.length}`);

    if (!session_id)   return ResponseHelper.validationError(res, 'session_id is required');
    if (!userMessage)  return ResponseHelper.validationError(res, 'message is required');

    // ── Fast path: action_submit bypasses LLM entirely ───────────────────────
    if (message_type === 'action_submit') {
      let actionPayload;
      try { actionPayload = JSON.parse(userMessage); } catch {
        return ResponseHelper.validationError(res, 'action_submit requires a JSON message body');
      }
      const { action, ...formData } = actionPayload;
      console.log(`[BotController] action_submit — action=${action}`);
      const result = await this._executeAction(userId, tenantId, action, formData);
      await Promise.allSettled([
        this.bot.saveMessage(userId, tenantId, session_id, 'user',      `[Form: ${action}]`, 'action_submit'),
        this.bot.saveMessage(userId, tenantId, session_id, 'assistant', result.content, result.type),
      ]);
      return ResponseHelper.success(res, {
        reply:        result.content,
        message_type: result.type,
        data:         result.data || null,
        items:        [],
        scan_results: [],
        saved_todos:  [],
      });
    }

    // Step 1: load bot profile for name + personality
    console.log('[BotController] message Step 1 — loading bot profile');
    const profile     = await this.bot.getProfile(userId, tenantId);
    const botName     = profile?.bot_name        || 'ARIA';
    const personality = profile?.bot_personality || 'FRIENDLY';
    console.log(`[BotController] message Step 1 ✓ — botName=${botName} personality=${personality}`);

    // Step 2: load conversation history — try in-memory cache first, fall back to DB
    console.log('[BotController] message Step 2 — loading conversation history');
    let history = _getCached(tenantId, session_id);
    if (history) {
      console.log(`[BotController] message Step 2 ✓ — ${history.length} messages from cache (session hot)`);
    } else {
      history = await this.bot.getConversationHistory(userId, tenantId, session_id, 24);
      _setCached(tenantId, session_id, history);
      console.log(`[BotController] message Step 2 ✓ — ${history.length} messages from DB (cache miss)`);
    }

    // Step 3: build context block (scan vs smart)
    const isDailyPlan      = message_type === 'daily_plan' || userMessage.toLowerCase().includes('daily plan');
    const isVoiceTimeEntry = message_type === 'voice_time_entry';
    let scanResults        = [];
    let contextBlock       = '';
    let projectsForLLM     = '';

    if (isDailyPlan) {
      console.log('[BotController] message Step 3 — daily plan detected, running full module scan');
      scanResults  = await this.scanner.scanAll(userId, tenantId);
      contextBlock = this._buildScanContext(scanResults);
      console.log(`[BotController] message Step 3 ✓ — scan complete (${scanResults.length} modules)`);
    } else {
      console.log('[BotController] message Step 3 — building MCP context from user message + history');
      contextBlock = await this.mcp.buildContext(userId, tenantId, userMessage, history);
      console.log(`[BotController] message Step 3 ✓ — context_len=${contextBlock.length}`);
    }

    // If mid-conversation about an action, refresh context for the LLM every turn
    const lastBotMsg   = history.filter((h) => h.role === 'assistant').slice(-1)[0]?.message || '';
    const isLeaveConv  = /leave|sick|annual|half.?day|log.*leave|leave.*log/i.test(lastBotMsg);
    const isActionConv = isLeaveConv || /standup|task|project|type of leave|what dates|start date|which project/i.test(lastBotMsg);
    if (isLeaveConv && !projectsForLLM) {
      // Leave flow: inject only leave types — NOT projects (showing projects causes the LLM to ask "which project?")
      try {
        const ltRows = await this.bot.db.query(
          `SELECT name FROM ${TABLES.LEAVE_TYPES} WHERE tenant_id='${DataStoreService.escape(tenantId)}' LIMIT 20`
        );
        if (ltRows.length > 0) {
          projectsForLLM = 'Leave types (use name as leave_type_id): ' + ltRows.map((t) => t.name).join(', ');
        }
        console.log('[BotController] message Step 3 — leave context loaded (types only, no projects)');
      } catch (err) {
        console.warn('[BotController] message Step 3 — leave type context failed:', err.message);
      }
    } else if (isActionConv && !projectsForLLM) {
      // Standup / task flow: inject projects + leave types
      try {
        projectsForLLM = await this.mcp.buildActionContext(userId, tenantId);
        if (projectsForLLM) console.log('[BotController] message Step 3 — refreshed action context via MCPService');
      } catch (err) {
        console.warn('[BotController] message Step 3 — action context refresh failed:', err.message);
      }
    }

    // For voice time-entry or time-log messages, pre-load the user's project list so the LLM can match names.
    // Skip if we are already mid-conversation about a leave/action — "log for tomorrow" would otherwise
    // be misread as a time-entry request and overwrite the leave context.
    const isTimeEntryMsg = isVoiceTimeEntry || /\b(log|logged)\s+\d|\d+\s*h(our)?s?\b|time entry/i.test(userMessage);
    if (isTimeEntryMsg && !isLeaveConv) {
      try {
        const projRows = await this.bot.db.query(
          `SELECT ROWID, name FROM ${TABLES.PROJECTS}
           WHERE tenant_id = '${DataStoreService.escape(tenantId)}'
             AND ROWID IN (
               SELECT project_id FROM ${TABLES.PROJECT_MEMBERS ?? 'project_members'}
               WHERE tenant_id = '${DataStoreService.escape(tenantId)}'
                 AND user_id = '${DataStoreService.escape(userId)}'
             )
           LIMIT 30`
        );
        if (projRows.length > 0) {
          projectsForLLM = '\nUser\'s projects: ' + projRows.map((p) => `${p.name} [id:${p.ROWID}]`).join(', ');
        }
        console.log(`[BotController] message Step 3 — loaded ${projRows.length} projects for time-entry LLM context`);
      } catch (err) {
        console.warn('[BotController] message Step 3 — failed to load projects (non-fatal):', err.message);
      }
    }

    // Step 4: assemble system prompt
    console.log('[BotController] message Step 4 — assembling system prompt');
    const today      = DataStoreService.today();
    const dayOfWeek  = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const tone       = PERSONALITY_TONES[personality] || PERSONALITY_TONES.FRIENDLY;

    // Truncate context to keep total input tokens within the model's 1106-token context window
    const ctxSnippet = contextBlock.slice(0, 600);
    const projSnippet = projectsForLLM ? projectsForLLM.slice(0, 200) : '';

    const systemPrompt = `You are ${botName}, AI work assistant in DeliverSync. User: ${userName} (${role}). Today: ${today}. ${tone}

DATA:
${ctxSnippet}${projSnippet}

Reply ONLY as JSON. Schemas:
{"type":"text","content":"<full answer with real numbers>"}
{"type":"daily_plan","content":"<intro>","items":[{"title":"","description":"","module":"timelogs|standup|tasks|milestones|checkin","todo_priority":"high|medium|low","due_date":"YYYY-MM-DD or null"}]}
{"type":"leave_balance","content":""}
{"type":"choice_list","content":"<question>","choices":[{"label":"<name>","value":"<id>"}]}
{"type":"action_execute","content":"<msg>","action":"create_leave|submit_standup|create_task","data":{...}}
{"type":"create_time_entry","content":"<msg>","data":{"project_name":"","project_id":"","hours":0,"description":"","is_billable":true}}

Rules:
- Output EXACTLY ONE JSON object per response — never two.
- CRITICAL: A text response NEVER creates, logs, or submits anything. Writing "I have logged your leave" in a text response does NOTHING. The ONLY way to actually create/submit data is to output action_execute. If you say you did something without outputting action_execute, it did not happen.
- Always put REAL numbers in content. Never say "here is your data:" without the actual data.
- When user message starts with "[SELECTED]", they picked that option from the previous choice_list. NEVER show the same choice_list again. Treat it as answered and move to the NEXT required field immediately.
- For leave: fields are leave_type_id (leave type NAME, e.g. "Sick Leave"), start_date(YYYY-MM-DD), end_date(YYYY-MM-DD), is_half_day("true"/"false"), reason(optional). Leave does NOT need a project — NEVER ask for a project in a leave flow. Extract ALL fields from the user's message and history FIRST. If "today/tomorrow/next Monday" or a date is mentioned, resolve to YYYY-MM-DD immediately — never ask again. If "full day" is mentioned, set is_half_day="false" — never ask. When ALL fields are known, output action_execute immediately — do NOT output a text response saying you logged it.
- submit_standup: project_id(numeric),yesterday,today,blockers
- create_task: title,project_id(numeric),task_priority(HIGH|MEDIUM|LOW),type(TASK|BUG|STORY),description,due_date
- Execute via action_execute only when ALL required fields are collected.`;
    console.log(`[BotController] message Step 4 ✓ — system_prompt_len=${systemPrompt.length}`);

    // Step 5: call LLM
    console.log('[BotController] message Step 5 — calling LLM');
    const messages = [
      ...history.map((h) => ({ role: h.role, content: h.content || h.message || '' })),
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

    // Step 6: parse LLM JSON response — handle multiple JSON objects in one response
    // (LLM sometimes emits a text block then an action_execute block; we prefer the action)
    console.log('[BotController] message Step 6 — parsing LLM response as JSON');
    try {
      parsedReply = _extractBestJson(llmResponse);
      console.log(`[BotController] message Step 6 ✓ — type=${parsedReply.type} items=${parsedReply.items?.length ?? 0}`);
    } catch (_) {
      console.warn('[BotController] message Step 6 — JSON parse failed, treating as plain text');
      parsedReply = { type: 'text', content: llmResponse };
    }

    // Step 6.5a: safety net — if LLM returned text claiming it logged/submitted leave but
    // gave no action_execute, force a re-attempt by injecting a synthetic action_execute from
    // whatever leave fields are present in the raw LLM response or the last user message.
    if (parsedReply.type === 'text' && isLeaveConv && /logged|submitted|recorded|applied/i.test(parsedReply.content || '')) {
      console.warn('[BotController] Step 6.5a — LLM claimed to log leave via text only; attempting to extract action_execute from raw response');
      try {
        // Try to find a hidden action_execute anywhere in the raw response
        const allObjs = _extractBestJson(llmResponse + ' '); // triggers multi-parse
        if (allObjs && allObjs.type === 'action_execute') {
          parsedReply = allObjs;
          console.log('[BotController] Step 6.5a ✓ — rescued action_execute from raw response');
        }
      } catch { /* raw has no action_execute — proceed with text, nothing to rescue */ }
    }

    // Step 6.5: post-process structured LLM responses
    if (parsedReply.type === 'create_time_entry' && parsedReply.data) {
      console.log('[BotController] message Step 6.5 — creating time entry');
      parsedReply = await this._handleCreateTimeEntry(userId, tenantId, parsedReply);
      console.log(`[BotController] message Step 6.5 ✓ time_entry — type=${parsedReply.type}`);
    }
    if (parsedReply.type === 'action_execute') {
      console.log(`[BotController] message Step 6.5 — executing conversational action=${parsedReply.action}`);
      parsedReply = await this._executeActionFromLLM(userId, tenantId, parsedReply);
      console.log(`[BotController] message Step 6.5 ✓ action_execute → type=${parsedReply.type}`);
    }
    if (parsedReply.type === 'action_form') {
      console.log(`[BotController] message Step 6.5 — enriching action_form action=${parsedReply.action}`);
      parsedReply = await this._enrichActionForm(userId, tenantId, parsedReply);
      console.log('[BotController] message Step 6.5 ✓ action_form — fields injected');
    }
    if (parsedReply.type === 'leave_balance') {
      console.log('[BotController] message Step 6.5 — enriching leave_balance');
      parsedReply = await this._enrichLeaveBalance(userId, tenantId, parsedReply);
      console.log('[BotController] message Step 6.5 ✓ leave_balance — data injected');
    }

    // Step 7: persist conversation messages
    console.log('[BotController] message Step 7 — persisting conversation messages');
    // For choice_list, append the options to the saved content so history gives LLM full context
    const assistantContent = (parsedReply.type === 'choice_list' && Array.isArray(parsedReply.choices) && parsedReply.choices.length > 0)
      ? `${parsedReply.content} [Options: ${parsedReply.choices.map((c) => `${c.label}(id:${c.value})`).join('|')}]`
      : (parsedReply.content || llmResponse);

    await Promise.allSettled([
      this.bot.saveMessage(userId, tenantId, session_id, 'user',      userMessage,    message_type),
      this.bot.saveMessage(userId, tenantId, session_id, 'assistant', assistantContent, parsedReply.type || 'text'),
    ]);
    // Keep in-memory cache in sync so the next turn sees this exchange immediately
    _appendCached(tenantId, session_id, userMessage, assistantContent, parsedReply.type || 'text');
    console.log('[BotController] message Step 7 ✓ — messages persisted + cache updated');

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
      choices:      parsedReply.choices  || [],
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

  // ─── Conversational Action Executor (LLM → resolve names → execute) ──────────

  async _executeActionFromLLM(userId, tenantId, parsedReply) {
    const { action, data = {}, content } = parsedReply;
    const resolved = { ...data };

    try {
      // Resolve leave_type_id: LLM sends the leave type name (e.g. "Sick Leave").
      // Look up the real ROWID by name to avoid float64 precision loss on 17-digit IDs.
      if (action === 'create_leave' && resolved.leave_type_id) {
        const raw = String(resolved.leave_type_id).trim();
        // If the LLM sent a name (not a numeric string), resolve it to the ROWID string.
        // Keep as String throughout — 17-digit Catalyst ROWIDs exceed MAX_SAFE_INTEGER.
        if (!/^\d+$/.test(raw)) {
          // ZCQL does not support LOWER() — fetch all leave types and match in JS
          const allTypes = await this.bot.db.query(
            `SELECT ROWID, name FROM ${TABLES.LEAVE_TYPES}
             WHERE tenant_id='${DataStoreService.escape(tenantId)}'
             LIMIT 20`
          );
          const rawLc = raw.toLowerCase();
          const match  = allTypes.find(
            (t) => t.name.toLowerCase() === rawLc || t.name.toLowerCase().includes(rawLc)
          );
          if (match) {
            resolved.leave_type_id = String(match.ROWID);
            console.log(`[BotController] _executeActionFromLLM — resolved leave_type "${raw}" → id=${resolved.leave_type_id}`);
          } else {
            console.warn(`[BotController] _executeActionFromLLM — leave type "${raw}" not found. Available: ${allTypes.map((t) => t.name).join(', ')}`);
            return {
              type:    'action_executed',
              content: `I couldn't find a leave type called "${raw}". Available types: ${allTypes.map((t) => t.name).join(', ')}.`,
              data:    { success: false, action: 'create_leave' },
            };
          }
        }
        // else: already a numeric string — pass through as-is
      }

      // Resolve project_id if the LLM returned a name instead of a numeric ID
      if ((action === 'submit_standup' || action === 'create_task') && resolved.project_id && isNaN(Number(resolved.project_id))) {
        // ZCQL does not support LOWER() — fetch user's projects and match in JS
        const allProjects = await this.bot.db.query(
          `SELECT ROWID, name FROM ${TABLES.PROJECTS}
           WHERE tenant_id = '${DataStoreService.escape(tenantId)}'
             AND ROWID IN (SELECT project_id FROM ${TABLES.PROJECT_MEMBERS} WHERE tenant_id='${DataStoreService.escape(tenantId)}' AND user_id='${DataStoreService.escape(userId)}')
           LIMIT 30`
        );
        const nameLc = String(resolved.project_id).toLowerCase();
        const match  = allProjects.find(
          (p) => p.name.toLowerCase() === nameLc || p.name.toLowerCase().includes(nameLc)
        );
        if (match) resolved.project_id = String(match.ROWID);
      }
    } catch (err) {
      console.warn('[BotController] _executeActionFromLLM — ID resolution failed (non-fatal):', err.message);
    }

    console.log(`[BotController] _executeActionFromLLM — action=${action} resolved_keys=${Object.keys(resolved).join(',')}`);
    return this._executeAction(userId, tenantId, action, resolved);
  }

  // ─── Action Form Enrichers ─────────────────────────────────────────────────

  async _enrichActionForm(userId, tenantId, parsedReply) {
    const { action } = parsedReply;
    try {
      if (action === 'create_leave') {
        const types = await this.bot.db.query(
          `SELECT ROWID, name FROM ${TABLES.LEAVE_TYPES} WHERE tenant_id = '${DataStoreService.escape(tenantId)}' LIMIT 20`
        );
        return {
          ...parsedReply,
          data: {
            action,
            fields: [
              { key: 'leave_type_id', label: 'Leave Type', type: 'select', required: true,
                options: types.map((t) => ({ value: String(t.ROWID), label: t.name })) },
              { key: 'start_date', label: 'Start Date', type: 'date', required: true },
              { key: 'end_date',   label: 'End Date',   type: 'date', required: true },
              { key: 'is_half_day', label: 'Half Day', type: 'toggle', required: false, default: 'false' },
              { key: 'reason', label: 'Reason', type: 'textarea', required: false, placeholder: 'Optional reason…' },
            ],
          },
        };
      }

      if (action === 'submit_standup') {
        const projects = await this.bot.db.query(
          `SELECT ROWID, name FROM ${TABLES.PROJECTS}
           WHERE tenant_id = '${DataStoreService.escape(tenantId)}'
             AND ROWID IN (SELECT project_id FROM ${TABLES.PROJECT_MEMBERS} WHERE tenant_id = '${DataStoreService.escape(tenantId)}' AND user_id = '${DataStoreService.escape(userId)}')
           LIMIT 20`
        );
        return {
          ...parsedReply,
          data: {
            action,
            fields: [
              { key: 'project_id', label: 'Project', type: 'select', required: true,
                options: projects.map((p) => ({ value: String(p.ROWID), label: p.name })) },
              { key: 'yesterday', label: 'What did you do yesterday?', type: 'textarea', required: true,  placeholder: 'Completed the API integration, reviewed PRs…' },
              { key: 'today',     label: 'What will you do today?',   type: 'textarea', required: true,  placeholder: 'Working on the dashboard UI, team sync at 2 pm…' },
              { key: 'blockers',  label: 'Any blockers?',             type: 'textarea', required: false, placeholder: 'None / Waiting on design approval…' },
            ],
          },
        };
      }

      if (action === 'create_task') {
        const projects = await this.bot.db.query(
          `SELECT ROWID, name FROM ${TABLES.PROJECTS}
           WHERE tenant_id = '${DataStoreService.escape(tenantId)}'
             AND ROWID IN (SELECT project_id FROM ${TABLES.PROJECT_MEMBERS} WHERE tenant_id = '${DataStoreService.escape(tenantId)}' AND user_id = '${DataStoreService.escape(userId)}')
           LIMIT 20`
        );
        return {
          ...parsedReply,
          data: {
            action,
            fields: [
              { key: 'title',       label: 'Task Title', type: 'text',   required: true,  placeholder: 'e.g. Fix login page bug' },
              { key: 'project_id',  label: 'Project',    type: 'select', required: true,
                options: projects.map((p) => ({ value: String(p.ROWID), label: p.name })) },
              { key: 'task_priority', label: 'Priority', type: 'select', required: false, default: 'MEDIUM',
                options: [{ value: 'CRITICAL', label: '🔴 Critical' }, { value: 'HIGH', label: '🟠 High' }, { value: 'MEDIUM', label: '🟡 Medium' }, { value: 'LOW', label: '🟢 Low' }] },
              { key: 'type', label: 'Type', type: 'select', required: false, default: 'TASK',
                options: [{ value: 'TASK', label: '📌 Task' }, { value: 'BUG', label: '🐛 Bug' }, { value: 'STORY', label: '📖 Story' }] },
              { key: 'description', label: 'Description', type: 'textarea', required: false, placeholder: 'Optional details…' },
              { key: 'due_date',    label: 'Due Date',    type: 'date',   required: false },
            ],
          },
        };
      }
    } catch (err) {
      console.warn('[BotController] _enrichActionForm — failed (non-fatal):', err.message);
    }
    return parsedReply;
  }

  async _enrichLeaveBalance(userId, tenantId, parsedReply) {
    try {
      const balances = await this.bot.db.query(
        `SELECT lb.allocated_days, lb.used_days, lb.pending_days, lb.remaining_days, lt.name AS type_name
         FROM ${TABLES.LEAVE_BALANCES} lb
         LEFT JOIN ${TABLES.LEAVE_TYPES} lt ON lb.leave_type_id = CAST(lt.ROWID AS CHAR)
         WHERE lb.tenant_id = '${DataStoreService.escape(tenantId)}'
           AND lb.user_id = '${DataStoreService.escape(userId)}'
           AND lb.year = YEAR(CURDATE())
         LIMIT 10`
      );
      return {
        ...parsedReply,
        data: {
          balances: balances.map((b) => ({
            type_name:      b.type_name      || 'Leave',
            allocated_days: parseFloat(b.allocated_days) || 0,
            used_days:      parseFloat(b.used_days)      || 0,
            pending_days:   parseFloat(b.pending_days)   || 0,
            remaining_days: parseFloat(b.remaining_days) || 0,
          })),
        },
      };
    } catch (err) {
      console.warn('[BotController] _enrichLeaveBalance — failed (non-fatal):', err.message);
      return { ...parsedReply, data: { balances: [] } };
    }
  }

  // ─── Action Executors ──────────────────────────────────────────────────────

  async _executeAction(userId, tenantId, action, formData) {
    switch (action) {
      case 'create_leave':   return this._executeCreateLeave(userId, tenantId, formData);
      case 'submit_standup': return this._executeSubmitStandup(userId, tenantId, formData);
      case 'create_task':    return this._executeCreateTask(userId, tenantId, formData);
      default:
        return { type: 'action_executed', content: `Unknown action: ${action}`, data: { success: false, action } };
    }
  }

  async _executeCreateLeave(userId, tenantId, formData) {
    const { leave_type_id, start_date, end_date, reason, is_half_day } = formData;
    if (!leave_type_id || !start_date || !end_date) {
      return { type: 'action_executed', content: 'Missing required fields (leave type, start/end date).', data: { success: false, action: 'create_leave' } };
    }
    if (!/^\d+$/.test(String(leave_type_id))) {
      return { type: 'action_executed', content: `Leave type "${leave_type_id}" could not be resolved to a valid ID.`, data: { success: false, action: 'create_leave' } };
    }
    const startMs = new Date(start_date).getTime();
    const endMs   = new Date(end_date).getTime();
    if (isNaN(startMs) || isNaN(endMs) || endMs < startMs) {
      return { type: 'action_executed', content: 'Invalid dates — end date must be on or after start date.', data: { success: false, action: 'create_leave' } };
    }
    const isHalf    = is_half_day === 'true';
    const diffDays  = Math.round((endMs - startMs) / 86400000) + 1;
    const daysCount = isHalf ? 0.5 : diffDays;

    try {
      const existing = await this.bot.db.query(
        `SELECT ROWID FROM ${TABLES.LEAVE_REQUESTS}
         WHERE tenant_id = '${DataStoreService.escape(tenantId)}'
           AND user_id = '${DataStoreService.escape(userId)}'
           AND status IN ('PENDING','APPROVED')
           AND start_date <= '${DataStoreService.escape(end_date)}'
           AND end_date >= '${DataStoreService.escape(start_date)}'
         LIMIT 1`
      );
      if (existing.length > 0) {
        return { type: 'action_executed', content: 'You already have a leave request overlapping those dates.', data: { success: false, action: 'create_leave' } };
      }
      const inserted = await this.bot.db.insert(TABLES.LEAVE_REQUESTS, {
        tenant_id:     String(tenantId),
        user_id:       String(userId),
        leave_type_id: String(leave_type_id),
        start_date:    String(start_date),
        end_date:      String(end_date),
        days_count:    String(daysCount),
        reason:        String(reason || '').slice(0, 490),
        is_half_day:   String(isHalf),
        status:        'PENDING',
      });
      console.log(`[BotController] _executeCreateLeave ✓ — ${daysCount}d ROWID=${inserted?.ROWID}`);
      return {
        type:    'action_executed',
        content: `Leave request submitted! ${daysCount} day${daysCount !== 1 ? 's' : ''} from ${start_date} to ${end_date} — pending approval.`,
        data: { success: true, action: 'create_leave', id: inserted?.ROWID, start_date, end_date, days_count: daysCount, status: 'PENDING' },
      };
    } catch (err) {
      console.error('[BotController] _executeCreateLeave ✗:', err.message);
      return { type: 'action_executed', content: `Couldn't submit leave: ${err.message}`, data: { success: false, action: 'create_leave' } };
    }
  }

  async _executeSubmitStandup(userId, tenantId, formData) {
    const { project_id, yesterday, today: todayText, blockers } = formData;
    if (!project_id || !yesterday || !todayText) {
      return { type: 'action_executed', content: 'Missing required fields (project, yesterday, today).', data: { success: false, action: 'submit_standup' } };
    }
    const todayDate = DataStoreService.today();
    try {
      const existing = await this.bot.db.query(
        `SELECT ROWID FROM ${TABLES.STANDUP_ENTRIES}
         WHERE tenant_id = '${DataStoreService.escape(tenantId)}'
           AND user_id = '${DataStoreService.escape(userId)}'
           AND project_id = '${DataStoreService.escape(project_id)}'
           AND entry_date = '${todayDate}'
         LIMIT 1`
      );
      if (existing.length > 0) {
        await this.bot.db.update(TABLES.STANDUP_ENTRIES, {
          ROWID:     existing[0].ROWID,
          yesterday: String(yesterday).slice(0, 1990),
          today:     String(todayText).slice(0, 1990),
          blockers:  String(blockers || '').slice(0, 990),
        });
        return { type: 'action_executed', content: "Standup updated for today!", data: { success: true, action: 'submit_standup', updated: true } };
      }
      const inserted = await this.bot.db.insert(TABLES.STANDUP_ENTRIES, {
        tenant_id:    String(tenantId),
        project_id:   String(project_id),
        user_id:      String(userId),
        entry_date:   todayDate,
        yesterday:    String(yesterday).slice(0, 1990),
        today:        String(todayText).slice(0, 1990),
        blockers:     String(blockers || '').slice(0, 990),
        status:       'SUBMITTED',
        submitted_at: new Date().toISOString(),
      });
      console.log(`[BotController] _executeSubmitStandup ✓ — ROWID=${inserted?.ROWID}`);
      return {
        type:    'action_executed',
        content: 'Standup submitted for today! Great work keeping the team updated.',
        data: { success: true, action: 'submit_standup', id: inserted?.ROWID },
      };
    } catch (err) {
      console.error('[BotController] _executeSubmitStandup ✗:', err.message);
      return { type: 'action_executed', content: `Couldn't submit standup: ${err.message}`, data: { success: false, action: 'submit_standup' } };
    }
  }

  async _executeCreateTask(userId, tenantId, formData) {
    const { title, project_id, description, task_priority, type, due_date } = formData;
    if (!title || !project_id) {
      return { type: 'action_executed', content: 'Task title and project are required.', data: { success: false, action: 'create_task' } };
    }
    try {
      const inserted = await this.bot.db.insert(TABLES.TASKS, {
        tenant_id:        String(tenantId),
        project_id:       String(project_id),
        title:            String(title).slice(0, 490),
        description:      String(description || '').slice(0, 1990),
        type:             type       || 'TASK',
        status:           'TODO',
        task_priority:    task_priority || 'MEDIUM',
        assignee_ids:     JSON.stringify([String(userId)]),
        created_by:       String(userId),
        due_date:         due_date || null,
        sprint_id:        '0',
        parent_task_id:   '0',
        story_points:     '0',
        estimated_hours:  '0',
        logged_hours:     '0',
        require_approval: 'false',
        labels:           '[]',
      });
      console.log(`[BotController] _executeCreateTask ✓ — ROWID=${inserted?.ROWID}`);
      return {
        type:    'action_executed',
        content: `Task "${title}" created and assigned to you!`,
        data: { success: true, action: 'create_task', id: inserted?.ROWID, title, status: 'TODO', task_priority: task_priority || 'MEDIUM' },
      };
    } catch (err) {
      console.error('[BotController] _executeCreateTask ✗:', err.message);
      return { type: 'action_executed', content: `Couldn't create task: ${err.message}`, data: { success: false, action: 'create_task' } };
    }
  }

  async _handleCreateTimeEntry(userId, tenantId, parsedReply) {
    const { project_name, project_id, hours, description, is_billable } = parsedReply.data || {};
    const numHours = parseFloat(hours);
    if (!numHours || numHours <= 0 || numHours > 24) {
      return { type: 'text', content: "I couldn't log that — please specify valid hours (e.g. \"I worked 2.5 hours on the API\")." };
    }

    let resolvedProjectId   = null;
    let resolvedProjectName = project_name || null;

    try {
      if (project_id) {
        const rows = await this.bot.db.query(
          `SELECT ROWID, name FROM ${TABLES.PROJECTS}
           WHERE tenant_id = '${DataStoreService.escape(tenantId)}'
             AND ROWID = ${parseInt(project_id, 10)}
           LIMIT 1`
        );
        if (rows.length > 0) { resolvedProjectId = rows[0].ROWID; resolvedProjectName = rows[0].name; }
      }
      if (!resolvedProjectId && project_name) {
        // ZCQL does not support LOWER() — fetch and match in JS
        const rows = await this.bot.db.query(
          `SELECT ROWID, name FROM ${TABLES.PROJECTS}
           WHERE tenant_id = '${DataStoreService.escape(tenantId)}'
           LIMIT 30`
        );
        const pNameLc = project_name.toLowerCase();
        const pMatch  = rows.find((p) => p.name.toLowerCase() === pNameLc || p.name.toLowerCase().includes(pNameLc));
        if (pMatch) { resolvedProjectId = pMatch.ROWID; resolvedProjectName = pMatch.name; }
      }
    } catch (err) {
      console.warn('[BotController] _handleCreateTimeEntry — project lookup failed (non-fatal):', err.message);
    }

    const today = DataStoreService.today();
    try {
      await this.bot.db.insert(TABLES.TIME_ENTRIES, {
        tenant_id:   String(tenantId),
        user_id:     String(userId),
        project_id:  resolvedProjectId ? String(resolvedProjectId) : null,
        entry_date:  today,
        hours:       String(numHours),
        description: String(description || 'Voice time entry').slice(0, 990),
        is_billable: String(is_billable !== false),
        status:      'DRAFT',
      });
      console.log(`[BotController] _handleCreateTimeEntry ✓ — ${numHours}h on "${resolvedProjectName}"`);
      return {
        type:    'time_entry_created',
        content: parsedReply.content || `Logged ${numHours}h${resolvedProjectName ? ` on ${resolvedProjectName}` : ''} — saved as draft.`,
        data: {
          hours:        numHours,
          project_name: resolvedProjectName,
          project_id:   resolvedProjectId,
          description:  description || '',
          is_billable:  is_billable !== false,
          entry_date:   today,
        },
      };
    } catch (err) {
      console.error('[BotController] _handleCreateTimeEntry ✗ — insert failed:', err.message);
      return { type: 'text', content: `I understood the time log but couldn't save it: ${err.message}. Please try again.` };
    }
  }
}

module.exports = BotController;
