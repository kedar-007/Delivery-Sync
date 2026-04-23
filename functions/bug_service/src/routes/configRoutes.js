'use strict';

const express             = require('express');
const router              = express.Router();
const asyncHandler        = require('express-async-handler');
const AuthMiddleware      = require('../middleware/AuthMiddleware');
const BugConfigController = require('../controllers/BugConfigController');

const auth = AuthMiddleware.authenticate;
const ctrl = (req) => new BugConfigController(req.catalystApp);

// ─── Bug Config Routes ────────────────────────────────────────────────────────
router.get('/config', auth, asyncHandler((req, res) => ctrl(req).getConfig(req, res)));
router.put('/config', auth, asyncHandler((req, res) => ctrl(req).upsertConfig(req, res)));

module.exports = router;
