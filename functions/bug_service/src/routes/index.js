'use strict';

const express       = require('express');
const router        = express.Router();
const bugRoutes     = require('./bugRoutes');
const configRoutes  = require('./configRoutes');

// Mount all bug service sub-routes
router.use('/', bugRoutes);
router.use('/', configRoutes);

module.exports = router;
