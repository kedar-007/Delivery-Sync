'use strict';
const DataStoreService    = require('../services/DataStoreService');
const AuditService        = require('../services/AuditService');
const ResponseHelper      = require('../utils/ResponseHelper');
const { TABLES, ASSET_STATUS, AUDIT_ACTION } = require('../utils/Constants');

class AssetController {
  constructor(catalystApp) {
    this.db    = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
  }

  // GET /api/assets/categories
  async listCategories(req, res) {
    const cats = await this.db.findWhere(TABLES.ASSET_CATEGORIES, req.tenantId, '', { orderBy: 'name ASC', limit: 100 });
    return ResponseHelper.success(res, cats);
  }

  async createCategory(req, res) {
    const { name, description, depreciation_years } = req.body;
    if (!name) return ResponseHelper.validationError(res, 'name required');
    const row = await this.db.insert(TABLES.ASSET_CATEGORIES, {
      tenant_id:          String(req.tenantId),
      name,
      description:        description || '',
      depreciation_years: String(depreciation_years || 3),
      created_by:         String(req.currentUser.id),
    });
    await this.audit.log({ tenantId: req.tenantId, entityType: 'ASSET_CATEGORY', entityId: row.ROWID, action: AUDIT_ACTION.CREATE, newValue: row, performedBy: req.currentUser.id });
    return ResponseHelper.created(res, row);
  }

  async updateCategory(req, res) {
    const cat = await this.db.findById(TABLES.ASSET_CATEGORIES, req.params.catId, req.tenantId);
    if (!cat) return ResponseHelper.notFound(res, 'Category not found');
    const updates = {};
    ['name', 'description', 'depreciation_years'].forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const updated = await this.db.update(TABLES.ASSET_CATEGORIES, { ROWID: req.params.catId, ...updates });
    return ResponseHelper.success(res, updated);
  }

  // GET /api/assets/inventory
  async listInventory(req, res) {
    const { status, category_id, assigned_to } = req.query;
    let where = '';
    if (status)      where += `status = '${DataStoreService.escape(status)}' AND `;
    if (category_id) where += `category_id = '${DataStoreService.escape(category_id)}' AND `;
    if (assigned_to) where += `assigned_to = '${DataStoreService.escape(assigned_to)}' AND `;
    where = where.replace(/ AND $/, '');
    const assets = await this.db.findWhere(TABLES.ASSETS, req.tenantId, where, { orderBy: 'name ASC', limit: 200 });
    return ResponseHelper.success(res, assets);
  }

  async getAsset(req, res) {
    const asset = await this.db.findById(TABLES.ASSETS, req.params.assetId, req.tenantId);
    if (!asset) return ResponseHelper.notFound(res, 'Asset not found');
    const history = await this.db.findWhere(TABLES.ASSET_ASSIGNMENTS, req.tenantId, `asset_id = '${asset.ROWID}'`, { orderBy: 'CREATEDTIME DESC', limit: 20 });
    return ResponseHelper.success(res, { ...asset, assignment_history: history });
  }

  async createAsset(req, res) {
    const { category_id, name, asset_tag, serial_number, brand, model,
            purchase_date, purchase_value, warranty_expiry, location, notes } = req.body;
    if (!category_id || !name || !asset_tag) return ResponseHelper.validationError(res, 'category_id, name and asset_tag required');
    // Unique asset_tag check
    const existing = await this.db.findWhere(TABLES.ASSETS, req.tenantId, `asset_tag = '${DataStoreService.escape(asset_tag)}'`, { limit: 1 });
    if (existing.length > 0) return ResponseHelper.conflict(res, 'Asset tag already exists');

    // Image upload via Catalyst Stratus (non-fatal)
    let image_url = '';
    if (req.files && req.files.image) {
      try {
        const catalyst = require('zcatalyst-sdk-node');
        const catalystApp = catalyst.initialize(req);
        const fs = require('fs');
        const file = req.files.image;
        const stratus = catalystApp.stratus();
        const bucket = stratus.bucket(process.env.STRATUS_BUCKET_NAME || 'asset-images');
        const key = `assets/${Date.now()}_${file.name}`;
        await bucket.putObject(key, fs.createReadStream(file.tempFilePath || file.path), {
          overwrite: true, contentType: file.mimetype || 'image/jpeg',
        });
        let baseUrl = process.env.STRATUS_BASE_URL || '';
        try { const d = await bucket.getDetails(); if (d.bucket_url) baseUrl = d.bucket_url.replace(/\/$/, ''); } catch (_) {}
        image_url = `${baseUrl}/${key}`;
      } catch (e) { console.error('[AssetController] image upload failed:', e.message); }
    }

    const insertData = {
      tenant_id:       String(req.tenantId),
      category_id:     String(category_id),
      name,
      asset_tag,
      serial_number:   serial_number || '',
      brand:           brand || '',
      model:           model || '',
      purchase_value:  String(purchase_value || 0),
      current_value:   String(purchase_value || 0),
      status:          ASSET_STATUS.AVAILABLE,
      asset_condition: 'GOOD',
      location:        location || '',
      document_url:    image_url,
      notes:           notes || '',
      // assigned_to omitted — new assets are unassigned; '0' violates the FK to users table
      created_by:      String(req.currentUser.id),
    };
    // Only set date fields if provided — Catalyst rejects empty strings for Date columns
    if (purchase_date)   insertData.purchase_date   = purchase_date;
    if (warranty_expiry) insertData.warranty_expiry = warranty_expiry;

    const row = await this.db.insert(TABLES.ASSETS, insertData);
    await this.audit.log({ tenantId: req.tenantId, entityType: 'ASSET', entityId: row.ROWID, action: AUDIT_ACTION.CREATE, newValue: row, performedBy: req.currentUser.id });
    return ResponseHelper.created(res, row);
  }

