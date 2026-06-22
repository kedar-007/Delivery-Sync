'use strict';

const DataStoreService = require('../services/DataStoreService');
const AuditService     = require('../services/AuditService');
const ResponseHelper   = require('../utils/ResponseHelper');
const { TABLES, AUDIT_ACTION } = require('../utils/Constants');

class FolderController {
  constructor(catalystApp) {
    this.db    = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
  }

  _canAccessFolder(folder, user) {
    if (!folder.visibility || folder.visibility === 'ALL') return true;
    if (user.role === 'TENANT_ADMIN' || user.role === 'SUPER_ADMIN') return true;
    if (Array.isArray(user.permissions) && user.permissions.includes('DOC_ADMIN')) return true;
    if (folder.created_by === user.id) return true;
    try {
      const allowed = JSON.parse(folder.allowed_user_ids || '[]');
      return Array.isArray(allowed) && allowed.includes(String(user.id));
    } catch { return false; }
  }

  // GET /api/docs/projects/:projectId/folders?parentFolderId=x
  // Omit parentFolderId to list root-level folders.
  async list(req, res) {
    const { projectId } = req.params;
    const { parentFolderId } = req.query;

    let whereExtra = `project_id = '${DataStoreService.escape(projectId)}' AND is_deleted = 'false'`;
    if (parentFolderId) {
      whereExtra += ` AND parent_folder_id = '${DataStoreService.escape(parentFolderId)}'`;
    } else {
      whereExtra += ` AND (parent_folder_id IS NULL OR parent_folder_id = '')`;
    }

    const folders = await this.db.findWhere(
      TABLES.PROJECT_DOC_FOLDERS, req.tenantId, whereExtra,
      { orderBy: 'name ASC', limit: 200 }
    );

    const accessible = folders.filter((f) => this._canAccessFolder(f, req.currentUser));
    return ResponseHelper.success(res, accessible);
  }

  // POST /api/docs/projects/:projectId/folders
  // Body: { name, parentFolderId? }
  async create(req, res) {
    const { projectId } = req.params;
    const { name, parentFolderId } = req.body;

    if (!name || !String(name).trim()) {
      return ResponseHelper.validationError(res, 'Folder name is required');
    }
    const trimmedName = String(name).trim();

    // Validate parent folder belongs to this project
    if (parentFolderId) {
      const parent = await this.db.findById(TABLES.PROJECT_DOC_FOLDERS, parentFolderId, req.tenantId);
      if (!parent || parent.is_deleted === 'true' || parent.project_id !== String(projectId)) {
        return ResponseHelper.notFound(res, 'Parent folder not found');
      }
    }

    // Reject duplicate name at the same level
    let dupWhere = `project_id = '${DataStoreService.escape(projectId)}' AND name = '${DataStoreService.escape(trimmedName)}' AND is_deleted = 'false'`;
    dupWhere += parentFolderId
      ? ` AND parent_folder_id = '${DataStoreService.escape(parentFolderId)}'`
      : ` AND (parent_folder_id IS NULL OR parent_folder_id = '')`;

    const existing = await this.db.findWhere(TABLES.PROJECT_DOC_FOLDERS, req.tenantId, dupWhere, { limit: 1 });
    if (existing.length > 0) {
      return ResponseHelper.conflict(res, 'A folder with this name already exists at this location');
    }

    const folder = await this.db.insert(TABLES.PROJECT_DOC_FOLDERS, {
      tenant_id:        req.tenantId,
      project_id:       String(projectId),
      name:             trimmedName,
      parent_folder_id: parentFolderId ? String(parentFolderId) : '',
      created_by:       req.currentUser.id,
      is_deleted:       'false',
    });

    await this.audit.log({
      tenantId:    req.tenantId,
      entityType:  'project_doc_folder',
      entityId:    folder.ROWID,
      action:      AUDIT_ACTION.CREATE,
      newValue:    { name: trimmedName, projectId, parentFolderId: parentFolderId || null },
      performedBy: req.currentUser.id,
    });

    return ResponseHelper.created(res, folder);
  }

  // PUT /api/docs/projects/:projectId/folders/:folderId
  // Body: { name }
  async rename(req, res) {
    const { projectId, folderId } = req.params;
    const { name } = req.body;

    if (!name || !String(name).trim()) {
      return ResponseHelper.validationError(res, 'Folder name is required');
    }
    const trimmedName = String(name).trim();

    const folder = await this.db.findById(TABLES.PROJECT_DOC_FOLDERS, folderId, req.tenantId);
    if (!folder || folder.is_deleted === 'true') {
      return ResponseHelper.notFound(res, 'Folder not found');
    }
    if (folder.project_id !== String(projectId)) {
      return ResponseHelper.forbidden(res, 'Folder does not belong to this project');
    }

    const updated = await this.db.update(TABLES.PROJECT_DOC_FOLDERS, {
      ROWID: folderId,
      name:  trimmedName,
    });

    await this.audit.log({
      tenantId:    req.tenantId,
      entityType:  'project_doc_folder',
      entityId:    folderId,
      action:      AUDIT_ACTION.UPDATE,
      oldValue:    { name: folder.name },
      newValue:    { name: trimmedName },
      performedBy: req.currentUser.id,
    });

    return ResponseHelper.success(res, updated);
  }

