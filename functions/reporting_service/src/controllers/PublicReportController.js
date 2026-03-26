'use strict';

const DataStoreService = require('../services/DataStoreService');
const ResponseHelper   = require('../utils/ResponseHelper');

// Matches the table used by PdfController
const REPORT_EXPORTS_TABLE = 'report_exports';

class PublicReportController {
  constructor(catalystApp) {
    // catalystApp may be null on public routes; DataStoreService still needs it
    // for ZCQL access.  The Catalyst SDK initialises even for unauthenticated
    // requests as long as the function is invoked via the public URL.
    this.db = new DataStoreService(catalystApp);
  }

  // GET /api/public/reports/:shareToken  — no auth required
  async view(req, res) {
    try {
      const { shareToken } = req.params;
      if (!shareToken) {
        return ResponseHelper.validationError(res, 'shareToken is required');
      }

      const rows = await this.db.query(
        `SELECT * FROM ${REPORT_EXPORTS_TABLE} WHERE share_token = '${DataStoreService.escape(shareToken)}' LIMIT 1`
      );

      if (!rows[0]) {
        return ResponseHelper.notFound(res, 'Report not found or link is invalid');
      }

      const job = rows[0];

      // Check expiry
      if (job.expires_at) {
        const now = DataStoreService.fmtDT(new Date());
        if (job.expires_at < now) {
          return ResponseHelper.notFound(res, 'Report link has expired');
        }
      }

      return ResponseHelper.success(res, {
        title:       job.title,
        report_type: job.report_type,
        status:      job.status,
        file_url:    job.file_url || null,
        created_at:  job.CREATEDTIME,
        expires_at:  job.expires_at,
      });
    } catch (err) {
      console.error('[PublicReportController.view]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = PublicReportController;
