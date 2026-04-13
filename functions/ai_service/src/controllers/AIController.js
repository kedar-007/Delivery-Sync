'use strict';

const LLMService     = require('../services/LLMService');
const DataService    = require('../services/DataService');
const PromptService  = require('../services/PromptService');
const ResponseHelper = require('../utils/ResponseHelper');
const { AI_RESPONSE_TYPE, AI_SCOPE, ROLES } = require('../constants');

/**
 * AIController — handles all five AI insight endpoints.
 *
 * Each handler follows the same pipeline:
 *   1. Extract + validate request params
 *   2. Resolve role-based data scope
 *   3. Fetch context data via DataService
 *   4. Build prompt via PromptService
 *   5. Call Zoho LLM via LLMService
 *   6. Parse + validate the JSON response
 *   7. Return standardised AI response envelope
 */
class AIController {
  /**
   * @param {object} catalystApp  – Initialised Catalyst SDK instance (req.catalystApp)
   */
  constructor(catalystApp) {
    this.llm  = new LLMService(catalystApp);
    this.data = new DataService(catalystApp);
  }

  // ─── 1. Daily Summary ─────────────────────────────────────────────────────

  /**
   * POST /api/ai/daily-summary
   * Body: { projectId?: string, date?: string }
   *
   * Summarises standup + EOD entries for the given date.
   * Scope: per role — TEAM_MEMBER sees only own; ADMIN/PMO see all.
   */
  async getDailySummary(req, res) {
    try {
      const { tenantId, id: userId, role } = req.currentUser;
      const { projectId, date } = req.body;

      const { projects, projectIds } = await this.data.resolveProjectScope(tenantId, userId, role, projectId);

      if (projectIds.length === 0) {
        return ResponseHelper.aiResponse(res, AI_RESPONSE_TYPE.DAILY_SUMMARY, {
          summary:    'No accessible projects found for this account.',
          highlights: [], blockers: [], suggestions: [], sentiment: 'neutral', missedSubmissions: true,
        }, { date: date || DataService._today(), scope: AI_SCOPE[role] });
      }

      const { standups, eodEntries } = await this.data.getDailyActivityData(
        tenantId, userId, role, projectIds, date
      );

      const prompt = PromptService.buildDailySummaryPrompt({
        date: date || DataService._today(),
        projects,
        standups,
        eodEntries,
        scope: AI_SCOPE[role],
      });

      const { response: rawText, usage } = await this.llm.call(prompt, PromptService.SYSTEM_PROMPT);
      const parsed = this._parseJSON(rawText, {
        summary: rawText, highlights: [], blockers: [], suggestions: [], sentiment: 'neutral', missedSubmissions: false,
      });

      return ResponseHelper.aiResponse(res, AI_RESPONSE_TYPE.DAILY_SUMMARY, parsed, {
        date:        date || DataService._today(),
        projectCount: projectIds.length,
        standupCount: standups.length,
        eodCount:     eodEntries.length,
        tokensUsed:   usage.total_tokens,
        scope:        AI_SCOPE[role],
      });

    } catch (err) {
      console.error('[AIController.getDailySummary]', err.message);
      return this._errorResponse(res, err);
    }
  }

  // ─── 2. Project Health ────────────────────────────────────────────────────

  /**
   * POST /api/ai/project-health
   * Body: { projectId?: string }
   *
   * Analyses task completion, blockers, and milestone progress to produce
   * a health classification: On Track | At Risk | Delayed.
   */
  async getProjectHealth(req, res) {
    try {
      const { tenantId, id: userId, role } = req.currentUser;
      const { projectId } = req.body;

      // EXEC and CLIENT only get summary-level data — no detailed team records
      if (role === ROLES.CLIENT && !projectId) {
        return ResponseHelper.validationError(res, 'Clients must specify a projectId.');
      }

      const { projects, projectIds } = await this.data.resolveProjectScope(tenantId, userId, role, projectId);

      if (projectIds.length === 0) {
        return ResponseHelper.notFound(res, 'No accessible projects found.');
      }

      const { milestones, actions, blockers, standupCount } =
        await this.data.getProjectHealthData(tenantId, projectIds);

      const prompt = PromptService.buildProjectHealthPrompt({ projects, milestones, actions, blockers, standupCount });

      const { response: rawText, usage } = await this.llm.call(
        prompt, PromptService.SYSTEM_PROMPT, { max_tokens: 500 }
      );

      const parsed = this._parseJSON(rawText, {
        overallStatus:   'Unknown',
        score:           50,
        projects:        projects.map((p) => ({ name: p.name, status: 'Unknown', ragStatus: p.rag_status })),
        reasons:         [],
        recommendations: [],
        riskFlags:       [],
      });

      return ResponseHelper.aiResponse(res, AI_RESPONSE_TYPE.PROJECT_HEALTH, parsed, {
        projectCount:    projectIds.length,
        actionCount:     actions.length,
        blockerCount:    blockers.length,
        milestoneCount:  milestones.length,
        tokensUsed:      usage.total_tokens,
        scope:           AI_SCOPE[role],
      });

    } catch (err) {
      console.error('[AIController.getProjectHealth]', err.message);
      return this._errorResponse(res, err);
    }
  }