  // DELETE /api/docs/projects/:projectId/folders/:folderId
  // Soft-deletes the folder, all its documents, and direct child folders.
  async remove(req, res) {
    const { projectId, folderId } = req.params;

    const folder = await this.db.findById(TABLES.PROJECT_DOC_FOLDERS, folderId, req.tenantId);
    if (!folder || folder.is_deleted === 'true') {
      return ResponseHelper.notFound(res, 'Folder not found');
    }
    if (folder.project_id !== String(projectId)) {
      return ResponseHelper.forbidden(res, 'Folder does not belong to this project');
    }

    // Only creator or DOC_ADMIN can delete
    const user    = req.currentUser;
    const isAdmin = user.role === 'TENANT_ADMIN' || user.role === 'SUPER_ADMIN' ||
      (Array.isArray(user.permissions) && user.permissions.includes('DOC_ADMIN'));
    if (folder.created_by !== user.id && !isAdmin) {
      return ResponseHelper.forbidden(res, 'You can only delete folders you created');
    }

    // Soft-delete the folder itself
    await this.db.update(TABLES.PROJECT_DOC_FOLDERS, { ROWID: folderId, is_deleted: 'true' });

    // Cascade: soft-delete all documents inside
    const docs = await this.db.findWhere(
      TABLES.PROJECT_DOCUMENTS, req.tenantId,
      `project_id = '${DataStoreService.escape(projectId)}' AND folder_id = '${DataStoreService.escape(folderId)}' AND is_deleted = 'false'`,
      { limit: 300 }
    );
    for (const doc of docs) {
      await this.db.update(TABLES.PROJECT_DOCUMENTS, { ROWID: doc.ROWID, is_deleted: 'true' });
    }

    // Cascade: soft-delete immediate child folders
    const children = await this.db.findWhere(
      TABLES.PROJECT_DOC_FOLDERS, req.tenantId,
      `project_id = '${DataStoreService.escape(projectId)}' AND parent_folder_id = '${DataStoreService.escape(folderId)}' AND is_deleted = 'false'`,
      { limit: 300 }
    );
    for (const child of children) {
      await this.db.update(TABLES.PROJECT_DOC_FOLDERS, { ROWID: child.ROWID, is_deleted: 'true' });
    }

    await this.audit.log({
      tenantId:    req.tenantId,
      entityType:  'project_doc_folder',
      entityId:    folderId,
      action:      AUDIT_ACTION.DELETE,
      oldValue:    { name: folder.name, docsDeleted: docs.length, childFoldersDeleted: children.length },
      performedBy: req.currentUser.id,
    });

    return ResponseHelper.success(res, {
      message: 'Folder deleted',
      docsDeleted: docs.length,
      childFoldersDeleted: children.length,
    });
  }

  // GET /api/docs/projects/:projectId/folders/:folderId/contents
  // Returns the folder metadata + sub-folders + documents inside.
  async getContents(req, res) {
    const { projectId, folderId } = req.params;

    const folder = await this.db.findById(TABLES.PROJECT_DOC_FOLDERS, folderId, req.tenantId);
    if (!folder || folder.is_deleted === 'true') {
      return ResponseHelper.notFound(res, 'Folder not found');
    }
    if (folder.project_id !== String(projectId)) {
      return ResponseHelper.forbidden(res, 'Folder does not belong to this project');
    }
    if (!this._canAccessFolder(folder, req.currentUser)) {
      return ResponseHelper.forbidden(res, 'You do not have access to this folder');
    }

    const [rawSubFolders, documents] = await Promise.all([
      this.db.findWhere(
        TABLES.PROJECT_DOC_FOLDERS, req.tenantId,
        `project_id = '${DataStoreService.escape(projectId)}' AND parent_folder_id = '${DataStoreService.escape(folderId)}' AND is_deleted = 'false'`,
        { orderBy: 'name ASC', limit: 200 }
      ),
      this.db.findWhere(
        TABLES.PROJECT_DOCUMENTS, req.tenantId,
        `project_id = '${DataStoreService.escape(projectId)}' AND folder_id = '${DataStoreService.escape(folderId)}' AND is_deleted = 'false'`,
        { orderBy: 'CREATEDTIME DESC', limit: 200 }
      ),
    ]);

    const subFolders = rawSubFolders.filter((f) => this._canAccessFolder(f, req.currentUser));
    return ResponseHelper.success(res, { folder, subFolders, documents });
  }

  // PUT /api/docs/projects/:projectId/folders/:folderId/access
  // Body: { visibility: 'ALL'|'RESTRICTED', allowedUserIds: string[] }
  async updateAccess(req, res) {
    const { projectId, folderId } = req.params;
    const { visibility, allowedUserIds } = req.body;

    const folder = await this.db.findById(TABLES.PROJECT_DOC_FOLDERS, folderId, req.tenantId);
    if (!folder || folder.is_deleted === 'true') {
      return ResponseHelper.notFound(res, 'Folder not found');
    }
    if (folder.project_id !== String(projectId)) {
      return ResponseHelper.forbidden(res, 'Folder does not belong to this project');
    }

    const resolvedVisibility = ['ALL', 'RESTRICTED'].includes(visibility) ? visibility : 'ALL';
    const resolvedAllowedIds = Array.isArray(allowedUserIds) ? allowedUserIds.map(String) : [];

    const updated = await this.db.update(TABLES.PROJECT_DOC_FOLDERS, {
      ROWID:            folderId,
      visibility:       resolvedVisibility,
      allowed_user_ids: JSON.stringify(resolvedAllowedIds),
    });

    await this.audit.log({
      tenantId:    req.tenantId,
      entityType:  'project_doc_folder',
      entityId:    folderId,
      action:      AUDIT_ACTION.UPDATE,
      oldValue:    { visibility: folder.visibility || 'ALL', allowedUserIds: folder.allowed_user_ids || '[]' },
      newValue:    { visibility: resolvedVisibility, allowedUserIds: resolvedAllowedIds },
      performedBy: req.currentUser.id,
    });

    return ResponseHelper.success(res, updated);
  }
}

module.exports = FolderController;
