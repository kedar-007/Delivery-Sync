'use strict';
require('dotenv').config();
const catalyst = require('zcatalyst-sdk-node');
const app = require('./src/app');

module.exports = (req, res) => {
  // User-context app — needed for getCurrentUser() in AuthMiddleware
  try {
    req.catalystApp = catalyst.initialize(req);
  } catch (_) {
    req.catalystApp = null;
  }
  // System-context app — used by all controllers for DataStore access.
  // New tables default to restricted access; system auth bypasses that.
  try {
    req.catalystSystemApp = catalyst.initialize(req, { enableCatalystSystem: true });
    console.log('[doc_service] systemApp OK, userApp:', req.catalystApp ? 'OK' : 'null');
  } catch (err) {
    console.warn('[doc_service] systemApp FAILED — falling back to userApp:', err.message);
    req.catalystSystemApp = req.catalystApp;
  }
  app(req, res);
};
