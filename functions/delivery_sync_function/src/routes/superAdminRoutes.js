'use strict';

const express = require('express');
const asyncHandler = require('express-async-handler');
const router = express.Router();
const SuperAdminController = require('../controllers/SuperAdminController');

// Middleware: only allow SUPER_ADMIN role
const requireSuperAdmin = (req, res, next) => {
  if (!req.currentUser || req.currentUser.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, message: 'Super admin access required' });
  }
  next();
};

const ctrl = (req) => new SuperAdminController(req.catalystApp);

router.use(requireSuperAdmin);
router.get('/stats', asyncHandler((req, res) => ctrl(req).getStats(req, res)));
router.get('/tenants', asyncHandler((req, res) => ctrl(req).listTenants(req, res)));
router.patch('/tenants/:tenantId/status', asyncHandler((req, res) => ctrl(req).updateTenantStatus(req, res)));
router.get('/tenants/:tenantId/users', asyncHandler((req, res) => ctrl(req).listTenantUsers(req, res)));

module.exports = router;
