'use strict';

const DataStoreService = require('../services/DataStoreService');
const AuditService     = require('../services/AuditService');
const ResponseHelper   = require('../utils/ResponseHelper');
const { TABLES, AUDIT_ACTION } = require('../utils/Constants');

const BUCKET_NAME     = process.env.STRATUS_DOCS_BUCKET || 'project-docs';
const BUCKET_BASE_URL = process.env.STRATUS_DOCS_URL    || '';

class DocumentController {
  constructor(catalystApp) {
    this.db      = new DataStoreService(catalystApp);
    this.audit   = new AuditService(this.db);
    this.stratus = catalystApp.stratus();
  }

  // GET /api/docs/projects/:projectId/documents?folderId=x&all=true
  // Pass all=true to return all documents in the project regardless of folder.
  // Omit both to list root-level documents only.
  async list(req, res) {
    const { projectId } = req.params;
    const { folderId, all } = req.query;

    let whereExtra = `project_id = '${DataStoreService.escape(projectId)}' AND is_deleted = 'false'`;
    if (all === 'true') {
      // No folder filter — return every doc in this project
    } else if (folderId) {
      whereExtra += ` AND folder_id = '${DataStoreService.escape(folderId)}'`;
    } else {
      whereExtra += ` AND (folder_id IS NULL OR folder_id = '')`;
    }

    const docs = await this.db.findWhere(
      TABLES.PROJECT_DOCUMENTS, req.tenantId, whereExtra,
      { orderBy: 'CREATEDTIME DESC', limit: 300 }
    );
    return ResponseHelper.success(res, docs);
  }

  // POST /api/docs/projects/:projectId/documents
  // Body: { name?, fileName, contentType, base64, folderId?, description?, tags? }
  async upload(req, res) {
    const { projectId } = req.params;
    const { name, fileName, contentType, base64, folderId, description, tags } = req.body;

    if (!fileName || !base64) {
      return ResponseHelper.validationError(res, 'fileName and base64 are required');
    }
    if (!BUCKET_BASE_URL) {
      return ResponseHelper.serverError(res, 'STRATUS_DOCS_URL is not configured in .env');
    }

    // Validate folder if provided
    if (folderId) {
      const folder = await this.db.findById(TABLES.PROJECT_DOC_FOLDERS, folderId, req.tenantId);
      if (!folder || folder.is_deleted === 'true' || folder.project_id !== String(projectId)) {
        return ResponseHelper.notFound(res, 'Folder not found');
      }
    }

    // Decode base64 → Buffer
    const base64Data = base64.replace(/^data:[^;]+;base64,/, '');
    const buffer     = Buffer.from(base64Data, 'base64');

    const ext            = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : 'bin';
    const uniqueFileName = `doc_${req.tenantId}_${projectId}_${Date.now()}_${req.currentUser.id}.${ext}`;

    const bucket       = this.stratus.bucket(BUCKET_NAME);
    const uploadResult = await bucket.putObject(uniqueFileName, buffer, {
      contentType: contentType || 'application/octet-stream',
    });

    if (uploadResult !== true) {
      return ResponseHelper.serverError(res, 'File upload to Stratus failed');
    }

    const fileUrl    = `${BUCKET_BASE_URL}/${uniqueFileName}`;
    const fileSizeKb = String(Math.round((buffer.length / 1024) * 100) / 100);
    const displayName = (name || fileName).trim();

    const doc = await this.db.insert(TABLES.PROJECT_DOCUMENTS, {
      tenant_id:       req.tenantId,
      project_id:      String(projectId),
      folder_id:       folderId ? String(folderId) : '',
      name:            displayName,
      description:     description || '',
      file_name:       uniqueFileName,
      file_url:        fileUrl,
      file_size_kb:    fileSizeKb,
      mime_type:       contentType || 'application/octet-stream',
      file_extension:  ext,
      current_version: '1',
      tags:            tags ? JSON.stringify(Array.isArray(tags) ? tags : [tags]) : '[]',
      uploaded_by:     req.currentUser.id,
      is_deleted:      'false',
    });

    // Record version 1
    await this.db.insert(TABLES.PROJECT_DOC_VERSIONS, {
      tenant_id:      req.tenantId,
      document_id:    String(doc.ROWID),
      version_number: '1',
      file_name:      uniqueFileName,
      file_url:       fileUrl,
      file_size_kb:   fileSizeKb,
      mime_type:      contentType || 'application/octet-stream',
      change_note:    'Initial upload',
      uploaded_by:    req.currentUser.id,
    });

    await this.audit.log({
      tenantId:    req.tenantId,
      entityType:  'project_document',
      entityId:    doc.ROWID,
      action:      AUDIT_ACTION.CREATE,
      newValue:    { name: displayName, projectId, folderId: folderId || null },
      performedBy: req.currentUser.id,
    });

    return ResponseHelper.created(res, doc);
  }

