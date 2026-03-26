'use strict';
const express = require('express');
const router  = express.Router();
const RBACMiddleware  = require('../middleware/RBACMiddleware');
const LeaveController = require('../controllers/LeaveController');
const { PERMISSIONS } = require('../utils/Constants');
const ctrl = (req) => new LeaveController(req.catalystApp);

// ── Leave Types ───────────────────────────────────────────────────────────────
router.get('/types',                          RBACMiddleware.require(PERMISSIONS.LEAVE_READ),    (req, res) => ctrl(req).listTypes(req, res));
router.post('/types',                         RBACMiddleware.require(PERMISSIONS.LEAVE_ADMIN),   (req, res) => ctrl(req).createType(req, res));
router.put('/types/:typeId',                  RBACMiddleware.require(PERMISSIONS.LEAVE_ADMIN),   (req, res) => ctrl(req).updateType(req, res));

// ── Leave Balance — specific routes BEFORE dynamic /:userId ──────────────────
router.get('/balance/all',                    RBACMiddleware.require(PERMISSIONS.LEAVE_ADMIN),   (req, res) => ctrl(req).getAllBalances(req, res));  
router.post('/balance/set',                   RBACMiddleware.require(PERMISSIONS.LEAVE_ADMIN),   (req, res) => ctrl(req).setBalance(req, res));     
router.get('/balance',                        RBACMiddleware.require(PERMISSIONS.LEAVE_READ),    (req, res) => ctrl(req).getBalance(req, res));
router.get('/balance/:userId',                RBACMiddleware.require(PERMISSIONS.LEAVE_READ),    (req, res) => ctrl(req).getBalance(req, res));     

// ── Leave Requests ────────────────────────────────────────────────────────────
router.get('/requests',                       RBACMiddleware.require(PERMISSIONS.LEAVE_READ),    (req, res) => ctrl(req).listRequests(req, res));
router.get('/requests/:requestId',            RBACMiddleware.require(PERMISSIONS.LEAVE_READ),    (req, res) => ctrl(req).getRequest(req, res));
router.post('/request',                       RBACMiddleware.require(PERMISSIONS.LEAVE_WRITE),   (req, res) => ctrl(req).applyLeave(req, res));
router.post('/requests',                      RBACMiddleware.require(PERMISSIONS.LEAVE_WRITE),   (req, res) => ctrl(req).applyLeave(req, res));
router.delete('/requests/:requestId',         RBACMiddleware.require(PERMISSIONS.LEAVE_WRITE),   (req, res) => ctrl(req).cancelRequest(req, res));
router.patch('/requests/:requestId/cancel',   RBACMiddleware.require(PERMISSIONS.LEAVE_WRITE),   (req, res) => ctrl(req).cancelRequest(req, res));
router.patch('/requests/:requestId/approve',  RBACMiddleware.require(PERMISSIONS.LEAVE_APPROVE), (req, res) => ctrl(req).approveRequest(req, res));
router.patch('/requests/:requestId/reject',   RBACMiddleware.require(PERMISSIONS.LEAVE_APPROVE), (req, res) => ctrl(req).rejectRequest(req, res));

// ── Calendar ──────────────────────────────────────────────────────────────────
router.get('/calendar',                       RBACMiddleware.require(PERMISSIONS.LEAVE_READ),    (req, res) => ctrl(req).calendar(req, res));
router.get('/overlaps',                       RBACMiddleware.require(PERMISSIONS.LEAVE_READ),    (req, res) => ctrl(req).checkOverlap(req, res));

// ── Company Calendar ──────────────────────────────────────────────────────────
router.get('/company-calendar',               RBACMiddleware.require(PERMISSIONS.LEAVE_READ),    (req, res) => ctrl(req).getCompanyCalendar(req, res));
router.post('/company-calendar',              RBACMiddleware.require(PERMISSIONS.LEAVE_ADMIN),   (req, res) => ctrl(req).createHoliday(req, res));
router.delete('/company-calendar/:holidayId', RBACMiddleware.require(PERMISSIONS.LEAVE_ADMIN),   (req, res) => ctrl(req).deleteHoliday(req, res));

module.exports = router;