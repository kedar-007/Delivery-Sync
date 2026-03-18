'use strict';

// Load .env for local development — dotenv is optional so the function doesn't
// crash in Catalyst Cloud where env vars are injected by the platform directly.
try { require('dotenv').config(); } catch (_) { /* not installed — running in Catalyst cloud */ }

const catalyst = require('zcatalyst-sdk-node');
const app = require('./src/app');

/**
 * DeliverSync AI Service — Catalyst Advanced IO Function
 * Entry point: initialises Catalyst SDK per request, delegates to Express.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse}  res
 */
module.exports = (req, res) => {
  try {
    req.catalystApp = catalyst.initialize(req);
  } catch (err) {
    // Initialize may fail for unauthenticated probes; handled by AuthMiddleware.
    req.catalystApp = null;
  }
  app(req, res);
};
