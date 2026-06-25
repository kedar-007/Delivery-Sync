'use strict';
const express = require('express');
const router  = express.Router();
const asyncHandler = require('express-async-handler');
const RBACMiddleware = require('../middleware/RBACMiddleware');
const TimeController = require('../controllers/TimeController');
const { PERMISSIONS } = require('../utils/Constants');

const ctrl = (req) => new TimeController(req.catalystApp);

// asyncHandler forwards any rejected promise to the global error handler in
// app.js instead of letting it become an unhandled rejection that crashes the
// whole function process (which would then ECONNREFUSED every later request).
router.get('/analytics/org',    RBACMiddleware.require(PERMISSIONS.TIME_ANALYTICS), asyncHandler((req, res) => ctrl(req).orgAnalytics(req, res)));
router.get('/analytics/team',   RBACMiddleware.require(PERMISSIONS.TIME_ANALYTICS), asyncHandler((req, res) => ctrl(req).teamAnalytics(req, res)));
router.get('/analytics/user',   RBACMiddleware.require(PERMISSIONS.TIME_ANALYTICS), asyncHandler((req, res) => ctrl(req).userActivity(req, res)));
router.get('/my-week',          RBACMiddleware.require(PERMISSIONS.TIME_READ),  asyncHandler((req, res) => ctrl(req).myWeek(req, res)));
router.get('/summary',          RBACMiddleware.require(PERMISSIONS.TIME_READ),  asyncHandler((req, res) => ctrl(req).summary(req, res)));
router.get('/',                 RBACMiddleware.require(PERMISSIONS.TIME_READ),  asyncHandler((req, res) => ctrl(req).list(req, res)));
router.post('/',                RBACMiddleware.require(PERMISSIONS.TIME_WRITE), asyncHandler((req, res) => ctrl(req).create(req, res)));
router.get('/:entryId',         RBACMiddleware.require(PERMISSIONS.TIME_READ),  asyncHandler((req, res) => ctrl(req).getById(req, res)));
router.put('/:entryId',         RBACMiddleware.require(PERMISSIONS.TIME_WRITE), asyncHandler((req, res) => ctrl(req).update(req, res)));
router.delete('/:entryId',      RBACMiddleware.require(PERMISSIONS.TIME_WRITE), asyncHandler((req, res) => ctrl(req).remove(req, res)));
router.patch('/:entryId/submit',  RBACMiddleware.require(PERMISSIONS.TIME_WRITE), asyncHandler((req, res) => ctrl(req).submit(req, res)));
router.patch('/:entryId/retract', RBACMiddleware.require(PERMISSIONS.TIME_WRITE), asyncHandler((req, res) => ctrl(req).retract(req, res)));
router.post('/bulk-submit',     RBACMiddleware.require(PERMISSIONS.TIME_WRITE), asyncHandler((req, res) => ctrl(req).bulkSubmit(req, res)));
module.exports = router;
