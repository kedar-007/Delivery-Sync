'use strict';

// Load .env for local development — in production set vars via
// Catalyst Console → Functions → delivery_sync_function → Environment Variables
require('dotenv').config();

const catalyst = require('zcatalyst-sdk-node');
const app = require('./src/app');

/**
 * Delivery Sync - Catalyst Serverless Function (advancedio)
 * Main entry point. Initializes Catalyst SDK per request and delegates to Express app.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
module.exports = (req, res) => {
  try {
    // Initialize Catalyst SDK with the incoming request (handles auth token resolution)
    req.catalystApp = catalyst.initialize(req);
  } catch (err) {
    // Catalyst init may fail for unauthenticated cron/public routes; handled downstream
    req.catalystApp = null;
  }
  // Admin-scoped app is needed for job-scheduling management operations
  // (createCron, deleteCron, getCrons). Falls back to catalystApp on failure.
  try {
    req.adminCatalystApp = catalyst.initialize(req, { scope: 'admin' });
  } catch (err) {
    req.adminCatalystApp = req.catalystApp;
  }
  app(req, res);
};
