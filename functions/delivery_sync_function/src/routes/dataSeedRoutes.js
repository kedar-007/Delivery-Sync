'use strict';

const express        = require('express');
const asyncHandler   = require('express-async-handler');
const AuthMiddleware = require('../middleware/AuthMiddleware');
const RBACMiddleware = require('../middleware/RBACMiddleware');
const DataSeedController = require('../controllers/DataSeedController');
const { PERMISSIONS } = require('../utils/Constants');

const router = express.Router();
const auth   = AuthMiddleware.authenticate;
const can    = RBACMiddleware.require;
const ctrl   = (req) => new DataSeedController(req.catalystApp);

router.get('/stats',  auth, can(PERMISSIONS.DATA_SEED), asyncHandler((req, res) => ctrl(req).stats(req, res)));
router.post('/run',   auth, can(PERMISSIONS.DATA_SEED), asyncHandler((req, res) => ctrl(req).run(req, res)));
router.delete('/clear', auth, can(PERMISSIONS.DATA_SEED), asyncHandler((req, res) => ctrl(req).clear(req, res)));

module.exports = router;
