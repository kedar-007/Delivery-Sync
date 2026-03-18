'use strict';

const express = require('express');
const asyncHandler = require('express-async-handler');
const AuthMiddleware = require('../middleware/AuthMiddleware');
const RBACMiddleware = require('../middleware/RBACMiddleware');
const RaidController = require('../controllers/RaidController');
const { PERMISSIONS } = require('../utils/Constants');

const router = express.Router();
const auth = AuthMiddleware.authenticate;
const canRead = RBACMiddleware.require(PERMISSIONS.RAID_READ);
const canWrite = RBACMiddleware.require(PERMISSIONS.RAID_WRITE);
const ctrl = (req) => new RaidController(req.catalystApp);

// Risks
router.post('/risks', auth, canWrite, asyncHandler((req, res) => ctrl(req).createRisk(req, res)));
router.get('/risks', auth, canRead, asyncHandler((req, res) => ctrl(req).listRisks(req, res)));
router.put('/risks/:riskId', auth, canWrite, asyncHandler((req, res) => ctrl(req).updateRisk(req, res)));

// Issues
router.post('/issues', auth, canWrite, asyncHandler((req, res) => ctrl(req).createIssue(req, res)));
router.get('/issues', auth, canRead, asyncHandler((req, res) => ctrl(req).listIssues(req, res)));
router.put('/issues/:issueId', auth, canWrite, asyncHandler((req, res) => ctrl(req).updateIssue(req, res)));

// Dependencies
router.post('/dependencies', auth, canWrite, asyncHandler((req, res) => ctrl(req).createDependency(req, res)));
router.get('/dependencies', auth, canRead, asyncHandler((req, res) => ctrl(req).listDependencies(req, res)));
router.put('/dependencies/:dependencyId', auth, canWrite, asyncHandler((req, res) => ctrl(req).updateDependency(req, res)));

// Assumptions
router.post('/assumptions', auth, canWrite, asyncHandler((req, res) => ctrl(req).createAssumption(req, res)));
router.get('/assumptions', auth, canRead, asyncHandler((req, res) => ctrl(req).listAssumptions(req, res)));
router.put('/assumptions/:assumptionId', auth, canWrite, asyncHandler((req, res) => ctrl(req).updateAssumption(req, res)));

module.exports = router;
