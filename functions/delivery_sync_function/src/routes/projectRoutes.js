'use strict';

const express = require('express');
const asyncHandler = require('express-async-handler');
const AuthMiddleware = require('../middleware/AuthMiddleware');
const RBACMiddleware = require('../middleware/RBACMiddleware');
const ProjectController = require('../controllers/ProjectController');
const MemberController = require('../controllers/MemberController');
const { PERMISSIONS } = require('../utils/Constants');

const router = express.Router();
const auth = AuthMiddleware.authenticate;
const can = RBACMiddleware.require;
const member = RBACMiddleware.requireProjectMember;
const projCtrl = (req) => new ProjectController(req.catalystApp);
const memCtrl = (req) => new MemberController(req.catalystApp);

// Projects CRUD
router.post('/', auth, can(PERMISSIONS.PROJECT_WRITE), asyncHandler((req, res) => projCtrl(req).createProject(req, res)));
router.get('/', auth, can(PERMISSIONS.PROJECT_READ), asyncHandler((req, res) => projCtrl(req).getProjects(req, res)));
router.get('/:projectId', auth, can(PERMISSIONS.PROJECT_READ), member(), asyncHandler((req, res) => projCtrl(req).getProjectDetails(req, res)));
router.put('/:projectId', auth, can(PERMISSIONS.PROJECT_WRITE), member(), asyncHandler((req, res) => projCtrl(req).updateProject(req, res)));
router.patch('/:projectId/rag', auth, can(PERMISSIONS.PROJECT_WRITE), member(), asyncHandler((req, res) => projCtrl(req).updateProjectRAG(req, res)));

// Milestones (nested under project)
router.get('/:projectId/milestones', auth, can(PERMISSIONS.MILESTONE_READ), member(), asyncHandler((req, res) => projCtrl(req).getMilestones(req, res)));
router.post('/:projectId/milestones', auth, can(PERMISSIONS.MILESTONE_WRITE), member(), asyncHandler((req, res) => projCtrl(req).createMilestone(req, res)));
router.put('/:projectId/milestones/:milestoneId', auth, can(PERMISSIONS.MILESTONE_WRITE), member(), asyncHandler((req, res) => projCtrl(req).updateMilestone(req, res)));

// Members (nested under project)
router.get('/:projectId/members', auth, can(PERMISSIONS.PROJECT_READ), member(), asyncHandler((req, res) => memCtrl(req).listMembers(req, res)));
router.post('/:projectId/members', auth, can(PERMISSIONS.PROJECT_WRITE), asyncHandler((req, res) => memCtrl(req).addMember(req, res)));
router.delete('/:projectId/members/:memberId', auth, can(PERMISSIONS.PROJECT_WRITE), asyncHandler((req, res) => memCtrl(req).removeMember(req, res)));

module.exports = router;
