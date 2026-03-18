'use strict';

const express = require('express');
const asyncHandler = require('express-async-handler');
const AuthMiddleware = require('../middleware/AuthMiddleware');
const RBACMiddleware = require('../middleware/RBACMiddleware');
const NotificationController = require('../controllers/NotificationController');
const { PERMISSIONS } = require('../utils/Constants');

const router = express.Router();
const auth = AuthMiddleware.authenticate;
const can = RBACMiddleware.require;
const ctrl = (req) => new NotificationController(req.catalystApp);

router.get('/',         auth, can(PERMISSIONS.NOTIFICATION_READ), asyncHandler((req, res) => ctrl(req).getNotifications(req, res)));
router.get('/count',    auth, can(PERMISSIONS.NOTIFICATION_READ), asyncHandler((req, res) => ctrl(req).getUnreadCount(req, res)));
router.patch('/read-all', auth, can(PERMISSIONS.NOTIFICATION_READ), asyncHandler((req, res) => ctrl(req).markAllRead(req, res)));
router.patch('/:notificationId/read', auth, can(PERMISSIONS.NOTIFICATION_READ), asyncHandler((req, res) => ctrl(req).markRead(req, res)));
router.delete('/:notificationId', auth, can(PERMISSIONS.NOTIFICATION_READ), asyncHandler((req, res) => ctrl(req).deleteNotification(req, res)));

module.exports = router;
