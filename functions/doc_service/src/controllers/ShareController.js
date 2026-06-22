'use strict';

const { randomUUID }   = require('crypto');
const DataStoreService = require('../services/DataStoreService');
const AuditService     = require('../services/AuditService');
const ResponseHelper   = require('../utils/ResponseHelper');
const { TABLES, AUDIT_ACTION, SHARE_TYPE, ACCESS_LEVEL, LINK_TYPE } = require('../utils/Constants');

const APP_URL = (process.env.APP_URL || '').replace(/\/$/, '');

class ShareController {
  constructor(catalystApp) {
    this.db      = new DataStoreService(catalystApp);
    this.audit   = new AuditService(this.db);
  }

  // POST /api/docs/projects/:projectId/shares
  // Body: { shareType: 'DOCUMENT'|'FOLDER', documentId?, folderId?, accessLevel?, expiresAt? }
  async create(req, res) {
    const { projectId } = req.params;
    const { shareType, documentId, folderId, accessLevel, expiresAt, linkType } = req.body;

    if (!shareType || !Object.values(SHARE_TYPE).includes(shareType)) {
      return ResponseHelper.validationError(res, `shareType must be one of: ${Object.values(SHARE_TYPE).join(', ')}`);
    }
    if (shareType === SHARE_TYPE.DOCUMENT && !documentId) {
      return ResponseHelper.validationError(res, 'documentId is required when shareType is DOCUMENT');
    }
    if (shareType === SHARE_TYPE.FOLDER && !folderId) {
      return ResponseHelper.validationError(res, 'folderId is required when shareType is FOLDER');
    }

    // Verify the target exists and belongs to this project
    if (shareType === SHARE_TYPE.DOCUMENT) {
      const doc = await this.db.findById(TABLES.PROJECT_DOCUMENTS, documentId, req.tenantId);
      if (!doc || doc.is_deleted === 'true' || doc.project_id !== String(projectId)) {
        return ResponseHelper.notFound(res, 'Document not found');
      }
    } else {
      const folder = await this.db.findById(TABLES.PROJECT_DOC_FOLDERS, folderId, req.tenantId);
      if (!folder || folder.is_deleted === 'true' || folder.project_id !== String(projectId)) {
        return ResponseHelper.notFound(res, 'Folder not found');
      }
    }

    const resolvedAccessLevel = accessLevel && Object.values(ACCESS_LEVEL).includes(accessLevel)
      ? accessLevel
      : ACCESS_LEVEL.VIEW;

    const resolvedLinkType = linkType === LINK_TYPE.MEMBERS ? LINK_TYPE.MEMBERS : LINK_TYPE.PUBLIC;

    const shareToken = randomUUID();

    const share = await this.db.insert(TABLES.PROJECT_DOC_SHARES, {
      tenant_id:     req.tenantId,
      project_id:    String(projectId),
      share_type:    shareType,
      document_id:   documentId ? String(documentId) : '',
      folder_id:     folderId   ? String(folderId)   : '',
      share_token:   shareToken,
      access_level:  resolvedAccessLevel,
      link_type:     resolvedLinkType,
      expires_at:    expiresAt || '',
      password_hash: '',
      is_active:     'true',
      view_count:    '0',
      created_by:    req.currentUser.id,
    });

    const shareUrl = `${APP_URL}/app/#/share/${shareToken}`;

    await this.audit.log({
      tenantId:    req.tenantId,
      entityType:  'project_doc_share',
      entityId:    share.ROWID,
      action:      AUDIT_ACTION.CREATE,
      newValue:    { shareType, shareToken, accessLevel: resolvedAccessLevel, expiresAt: expiresAt || null },
      performedBy: req.currentUser.id,
    });

    return ResponseHelper.created(res, { ...share, shareUrl });
  }

  // GET /api/docs/projects/:projectId/shares
  async list(req, res) {
    const { projectId } = req.params;

    const shares = await this.db.findWhere(
      TABLES.PROJECT_DOC_SHARES, req.tenantId,
      `project_id = '${DataStoreService.escape(projectId)}' AND is_active = 'true'`,
      { orderBy: 'CREATEDTIME DESC', limit: 100 }
    );

    // Enrich with document/folder names
    const docIds    = [...new Set(shares.filter((s) => s.share_type === 'DOCUMENT' && s.document_id).map((s) => s.document_id))];
    const folderIds = [...new Set(shares.filter((s) => s.share_type === 'FOLDER'   && s.folder_id).map((s) => s.folder_id))];

    const [docs, folders] = await Promise.all([
      docIds.length    ? this.db.query(`SELECT ROWID, name, file_name FROM ${TABLES.PROJECT_DOCUMENTS} WHERE ROWID IN (${docIds.map((id) => `'${DataStoreService.escape(id)}'`).join(',')}) LIMIT 100`) : [],
      folderIds.length ? this.db.query(`SELECT ROWID, name FROM ${TABLES.PROJECT_DOC_FOLDERS} WHERE ROWID IN (${folderIds.map((id) => `'${DataStoreService.escape(id)}'`).join(',')}) LIMIT 100`) : [],
    ]);

    const docMap    = Object.fromEntries(docs.map((d)    => [String(d.ROWID), d.name || d.file_name]));
    const folderMap = Object.fromEntries(folders.map((f) => [String(f.ROWID), f.name]));

    const sharesWithUrl = shares.map((s) => ({
      ...s,
      shareUrl:   `${APP_URL}/app/#/share/${s.share_token}`,
      targetName: s.share_type === 'DOCUMENT'
        ? (docMap[String(s.document_id)]    || 'Document')
        : (folderMap[String(s.folder_id)]   || 'Folder'),
    }));

    return ResponseHelper.success(res, sharesWithUrl);
  }

