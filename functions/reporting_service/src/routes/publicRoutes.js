'use strict';

const express                = require('express');
const PublicReportController = require('../controllers/PublicReportController');

const router = express.Router();

// GET /api/public/reports/:shareToken  — no authentication required
router.get(
  '/:shareToken',
  (req, res) => new PublicReportController(req.catalystApp).view(req, res)
);

module.exports = router;
