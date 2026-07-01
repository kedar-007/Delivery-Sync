'use strict';

const express = require('express');
const asyncHandler = require('express-async-handler');
const AuthMiddleware = require('../middleware/AuthMiddleware');
const RBACMiddleware = require('../middleware/RBACMiddleware');
const AdminTrashController = require('../controllers/AdminTrashController');
const { PERMISSIONS } = require('../utils/Constants');

const router = express.Router();
const auth = AuthMiddleware.authenticate;
const can = RBACMiddleware.require;
const ctrl = (req) => new AdminTrashController(req.catalystApp);

// Org-wide trash listing (all modules, who deleted, when).
router.get('/', auth, can(PERMISSIONS.ADMIN_TRASH_VIEW), asyncHandler((req, res) => ctrl(req).list(req, res)));

// Restore / permanently purge a specific trashed record.
router.post('/:module/:id/restore', auth, can(PERMISSIONS.ADMIN_TRASH_RESTORE), asyncHandler((req, res) => ctrl(req).restore(req, res)));
router.delete('/:module/:id',       auth, can(PERMISSIONS.ADMIN_TRASH_PURGE),   asyncHandler((req, res) => ctrl(req).purge(req, res)));

module.exports = router;