  // GET /api/docs/projects/:projectId/documents/:docId
  async getById(req, res) {
    const { projectId, docId } = req.params;

    const doc = await this.db.findById(TABLES.PROJECT_DOCUMENTS, docId, req.tenantId);
    if (!doc || doc.is_deleted === 'true') {
      return ResponseHelper.notFound(res, 'Document not found');
    }
    if (doc.project_id !== String(projectId)) {
      return ResponseHelper.forbidden(res, 'Document does not belong to this project');
    }

    const versions = await this.db.findWhere(
      TABLES.PROJECT_DOC_VERSIONS, req.tenantId,
      `document_id = '${DataStoreService.escape(docId)}'`,
      { orderBy: 'CREATEDTIME DESC', limit: 50 }
    );

    return ResponseHelper.success(res, { ...doc, versions });
  }

  // PUT /api/docs/projects/:projectId/documents/:docId
  // Body: { name?, description?, tags?, folderId? }
  async update(req, res) {
    const { projectId, docId } = req.params;
    const { name, description, tags, folderId } = req.body;

    const doc = await this.db.findById(TABLES.PROJECT_DOCUMENTS, docId, req.tenantId);
    if (!doc || doc.is_deleted === 'true') {
      return ResponseHelper.notFound(res, 'Document not found');
    }
    if (doc.project_id !== String(projectId)) {
      return ResponseHelper.forbidden(res, 'Document does not belong to this project');
    }

    // Validate new folderId if provided
    if (folderId) {
      const folder = await this.db.findById(TABLES.PROJECT_DOC_FOLDERS, folderId, req.tenantId);
      if (!folder || folder.is_deleted === 'true' || folder.project_id !== String(projectId)) {
        return ResponseHelper.notFound(res, 'Target folder not found');
      }
    }

    const updateData = { ROWID: docId };
    if (name        !== undefined) updateData.name        = String(name).trim();
    if (description !== undefined) updateData.description = description;
    if (tags        !== undefined) updateData.tags        = JSON.stringify(Array.isArray(tags) ? tags : []);
    if (folderId    !== undefined) updateData.folder_id   = folderId ? String(folderId) : '';

    const updated = await this.db.update(TABLES.PROJECT_DOCUMENTS, updateData);

    await this.audit.log({
      tenantId:    req.tenantId,
      entityType:  'project_document',
      entityId:    docId,
      action:      AUDIT_ACTION.UPDATE,
      oldValue:    { name: doc.name, description: doc.description, folderId: doc.folder_id },
      newValue:    updateData,
      performedBy: req.currentUser.id,
    });

    return ResponseHelper.success(res, updated);
  }

  // DELETE /api/docs/projects/:projectId/documents/:docId
  async remove(req, res) {
    const { projectId, docId } = req.params;

    const doc = await this.db.findById(TABLES.PROJECT_DOCUMENTS, docId, req.tenantId);
    if (!doc || doc.is_deleted === 'true') {
      return ResponseHelper.notFound(res, 'Document not found');
    }
    if (doc.project_id !== String(projectId)) {
      return ResponseHelper.forbidden(res, 'Document does not belong to this project');
    }

    // Only uploader or DOC_ADMIN can delete
    const user    = req.currentUser;
    const isAdmin = user.role === 'TENANT_ADMIN' || user.role === 'SUPER_ADMIN' ||
      (Array.isArray(user.permissions) && user.permissions.includes('DOC_ADMIN'));
    if (doc.uploaded_by !== user.id && !isAdmin) {
      return ResponseHelper.forbidden(res, 'You can only delete documents you uploaded');
    }

    await this.db.update(TABLES.PROJECT_DOCUMENTS, { ROWID: docId, is_deleted: 'true' });

    // Auto-revoke any active share links for this document
    const shares = await this.db.findWhere(
      TABLES.PROJECT_DOC_SHARES, req.tenantId,
      `document_id = '${DataStoreService.escape(docId)}' AND is_active = 'true'`,
      { limit: 50 }
    );
    for (const share of shares) {
      await this.db.update(TABLES.PROJECT_DOC_SHARES, { ROWID: share.ROWID, is_active: 'false' });
    }

    await this.audit.log({
      tenantId:    req.tenantId,
      entityType:  'project_document',
      entityId:    docId,
      action:      AUDIT_ACTION.DELETE,
      oldValue:    { name: doc.name, sharesRevoked: shares.length },
      performedBy: req.currentUser.id,
    });

    return ResponseHelper.success(res, { message: 'Document deleted', sharesRevoked: shares.length });
  }

