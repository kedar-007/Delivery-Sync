'use strict';
const fs                 = require('fs');
const DataStoreService   = require('../services/DataStoreService');
const AuditService       = require('../services/AuditService');
const ResponseHelper     = require('../utils/ResponseHelper');
const { TABLES, PERMISSIONS, AUDIT_ACTION } = require('../utils/Constants');

// ── QR token helpers ─────────────────────────────────────────────────────────
// The QR encodes `dsync://asset-scan/<token>` so generic readers don't try to
// open it as a web URL and clients can recognise/reject foreign QRs. We accept
// both the wrapped form and a bare token so that admins pasting the raw token
// into a debug page also works.
const TOKEN_RE   = /^[A-Za-z0-9_-]{20,64}$/;
const URI_PREFIX = 'dsync://asset-scan/';

function extractToken(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const candidate = trimmed.startsWith(URI_PREFIX)
    ? trimmed.slice(URI_PREFIX.length)
    : trimmed;
  return TOKEN_RE.test(candidate) ? candidate : null;
}

class AssetScanController {
  constructor(catalystApp) {
    this.catalystApp = catalystApp;
    this.db    = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
  }

  // System admins always have every permission. This mirrors the bypass in
  // RBACMiddleware.require/requireAny and prevents a stale `user.permissions`
  // cache (computed before ASSET_SCAN_FULL existed in Constants) from
  // downgrading a TENANT_ADMIN's scan response to the BASIC tier.
  _hasPerm(user, perm) {
    if (user.role === 'TENANT_ADMIN' || user.role === 'SUPER_ADMIN') return true;
    return Array.isArray(user.permissions) && user.permissions.includes(perm);
  }

