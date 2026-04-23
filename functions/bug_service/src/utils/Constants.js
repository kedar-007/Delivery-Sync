'use strict';

// ─── All Catalyst Table Names ─────────────────────────────────────────────────
const TABLES = Object.freeze({
  // Core app tables (shared across all services)
  USERS:                  'users',
  TENANTS:                'tenants',

  // Bug-service-specific tables
  BUG_REPORTS:            'bug_reports',
  BUG_REPORT_ATTACHMENTS: 'bug_report_attachments',
  BUG_REPORT_CONFIG:      'bug_report_config',
});

// ─── Report Types ─────────────────────────────────────────────────────────────
const REPORT_TYPE = Object.freeze({
  BUG:             'BUG',
  FEEDBACK:        'FEEDBACK',
  ISSUE:           'ISSUE',
  FEATURE_REQUEST: 'FEATURE_REQUEST',
});

// ─── Severity Levels ──────────────────────────────────────────────────────────
const SEVERITY = Object.freeze({
  CRITICAL: 'CRITICAL',
  HIGH:     'HIGH',
  MEDIUM:   'MEDIUM',
  LOW:      'LOW',
});

// ─── Report Status ────────────────────────────────────────────────────────────
const STATUS = Object.freeze({
  OPEN:       'OPEN',
  IN_REVIEW:  'IN_REVIEW',
  RESOLVED:   'RESOLVED',
  CLOSED:     'CLOSED',
  DUPLICATE:  'DUPLICATE',
});

// ─── Priority Levels ──────────────────────────────────────────────────────────
const PRIORITY = Object.freeze({
  CRITICAL: 'CRITICAL',
  HIGH:     'HIGH',
  MEDIUM:   'MEDIUM',
  LOW:      'LOW',
});

// ─── Admin Roles (allowed to manage reports) ──────────────────────────────────
const ADMIN_ROLES = Object.freeze(['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO']);

// Special tenant_id used for platform-wide (cross-tenant) config
const PLATFORM_TENANT_ID = '__PLATFORM__';

module.exports = {
  TABLES,
  REPORT_TYPE,
  SEVERITY,
  STATUS,
  PRIORITY,
  ADMIN_ROLES,
  PLATFORM_TENANT_ID,
};
