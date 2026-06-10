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
  try {
    req.adminCatalystApp = catalyst.initialize(req, { scope: 'admin' });
  } catch (err) {
    req.adminCatalystApp = req.catalystApp;
  }
  app(req, res);
};
