'use strict';

const express = require('express');
const asyncHandler = require('express-async-handler');
const AuthMiddleware = require('../middleware/AuthMiddleware');
const RBACMiddleware = require('../middleware/RBACMiddleware');
const EodController = require('../controllers/EodController');
const { PERMISSIONS } = require('../utils/Constants');

const router = express.Router();
const auth = AuthMiddleware.authenticate;
const can = RBACMiddleware.require;
const ctrl = (req) => new EodController(req.catalystApp);

router.post('/', auth, can(PERMISSIONS.EOD_SUBMIT), asyncHandler((req, res) => ctrl(req).submitEod(req, res)));
router.get('/', auth, can(PERMISSIONS.EOD_READ), asyncHandler((req, res) => ctrl(req).getEod(req, res)));
router.get('/rollup', auth, can(PERMISSIONS.EOD_READ), asyncHandler((req, res) => ctrl(req).getEodRollup(req, res)));
router.get('/my-today', auth, asyncHandler((req, res) => ctrl(req).getMyTodayEod(req, res)));

module.exports = router;
