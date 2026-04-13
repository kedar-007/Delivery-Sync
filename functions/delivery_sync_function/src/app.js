'use strict';

const express = require('express');
const routes = require('./routes');
const ResponseHelper = require('./utils/ResponseHelper');

const app = express();

// ─── Body Parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── CORS (Catalyst handles this, but allow local dev) ───────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Catalyst-Auth');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// ─── Strip Catalyst function path prefix ─────────────────────────────────────
// In Catalyst, URLs arrive as /server/delivery_sync_function/api/...
// We strip the prefix so Express sees /api/...
app.use((req, _res, next) => {
  const PREFIX = '/server/delivery_sync_function';
  if (req.url.startsWith(PREFIX)) {
    req.url = req.url.slice(PREFIX.length) || '/';
  }
  next();
});

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api', routes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  ResponseHelper.notFound(res, `Route ${req.method} ${req.url} not found`);
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  // Malformed JSON body — return 400 not 500
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return ResponseHelper.validationError(res, 'Invalid JSON in request body');
  }
  console.error('[DeliverySync Error]', err.message, err.stack);
  if (err.isValidation) {
    return ResponseHelper.validationError(res, err.message, err.details);
  }
  if (err.isRBAC) {
    return ResponseHelper.forbidden(res, err.message);
  }
  ResponseHelper.serverError(res, err.message);
});

module.exports = app;