  // ── GET /scan/:token ─────────────────────────────────────────────────────────
  // Route-level RBAC already requires one of ASSET_READ / ASSET_SCAN_BASIC /
  // ASSET_SCAN_FULL. Tier inside the response is decided by ASSET_SCAN_FULL:
  //   • ASSET_SCAN_FULL → full record + device credentials + history
  //   • anyone else     → BASIC owner-lookup payload (asset name/tag + owner)
  async scanByToken(req, res) {
    const me = req.currentUser;
    const token = extractToken(req.params.token);
    if (!token) return ResponseHelper.validationError(res, 'Invalid QR token');

    // Tier resolution:
    //   • ASSET_SCAN_FULL → full asset record, credentials, history.
    //   • anyone else who passed the route gate (ASSET_READ / ASSET_SCAN_BASIC)
    //     → BASIC owner-lookup payload.
    // The route-level RBAC has already verified the caller is authorised to
    // scan; no second permission check is needed here.
    const hasFull = this._hasPerm(me, PERMISSIONS.ASSET_SCAN_FULL);

    // Look up the active assignment for this token, tenant-scoped.
    const tokenSql = DataStoreService.escape(token);
    const tenantSql = DataStoreService.escape(String(req.tenantId));
    const assignments = await this.db.query(
      `SELECT * FROM ${TABLES.ASSET_ASSIGNMENTS} ` +
      `WHERE qr_token = '${tokenSql}' AND tenant_id = '${tenantSql}' AND is_active = 'true' LIMIT 1`,
    );
    if (!assignments.length) {
      return ResponseHelper.notFound(res, 'This QR code is no longer valid (asset may have been returned)');
    }
    const assignment = assignments[0];

    const asset = await this.db.findById(TABLES.ASSETS, assignment.asset_id, req.tenantId);
    if (!asset) return ResponseHelper.notFound(res, 'Asset not found');

    const [ownerRows, categoryRows, assignerRows] = await Promise.all([
      this.db.query(`SELECT ROWID, name, email, avatar_url FROM ${TABLES.USERS} WHERE ROWID = '${assignment.user_id}' LIMIT 1`),
      asset.category_id
        ? this.db.query(`SELECT ROWID, name FROM ${TABLES.ASSET_CATEGORIES} WHERE ROWID = '${asset.category_id}' LIMIT 1`)
        : Promise.resolve([]),
      hasFull && assignment.assigned_by
        ? this.db.query(`SELECT ROWID, name, email FROM ${TABLES.USERS} WHERE ROWID = '${assignment.assigned_by}' LIMIT 1`)
        : Promise.resolve([]),
    ]);
    const owner    = ownerRows[0]    || {};
    const category = categoryRows[0] || {};
    const assigner = assignerRows[0] || {};

    // BASIC tier — minimum viable "whose asset is this"
    const basicPayload = {
      tier: 'BASIC',
      asset: {
        name:     asset.name      ?? null,
        asset_tag: asset.asset_tag ?? null,
        category: category.name   ?? null,
      },
      owner: {
        name:  owner.name      ?? null,
        email: owner.email     ?? null,
        avatar_url: owner.avatar_url ?? null,
      },
    };

    await this.audit.log({
      tenantId: req.tenantId, entityType: 'ASSET', entityId: String(asset.ROWID),
      action: AUDIT_ACTION.STATUS_CHANGE,
      newValue: { scanned: true, tier: hasFull ? 'FULL' : 'BASIC' },
      performedBy: req.currentUser.id,
    }).catch(() => { /* audit best-effort, never block the scan */ });

    if (!hasFull) return ResponseHelper.success(res, basicPayload);

    // FULL tier — full asset record, current assignment with device credentials,
    // and the full assignment history for this asset.
    const [requestRows, historyRows, maintenanceRows] = await Promise.all([
      assignment.request_id
        ? this.db.query(`SELECT * FROM ${TABLES.ASSET_REQUESTS} WHERE ROWID = '${assignment.request_id}' LIMIT 1`)
        : Promise.resolve([]),
      this.db.query(
        `SELECT * FROM ${TABLES.ASSET_ASSIGNMENTS} ` +
        `WHERE asset_id = '${asset.ROWID}' AND tenant_id = '${tenantSql}' ` +
        `ORDER BY assigned_date DESC LIMIT 50`,
      ),
      this.db.query(
        `SELECT * FROM ${TABLES.ASSET_MAINTENANCE} ` +
        `WHERE asset_id = '${asset.ROWID}' AND tenant_id = '${tenantSql}' ` +
        `ORDER BY CREATEDTIME DESC LIMIT 50`,
      ).catch(() => []),
    ]);
    const reqRow = requestRows[0] || {};

    // Enrich history with user names in one batch query.
    const historyUserIds = [...new Set(
      historyRows.flatMap((h) => [h.user_id, h.assigned_by].filter(Boolean)),
    )];
    const historyUsers = historyUserIds.length
      ? await this.db.query(
        `SELECT ROWID, name, email FROM ${TABLES.USERS} WHERE ROWID IN (${historyUserIds.map((id) => `'${id}'`).join(',')}) LIMIT 200`,
      )
      : [];
    const historyUserMap = Object.fromEntries(historyUsers.map((u) => [String(u.ROWID), u]));

    return ResponseHelper.success(res, {
      tier: 'FULL',
      asset: {
        ...asset,
        category_name: category.name ?? null,
      },
      owner: {
        id:    String(owner.ROWID || assignment.user_id),
        name:  owner.name      ?? null,
        email: owner.email     ?? null,
        avatar_url: owner.avatar_url ?? null,
      },
      current_assignment: {
        id:                       String(assignment.ROWID),
        assigned_date:            assignment.assigned_date,
        condition_at_assignment:  assignment.condition_at_assignment,
        assigned_by_id:           assignment.assigned_by ? String(assignment.assigned_by) : null,
        assigned_by_name:         assigner.name  ?? null,
        assigned_by_email:        assigner.email ?? null,
        device_id:                reqRow.device_id       ?? null,
        device_username:          reqRow.device_username ?? null,
        device_password:          reqRow.device_password ?? null,
        handover_notes:           reqRow.handover_notes  ?? null,
        handover_at:              reqRow.handover_at     ?? null,
        request_id:               assignment.request_id ? String(assignment.request_id) : null,
      },
      history: historyRows.map((h) => {
        const user     = historyUserMap[String(h.user_id)]     || {};
        const assigner2 = historyUserMap[String(h.assigned_by)] || {};
        return {
          id:                String(h.ROWID),
          assigned_date:     h.assigned_date,
          returned_date:     h.returned_date     ?? null,
          condition_at_assignment: h.condition_at_assignment ?? null,
          condition_at_return:     h.condition_at_return     ?? null,
          return_notes:      h.return_notes ?? null,
          is_active:         h.is_active === 'true',
          user_name:         user.name      ?? null,
          user_email:        user.email     ?? null,
          assigned_by_name:  assigner2.name ?? null,
          assigned_by_email: assigner2.email ?? null,
        };
      }),
      maintenance: maintenanceRows.map((m) => ({
        id:           String(m.ROWID),
        type:         m.maintenance_type ?? null,
        description:  m.description       ?? null,
        cost:         m.cost              ?? null,
        performed_at: m.performed_at      ?? null,
        status:       m.status            ?? null,
      })),
    });
  }

