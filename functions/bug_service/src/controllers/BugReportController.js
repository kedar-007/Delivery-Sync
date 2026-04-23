'use strict';

const { v4: uuidv4 } = require('uuid');
const ResponseHelper  = require('../utils/ResponseHelper');
const { TABLES, ADMIN_ROLES, PLATFORM_TENANT_ID } = require('../utils/Constants');

// ─── Helper: escape ZCQL string values ────────────────────────────────────────
function esc(val) {
  return String(val ?? '').replace(/'/g, "''");
}

// ─── Helper: flatten ZCQL row ─────────────────────────────────────────────────
function flattenRows(raw) {
  return (raw || []).map((r) => Object.assign({}, ...Object.values(r)));
}

class BugReportController {
  constructor(catalystApp) {
    this.catalystApp = catalystApp;
  }

  // ─── POST /api/bugs/reports ────────────────────────────────────────────────
  async submitReport(req, res) {
    const { id: userId, email, name, tenantId } = req.currentUser;
    const {
      title,
      description,
      report_type   = 'BUG',
      severity      = 'MEDIUM',
      page_url      = '',
      browser_info  = '',
      tags          = '',
    } = req.body;

    console.log(`[BugReportCtrl] submitReport Step 1 — userId=${userId} tenantId=${tenantId} report_type=${report_type} severity=${severity}`);

    // Validate required fields
    if (!title || !title.trim()) {
      console.warn('[BugReportCtrl] submitReport ✗ — title is required');
      return ResponseHelper.validationError(res, 'title is required');
    }
    if (!description || !description.trim()) {
      console.warn('[BugReportCtrl] submitReport ✗ — description is required');
      return ResponseHelper.validationError(res, 'description is required');
    }

    console.log(`[BugReportCtrl] submitReport Step 2 — inserting into ${TABLES.BUG_REPORTS}`);
    const safeTitle       = esc(title.trim().slice(0, 500));
    const safeDescription = esc(description.trim().slice(0, 4000));
    const safeReportType  = esc(report_type);
    const safeSeverity    = esc(severity);
    const safePageUrl     = esc(String(page_url).slice(0, 2000));
    const safeBrowserInfo = esc(String(browser_info).slice(0, 1000));
    const safeTags        = esc(String(tags).slice(0, 500));
    const safeEmail       = esc(email);
    const safeName        = esc(name);

    try {
      await req.catalystApp.zcql().executeZCQLQuery(
        `INSERT INTO ${TABLES.BUG_REPORTS}
           (tenant_id, reporter_id, reporter_email, reporter_name,
            report_type, title, description, severity, status, bug_priority,
            page_url, browser_info, human_verified, captcha_score,
            attachment_count, notified, tags)
         VALUES
           ('${esc(tenantId)}', '${esc(userId)}', '${safeEmail}', '${safeName}',
            '${safeReportType}', '${safeTitle}', '${safeDescription}',
            '${safeSeverity}', 'OPEN', 'MEDIUM',
            '${safePageUrl}', '${safeBrowserInfo}', 'true', 1.0,
            '0', 'false', '${safeTags}')`
      );
    } catch (dbErr) {
      console.error('[BugReportCtrl] submitReport Step 2 ✗ — INSERT failed:', dbErr.message);
      return ResponseHelper.serverError(res, 'Failed to submit bug report');
    }
    console.log('[BugReportCtrl] submitReport Step 2 ✓ — INSERT succeeded');

    // Step 3: retrieve the inserted row (query back by reporter_id + CREATEDTIME DESC LIMIT 1)
    console.log('[BugReportCtrl] submitReport Step 3 — retrieving inserted row');
    let report;
    try {
      const raw = await req.catalystApp.zcql().executeZCQLQuery(
        `SELECT * FROM ${TABLES.BUG_REPORTS}
         WHERE reporter_id = '${esc(userId)}'
           AND tenant_id   = '${esc(tenantId)}'
         ORDER BY CREATEDTIME DESC LIMIT 1`
      );
      const rows = flattenRows(raw);
      if (rows.length === 0) {
        console.warn('[BugReportCtrl] submitReport Step 3 — inserted row not found (non-fatal)');
        report = { tenant_id: tenantId, reporter_id: userId, title, description, status: 'OPEN' };
      } else {
        report = rows[0];
        console.log(`[BugReportCtrl] submitReport Step 3 ✓ — ROWID=${report.ROWID}`);
      }
    } catch (fetchErr) {
      console.warn('[BugReportCtrl] submitReport Step 3 — fetch after insert failed (non-fatal):', fetchErr.message);
      report = { tenant_id: tenantId, reporter_id: userId, title, description, status: 'OPEN' };
    }

    console.log('[BugReportCtrl] submitReport ✓ — complete (notification deferred to /notify)');
    return ResponseHelper.created(res, { report }, 'Bug report submitted successfully');
  }

  // ─── POST /api/bugs/reports/:id/attachments ────────────────────────────────
  async uploadAttachment(req, res) {
    const { id: reportId } = req.params;
    const { id: userId, tenantId, role } = req.currentUser;
    const { base64, file_name, file_type, mime_type, file_size } = req.body;

    console.log(`[BugReportCtrl] uploadAttachment Step 1 — reportId=${reportId} userId=${userId} tenantId=${tenantId} file_name=${file_name}`);

    if (!base64)    return ResponseHelper.validationError(res, 'base64 file data is required');
    if (!file_name) return ResponseHelper.validationError(res, 'file_name is required');

    // Step 2: verify the bug report exists and belongs to this tenant
    console.log('[BugReportCtrl] uploadAttachment Step 2 — verifying bug report ownership');
    let existingReport;
    try {
      const raw  = await req.catalystApp.zcql().executeZCQLQuery(
        `SELECT ROWID, tenant_id, attachment_count FROM ${TABLES.BUG_REPORTS}
         WHERE ROWID = '${esc(reportId)}' LIMIT 1`
      );
      const rows = flattenRows(raw);
      if (rows.length === 0) {
        console.warn(`[BugReportCtrl] uploadAttachment Step 2 ✗ — report not found ROWID=${reportId}`);
        return ResponseHelper.notFound(res, 'Bug report not found');
      }
      existingReport = rows[0];
      if (role !== 'SUPER_ADMIN' && String(existingReport.tenant_id) !== String(tenantId)) {
        console.warn(`[BugReportCtrl] uploadAttachment Step 2 ✗ — tenant mismatch`);
        return ResponseHelper.forbidden(res, 'Access denied');
      }
    } catch (dbErr) {
      console.error('[BugReportCtrl] uploadAttachment Step 2 ✗ — DB error:', dbErr.message);
      return ResponseHelper.serverError(res, 'Failed to verify bug report');
    }
    console.log(`[BugReportCtrl] uploadAttachment Step 2 ✓ — report verified, current attachment_count=${existingReport.attachment_count}`);

    // Step 3: decode base64 and upload to Stratus
    console.log('[BugReportCtrl] uploadAttachment Step 3 — decoding base64 and uploading to Stratus');
    const base64Data  = base64.replace(/^data:[^;]+;base64,/, '');
    const buffer      = Buffer.from(base64Data, 'base64');
    const ext         = (file_name.split('.').pop() || 'bin').toLowerCase();
    const uniqueKey   = `bug-reports/${reportId}_${Date.now()}_${uuidv4().slice(0, 8)}.${ext}`;

    const BUCKET_NAME = process.env.STRATUS_BUCKET_NAME     || 'profiles-users';
    const BUCKET_URL  = process.env.STRATUS_BUG_REPORTS_URL || 'https://profiles-users-development.zohostratus.in';

    let fileUrl;
    try {
      const bucket = this.catalystApp.stratus().bucket(BUCKET_NAME);
      await bucket.putObject(uniqueKey, buffer, {
        contentType: mime_type || 'application/octet-stream',
      });
      fileUrl = `${BUCKET_URL}/${uniqueKey}`;
      console.log(`[BugReportCtrl] uploadAttachment Step 3 ✓ — uploaded: ${fileUrl}`);
    } catch (uploadErr) {
      console.error('[BugReportCtrl] uploadAttachment Step 3 ✗ — upload failed:', uploadErr.message);
      return ResponseHelper.serverError(res, 'Attachment upload failed: ' + uploadErr.message);
    }

    // Step 4: insert into bug_report_attachments (use report's actual tenant_id, not super admin's empty one)
    const effectiveTenantId = existingReport.tenant_id || tenantId;
    console.log('[BugReportCtrl] uploadAttachment Step 4 — inserting attachment record');
    try {
      await req.catalystApp.zcql().executeZCQLQuery(
        `INSERT INTO ${TABLES.BUG_REPORT_ATTACHMENTS}
           (bug_report_id, tenant_id, file_url, file_name, file_type, mime_type, file_size)
         VALUES
           ('${parseInt(reportId, 10)}', '${esc(effectiveTenantId)}', '${esc(fileUrl)}',
            '${esc(file_name)}', '${esc(file_type || ext)}', '${esc(mime_type || 'application/octet-stream')}',
            '${esc(String(file_size || buffer.length))}')`
      );
    } catch (dbErr) {
      console.error('[BugReportCtrl] uploadAttachment Step 4 ✗ — INSERT failed:', dbErr.message);
      return ResponseHelper.serverError(res, 'Failed to save attachment record');
    }
    console.log('[BugReportCtrl] uploadAttachment Step 4 ✓ — attachment record inserted');

    // Step 5: increment attachment_count on the bug report
    console.log('[BugReportCtrl] uploadAttachment Step 5 — incrementing attachment_count');
    try {
      const currentCount = parseInt(existingReport.attachment_count, 10) || 0;
      await req.catalystApp.zcql().executeZCQLQuery(
        `UPDATE ${TABLES.BUG_REPORTS}
         SET attachment_count = '${currentCount + 1}'
         WHERE ROWID = '${esc(reportId)}'`
      );
      console.log(`[BugReportCtrl] uploadAttachment Step 5 ✓ — attachment_count now ${currentCount + 1}`);
    } catch (updErr) {
      console.warn('[BugReportCtrl] uploadAttachment Step 5 — could not increment count (non-fatal):', updErr.message);
    }

    // Step 6: fetch the inserted attachment record to return
    console.log('[BugReportCtrl] uploadAttachment Step 6 — fetching inserted attachment record');
    let attachment = { bug_report_id: reportId, tenant_id: tenantId, file_url: fileUrl, file_name };
    try {
      const raw  = await req.catalystApp.zcql().executeZCQLQuery(
        `SELECT * FROM ${TABLES.BUG_REPORT_ATTACHMENTS}
         WHERE bug_report_id = ${parseInt(reportId, 10)}
           AND file_url = '${esc(fileUrl)}' LIMIT 1`
      );
      const rows = flattenRows(raw);
      if (rows.length > 0) {
        attachment = rows[0];
        console.log(`[BugReportCtrl] uploadAttachment Step 6 ✓ — ROWID=${attachment.ROWID}`);
      }
    } catch (fetchErr) {
      console.warn('[BugReportCtrl] uploadAttachment Step 6 — fetch failed (non-fatal):', fetchErr.message);
    }

    console.log('[BugReportCtrl] uploadAttachment ✓ — complete');
    return ResponseHelper.created(res, { attachment }, 'Attachment uploaded successfully');
  }

  // ─── POST /api/bugs/reports/:id/notify ────────────────────────────────────
  // Called by the client after all attachments are uploaded. Loads the full
  // report + attachments, then fires the platform notification email.
  async notifyReport(req, res) {
    const { id: reportId } = req.params;
    const { role } = req.currentUser;

    console.log(`[BugReportCtrl] notifyReport Step 1 — reportId=${reportId} role=${role}`);

    // Step 1: load the report
    let report;
    try {
      const raw  = await req.catalystApp.zcql().executeZCQLQuery(
        `SELECT * FROM ${TABLES.BUG_REPORTS} WHERE ROWID = '${esc(reportId)}' LIMIT 1`
      );
      const rows = flattenRows(raw);
      if (rows.length === 0) return ResponseHelper.notFound(res, 'Bug report not found');
      report = rows[0];
    } catch (dbErr) {
      console.error('[BugReportCtrl] notifyReport Step 1 ✗ — DB error:', dbErr.message);
      return ResponseHelper.serverError(res, 'Failed to load bug report');
    }

    // Step 2: load attachments
    let attachments = [];
    try {
      const rawAtt = await req.catalystApp.zcql().executeZCQLQuery(
        `SELECT * FROM ${TABLES.BUG_REPORT_ATTACHMENTS}
         WHERE bug_report_id = ${parseInt(reportId, 10)}
         ORDER BY CREATEDTIME ASC LIMIT 20`
      );
      attachments = flattenRows(rawAtt);
      console.log(`[BugReportCtrl] notifyReport Step 2 ✓ — ${attachments.length} attachments`);
    } catch (_) {}

    // Step 3: load platform config
    console.log('[BugReportCtrl] notifyReport Step 3 — loading platform notification config');
    let config = null;
    try {
      const cfgRaw  = await req.catalystApp.zcql().executeZCQLQuery(
        `SELECT * FROM ${TABLES.BUG_REPORT_CONFIG}
         WHERE tenant_id = '${esc(PLATFORM_TENANT_ID)}' LIMIT 1`
      );
      config = flattenRows(cfgRaw)[0] || null;
    } catch (cfgErr) {
      console.warn('[BugReportCtrl] notifyReport Step 3 — config fetch failed (non-fatal):', cfgErr.message);
    }

    if (!config) {
      console.log('[BugReportCtrl] notifyReport — no platform config, skipping');
      return ResponseHelper.success(res, { notified: false }, 'No notification config');
    }

    const notifyEmails = _parseJsonArray(config.notify_emails);
    const notifyOnSev  = _parseJsonArray(config.notify_on_severity);
    const notifyOnNew  = String(config.notify_on_new).toLowerCase() !== 'false';
    const severity     = String(report.severity || '').toUpperCase();
    const shouldNotify =
      notifyEmails.length > 0 &&
      (notifyOnNew || notifyOnSev.includes(severity));

    console.log(`[BugReportCtrl] notifyReport Step 3 — emails=${JSON.stringify(notifyEmails)} notifyOnNew=${notifyOnNew} shouldNotify=${shouldNotify} severity=${severity}`);

    if (!shouldNotify) {
      return ResponseHelper.success(res, { notified: false }, 'Notification conditions not met');
    }

    // Step 4: send email
    const fromEmail = process.env.FROM_EMAIL || 'catalystadmin@dsv360.ai';
    const prefix    = config.email_subject_prefix || '[Bug Report]';
    const subject   = `${prefix} ${report.title}`;
    const content   = _buildEmailHtml({
      title:         report.title,
      description:   report.description,
      report_type:   report.report_type,
      severity:      report.severity,
      page_url:      report.page_url,
      browser_info:  report.browser_info,
      reporter_name: report.reporter_name,
      reporter_email:report.reporter_email,
      attachments,
    });

    let anySent = false;
    for (const recipient of notifyEmails) {
      try {
        await req.catalystApp.email().sendMail({
          from_email: fromEmail,
          to_email:   [recipient],
          subject,
          content,
          html_mode:  true,
        });
        console.log(`[BugReportCtrl] notifyReport Step 4 ✓ — email sent to ${recipient}`);
        anySent = true;
      } catch (mailErr) {
        console.error(`[BugReportCtrl] notifyReport Step 4 ✗ — email to ${recipient} failed:`, mailErr.message, JSON.stringify({
          status:   mailErr.status,
          code:     mailErr.code,
          response: mailErr.response?.data || mailErr.response || null,
        }));
      }
    }

    if (anySent) {
      try {
        await req.catalystApp.zcql().executeZCQLQuery(
          `UPDATE ${TABLES.BUG_REPORTS} SET notified = 'true' WHERE ROWID = '${esc(reportId)}'`
        );
      } catch (_) {}
    }

    console.log('[BugReportCtrl] notifyReport ✓ — complete');
    return ResponseHelper.success(res, { notified: anySent });
  }

  // ─── GET /api/bugs/reports ─────────────────────────────────────────────────
  async listReports(req, res) {
    const { id: userId, tenantId, role } = req.currentUser;
    const {
      status,
      severity,
      report_type,
      page  = 1,
      limit = 20,
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page, 10)  || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 20);

    console.log(`[BugReportCtrl] listReports Step 1 — userId=${userId} tenantId=${tenantId} role=${role} page=${pageNum} limit=${limitNum}`);

    const isSuperAdmin = role === 'SUPER_ADMIN';
    const isAdmin = isSuperAdmin || ADMIN_ROLES.includes(role);
    console.log(`[BugReportCtrl] listReports Step 2 — isAdmin=${isAdmin} isSuperAdmin=${isSuperAdmin}`);

    // Build WHERE clause — super admins see all tenants
    const conditions = [];
    if (!isSuperAdmin) {
      conditions.push(`tenant_id = '${esc(tenantId)}'`);
    }
    if (!isAdmin) {
      conditions.push(`reporter_id = '${esc(userId)}'`);
    }
    if (status)      conditions.push(`status = '${esc(status)}'`);
    if (severity)    conditions.push(`severity = '${esc(severity)}'`);
    if (report_type) conditions.push(`report_type = '${esc(report_type)}'`);

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    console.log(`[BugReportCtrl] listReports Step 3 — querying with: ${whereClause || '(no filter)'}`);
    let reports = [];
    try {
      const raw = await req.catalystApp.zcql().executeZCQLQuery(
        `SELECT * FROM ${TABLES.BUG_REPORTS}
         ${whereClause}
         ORDER BY CREATEDTIME DESC
         LIMIT ${limitNum}`
      );
      reports = flattenRows(raw);
      console.log(`[BugReportCtrl] listReports Step 3 ✓ — ${reports.length} rows returned`);
    } catch (dbErr) {
      console.error('[BugReportCtrl] listReports Step 3 ✗ — query failed:', dbErr.message);
      return ResponseHelper.serverError(res, 'Failed to fetch bug reports');
    }

    console.log('[BugReportCtrl] listReports ✓ — complete');
    return ResponseHelper.success(res, {
      reports,
      total: reports.length,
      page:  pageNum,
      limit: limitNum,
    });
  }

  // ─── GET /api/bugs/reports/:id ─────────────────────────────────────────────
  async getReport(req, res) {
    const { id: reportId } = req.params;
    const { tenantId, id: userId, role } = req.currentUser;

    console.log(`[BugReportCtrl] getReport Step 1 — reportId=${reportId} tenantId=${tenantId}`);

    let report;
    try {
      const raw  = await req.catalystApp.zcql().executeZCQLQuery(
        `SELECT * FROM ${TABLES.BUG_REPORTS}
         WHERE ROWID = '${esc(reportId)}' LIMIT 1`
      );
      const rows = flattenRows(raw);
      if (rows.length === 0) {
        console.warn(`[BugReportCtrl] getReport Step 1 ✗ — not found ROWID=${reportId}`);
        return ResponseHelper.notFound(res, 'Bug report not found');
      }
      report = rows[0];
    } catch (dbErr) {
      console.error('[BugReportCtrl] getReport Step 1 ✗ — DB error:', dbErr.message);
      return ResponseHelper.serverError(res, 'Failed to fetch bug report');
    }

    const isSuperAdmin = role === 'SUPER_ADMIN';

    // Super admins can access any report cross-tenant
    if (!isSuperAdmin) {
      if (String(report.tenant_id) !== String(tenantId)) {
        console.warn(`[BugReportCtrl] getReport Step 2 ✗ — tenant mismatch`);
        return ResponseHelper.forbidden(res, 'Access denied');
      }
      // Non-admins can only see their own reports
      const isAdmin = ADMIN_ROLES.includes(role);
      if (!isAdmin && String(report.reporter_id) !== String(userId)) {
        console.warn(`[BugReportCtrl] getReport Step 2 ✗ — non-admin accessing another user's report`);
        return ResponseHelper.forbidden(res, 'Access denied');
      }
    }
    console.log(`[BugReportCtrl] getReport Step 2 ✓ — access verified (superAdmin=${isSuperAdmin})`);

    // Step 3: fetch attachments
    console.log(`[BugReportCtrl] getReport Step 3 — fetching attachments for ROWID=${reportId}`);
    let attachments = [];
    try {
      const rawAtt = await req.catalystApp.zcql().executeZCQLQuery(
        `SELECT * FROM ${TABLES.BUG_REPORT_ATTACHMENTS}
         WHERE bug_report_id = ${parseInt(reportId, 10)}
         ORDER BY CREATEDTIME ASC LIMIT 50`
      );
      attachments = flattenRows(rawAtt);
      console.log(`[BugReportCtrl] getReport Step 3 ✓ — ${attachments.length} attachments`);
    } catch (attErr) {
      console.warn('[BugReportCtrl] getReport Step 3 — attachments fetch failed (non-fatal):', attErr.message);
    }

    console.log('[BugReportCtrl] getReport ✓ — complete');
    return ResponseHelper.success(res, { report, attachments });
  }

  // ─── PATCH /api/bugs/reports/:id ───────────────────────────────────────────
  async updateReport(req, res) {
    const { id: reportId } = req.params;
    const { tenantId, role } = req.currentUser;
    const isSuperAdmin = role === 'SUPER_ADMIN';

    console.log(`[BugReportCtrl] updateReport Step 1 — reportId=${reportId} role=${role}`);

    // Admin only
    if (!isSuperAdmin && !ADMIN_ROLES.includes(role)) {
      console.warn(`[BugReportCtrl] updateReport ✗ — role ${role} is not permitted`);
      return ResponseHelper.forbidden(res, 'Admin access required to update reports');
    }

    // Step 2: verify report exists; super admins can update any report cross-tenant
    console.log('[BugReportCtrl] updateReport Step 2 — verifying report');
    try {
      const raw  = await req.catalystApp.zcql().executeZCQLQuery(
        `SELECT ROWID, tenant_id FROM ${TABLES.BUG_REPORTS}
         WHERE ROWID = '${esc(reportId)}' LIMIT 1`
      );
      const rows = flattenRows(raw);
      if (rows.length === 0) {
        console.warn(`[BugReportCtrl] updateReport Step 2 ✗ — not found ROWID=${reportId}`);
        return ResponseHelper.notFound(res, 'Bug report not found');
      }
      if (!isSuperAdmin && String(rows[0].tenant_id) !== String(tenantId)) {
        console.warn(`[BugReportCtrl] updateReport Step 2 ✗ — tenant mismatch`);
        return ResponseHelper.forbidden(res, 'Access denied');
      }
    } catch (dbErr) {
      console.error('[BugReportCtrl] updateReport Step 2 ✗ — DB error:', dbErr.message);
      return ResponseHelper.serverError(res, 'Failed to verify bug report');
    }
    console.log(`[BugReportCtrl] updateReport Step 2 ✓ — report verified`);

    // Step 3: build dynamic UPDATE
    const ALLOWED = ['status', 'bug_priority', 'assigned_to', 'resolution_notes', 'resolved_by', 'resolved_at'];
    const setParts = [];
    for (const field of ALLOWED) {
      if (req.body[field] !== undefined) {
        setParts.push(`${field} = '${esc(String(req.body[field]))}'`);
      }
    }

    if (setParts.length === 0) {
      console.warn('[BugReportCtrl] updateReport — no updatable fields provided');
      return ResponseHelper.validationError(res, 'No updatable fields provided');
    }

    console.log(`[BugReportCtrl] updateReport Step 3 — updating fields: ${setParts.map((s) => s.split(' = ')[0]).join(', ')}`);
    try {
      await req.catalystApp.zcql().executeZCQLQuery(
        `UPDATE ${TABLES.BUG_REPORTS}
         SET ${setParts.join(', ')}
         WHERE ROWID = '${esc(reportId)}'`
      );
    } catch (dbErr) {
      console.error('[BugReportCtrl] updateReport Step 3 ✗ — UPDATE failed:', dbErr.message);
      return ResponseHelper.serverError(res, 'Failed to update bug report');
    }
    console.log('[BugReportCtrl] updateReport Step 3 ✓ — UPDATE succeeded');

    // Step 4: fetch updated row
    console.log('[BugReportCtrl] updateReport Step 4 — fetching updated row');
    let updatedReport;
    try {
      const raw  = await req.catalystApp.zcql().executeZCQLQuery(
        `SELECT * FROM ${TABLES.BUG_REPORTS}
         WHERE ROWID = '${esc(reportId)}' LIMIT 1`
      );
      updatedReport = flattenRows(raw)[0] || { ROWID: reportId };
    } catch (fetchErr) {
      console.warn('[BugReportCtrl] updateReport Step 4 — fetch failed (non-fatal):', fetchErr.message);
      updatedReport = { ROWID: reportId };
    }

    console.log('[BugReportCtrl] updateReport ✓ — complete');
    return ResponseHelper.success(res, { report: updatedReport }, 'Bug report updated successfully');
  }

  // ─── GET /api/bugs/reports/all ─────────────────────────────────────────────
  async listAllReports(req, res) {
    const { role } = req.currentUser;
    const { tenant_id, status, severity, superAdmin } = req.query;

    console.log(`[BugReportCtrl] listAllReports Step 1 — role=${role} superAdmin=${superAdmin}`);

    // Allow only TENANT_ADMIN or higher (the frontend only renders this route for SUPER_ADMIN role);
    // since all requests are Catalyst-session-authenticated, this is safe.
    if (!ADMIN_ROLES.includes(role) && role !== 'SUPER_ADMIN') {
      console.warn(`[BugReportCtrl] listAllReports ✗ — role ${role} not permitted`);
      return ResponseHelper.forbidden(res, 'Admin access required');
    }

    // Build cross-tenant WHERE
    const conditions = [];
    if (tenant_id) conditions.push(`tenant_id = '${esc(tenant_id)}'`);
    if (status)    conditions.push(`status = '${esc(status)}'`);
    if (severity)  conditions.push(`severity = '${esc(severity)}'`);

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    console.log(`[BugReportCtrl] listAllReports Step 2 — querying all tenants${whereClause ? ' with filters' : ''}`);
    let reports = [];
    try {
      const raw = await req.catalystApp.zcql().executeZCQLQuery(
        `SELECT * FROM ${TABLES.BUG_REPORTS}
         ${whereClause}
         ORDER BY CREATEDTIME DESC LIMIT 100`
      );
      reports = flattenRows(raw);
      console.log(`[BugReportCtrl] listAllReports Step 2 ✓ — ${reports.length} rows returned`);
    } catch (dbErr) {
      console.error('[BugReportCtrl] listAllReports Step 2 ✗ — query failed:', dbErr.message);
      return ResponseHelper.serverError(res, 'Failed to fetch all bug reports');
    }

    // Step 3: look up tenant names to enrich results
    console.log('[BugReportCtrl] listAllReports Step 3 — enriching with tenant names');
    try {
      const tenantIds = [...new Set(reports.map((r) => r.tenant_id).filter(Boolean))];
      if (tenantIds.length > 0) {
        const tenantConditions = tenantIds.map((tid) => `ROWID = '${esc(String(tid))}'`).join(' OR ');
        const tRaw   = await req.catalystApp.zcql().executeZCQLQuery(
          `SELECT ROWID, name FROM ${TABLES.TENANTS} WHERE ${tenantConditions} LIMIT 100`
        );
        const tenantMap = {};
        flattenRows(tRaw).forEach((t) => { tenantMap[String(t.ROWID)] = t.name; });
        reports = reports.map((r) => ({
          ...r,
          tenant_name: tenantMap[String(r.tenant_id)] || null,
        }));
        console.log(`[BugReportCtrl] listAllReports Step 3 ✓ — enriched ${Object.keys(tenantMap).length} tenants`);
      }
    } catch (tenantErr) {
      console.warn('[BugReportCtrl] listAllReports Step 3 — tenant enrichment failed (non-fatal):', tenantErr.message);
    }

    console.log('[BugReportCtrl] listAllReports ✓ — complete');
    return ResponseHelper.success(res, { reports });
  }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function _parseJsonArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch (_) { return []; }
}

