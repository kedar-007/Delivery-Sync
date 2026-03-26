'use strict';
const express = require('express');
const router  = express.Router();
const CronController = require('../controllers/CronController');
router.post('/attendance-anomaly',      CronController.attendanceAnomaly);
router.post('/leave-approval-reminder', CronController.leaveApprovalReminder);
module.exports = router;
