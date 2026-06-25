'use strict';
const express = require('express');
const router  = express.Router();
const asyncHandler = require('express-async-handler');
const CronController = require('../controllers/CronController');
router.post('/maintenance-check', asyncHandler(CronController.maintenanceCheck));
module.exports = router;
