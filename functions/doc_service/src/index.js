'use strict';

const express        = require('express');
const asyncHandler   = require('express-async-handler');
const router         = express.Router();

const AuthMiddleware    = require('./middleware/AuthMiddleware');
const RBACMiddleware    = require('./middleware/RBACMiddleware');
const folderRoutes      = require('./routes/folderRoutes');
const documentRoutes    = require('./routes/documentRoutes');
const shareRoutes       = require('./routes/shareRoutes');
const ShareController   = require('./controllers/ShareController');
const DataStoreService  = require('./services/DataStoreService');
const ResponseHelper    = require('./utils/ResponseHelper');
const { PERMISSIONS, TABLES } = require('./utils/Constants');

// Helper — always prefer system app for DataStore access
const sysApp = (req) => req.catalystSystemApp || req.catalystApp;

// Collect a readable stream into a Buffer
const streamToBuffer = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on('end',  () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });

// Convert whatever getObject returns into a UTF-8 string
const objectToText = async (obj) => {
  if (Buffer.isBuffer(obj))                  return obj.toString('utf8');
  if (typeof obj === 'string')                return obj;
  if (obj && typeof obj.pipe === 'function') return (await streamToBuffer(obj)).toString('utf8');
  if (obj && typeof obj.read === 'function') return (await streamToBuffer(obj)).toString('utf8');
  return '';
};

// Escape a single CSV cell value
const csvCell = (v) => {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
};

// Validate share token for EDIT-access mutation endpoints.
// Returns { share, doc } on success or { error, status } on failure.
const validateEditShare = async (db, shareToken, documentId) => {
  const shares = await db.query(
    `SELECT * FROM ${TABLES.PROJECT_DOC_SHARES} WHERE share_token = '${DataStoreService.escape(shareToken)}' LIMIT 1`
  );
  if (!shares.length || shares[0].is_active !== 'true')
    return { error: 'Invalid or revoked share link', status: 403 };
  const share = shares[0];
  if (share.access_level !== 'EDIT')
    return { error: 'This share link does not allow editing', status: 403 };
  if (share.expires_at) {
    const expiry = new Date(share.expires_at);
    if (!isNaN(expiry.getTime()) && expiry < new Date())
      return { error: 'Share link has expired', status: 403 };
  }
  const docs = await db.query(
    `SELECT * FROM ${TABLES.PROJECT_DOCUMENTS} WHERE ROWID = '${DataStoreService.escape(documentId)}' AND is_deleted = 'false' LIMIT 1`
  );
  if (!docs.length) return { error: 'Document not found', status: 404 };
  const doc = docs[0];
  if (share.share_type === 'DOCUMENT' && String(doc.ROWID) !== String(share.document_id))
    return { error: 'Document mismatch', status: 403 };
  if (share.share_type === 'FOLDER' && String(doc.folder_id) !== String(share.folder_id))
    return { error: 'Document not in shared folder', status: 403 };
  return { share, doc };
};

router.get('/health', (_req, res) =>
  res.json({ success: true, service: 'doc_service', ts: Date.now() })
);

// ── Public routes — no auth required ─────────────────────────────────────────
router.get('/public/:shareToken', asyncHandler((req, res) => {
  const app = sysApp(req);
  if (!app) return res.status(503).json({ success: false, message: 'Service unavailable' });
  return new ShareController(app).publicAccess(req, res);
}));

