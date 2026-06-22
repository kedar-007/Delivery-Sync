'use strict';

const express             = require('express');
const asyncHandler        = require('express-async-handler');
const router              = express.Router({ mergeParams: true });
const RBACMiddleware      = require('../middleware/RBACMiddleware');
const DocumentController  = require('../controllers/DocumentController');
const { PERMISSIONS }     = require('../utils/Constants');

const ctrl = (req) => new DocumentController(req.catalystSystemApp || req.catalystApp);

router.use(RBACMiddleware.requireProjectMember());

router.get('/',                    RBACMiddleware.require(PERMISSIONS.DOC_READ),  asyncHandler((req, res) => ctrl(req).list(req, res)));
router.post('/',                   RBACMiddleware.require(PERMISSIONS.DOC_WRITE), asyncHandler((req, res) => ctrl(req).upload(req, res)));
router.get('/:docId',              RBACMiddleware.require(PERMISSIONS.DOC_READ),  asyncHandler((req, res) => ctrl(req).getById(req, res)));
router.put('/:docId',              RBACMiddleware.require(PERMISSIONS.DOC_WRITE), asyncHandler((req, res) => ctrl(req).update(req, res)));
router.delete('/:docId',           RBACMiddleware.require(PERMISSIONS.DOC_DELETE),asyncHandler((req, res) => ctrl(req).remove(req, res)));
router.post('/:docId/versions',    RBACMiddleware.require(PERMISSIONS.DOC_WRITE), asyncHandler((req, res) => ctrl(req).uploadVersion(req, res)));
router.get('/:docId/versions',     RBACMiddleware.require(PERMISSIONS.DOC_READ),  asyncHandler((req, res) => ctrl(req).getVersions(req, res)));

module.exports = router;
