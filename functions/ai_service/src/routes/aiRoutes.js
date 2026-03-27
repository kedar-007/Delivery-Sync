'use strict';

const express      = require('express');
const asyncHandler = require('express-async-handler');
const AuthMiddleware = require('../middleware/AuthMiddleware');
const AIController   = require('../controllers/AIController');

const router = express.Router();
const auth   = AuthMiddleware.authenticate;

/**
 * Factory: creates a fresh AIController per request so each controller gets
 * its own catalystApp (and therefore its own cache segment handle).
 */
const ctrl = (req) => new AIController(req.catalystApp);

// ─── AI Endpoints (all require authentication) ────────────────────────────────

/**
 * POST /api/ai/daily-summary
 * Body: { projectId?: string, date?: string (YYYY-MM-DD) }
 * Returns: daily activity summary, highlights, blockers, sentiment
 */
router.post('/daily-summary', auth, asyncHandler((req, res) =>
  ctrl(req).getDailySummary(req, res)
));

/**
 * POST /api/ai/project-health
 * Body: { projectId?: string }
 * Returns: health status (On Track / At Risk / Delayed), reasons, recommendations
 */
router.post('/project-health', auth, asyncHandler((req, res) =>
  ctrl(req).getProjectHealth(req, res)
));

/**
 * POST /api/ai/performance
 * Body: { projectId?: string, days?: number (default 7, max 30) }
 * Returns: per-member performance summary, strengths, areas of improvement
 */
router.post('/performance', auth, asyncHandler((req, res) =>
  ctrl(req).getPerformance(req, res)
));

/**
 * POST /api/ai/report
 * Body: { projectId?: string, type: 'daily'|'weekly'|'project', dateFrom?: string, dateTo?: string }
 * Returns: structured AI-generated report with executive summary and metrics
 */
router.post('/report', auth, asyncHandler((req, res) =>
  ctrl(req).generateReport(req, res)
));

/**
 * POST /api/ai/suggestions
 * Body: { projectId?: string }
 * Returns: prioritised suggestions (productivity, risk mitigation, resource allocation)
 */
router.post('/suggestions', auth, asyncHandler((req, res) =>
  ctrl(req).getSuggestions(req, res)
));

/**
 * POST /api/ai/detect-blockers
 * Body: { projectId?: string, days?: number }
 * Returns: detected explicit + implicit blockers with type, severity, and suggested actions
 */
router.post('/detect-blockers', auth, asyncHandler((req, res) =>
  ctrl(req).detectBlockers(req, res)
));

/**
 * POST /api/ai/trends
 * Body: { projectId?: string, days?: number (7–90, default 14) }
 * Returns: productivity/engagement/mood trends + insights + recommendations
 */
router.post('/trends', auth, asyncHandler((req, res) =>
  ctrl(req).analyzeTrends(req, res)
));

/**
 * POST /api/ai/retrospective
 * Body: { projectId?: string, sprintStart?: string, sprintEnd?: string }
 * Returns: went well, went wrong, action items, velocity score, key learning
 */
router.post('/retrospective', auth, asyncHandler((req, res) =>
  ctrl(req).generateRetrospective(req, res)
));

/**
 * POST /api/ai/query
 * Body: { query: string, projectId?: string }
 * Returns: factual answer, confidence level, supporting data, follow-up suggestions
 */
router.post('/query', auth, asyncHandler((req, res) =>
  ctrl(req).naturalLanguageQuery(req, res)
));

/**
 * POST /api/ai/process-voice
 * Body: { transcript: string, type: 'standup'|'eod', projectId?: string, date?: string }
 * Returns: structured fields (yesterday/today/blockers or accomplishments/plan/mood) + AI insights
 */
router.post('/process-voice', auth, asyncHandler((req, res) =>
  ctrl(req).processVoice(req, res)
));

/**
 * POST /api/ai/task-insight
 * Body: { title, description?, status?, priority?, dueDate?, taskId? }
 * Returns: concise AI insight for a single task
 */
router.post('/task-insight', auth, asyncHandler((req, res) =>
  ctrl(req).getTaskInsight(req, res)
));

/**
 * POST /api/ai/holistic-performance
 * Body: { targetUserId?: string, days?: 7|30|90 }
 * Returns: star rating (1–5), score, factor breakdown, suggestions across ALL modules
 * (tasks, attendance, leave, time tracking, standups, EODs, actions, blockers)
 */
router.post('/holistic-performance', auth, asyncHandler((req, res) =>
  ctrl(req).getHolisticPerformance(req, res)
));

/**
 * POST /api/ai/sprint-analysis
 * Body: { sprintId: string }
 * Returns: star rating, velocity score, completion rate, team highlights, recommendations
 */
router.post('/sprint-analysis', auth, asyncHandler((req, res) =>
  ctrl(req).getSprintAnalysis(req, res)
));

// ─── Service health (no auth) ─────────────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', endpoints: ['daily-summary', 'project-health', 'performance', 'holistic-performance', 'sprint-analysis', 'report', 'suggestions', 'process-voice'] });
});

module.exports = router;