  // ─── 3. Team Performance ─────────────────────────────────────────────────

  /**
   * POST /api/ai/performance
   * Body: { projectId?: string, days?: number }
   *
   * Generates per-member performance insights.
   * TEAM_MEMBER only sees their own data.
   */
  async getPerformance(req, res) {
    try {
      const { tenantId, id: userId, role } = req.currentUser;
      const { projectId, days: rawDays } = req.body;
      const days = Math.min(Math.max(parseInt(rawDays, 10) || 7, 1), 30);

      const { projects, projectIds } = await this.data.resolveProjectScope(tenantId, userId, role, projectId);

      if (projectIds.length === 0) {
        return ResponseHelper.notFound(res, 'No accessible projects found.');
      }

      const { activityByMember } = await this.data.getPerformanceData(
        tenantId, userId, role, projectIds, days
      );

      if (Object.keys(activityByMember).length === 0) {
        return ResponseHelper.aiResponse(res, AI_RESPONSE_TYPE.PERFORMANCE, {
          teamSummary: 'No activity data found for the selected period.',
          members: [], topPerformer: null, teamMorale: 'Unknown', alerts: [],
        }, { days, scope: AI_SCOPE[role] });
      }

      const prompt = PromptService.buildPerformancePrompt({
        activityByMember,
        days,
        scope: AI_SCOPE[role],
      });

      const { response: rawText, usage } = await this.llm.call(
        prompt, PromptService.SYSTEM_PROMPT, { max_tokens: 600 }
      );

      const parsed = this._parseJSON(rawText, {
        teamSummary: rawText, members: [], topPerformer: null, teamMorale: 'Unknown', alerts: [],
      });

      return ResponseHelper.aiResponse(res, AI_RESPONSE_TYPE.PERFORMANCE, parsed, {
        days,
        memberCount: Object.keys(activityByMember).length,
        tokensUsed:  usage.total_tokens,
        scope:       AI_SCOPE[role],
      });

    } catch (err) {
      console.error('[AIController.getPerformance]', err.message);
      return this._errorResponse(res, err);
    }
  }

  // ─── 4. AI Report ────────────────────────────────────────────────────────

  /**
   * POST /api/ai/report
   * Body: { projectId?: string, type: 'daily'|'weekly'|'project', dateFrom?: string, dateTo?: string }
   *
   * Generates a structured report (daily / weekly / project summary).
   */
  async generateReport(req, res) {
    try {
      const { tenantId, id: userId, role } = req.currentUser;
      const { projectId, type = 'weekly', dateFrom, dateTo } = req.body;

      const validTypes = ['daily', 'weekly', 'project'];
      if (!validTypes.includes(type)) {
        return ResponseHelper.validationError(res, `type must be one of: ${validTypes.join(', ')}`);
      }

      const { projects, projectIds } = await this.data.resolveProjectScope(tenantId, userId, role, projectId);

      if (projectIds.length === 0) {
        return ResponseHelper.notFound(res, 'No accessible projects found.');
      }

      const reportData = await this.data.getReportData(
        tenantId, userId, role, projectIds, { dateFrom, dateTo, type }
      );

      const prompt = PromptService.buildReportPrompt({
        type,
        projects,
        ...reportData,
      });

      const { response: rawText, usage } = await this.llm.call(
        prompt, PromptService.SYSTEM_PROMPT, { max_tokens: 700 }
      );

      const parsed = this._parseJSON(rawText, {
        title:            `${type.charAt(0).toUpperCase() + type.slice(1)} Report`,
        period:           `${reportData.dateFrom} to ${reportData.dateTo}`,
        executiveSummary: rawText,
        keyAchievements:  [],
        challenges:       [],
        actionableItems:  [],
        metrics:          { overallHealth: 'Unknown', completionRate: '0%', teamEngagement: 'Unknown' },
        outlook:          '',
      });

      return ResponseHelper.aiResponse(res, AI_RESPONSE_TYPE.REPORT, parsed, {
        reportType:   type,
        dateFrom:     reportData.dateFrom,
        dateTo:       reportData.dateTo,
        projectCount: projectIds.length,
        tokensUsed:   usage.total_tokens,
        scope:        AI_SCOPE[role],
      });

    } catch (err) {
      console.error('[AIController.generateReport]', err.message);
      return this._errorResponse(res, err);
    }
  }