  // DELETE /api/docs/shares/:shareToken  — revoke a share link
  async revoke(req, res) {
    const { shareToken } = req.params;

    const rows = await this.db.findWhere(
      TABLES.PROJECT_DOC_SHARES, req.tenantId,
      `share_token = '${DataStoreService.escape(shareToken)}' AND is_active = 'true'`,
      { limit: 1 }
    );

    if (rows.length === 0) {
      return ResponseHelper.notFound(res, 'Active share link not found');
    }

    const share = rows[0];

    // Only creator or DOC_ADMIN can revoke
    const user    = req.currentUser;
    const isAdmin = user.role === 'TENANT_ADMIN' || user.role === 'SUPER_ADMIN' ||
      (Array.isArray(user.permissions) && user.permissions.includes('DOC_ADMIN'));
    if (share.created_by !== user.id && !isAdmin) {
      return ResponseHelper.forbidden(res, 'You can only revoke share links you created');
    }

    await this.db.update(TABLES.PROJECT_DOC_SHARES, { ROWID: share.ROWID, is_active: 'false' });

    await this.audit.log({
      tenantId:    req.tenantId,
      entityType:  'project_doc_share',
      entityId:    share.ROWID,
      action:      AUDIT_ACTION.DELETE,
      oldValue:    { shareToken, shareType: share.share_type },
      performedBy: req.currentUser.id,
    });

    return ResponseHelper.success(res, { message: 'Share link revoked' });
  }

  // GET /api/docs/public/:shareToken — NO AUTH required
  // Publicly accessible by anyone with the token.
  async publicAccess(req, res) {
    const { shareToken } = req.params;

    if (!this.db) {
      return ResponseHelper.serverError(res, 'Service unavailable');
    }

    // shareToken is a UUID so it's safe to embed directly; still escape for defence-in-depth
    const rows = await this.db.query(
      `SELECT * FROM ${TABLES.PROJECT_DOC_SHARES} WHERE share_token = '${DataStoreService.escape(shareToken)}' LIMIT 1`
    );

    if (rows.length === 0) {
      return ResponseHelper.notFound(res, 'Share link not found');
    }

    const share = rows[0];

    if (share.is_active !== 'true') {
      return ResponseHelper.notFound(res, 'This share link has been revoked');
    }

    // Check expiry
    if (share.expires_at) {
      const expiry = new Date(share.expires_at);
      if (!isNaN(expiry.getTime()) && expiry < new Date()) {
        return ResponseHelper.forbidden(res, 'This share link has expired');
      }
    }

    // MEMBERS-only link: require a valid Catalyst user session
    const linkType = share.link_type || LINK_TYPE.PUBLIC;
    if (linkType === LINK_TYPE.MEMBERS) {
      const userApp = req.catalystApp;
      if (!userApp) {
        return res.status(401).json({ success: false, code: 'MEMBERS_ONLY', message: 'This link is for app members only. Please log in.' });
      }
      try {
        const catalystUser = await userApp.userManagement().getCurrentUser();
        if (!catalystUser) throw new Error('no user');
      } catch {
        return res.status(401).json({ success: false, code: 'MEMBERS_ONLY', message: 'Please log in to access this link.' });
      }
    }

    // Increment view count (fire-and-forget)
    const newCount = String(parseInt(share.view_count || '0', 10) + 1);
    this.db.update(TABLES.PROJECT_DOC_SHARES, { ROWID: share.ROWID, view_count: newCount }).catch(() => {});

    if (share.share_type === SHARE_TYPE.DOCUMENT) {
      const docs = await this.db.query(
        `SELECT * FROM ${TABLES.PROJECT_DOCUMENTS} WHERE ROWID = '${DataStoreService.escape(share.document_id)}' AND is_deleted = 'false' LIMIT 1`
      );
      if (docs.length === 0) {
        return ResponseHelper.notFound(res, 'Document no longer exists');
      }
      return ResponseHelper.success(res, {
        type:        SHARE_TYPE.DOCUMENT,
        accessLevel: share.access_level,
        linkType,
        document:    docs[0],
      });
    }

    // FOLDER share — return folder metadata + all documents inside
    const folders = await this.db.query(
      `SELECT * FROM ${TABLES.PROJECT_DOC_FOLDERS} WHERE ROWID = '${DataStoreService.escape(share.folder_id)}' AND is_deleted = 'false' LIMIT 1`
    );
    if (folders.length === 0) {
      return ResponseHelper.notFound(res, 'Folder no longer exists');
    }
    const documents = await this.db.query(
      `SELECT * FROM ${TABLES.PROJECT_DOCUMENTS} WHERE folder_id = '${DataStoreService.escape(share.folder_id)}' AND is_deleted = 'false' ORDER BY CREATEDTIME DESC LIMIT 200`
    );

    return ResponseHelper.success(res, {
      type:        SHARE_TYPE.FOLDER,
      accessLevel: share.access_level,
      linkType,
      folder:      folders[0],
      documents,
    });
  }
}

module.exports = ShareController;
