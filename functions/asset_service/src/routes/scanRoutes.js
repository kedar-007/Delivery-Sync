'use strict';
const express              = require('express');
const router               = express.Router();
const asyncHandler         = require('express-async-handler');
const RBACMiddleware       = require('../middleware/RBACMiddleware');
const AssetScanController  = require('../controllers/AssetScanController');
const { PERMISSIONS }      = require('../utils/Constants');

const ctrl = (req) => new AssetScanController(req.catalystApp);
// Anyone with asset read access can scan a sticker. The controller decides
// the response tier: FULL when the caller holds ASSET_SCAN_FULL, BASIC
// (owner-lookup only) otherwise. ASSET_SCAN_BASIC remains accepted for
// backwards compatibility with users explicitly granted that key.
const scanGate = RBACMiddleware.requireAny(
  PERMISSIONS.ASSET_READ,
  PERMISSIONS.ASSET_SCAN_FULL,
  PERMISSIONS.ASSET_SCAN_BASIC,
);

// Native scan — client decodes the QR and sends the raw token.
router.get('/:token', scanGate, asyncHandler((req, res) => ctrl(req).scanByToken(req, res)));

// Zia fallback — client uploads an image, server decodes via Zia Barcode Scanner.
router.post('/decode', scanGate, asyncHandler((req, res) => ctrl(req).decodeAndScan(req, res)));

module.exports = router;
