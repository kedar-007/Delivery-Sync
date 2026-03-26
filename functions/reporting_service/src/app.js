'use strict';

const express       = require('express');
const ResponseHelper = require('./utils/ResponseHelper');
const AuthMiddleware = require('./middleware/AuthMiddleware');

const reportRoutes = require('./routes/reportRoutes');
const pdfRoutes    = require('./routes/pdfRoutes');
const publicRoutes = require('./routes/publicRoutes');

const app    = express();
const PREFIX = '/server/reporting_service';

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── CORS ───────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Catalyst-Auth');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Strip service prefix ───────────────────────────────────────────────────────
app.use((req, _res, next) => {
  if (req.url.startsWith(PREFIX)) req.url = req.url.slice(PREFIX.length) || '/';
  next();
});

// ── Health check (no auth) ─────────────────────────────────────────────────────
app.get('/api/reports/health', (_req, res) =>
  res.json({ success: true, service: 'reporting_service', ts: Date.now() })
);

// ── Public routes (no auth) ────────────────────────────────────────────────────
app.use('/api/public/reports', publicRoutes);

// ── Protected routes ───────────────────────────────────────────────────────────
app.use('/api/reports', AuthMiddleware.authenticate);
app.use('/api/reports/pdf', pdfRoutes);
app.use('/api/reports', reportRoutes);

// ── 404 catch-all ──────────────────────────────────────────────────────────────
app.use((req, res) =>
  ResponseHelper.notFound(res, `Route ${req.method} ${req.url} not found`)
);

// ── Global error handler ───────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('[reporting_service error]', err.message);
  if (err.isValidation) return ResponseHelper.validationError(res, err.message, err.details);
  if (err.isRBAC)       return ResponseHelper.forbidden(res, err.message);
  ResponseHelper.serverError(res, err.message);
});

module.exports = app;
