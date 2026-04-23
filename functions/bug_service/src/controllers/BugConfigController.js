'use strict';

const ResponseHelper = require('../utils/ResponseHelper');
const { TABLES, ADMIN_ROLES, PLATFORM_TENANT_ID } = require('../utils/Constants');

// ─── Helper: escape ZCQL string values ────────────────────────────────────────
function esc(val) {
  return String(val ?? '').replace(/'/g, "''");
}

// ─── Helper: flatten ZCQL row ─────────────────────────────────────────────────
function flattenRows(raw) {
  return (raw || []).map((r) => Object.assign({}, ...Object.values(r)));
}

// ─── Default config values ────────────────────────────────────────────────────
const DEFAULT_CONFIG = Object.freeze({
  enabled:              true,
  notify_emails:        [],
  notify_on_severity:   ['CRITICAL', 'HIGH'],
  notify_on_new:        true,
  allow_anonymous:      false,
  max_attachments:      5,
  max_file_size_mb:     50,
  email_subject_prefix: '[Bug Report]',
  auto_assign_to:       '',
});

class BugConfigController {
  constructor(catalystApp) {
    this.catalystApp = catalystApp;
  }

  // ─── GET /api/bugs/config ──────────────────────────────────────────────────
  async getConfig(req, res) {
    const { tenantId: callerTenantId, role } = req.currentUser;
    // Admin users can pass ?tenantId=X to fetch config for any tenant
    const isSuperAdmin = role === 'SUPER_ADMIN';
    const isAdmin = ADMIN_ROLES.includes(role) || isSuperAdmin;
    // Super admins get the platform-wide config unless they explicitly request a tenant's config
    const tenantId = isSuperAdmin
      ? (req.query.tenantId || PLATFORM_TENANT_ID)
      : callerTenantId;
    console.log(`[BugConfigCtrl] getConfig Step 1 — tenantId=${tenantId} (caller=${callerTenantId} isAdmin=${isAdmin})`);

    let config;
    try {
      const raw  = await req.catalystApp.zcql().executeZCQLQuery(
        `SELECT * FROM ${TABLES.BUG_REPORT_CONFIG}
         WHERE tenant_id = '${esc(tenantId)}' LIMIT 1`
      );
      const rows = flattenRows(raw);
      if (rows.length === 0) {
        console.log('[BugConfigCtrl] getConfig — no config row found, returning defaults');
        config = { ...DEFAULT_CONFIG, tenant_id: tenantId };
      } else {
        config = rows[0];
        // Parse JSON array fields if stored as strings
        config.notify_emails      = _parseJsonArray(config.notify_emails);
        config.notify_on_severity = _parseJsonArray(config.notify_on_severity);
        // Parse booleans
        config.enabled          = _parseBool(config.enabled, DEFAULT_CONFIG.enabled);
        config.notify_on_new    = _parseBool(config.notify_on_new, DEFAULT_CONFIG.notify_on_new);
        config.allow_anonymous  = _parseBool(config.allow_anonymous, DEFAULT_CONFIG.allow_anonymous);
        // Parse numbers
        config.max_attachments  = parseInt(config.max_attachments,  10) || DEFAULT_CONFIG.max_attachments;
        config.max_file_size_mb = parseInt(config.max_file_size_mb, 10) || DEFAULT_CONFIG.max_file_size_mb;

        console.log(`[BugConfigCtrl] getConfig Step 1 ✓ — found config ROWID=${config.ROWID}`);
      }
    } catch (dbErr) {
      console.error('[BugConfigCtrl] getConfig Step 1 ✗ — DB error:', dbErr.message);
      return ResponseHelper.serverError(res, 'Failed to fetch bug report config');
    }

    console.log('[BugConfigCtrl] getConfig ✓ — complete');
    return ResponseHelper.success(res, { config });
  }

  // ─── PUT /api/bugs/config ──────────────────────────────────────────────────
  async upsertConfig(req, res) {
    const { tenantId: callerTenantId, role } = req.currentUser;
    console.log(`[BugConfigCtrl] upsertConfig Step 1 — callerTenantId=${callerTenantId} role=${role}`);

    // Admin only
    if (!ADMIN_ROLES.includes(role) && role !== 'SUPER_ADMIN') {
      console.warn(`[BugConfigCtrl] upsertConfig ✗ — role ${role} is not permitted`);
      return ResponseHelper.forbidden(res, 'Admin access required to update bug report configuration');
    }

    const {
      tenantId: bodyTenantId,
      enabled,
      notify_emails,
      notify_on_severity,
      notify_on_new,
      allow_anonymous,
      max_attachments,
      max_file_size_mb,
      email_subject_prefix,
      auto_assign_to,
    } = req.body;

    // Super admins always write to the platform config (no per-tenant override needed here)
    const isSuperAdmin = role === 'SUPER_ADMIN';
    const tenantId = isSuperAdmin ? PLATFORM_TENANT_ID : callerTenantId;
    console.log(`[BugConfigCtrl] upsertConfig Step 1b — effective tenantId=${tenantId}`);

    // Step 2: check if config already exists for this tenant
    console.log('[BugConfigCtrl] upsertConfig Step 2 — checking for existing config row');
    let existingRowId = null;
    try {
      const raw  = await req.catalystApp.zcql().executeZCQLQuery(
        `SELECT ROWID FROM ${TABLES.BUG_REPORT_CONFIG}
         WHERE tenant_id = '${esc(tenantId)}' LIMIT 1`
      );
      const rows = flattenRows(raw);
      if (rows.length > 0) {
        existingRowId = String(rows[0].ROWID);
        console.log(`[BugConfigCtrl] upsertConfig Step 2 ✓ — existing row found ROWID=${existingRowId}`);
      } else {
        console.log('[BugConfigCtrl] upsertConfig Step 2 ✓ — no existing row, will INSERT');
      }
    } catch (dbErr) {
      console.error('[BugConfigCtrl] upsertConfig Step 2 ✗ — DB error:', dbErr.message);
      return ResponseHelper.serverError(res, 'Failed to check existing config');
    }

    // Serialize array fields to JSON strings for DataStore storage
    const safeNotifyEmails    = esc(JSON.stringify(Array.isArray(notify_emails)      ? notify_emails      : _parseJsonArray(notify_emails)));
    const safeNotifyOnSev     = esc(JSON.stringify(Array.isArray(notify_on_severity) ? notify_on_severity : _parseJsonArray(notify_on_severity)));
    const safeEnabled         = enabled        !== undefined ? String(Boolean(enabled))       : 'true';
    const safeNotifyOnNew     = notify_on_new  !== undefined ? String(Boolean(notify_on_new)) : 'true';
    const safeAllowAnonymous  = allow_anonymous !== undefined ? String(Boolean(allow_anonymous)) : 'false';
    const safeMaxAttach       = parseInt(max_attachments,  10) || DEFAULT_CONFIG.max_attachments;
    const safeMaxFileMb       = parseInt(max_file_size_mb, 10) || DEFAULT_CONFIG.max_file_size_mb;
    const safeSubjectPrefix   = esc(String(email_subject_prefix || DEFAULT_CONFIG.email_subject_prefix).slice(0, 200));
    const safeAutoAssign      = esc(String(auto_assign_to || '').slice(0, 200));

    // Step 3: INSERT or UPDATE
    if (!existingRowId) {
      console.log('[BugConfigCtrl] upsertConfig Step 3 — inserting new config row');
      try {
        await req.catalystApp.zcql().executeZCQLQuery(
          `INSERT INTO ${TABLES.BUG_REPORT_CONFIG}
             (tenant_id, enabled, notify_emails, notify_on_severity, notify_on_new,
              allow_anonymous, max_attachments, max_file_size_mb, email_subject_prefix, auto_assign_to)
           VALUES
             ('${esc(tenantId)}', '${safeEnabled}', '${safeNotifyEmails}', '${safeNotifyOnSev}',
              '${safeNotifyOnNew}', '${safeAllowAnonymous}',
              '${safeMaxAttach}', '${safeMaxFileMb}', '${safeSubjectPrefix}', '${safeAutoAssign}')`
        );
        console.log('[BugConfigCtrl] upsertConfig Step 3 ✓ — INSERT succeeded');
      } catch (dbErr) {
        console.error('[BugConfigCtrl] upsertConfig Step 3 ✗ — INSERT failed:', dbErr.message);
        return ResponseHelper.serverError(res, 'Failed to create bug report config');
      }
    } else {
      console.log(`[BugConfigCtrl] upsertConfig Step 3 — updating config ROWID=${existingRowId}`);
      try {
        await req.catalystApp.zcql().executeZCQLQuery(
          `UPDATE ${TABLES.BUG_REPORT_CONFIG}
           SET enabled            = '${safeEnabled}',
               notify_emails      = '${safeNotifyEmails}',
               notify_on_severity = '${safeNotifyOnSev}',
               notify_on_new      = '${safeNotifyOnNew}',
               allow_anonymous    = '${safeAllowAnonymous}',
               max_attachments    = '${safeMaxAttach}',
               max_file_size_mb   = '${safeMaxFileMb}',
               email_subject_prefix = '${safeSubjectPrefix}',
               auto_assign_to     = '${safeAutoAssign}'
           WHERE ROWID = '${esc(existingRowId)}'`
        );
        console.log('[BugConfigCtrl] upsertConfig Step 3 ✓ — UPDATE succeeded');
      } catch (dbErr) {
        console.error('[BugConfigCtrl] upsertConfig Step 3 ✗ — UPDATE failed:', dbErr.message);
        return ResponseHelper.serverError(res, 'Failed to update bug report config');
      }
    }

    // Step 4: fetch the upserted row to return
    console.log('[BugConfigCtrl] upsertConfig Step 4 — fetching updated config row');
    let updatedConfig;
    try {
      const raw  = await req.catalystApp.zcql().executeZCQLQuery(
        `SELECT * FROM ${TABLES.BUG_REPORT_CONFIG}
         WHERE tenant_id = '${esc(tenantId)}' LIMIT 1`
      );
      const rows = flattenRows(raw);
      updatedConfig = rows[0] || { tenant_id: tenantId };
      // Normalize parsed fields
      updatedConfig.notify_emails      = _parseJsonArray(updatedConfig.notify_emails);
      updatedConfig.notify_on_severity = _parseJsonArray(updatedConfig.notify_on_severity);
      updatedConfig.enabled            = _parseBool(updatedConfig.enabled, true);
      updatedConfig.notify_on_new      = _parseBool(updatedConfig.notify_on_new, true);
      updatedConfig.allow_anonymous    = _parseBool(updatedConfig.allow_anonymous, false);
      updatedConfig.max_attachments    = parseInt(updatedConfig.max_attachments,  10) || DEFAULT_CONFIG.max_attachments;
      updatedConfig.max_file_size_mb   = parseInt(updatedConfig.max_file_size_mb, 10) || DEFAULT_CONFIG.max_file_size_mb;
      console.log(`[BugConfigCtrl] upsertConfig Step 4 ✓ — ROWID=${updatedConfig.ROWID}`);
    } catch (fetchErr) {
      console.warn('[BugConfigCtrl] upsertConfig Step 4 — fetch failed (non-fatal):', fetchErr.message);
      updatedConfig = { tenant_id: tenantId };
    }

    console.log('[BugConfigCtrl] upsertConfig ✓ — complete');
    return ResponseHelper.success(res, { config: updatedConfig }, 'Bug report configuration updated successfully');
  }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function _parseJsonArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch (_) { return []; }
}

function _parseBool(val, fallback) {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'boolean') return val;
  return String(val).toLowerCase() !== 'false';
}

module.exports = BugConfigController;
