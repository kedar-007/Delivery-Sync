'use strict';

const express          = require('express');
const asyncHandler     = require('express-async-handler');
const router           = express.Router({ mergeParams: true });
const RBACMiddleware   = require('../middleware/RBACMiddleware');
const FolderController = require('../controllers/FolderController');
const { PERMISSIONS }  = require('../utils/Constants');

const ctrl = (req) => new FolderController(req.catalystSystemApp || req.catalystApp);

router.use(RBACMiddleware.requireProjectMember());

router.get('/',                     RBACMiddleware.require(PERMISSIONS.DOC_READ),   asyncHandler((req, res) => ctrl(req).list(req, res)));
router.post('/',                    RBACMiddleware.require(PERMISSIONS.DOC_WRITE),  asyncHandler((req, res) => ctrl(req).create(req, res)));
router.put('/:folderId',            RBACMiddleware.require(PERMISSIONS.DOC_WRITE),  asyncHandler((req, res) => ctrl(req).rename(req, res)));
router.delete('/:folderId',         RBACMiddleware.require(PERMISSIONS.DOC_DELETE), asyncHandler((req, res) => ctrl(req).remove(req, res)));
router.get('/:folderId/contents',   RBACMiddleware.require(PERMISSIONS.DOC_READ),   asyncHandler((req, res) => ctrl(req).getContents(req, res)));
router.put('/:folderId/access',     RBACMiddleware.require(PERMISSIONS.DOC_ADMIN),  asyncHandler((req, res) => ctrl(req).updateAccess(req, res)));

module.exports = router;
