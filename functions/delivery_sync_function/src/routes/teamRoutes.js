'use strict';

const express = require('express');
const asyncHandler = require('express-async-handler');
const AuthMiddleware = require('../middleware/AuthMiddleware');
const RBACMiddleware = require('../middleware/RBACMiddleware');
const TeamController = require('../controllers/TeamController');
const { PERMISSIONS } = require('../utils/Constants');

const router = express.Router();
const auth = AuthMiddleware.authenticate;
const can    = RBACMiddleware.require;
const canAny = RBACMiddleware.requireAny;
// Use admin app for job-scheduling management (cron create/delete).
// Falls back to regular catalystApp for local dev where adminCatalystApp may not be set.
const ctrl = (req) => new TeamController(req.adminCatalystApp || req.catalystApp);

// Team CRUD
// TEAM_MANAGE = create / delete (admin-level actions matching the admin UI permission matrix)
// TEAM_WRITE  = edit team details + manage members (granted to leads/managers)
// TEAM_MANAGE also unlocks TEAM_WRITE actions (higher permission implies lower)
router.post('/',    auth, can(PERMISSIONS.TEAM_MANAGE), asyncHandler((req, res) => ctrl(req).createTeam(req, res)));
router.get('/',     auth, can(PERMISSIONS.TEAM_READ),   asyncHandler((req, res) => ctrl(req).getTeams(req, res)));
// Team peers — resolves the caller's team-scope user set (no extra perm needed;
// only returns users from teams they're already in or lead). Used to populate
// the User filter dropdown on Team Standups / Team EOD views.
router.get('/peers', auth,                             asyncHandler((req, res) => ctrl(req).getMyTeamPeers(req, res)));
router.get('/:teamId',  auth, can(PERMISSIONS.TEAM_READ),  asyncHandler((req, res) => ctrl(req).getTeam(req, res)));
router.put('/:teamId',  auth, canAny(PERMISSIONS.TEAM_WRITE, PERMISSIONS.TEAM_MANAGE), asyncHandler((req, res) => ctrl(req).updateTeam(req, res)));
router.delete('/:teamId', auth, can(PERMISSIONS.TEAM_MANAGE), asyncHandler((req, res) => ctrl(req).deleteTeam(req, res)));

// Team member management — both TEAM_WRITE (leads) and TEAM_MANAGE (admins) can manage members
router.post('/:teamId/members', auth, canAny(PERMISSIONS.TEAM_WRITE, PERMISSIONS.TEAM_MANAGE), asyncHandler((req, res) => ctrl(req).addTeamMember(req, res)));
router.patch('/:teamId/members/:memberId', auth, canAny(PERMISSIONS.TEAM_WRITE, PERMISSIONS.TEAM_MANAGE), asyncHandler((req, res) => ctrl(req).updateTeamMember(req, res)));
router.delete('/:teamId/members/:memberId', auth, canAny(PERMISSIONS.TEAM_WRITE, PERMISSIONS.TEAM_MANAGE), asyncHandler((req, res) => ctrl(req).removeTeamMember(req, res)));

module.exports = router;
