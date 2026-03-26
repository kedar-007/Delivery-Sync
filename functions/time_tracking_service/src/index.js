'use strict';

const express = require('express');
const router  = express.Router();
const AuthMiddleware = require('./middleware/AuthMiddleware');
const timeRoutes     = require('./routes/timeRoutes');
const approvalRoutes = require('./routes/approvalRoutes');
const cronRoutes     = require('./routes/cronRoutes');

router.get('/health', (req, res) => res.json({ success: true, service: 'time_tracking_service', ts: Date.now() }));

router.use(AuthMiddleware.authenticate);
router.use('/entries',   timeRoutes);
router.use('/approvals', approvalRoutes);
router.use('/cron',      cronRoutes);

module.exports = router;
