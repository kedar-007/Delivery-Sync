'use strict';
const express = require('express');
const router  = express.Router();
const CronController = require('../controllers/CronController');
router.post('/maintenance-check', CronController.maintenanceCheck);
module.exports = router;
