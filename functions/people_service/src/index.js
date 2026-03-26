'use strict';
const express = require('express');
const router  = express.Router();
const AuthMiddleware        = require('./middleware/AuthMiddleware');
const attendanceRoutes      = require('./routes/attendanceRoutes');
const leaveRoutes           = require('./routes/leaveRoutes');
const announcementRoutes    = require('./routes/announcementRoutes');
const orgRoutes             = require('./routes/orgRoutes');
const cronRoutes            = require('./routes/cronRoutes');

router.get('/health', (req, res) => res.json({ success: true, service: 'people_service', ts: Date.now() }));
router.use(AuthMiddleware.authenticate);
router.use('/attendance',    attendanceRoutes);
router.use('/leave',         leaveRoutes);
router.use('/announcements', announcementRoutes);
router.use('/org',           orgRoutes);
router.use('/cron',          cronRoutes);
module.exports = router;
