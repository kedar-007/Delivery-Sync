'use strict';

const express = require('express');
const asyncHandler = require('express-async-handler');
const AuthMiddleware = require('../middleware/AuthMiddleware');
const AuthController = require('../controllers/AuthController');

const router = express.Router();

// Factory: new controller per request (gets fresh catalystApp)
const ctrl = (req) => new AuthController(req.catalystApp);

// Public – available before full user setup (register-tenant, accept-invite)
router.post('/register-tenant', asyncHandler((req, res) => ctrl(req).registerTenant(req, res)));
router.post('/accept-invite', asyncHandler((req, res) => ctrl(req).acceptInvite(req, res)));

// Protected – requires authenticated session
const auth = AuthMiddleware.authenticate;
router.get('/me', auth, asyncHandler((req, res) => ctrl(req).getCurrentUser(req, res)));
router.get('/users', auth, asyncHandler((req, res) => ctrl(req).listTenantUsers(req, res)));

module.exports = router;