  // ─── 5. Smart Suggestions ────────────────────────────────────────────────

  /**
   * POST /api/ai/suggestions
   * Body: { projectId?: string }
   *
   * Returns prioritised suggestions across productivity, risk, and resources.
   */
  async getSuggestions(req, res) {
    try {
      const { tenantId, id: userId, role } = req.currentUser;
      const { projectId } = req.body;

      const { projects, projectIds } = await this.data.resolveProjectScope(tenantId, userId, role, projectId);

      if (projectIds.length === 0) {
        return ResponseHelper.notFound(res, 'No accessible projects found.');
      }

      const suggestionsData = await this.data.getSuggestionsData(tenantId, projectIds);

      const prompt = PromptService.buildSuggestionsPrompt({ ...suggestionsData, projects });

      const { response: rawText, usage } = await this.llm.call(
        prompt, PromptService.SYSTEM_PROMPT, { max_tokens: 550 }
      );

      const parsed = this._parseJSON(rawText, {
        productivity:       [],
        riskMitigation:     [],
        resourceAllocation: [],
        overallRiskLevel:   'unknown',
        immediateActions:   [],
      });

      return ResponseHelper.aiResponse(res, AI_RESPONSE_TYPE.SUGGESTIONS, parsed, {
        projectCount:      projectIds.length,
        openBlockers:      suggestionsData.openBlockers?.length ?? 0,
        overdueActions:    suggestionsData.overdueActions?.length ?? 0,
        delayedMilestones: suggestionsData.delayedMilestones?.length ?? 0,
        tokensUsed:        usage.total_tokens,
        scope:             AI_SCOPE[role],
      });

    } catch (err) {
      console.error('[AIController.getSuggestions]', err.message);
      return this._errorResponse(res, err);
    }
  }

  // ─── 6. Blocker Detection ────────────────────────────────────────────────

  /**
   * POST /api/ai/detect-blockers
   * Body: { projectId?: string, days?: number }
   *
   * Detects explicit and implicit blockers from recent standup/EOD text.
   */
  async detectBlockers(req, res) {
    try {
      const { tenantId, id: userId, role } = req.currentUser;
      const { projectId, days: rawDays } = req.body;
      const days = Math.min(Math.max(parseInt(rawDays, 10) || 7, 1), 30);

      const { projects, projectIds } = await this.data.resolveProjectScope(tenantId, userId, role, projectId);
      if (projectIds.length === 0) return ResponseHelper.notFound(res, 'No accessible projects found.');

      const { standups, eods, existingBlockers } = await this.data.getBlockerDetectionData(
        tenantId, userId, role, projectIds, days
      );

      const prompt = PromptService.buildBlockerDetectionPrompt({ standups, eods, existingBlockers, projects });

      const { response: rawText, usage } = await this.llm.call(
        prompt, PromptService.SYSTEM_PROMPT, { max_tokens: 600 }
      );

      const parsed = this._parseJSON(rawText, {
        blockers: [], summary: '', critical_count: 0, requires_immediate_action: false,
      });

      return ResponseHelper.aiResponse(res, AI_RESPONSE_TYPE.BLOCKER_DETECTION, parsed.data ?? parsed, {
        days, projectCount: projectIds.length, tokensUsed: usage.total_tokens, scope: AI_SCOPE[role],
      });

    } catch (err) {
      console.error('[AIController.detectBlockers]', err.message);
      return this._errorResponse(res, err);
    }
  }

  // ─── 7. Trend Analysis ───────────────────────────────────────────────────

  /**
   * POST /api/ai/trends
   * Body: { projectId?: string, days?: number }
   *
   * Analyses historical data for productivity, engagement, and blocker trends.
   */
  async analyzeTrends(req, res) {
    try {
      const { tenantId, id: userId, role } = req.currentUser;
      const { projectId, days: rawDays } = req.body;
      const days = Math.min(Math.max(parseInt(rawDays, 10) || 14, 7), 90);

      const { projects, projectIds } = await this.data.resolveProjectScope(tenantId, userId, role, projectId);
      if (projectIds.length === 0) return ResponseHelper.notFound(res, 'No accessible projects found.');

      const { standups, eods, actions, blockers } = await this.data.getTrendData(
        tenantId, userId, role, projectIds, days
      );

      const prompt = PromptService.buildTrendAnalysisPrompt({ standups, eods, actions, blockers, days, projects });

      const { response: rawText, usage } = await this.llm.call(
        prompt, PromptService.SYSTEM_PROMPT, { max_tokens: 550 }
      );

      const parsed = this._parseJSON(rawText, {
        productivityTrend: 'stable', engagementTrend: 'stable', moodTrend: 'stable',
        delayedTaskTrend: 'stable', recurringBlockers: [], riskAreas: [],
        insights: [], recommendations: [], period: `${days} days`,
      });

      return ResponseHelper.aiResponse(res, AI_RESPONSE_TYPE.TREND_ANALYSIS, parsed.data ?? parsed, {
        days, projectCount: projectIds.length, tokensUsed: usage.total_tokens, scope: AI_SCOPE[role],
      });

    } catch (err) {
      console.error('[AIController.analyzeTrends]', err.message);
      return this._errorResponse(res, err);
    }
  }

