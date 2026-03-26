'use strict';

const express          = require('express');
const RBACMiddleware   = require('../middleware/RBACMiddleware');
const { PERMISSIONS }  = require('../utils/Constants');
const PdfController    = require('../controllers/PdfController');

const router = express.Router();

// POST /api/reports/pdf/generate
router.post(
  '/generate',
  RBACMiddleware.require(PERMISSIONS.REPORT_READ),
  (req, res) => new PdfController(req.catalystApp).generate(req, res)
);

// GET /api/reports/pdf/jobs
router.get(
  '/jobs',
  RBACMiddleware.require(PERMISSIONS.REPORT_READ),
  (req, res) => new PdfController(req.catalystApp).listJobs(req, res)
);

// GET /api/reports/pdf/jobs/:jobId
router.get(
  '/jobs/:jobId',
  RBACMiddleware.require(PERMISSIONS.REPORT_READ),
  (req, res) => new PdfController(req.catalystApp).getJob(req, res)
);

module.exports = router;
