'use strict';
const DataStoreService = require('../services/DataStoreService');
const ResponseHelper   = require('../utils/ResponseHelper');
const { TABLES } = require('../utils/Constants');

class FormController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
  }

  async list(req, res) {
    const forms = await this.db.findWhere(TABLES.FORM_CONFIGS, req.tenantId, '', { orderBy: 'form_type ASC', limit: 50 });
    return ResponseHelper.success(res, forms.map(f => ({ ...f, fields: this._parse(f.fields, []) })));
  }

  async create(req, res) {
    const { form_type, fields, validations } = req.body;
    if (!form_type || !fields) return ResponseHelper.validationError(res, 'form_type and fields required');
    const row = await this.db.insert(TABLES.FORM_CONFIGS, {
      tenant_id: req.tenantId, form_type,
      fields: JSON.stringify(fields), validations: validations ? JSON.stringify(validations) : '{}',
      is_active: 'true', version: 1, created_by: req.currentUser.id,
    });
    return ResponseHelper.created(res, row);
  }

  async update(req, res) {
    const form = await this.db.findById(TABLES.FORM_CONFIGS, req.params.formId, req.tenantId);
    if (!form) return ResponseHelper.notFound(res, 'Form config not found');
    const updates = {};
    if (req.body.fields)      updates.fields      = JSON.stringify(req.body.fields);
    if (req.body.validations) updates.validations = JSON.stringify(req.body.validations);
    if (req.body.is_active !== undefined) updates.is_active = req.body.is_active ? 'true' : 'false';
    updates.version = (parseInt(form.version) || 1) + 1;
    const updated = await this.db.update(TABLES.FORM_CONFIGS, { ROWID: req.params.formId, ...updates });
    return ResponseHelper.success(res, updated);
  }

  async getActive(req, res) {
    const forms = await this.db.findWhere(TABLES.FORM_CONFIGS, req.tenantId, `form_type = '${DataStoreService.escape(req.params.formType)}' AND is_active = 'true'`, { orderBy: 'version DESC', limit: 1 });
    if (forms.length === 0) return ResponseHelper.notFound(res, 'No active form config found');
    return ResponseHelper.success(res, { ...forms[0], fields: this._parse(forms[0].fields, []) });
  }

  _parse(val, fallback) {
    try { return val ? JSON.parse(val) : fallback; } catch { return fallback; }
  }
}

module.exports = FormController;
