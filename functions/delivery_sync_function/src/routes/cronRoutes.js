'use strict';

const express = require('express');
const asyncHandler = require('express-async-handler');
const AuthMiddleware = require('../middleware/AuthMiddleware');
const CronController = require('../controllers/CronController');

const router = express.Router();
const cronAuth = AuthMiddleware.authenticateCron;
const ctrl = (req) => new CronController(req.catalystApp);

router.get('/health', asyncHandler((req, res) => ctrl(req).health(req, res)));
router.post('/standup-reminder', cronAuth, asyncHandler((req, res) => ctrl(req).standupReminderJob(req, res)));
router.post('/eod-reminder', cronAuth, asyncHandler((req, res) => ctrl(req).eodReminderJob(req, res)));
router.post('/overdue-actions', cronAuth, asyncHandler((req, res) => ctrl(req).overdueActionEscalationJob(req, res)));
router.post('/blocker-escalation', cronAuth, asyncHandler((req, res) => ctrl(req).blockerEscalationJob(req, res)));
router.post('/daily-summary', cronAuth, asyncHandler((req, res) => ctrl(req).dailySummaryJob(req, res)));

module.exports = router;
