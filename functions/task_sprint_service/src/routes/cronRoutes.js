'use strict';

const express = require('express');
const router  = express.Router();
const CronController = require('../controllers/CronController');

router.post('/sprint-check', CronController.sprintCheck);

module.exports = router;
