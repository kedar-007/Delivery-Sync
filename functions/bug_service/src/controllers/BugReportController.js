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

    // Check if bug reporting is enabled for this tenant
    try {
      const cfgRaw = await req.catalystApp.zcql().executeZCQLQuery(
        `SELECT enabled FROM ${TABLES.BUG_REPORT_CONFIG}
         WHERE tenant_id = '${esc(tenantId)}' LIMIT 1`
      );
      const cfgRows = (cfgRaw || []).map((r) => Object.assign({}, ...Object.values(r)));
      if (cfgRows.length > 0) {
        const isDisabled = cfgRows[0].enabled === false || String(cfgRows[0].enabled).toLowerCase() === 'false';
        if (isDisabled) {
          console.warn(`[BugReportCtrl] submitReport ✗ — bug reporting disabled for tenant=${tenantId}`);
          return ResponseHelper.forbidden(res, 'Bug reporting is not enabled for your organisation.');
        }
      }
    } catch (cfgErr) {
      console.warn('[BugReportCtrl] submitReport — could not read config (allowing):', cfgErr.message);
    }

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

    // Use the DataStore API (table.insertRow) so we get the new ROWID back
    // directly from the INSERT response — this is atomic.
    //
    // The previous approach used a raw ZCQL INSERT followed by a separate
    // `SELECT ORDER BY ROWID DESC LIMIT 1` to fetch back the new row. Catalyst's
    // DataStore is eventually consistent, so under concurrent submissions (or
    // rapid back-to-back submits) that follow-up SELECT could return an OLDER
    // row that wasn't actually the one just inserted. The frontend would then
    // upload attachments against that wrong ROWID, dumping screenshots from
    // multiple bugs onto a single (older) report. Fixed by reading the ROWID
    // straight from the INSERT response.
    let report;
    try {
      report = await req.catalystApp.datastore().table(TABLES.BUG_REPORTS).insertRow({
        tenant_id:        String(tenantId),
        reporter_id:      String(userId),
        reporter_email:   email,
        reporter_name:    name,
        report_type:      report_type,
        title:            title.trim().slice(0, 500),
        description:      description.trim().slice(0, 4000),
        severity:         severity,
        status:           'OPEN',
        bug_priority:     'MEDIUM',
        page_url:         String(page_url).slice(0, 2000),
        browser_info:     String(browser_info).slice(0, 1000),
        human_verified:   'true',
        captcha_score:    1.0,
        attachment_count: '0',
        notified:         'false',
        tags:             String(tags).slice(0, 500),
      });
    } catch (dbErr) {
      console.error('[BugReportCtrl] submitReport Step 2 ✗ — INSERT failed:', dbErr.message);
      return ResponseHelper.serverError(res, 'Failed to submit bug report');
    }
    if (!report || !report.ROWID) {
      console.error('[BugReportCtrl] submitReport Step 2 ✗ — insertRow returned no ROWID');
      return ResponseHelper.serverError(res, 'Failed to submit bug report (no ROWID returned)');
    }
    console.log(`[BugReportCtrl] submitReport Step 2 ✓ — INSERT succeeded, ROWID=${report.ROWID}`);

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
      // IMPORTANT: pass bug_report_id as a quoted string, NOT parseInt().
      // Catalyst ROWIDs exceed Number.MAX_SAFE_INTEGER (~9.0×10^15) so
      // parseInt('17682000001598517', 10) rounds and the FK lookup fails with
      // "Invalid Foreign key value for column bug_report_id". Keeping the raw
      // string preserves the full precision.
      await req.catalystApp.zcql().executeZCQLQuery(
        `INSERT INTO ${TABLES.BUG_REPORT_ATTACHMENTS}
           (bug_report_id, tenant_id, file_url, file_name, file_type, mime_type, file_size)
         VALUES
           ('${esc(reportId)}', '${esc(effectiveTenantId)}', '${esc(fileUrl)}',
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
         WHERE bug_report_id = '${esc(reportId)}'
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
         WHERE bug_report_id = '${esc(reportId)}'
         ORDER BY ROWID ASC LIMIT 20`
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
      limit = 50,
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page, 10)  || 1);
    const limitNum = Math.min(200, parseInt(limit, 10) || 50);
    const offsetNum = (pageNum - 1) * limitNum;

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

    console.log(`[BugReportCtrl] listReports Step 3 — querying with: ${whereClause || '(no filter)'} OFFSET ${offsetNum}`);
    // ZCQL has a per-query row cap (~200) — paginate internally so callers
    // requesting more get the full set. Fetch limit+1 to detect "has more".
    //
    // IMPORTANT: order by ROWID DESC, not CREATEDTIME DESC. Catalyst ZCQL does
    // not reliably sort by CREATEDTIME (it's not indexed for sort) — recent
    // inserts can end up mid-list. ROWID is monotonically increasing so the
    // newest row always has the largest ROWID.
    let reports = [];
    try {
      reports = await _fetchAllPaginated(
        req.catalystApp,
        `SELECT * FROM ${TABLES.BUG_REPORTS} ${whereClause} ORDER BY ROWID DESC`,
        { limit: limitNum + 1, offset: offsetNum }
      );
      console.log(`[BugReportCtrl] listReports Step 3 ✓ — ${reports.length} rows returned`);
    } catch (dbErr) {
      console.error('[BugReportCtrl] listReports Step 3 ✗ — query failed:', dbErr.message);
      return ResponseHelper.serverError(res, 'Failed to fetch bug reports');
    }

    const hasMore = reports.length > limitNum;
    if (hasMore) reports = reports.slice(0, limitNum);

    console.log('[BugReportCtrl] listReports ✓ — complete');
    return ResponseHelper.success(res, {
      reports,
      total:    reports.length,
      page:     pageNum,
      limit:    limitNum,
      has_more: hasMore,
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
         WHERE bug_report_id = '${esc(reportId)}'
         ORDER BY ROWID ASC LIMIT 50`
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
    const { role, tenantId } = req.currentUser;
    const { tenant_id, status, severity, page = 1, limit = 50, all } = req.query;

    const pageNum   = Math.max(1, parseInt(page, 10)  || 1);
    const limitNum  = Math.min(200, parseInt(limit, 10) || 50);
    const offsetNum = (pageNum - 1) * limitNum;
    // `all=true` flag returns the entire result set (paginated internally to
    // overcome ZCQL's per-query cap). Used by stat tiles + "view all" mode.
    const fetchAll  = String(all).toLowerCase() === 'true';
    const isSuperAdmin = role === 'SUPER_ADMIN';

    console.log(`[BugReportCtrl] listAllReports Step 1 — role=${role} page=${pageNum} limit=${limitNum} all=${fetchAll}`);

    if (!ADMIN_ROLES.includes(role) && !isSuperAdmin) {
      console.warn(`[BugReportCtrl] listAllReports ✗ — role ${role} not permitted`);
      return ResponseHelper.forbidden(res, 'Admin access required');
    }

    // Build WHERE clause — TENANT_ADMIN is always scoped to their own tenant;
    // SUPER_ADMIN can optionally filter by a specific tenant via query param.
    const conditions = [];
    if (!isSuperAdmin && tenantId) {
      conditions.push(`tenant_id = '${esc(String(tenantId))}'`);
    } else if (isSuperAdmin && tenant_id) {
      conditions.push(`tenant_id = '${esc(tenant_id)}'`);
    }
    if (status)    conditions.push(`status = '${esc(status)}'`);
    if (severity)  conditions.push(`severity = '${esc(severity)}'`);

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    // Order by ROWID DESC instead of CREATEDTIME DESC — Catalyst ZCQL does not
    // reliably sort by CREATEDTIME so newly-inserted reports were getting
    // dropped past the row cap or appearing mid-list. ROWID is monotonically
    // increasing and indexed → newest insert always has the largest value.
    const baseQuery   = `SELECT * FROM ${TABLES.BUG_REPORTS} ${whereClause} ORDER BY ROWID DESC`;

    console.log(`[BugReportCtrl] listAllReports Step 2 — querying${whereClause ? ' with filters' : ''}`);
    let reports = [];
    let hasMore = false;
    try {
      if (fetchAll) {
        // Walk the entire result set in 200-row pages (ZCQL hard cap)
        reports = await _fetchAllPaginated(req.catalystApp, baseQuery, { pageSize: 200 });
      } else {
        // Fetch limit+1 to detect has_more without a separate COUNT query
        const chunk = await _fetchAllPaginated(req.catalystApp, baseQuery, {
          limit: limitNum + 1, offset: offsetNum,
        });
        hasMore = chunk.length > limitNum;
        reports = hasMore ? chunk.slice(0, limitNum) : chunk;
      }
      console.log(`[BugReportCtrl] listAllReports Step 2 ✓ — ${reports.length} rows returned (hasMore=${hasMore})`);
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
          `SELECT ROWID, name FROM ${TABLES.TENANTS} WHERE ${tenantConditions} LIMIT 200`
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
    return ResponseHelper.success(res, {
      reports,
      total:    reports.length,
      page:     pageNum,
      limit:    limitNum,
      has_more: hasMore,
    });
  }

  // ─── POST /api/bugs/reports/:id/resolve ───────────────────────────────────
  async resolveReport(req, res) {
    const { id: reportId } = req.params;
    const { id: userId, name: userName, role } = req.currentUser;
    const { resolution_notes = '' } = req.body;

    console.log(`[BugReportCtrl] resolveReport Step 1 — reportId=${reportId} userId=${userId} role=${role}`);

    if (role !== 'SUPER_ADMIN' && !ADMIN_ROLES.includes(role)) {
      return ResponseHelper.forbidden(res, 'Admin access required');
    }

    // Step 2: fetch report
    let report;
    try {
      const raw = await req.catalystApp.zcql().executeZCQLQuery(
        `SELECT * FROM ${TABLES.BUG_REPORTS} WHERE ROWID = '${esc(reportId)}' LIMIT 1`
      );
      const rows = flattenRows(raw);
      if (!rows[0]) return ResponseHelper.notFound(res, 'Bug report not found');
      report = rows[0];
    } catch (dbErr) {
      console.error('[BugReportCtrl] resolveReport Step 2 ✗ — DB error:', dbErr.message);
      return ResponseHelper.serverError(res, 'Failed to fetch bug report');
    }
    console.log(`[BugReportCtrl] resolveReport Step 2 ✓ — report found title="${report.title}"`);

    // Step 3: update status to RESOLVED
    const resolvedAt = new Date().toISOString();
    try {
      await req.catalystApp.zcql().executeZCQLQuery(
        `UPDATE ${TABLES.BUG_REPORTS}
         SET status = 'RESOLVED',
             resolved_by = '${esc(userName)}',
             resolved_at = '${esc(resolvedAt)}',
             resolution_notes = '${esc(String(resolution_notes).slice(0, 2000))}'
         WHERE ROWID = '${esc(reportId)}'`
      );
    } catch (dbErr) {
      console.error('[BugReportCtrl] resolveReport Step 3 ✗ — UPDATE failed:', dbErr.message);
      return ResponseHelper.serverError(res, 'Failed to resolve bug report');
    }
    console.log('[BugReportCtrl] resolveReport Step 3 ✓ — status set to RESOLVED');

    // Step 4: send thank-you email to reporter
    const reporterEmail = report.reporter_email;
    if (reporterEmail && reporterEmail.includes('@')) {
      const fromEmail = process.env.FROM_EMAIL || 'catalystadmin@dsv360.ai';
      const htmlBody  = _buildResolvedEmailHtml({
        reporterName:     report.reporter_name || 'there',
        reportTitle:      report.title,
        reportType:       report.report_type || 'BUG',
        resolutionNotes:  resolution_notes,
        resolvedAt,
      });
      try {
        await req.catalystApp.email().sendMail({
          from_email: fromEmail,
          to_email:   [reporterEmail],
          subject:    `Your report has been resolved — ${report.title}`,
          content:    htmlBody,
          html_mode:  true,
        });
        console.log(`[BugReportCtrl] resolveReport Step 4 ✓ — email sent to ${reporterEmail}`);
      } catch (mailErr) {
        console.error(`[BugReportCtrl] resolveReport Step 4 ✗ — email failed:`, mailErr.message);
      }
    } else {
      console.warn('[BugReportCtrl] resolveReport Step 4 — no reporter email, skipping');
    }

    console.log('[BugReportCtrl] resolveReport ✓ — complete');
    return ResponseHelper.success(res, { resolved: true, reportId }, 'Bug report resolved successfully');
  }

  // ─── POST /api/bugs/reports/:id/reporter-reply ────────────────────────────
  // Called by the reporter (or admin) to add a reply/follow-up note.
  // Stored in reporter_reply + reporter_reply_at — separate from admin resolution_notes.
  async reporterReplyReport(req, res) {
    const { id: reportId } = req.params;
    const { id: userId, role, tenantId } = req.currentUser;
    const { reply } = req.body;

    console.log(`[BugReportCtrl] reporterReplyReport Step 1 — reportId=${reportId} userId=${userId} role=${role}`);

    if (!reply || !String(reply).trim()) {
      return ResponseHelper.validationError(res, 'reply is required');
    }

    // Fetch the report to verify ownership / tenant
    let report;
    try {
      const raw = await req.catalystApp.zcql().executeZCQLQuery(
        `SELECT ROWID, tenant_id, reporter_id, reporter_name, reporter_email, title FROM ${TABLES.BUG_REPORTS}
         WHERE ROWID = '${esc(reportId)}' LIMIT 1`
      );
      const rows = flattenRows(raw);
      if (!rows[0]) return ResponseHelper.notFound(res, 'Bug report not found');
      report = rows[0];
    } catch (dbErr) {
      console.error('[BugReportCtrl] reporterReplyReport Step 1 ✗ — DB error:', dbErr.message);
      return ResponseHelper.serverError(res, 'Failed to fetch bug report');
    }

    const isSuperAdmin = role === 'SUPER_ADMIN';
    const isAdmin = isSuperAdmin || ADMIN_ROLES.includes(role);
    const isReporter = String(report.reporter_id) === String(userId);

    if (!isAdmin && !isReporter) {
      console.warn(`[BugReportCtrl] reporterReplyReport ✗ — userId=${userId} is not reporter or admin`);
      return ResponseHelper.forbidden(res, 'You can only reply to your own reports');
    }
    if (!isSuperAdmin && String(report.tenant_id) !== String(tenantId)) {
      return ResponseHelper.forbidden(res, 'Access denied');
    }

    const repliedAt = new Date().toISOString();
    try {
      await req.catalystApp.zcql().executeZCQLQuery(
        `UPDATE ${TABLES.BUG_REPORTS}
         SET reporter_reply    = '${esc(String(reply).slice(0, 2000))}',
             reporter_reply_at = '${esc(repliedAt)}'
         WHERE ROWID = '${esc(reportId)}'`
      );
    } catch (dbErr) {
      console.error('[BugReportCtrl] reporterReplyReport ✗ — UPDATE failed:', dbErr.message);
      return ResponseHelper.serverError(res, 'Failed to save reply');
    }

    // Notify admins via email
    _sendReporterReplyNotification(req.catalystApp, {
      reportId,
      reportTitle: report.title || '(untitled)',
      reporterName: report.reporter_name || report.reporter_email || 'Reporter',
      reporterEmail: report.reporter_email || '',
      replyText: String(reply).slice(0, 2000),
      repliedAt,
      tenantId: String(report.tenant_id || tenantId),
    }).catch((e) => console.warn('[BugReportCtrl] reporterReplyReport — email notification failed (non-fatal):', e.message));

    // Reload full report for full title (we only selected ROWID/tenant_id/reporter_id above)
    console.log('[BugReportCtrl] reporterReplyReport ✓ — complete');
    return ResponseHelper.success(res, { saved: true, replied_at: repliedAt }, 'Reply submitted successfully');
  }

  // ─── POST /api/bugs/reports/:id/reply ─────────────────────────────────────
  async replyReport(req, res) {
    const { id: reportId } = req.params;
    const { id: userId, name: userName, role } = req.currentUser;
    const { resolution_notes } = req.body;

    console.log(`[BugReportCtrl] replyReport Step 1 — reportId=${reportId} userId=${userId}`);

    if (role !== 'SUPER_ADMIN' && !ADMIN_ROLES.includes(role)) {
      return ResponseHelper.forbidden(res, 'Admin access required');
    }
    if (!resolution_notes || !String(resolution_notes).trim()) {
      return ResponseHelper.validationError(res, 'resolution_notes is required');
    }

    try {
      await req.catalystApp.zcql().executeZCQLQuery(
        `UPDATE ${TABLES.BUG_REPORTS}
         SET resolution_notes = '${esc(String(resolution_notes).slice(0, 2000))}',
             resolved_by = '${esc(userName)}'
         WHERE ROWID = '${esc(reportId)}'`
      );
    } catch (dbErr) {
      console.error('[BugReportCtrl] replyReport ✗ — UPDATE failed:', dbErr.message);
      return ResponseHelper.serverError(res, 'Failed to save reply');
    }

    console.log('[BugReportCtrl] replyReport ✓ — complete');
    return ResponseHelper.success(res, { saved: true }, 'Reply saved');
  }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Walk a ZCQL query in pages of `pageSize` rows (ZCQL's per-query cap is ~200).
 * - `limit`  : maximum rows to return overall (default: unlimited)
 * - `offset` : starting row offset (default: 0)
 * - `pageSize`: rows per ZCQL call (default: 200)
 *
 * The `baseQuery` MUST NOT include LIMIT/OFFSET — they are appended here.
 */
async function _fetchAllPaginated(catalystApp, baseQuery, { limit = Infinity, offset = 0, pageSize = 200 } = {}) {
  const results = [];
  let cursor = offset;
  let remaining = limit;

  while (remaining > 0) {
    const take = Math.min(pageSize, remaining);
    const sql  = `${baseQuery} LIMIT ${cursor}, ${take}`;
    const raw  = await catalystApp.zcql().executeZCQLQuery(sql);
    const rows = (raw || []).map((r) => Object.assign({}, ...Object.values(r)));
    results.push(...rows);
    if (rows.length < take) break;     // last page
    cursor    += rows.length;
    remaining -= rows.length;
  }

  return results;
}

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

async function _sendReporterReplyNotification(catalystApp, { reportId, reportTitle, reporterName, reporterEmail, replyText, repliedAt, tenantId }) {
  // Load platform bug config to get notify_emails
  let config = null;
  try {
    const cfgRaw = await catalystApp.zcql().executeZCQLQuery(
      `SELECT * FROM ${TABLES.BUG_REPORT_CONFIG}
       WHERE tenant_id = '${esc(PLATFORM_TENANT_ID)}' LIMIT 1`
    );
    config = (cfgRaw || []).map((r) => Object.assign({}, ...Object.values(r)))[0] || null;
  } catch (e) {
    console.warn('[BugReportCtrl] _sendReporterReplyNotification — config fetch failed:', e.message);
    return;
  }

  if (!config) { console.log('[BugReportCtrl] _sendReporterReplyNotification — no platform config, skipping'); return; }

  const notifyEmails = _parseJsonArray(config.notify_emails);
  if (notifyEmails.length === 0) { console.log('[BugReportCtrl] _sendReporterReplyNotification — no notify_emails configured'); return; }

  const fromEmail = process.env.FROM_EMAIL || 'catalystadmin@dsv360.ai';
  const prefix    = config.email_subject_prefix || '[Bug Report]';
  const subject   = `${prefix} Reporter replied — ${reportTitle}`;
  const content   = _buildReporterReplyEmailHtml({ reportId, reportTitle, reporterName, reporterEmail, replyText, repliedAt });

  for (const recipient of notifyEmails) {
    try {
      await catalystApp.email().sendMail({
        from_email: fromEmail,
        to_email:   [recipient],
        subject,
        content,
        html_mode:  true,
      });
      console.log(`[BugReportCtrl] _sendReporterReplyNotification ✓ — email sent to ${recipient}`);
    } catch (mailErr) {
      console.error(`[BugReportCtrl] _sendReporterReplyNotification ✗ — email to ${recipient} failed:`, mailErr.message);
    }
  }
}

function _buildReporterReplyEmailHtml({ reportId, reportTitle, reporterName, reporterEmail, replyText, repliedAt }) {
  const dateStr = new Date(repliedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reporter replied to a bug report</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:580px;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);border-radius:16px 16px 0 0;padding:32px 40px 28px;text-align:center;">
              <div style="display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;background:rgba(255,255,255,0.15);border-radius:50%;margin-bottom:14px;">
                <span style="font-size:24px;">↩️</span>
              </div>
              <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#ffffff;">Reporter Has Replied</h1>
              <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.8);">Action required — a reporter left a new note on a bug report</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:32px 40px;">
              <!-- Report card -->
              <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Bug Report</p>
                <p style="margin:0 0 10px;font-size:16px;font-weight:700;color:#111827;">${_htmlEsc(reportTitle)}</p>
                <p style="margin:0;font-size:12px;color:#6b7280;">Report ID: <span style="font-family:monospace;color:#4f46e5;">#${_htmlEsc(String(reportId))}</span></p>
              </div>

              <!-- Reporter info -->
              <p style="margin:0 0 6px;font-size:13px;color:#374151;line-height:1.6;">
                <strong>${_htmlEsc(reporterName)}</strong>${reporterEmail ? ` &lt;${_htmlEsc(reporterEmail)}&gt;` : ''} left the following reply:
              </p>

              <!-- Reply body -->
              <div style="background:#eef2ff;border-left:4px solid #6366f1;border-radius:0 12px 12px 0;padding:16px 20px;margin:16px 0;">
                <p style="margin:0;font-size:14px;color:#312e81;white-space:pre-wrap;line-height:1.7;">${_htmlEsc(replyText)}</p>
              </div>

              <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">Replied on ${_htmlEsc(dateStr)}</p>

              <p style="margin:24px 0 0;font-size:14px;color:#6b7280;line-height:1.6;">
                Please log in to the platform to review this reply and take any necessary action.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#4f46e5;">DSVOps Pulse</p>
              <p style="margin:0;font-size:12px;color:#9ca3af;">This is an automated notification from the Bug Reporting system.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
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

function _buildResolvedEmailHtml({ reporterName, reportTitle, reportType, resolutionNotes, resolvedAt }) {
  const typeLabel = {
    BUG:             'Bug Report',
    ISSUE:           'Issue Report',
    FEEDBACK:        'Feedback',
    FEATURE_REQUEST: 'Feature Request',
  }[reportType] || 'Report';

  const dateStr = new Date(resolvedAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const notesBlock = resolutionNotes && resolutionNotes.trim()
    ? `<div style="margin:24px 0 0;">
         <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:0.5px;">Resolution Note</p>
         <div style="background:#f0fdf4;border-left:4px solid #22c55e;border-radius:0 8px 8px 0;padding:14px 16px;font-size:14px;color:#166534;white-space:pre-wrap;line-height:1.6;">${_htmlEsc(resolutionNotes)}</div>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your report has been resolved</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);border-radius:16px 16px 0 0;padding:36px 40px 32px;text-align:center;">
              <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:50%;margin-bottom:16px;">
                <span style="font-size:26px;">✅</span>
              </div>
              <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Report Resolved</h1>
              <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.8);">Your ${_htmlEsc(typeLabel)} has been reviewed &amp; closed</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:32px 40px;">
              <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
                Hi <strong>${_htmlEsc(reporterName)}</strong>,
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
                Great news! Your ${_htmlEsc(typeLabel.toLowerCase())} has been reviewed by our team and marked as <strong style="color:#16a34a;">resolved</strong>. We truly appreciate you taking the time to reach out — reports like yours help us improve the platform for everyone.
              </p>

              <!-- Report summary card -->
              <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px 24px;margin-bottom:4px;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">${_htmlEsc(typeLabel)}</p>
                <p style="margin:0 0 12px;font-size:16px;font-weight:600;color:#111827;">${_htmlEsc(reportTitle)}</p>
                <p style="margin:0;font-size:12px;color:#6b7280;">Resolved on ${_htmlEsc(dateStr)}</p>
              </div>

              ${notesBlock}

              <p style="margin:28px 0 0;font-size:14px;color:#6b7280;line-height:1.6;">
                If you have any follow-up questions or notice the issue persisting, please don't hesitate to submit another report — we're here to help.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-radius:0 0 16px 16px;padding:24px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#4f46e5;">DSVOps Pulse team</p>
              <p style="margin:0;font-size:12px;color:#9ca3af;">Delivering operational excellence, one fix at a time.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = BugReportController;
