'use strict';

const express = require('express');
const asyncHandler = require('express-async-handler');
const AuthMiddleware = require('../middleware/AuthMiddleware');
const UserController = require('../controllers/UserController');

const router = express.Router();
const auth = AuthMiddleware.authenticate;
const ctrl = (req) => new UserController(req.catalystApp);

router.get('/me', auth, asyncHandler((req, res) => ctrl(req).getProfile(req, res)));
router.patch('/me', auth, asyncHandler((req, res) => ctrl(req).updateProfile(req, res)));
router.post('/me/avatar/upload', auth, asyncHandler((req, res) => ctrl(req).uploadAvatar(req, res)));
router.post('/me/email-update',auth,asyncHandler((req,res) => ctrl(req).updateEmail(req,res)));

module.exports = router;
