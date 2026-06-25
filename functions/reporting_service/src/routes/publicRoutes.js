'use strict';

const express                = require('express');
const asyncHandler           = require('express-async-handler');
const PublicReportController = require('../controllers/PublicReportController');

const router = express.Router();

// GET /api/public/reports/:shareToken  — no authentication required
router.get(
  '/:shareToken',
  asyncHandler((req, res) => new PublicReportController(req.catalystApp).view(req, res))
);

module.exports = router;
