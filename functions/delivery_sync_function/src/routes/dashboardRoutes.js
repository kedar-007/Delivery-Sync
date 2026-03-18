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

router.get('/summary',      auth, can(PERMISSIONS.DASHBOARD_READ), asyncHandler((req, res) => ctrl(req).getSummary(req, res)));
router.get('/portfolio',    auth, can(PERMISSIONS.DASHBOARD_READ), asyncHandler((req, res) => ctrl(req).getPortfolioDashboard(req, res)));
router.get('/project/:projectId', auth, can(PERMISSIONS.DASHBOARD_READ), asyncHandler((req, res) => ctrl(req).getProjectDashboard(req, res)));
router.get('/exec-summary', auth, can(PERMISSIONS.DASHBOARD_READ), asyncHandler((req, res) => execCtrl(req).getSummary(req, res)));

module.exports = router;
