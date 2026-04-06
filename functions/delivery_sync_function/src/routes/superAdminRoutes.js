'use strict';

const express = require('express');
const asyncHandler = require('express-async-handler');
const router = express.Router();
const SuperAdminController = require('../controllers/SuperAdminController');
const AuthMiddleware = require('../middleware/AuthMiddleware');

const auth = AuthMiddleware.authenticate;

const requireSuperAdmin = (req, res, next) => {
  if (!req.currentUser || req.currentUser.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, message: 'Super admin access required' });
  }
  next();
};

const ctrl = (req) => new SuperAdminController(req.catalystApp);

router.use(auth, requireSuperAdmin);

// ── Overview ──────────────────────────────────────────────────────────────────
router.get('/stats',               asyncHandler((req, res) => ctrl(req).getStats(req, res)));

// ── Tenants ───────────────────────────────────────────────────────────────────
router.get('/tenants',             asyncHandler((req, res) => ctrl(req).listTenants(req, res)));
router.get('/tenants/:tenantId',   asyncHandler((req, res) => ctrl(req).getTenantDetail(req, res)));
router.patch('/tenants/:tenantId/status', asyncHandler((req, res) => ctrl(req).updateTenantStatus(req, res)));
router.post('/tenants/:tenantId/lock',    asyncHandler((req, res) => ctrl(req).lockTenant(req, res)));
router.post('/tenants/:tenantId/unlock',  asyncHandler((req, res) => ctrl(req).unlockTenant(req, res)));
router.get('/tenants/:tenantId/users',    asyncHandler((req, res) => ctrl(req).listTenantUsers(req, res)));

// ── Module Permissions ────────────────────────────────────────────────────────
router.get('/tenants/:tenantId/modules',  asyncHandler((req, res) => ctrl(req).getModulePermissions(req, res)));
router.put('/tenants/:tenantId/modules',  asyncHandler((req, res) => ctrl(req).updateModulePermissions(req, res)));

// ── Subscription Usage ────────────────────────────────────────────────────────
router.get('/tenants/:tenantId/subscription', asyncHandler((req, res) => ctrl(req).getSubscriptionUsage(req, res)));

// ── Users (cross-tenant) ──────────────────────────────────────────────────────
router.get('/users',                     asyncHandler((req, res) => ctrl(req).getAllUsers(req, res)));
router.post('/users/:userId/block',      asyncHandler((req, res) => ctrl(req).blockUser(req, res)));
router.post('/users/:userId/unblock',    asyncHandler((req, res) => ctrl(req).unblockUser(req, res)));

// ── AI Recommendations ────────────────────────────────────────────────────────
router.get('/recommendations',           asyncHandler((req, res) => ctrl(req).getRecommendations(req, res)));
router.post('/recommendations/:recId/resolve', asyncHandler((req, res) => ctrl(req).resolveRecommendation(req, res)));

// ── Audit & Security ──────────────────────────────────────────────────────────
router.get('/audit-logs',                asyncHandler((req, res) => ctrl(req).getAuditLogs(req, res)));
router.get('/lock-history',              asyncHandler((req, res) => ctrl(req).getLockHistory(req, res)));

// ── Performance & Observability ───────────────────────────────────────────────
router.get('/performance',               asyncHandler((req, res) => ctrl(req).getPerformanceMetrics(req, res)));

// ── Feature Usage ─────────────────────────────────────────────────────────────
router.get('/feature-usage',             asyncHandler((req, res) => ctrl(req).getFeatureUsage(req, res)));

// ── Smart Alerts ──────────────────────────────────────────────────────────────
router.get('/alerts',                    asyncHandler((req, res) => ctrl(req).getSmartAlerts(req, res)));

module.exports = router;
