'use strict';

const express = require('express');
const asyncHandler = require('express-async-handler');
const AuthMiddleware = require('../middleware/AuthMiddleware');
const RBACMiddleware = require('../middleware/RBACMiddleware');
const ActionController = require('../controllers/ActionController');
const { PERMISSIONS } = require('../utils/Constants');

const router = express.Router();
const auth = AuthMiddleware.authenticate;
const can = RBACMiddleware.require;
const ctrl = (req) => new ActionController(req.catalystApp);

router.post('/', auth, can(PERMISSIONS.ACTION_WRITE), asyncHandler((req, res) => ctrl(req).createAction(req, res)));
router.get('/', auth, can(PERMISSIONS.ACTION_READ), asyncHandler((req, res) => ctrl(req).listActions(req, res)));
router.put('/:actionId', auth, can(PERMISSIONS.ACTION_WRITE), asyncHandler((req, res) => ctrl(req).updateAction(req, res)));
router.delete('/:actionId', auth, can(PERMISSIONS.ACTION_WRITE), asyncHandler((req, res) => ctrl(req).deleteAction(req, res)));

module.exports = router;
