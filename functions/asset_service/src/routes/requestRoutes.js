'use strict';
const express = require('express');
const router  = express.Router();
const RBACMiddleware         = require('../middleware/RBACMiddleware');
const AssetRequestController = require('../controllers/AssetRequestController');
const { PERMISSIONS } = require('../utils/Constants');

const ctrl = (req) => new AssetRequestController(req.catalystApp);

// ── List & Create ──────────────────────────────────────────────────────────────
router.get('/',  RBACMiddleware.require(PERMISSIONS.ASSET_READ),    (req, res) => ctrl(req).list(req, res));
router.post('/', RBACMiddleware.require(PERMISSIONS.ASSET_READ),    (req, res) => ctrl(req).create(req, res));

// ── User / Role lookups for ops assignment ─────────────────────────────────────
router.get('/assignable-users', RBACMiddleware.require(PERMISSIONS.ASSET_APPROVE), (req, res) => ctrl(req).listAssignableUsers(req, res));
router.get('/org-roles',        RBACMiddleware.require(PERMISSIONS.ASSET_APPROVE), (req, res) => ctrl(req).listOrgRoles(req, res));

// ── Approval workflow ──────────────────────────────────────────────────────────
router.patch('/:requestId/approve',      RBACMiddleware.require(PERMISSIONS.ASSET_APPROVE), (req, res) => ctrl(req).approve(req, res));
router.patch('/:requestId/reject',       RBACMiddleware.require(PERMISSIONS.ASSET_APPROVE), (req, res) => ctrl(req).reject(req, res));
router.patch('/:requestId/assign-ops',   RBACMiddleware.require(PERMISSIONS.ASSET_APPROVE), (req, res) => ctrl(req).assignOps(req, res));

// ── Ops / Handover workflow ────────────────────────────────────────────────────
router.patch('/:requestId/process',      RBACMiddleware.require(PERMISSIONS.ASSET_ASSIGN),  (req, res) => ctrl(req).startProcessing(req, res));
router.patch('/:requestId/handover',     RBACMiddleware.require(PERMISSIONS.ASSET_ASSIGN),  (req, res) => ctrl(req).handover(req, res));
router.patch('/:requestId/fulfill',      RBACMiddleware.require(PERMISSIONS.ASSET_ASSIGN),  (req, res) => ctrl(req).fulfill(req, res));

// ── Return workflow ────────────────────────────────────────────────────────────
router.post('/:requestId/return',        RBACMiddleware.require(PERMISSIONS.ASSET_READ),    (req, res) => ctrl(req).initiateReturn(req, res));
router.patch('/:requestId/verify-return',RBACMiddleware.require(PERMISSIONS.ASSET_ASSIGN),  (req, res) => ctrl(req).verifyReturn(req, res));

module.exports = router;
