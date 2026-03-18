'use strict';

const express = require('express');
const asyncHandler = require('express-async-handler');
const AuthMiddleware = require('../middleware/AuthMiddleware');
const RBACMiddleware = require('../middleware/RBACMiddleware');
const TeamController = require('../controllers/TeamController');
const { PERMISSIONS } = require('../utils/Constants');

const router = express.Router();
const auth = AuthMiddleware.authenticate;
const can = RBACMiddleware.require;
const ctrl = (req) => new TeamController(req.catalystApp);

// Team CRUD
router.post('/',    auth, can(PERMISSIONS.TEAM_WRITE), asyncHandler((req, res) => ctrl(req).createTeam(req, res)));
router.get('/',     auth, can(PERMISSIONS.TEAM_READ),  asyncHandler((req, res) => ctrl(req).getTeams(req, res)));
router.get('/:teamId',  auth, can(PERMISSIONS.TEAM_READ),  asyncHandler((req, res) => ctrl(req).getTeam(req, res)));
router.put('/:teamId',  auth, can(PERMISSIONS.TEAM_WRITE), asyncHandler((req, res) => ctrl(req).updateTeam(req, res)));
router.delete('/:teamId', auth, can(PERMISSIONS.TEAM_WRITE), asyncHandler((req, res) => ctrl(req).deleteTeam(req, res)));

// Team member management
router.post('/:teamId/members', auth, can(PERMISSIONS.TEAM_WRITE), asyncHandler((req, res) => ctrl(req).addTeamMember(req, res)));
router.delete('/:teamId/members/:memberId', auth, can(PERMISSIONS.TEAM_WRITE), asyncHandler((req, res) => ctrl(req).removeTeamMember(req, res)));

module.exports = router;
