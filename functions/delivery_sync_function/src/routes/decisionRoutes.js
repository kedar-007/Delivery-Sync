'use strict';

const express = require('express');
const asyncHandler = require('express-async-handler');
const AuthMiddleware = require('../middleware/AuthMiddleware');
const RBACMiddleware = require('../middleware/RBACMiddleware');
const DecisionController = require('../controllers/DecisionController');
const { PERMISSIONS } = require('../utils/Constants');

const router = express.Router();
const auth = AuthMiddleware.authenticate;
const can = RBACMiddleware.require;
const ctrl = (req) => new DecisionController(req.catalystApp);

router.post('/', auth, can(PERMISSIONS.DECISION_WRITE), asyncHandler((req, res) => ctrl(req).createDecision(req, res)));
router.get('/', auth, can(PERMISSIONS.DECISION_READ), asyncHandler((req, res) => ctrl(req).listDecisions(req, res)));
router.put('/:decisionId', auth, can(PERMISSIONS.DECISION_WRITE), asyncHandler((req, res) => ctrl(req).updateDecision(req, res)));
router.delete('/:decisionId', auth, can(PERMISSIONS.DECISION_WRITE), asyncHandler((req, res) => ctrl(req).deleteDecision(req, res)));

module.exports = router;
