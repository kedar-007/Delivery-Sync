'use strict';

const express          = require('express');
const asyncHandler     = require('express-async-handler');
const router           = express.Router({ mergeParams: true });
const RBACMiddleware   = require('../middleware/RBACMiddleware');
const ShareController  = require('../controllers/ShareController');
const { PERMISSIONS }  = require('../utils/Constants');

const ctrl = (req) => new ShareController(req.catalystSystemApp || req.catalystApp);

router.use(RBACMiddleware.requireProjectMember());

router.get('/',  RBACMiddleware.require(PERMISSIONS.DOC_SHARE), asyncHandler((req, res) => ctrl(req).list(req, res)));
router.post('/', RBACMiddleware.require(PERMISSIONS.DOC_SHARE), asyncHandler((req, res) => ctrl(req).create(req, res)));

module.exports = router;
