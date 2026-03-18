'use strict';

const express = require('express');
const asyncHandler = require('express-async-handler');
const AuthMiddleware = require('../middleware/AuthMiddleware');
const RBACMiddleware = require('../middleware/RBACMiddleware');
const AdminController = require('../controllers/AdminController');
const { PERMISSIONS } = require('../utils/Constants');

const router = express.Router();
const auth = AuthMiddleware.authenticate;
const can = RBACMiddleware.require;
const admin = RBACMiddleware.requireAdmin;
const ctrl = (req) => new AdminController(req.catalystApp);

router.post('/users/invite', auth, can(PERMISSIONS.INVITE_USER), asyncHandler((req, res) => ctrl(req).inviteUserOrg(req, res)));
router.get('/users', auth, can(PERMISSIONS.ADMIN_USERS), asyncHandler((req, res) => ctrl(req).listUsers(req, res)));
router.put('/users/:userId', auth, can(PERMISSIONS.ADMIN_USERS), asyncHandler((req, res) => ctrl(req).updateUser(req, res)));
router.delete('/users/:userId', auth, admin(), asyncHandler((req, res) => ctrl(req).deactivateUser(req, res)));

router.get('/tenant', auth, can(PERMISSIONS.ADMIN_SETTINGS), asyncHandler((req, res) => ctrl(req).getTenant(req, res)));
router.get('/audit-logs', auth, can(PERMISSIONS.ADMIN_SETTINGS), asyncHandler((req, res) => ctrl(req).getAuditLogs(req, res)));

module.exports = router;
