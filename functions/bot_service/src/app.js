'use strict';

const express        = require('express');
const botRoutes      = require('./routes/botRoutes');
const ResponseHelper = require('./utils/ResponseHelper');

const app = express();

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Catalyst-Auth');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── Strip Catalyst function path prefix ──────────────────────────────────────
// In Catalyst, URLs arrive as /server/bot_service/api/...
// Strip the prefix so Express sees /api/...
app.use((req, _res, next) => {
  const PREFIX = '/server/bot_service';
  if (req.url.startsWith(PREFIX)) {
    req.url = req.url.slice(PREFIX.length) || '/';
  }
  next();
});

// ─── Request logger ───────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`[BotService] ${req.method} ${req.url}`);
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/bot', botRoutes);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'bot_service', timestamp: new Date().toISOString() });
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  ResponseHelper.notFound(res, `Route ${req.method} ${req.url} not found`);
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return ResponseHelper.validationError(res, 'Invalid JSON in request body');
  }
  console.error('[BotService Error]', err.message, err.stack);
  ResponseHelper.serverError(res, err.message);
});

module.exports = app;