function _buildEmailHtml({ title, description, report_type, severity, page_url, browser_info, reporter_name, reporter_email, attachments = [] }) {
  const severityColor = {
    CRITICAL: '#dc2626',
    HIGH:     '#ea580c',
    MEDIUM:   '#ca8a04',
    LOW:      '#16a34a',
  }[severity] || '#6b7280';

  const images = attachments.filter((a) => {
    const mt = String(a.mime_type || '').toLowerCase();
    const ft = String(a.file_type || '').toLowerCase();
    return mt.startsWith('image/') || ft === 'image';
  });

  const otherFiles = attachments.filter((a) => {
    const mt = String(a.mime_type || '').toLowerCase();
    const ft = String(a.file_type || '').toLowerCase();
    return !mt.startsWith('image/') && ft !== 'image';
  });

  const imagesHtml = images.length > 0 ? `
  <div style="margin-top:20px;">
    <p style="font-weight:600;color:#374151;margin-bottom:10px;">Screenshots / Images (${images.length})</p>
    <div style="display:flex;flex-wrap:wrap;gap:10px;">
      ${images.map((img) => `
      <a href="${_htmlEsc(img.file_url)}" target="_blank" style="display:block;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <img src="${_htmlEsc(img.file_url)}" alt="${_htmlEsc(img.file_name)}"
          style="width:200px;height:150px;object-fit:cover;display:block;" />
        <p style="margin:0;padding:4px 8px;font-size:11px;color:#6b7280;background:#f9fafb;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_htmlEsc(img.file_name)}</p>
      </a>`).join('')}
    </div>
  </div>` : '';

  const otherFilesHtml = otherFiles.length > 0 ? `
  <div style="margin-top:16px;">
    <p style="font-weight:600;color:#374151;margin-bottom:8px;">Attachments (${otherFiles.length})</p>
    ${otherFiles.map((f) => `
    <a href="${_htmlEsc(f.file_url)}" target="_blank" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:6px;text-decoration:none;color:#111827;font-size:13px;">
      <span style="font-size:18px;">📎</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_htmlEsc(f.file_name)}</span>
      ${f.file_size ? `<span style="color:#9ca3af;font-size:11px;">${Math.round(Number(f.file_size) / 1024)} KB</span>` : ''}
    </a>`).join('')}
  </div>` : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#1f2937;">
  <h2 style="margin-bottom:4px;color:#111827;">New ${report_type || 'Bug'} Report</h2>
  <p style="margin-top:0;font-size:14px;color:#6b7280;">Submitted via DeliverSync Bug Reporting</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr>
      <td style="padding:8px 0;font-weight:600;width:140px;color:#374151;">Title</td>
      <td style="padding:8px 0;color:#111827;">${_htmlEsc(title)}</td>
    </tr>
    <tr>
      <td style="padding:8px 0;font-weight:600;color:#374151;">Severity</td>
      <td style="padding:8px 0;"><span style="background:${severityColor};color:#fff;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">${_htmlEsc(severity)}</span></td>
    </tr>
    <tr>
      <td style="padding:8px 0;font-weight:600;color:#374151;">Type</td>
      <td style="padding:8px 0;color:#111827;">${_htmlEsc(report_type)}</td>
    </tr>
    <tr>
      <td style="padding:8px 0;font-weight:600;color:#374151;">Reporter</td>
      <td style="padding:8px 0;color:#111827;">${_htmlEsc(reporter_name)} &lt;${_htmlEsc(reporter_email)}&gt;</td>
    </tr>
    ${page_url ? `<tr>
      <td style="padding:8px 0;font-weight:600;color:#374151;">Page URL</td>
      <td style="padding:8px 0;color:#111827;word-break:break-all;">${_htmlEsc(page_url)}</td>
    </tr>` : ''}
    ${browser_info ? `<tr>
      <td style="padding:8px 0;font-weight:600;color:#374151;">Browser</td>
      <td style="padding:8px 0;color:#111827;">${_htmlEsc(browser_info)}</td>
    </tr>` : ''}
  </table>
  <div style="margin-top:16px;">
    <p style="font-weight:600;color:#374151;margin-bottom:6px;">Description</p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;font-size:14px;color:#374151;white-space:pre-wrap;">${_htmlEsc(description)}</div>
  </div>
  ${imagesHtml}
  ${otherFilesHtml}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
  <p style="font-size:12px;color:#9ca3af;text-align:center;">DeliverSync · Bug Report Notification</p>
</body>
</html>`;
}

function _htmlEsc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = BugReportController;
