'use strict';

const crypto           = require('crypto');
const DataStoreService = require('../services/DataStoreService');
const ResponseHelper   = require('../utils/ResponseHelper');
const { TABLES }       = require('../utils/Constants');

// REPORT_EXPORTS table is provisioned in the reporting_service DataStore.
// It is not included in the shared TABLES constant because it belongs exclusively
// to this service.
const REPORT_EXPORTS_TABLE = 'report_exports';

class PdfController {
  constructor(catalystApp) {
    this.db          = new DataStoreService(catalystApp);
    this.catalystApp = catalystApp;
  }

  // POST /api/reports/pdf/generate
  async generate(req, res) {
    try {
      const { report_type, filters, title } = req.body;
      if (!report_type) {
        return ResponseHelper.validationError(res, 'report_type is required');
      }

      // Generate a secure public share token (48 hex chars = 192-bit)
      const shareToken = crypto.randomBytes(24).toString('hex');
      const expiresAt  = DataStoreService.fmtDT(new Date(Date.now() + 7 * 24 * 3600 * 1000));

      const job = await this.db.insert(REPORT_EXPORTS_TABLE, {
        tenant_id:   req.tenantId,
        created_by:  req.currentUser.id,
        report_type: report_type.toUpperCase(),
        filters:     JSON.stringify(filters || {}),
        title:       title || `${report_type.toUpperCase()} Report`,
        share_token: shareToken,
        expires_at:  expiresAt,
        status:      'PENDING',
        file_url:    '',
      });

      // In production: trigger Zoho Catalyst SmartBrowz to render report HTML → PDF
      // const smartBrowz = this.catalystApp.smartBrowz();
      // const renderUrl  = `${process.env.APP_URL}/report-render/${shareToken}`;
      // const pdf        = await smartBrowz.convertURL({ url: renderUrl, outputType: 'pdf' });
      // Then update job with file_url and status = 'READY'

      return ResponseHelper.created(res, {
        job_id:      job.ROWID,
        share_token: shareToken,
        expires_at:  expiresAt,
        status:      'PENDING',
        message:     'PDF generation queued. Poll /api/reports/pdf/jobs/:jobId or access via share_token when ready.',
      });
    } catch (err) {
      console.error('[PdfController.generate]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // GET /api/reports/pdf/jobs
  async listJobs(req, res) {
    try {
      const jobs = await this.db.findWhere(
        REPORT_EXPORTS_TABLE,
        req.tenantId,
        `created_by = '${DataStoreService.escape(req.currentUser.id)}'`,
        { orderBy: 'CREATEDTIME DESC', limit: 20 }
      );
      return ResponseHelper.success(res, jobs);
    } catch (err) {
      console.error('[PdfController.listJobs]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // GET /api/reports/pdf/jobs/:jobId
  async getJob(req, res) {
    try {
      const job = await this.db.findById(
        REPORT_EXPORTS_TABLE,
        req.params.jobId,
        req.tenantId
      );
      if (!job) return ResponseHelper.notFound(res, 'Export job not found');
      return ResponseHelper.success(res, job);
    } catch (err) {
      console.error('[PdfController.getJob]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = PdfController;
