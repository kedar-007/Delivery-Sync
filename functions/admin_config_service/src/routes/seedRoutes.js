'use strict';
const express        = require('express');
const router         = express.Router();
const SeedController = require('../controllers/SeedController');
const asyncHandler = require('express-async-handler');

// POST /api/config/seed/demo  — admin only
router.post('/demo', asyncHandler(SeedController.seedDemo));

module.exports = router;
