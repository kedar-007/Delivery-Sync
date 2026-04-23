'use strict';

const express         = require('express');
const router          = express.Router();
const asyncHandler    = require('express-async-handler');
const AuthMiddleware  = require('../middleware/AuthMiddleware');
const BotController   = require('../controllers/BotController');

const ctrl = (req) => new BotController(req.catalystApp);

// All routes require authentication
router.use(AuthMiddleware.authenticate);

router.post('/message',           asyncHandler((req, res) => ctrl(req).message(req, res)));
router.get('/profile',            asyncHandler((req, res) => ctrl(req).getProfile(req, res)));
router.put('/profile',            asyncHandler((req, res) => ctrl(req).updateProfile(req, res)));
router.post('/avatar',            asyncHandler((req, res) => ctrl(req).uploadAvatar(req, res)));
router.get('/todos',              asyncHandler((req, res) => ctrl(req).getTodos(req, res)));
router.put('/todos/:id',          asyncHandler((req, res) => ctrl(req).updateTodo(req, res)));
router.get('/quick-actions',      asyncHandler((req, res) => ctrl(req).getQuickActions(req, res)));

module.exports = router;
