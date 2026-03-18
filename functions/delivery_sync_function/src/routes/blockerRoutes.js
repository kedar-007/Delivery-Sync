'use strict';

const express = require('express');
const asyncHandler = require('express-async-handler');
const AuthMiddleware = require('../middleware/AuthMiddleware');
const RBACMiddleware = require('../middleware/RBACMiddleware');
const BlockerController = require('../controllers/BlockerController');
const { PERMISSIONS } = require('../utils/Constants');

const router = express.Router();
const auth = AuthMiddleware.authenticate;
const can = RBACMiddleware.require;
const ctrl = (req) => new BlockerController(req.catalystApp);

router.post('/', auth, can(PERMISSIONS.BLOCKER_WRITE), asyncHandler((req, res) => ctrl(req).createBlocker(req, res)));
router.get('/', auth, can(PERMISSIONS.BLOCKER_READ), asyncHandler((req, res) => ctrl(req).listBlockers(req, res)));
router.put('/:blockerId', auth, can(PERMISSIONS.BLOCKER_WRITE), asyncHandler((req, res) => ctrl(req).updateBlocker(req, res)));
router.patch('/:blockerId/resolve', auth, can(PERMISSIONS.BLOCKER_WRITE), asyncHandler((req, res) => ctrl(req).resolveBlocker(req, res)));

module.exports = router;
