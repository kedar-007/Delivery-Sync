'use strict';

const express             = require('express');
const router              = express.Router();
const asyncHandler        = require('express-async-handler');
const AuthMiddleware      = require('../middleware/AuthMiddleware');
const BugReportController = require('../controllers/BugReportController');

const auth = AuthMiddleware.authenticate;
const ctrl = (req) => new BugReportController(req.catalystApp);

// ─── Bug Report Routes ────────────────────────────────────────────────────────
// NOTE: /reports/all MUST be registered before /reports/:id to avoid param capture
router.get('/reports/all', auth, asyncHandler((req, res) => ctrl(req).listAllReports(req, res)));
router.get('/reports',     auth, asyncHandler((req, res) => ctrl(req).listReports(req, res)));
router.post('/reports',    auth, asyncHandler((req, res) => ctrl(req).submitReport(req, res)));

router.post('/reports/:id/attachments', auth, asyncHandler((req, res) => ctrl(req).uploadAttachment(req, res)));
router.post('/reports/:id/notify',     auth, asyncHandler((req, res) => ctrl(req).notifyReport(req, res)));
router.get('/reports/:id',             auth, asyncHandler((req, res) => ctrl(req).getReport(req, res)));
router.patch('/reports/:id',           auth, asyncHandler((req, res) => ctrl(req).updateReport(req, res)));

module.exports = router;
