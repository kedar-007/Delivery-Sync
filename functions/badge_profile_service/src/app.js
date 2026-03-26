'use strict';
const express = require('express');
const fileUpload = require('express-fileupload'); // add this
const routes  = require('./index');
const ResponseHelper = require('./utils/ResponseHelper');

const app = express();
const PREFIX = '/server/badge_profile_service';

// body parsers
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// file upload middleware
app.use(fileUpload({
  useTempFiles: true,
  tempFileDir: '/tmp/'
}));

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Catalyst-Auth');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// prefix handling
app.use((req, _res, next) => {
  if (req.url.startsWith(PREFIX)) {
    req.url = req.url.slice(PREFIX.length) || '/';
  }
  next();
});

// routes
app.use('/api/bp', routes);

// 404
app.use((req, res) =>
  ResponseHelper.notFound(res, `Route ${req.method} ${req.url} not found`)
);

// error handler
app.use((err, req, res, _next) => {
  console.error('[BadgeProfileService Error]', err.message);
  if (err.isValidation) return ResponseHelper.validationError(res, err.message, err.details);
  if (err.isRBAC) return ResponseHelper.forbidden(res, err.message);
  ResponseHelper.serverError(res, err.message);
});

module.exports = app;