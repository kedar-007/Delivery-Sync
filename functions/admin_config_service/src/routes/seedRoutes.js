'use strict';
const express        = require('express');
const router         = express.Router();
const SeedController = require('../controllers/SeedController');

// POST /api/config/seed/demo  — admin only
router.post('/demo', SeedController.seedDemo);

module.exports = router;
