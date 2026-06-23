'use strict';

const express = require('express');
const asyncHandler = require('express-async-handler');
const AuthMiddleware = require('../middleware/AuthMiddleware');
const RBACMiddleware = require('../middleware/RBACMiddleware');
const UserController = require('../controllers/UserController');
const { PERMISSIONS } = require('../utils/Constants');

const router = express.Router();
const auth = AuthMiddleware.authenticate;
const ctrl = (req) => new UserController(req.adminCatalystApp || req.catalystApp);

router.get('/me', auth, asyncHandler((req, res) => ctrl(req).getProfile(req, res)));
router.patch('/me', auth, asyncHandler((req, res) => ctrl(req).updateProfile(req, res)));
router.put('/me/location', auth, asyncHandler((req, res) => ctrl(req).updateMyLocation(req, res)));
router.post('/me/avatar/upload', auth, asyncHandler((req, res) => ctrl(req).uploadAvatar(req, res)));
router.post('/me/email-update', auth, RBACMiddleware.require(PERMISSIONS.PROFILE_EMAIL_CHANGE), asyncHandler((req, res) => ctrl(req).updateEmail(req, res)));

module.exports = router;
