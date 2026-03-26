'use strict';

const DataStoreService = require('../services/DataStoreService');
const ResponseHelper   = require('../utils/ResponseHelper');
const { TABLES }       = require('../utils/Constants');

const BUCKET_NAME     = process.env.STRATUS_ATTACHMENTS_BUCKET || 'attachments-tasks';
const BUCKET_BASE_URL = process.env.STRATUS_ATTACHMENTS_URL    || 'https://attachments-tasks-development.zohostratus.in';

class AttachmentController {
  constructor(catalystApp) {
    this.catalystApp = catalystApp;
    this.db          = new DataStoreService(catalystApp);
    this.stratus     = catalystApp.stratus();
  }

  // POST /api/ts/tasks/:taskId/attachments
  // Body: { fileName: string, contentType: string, base64: string }
  async upload(req, res) {
    const { taskId } = req.params;
    const { fileName, contentType, base64 } = req.body;

    if (!fileName || !base64) {
      return ResponseHelper.validationError(res, 'fileName and base64 are required');
    }
    if (!BUCKET_BASE_URL) {
      return ResponseHelper.serverError(res, 'STRATUS_ATTACHMENTS_URL not configured in .env');
    }

    const task = await this.db.findById(TABLES.TASKS, taskId, req.tenantId);
    if (!task) return ResponseHelper.notFound(res, 'Task not found');

    // Decode base64 → Buffer
    const base64Data = base64.replace(/^data:[^;]+;base64,/, '');
    const buffer     = Buffer.from(base64Data, 'base64');

    // Unique key: taskId_userId_timestamp.ext
    const ext            = fileName.split('.').pop() || 'bin';
    const uniqueFileName = `task_${taskId}_${req.currentUser.id}_${Date.now()}.${ext}`;

    const bucket       = this.stratus.bucket(BUCKET_NAME);
    const uploadResult = await bucket.putObject(uniqueFileName, buffer, {
      contentType: contentType || 'application/octet-stream',
    });

    if (uploadResult !== true) {
      return ResponseHelper.serverError(res, 'Attachment upload to Stratus failed');
    }

    const fileUrl = `${BUCKET_BASE_URL}/${uniqueFileName}`;

    // Columns: tenant_id(bigint), task_id(FK), file_name(varchar), file_url(text),
    //          file_size_kb(double), mime_type(varchar), uploaded_by(bigint)
    const row = await this.db.insert(TABLES.TASK_ATTACHMENTS, {
      tenant_id:   String(req.tenantId),
      task_id:     String(taskId),
      file_name:   fileName,
      file_url:    fileUrl,
      file_size_kb: Math.round(buffer.length / 1024 * 100) / 100,
      mime_type:   contentType || 'application/octet-stream',
      uploaded_by: String(req.currentUser.id),
    });

    return ResponseHelper.created(res, row);
  }

  // DELETE /api/ts/tasks/:taskId/attachments/:attachId
  async remove(req, res) {
    const attachment = await this.db.findById(TABLES.TASK_ATTACHMENTS, req.params.attachId, req.tenantId);
    if (!attachment) return ResponseHelper.notFound(res, 'Attachment not found');

    // Derive Stratus key from stored file_url
    if (attachment.file_url) {
      try {
        const stratusKey = attachment.file_url.replace(`${BUCKET_BASE_URL}/`, '');
        await this.stratus.bucket(BUCKET_NAME).deleteObject(stratusKey);
      } catch (_) { /* non-fatal — file may already be gone */ }
    }

    await this.db.delete(TABLES.TASK_ATTACHMENTS, req.params.attachId);
    return ResponseHelper.success(res, { message: 'Attachment deleted' });
  }
}

module.exports = AttachmentController;