  // ── POST /scan/decode ────────────────────────────────────────────────────────
  // Zia fallback: caller uploads an image with a QR code, Zia decodes it, then
  // we resolve via scanByToken. Used when the native camera scanner fails (poor
  // lighting, damaged sticker) or on platforms without a built-in scanner.
  async decodeAndScan(req, res) {
    if (!req.files || !req.files.image) {
      return ResponseHelper.validationError(res, 'image file is required (multipart field name: "image")');
    }
    const upload = req.files.image;
    if (!/^image\/(jpe?g|png)$/i.test(upload.mimetype || '')) {
      return ResponseHelper.validationError(res, 'Only JPEG and PNG images are supported');
    }
    if (upload.size > 10 * 1024 * 1024) {
      return ResponseHelper.validationError(res, 'Image must be smaller than 10 MB');
    }

    // Zia infers the image format from the upload's filename extension.
    // express-fileupload writes temp files with no extension (e.g. `tmp-1-…`),
    // so we copy to a path that carries the right extension before streaming.
    // Without this, Zia rejects the upload with UNSUPPORTED_FORMAT_ERROR even
    // for valid PNG/JPEG content.
    const ext = /png/i.test(upload.mimetype) ? '.png' : '.jpg';
    const ziaPath = `${upload.tempFilePath}${ext}`;
    let decoded;
    try {
      await fs.promises.copyFile(upload.tempFilePath, ziaPath);
      const stream = fs.createReadStream(ziaPath);
      // `format: 'all'` is the documented auto-detect value (mirrors Java's
      // ZCBarcodeFormat.ALL). Omitting the option entirely lets the SDK's
      // default `{format: undefined}` serialize the literal string "undefined"
      // into the multipart, which Zia rejects with UNSUPPORTED_FORMAT_ERROR.
      decoded = await this.catalystApp.zia().scanBarcode(stream, { format: 'all' });
    } catch (err) {
      console.error('[AssetScanController.decodeAndScan] Zia error:', err.message);
      return ResponseHelper.validationError(res, 'Could not decode QR code from image');
    } finally {
      fs.unlink(upload.tempFilePath, () => {});
      fs.unlink(ziaPath,                () => {});
    }

    // Zia returns an array-like content payload — be defensive about shape.
    const content = decoded?.content
      ?? decoded?.data
      ?? (Array.isArray(decoded) ? decoded[0] : null);
    const rawText = typeof content === 'string'
      ? content
      : (content?.text ?? content?.value ?? null);
    const token = extractToken(rawText);
    if (!token) {
      return ResponseHelper.validationError(res, 'No valid asset QR code found in image');
    }

    // Delegate to the same resolver — keeps the response shape identical.
    req.params.token = token;
    return this.scanByToken(req, res);
  }
}

module.exports = AssetScanController;