  // ─── 8. Sprint Retrospective ─────────────────────────────────────────────

  /**
   * POST /api/ai/retrospective
   * Body: { projectId?: string, sprintStart?: string, sprintEnd?: string }
   *
   * Generates what-went-well / what-went-wrong / action items for a sprint period.
   */
  async generateRetrospective(req, res) {
    try {
      const { tenantId, id: userId, role } = req.currentUser;
      const { projectId, sprintStart, sprintEnd } = req.body;

      const { projects, projectIds } = await this.data.resolveProjectScope(tenantId, userId, role, projectId);
      if (projectIds.length === 0) return ResponseHelper.notFound(res, 'No accessible projects found.');

      const retroData = await this.data.getRetrospectiveData(
        tenantId, userId, role, projectIds, { sprintStart, sprintEnd }
      );

      const prompt = PromptService.buildRetrospectivePrompt({ ...retroData, projects });

      const { response: rawText, usage } = await this.llm.call(
        prompt, PromptService.SYSTEM_PROMPT, { max_tokens: 650 }
      );

      const parsed = this._parseJSON(rawText, {
        sprintSummary: '', wentWell: [], wentWrong: [], actionItems: [],
        velocityScore: 50, teamMorale: 'Medium', keyLearning: '',
      });

      return ResponseHelper.aiResponse(res, AI_RESPONSE_TYPE.RETROSPECTIVE, parsed.data ?? parsed, {
        sprintStart: retroData.sprintStart,
        sprintEnd:   retroData.sprintEnd,
        projectCount: projectIds.length,
        tokensUsed:   usage.total_tokens,
        scope:        AI_SCOPE[role],
      });

    } catch (err) {
      console.error('[AIController.generateRetrospective]', err.message);
      return this._errorResponse(res, err);
    }
  }

  // ─── 9. Natural Language Query ───────────────────────────────────────────

  /**
   * POST /api/ai/query
   * Body: { query: string, projectId?: string }
   *
   * Answers free-text questions like "Which project is at risk?" using project context.
   */
  async naturalLanguageQuery(req, res) {
    try {
      const { tenantId, id: userId, role } = req.currentUser;
      const { query, projectId } = req.body;

      if (!query || typeof query !== 'string' || query.trim().length < 3) {
        return ResponseHelper.validationError(res, 'query must be at least 3 characters.');
      }

      const { projects, projectIds } = await this.data.resolveProjectScope(tenantId, userId, role, projectId);
      if (projectIds.length === 0) return ResponseHelper.notFound(res, 'No accessible projects found.');

      // Cap projects sent to context builder to avoid oversized prompts
      const contextProjects = projects.slice(0, 5);
      const context = await this.data.getNLQueryContext(tenantId, contextProjects);

      const prompt = PromptService.buildNLQueryPrompt({ query: query.trim(), ...context });

      // Guard: reject prompt before sending if it's still over 14 000 chars (~5 600 tokens)
      if (prompt.length > 14000) {
        console.warn(`[AIController.naturalLanguageQuery] Prompt too large (${prompt.length} chars), truncating context.`);
      }

      const { response: rawText, usage } = await this.llm.call(
        prompt, PromptService.SYSTEM_PROMPT, { max_tokens: 400 }
      );

      const parsed = this._parseJSON(rawText, {
        answer: rawText, confidence: 'low', supportingData: [], followUpSuggestions: [],
      });

      return ResponseHelper.aiResponse(res, AI_RESPONSE_TYPE.NL_QUERY, parsed.data ?? parsed, {
        query:        query.trim(),
        projectCount: projectIds.length,
        tokensUsed:   usage.total_tokens,
        scope:        AI_SCOPE[role],
      });

    } catch (err) {
      console.error('[AIController.naturalLanguageQuery]', err.message);
      return this._errorResponse(res, err);
    }
  }

  // ─── 10. Voice Transcript Processing ─────────────────────────────────────

