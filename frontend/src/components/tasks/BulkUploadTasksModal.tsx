import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Upload, Download, AlertCircle, CheckCircle2, FileText, Loader2, Plus, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import Modal, { ModalActions } from '../ui/Modal';
import Button from '../ui/Button';
import { useToast } from '../ui/Toast';
import { tasksApi } from '../../lib/api';
import {
  parseTaskCells,
  validateRow,
  rowToPayload,
  buildTemplateCsv,
  TEMPLATE_HEADERS,
  BulkUser,
  RawTaskCells,
  EMPTY_TASK_CELLS,
  BULK_MIN_TASKS,
  BULK_MAX_TASKS,
} from '../../lib/bulkTasks';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Fired after an import that created ≥ 1 task, so the board can refresh. */
  onImported?: () => void;
  projectId: string;
  sprintId: string | null;
  /** Sprint name — used to name the downloaded template file per-sprint. */
  sprintName?: string;
  /** Status to create tasks in when a row omits one — the board's first column. */
  defaultStatus: string;
  /** The sprint's available statuses (key + label) for the Status column. */
  statuses?: { key: string; label: string }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  users: any[];
}

interface FailedRow { title?: string; error: string }

const TYPES = ['TASK', 'STORY', 'BUG', 'EPIC', 'SUBTASK'];
const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const cellCls = 'w-full bg-transparent border border-transparent hover:border-ds-border focus:border-indigo-400 focus:bg-ds-surface rounded px-1.5 py-1 text-xs outline-none transition-colors';

/**
 * Assignee cell with typeahead. Suggestions only appear once the user starts
 * typing a token (they do NOT dump the whole directory on focus). Supports
 * multiple ';'-separated emails; picking a suggestion completes the current
 * token. The dropdown is portalled to <body> so the table's scroll container
 * can't clip it.
 */
