'use strict';

const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const projectRoutes = require('./projectRoutes');
const standupRoutes = require('./standupRoutes');
const eodRoutes = require('./eodRoutes');
const actionRoutes = require('./actionRoutes');
const blockerRoutes = require('./blockerRoutes');
const raidRoutes = require('./raidRoutes');
const decisionRoutes = require('./decisionRoutes');
const reportRoutes = require('./reportRoutes');
const adminRoutes = require('./adminRoutes');
const cronRoutes = require('./cronRoutes');
const superAdminRoutes = require('./superAdminRoutes');
const userRoutes = require('./userRoutes');

router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/projects', projectRoutes);
router.use('/standups', standupRoutes);
router.use('/eod', eodRoutes);
router.use('/actions', actionRoutes);
router.use('/blockers', blockerRoutes);
router.use('/raid', raidRoutes);
router.use('/decisions', decisionRoutes);
router.use('/reports', reportRoutes);
router.use('/admin', adminRoutes);
router.use('/cron', cronRoutes);
router.use('/super-admin', superAdminRoutes);
router.use('/users', userRoutes);

// Health check
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'delivery-sync', timestamp: new Date().toISOString() });
});

module.exports = router;
