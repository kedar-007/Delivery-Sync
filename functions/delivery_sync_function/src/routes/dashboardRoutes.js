'use strict';

const express = require('express');
const asyncHandler = require('express-async-handler');
const AuthMiddleware = require('../middleware/AuthMiddleware');
const RBACMiddleware = require('../middleware/RBACMiddleware');
const DashboardController = require('../controllers/DashboardController');
const ExecDashboardController = require('../controllers/ExecDashboardController');
const { PERMISSIONS } = require('../utils/Constants');

const router = express.Router();
const auth = AuthMiddleware.authenticate;
const can = RBACMiddleware.require;
const ctrl     = (req) => new DashboardController(req.catalystApp);
const execCtrl = (req) => new ExecDashboardController(req.catalystApp);

// Dashboard is always accessible to any authenticated user — no DASHBOARD_READ gate.
// The controller itself scopes data based on dataScope / org role.
router.get('/summary',            auth, asyncHandler((req, res) => ctrl(req).getSummary(req, res)));
router.get('/portfolio',          auth, can(PERMISSIONS.ORG_ROLE_READ), asyncHandler((req, res) => ctrl(req).getPortfolioDashboard(req, res)));
router.get('/project/:projectId', auth, can(PERMISSIONS.PROJECT_READ),  asyncHandler((req, res) => ctrl(req).getProjectDashboard(req, res)));
router.get('/exec-summary',       auth, can(PERMISSIONS.ORG_ROLE_READ), asyncHandler((req, res) => execCtrl(req).getSummary(req, res)));

module.exports = router;
