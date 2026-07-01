'use strict';

const DataStoreService = require('../services/DataStoreService');
const AuditService     = require('../services/AuditService');
const ResponseHelper   = require('../utils/ResponseHelper');
const { TABLES } = require('../utils/Constants');
const { TRASH_MODULES, BY_KEY, buildName, buildSubLabel } = require('../utils/SoftDeleteRegistry');

/**
 * AdminTrashController – org-wide Recycle Bin across every module.
 *
 * Because all Catalyst functions share one DataStore, this single controller can
 * read/restore/purge soft-deleted rows from any registered module table (see
 * SoftDeleteRegistry). It never hard-codes per-module logic beyond the registry.
 *
 * A row is "in the trash" iff `deleted_at IS NOT NULL`.
 *   restore → deleted_at = null, deleted_by = null
 *   purge   → permanent deleteRow (admin only)
 *
 * Modules whose tables do not yet have the `deleted_at` column simply return no
 * rows (the per-module query is wrapped in try/catch) so the endpoint is safe to
 * ship before every table has been migrated.
 */
class AdminTrashController {
  constructor(catalystApp) {
    this.db    = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
  }

  /**
   * GET /api/admin/trash
   * Query params: module (registry key), deletedBy (user id), from/to (YYYY-MM-DD),
   *               q (name contains), page, pageSize
   * Returns { items, total, page, pageSize, modules } where modules lists the
   * available filter keys + labels.
   */
  async list(req, res) {
    try {
      const tenantId = req.tenantId;
      const { module, deletedBy, from, to, q } = req.query;
      const page     = Math.max(1, parseInt(req.query.page, 10) || 1);
      const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 50));

      const modules = module && BY_KEY[module] ? [BY_KEY[module]] : TRASH_MODULES;

      // Fan out one query per module table. Each is independent; a missing
      // `deleted_at` column (un-migrated table) just yields an empty result.
      const perModule = await Promise.all(modules.map(async (mod) => {
        try {
          const rows = await this.db.findWhere(
            mod.table, tenantId, 'deleted_at IS NOT NULL',
            { orderBy: 'deleted_at DESC', limit: 300 }
          );
          return rows.map((row) => ({
            id: String(row.ROWID),
            module: mod.key,
            moduleLabel: mod.label,
            name: buildName(mod, row),
            subLabel: buildSubLabel(mod, row),
            projectId: mod.projectCol ? (row[mod.projectCol] ? String(row[mod.projectCol]) : null) : null,
            deletedAt: row.deleted_at,
            deletedById: row.deleted_by ? String(row.deleted_by) : null,
          }));
        } catch (err) {
          // Table not migrated yet (no deleted_at column) or transient error —
          // log and skip so the rest of the trash still renders.
          console.warn(`[AdminTrash] skip module="${mod.key}" table="${mod.table}": ${err.message}`);
          return [];
        }
      }));

      let items = perModule.flat();

      // ── In-memory filters (dataset is already tenant-scoped & bounded) ──────────
      if (deletedBy) items = items.filter((i) => i.deletedById === String(deletedBy));
      if (from)      items = items.filter((i) => i.deletedAt && i.deletedAt >= from);
      if (to)        items = items.filter((i) => i.deletedAt && i.deletedAt <= `${to} 23:59:59`);
      if (q) {
        const needle = String(q).toLowerCase();
        items = items.filter((i) => i.name.toLowerCase().includes(needle));
      }

      // Newest deletions first across all modules.
      items.sort((a, b) => String(b.deletedAt || '').localeCompare(String(a.deletedAt || '')));

      const total = items.length;

      // ── Enrich the current page with deleter name/email + project name ──────────
      const start = (page - 1) * pageSize;
      const pageItems = items.slice(start, start + pageSize);
      await this._enrich(tenantId, pageItems);

