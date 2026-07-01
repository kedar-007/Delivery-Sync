# Soft Delete & Org-Wide Trash

A single, consistent soft-delete mechanism across all modules, plus an admin **Trash**
(Recycle Bin) that lists every soft-deleted record — from every module — with **who
deleted it and when**, and lets an admin **restore** or **permanently purge** it.

Because all Catalyst functions share **one DataStore**, a single controller
(`AdminTrashController` in `delivery_sync_function`) reads/restores/purges across every
module's table. Adding a module to the Trash is one config line — no new endpoint.

---

## ⚠️ Deploy prerequisite — add columns in Catalyst FIRST

Soft delete uses two columns on each table:

| Column       | Type       | Meaning                                        |
|--------------|------------|------------------------------------------------|
| `deleted_at` | `DateTime` | when soft-deleted; `NULL` = active             |
| `deleted_by` | `Text`     | ROWID of the user who deleted it               |

A row is *in the trash* iff `deleted_at IS NOT NULL`.

**These columns must be created in the Catalyst console (DataStore → table → New Column)
BEFORE deploying the converted controllers.** A ZCQL query with `deleted_at IS NULL`
against a table that lacks the column throws — which would break that module's list view.

`sprints` and `projects` already have both columns (their soft delete already shipped).

### Tables that need the columns added

Already converted in this change (add columns before deploy):

- `tasks`
- `task_comments`
- `actions`
- `decisions`

Registered in the Trash and ready to convert next (add columns when you convert them):

- `blockers`, `risks`, `issues`, `milestones`
- `announcements`, `leave_requests`
- `time_entries`
- `assets`
- `project_documents`  (currently uses `is_deleted='true'` — migrate to `deleted_at`)
- `bug_reports`

The `AdminTrashController` wraps each module's query in try/catch, so a table without
the columns simply contributes **no rows** — the Trash is safe to ship before every table
is migrated.

---

## Architecture

```
Delete action (per module controller)
   └─ db.softDelete(table, rowId, userId)   → sets deleted_at + deleted_by
Active reads (list/board/count/…)
   └─ ... AND deleted_at IS NULL             → trashed rows never appear

Admin Trash  (delivery_sync_function)
   GET    /api/admin/trash                    → union across all registered tables
   POST   /api/admin/trash/:module/:id/restore
   DELETE /api/admin/trash/:module/:id         → permanent purge
```

- Registry: `functions/delivery_sync_function/src/utils/SoftDeleteRegistry.js`
- Controller: `functions/delivery_sync_function/src/controllers/AdminTrashController.js`
- Routes: `functions/delivery_sync_function/src/routes/trashRoutes.js`
- Shared helpers: `DataStoreService.softDelete()` / `.restore()`
- Frontend: `frontend/src/pages/RecycleBinPage.tsx` (route `/:tenantSlug/recycle-bin`),
  `adminApi.getTrash/restoreTrash/purgeTrash` in `frontend/src/lib/api.ts`

### Permissions (new)

- `ADMIN_TRASH_VIEW` — see the Trash
- `ADMIN_TRASH_RESTORE` — restore a record
- `ADMIN_TRASH_PURGE` — permanently delete a record

`TENANT_ADMIN` / `SUPER_ADMIN` hold all permissions automatically. Grant the individual
permissions to org roles via the Org Roles UI for scoped delegation.

---

## How to convert the remaining modules (mechanical recipe)

For each remaining module (e.g. blockers):

1. **Add columns** `deleted_at` (DateTime) + `deleted_by` (Text) to the table in Catalyst.
2. **Delete handler** — replace the hard delete:
   ```js
   // before
   await this.db.delete(TABLES.BLOCKERS, id);
   // after
   await this.db.softDelete(TABLES.BLOCKERS, id, req.currentUser.id);
   await this.audit.log({ tenantId, entityType: 'BLOCKER', entityId: id,
     action: AUDIT_ACTION.DELETE, newValue: { soft: true }, performedBy: req.currentUser.id });
   ```
3. **Guard reads of a single row** — treat trashed as not found:
   ```js
   if (!row || row.deleted_at) return ResponseHelper.notFound(res, 'Blocker not found');
   ```
4. **Every list/board/count query** for that table — add the filter:
   ```js
   conditions.push('deleted_at IS NULL');   // or: `... AND deleted_at IS NULL`
   ```
   Don't forget aggregates, dashboards, reports, and cross-module counts.
5. **Cascade** (if the record owns children that appear in active views) — soft-delete the
   children too (see `TaskController.remove` cascading to subtasks).
6. The entry already exists in `SoftDeleteRegistry.js`, so the record now appears in the
   Trash automatically. (New table? Add one entry to the registry.)

---

## Optional follow-up: retention auto-purge

Add a Catalyst cron that hard-deletes rows where `deleted_at` is older than N days, per
table in the registry. Keeps the Trash bounded without manual purging.
