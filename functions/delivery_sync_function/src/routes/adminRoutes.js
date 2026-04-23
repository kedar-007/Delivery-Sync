'use strict';

const express = require('express');
const asyncHandler = require('express-async-handler');
const AuthMiddleware = require('../middleware/AuthMiddleware');
const RBACMiddleware = require('../middleware/RBACMiddleware');
const AdminController = require('../controllers/AdminController');
const OrgRolesController = require('../controllers/OrgRolesController');
const { PERMISSIONS } = require('../utils/Constants');

const router = express.Router();
const auth = AuthMiddleware.authenticate;
const can = RBACMiddleware.require;
const admin = RBACMiddleware.requireAdmin;
const ctrl = (req) => new AdminController(req.catalystApp);
const orgCtrl = (req) => new OrgRolesController(req.catalystApp);

router.post('/users/invite', auth, can(PERMISSIONS.INVITE_USER), asyncHandler((req, res) => ctrl(req).inviteUserOrg(req, res)));
router.get('/users', auth, can(PERMISSIONS.ADMIN_USERS), asyncHandler((req, res) => ctrl(req).listUsers(req, res)));
router.put('/users/:userId', auth, can(PERMISSIONS.ADMIN_USERS), asyncHandler((req, res) => ctrl(req).updateUser(req, res)));
router.delete('/users/:userId', auth, admin(), asyncHandler((req, res) => ctrl(req).deactivateUser(req, res)));
router.patch('/users/:userId/activate', auth, admin(), asyncHandler((req, res) => ctrl(req).activateUser(req, res)));

router.get('/tenant',            auth, can(PERMISSIONS.ADMIN_SETTINGS), asyncHandler((req, res) => ctrl(req).getTenant(req, res)));
router.patch('/tenant/settings', auth, admin(),                          asyncHandler((req, res) => ctrl(req).updateTenantSettings(req, res)));
router.get('/audit-logs', auth, can(PERMISSIONS.ADMIN_SETTINGS), asyncHandler((req, res) => ctrl(req).getAuditLogs(req, res)));
router.get('/modules', auth, asyncHandler((req, res) => ctrl(req).getModulePermissions(req, res)));

// Current user's own effective permissions (role defaults + overrides) — no admin required
router.get('/my-permissions', auth, asyncHandler((req, res) => ctrl(req).getMyPermissions(req, res)));

// Per-user permission overrides
router.get('/users/:userId/permissions', auth, admin(), asyncHandler((req, res) => ctrl(req).getUserPermissions(req, res)));
router.put('/users/:userId/permissions', auth, admin(), asyncHandler((req, res) => ctrl(req).setUserPermissions(req, res)));

// ── Org Roles & Permissions ────────────────────────────────────────────────────
// List all available app permissions (grouped) — any authenticated user
router.get('/permissions/all', auth, asyncHandler((req, res) => orgCtrl(req).listAllPermissions(req, res)));

// Org role CRUD (admin only)
router.get('/org-roles', auth, can(PERMISSIONS.ORG_ROLE_READ), asyncHandler((req, res) => orgCtrl(req).listRoles(req, res)));
router.post('/org-roles', auth, can(PERMISSIONS.ORG_ROLE_WRITE), asyncHandler((req, res) => orgCtrl(req).createRole(req, res)));
router.put('/org-roles/:roleId', auth, can(PERMISSIONS.ORG_ROLE_WRITE), asyncHandler((req, res) => orgCtrl(req).updateRole(req, res)));
router.delete('/org-roles/:roleId', auth, admin(), asyncHandler((req, res) => orgCtrl(req).deleteRole(req, res)));

// Org role permissions
router.get('/org-roles/:roleId/permissions', auth, can(PERMISSIONS.ORG_ROLE_READ), asyncHandler((req, res) => orgCtrl(req).getRolePermissions(req, res)));
router.put('/org-roles/:roleId/permissions', auth, can(PERMISSIONS.ORG_ROLE_WRITE), asyncHandler((req, res) => orgCtrl(req).setRolePermissions(req, res)));

// Assign org role to a user
router.put('/users/:userId/org-role', auth, can(PERMISSIONS.ORG_ROLE_WRITE), asyncHandler((req, res) => orgCtrl(req).assignUserOrgRole(req, res)));

// Org chart (read-only, any authenticated user with ORG_ROLE_READ)
router.get('/org-chart', auth, can(PERMISSIONS.ORG_ROLE_READ), asyncHandler((req, res) => orgCtrl(req).getOrgChart(req, res)));

// ── Data Sharing Rules ─────────────────────────────────────────────────────────
router.get ('/org-roles/:roleId/sharing',            auth, can(PERMISSIONS.ORG_ROLE_READ),  asyncHandler((req, res) => orgCtrl(req).getSharingRules(req, res)));
router.put ('/org-roles/:roleId/sharing/visibility', auth, can(PERMISSIONS.ORG_ROLE_WRITE), asyncHandler((req, res) => orgCtrl(req).setDefaultVisibility(req, res)));
router.post('/org-roles/:roleId/sharing/rules',      auth, can(PERMISSIONS.ORG_ROLE_WRITE), asyncHandler((req, res) => orgCtrl(req).addExplicitRule(req, res)));
router.delete('/sharing-rules/:ruleId',              auth, can(PERMISSIONS.ORG_ROLE_WRITE), asyncHandler((req, res) => orgCtrl(req).deleteRule(req, res)));

module.exports = router;