  /**
   * POST /api/ai/process-voice
   * Body: { transcript: string, type: 'standup'|'eod', projectId?: string, date?: string }
   *
   * Converts a voice transcript into structured standup/EOD fields + AI insights.
   * Used by the frontend to auto-fill forms from voice recordings.
   */
  async processVoice(req, res) {
    try {
      const { transcript, type, projectId, date } = req.body;

      if (!transcript || typeof transcript !== 'string' || transcript.trim().length < 10) {
        return ResponseHelper.validationError(res, 'transcript must be at least 10 characters.');
      }
      if (!['standup', 'eod'].includes(type)) {
        return ResponseHelper.validationError(res, 'type must be "standup" or "eod".');
      }

      const prompt = PromptService.buildVoiceProcessPrompt({ transcript, type });

      const { response: rawText, usage } = await this.llm.call(
        prompt, PromptService.SYSTEM_PROMPT, { max_tokens: 500 }
      );

      const standupDefaults = {
        summary: '',
        yesterday: '',
        today: '',
        blockers: '',
        insights: { keyHighlights: [], risks: [], sentiment: 'neutral', productivityScore: 50, suggestions: [] },
      };

      const eodDefaults = {
        summary: '',
        accomplishments: '',
        plan_for_tomorrow: '',
        blockers: '',
        mood: 'GREEN',
        insights: { keyHighlights: [], risks: [], sentiment: 'neutral', productivityScore: 50, suggestions: [] },
      };

      const parsed = this._parseJSON(rawText, type === 'standup' ? standupDefaults : eodDefaults);

      // Ensure insights sub-object is always present with correct shape
      if (!parsed.insights || typeof parsed.insights !== 'object') {
        parsed.insights = type === 'standup' ? standupDefaults.insights : eodDefaults.insights;
      }

      return ResponseHelper.aiResponse(res, 'voice_processed', parsed, {
        type,
        transcriptLength: transcript.length,
        projectId: projectId || null,
        date: date || AIController._today(),
        tokensUsed: usage.total_tokens,
      });

    } catch (err) {
      console.error('[AIController.processVoice]', err.message);
      return this._errorResponse(res, err);
    }
  }

  // ─── 11. Task Insight ────────────────────────────────────────────────────

  /**
   * POST /api/ai/task-insight
   * Body: { title, description?, status?, priority?, dueDate?, taskId? }
   *
   * Generates a concise AI insight for a single task: complexity, approach,
   * potential blockers, and estimated effort.
   */
  async getTaskInsight(req, res) {
    try {
      const { title, description, status, priority, dueDate, taskId } = req.body;
      if (!title) return ResponseHelper.validationError(res, 'title is required');

      const prompt = `You are a smart project management assistant. Analyze this task and give concise, actionable insights in plain text (no JSON, no markdown headers, just 3-4 short paragraphs or bullet points):

Task: ${title}
Status: ${status || 'TODO'}
Priority: ${priority || 'MEDIUM'}
Due Date: ${dueDate || 'Not set'}
Description: ${description || 'No description provided'}

Cover:
- Brief complexity/risk assessment
- Suggested next steps (2-3 points)
- Potential blockers to watch
- Estimated effort (Quick/Medium/Complex)

Keep it under 120 words and practical.`;

      const { response: rawText } = await this.llm.call(
        prompt, PromptService.SYSTEM_PROMPT, { max_tokens: 250 }
      );

      return ResponseHelper.success(res, { insight: rawText, taskId: taskId || null });
    } catch (err) {
      console.error('[AIController.getTaskInsight]', err.message);
      return this._errorResponse(res, err);
    }
  }

  // ─── 12. Holistic Performance Analysis ───────────────────────────────────

