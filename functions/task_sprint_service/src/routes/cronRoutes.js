'use strict';

const express = require('express');
const router  = express.Router();
const asyncHandler = require('express-async-handler');
const CronController = require('../controllers/CronController');

router.post('/sprint-check', asyncHandler(CronController.sprintCheck));

module.exports = router;
