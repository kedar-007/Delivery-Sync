'use strict';
const express = require('express');
const router  = express.Router();
const RBACMiddleware    = require('../middleware/RBACMiddleware');
const ApprovalController = require('../controllers/ApprovalController');
const { PERMISSIONS } = require('../utils/Constants');

const ctrl = (req) => new ApprovalController(req.catalystApp);

router.get('/',                         RBACMiddleware.require(PERMISSIONS.TIME_APPROVE), (req, res) => ctrl(req).list(req, res));
router.get('/history',                  RBACMiddleware.require(PERMISSIONS.TIME_APPROVE), (req, res) => ctrl(req).history(req, res));
router.patch('/:requestId/approve',     RBACMiddleware.require(PERMISSIONS.TIME_APPROVE), (req, res) => ctrl(req).approve(req, res));
router.patch('/:requestId/reject',      RBACMiddleware.require(PERMISSIONS.TIME_APPROVE), (req, res) => ctrl(req).reject(req, res));
router.patch('/:requestId/escalate',    RBACMiddleware.require(PERMISSIONS.TIME_APPROVE), (req, res) => ctrl(req).escalate(req, res));
module.exports = router;
