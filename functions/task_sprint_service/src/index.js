'use strict';

const express = require('express');
const router = express.Router();

const AuthMiddleware = require('./middleware/AuthMiddleware');
const sprintRoutes   = require('./routes/sprintRoutes');
const taskRoutes     = require('./routes/taskRoutes');
const cronRoutes     = require('./routes/cronRoutes');

router.get('/health', (req, res) => res.json({ success: true, service: 'task_sprint_service', ts: Date.now() }));

router.use(AuthMiddleware.authenticate);
router.use('/sprints', sprintRoutes);
router.use('/tasks',   taskRoutes);
router.use('/backlog', taskRoutes);

router.use('/cron', cronRoutes);

module.exports = router;