  /**
   * POST /api/ai/holistic-performance
   * Body: { targetUserId?: string, days?: number (7|30|90) }
   *
   * Analyses performance across ALL modules: tasks, attendance, leave,
   * time tracking, standups, EODs, actions, and blockers.
   * Returns per-member star ratings (1–5) + detailed factor breakdown.
   */
  async getHolisticPerformance(req, res) {
    try {
      const { tenantId, id: userId, role } = req.currentUser;
      const { targetUserId, days: rawDays } = req.body;
      const days = [7, 30, 90].includes(parseInt(rawDays, 10)) ? parseInt(rawDays, 10) : 7;

      const { memberData, since } = await this.data.getHolisticPerformanceData(
        tenantId, userId, role, targetUserId || null, days
      );

      if (Object.keys(memberData).length === 0) {
        return ResponseHelper.aiResponse(res, 'holistic_performance', {
          teamSummary: 'No member data found for the selected period.',
          members: [], topPerformer: null, teamMorale: 'Unknown', alerts: [],
        }, { days, scope: AI_SCOPE[role] });
      }

      const prompt = PromptService.buildHolisticPerformancePrompt({
        memberData,
        days,
        scope: AI_SCOPE[role],
      });

      // Scale max_tokens with member count — each member needs ~250 tokens for
      // factors + issues + strengths + suggestions. Minimum 1000, cap at 4000.
      const memberCount = Object.keys(memberData).length;
      const maxTokens = Math.min(4000, Math.max(1000, memberCount * 250 + 500));
      console.log(`[AIController.getHolisticPerformance] memberCount=${memberCount} maxTokens=${maxTokens}`);

      const { response: rawText, usage } = await this.llm.call(
        prompt, PromptService.SYSTEM_PROMPT, { max_tokens: maxTokens }
      );

      const parsed = this._parseJSON(rawText, this._buildRuleBasedAnalysis(memberData, days));

      return ResponseHelper.aiResponse(res, 'holistic_performance', parsed, {
        days,
        since,
        memberCount: Object.keys(memberData).length,
        tokensUsed:  usage.total_tokens,
        scope:       AI_SCOPE[role],
      });

    } catch (err) {
      console.error('[AIController.getHolisticPerformance]', err.message);
      return this._errorResponse(res, err);
    }
  }

  // ─── 13. Sprint Analysis ──────────────────────────────────────────────────