  // POST /api/docs/projects/:projectId/documents/:docId/versions
  // Body: { fileName, contentType, base64, changeNote? }
  async uploadVersion(req, res) {
    const { projectId, docId } = req.params;
    const { fileName, contentType, base64, changeNote } = req.body;

    if (!fileName || !base64) {
      return ResponseHelper.validationError(res, 'fileName and base64 are required');
    }
    if (!BUCKET_BASE_URL) {
      return ResponseHelper.serverError(res, 'STRATUS_DOCS_URL is not configured in .env');
    }

    const doc = await this.db.findById(TABLES.PROJECT_DOCUMENTS, docId, req.tenantId);
    if (!doc || doc.is_deleted === 'true') {
      return ResponseHelper.notFound(res, 'Document not found');
    }
    if (doc.project_id !== String(projectId)) {
      return ResponseHelper.forbidden(res, 'Document does not belong to this project');
    }

    const base64Data = base64.replace(/^data:[^;]+;base64,/, '');
    const buffer     = Buffer.from(base64Data, 'base64');

    const newVersion     = String(parseInt(doc.current_version || '1', 10) + 1);
    const ext            = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : 'bin';
    const uniqueFileName = `doc_${req.tenantId}_${projectId}_${docId}_v${newVersion}_${Date.now()}.${ext}`;

    const bucket       = this.stratus.bucket(BUCKET_NAME);
    const uploadResult = await bucket.putObject(uniqueFileName, buffer, {
      contentType: contentType || 'application/octet-stream',
    });

    if (uploadResult !== true) {
      return ResponseHelper.serverError(res, 'File upload to Stratus failed');
    }

    const fileUrl    = `${BUCKET_BASE_URL}/${uniqueFileName}`;
    const fileSizeKb = String(Math.round((buffer.length / 1024) * 100) / 100);

    const version = await this.db.insert(TABLES.PROJECT_DOC_VERSIONS, {
      tenant_id:      req.tenantId,
      document_id:    String(docId),
      version_number: newVersion,
      file_name:      uniqueFileName,
      file_url:       fileUrl,
      file_size_kb:   fileSizeKb,
      mime_type:      contentType || 'application/octet-stream',
      change_note:    changeNote || '',
      uploaded_by:    req.currentUser.id,
    });

    // Promote new version to the document's current file
    await this.db.update(TABLES.PROJECT_DOCUMENTS, {
      ROWID:           docId,
      file_name:       uniqueFileName,
      file_url:        fileUrl,
      file_size_kb:    fileSizeKb,
      mime_type:       contentType || 'application/octet-stream',
      file_extension:  ext,
      current_version: newVersion,
    });

    await this.audit.log({
      tenantId:    req.tenantId,
      entityType:  'project_document',
      entityId:    docId,
      action:      AUDIT_ACTION.UPDATE,
      oldValue:    { version: doc.current_version, fileUrl: doc.file_url },
      newValue:    { version: newVersion, fileUrl, changeNote: changeNote || '' },
      performedBy: req.currentUser.id,
    });

    return ResponseHelper.created(res, version);
  }

  // GET /api/docs/projects/:projectId/documents/:docId/versions
  async getVersions(req, res) {
    const { projectId, docId } = req.params;

    const doc = await this.db.findById(TABLES.PROJECT_DOCUMENTS, docId, req.tenantId);
    if (!doc || doc.is_deleted === 'true') {
      return ResponseHelper.notFound(res, 'Document not found');
    }
    if (doc.project_id !== String(projectId)) {
      return ResponseHelper.forbidden(res, 'Document does not belong to this project');
    }

    const versions = await this.db.findWhere(
      TABLES.PROJECT_DOC_VERSIONS, req.tenantId,
      `document_id = '${DataStoreService.escape(docId)}'`,
      { orderBy: 'CREATEDTIME DESC', limit: 50 }
    );

    return ResponseHelper.success(res, versions);
  }
}

module.exports = DocumentController;