      return ResponseHelper.success(res, {
        items: pageItems,
        total,
        page,
        pageSize,
        modules: TRASH_MODULES.map((m) => ({ key: m.key, label: m.label })),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /** POST /api/admin/trash/:module/:id/restore */
  async restore(req, res) {
    const mod = BY_KEY[req.params.module];
    if (!mod) return ResponseHelper.validationError(res, `Unknown module: ${req.params.module}`);
    const { id } = req.params;

    const row = await this.db.findById(mod.table, id, req.tenantId);
    if (!row) return ResponseHelper.notFound(res, `${mod.label} not found`);
    if (!row.deleted_at) return ResponseHelper.validationError(res, `${mod.label} is not in the trash`);

    await this.db.update(mod.table, { ROWID: id, deleted_at: null, deleted_by: null });
    await this.audit.log({
      tenantId: req.tenantId, entityType: mod.key.toUpperCase(), entityId: id,
      action: 'UPDATE', newValue: { restored: true }, performedBy: req.currentUser.id,
    });
    return ResponseHelper.success(res, { message: `${mod.label} restored` });
  }

  /** DELETE /api/admin/trash/:module/:id — permanent purge (admin only). */
  async purge(req, res) {
    const mod = BY_KEY[req.params.module];
    if (!mod) return ResponseHelper.validationError(res, `Unknown module: ${req.params.module}`);
    const { id } = req.params;

    const row = await this.db.findById(mod.table, id, req.tenantId);
    if (!row) return ResponseHelper.notFound(res, `${mod.label} not found`);
    // Only purge things already in the trash — never a live record.
    if (!row.deleted_at) return ResponseHelper.validationError(res, `${mod.label} must be trashed before it can be permanently deleted`);

    await this.db.delete(mod.table, id);
    await this.audit.log({
      tenantId: req.tenantId, entityType: mod.key.toUpperCase(), entityId: id,
      action: 'DELETE', oldValue: { name: buildName(mod, row) }, newValue: { permanent: true }, performedBy: req.currentUser.id,
    });
    return ResponseHelper.success(res, { message: `${mod.label} permanently deleted` });
  }

  // ── helpers ────────────────────────────────────────────────────────────────
  /** Attach deletedByName / deletedByEmail / projectName to a page of items. */
  async _enrich(tenantId, items) {
    if (items.length === 0) return;

    const userIds = [...new Set(items.map((i) => i.deletedById).filter(Boolean))];
    const projIds = [...new Set(items.map((i) => i.projectId).filter(Boolean))];

    const [userMap, projMap] = await Promise.all([
      this._lookupNames(TABLES.USERS, userIds, 'name'),
      this._lookupNames(TABLES.PROJECTS, projIds, 'name'),
    ]);

    for (const i of items) {
      const u = i.deletedById ? userMap[i.deletedById] : null;
      i.deletedByName  = u ? (u.name || u.email || i.deletedById) : (i.deletedById || 'Unknown');
      i.deletedByEmail = u ? (u.email || '') : '';
      i.projectName    = i.projectId ? (projMap[i.projectId]?.name || null) : null;
    }
  }

  /** Batch-fetch ROWID → {name,email} for a set of ids from a table. */
  async _lookupNames(table, ids, nameCol) {
    if (!ids.length) return {};
    const inClause = ids.map((id) => `'${DataStoreService.escape(id)}'`).join(',');
    try {
      const rows = await this.db.query(
        `SELECT ROWID, ${nameCol}, email FROM ${table} WHERE ROWID IN (${inClause}) LIMIT 300`
      );
      return rows.reduce((acc, r) => {
        acc[String(r.ROWID)] = { name: r[nameCol] || '', email: r.email || '' };
        return acc;
      }, {});
    } catch (_) {
      // `email` may not exist on projects table — retry with just the name column.
      try {
        const rows = await this.db.query(
          `SELECT ROWID, ${nameCol} FROM ${table} WHERE ROWID IN (${inClause}) LIMIT 300`
        );
        return rows.reduce((acc, r) => {
          acc[String(r.ROWID)] = { name: r[nameCol] || '', email: '' };
          return acc;
        }, {});
      } catch (__) {
        return {};
      }
    }
  }
}

module.exports = AdminTrashController;