  /**
   * POST /api/ai/sprint-analysis
   * Body: { sprintId: string }
   *
   * Analyses a specific sprint: velocity, task completion, team health,
   * and produces a star rating + actionable recommendations.
   */
  async getSprintAnalysis(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { sprintId } = req.body;

      if (!sprintId) {
        return ResponseHelper.validationError(res, 'sprintId is required');
      }

      const sprintData = await this.data.getSprintAnalysisData(tenantId, sprintId);

      if (!sprintData.sprint) {
        return ResponseHelper.notFound(res, 'Sprint not found');
      }

      const prompt = PromptService.buildSprintAnalysisPrompt(sprintData);

      const { response: rawText, usage } = await this.llm.call(
        prompt, PromptService.SYSTEM_PROMPT, { max_tokens: 600 }
      );

      const parsed = this._parseJSON(rawText, {
        starRating: 3,
        score: 60,
        sprintSummary: rawText,
        completionRate: `${sprintData.taskMetrics.total > 0
          ? Math.round((sprintData.taskMetrics.done / sprintData.taskMetrics.total) * 100) : 0}%`,
        velocityScore: sprintData.taskMetrics.completedStoryPoints,
        insights: [],
        risks: [],
        recommendations: [],
        memberHighlights: [],
        sprintHealth: 'Unknown',
      });

      return ResponseHelper.aiResponse(res, 'sprint_analysis', parsed, {
        sprintId,
        taskCount:   sprintData.taskMetrics.total,
        tokensUsed:  usage.total_tokens,
      });

    } catch (err) {
      console.error('[AIController.getSprintAnalysis]', err.message);
      return this._errorResponse(res, err);
    }
  }

  // ─── Private: Rule-based performance fallback ────────────────────────────

  /**
   * Computes a fully rule-based holistic performance result from raw memberData.
   * Used as the _parseJSON fallback so the UI always gets meaningful data even
   * when the LLM response is unparseable.
   */
  _buildRuleBasedAnalysis(memberData, days) {
    const workdaysInPeriod = Math.round(days * (5 / 7));

    const members = Object.values(memberData).map((m) => {
      // ── Factor scores ────────────────────────────────────────────────────
      const engagementScore = workdaysInPeriod > 0
        ? Math.min(100, Math.round((m.standupCount / workdaysInPeriod) * 100))
        : 0;

      const taskScore = m.tasksTotal > 0
        ? Math.round((m.tasksDone / m.tasksTotal) * 100)
        : 50; // no tasks assigned → neutral

      const attendanceScore = workdaysInPeriod > 0
        ? Math.min(100, Math.round((m.attendanceDays / workdaysInPeriod) * 100))
        : (m.avgWorkHours >= 6 ? 80 : 50);

      const expectedHours = days * 6; // ~6 billable hours per day
      const timeScore = expectedHours > 0
        ? Math.min(100, Math.round((m.hoursLogged / expectedHours) * 100))
        : 50;

      const accountabilityScore = m.actionsTotal > 0
        ? Math.round((m.actionsDone / m.actionsTotal) * 100)
        : 70; // no actions assigned → not penalised

      // ── Weighted overall score ───────────────────────────────────────────
      const score = Math.round(
        engagementScore   * 0.25 +
        taskScore         * 0.25 +
        attendanceScore   * 0.20 +
        timeScore         * 0.15 +
        accountabilityScore * 0.15
      );
      const starRating = score >= 90 ? 5 : score >= 75 ? 4 : score >= 60 ? 3 : score >= 40 ? 2 : 1;

      // ── Issues ───────────────────────────────────────────────────────────
      const issues = [];
      const missedStandups = workdaysInPeriod - m.standupCount;
      if (engagementScore < 60) {
        issues.push({
          problem:  'Low standup engagement',
          evidence: `Submitted ${m.standupCount} of ~${workdaysInPeriod} expected standups (${engagementScore}%) over ${days} days.`,
          severity: engagementScore < 30 ? 'high' : 'medium',
        });
      }
      if (m.tasksOverdue > 0) {
        issues.push({
          problem:  'Overdue tasks',
          evidence: `${m.tasksOverdue} task(s) are past their due date.`,
          severity: m.tasksOverdue >= 3 ? 'high' : 'medium',
        });
      }
      if (taskScore < 50 && m.tasksTotal > 0) {
        issues.push({
          problem:  'Low task completion rate',
          evidence: `Completed ${m.tasksDone} of ${m.tasksTotal} assigned tasks (${taskScore}%).`,
          severity: 'medium',
        });
      }
      if (timeScore < 40 && expectedHours > 0) {
        issues.push({
          problem:  'Insufficient time logging',
          evidence: `Logged ${m.hoursLogged}h against an expected ~${expectedHours}h for the period.`,
          severity: 'low',
        });
      }

      // ── Strengths ────────────────────────────────────────────────────────
      const strengths = [];
      if (engagementScore >= 80) strengths.push(`Consistent standup attendance — ${m.standupCount} submissions in ${days} days (${engagementScore}%).`);
      if (taskScore >= 80)       strengths.push(`Strong task completion rate of ${taskScore}% (${m.tasksDone}/${m.tasksTotal} tasks).`);
      if (m.storyPointsDone > 0) strengths.push(`Delivered ${m.storyPointsDone} story points this period.`);
      if (accountabilityScore >= 80 && m.actionsTotal > 0)
        strengths.push(`High accountability — closed ${m.actionsDone} of ${m.actionsTotal} action items.`);
      if (strengths.length === 0) strengths.push('Continued participation in team activities.');

      // ── Areas of improvement ─────────────────────────────────────────────
      const areasOfImprovement = [];
      if (engagementScore < 70)  areasOfImprovement.push('Daily standup consistency');
      if (taskScore < 70)        areasOfImprovement.push('Task completion velocity');
      if (m.tasksOverdue > 0)    areasOfImprovement.push('Clearing overdue task backlog');
      if (timeScore < 50)        areasOfImprovement.push('Regular time log entries');
      if (accountabilityScore < 60 && m.actionsTotal > 0) areasOfImprovement.push('Action item follow-through');

      // ── Suggestions ──────────────────────────────────────────────────────
      const suggestions = [];
      if (missedStandups > 2) suggestions.push(`Set a recurring 9 AM standup reminder — ${m.name} missed ${missedStandups} standups this period.`);
      if (m.tasksOverdue > 0) suggestions.push(`Schedule a 30-min backlog review to reprioritise ${m.tasksOverdue} overdue task(s) before the next sprint.`);
      if (taskScore < 60)     suggestions.push('Break large tasks into sub-tasks of 2–4 hours to improve daily throughput.');
      if (timeScore < 40)     suggestions.push('Enable weekly time-log reminders — consistent logging improves billing accuracy and workload visibility.');
      if (accountabilityScore < 60 && m.actionsTotal > 0)
        suggestions.push(`Follow up on ${m.actionsTotal - m.actionsDone} open action item(s) — consider a weekly 1:1 to clear blockers.`);
      if (suggestions.length === 0) suggestions.push('Maintain current performance and consider taking on a mentoring role for newer team members.');

      // ── Summary sentence ─────────────────────────────────────────────────
      const label = score >= 90 ? 'exceptional' : score >= 75 ? 'good' : score >= 60 ? 'satisfactory' : score >= 40 ? 'below average' : 'poor';
      const performanceSummary =
        `${m.name} shows ${label} performance over the last ${days} days. ` +
        `Completed ${m.tasksDone}/${m.tasksTotal} tasks` +
        (m.storyPointsDone > 0 ? ` (${m.storyPointsDone} story pts)` : '') +
        `, submitted ${m.standupCount} standups, and logged ${m.hoursLogged}h.` +
        (m.tasksOverdue > 0 ? ` Has ${m.tasksOverdue} overdue task(s) requiring attention.` : '');

      return {
        name: m.name,
        starRating,
        score,
        performanceSummary,
        factors: [
          { name: 'Engagement',       score: engagementScore,    detail: `${m.standupCount} standups in ${days} days (${engagementScore}%)` },
          { name: 'Task Delivery',    score: taskScore,          detail: `${m.tasksDone}/${m.tasksTotal} tasks done${m.tasksOverdue > 0 ? `, ${m.tasksOverdue} overdue` : ''}` },
          { name: 'Attendance',       score: attendanceScore,    detail: `${m.attendanceDays} days logged, avg ${m.avgWorkHours}h/day` },
          { name: 'Time Management',  score: timeScore,          detail: `${m.hoursLogged}h time logged` },
          { name: 'Accountability',   score: accountabilityScore, detail: `${m.actionsDone}/${m.actionsTotal} actions closed` },
        ],
        issues,
        strengths,
        areasOfImprovement,
        suggestions,
      };
    });

    const best = members.length > 1
      ? members.reduce((b, m) => (m.score > b.score ? m : b), members[0])
      : null;
    const avgScore = members.reduce((s, m) => s + m.score, 0) / (members.length || 1);

    return {
      teamSummary: members.length === 1
        ? members[0].performanceSummary
        : `Team of ${members.length} analysed over ${days} days. Average score: ${Math.round(avgScore)}/100.`,
      members,
      topPerformer: best ? best.name : null,
      teamMorale: avgScore >= 75 ? 'High' : avgScore >= 50 ? 'Medium' : 'Low',
      alerts: members
        .filter((m) => m.issues.some((i) => i.severity === 'high'))
        .map((m) => `${m.name} has high-severity performance issues requiring attention.`),
    };
  }

  // ─── Private: Error Handler ──────────────────────────────────────────────

  /**
   * Shared catch-block handler. Distinguishes LLM failures (upstream 5xx) from
   * application errors so the frontend receives an actionable message rather than
   * a generic 500.
   */
  _errorResponse(res, err) {
    if (err.llmError) {
      return res.status(503).json({
        success:   false,
        message:   'AI service temporarily unavailable. Please try again in a moment.',
        retryable: true,
      });
    }
    return ResponseHelper.serverError(res, err.message);
  }

  // ─── Private: JSON Parser ────────────────────────────────────────────────

  /**
   * Attempts to parse the LLM's raw text as JSON with multi-pass repair.
   * Falls back to `defaults` if all attempts fail.
   */
  _parseJSON(rawText, defaults = {}) {
    if (!rawText || typeof rawText !== 'string') return defaults;

    // Pass 1 — strip markdown fences and leading/trailing prose
    let cleaned = rawText
      .replace(/```(?:json)?[\s\S]*?```/g, (m) => m.replace(/```(?:json)?/g, '').replace(/```/g, ''))
      .replace(/```(?:json)?/g, '')
      .replace(/```/g, '')
      .trim();

    // Extract the outermost balanced JSON object (handles prose before/after)
    const firstBrace = cleaned.indexOf('{');
    const lastBrace  = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }

    // Pass 2 — try clean parse
    try { return JSON.parse(cleaned); } catch (_) { /* fall through */ }

    // Pass 3 — repair common Qwen/Zoho output issues
    try {
      const repaired = cleaned
        .replace(/,\s*([}\]])/g, '$1')                          // trailing commas
        .replace(/([{,\[]\s*)(\w[\w\d]*)\s*:/g, '$1"$2":')     // unquoted keys
        .replace(/:\s*'([^'\\]*(\\.[^'\\]*)*)'/g, ': "$1"')    // single-quoted values
        .replace(/\n/g, '\\n')                                  // literal newlines inside strings
        .replace(/\r/g, '')                                     // carriage returns
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');   // stray control chars
      return JSON.parse(repaired);
    } catch (_) { /* fall through */ }

    // Pass 4 — last resort: re-extract after repair in case new braces were shifted
    try {
      const reExtract = cleaned
        .replace(/,(\s*[}\]])/g, '$1')
        .replace(/:\s*undefined\b/g, ': null');
      const s = reExtract.indexOf('{');
      const e = reExtract.lastIndexOf('}');
      if (s !== -1 && e > s) return JSON.parse(reExtract.slice(s, e + 1));
    } catch (_) { /* fall through */ }

    console.warn('[AIController] Could not parse LLM response as JSON, using defaults. Raw (first 300):', rawText.slice(0, 300));
    return { ...defaults, rawResponse: rawText };
  }
}

// Static helper exposed for use in controller without instantiation
AIController._today = () => new Date().toISOString().slice(0, 10);

module.exports = AIController;
