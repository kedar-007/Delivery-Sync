'use strict';

const express = require('express');
const router  = express.Router();
const RBACMiddleware       = require('../middleware/RBACMiddleware');
const TaskController       = require('../controllers/TaskController');
const AttachmentController = require('../controllers/AttachmentController');
const { PERMISSIONS } = require('../utils/Constants');

const ctrl = (req) => new TaskController(req.catalystApp);

router.get('/my-tasks',                         RBACMiddleware.require(PERMISSIONS.TASK_READ),         (req, res) => ctrl(req).myTasks(req, res));
router.get('/overdue',                          RBACMiddleware.require(PERMISSIONS.TASK_READ),         (req, res) => ctrl(req).overdue(req, res));
router.get('/',                                 RBACMiddleware.require(PERMISSIONS.TASK_READ),         (req, res) => ctrl(req).list(req, res));
router.post('/',                                RBACMiddleware.require(PERMISSIONS.TASK_WRITE),        (req, res) => ctrl(req).create(req, res));
router.get('/:taskId',                          RBACMiddleware.require(PERMISSIONS.TASK_READ),         (req, res) => ctrl(req).getById(req, res));
router.put('/:taskId',                          RBACMiddleware.require(PERMISSIONS.TASK_WRITE),        (req, res) => ctrl(req).update(req, res));
router.delete('/:taskId',                       RBACMiddleware.require(PERMISSIONS.TASK_WRITE),        (req, res) => ctrl(req).remove(req, res));
router.patch('/:taskId/status',                 RBACMiddleware.require(PERMISSIONS.TASK_WRITE),        (req, res) => ctrl(req).updateStatus(req, res));
router.patch('/:taskId/assign',                 RBACMiddleware.require(PERMISSIONS.TASK_WRITE),        (req, res) => ctrl(req).assign(req, res));
router.patch('/:taskId/move-sprint',            RBACMiddleware.require(PERMISSIONS.TASK_WRITE),        (req, res) => ctrl(req).moveSprint(req, res));
router.get('/:taskId/history',                  RBACMiddleware.require(PERMISSIONS.TASK_READ),         (req, res) => ctrl(req).getHistory(req, res));
router.get('/:taskId/comments',                 RBACMiddleware.require(PERMISSIONS.TASK_READ),         (req, res) => ctrl(req).getComments(req, res));
router.post('/:taskId/comments',                RBACMiddleware.require(PERMISSIONS.TASK_COMMENT_WRITE),(req, res) => ctrl(req).addComment(req, res));
router.delete('/:taskId/comments/:cid',         RBACMiddleware.require(PERMISSIONS.TASK_COMMENT_WRITE),(req, res) => ctrl(req).deleteComment(req, res));

// Attachments
const att = (req) => new AttachmentController(req.catalystApp);
router.post('/:taskId/attachments',   RBACMiddleware.require(PERMISSIONS.TASK_WRITE), (req, res) => att(req).upload(req, res));
router.delete('/:taskId/attachments/:attachId', RBACMiddleware.require(PERMISSIONS.TASK_WRITE), (req, res) => att(req).remove(req, res));

module.exports = router;
