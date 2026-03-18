'use strict';

const express = require('express');
const asyncHandler = require('express-async-handler');
const AuthMiddleware = require('../middleware/AuthMiddleware');
const RBACMiddleware = require('../middleware/RBACMiddleware');
const ReportController = require('../controllers/ReportController');
const { PERMISSIONS } = require('../utils/Constants');

const router = express.Router();
const auth = AuthMiddleware.authenticate;
const can = RBACMiddleware.require;
const ctrl = (req) => new ReportController(req.catalystApp);

router.post('/generate', auth, can(PERMISSIONS.REPORT_WRITE), asyncHandler((req, res) => ctrl(req).generateReport(req, res)));
router.get('/', auth, can(PERMISSIONS.REPORT_READ), asyncHandler((req, res) => ctrl(req).getReports(req, res)));
router.get('/:reportId', auth, can(PERMISSIONS.REPORT_READ), asyncHandler((req, res) => ctrl(req).getReportById(req, res)));

module.exports = router;
