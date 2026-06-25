'use strict';

const express = require('express');
const router  = express.Router();
const asyncHandler = require('express-async-handler');
const RBACMiddleware  = require('../middleware/RBACMiddleware');
const SprintController = require('../controllers/SprintController');
const { PERMISSIONS } = require('../utils/Constants');

const ctrl = (req) => new SprintController(req.catalystApp);

router.get('/',                             RBACMiddleware.require(PERMISSIONS.SPRINT_READ),  asyncHandler((req, res) => ctrl(req).list(req, res)));
router.post('/',                            RBACMiddleware.require(PERMISSIONS.SPRINT_WRITE), asyncHandler((req, res) => ctrl(req).create(req, res)));
router.get('/:sprintId',                    RBACMiddleware.require(PERMISSIONS.SPRINT_READ),  asyncHandler((req, res) => ctrl(req).getById(req, res)));
router.put('/:sprintId',                    RBACMiddleware.require(PERMISSIONS.SPRINT_WRITE), asyncHandler((req, res) => ctrl(req).update(req, res)));
router.patch('/:sprintId/start',            RBACMiddleware.require(PERMISSIONS.SPRINT_WRITE), asyncHandler((req, res) => ctrl(req).start(req, res)));
router.patch('/:sprintId/complete',         RBACMiddleware.require(PERMISSIONS.SPRINT_WRITE), asyncHandler((req, res) => ctrl(req).complete(req, res)));
router.get('/:sprintId/board',              RBACMiddleware.require(PERMISSIONS.SPRINT_READ),  asyncHandler((req, res) => ctrl(req).getBoard(req, res)));
router.get('/:sprintId/velocity',           RBACMiddleware.require(PERMISSIONS.SPRINT_READ),  asyncHandler((req, res) => ctrl(req).getVelocity(req, res)));
router.post('/:sprintId/members',           RBACMiddleware.require(PERMISSIONS.SPRINT_WRITE), asyncHandler((req, res) => ctrl(req).addMember(req, res)));
router.delete('/:sprintId/members/:uid',    RBACMiddleware.require(PERMISSIONS.SPRINT_WRITE), asyncHandler((req, res) => ctrl(req).removeMember(req, res)));

module.exports = router;