  async updateAsset(req, res) {
    const asset = await this.db.findById(TABLES.ASSETS, req.params.assetId, req.tenantId);
    if (!asset) return ResponseHelper.notFound(res, 'Asset not found');
    const allowed = ['name', 'serial_number', 'brand', 'model', 'purchase_value', 'current_value', 'warranty_expiry', 'location', 'notes', 'status'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    if (req.body.asset_condition !== undefined) updates.asset_condition = req.body.asset_condition;
    if (req.body.condition !== undefined) updates.asset_condition = req.body.condition;

    // Image upload via Catalyst Stratus (non-fatal)
    if (req.files && req.files.image) {
      try {
        const catalyst = require('zcatalyst-sdk-node');
        const catalystApp = catalyst.initialize(req);
        const fs = require('fs');
        const file = req.files.image;
        const stratus = catalystApp.stratus();
        const bucket = stratus.bucket(process.env.STRATUS_BUCKET_NAME || 'asset-images');
        const key = `assets/${Date.now()}_${file.name}`;
        await bucket.putObject(key, fs.createReadStream(file.tempFilePath || file.path), {
          overwrite: true, contentType: file.mimetype || 'image/jpeg',
        });
        let baseUrl = process.env.STRATUS_BASE_URL || '';
        try { const d = await bucket.getDetails(); if (d.bucket_url) baseUrl = d.bucket_url.replace(/\/$/, ''); } catch (_) {}
        updates.document_url = `${baseUrl}/${key}`;
      } catch (e) { console.error('[AssetController] image upload failed:', e.message); }
    }

    const updated = await this.db.update(TABLES.ASSETS, { ROWID: req.params.assetId, ...updates });
    await this.audit.log({ tenantId: req.tenantId, entityType: 'ASSET', entityId: req.params.assetId, action: AUDIT_ACTION.UPDATE, oldValue: asset, newValue: updated, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, updated);
  }

  async retireAsset(req, res) {
    const asset = await this.db.findById(TABLES.ASSETS, req.params.assetId, req.tenantId);
    if (!asset) return ResponseHelper.notFound(res, 'Asset not found');
    if (asset.status === ASSET_STATUS.ASSIGNED) return ResponseHelper.validationError(res, 'Cannot retire an assigned asset. Return it first.');
    await this.db.update(TABLES.ASSETS, { ROWID: req.params.assetId, status: ASSET_STATUS.RETIRED });
    await this.audit.log({ tenantId: req.tenantId, entityType: 'ASSET', entityId: req.params.assetId, action: AUDIT_ACTION.STATUS_CHANGE, oldValue: { status: asset.status }, newValue: { status: ASSET_STATUS.RETIRED }, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, { message: 'Asset retired' });
  }

  async getAvailable(req, res) {
    const { category_id } = req.query;
    let where = `status = 'AVAILABLE'`;
    if (category_id) where += ` AND category_id = '${DataStoreService.escape(category_id)}'`;
    const assets = await this.db.findWhere(TABLES.ASSETS, req.tenantId, where, { limit: 200 });
    return ResponseHelper.success(res, assets);
  }

  async myAssets(req, res) {
    const assets = await this.db.findWhere(TABLES.ASSETS, req.tenantId, `assigned_to = '${req.currentUser.id}' AND status = 'ASSIGNED'`, { limit: 50 });
    return ResponseHelper.success(res, assets);
  }

  // POST /api/assets/inventory/bulk
  async bulkCreate(req, res) {
    const { assets } = req.body;
    if (!Array.isArray(assets) || assets.length === 0)
      return ResponseHelper.validationError(res, 'assets array is required');
    if (assets.length > 200)
      return ResponseHelper.validationError(res, 'Maximum 200 assets per bulk upload');

    const results = { created: [], failed: [] };
    for (const item of assets) {
      try {
        const { name, category_id, asset_tag, serial_number, brand, model,
                purchase_date, purchase_value, warranty_expiry, location, notes } = item;
        if (!name || !category_id || !asset_tag) {
          results.failed.push({ asset_tag: asset_tag || '?', reason: 'name, category_id and asset_tag are required' });
          continue;
        }
        // Skip duplicate asset tags
        const existing = await this.db.findWhere(TABLES.ASSETS, req.tenantId, `asset_tag = '${DataStoreService.escape(asset_tag)}'`, { limit: 1 });
        if (existing.length > 0) {
          results.failed.push({ asset_tag, reason: 'Asset tag already exists' });
          continue;
        }
        const insertData = {
          tenant_id:       String(req.tenantId),
          category_id:     String(category_id),
          name:            String(name),
          asset_tag:       String(asset_tag),
          serial_number:   serial_number || '',
          brand:           brand || '',
          model:           model || '',
          purchase_value:  String(purchase_value || 0),
          current_value:   String(purchase_value || 0),
          status:          ASSET_STATUS.AVAILABLE,
          asset_condition: 'GOOD',
          location:        location || '',
          document_url:    '',
          notes:           notes || '',
          created_by:      String(req.currentUser.id),
        };
        if (purchase_date)   insertData.purchase_date   = purchase_date;
        if (warranty_expiry) insertData.warranty_expiry = warranty_expiry;

        const row = await this.db.insert(TABLES.ASSETS, insertData);
        results.created.push(row.ROWID);
      } catch (e) {
        results.failed.push({ asset_tag: item.asset_tag || '?', reason: e.message });
      }
    }
    return ResponseHelper.success(res, results);
  }
}

module.exports = AssetController;
