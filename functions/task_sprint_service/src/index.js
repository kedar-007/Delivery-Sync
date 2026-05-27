'use strict';

const express = require('express');
const router = express.Router();

const AuthMiddleware   = require('./middleware/AuthMiddleware');
const RBACMiddleware   = require('./middleware/RBACMiddleware');
const sprintRoutes     = require('./routes/sprintRoutes');
const taskRoutes       = require('./routes/taskRoutes');
const cronRoutes       = require('./routes/cronRoutes');
const TaskController   = require('./controllers/TaskController');
const { PERMISSIONS }  = require('./utils/Constants');

router.get('/health', (req, res) => res.json({ success: true, service: 'task_sprint_service', ts: Date.now() }));

router.use(AuthMiddleware.authenticate);
router.use('/sprints', sprintRoutes);
router.use('/tasks',   taskRoutes);

// Dedicated backlog endpoint — returns only sprint_id=0 tasks for the project.
// Previously this re-used taskRoutes (which called TaskController.list and returned
// ALL tasks regardless of sprint). Now it calls getBacklog directly so only unsprinted
// items appear, and requireProjectMember ensures the caller belongs to the project.
router.get('/backlog',
  RBACMiddleware.require(PERMISSIONS.TASK_READ),
  RBACMiddleware.requireProjectMember(),
  (req, res) => new TaskController(req.catalystApp).getBacklog(req, res)
);

router.use('/cron', cronRoutes);

module.exports = router;
