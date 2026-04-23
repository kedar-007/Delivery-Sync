'use strict';

require('dotenv').config();

const catalyst = require('zcatalyst-sdk-node');
const app      = require('./src/app');

module.exports = (req, res) => {
  try {
    req.catalystApp = catalyst.initialize(req);
  } catch (err) {
    req.catalystApp = null;
  }
  app(req, res);
};
