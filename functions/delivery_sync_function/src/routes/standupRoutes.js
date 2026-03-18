'use strict';

const express = require('express');
const asyncHandler = require('express-async-handler');
const AuthMiddleware = require('../middleware/AuthMiddleware');
const RBACMiddleware = require('../middleware/RBACMiddleware');
const StandupController = require('../controllers/StandupController');
const { PERMISSIONS } = require('../utils/Constants');

const router = express.Router();
const auth = AuthMiddleware.authenticate;
const can = RBACMiddleware.require;
const ctrl = (req) => new StandupController(req.catalystApp);

router.post('/', auth, can(PERMISSIONS.STANDUP_SUBMIT), asyncHandler((req, res) => ctrl(req).submitStandup(req, res)));
router.get('/', auth, can(PERMISSIONS.STANDUP_READ), asyncHandler((req, res) => ctrl(req).getStandups(req, res)));
router.get('/rollup', auth, can(PERMISSIONS.STANDUP_READ), asyncHandler((req, res) => ctrl(req).getStandupRollup(req, res)));
router.get('/my-today', auth, asyncHandler((req, res) => ctrl(req).getMyTodayStandup(req, res)));

module.exports = router;
