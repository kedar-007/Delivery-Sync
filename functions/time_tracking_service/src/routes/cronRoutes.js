'use strict';
const express = require('express');
const router  = express.Router();
const CronController = require('../controllers/CronController');
router.post('/approval-reminder', CronController.approvalReminder);
module.exports = router;
