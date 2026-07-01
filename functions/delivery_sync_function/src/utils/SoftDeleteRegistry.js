'use strict';

/**
 * SoftDeleteRegistry – the single source of truth for the org-wide Trash / Recycle Bin.
 * =====================================================================================
 * Every function in this Catalyst project shares ONE DataStore, so a single
 * controller (AdminTrashController) can read/restore/purge soft-deleted rows from
 * any module's table. This registry maps each user-facing module to the table that
 * backs it and tells the controller how to build a human-readable label for a row.
 *
 * SOFT-DELETE CONVENTION (standardised across all modules):
 *   - `deleted_at`  DATETIME  – set to now when soft-deleted, NULL when active
 *   - `deleted_by`  TEXT      – ROWID of the user who deleted it
 *   A row is "in the trash" iff `deleted_at IS NOT NULL`.
 *
 * TO ADD A MODULE TO THE TRASH:
 *   1. Add `deleted_at` + `deleted_by` columns to its table in the Catalyst console.
 *   2. Make that module's delete controller soft-delete (see SprintController.remove).
 *   3. Add its LIST/READ queries an `AND deleted_at IS NULL` filter.
 *   4. Add one entry below. That's it — no new endpoint needed.
 *
 * Each entry:
 *   key          unique slug used in the REST path (/admin/trash/:key/:id)
 *   label        module name shown in the UI
 *   table        DataStore table name
 *   nameCols     ordered list of columns to try for the row's display name
 *   projectCol   (optional) column holding the parent project id, for context
 *   subLabel     (optional) extra columns joined with ' · ' for a secondary line
 */

const TRASH_MODULES = Object.freeze([
  // ── Delivery ────────────────────────────────────────────────────────────────
  { key: 'project',      label: 'Project',      table: 'projects',          nameCols: ['name'] },
  { key: 'milestone',    label: 'Milestone',    table: 'milestones',        nameCols: ['title', 'name'], projectCol: 'project_id' },
  { key: 'action',       label: 'Action Item',  table: 'actions',           nameCols: ['title'], projectCol: 'project_id' },
  { key: 'blocker',      label: 'Blocker',      table: 'blockers',          nameCols: ['title'], projectCol: 'project_id' },
  { key: 'risk',         label: 'Risk',         table: 'risks',             nameCols: ['title'], projectCol: 'project_id' },
  { key: 'issue',        label: 'Issue',        table: 'issues',            nameCols: ['title'], projectCol: 'project_id' },
  { key: 'decision',     label: 'Decision',     table: 'decisions',         nameCols: ['title'], projectCol: 'project_id' },

  // ── Tasks & Sprints ───────────────────────────────────────────────────────────
  { key: 'sprint',       label: 'Sprint',       table: 'sprints',           nameCols: ['name'], projectCol: 'project_id' },
  { key: 'task',         label: 'Task',         table: 'tasks',             nameCols: ['title'], projectCol: 'project_id' },
  { key: 'task_comment', label: 'Task Comment', table: 'task_comments',     nameCols: ['content', 'comment'] },

  // ── People / HR ─────────────────────────────────────────────────────────────
  { key: 'announcement', label: 'Announcement', table: 'announcements',     nameCols: ['title'] },
  { key: 'leave_request', label: 'Leave Request', table: 'leave_requests',  nameCols: ['reason'], subLabel: ['start_date', 'end_date'] },

  // ── Time tracking ─────────────────────────────────────────────────────────────
  { key: 'time_entry',   label: 'Time Entry',   table: 'time_entries',      nameCols: ['description', 'notes'], projectCol: 'project_id', subLabel: ['entry_date', 'hours'] },

  // ── Assets ──────────────────────────────────────────────────────────────────
  { key: 'asset',        label: 'Asset',        table: 'assets',            nameCols: ['name', 'asset_tag'] },

  // ── Documents ───────────────────────────────────────────────────────────────
  { key: 'document',     label: 'Document',     table: 'project_documents', nameCols: ['name', 'title'], projectCol: 'project_id' },

  // ── Bugs ──────────────────────────────────────────────────────────────────────
  { key: 'bug',          label: 'Bug Report',   table: 'bug_reports',       nameCols: ['title'] },
]);

const BY_KEY = Object.freeze(
  TRASH_MODULES.reduce((acc, m) => { acc[m.key] = m; return acc; }, {})
);

/** Build a display name for a trashed row from the module's nameCols, with a fallback. */
function buildName(module, row) {
  for (const col of module.nameCols || []) {
    const v = row[col];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      const s = String(v).trim();
      return s.length > 120 ? s.slice(0, 117) + '…' : s;
    }
  }
  return `${module.label} #${row.ROWID}`;
}

/** Build an optional secondary label (e.g. dates) from the module's subLabel cols. */
function buildSubLabel(module, row) {
  if (!Array.isArray(module.subLabel)) return '';
  return module.subLabel
    .map((c) => row[c])
    .filter((v) => v !== undefined && v !== null && String(v).trim() !== '')
    .join(' · ');
}

module.exports = { TRASH_MODULES, BY_KEY, buildName, buildSubLabel };
