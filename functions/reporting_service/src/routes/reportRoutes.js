'use strict';

const express        = require('express');
const RBACMiddleware = require('../middleware/RBACMiddleware');
const { PERMISSIONS } = require('../utils/Constants');
const ReportController = require('../controllers/ReportController');

const router = express.Router();

// ── Delivery Health ────────────────────────────────────────────────────────────
router.get(
  '/delivery-health',
  RBACMiddleware.require(PERMISSIONS.REPORT_READ),
  (req, res) => new ReportController(req.catalystApp).deliveryHealth(req, res)
);

router.get(
  '/delivery-health/:projectId',
  RBACMiddleware.require(PERMISSIONS.REPORT_READ),
  (req, res) => new ReportController(req.catalystApp).projectHealth(req, res)
);

// ── People ─────────────────────────────────────────────────────────────────────
router.get(
  '/people-summary',
  RBACMiddleware.require(PERMISSIONS.REPORT_READ),
  (req, res) => new ReportController(req.catalystApp).peopleSummary(req, res)
);

router.get(
  '/attendance-report',
  RBACMiddleware.require(PERMISSIONS.ATTENDANCE_READ),
  (req, res) => new ReportController(req.catalystApp).attendanceReport(req, res)
);

router.get(
  '/leave-report',
  RBACMiddleware.require(PERMISSIONS.LEAVE_READ),
  (req, res) => new ReportController(req.catalystApp).leaveReport(req, res)
);

// ── Time ───────────────────────────────────────────────────────────────────────
router.get(
  '/time-summary',
  RBACMiddleware.require(PERMISSIONS.TIME_READ),
  (req, res) => new ReportController(req.catalystApp).timeSummary(req, res)
);

router.get(
  '/time-by-project',
  RBACMiddleware.require(PERMISSIONS.TIME_READ),
  (req, res) => new ReportController(req.catalystApp).timeByProject(req, res)
);

// ── Assets ─────────────────────────────────────────────────────────────────────
router.get(
  '/asset-summary',
  RBACMiddleware.require(PERMISSIONS.ASSET_READ),
  (req, res) => new ReportController(req.catalystApp).assetSummary(req, res)
);

// ── Executive ──────────────────────────────────────────────────────────────────
router.get(
  '/executive-brief',
  RBACMiddleware.require(PERMISSIONS.REPORT_READ),
  (req, res) => new ReportController(req.catalystApp).executiveBrief(req, res)
);

// ── Custom ─────────────────────────────────────────────────────────────────────
router.post(
  '/custom',
  RBACMiddleware.require(PERMISSIONS.REPORT_READ),
  (req, res) => new ReportController(req.catalystApp).customReport(req, res)
);

module.exports = router;