function AssigneeInput({ value, users, onChange }: { value: string; users: BulkUser[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const parts = value.split(';');
  const token = (parts[parts.length - 1] ?? '').trim().toLowerCase();
  const suggestions = token.length >= 1
    ? users.filter((u) => (u.email ?? '').toLowerCase().includes(token) || (u.name ?? '').toLowerCase().includes(token)).slice(0, 8)
    : [];

  const openMenu = () => { if (inputRef.current) setRect(inputRef.current.getBoundingClientRect()); setOpen(true); };
  const pick = (email: string) => {
    const head = parts.slice(0, -1).map((s) => s.trim()).filter(Boolean);
    onChange(`${[...head, email].join('; ')}; `);
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <>
      <input
        ref={inputRef}
        className={cellCls}
        value={value}
        placeholder="type a name or email…"
        autoComplete="off"
        onChange={(e) => { onChange(e.target.value); openMenu(); }}
        onFocus={() => { if (token) openMenu(); }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      {open && suggestions.length > 0 && rect && createPortal(
        <div
          style={{ position: 'fixed', top: rect.bottom + 2, left: rect.left, width: Math.max(rect.width, 230), zIndex: 300 }}
          className="max-h-52 overflow-auto rounded-lg border border-ds-border bg-ds-surface shadow-2xl"
        >
          {suggestions.map((u) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); if (u.email) pick(u.email); }}
              className="w-full text-left px-2.5 py-1.5 hover:bg-ds-surface-hover transition-colors"
            >
              <div className="text-xs font-medium text-ds-text">{u.email}</div>
              {u.name && <div className="text-[10px] text-ds-text-muted">{u.name}</div>}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

const BulkUploadTasksModal = ({ open, onClose, onImported, projectId, sprintId, sprintName, defaultStatus, statuses = [], users }: Props) => {
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const toast = useToast();

  // Editable grid — the source of truth once populated.
  const [editRows, setEditRows] = useState<RawTaskCells[]>([]);
  const [headerError, setHeaderError] = useState<string | undefined>();
  const [showPaste, setShowPaste] = useState(false);

  // Import progress + result state.
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; created: number; total: number } | null>(null);
  const [result, setResult] = useState<{ created: number; failed: FailedRow[]; missing: string[] } | null>(null);

  const bulkUsers: BulkUser[] = useMemo(
    () => (users ?? []).map((u) => ({ id: String(u.id ?? u.ROWID ?? ''), name: u.name, email: u.email })),
    [users],
  );
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    bulkUsers.forEach((u) => m.set(u.id, u.name || u.email || u.id));
    return m;
  }, [bulkUsers]);

  // Hydrate the grid whenever the pasted / loaded text changes.
  useEffect(() => {
    if (!text.trim()) { setHeaderError(undefined); return; }
    const { cells, headerError: err } = parseTaskCells(text);
    setHeaderError(err);
    if (!err) { setEditRows(cells); setResult(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // Validate every editable row live (blank rows are shown as errors, not skipped).
  const parsed = useMemo(
    () => editRows.map((c, i) => validateRow(c, i + 1, bulkUsers, statuses, defaultStatus)),
    [editRows, bulkUsers, statuses, defaultStatus],
  );
  const validRows = parsed.filter((r) => r.errors.length === 0);
  const errorRows = parsed.filter((r) => r.errors.length > 0);
  const overCap = validRows.length > BULK_MAX_TASKS;
  const canImport = validRows.length >= BULK_MIN_TASKS && !overCap;

  const downloadTemplate = () => {
    const blob = new Blob([buildTemplateCsv(statuses)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    // Name the file after the sprint so downloading templates for different
    // sprints doesn't collide (browser would suffix "(1)", "(2)", …).
    const slug = (sprintName ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const a = document.createElement('a');
    a.href = url;
    a.download = slug ? `${slug}-tasks-template.csv` : 'sprint-tasks-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ''));
    reader.readAsText(file);
    e.target.value = '';
  };

  // Grid editing helpers.
  const pendingFocus = useRef<number | null>(null);

  // After a row is appended, scroll it into view and focus its Title so the
  // user immediately sees (and can type into) the newly added row.
  useEffect(() => {
    if (pendingFocus.current == null) return;
    const idx = pendingFocus.current;
    pendingFocus.current = null;
    const el = document.querySelector<HTMLInputElement>(`[data-bulk-title="${idx}"]`);
    if (el) { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); el.focus(); }
  }, [editRows.length]);

  const updateCell = (i: number, field: keyof RawTaskCells, value: string) => {
    setEditRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
    if (result) setResult(null);
  };
  const addRow = () => {
    setEditRows((rs) => { pendingFocus.current = rs.length; return [...rs, { ...EMPTY_TASK_CELLS }]; });
    if (result) setResult(null);
  };
  const removeRow = (i: number) => {
    setEditRows((rs) => rs.filter((_, idx) => idx !== i));
    if (result) setResult(null);
  };

  const reset = () => { setText(''); setEditRows([]); setResult(null); setProgress(null); setHeaderError(undefined); };
  const close = () => { if (importing) return; reset(); onClose(); };

  const handleImport = async () => {
    if (!canImport || importing) return;

    // Each row already carries its resolved status (from the Status column,
    // falling back to the board default during validation).
    const payloads = validRows.map((r) => {
      const p = rowToPayload(r);
      return { ...p, status: p.status || defaultStatus || 'TODO' };
    });
    const BATCH = 15;                        // upload in batches so progress updates as we go
    const total = payloads.length;

    setImporting(true);
    setResult(null);
    setProgress({ done: 0, created: 0, total });

    let created = 0;
    const failed: FailedRow[] = [];
    const createdTitles: string[] = [];

    try {
      for (let i = 0; i < total; i += BATCH) {
        const slice = payloads.slice(i, i + BATCH);
        // eslint-disable-next-line no-await-in-loop
        const res: any = await tasksApi.bulkCreate({
          project_id: projectId,
          sprint_id: sprintId ?? 0,
          tasks: slice,
        });
        (res?.created ?? []).forEach((c: any) => { created += 1; createdTitles.push(c?.title ?? ''); });
        (res?.failed ?? []).forEach((f: any) => failed.push({ title: f?.title, error: f?.error || 'Insert failed' }));
        setProgress({ done: Math.min(i + BATCH, total), created, total });
      }

      // Reconcile: every submitted task should come back as created OR failed.
      // Anything the server didn't confirm is surfaced so no task is silently lost.
      const acct = new Map<string, number>();
      [...createdTitles, ...failed.map((f) => f.title ?? '')].forEach((t) => acct.set(t, (acct.get(t) ?? 0) + 1));
      const missing: string[] = [];
      payloads.forEach((p) => {
        const n = acct.get(p.title) ?? 0;
        if (n > 0) acct.set(p.title, n - 1);
        else missing.push(p.title);
      });

      if (created > 0) onImported?.();          // let the board refresh
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['sprints', 'board'] });

      setResult({ created, failed, missing });
      const problems = failed.length + missing.length;
      if (problems === 0) {
        toast.success(`${created} task${created === 1 ? '' : 's'} imported`);
        reset();
        onClose();
      } else {
        // Keep only the rows that didn't make it, so the user can fix + retry
        // without re-creating (duplicating) the ones that already succeeded.
        const problemTitles = new Set([...failed.map((f) => f.title ?? ''), ...missing]);
        setEditRows((rs) => rs.filter((r) => problemTitles.has(r.title.trim())));
        toast.error(`${created} imported · ${failed.length} failed${missing.length ? ` · ${missing.length} unconfirmed` : ''}`);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Bulk import failed');
      setResult({ created, failed, missing: [] });
    } finally {
      setImporting(false);
    }
  };

  const hasRows = editRows.length > 0;

  return (
    <Modal open={open} onClose={close} title="Bulk Upload Tasks" size="4xl" closeOnBackdropClick={false}>
      <div className="space-y-4">
        {/* Instructions + template */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ds-border bg-ds-surface-hover px-4 py-3">
          <div className="text-xs text-ds-text-muted space-y-1.5">
            <p>
              Upload a CSV, paste rows, or add them by hand below. Required column: <b className="text-ds-text">Title</b>.
              Due date is optional. Assignees are matched by email. Edit any cell directly before importing.
              You can import <b className="text-ds-text">{BULK_MIN_TASKS}–{BULK_MAX_TASKS}</b> tasks at a time.
            </p>
            {statuses.length > 0 && (
              <p className="flex flex-wrap items-center gap-1.5">
                <span>Valid <b className="text-ds-text">Status</b> values:</span>
                {statuses.map((s) => (
                  <span key={s.key} className="px-1.5 py-0.5 rounded bg-ds-surface border border-ds-border text-ds-text text-[11px]">
                    {s.label}
                  </span>
                ))}
                <span className="opacity-80">— blank defaults to the first column.</span>
              </p>
            )}
          </div>
          <Button size="sm" variant="outline" icon={<Download size={14} />} onClick={downloadTemplate}>
            Download template
          </Button>
        </div>

        {/* Input controls */}
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={handleFile} />
          <Button size="sm" variant="secondary" icon={<Upload size={14} />} onClick={() => fileRef.current?.click()}>
            Choose CSV file
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowPaste((v) => !v)}>
            {showPaste ? 'Hide paste box' : 'Paste rows'}
          </Button>
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={addRow}>
            Add row
          </Button>
          {hasRows && <Button size="sm" variant="ghost" onClick={reset}>Clear all</Button>}
        </div>

        {showPaste && (
          <textarea
            className="form-textarea w-full font-mono text-xs"
            rows={5}
            placeholder={`Paste rows here, e.g.\n${TEMPLATE_HEADERS.join(',')}\nSet up CI,Build pipeline,TASK,HIGH,2026-07-10,5,8,alice@acme.com,devops; urgent,To Do`}
            value={text}
            onChange={(e) => { setText(e.target.value); if (result) setResult(null); }}
          />
        )}

        {/* Header error */}
        {headerError && (
          <p className="flex items-center gap-1.5 text-xs text-red-600"><AlertCircle size={13} /> {headerError}</p>
        )}

        {/* Editable grid */}
        {hasRows && (
          <>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-ds-text-muted">{editRows.length} row{editRows.length === 1 ? '' : 's'}</span>
              <span className={`inline-flex items-center gap-1 ${overCap ? 'text-red-600' : 'text-green-700'}`}>
                <CheckCircle2 size={13} /> {validRows.length} ready
                <span className="text-ds-text-muted">/ {BULK_MAX_TASKS} max</span>
              </span>
              {errorRows.length > 0 && <span className="inline-flex items-center gap-1 text-red-600"><AlertCircle size={13} /> {errorRows.length} need a title / fix (highlighted)</span>}
            </div>

            {overCap && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                <AlertCircle size={13} className="shrink-0" />
                Too many tasks — you can import at most <b>{BULK_MAX_TASKS}</b> at once. Remove {validRows.length - BULK_MAX_TASKS} row{validRows.length - BULK_MAX_TASKS === 1 ? '' : 's'} to continue.
              </div>
            )}

            {/* Both scrollbars: vertical via max-h, horizontal via overflow-x on the wide table */}
            <div className="max-h-[46vh] overflow-auto rounded-lg border border-ds-border">
              <table className="text-xs" style={{ minWidth: 1100 }}>
                <thead className="bg-ds-surface-hover text-ds-text-muted sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold w-8 bg-ds-surface-hover" style={{ position: 'sticky', left: 0, top: 0, zIndex: 20 }}>#</th>
                    <th className="px-2 py-2 text-left font-semibold bg-ds-surface-hover shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]" style={{ position: 'sticky', left: 32, top: 0, zIndex: 20, minWidth: 200 }}>Title *</th>
                    <th className="px-2 py-2 text-left font-semibold" style={{ minWidth: 100 }}>Type</th>
                    <th className="px-2 py-2 text-left font-semibold" style={{ minWidth: 110 }}>Priority</th>
                    <th className="px-2 py-2 text-left font-semibold" style={{ minWidth: 130 }}>Due (YYYY-MM-DD)</th>
                    <th className="px-2 py-2 text-left font-semibold" style={{ minWidth: 130 }}>Status</th>
                    <th className="px-2 py-2 text-left font-semibold" style={{ minWidth: 180 }}>Assignees (emails)</th>
                    <th className="px-2 py-2 text-left font-semibold" style={{ minWidth: 140 }}>Labels (;)</th>
                    <th className="px-2 py-2 text-left font-semibold" style={{ minWidth: 200 }}>Description</th>
                    <th className="px-2 py-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ds-border">
                  {editRows.map((row, i) => {
                    const v = parsed[i];
                    const invalid = v.errors.length > 0;
                    // Frozen cells need an opaque, theme-aware background so scrolled
                    // content doesn't show through; the red row tint + error text still flag invalid rows.
                    const stickyBg = 'bg-ds-surface';
                    return (
                      <tr key={i} className={invalid ? 'bg-red-50/60' : 'bg-ds-surface hover:bg-ds-surface-hover'}>
                        <td className={`px-2 py-1 align-top text-ds-text-muted ${stickyBg}`} style={{ position: 'sticky', left: 0, zIndex: 5 }}>
                          <div className="pt-1.5">{i + 1}</div>
                        </td>
                        <td className={`px-1 py-1 align-top ${stickyBg} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]`} style={{ position: 'sticky', left: 32, zIndex: 5, minWidth: 200 }}>
                          <input className={cellCls} value={row.title} placeholder="Task title (required)"
                            data-bulk-title={i}
                            onChange={(e) => updateCell(i, 'title', e.target.value)} />
                          {invalid && <div className="px-1.5 text-[10px] text-red-600">{v.errors.join('; ')}</div>}
                        </td>
                        <td className="px-1 py-1 align-top">
                          <select className={cellCls} value={row.type} onChange={(e) => updateCell(i, 'type', e.target.value)}>
                            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td className="px-1 py-1 align-top">
                          <select className={cellCls} value={row.priority} onChange={(e) => updateCell(i, 'priority', e.target.value)}>
                            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </td>
                        <td className="px-1 py-1 align-top">
                          <input className={cellCls} value={row.dueDate} placeholder="optional"
                            onChange={(e) => updateCell(i, 'dueDate', e.target.value)} />
                        </td>
                        <td className="px-1 py-1 align-top">
                          {statuses.length > 0 ? (
                            <select className={cellCls} value={row.status} onChange={(e) => updateCell(i, 'status', e.target.value)}>
                              <option value="">(default)</option>
                              {statuses.map((s) => <option key={s.key} value={s.label}>{s.label}</option>)}
                            </select>
                          ) : (
                            <input className={cellCls} value={row.status} onChange={(e) => updateCell(i, 'status', e.target.value)} />
                          )}
                          {v.unmatchedStatus && <div className="px-1.5 text-[10px] text-amber-600">⚠ unknown → default</div>}
                        </td>
                        <td className="px-1 py-1 align-top">
                          <AssigneeInput value={row.assignees} users={bulkUsers} onChange={(val) => updateCell(i, 'assignees', val)} />
                          {v.assigneeIds.length > 0 && (
                            <div className="px-1.5 text-[10px] text-ds-text-muted truncate">→ {v.assigneeIds.map((id) => nameById.get(id) ?? id).join(', ')}</div>
                          )}
                          {v.unmatchedAssignees.length > 0 && (
                            <div className="px-1.5 text-[10px] text-amber-600">⚠ no match: {v.unmatchedAssignees.join(', ')}</div>
                          )}
                        </td>
                        <td className="px-1 py-1 align-top">
                          <input className={cellCls} value={row.labels} placeholder="a; b"
                            onChange={(e) => updateCell(i, 'labels', e.target.value)} />
                        </td>
                        <td className="px-1 py-1 align-top">
                          <input className={cellCls} value={row.description} placeholder="optional"
                            onChange={(e) => updateCell(i, 'description', e.target.value)} />
                        </td>
                        <td className="px-1 py-1 align-top">
                          <button
                            onClick={() => removeRow(i)}
                            className="p-1.5 rounded-lg text-ds-text-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Remove row"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button onClick={addRow} className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700">
              <Plus size={13} /> Add another row
            </button>
          </>
        )}

        {!hasRows && !headerError && !importing && !result && (
          <div className="flex flex-col items-center gap-2 py-8 text-ds-text-muted">
            <FileText size={22} className="opacity-50" />
            <p className="text-xs">No rows yet — choose a file, paste rows, or add one manually.</p>
            <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={addRow}>Add first row</Button>
          </div>
        )}

        {/* Live import progress */}
        {importing && progress && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-4 py-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-indigo-800">
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Creating tasks… {progress.done} / {progress.total}
              </span>
              <span className="inline-flex items-center gap-1 text-green-700">
                <CheckCircle2 size={13} /> {progress.created} created
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-indigo-100 overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-300"
                style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Result summary (shown when some rows didn't make it) */}
        {!importing && result && (result.failed.length > 0 || result.missing.length > 0) && (
          <div className="rounded-lg border border-ds-border overflow-hidden">
            <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 bg-ds-surface-hover text-xs font-medium">
              <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 size={13} /> {result.created} created</span>
              {result.failed.length > 0 && <span className="inline-flex items-center gap-1 text-red-600"><AlertCircle size={13} /> {result.failed.length} failed</span>}
              {result.missing.length > 0 && <span className="inline-flex items-center gap-1 text-amber-600"><AlertCircle size={13} /> {result.missing.length} unconfirmed</span>}
              <span className="text-ds-text-muted">— the rows below were kept so you can fix &amp; retry.</span>
            </div>
            <div className="max-h-40 overflow-auto divide-y divide-ds-border">
              {result.failed.map((f, i) => (
                <div key={`f${i}`} className="flex items-start gap-2 px-4 py-2 text-xs">
                  <AlertCircle size={12} className="text-red-500 shrink-0 mt-0.5" />
                  <span className="text-ds-text font-medium shrink-0 max-w-[40%] truncate">{f.title || `Row ${i + 1}`}</span>
                  <span className="text-ds-text-muted">— {f.error}</span>
                </div>
              ))}
              {result.missing.map((t, i) => (
                <div key={`m${i}`} className="flex items-start gap-2 px-4 py-2 text-xs">
                  <AlertCircle size={12} className="text-amber-500 shrink-0 mt-0.5" />
                  <span className="text-ds-text font-medium shrink-0 max-w-[40%] truncate">{t || `Row ${i + 1}`}</span>
                  <span className="text-ds-text-muted">— not confirmed by the server (not created). Retry this row.</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ModalActions>
        <Button variant="secondary" onClick={close} disabled={importing}>
          {result && (result.failed.length > 0 || result.missing.length > 0) ? 'Close' : 'Cancel'}
        </Button>
        <Button
          variant="primary"
          onClick={handleImport}
          loading={importing}
          disabled={!canImport || importing}
        >
          {importing
            ? `Creating ${progress?.done ?? 0}/${progress?.total ?? validRows.length}…`
            : `Import ${validRows.length > 0 ? validRows.length : ''} task${validRows.length === 1 ? '' : 's'}`}
        </Button>
      </ModalActions>
    </Modal>
  );
};

export default BulkUploadTasksModal;
