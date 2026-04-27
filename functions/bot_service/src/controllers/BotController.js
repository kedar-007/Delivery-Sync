'use strict';

const DataStoreService  = require('../services/DataStoreService');
const BotDataService    = require('../services/BotDataService');
const LLMService        = require('../services/LLMService');
const ModuleScanService = require('../services/ModuleScanService');
const MCPService        = require('../services/MCPService');
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

    // Step 2: load conversation history for context
    console.log('[BotController] message Step 2 — loading conversation history');
    const history = await this.bot.getConversationHistory(userId, tenantId, session_id, 20);
    console.log(`[BotController] message Step 2 ✓ — ${history.length} prior messages loaded`);

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

    // If mid-conversation about an action, keep project + leave data in context every turn
    const lastBotMsg = history.filter((h) => h.role === 'assistant').slice(-1)[0]?.message || '';
    const isActionConv = /leave|standup|task|project|type of leave|what dates|start date|which project/i.test(lastBotMsg);
    if (isActionConv && !projectsForLLM) {
      try {
        projectsForLLM = await this.mcp.buildActionContext(userId, tenantId);
        if (projectsForLLM) console.log('[BotController] message Step 3 — refreshed action context via MCPService');
      } catch (err) {
        console.warn('[BotController] message Step 3 — action context refresh failed:', err.message);
      }
    }

    // For voice time-entry or time-log messages, pre-load the user's project list so the LLM can match names
    if (isVoiceTimeEntry || /log|hour|time entry/i.test(userMessage)) {
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

    const systemPrompt = `You are ${botName}, an AI-powered personal work assistant embedded in DeliverSync — a project management platform.

USER CONTEXT:
- Name: ${userName}
- Role: ${role}
- Today: ${dayOfWeek}, ${today}

PERSONALITY: ${tone}

CURRENT WORKSPACE DATA (live data covering leave, tasks, projects, time tracking, attendance, standup, EOD, team, assets, RAID, sprints, badges, and announcements):
${contextBlock}

CRITICAL RESPONSE RULES — READ CAREFULLY:
1. ALWAYS include the actual data values directly in the "content" field. NEVER say "Here is your X:" without including the actual X.
   BAD: {"type":"text","content":"Here is your attendance this week:"}
   GOOD: {"type":"text","content":"You checked in 4 out of 5 days this week. Mon–Thu all present, no check-in recorded for Friday."}
   BAD: {"type":"text","content":"Here is your billable time for this week:"}
   GOOD: {"type":"text","content":"This week you logged 14.5h total — 10h billable and 4.5h non-billable across 8 entries."}
2. For data queries, give 2–4 concise sentences with the REAL numbers from the workspace data above.
3. Never truncate or defer to a follow-up message. Complete the answer in one response.

RESPONSE FORMAT:
Return ONLY a valid JSON object with no surrounding text or markdown. Use one of these schemas:

For regular responses:
{"type":"text","content":"Your full answer with actual numbers and facts here"}

For daily plan generation:
{"type":"daily_plan","content":"Brief intro (1-2 sentences)","items":[{"title":"...","description":"...","module":"timelogs|standup|tasks|milestones|checkin","todo_priority":"high|medium|low","due_date":"YYYY-MM-DD or null"}]}

For data responses (time, tasks, attendance, project details, etc.) — use this when you have structured data to show:
{"type":"data_response","content":"Natural language summary with actual numbers","data":{"key":"value"}}

For logging a time entry (when user says they worked N hours on something):
{"type":"create_time_entry","content":"Brief confirmation message","data":{"project_name":"<exact project name>","project_id":"<numeric id from project list>","hours":<decimal number>,"description":"<concise work description>","is_billable":true}}
${projectsForLLM}

For showing leave balance (when user asks about leave balance, PTO, days off, vacation days):
{"type":"leave_balance","content":"Here is your current leave balance:"}

CONVERSATIONAL ACTION COLLECTION — VERY IMPORTANT:
When the user wants to apply for leave / take time off / book vacation, submit a standup, or create a task:
- Guide them step by step through conversation. Ask ONE question per reply using {"type":"text","content":"..."}.
- Always list available options from the app data above before asking the user to choose.
- Do NOT show all questions at once. Ask → wait → ask next → wait → execute.
- Once you have every required field, immediately execute using action_execute (no confirmation step needed).

Example flow for leave:
  Turn 1 — user: "apply for leave" → you: list leave types from context and ask which one
  Turn 2 — user picks type → you: ask for start date and end date
  Turn 3 — user gives dates → you: return action_execute immediately

For executing an action once all info is collected through conversation:
{"type":"action_execute","content":"Brief confirmation (e.g. Applying 3 days Annual Leave…)","action":"create_leave|submit_standup|create_task","data":{...all fields...}}

Required data per action:
create_leave   → leave_type_id (numeric ID from context), start_date (YYYY-MM-DD), end_date (YYYY-MM-DD), reason ("" if none), is_half_day ("true"/"false")
submit_standup → project_id (numeric ID), yesterday (text), today (text), blockers ("" if none)
create_task    → title (text), project_id (numeric ID), task_priority (HIGH|MEDIUM|LOW), type (TASK|BUG|STORY), description (""), due_date (YYYY-MM-DD or "")

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
      // Resolve leave_type_id if the LLM returned a name instead of a numeric ID
      if (action === 'create_leave' && resolved.leave_type_id && isNaN(Number(resolved.leave_type_id))) {
        const rows = await this.bot.db.query(
          `SELECT ROWID FROM ${TABLES.LEAVE_TYPES}
           WHERE tenant_id = '${DataStoreService.escape(tenantId)}'
             AND LOWER(name) LIKE '%${DataStoreService.escape(String(resolved.leave_type_id).toLowerCase())}%'
           LIMIT 1`
        );
        if (rows.length > 0) resolved.leave_type_id = String(rows[0].ROWID);
      }

      // Resolve project_id if the LLM returned a name instead of a numeric ID
      if ((action === 'submit_standup' || action === 'create_task') && resolved.project_id && isNaN(Number(resolved.project_id))) {
        const rows = await this.bot.db.query(
          `SELECT ROWID FROM ${TABLES.PROJECTS}
           WHERE tenant_id = '${DataStoreService.escape(tenantId)}'
             AND LOWER(name) LIKE '%${DataStoreService.escape(String(resolved.project_id).toLowerCase())}%'
           LIMIT 1`
        );
        if (rows.length > 0) resolved.project_id = String(rows[0].ROWID);
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
        const rows = await this.bot.db.query(
          `SELECT ROWID, name FROM ${TABLES.PROJECTS}
           WHERE tenant_id = '${DataStoreService.escape(tenantId)}'
             AND LOWER(name) LIKE '%${DataStoreService.escape(project_name.toLowerCase())}%'
           LIMIT 1`
        );
        if (rows.length > 0) { resolvedProjectId = rows[0].ROWID; resolvedProjectName = rows[0].name; }
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
