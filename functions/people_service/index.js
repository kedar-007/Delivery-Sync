'use strict';
require('dotenv').config();
const catalyst = require('zcatalyst-sdk-node');
const app = require('./src/app');

module.exports = (req, res) => {
  try {
    req.catalystApp = catalyst.initialize(req);
  } catch (err) {
    req.catalystApp = null;
  }
  // Admin-scoped app uses the project's admin credentials so DataStore writes
  // to restricted tables (tenants) work for non-TENANT_ADMIN Catalyst users.
  // RBAC permission checks still happen at our middleware layer.
  try {
    req.adminCatalystApp = catalyst.initialize(req, { scope: 'admin' });
  } catch (err) {
    req.adminCatalystApp = req.catalystApp;
  }
  app(req, res);
};
