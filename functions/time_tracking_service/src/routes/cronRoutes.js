'use strict';
const express = require('express');
const router  = express.Router();
const asyncHandler = require('express-async-handler');
const CronController = require('../controllers/CronController');
router.post('/approval-reminder', asyncHandler(CronController.approvalReminder));
module.exports = router;
