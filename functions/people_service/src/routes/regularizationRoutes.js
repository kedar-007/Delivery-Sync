'use strict';
const express = require('express');
const router  = express.Router();
const RBACMiddleware           = require('../middleware/RBACMiddleware');
const RegularizationController = require('../controllers/RegularizationController');
const { PERMISSIONS } = require('../utils/Constants');
const asyncHandler = require('express-async-handler');
const ctrl = (req) => new RegularizationController(req.catalystApp, req.adminCatalystApp);

// Employee — submit a correction request and check status of their own requests
router.post('/apply',    RBACMiddleware.require(PERMISSIONS.ATTENDANCE_WRITE), asyncHandler((req, res) => ctrl(req).apply(req, res)));
router.get('/status',    RBACMiddleware.require(PERMISSIONS.ATTENDANCE_READ),  asyncHandler((req, res) => ctrl(req).status(req, res)));
// Manager — list pending requests from direct reports and approve/reject them
router.get('/pending',   RBACMiddleware.require(PERMISSIONS.ATTENDANCE_READ),  asyncHandler((req, res) => ctrl(req).pending(req, res)));
router.put('/approve',   RBACMiddleware.require(PERMISSIONS.ATTENDANCE_WRITE), asyncHandler((req, res) => ctrl(req).approve(req, res)));

module.exports = router;
