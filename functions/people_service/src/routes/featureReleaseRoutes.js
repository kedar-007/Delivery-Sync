'use strict';
const express = require('express');
const router  = express.Router();
const RBACMiddleware           = require('../middleware/RBACMiddleware');
const FeatureReleaseController = require('../controllers/FeatureReleaseController');
const { PERMISSIONS } = require('../utils/Constants');
const asyncHandler = require('express-async-handler');
const ctrl = (req) => new FeatureReleaseController(req.catalystApp);

// Read (all users) — list published releases + unread count, and mark seen.
router.get('/',         RBACMiddleware.require(PERMISSIONS.FEATURE_RELEASE_READ),  asyncHandler((req, res) => ctrl(req).list(req, res)));
router.patch('/seen',   RBACMiddleware.require(PERMISSIONS.FEATURE_RELEASE_READ),  asyncHandler((req, res) => ctrl(req).markSeen(req, res)));

// Authoring (admins only) — /manage must precede /:id so it isn't captured.
router.get('/manage',          RBACMiddleware.require(PERMISSIONS.FEATURE_RELEASE_WRITE), asyncHandler((req, res) => ctrl(req).listManage(req, res)));
router.get('/:id/seen-status', RBACMiddleware.require(PERMISSIONS.FEATURE_RELEASE_WRITE), asyncHandler((req, res) => ctrl(req).seenStatus(req, res)));
router.post('/',               RBACMiddleware.require(PERMISSIONS.FEATURE_RELEASE_WRITE), asyncHandler((req, res) => ctrl(req).create(req, res)));
router.put('/:id',             RBACMiddleware.require(PERMISSIONS.FEATURE_RELEASE_WRITE), asyncHandler((req, res) => ctrl(req).update(req, res)));
router.patch('/:id/publish',   RBACMiddleware.require(PERMISSIONS.FEATURE_RELEASE_WRITE), asyncHandler((req, res) => ctrl(req).publish(req, res)));
router.delete('/:id',          RBACMiddleware.require(PERMISSIONS.FEATURE_RELEASE_WRITE), asyncHandler((req, res) => ctrl(req).remove(req, res)));

module.exports = router;