// GET /public/:shareToken/file/:documentId
// Validates the share token then proxies the file bytes from Stratus so the
// public page can display or download the file without needing a Zoho session.
router.get('/public/:shareToken/file/:documentId', asyncHandler(async (req, res) => {
  const app = sysApp(req);
  if (!app) return res.status(503).json({ success: false, message: 'Service unavailable' });

  const { shareToken, documentId } = req.params;
  const db = new DataStoreService(app);

  // Validate share
  const shares = await db.query(
    `SELECT * FROM ${TABLES.PROJECT_DOC_SHARES} WHERE share_token = '${DataStoreService.escape(shareToken)}' LIMIT 1`
  );
  if (!shares.length || shares[0].is_active !== 'true') {
    return res.status(403).json({ success: false, message: 'Invalid or revoked share link' });
  }
  const share = shares[0];

  // Check expiry
  if (share.expires_at) {
    const expiry = new Date(share.expires_at);
    if (!isNaN(expiry.getTime()) && expiry < new Date()) {
      return res.status(403).json({ success: false, message: 'Share link has expired' });
    }
  }

  // Fetch the document
  const docs = await db.query(
    `SELECT * FROM ${TABLES.PROJECT_DOCUMENTS} WHERE ROWID = '${DataStoreService.escape(documentId)}' AND is_deleted = 'false' LIMIT 1`
  );
  if (!docs.length) return res.status(404).json({ success: false, message: 'Document not found' });
  const doc = docs[0];

  // For folder shares verify the document belongs to that folder
  if (share.share_type === 'FOLDER' && String(doc.folder_id) !== String(share.folder_id)) {
    return res.status(403).json({ success: false, message: 'Document not in shared folder' });
  }

  // For document shares verify it matches
  if (share.share_type === 'DOCUMENT' && String(doc.ROWID) !== String(share.document_id)) {
    return res.status(403).json({ success: false, message: 'Document mismatch' });
  }

  // Stream from Stratus
  const BUCKET_NAME = process.env.STRATUS_DOCS_BUCKET || 'project-docs';
  const bucket      = app.stratus().bucket(BUCKET_NAME);
  const key         = doc.file_name; // stored as the unique filename
  const fileData    = await bucket.getObject(key);

  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${disposition}; filename="${doc.file_name}"`);
  res.setHeader('Cache-Control', 'private, max-age=300');

  if (Buffer.isBuffer(fileData)) return res.end(fileData);
  if (fileData && typeof fileData.pipe === 'function') return fileData.pipe(res);
  return res.end(fileData);
}));

// POST /public/:shareToken/file/:documentId/append-rows
router.post('/public/:shareToken/file/:documentId/append-rows', asyncHandler(async (req, res) => {
  const app = sysApp(req);
  if (!app) return res.status(503).json({ success: false, message: 'Service unavailable' });

  const { shareToken, documentId } = req.params;
  const { rows } = req.body;

  if (!Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ success: false, message: 'rows must be a non-empty array' });

  const db  = new DataStoreService(app);
  const chk = await validateEditShare(db, shareToken, documentId);
  if (chk.error) return res.status(chk.status).json({ success: false, message: chk.error });

  const bucket = app.stratus().bucket(process.env.STRATUS_DOCS_BUCKET || 'project-docs');
  const existingText = await objectToText(await bucket.getObject(chk.doc.file_name));

  const newLines = rows.map((row) => (Array.isArray(row) ? row : Object.values(row)).map(csvCell).join(',')).join('\n');
  const updated  = existingText.trimEnd() + '\n' + newLines + '\n';
  const buffer   = Buffer.from(updated, 'utf8');

  await bucket.putObject(chk.doc.file_name, buffer, { contentType: 'text/csv' });
  await db.update(TABLES.PROJECT_DOCUMENTS, {
    ROWID: chk.doc.ROWID,
    file_size_kb: String(Math.round((buffer.length / 1024) * 100) / 100),
  });

  return res.json({ success: true, message: `${rows.length} row(s) appended`, rowsAdded: rows.length });
}));

// PATCH /public/:shareToken/file/:documentId/update-row
// Body: { rowIndex: number (0-based data row, not counting header), values: string[] }
router.patch('/public/:shareToken/file/:documentId/update-row', asyncHandler(async (req, res) => {
  const app = sysApp(req);
  if (!app) return res.status(503).json({ success: false, message: 'Service unavailable' });

  const { shareToken, documentId } = req.params;
  const { rowIndex, values } = req.body;

  if (typeof rowIndex !== 'number' || rowIndex < 0)
    return res.status(400).json({ success: false, message: 'rowIndex must be a non-negative number' });
  if (!Array.isArray(values))
    return res.status(400).json({ success: false, message: 'values must be an array' });

  const db  = new DataStoreService(app);
  const chk = await validateEditShare(db, shareToken, documentId);
  if (chk.error) return res.status(chk.status).json({ success: false, message: chk.error });

  const bucket = app.stratus().bucket(process.env.STRATUS_DOCS_BUCKET || 'project-docs');
  const existingText = await objectToText(await bucket.getObject(chk.doc.file_name));

  // Split preserving blank trailing lines, then target line = rowIndex + 1 (skip header)
  const lines = existingText.split(/\r?\n/);
  const target = rowIndex + 1;
  if (target >= lines.length || !lines[target].trim())
    return res.status(400).json({ success: false, message: `Row ${rowIndex} not found` });

  lines[target] = values.map(csvCell).join(',');
  const updated = lines.join('\n');
  const buffer  = Buffer.from(updated.endsWith('\n') ? updated : updated + '\n', 'utf8');

  await bucket.putObject(chk.doc.file_name, buffer, { contentType: 'text/csv' });
  await db.update(TABLES.PROJECT_DOCUMENTS, {
    ROWID: chk.doc.ROWID,
    file_size_kb: String(Math.round((buffer.length / 1024) * 100) / 100),
  });

  return res.json({ success: true, message: 'Row updated' });
}));

// DELETE /public/:shareToken/file/:documentId/delete-row?rowIndex=0
router.delete('/public/:shareToken/file/:documentId/delete-row', asyncHandler(async (req, res) => {
  const app = sysApp(req);
  if (!app) return res.status(503).json({ success: false, message: 'Service unavailable' });

  const { shareToken, documentId } = req.params;
  const rowIndex = parseInt(req.query.rowIndex, 10);

  if (isNaN(rowIndex) || rowIndex < 0)
    return res.status(400).json({ success: false, message: 'rowIndex query param must be a non-negative integer' });

  const db  = new DataStoreService(app);
  const chk = await validateEditShare(db, shareToken, documentId);
  if (chk.error) return res.status(chk.status).json({ success: false, message: chk.error });

  const bucket = app.stratus().bucket(process.env.STRATUS_DOCS_BUCKET || 'project-docs');
  const existingText = await objectToText(await bucket.getObject(chk.doc.file_name));

  const lines  = existingText.split(/\r?\n/);
  const target = rowIndex + 1;
  if (target >= lines.length || !lines[target].trim())
    return res.status(400).json({ success: false, message: `Row ${rowIndex} not found` });

  lines.splice(target, 1);
  const updated = lines.join('\n');
  const buffer  = Buffer.from(updated.endsWith('\n') ? updated : updated + '\n', 'utf8');

  await bucket.putObject(chk.doc.file_name, buffer, { contentType: 'text/csv' });
  await db.update(TABLES.PROJECT_DOCUMENTS, {
    ROWID: chk.doc.ROWID,
    file_size_kb: String(Math.round((buffer.length / 1024) * 100) / 100),
  });

  return res.json({ success: true, message: 'Row deleted' });
}));

// ── All routes below require a valid user session ─────────────────────────────
router.use(AuthMiddleware.authenticate);

router.use('/projects/:projectId/folders',   folderRoutes);
router.use('/projects/:projectId/documents', documentRoutes);
router.use('/projects/:projectId/shares',    shareRoutes);

// GET /api/docs/projects/:projectId/members
// Returns all project members with their name/email — used for folder access control.
// Note: project_members table has no status column; filter is on project_id only.
router.get(
  '/projects/:projectId/members',
  RBACMiddleware.requireProjectMember(),
  RBACMiddleware.require(PERMISSIONS.DOC_READ),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const db = new DataStoreService(sysApp(req));

    const members = await db.findWhere(
      TABLES.PROJECT_MEMBERS, req.tenantId,
      `project_id = '${DataStoreService.escape(projectId)}'`,
      { limit: 200 }
    );

    if (members.length === 0) return ResponseHelper.success(res, []);

    const userIdList = [...new Set(members.map((m) => m.user_id).filter(Boolean))]
      .map((id) => `'${DataStoreService.escape(id)}'`).join(',');

    const users = await db.query(
      `SELECT ROWID, name, email, role FROM ${TABLES.USERS} WHERE ROWID IN (${userIdList}) LIMIT 200`
    );

    const usersMap = {};
    users.forEach((u) => { usersMap[String(u.ROWID)] = u; });

    const result = members.map((m) => ({
      userId:    String(m.user_id),
      projectId: String(m.project_id),
      role:      m.role,
      name:      usersMap[String(m.user_id)]?.name  || 'Unknown',
      email:     usersMap[String(m.user_id)]?.email || '',
    })).filter((m) => m.name !== 'Unknown' || m.email);

    return ResponseHelper.success(res, result);
  })
);

// GET /api/docs/tenant-users
// Returns all users in the tenant (ACTIVE + INVITED) for folder access control.
// Callers merge this with project members to show org-wide user picker.
router.get(
  '/tenant-users',
  RBACMiddleware.require(PERMISSIONS.DOC_READ),
  asyncHandler(async (req, res) => {
    const db = new DataStoreService(sysApp(req));
    const users = await db.findWhere(
      TABLES.USERS, req.tenantId,
      `status IN ('ACTIVE', 'INVITED')`,
      { orderBy: 'name ASC', limit: 300 }
    );
    const result = users.map((u) => ({
      userId: String(u.ROWID),
      name:   u.name  || 'Unknown',
      email:  u.email || '',
      role:   u.role  || '',
    }));
    return ResponseHelper.success(res, result);
  })
);

router.delete(
  '/shares/:shareToken',
  RBACMiddleware.require(PERMISSIONS.DOC_SHARE),
  asyncHandler((req, res) => new ShareController(sysApp(req)).revoke(req, res))
);

module.exports = router;
