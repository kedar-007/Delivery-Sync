/**
 * Enterprise Weekly Timesheet Module
 * Spreadsheet-style weekly time entry with full validation,
 * auto-save, keyboard navigation, and submission workflow.
 */

import React, {
  useState, useMemo, useEffect, useCallback, useRef, memo,
} from 'react';
import {
  format, addDays, subDays, startOfWeek, parseISO,
} from 'date-fns';
import {
  Plus, Trash2, Copy, Save, Send, ChevronLeft, ChevronRight,
  AlertTriangle, CheckCircle2, Clock, Loader2, FileText,
  RotateCcw, Info, X,
} from 'lucide-react';
import { useAuth }            from '../contexts/AuthContext';
import { useTimeEntries }     from '../hooks/useTimeTracking';
import { useTasks }           from '../hooks/useTaskSprint';
import { useMyProjects }      from '../hooks/useProjects';
import { timeEntriesApi }     from '../lib/api';
import { useToast }           from '../components/ui/Toast';
import { useConfirm }         from '../components/ui/ConfirmDialog';
import Card                   from '../components/ui/Card';
import Button                 from '../components/ui/Button';
import Modal, { ModalActions } from '../components/ui/Modal';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TimesheetRow {
  id: string;
  projectId: string;
  projectName: string;
  taskId: string;
  taskName: string;
  hours: Record<string, string>;            // 'yyyy-MM-dd' → raw input string
  serverEntryIds: Record<string, string>;   // 'yyyy-MM-dd' → saved entry ROWID
  notes: string;
  isBillable: boolean;
  isDirty: boolean;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type CopyMode   = 'tasks' | 'hours' | 'all';

// ─── Validation (pure, testable) ──────────────────────────────────────────────

const VALID_NUM_RE = /^\d*\.?\d*$/;

export function parseHour(raw: string): { value: number; error?: string } {
  const s = raw.trim();
  if (!s) return { value: 0 };

  if (!VALID_NUM_RE.test(s) || s === '.') {
    return { value: 0, error: 'Only numbers are allowed.' };
  }
  const n = parseFloat(s);
  if (isNaN(n))  return { value: 0, error: 'Invalid number.' };
  if (n < 0)     return { value: 0, error: 'Hours cannot be negative.' };
  if (n > 24)    return { value: 0, error: 'Cannot exceed 24 hours per day.' };

  // Max 2 decimal places
  const dotIdx = s.indexOf('.');
  if (dotIdx !== -1 && s.length - dotIdx - 1 > 2) {
    return { value: 0, error: 'Maximum 2 decimal places allowed.' };
  }

  // Must be a 0.25 (15-minute) increment: n × 4 must be a whole number
  if (Math.round(n * 4) !== Math.round(n * 4 * 1) || Math.abs(n * 4 - Math.round(n * 4)) > 1e-9) {
    // More robust check:
    if (Math.abs((n * 4) - Math.round(n * 4)) > 0.0001) {
      return { value: 0, error: 'Time must be in 15-minute increments (0.25, 0.5, 0.75…).' };
    }
  }

  return { value: n };
}

export const rowHours    = (row: TimesheetRow, dates: string[]) =>
  dates.reduce((s, d) => s + (parseFloat(row.hours[d] ?? '') || 0), 0);

export const colHours    = (rows: TimesheetRow[], date: string) =>
  rows.reduce((s, r) => s + (parseFloat(r.hours[date] ?? '') || 0), 0);

export const weekTotal   = (rows: TimesheetRow[], dates: string[]) =>
  dates.reduce((s, d) => s + colHours(rows, d), 0);

export function notesRequired(row: TimesheetRow, dates: string[]): boolean {
  const weekendDates = dates.slice(5); // index 5 = Sat, 6 = Sun
  const hasWeekend   = weekendDates.some(d => (parseFloat(row.hours[d] ?? '') || 0) > 0);
  const hasDayOver8  = dates.some(d => (parseFloat(row.hours[d] ?? '') || 0) > 8);
  return hasWeekend || hasDayOver8;
}

export function duplicateRowIds(rows: TimesheetRow[]): Set<string> {
  const seen  = new Map<string, string>();
  const dupes = new Set<string>();
  for (const row of rows) {
    if (!row.projectId) continue;
    const key = `${row.projectId}::${row.taskId}`;
    if (seen.has(key)) {
      dupes.add(row.id);
      dupes.add(seen.get(key)!);
    } else {
      seen.set(key, row.id);
    }
  }
  return dupes;
}

const mkRow = (): TimesheetRow => ({
  id:            `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  projectId:     '', projectName: '',
  taskId:        '', taskName:    '',
  hours:         {}, serverEntryIds: {},
  notes:         '',
  isBillable:    true,
  isDirty:       false,
});

// ─── HourCell ─────────────────────────────────────────────────────────────────

interface HourCellProps {
  rowId: string; date: string; value: string; error?: string;
  isToday: boolean; cellKey: string;
  onChange: (rowId: string, date: string, val: string) => void;
  onBlur:   (rowId: string, date: string, val: string) => void;
}

const HourCell = memo(({
  rowId, date, value, error, isToday, cellKey, onChange, onBlur,
}: HourCellProps) => {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);

  const hasVal = (parseFloat(local) || 0) > 0;

  const handleBlur = () => {
    const { value: n, error: err } = parseHour(local);
    let fmt = '';
    if (!err && n > 0) fmt = n % 1 === 0 ? String(n) : String(n);
    else if (err)       fmt = local; // keep raw so error shows
    setLocal(fmt);
    onChange(rowId, date, fmt);
    onBlur(rowId, date, fmt);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const all = Array.from(document.querySelectorAll<HTMLElement>('[data-cell]'));
    const idx = all.findIndex(el => el.dataset.cell === cellKey);
    all[e.shiftKey ? idx - 1 : idx + 1]?.focus();
  };

  return (
    <td
      title={error}
      className={`relative border-r border-gray-100 p-0 w-[72px] min-w-[60px] ${
        isToday ? 'bg-blue-50/40' : ''} ${error ? 'bg-red-50' : ''}`}
    >
      <input
        type="text"
        inputMode="decimal"
        placeholder="—"
        data-cell={cellKey}
        value={local}
        onChange={e => { setLocal(e.target.value); onChange(rowId, date, e.target.value); }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`w-full h-10 text-center text-[13px] border-0 bg-transparent
          focus:outline-none focus:bg-blue-100/50 transition-colors caret-indigo-600 ${
            error  ? 'text-red-600 font-medium'    :
            hasVal ? 'text-gray-900 font-semibold'  : 'text-gray-300 placeholder-gray-200'}`}
      />
      {error && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-red-400 rounded-b" />}
    </td>
  );
});

// ─── ProjectSelect ────────────────────────────────────────────────────────────

interface ProjectSelectProps {
  value: string;
  projects: Array<{ id: string; name: string }>;
  isDuplicate: boolean;
  onChange: (id: string, name: string) => void;
}

const ProjectSelect = memo(({ value, projects, isDuplicate, onChange }: ProjectSelectProps) => (
  <td className={`border-r border-gray-100 px-2 py-1 min-w-[190px] ${isDuplicate ? 'bg-amber-50' : ''}`}>
    <select
      className={`w-full text-sm bg-transparent border-0 focus:outline-none cursor-pointer
        focus:ring-1 focus:ring-indigo-400 rounded py-1.5 ${
          isDuplicate ? 'text-amber-800 font-medium' : value ? 'text-gray-800' : 'text-gray-400'}`}
      value={value}
      onChange={e => {
        const proj = projects.find(p => p.id === e.target.value);
        onChange(e.target.value, proj?.name ?? '');
      }}
    >
      <option value="">Select project…</option>
      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  </td>
));

// ─── TaskSelect ───────────────────────────────────────────────────────────────

interface TaskSelectProps {
  projectId: string; value: string;
  onChange: (id: string, name: string) => void;
}

const TaskSelect = memo(({ projectId, value, onChange }: TaskSelectProps) => {
  const { data: raw = [], isFetching } = useTasks(
    projectId ? { project_id: projectId } : undefined, !!projectId,
  );
  const tasks = (raw as Array<{ id: string; title: string }>).filter(Boolean);

  if (!projectId) return (
    <td className="border-r border-gray-100 px-2 py-1 min-w-[160px]">
      <span className="text-xs text-gray-300 select-none">—</span>
    </td>
  );

  if (isFetching) return (
    <td className="border-r border-gray-100 px-2 py-1 min-w-[160px]">
      <span className="flex items-center gap-1.5 text-xs text-gray-400">
        <Loader2 size={11} className="animate-spin" /> Loading…
      </span>
    </td>
  );

  return (
    <td className="border-r border-gray-100 px-2 py-1 min-w-[160px]">
      <select
        className={`w-full text-sm bg-transparent border-0 focus:outline-none cursor-pointer
          focus:ring-1 focus:ring-indigo-400 rounded py-1.5 ${value ? 'text-gray-800' : 'text-gray-400'}`}
        value={value}
        onChange={e => {
          const t = tasks.find(t => t.id === e.target.value);
          onChange(e.target.value, t?.title ?? '');
        }}
      >
        <option value="">— No task —</option>
        {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
      </select>
    </td>
  );
});

// ─── Timesheet Row ────────────────────────────────────────────────────────────

interface RowProps {
  row: TimesheetRow; rowIndex: number;
  weekDates: string[]; todayStr: string;
  projects: Array<{ id: string; name: string }>;
  isDuplicate: boolean;
  cellErrors: Record<string, string>;
  total: number; notesReq: boolean;
  onUpdate:     (id: string, patch: Partial<TimesheetRow>) => void;
  onCellChange: (rowId: string, date: string, val: string) => void;
  onCellBlur:   (rowId: string, date: string, val: string) => void;
  onDelete:     (id: string) => void;
  onDuplicate:  (id: string) => void;
}

const TimesheetRowComp = memo(({
  row, rowIndex, weekDates, todayStr, projects,
  isDuplicate, cellErrors, total, notesReq,
  onUpdate, onCellChange, onCellBlur, onDelete, onDuplicate,
}: RowProps) => {
  const [showNotes, setShowNotes] = useState(!!row.notes);

  useEffect(() => { if (notesReq) setShowNotes(true); }, [notesReq]);

  const notesErr = notesReq && !row.notes.trim()
    ? 'Notes required for weekend or overtime entries.'
    : row.notes.trim().length > 0 && row.notes.trim().length < 10
      ? 'Minimum 10 characters.'
      : row.notes.length > 1000
        ? 'Maximum 1000 characters.'
        : '';

  const rowBg = isDuplicate
    ? 'bg-amber-50/30'
    : row.isDirty
      ? 'bg-indigo-50/10'
      : '';

  return (
    <>
      <tr className={`group border-b border-gray-100 transition-colors ${rowBg} hover:bg-gray-50/60`}>
        {/* Row # */}
        <td className="w-8 px-1.5 text-center border-r border-gray-100">
          <span className="text-[11px] text-gray-400 tabular-nums">{rowIndex + 1}</span>
        </td>

        <ProjectSelect
          value={row.projectId}
          projects={projects}
          isDuplicate={isDuplicate}
          onChange={(id, name) =>
            onUpdate(row.id, { projectId: id, projectName: name, taskId: '', taskName: '', isDirty: true })
          }
        />

        <TaskSelect
          projectId={row.projectId}
          value={row.taskId}
          onChange={(id, name) => onUpdate(row.id, { taskId: id, taskName: name, isDirty: true })}
        />

        {/* Hour cells */}
        {weekDates.map((date, di) => (
          <HourCell
            key={date}
            rowId={row.id} date={date}
            value={row.hours[date] ?? ''}
            error={cellErrors[date]}
            isToday={date === todayStr}
            cellKey={`${rowIndex}-${di}`}
            onChange={onCellChange}
            onBlur={onCellBlur}
          />
        ))}

        {/* Row total */}
        <td className="border-r border-gray-100 px-3 text-right w-[80px]">
          <span className={`text-sm font-bold tabular-nums ${total > 0 ? 'text-indigo-600' : 'text-gray-300'}`}>
            {total > 0 ? (total % 1 === 0 ? total : total.toFixed(2)) : '—'}
          </span>
        </td>

        {/* Billable toggle */}
        <td className="border-r border-gray-100 px-2 text-center w-[60px]">
          <input
            type="checkbox"
            checked={row.isBillable}
            title="Billable"
            onChange={e => onUpdate(row.id, { isBillable: e.target.checked, isDirty: true })}
            className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400 cursor-pointer"
          />
        </td>

        {/* Actions */}
        <td className="px-2 w-[96px]">
          <div className="flex items-center gap-0.5 justify-end">
            <button
              onClick={() => setShowNotes(v => !v)}
              title={notesReq ? 'Notes required' : (showNotes ? 'Hide notes' : 'Add notes')}
              className={`p-1.5 rounded-md transition-colors ${
                notesErr
                  ? 'text-red-500 hover:text-red-700'
                  : notesReq
                    ? 'text-amber-500 hover:text-amber-700'
                    : showNotes
                      ? 'text-indigo-500 hover:bg-indigo-50'
                      : 'text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100'
              }`}
            >
              <FileText size={13} />
            </button>
            <button
              onClick={() => onDuplicate(row.id)}
              title="Duplicate row"
              className="p-1.5 text-gray-300 hover:text-indigo-500 rounded-md transition-colors opacity-0 group-hover:opacity-100"
            >
              <Copy size={13} />
            </button>
            <button
              onClick={() => onDelete(row.id)}
              title="Delete row"
              className="p-1.5 text-gray-300 hover:text-red-500 rounded-md transition-colors opacity-0 group-hover:opacity-100"
            >
              <Trash2 size={13} />
            </button>
          </div>
          {isDuplicate && (
            <div className="flex items-center justify-end gap-0.5 mt-0.5">
              <AlertTriangle size={9} className="text-amber-500 shrink-0" />
              <span className="text-[9px] text-amber-600 font-medium">Duplicate</span>
            </div>
          )}
        </td>
      </tr>

      {/* Notes expansion row */}
      {showNotes && (
        <tr className={`border-b border-gray-100 ${rowBg}`}>
          <td className="border-r border-gray-100" />
          <td colSpan={2} className="px-2 pb-2.5 pt-1 border-r border-gray-100 align-top">
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${
              notesReq ? 'text-amber-600' : 'text-gray-400'
            }`}>
              {notesReq ? '⚠ Notes required' : 'Notes'}
            </span>
          </td>
          <td colSpan={10} className="px-2 pb-2.5 pt-1">
            <textarea
              rows={2}
              placeholder={
                notesReq
                  ? 'Explain weekend or overtime hours (min. 10 characters)…'
                  : 'Optional — add context for this time entry…'
              }
              maxLength={1000}
              value={row.notes}
              onChange={e => onUpdate(row.id, { notes: e.target.value, isDirty: true })}
              className={`w-full text-sm border rounded-lg px-3 py-2 resize-none focus:outline-none
                focus:ring-1 transition-colors ${
                  notesErr
                    ? 'border-red-300 bg-red-50/50 focus:ring-red-400 focus:border-red-400'
                    : 'border-gray-200 bg-white focus:ring-indigo-300 focus:border-indigo-400'
                }`}
            />
            <div className="flex items-center justify-between mt-0.5 px-0.5">
              {notesErr
                ? <span className="text-[10px] text-red-500">{notesErr}</span>
                : <span />
              }
              <span className={`text-[10px] ${row.notes.length > 900 ? 'text-amber-500' : 'text-gray-400'}`}>
                {row.notes.length}/1000
              </span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
});

// ─── Copy Previous Week Modal ─────────────────────────────────────────────────

interface CopyModalProps {
  open: boolean;
  onClose: () => void;
  onCopy: (mode: CopyMode) => void;
  loading: boolean;
}

const CopyModal = ({ open, onClose, onCopy, loading }: CopyModalProps) => {
  const [mode, setMode] = useState<CopyMode>('all');
  return (
    <Modal open={open} onClose={onClose} title="Copy Previous Week" size="sm">
      <p className="text-sm text-gray-500 mb-4">
        Import data from last week into the current timesheet.
      </p>
      <div className="space-y-2.5">
        {([
          { v: 'all',   label: 'Copy entire week',   desc: 'Replicate both projects/tasks and their hours' },
          { v: 'tasks', label: 'Copy tasks only',    desc: 'Add the same rows but leave hours blank' },
          { v: 'hours', label: 'Copy hours only',    desc: 'Fill in matching rows with last week\'s hours' },
        ] as Array<{ v: CopyMode; label: string; desc: string }>).map(opt => (
          <label
            key={opt.v}
            className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
              mode === opt.v
                ? 'border-indigo-400 bg-indigo-50'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <input
              type="radio"
              name="copy-mode"
              value={opt.v}
              checked={mode === opt.v}
              onChange={() => setMode(opt.v)}
              className="mt-0.5 text-indigo-600 focus:ring-indigo-400"
            />
            <div>
              <p className="text-sm font-medium text-gray-800">{opt.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
            </div>
          </label>
        ))}
      </div>
      <ModalActions>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          onClick={() => onCopy(mode)}
          loading={loading}
          icon={<Copy size={14} />}
        >
          Copy
        </Button>
      </ModalActions>
    </Modal>
  );
};

// ─── Validation Summary ───────────────────────────────────────────────────────

interface ValidationSummaryProps {
  errors: string[];
  onDismiss: () => void;
}

const ValidationSummary = ({ errors, onDismiss }: ValidationSummaryProps) => {
  if (!errors.length) return null;
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-700 mb-1.5">
              {errors.length} issue{errors.length !== 1 ? 's' : ''} must be resolved before submitting
            </p>
            <ul className="space-y-0.5">
              {errors.map((e, i) => (
                <li key={i} className="text-xs text-red-600 flex items-start gap-1.5">
                  <span className="text-red-400 shrink-0 mt-px">•</span> {e}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <button onClick={onDismiss} className="text-red-400 hover:text-red-600 transition-colors shrink-0">
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

// ─── WeeklyTimesheetTab ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface WeeklyTimesheetTabProps {}

export const WeeklyTimesheetTab = (_: WeeklyTimesheetTabProps) => {
  const { user }     = useAuth();
  const toast        = useToast();
  const { confirm }  = useConfirm();

  // Fetch only projects the current user is a member of (enforced for all roles,
  // including TENANT_ADMIN who would otherwise see every project in the tenant).
  const { data: rawProjects = [] } = useMyProjects();
  const projects = rawProjects as Array<{ id: string; name: string }>;

  // ── Week state ────────────────────────────────────────────────────────────
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const weekDates  = useMemo(
    () => Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), 'yyyy-MM-dd')),
    [weekStart],
  );
  const weekStartStr = weekDates[0];
  const weekEndStr   = weekDates[6];
  const todayStr     = format(new Date(), 'yyyy-MM-dd');
  const weekNum      = format(weekStart, 'II');
  const canGoNext    = addDays(weekStart, 7) <= startOfWeek(new Date(), { weekStartsOn: 1 });

  // ── Row state ─────────────────────────────────────────────────────────────
  const [rows, setRows]               = useState<TimesheetRow[]>([]);
  const [saveStatus, setSaveStatus]   = useState<SaveStatus>('idle');
  const [lastSaved, setLastSaved]     = useState<Date | null>(null);
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);
  const [showCopy, setShowCopy]       = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Fetch this week's entries ─────────────────────────────────────────────
  const queryParams = useMemo(() => {
    const p: Record<string, string> = { date_from: weekStartStr, date_to: weekEndStr };
    if (user?.id) p.user_id = String(user.id);
    return p;
  }, [weekStartStr, weekEndStr, user?.id]);

  const { data: entriesResult, isLoading, refetch } = useTimeEntries(queryParams);

  // Rebuild rows from server data when entries change
  useEffect(() => {
    const entries = ((entriesResult as any)?.data ?? []) as Array<Record<string, any>>;
    const rowMap  = new Map<string, TimesheetRow>();

    for (const e of entries) {
      const projId  = e.projectId  ?? e.project_id  ?? '';
      const taskId  = e.taskId     ?? e.task_id      ?? '';
      const key     = `${projId}::${taskId}`;
      if (!rowMap.has(key)) {
        rowMap.set(key, {
          id:            key,
          projectId:     projId,
          projectName:   e.projectName ?? e.project_name ?? '',
          taskId,
          taskName:      e.taskName    ?? e.task_name    ?? '',
          isBillable:    (e.isBillable ?? e.is_billable) === true || (e.isBillable ?? e.is_billable) === 'true',
          notes:         e.description ?? e.notes ?? '',
          hours:         {},
          serverEntryIds: {},
          isDirty:       false,
        });
      }
      const row = rowMap.get(key)!;
      const h   = parseFloat(String(e.hours)) || 0;
      const d   = ((e.date ?? e.entry_date ?? '') as string).split('T')[0];
      if (h > 0 && d) {
        row.hours[d]           = h % 1 === 0 ? String(h) : String(h);
        row.serverEntryIds[d]  = String(e.id ?? e.ROWID ?? '');
      }
    }

    setRows(prev => {
      const serverRows = Array.from(rowMap.values()).map(sr => {
        const dirty = prev.find(p => p.id === sr.id && p.isDirty);
        return dirty ?? sr;
      });
      const newDirty = prev.filter(p => p.id.startsWith('row-') && p.isDirty);
      return [...serverRows, ...newDirty];
    });
  }, [entriesResult]);

  // Clear unsaved new rows when navigating weeks
  const prevWeekRef = useRef(weekStartStr);
  useEffect(() => {
    if (prevWeekRef.current !== weekStartStr) {
      prevWeekRef.current = weekStartStr;
      setRows(prev => prev.filter(r => !r.id.startsWith('row-')));
      setSubmitErrors([]);
    }
  }, [weekStartStr]);

  // ── Derived validation ────────────────────────────────────────────────────
  const dupes = useMemo(() => duplicateRowIds(rows), [rows]);

  const cellErrors = useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    for (const row of rows) {
      map[row.id] = {};
      for (const date of weekDates) {
        const val = row.hours[date];
        if (!val) continue;
        const { error } = parseHour(val);
        if (error) map[row.id][date] = error;
      }
    }
    return map;
  }, [rows, weekDates]);

  const dayColTotals = useMemo(
    () => weekDates.map(d => colHours(rows, d)),
    [rows, weekDates],
  );

  const dayErrors = useMemo(
    () => weekDates.map(d => colHours(rows, d) > 24),
    [rows, weekDates],
  );

  const grandTotal  = dayColTotals.reduce((s, v) => s + v, 0);
  const wkWarning   = grandTotal > 0 && grandTotal < 40
    ? 'Weekly hours are below 40h.'
    : grandTotal > 168
      ? 'Weekly hours exceed the 168h maximum.'
      : '';

  // ── Row handlers ──────────────────────────────────────────────────────────
  const updateRow = useCallback((id: string, patch: Partial<TimesheetRow>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }, []);

  const onCellChange = useCallback((rowId: string, date: string, val: string) => {
    setRows(prev => prev.map(r =>
      r.id === rowId ? { ...r, hours: { ...r.hours, [date]: val }, isDirty: true } : r
    ));
  }, []);

  const onCellBlur = useCallback((rowId: string, date: string, val: string) => {
    // Re-run cell error by triggering a state read — already handled by cellErrors memo
    setRows(prev => prev.map(r =>
      r.id === rowId ? { ...r, hours: { ...r.hours, [date]: val } } : r
    ));
  }, []);

  const addRow = useCallback(() => {
    setRows(prev => [...prev, mkRow()]);
  }, []);

  const deleteRow = useCallback(async (id: string) => {
    const row = rows.find(r => r.id === id);
    if (!row) return;
    const hasEntries = Object.keys(row.serverEntryIds).length > 0;

    if (hasEntries) {
      const ok = await confirm({
        title:       'Delete Row',
        message:     'This will permanently delete all saved time entries for this row.',
        confirmText: 'Delete',
        variant:     'danger',
      });
      if (!ok) return;
      try {
        for (const entryId of Object.values(row.serverEntryIds)) {
          await timeEntriesApi.remove(entryId);
        }
        refetch();
      } catch (e: any) {
        toast.error(e.message || 'Failed to delete entries');
        return;
      }
    }
    setRows(prev => prev.filter(r => r.id !== id));
  }, [rows, confirm, toast, refetch]);

  const duplicateRow = useCallback((id: string) => {
    const row = rows.find(r => r.id === id);
    if (!row) return;
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === id);
      const copy: TimesheetRow = {
        ...row,
        id:            `row-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        serverEntryIds: {},
        isDirty:       true,
      };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }, [rows]);

  // ── Save Draft ────────────────────────────────────────────────────────────
  const saveDraftRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const saveDraft = useCallback(async () => {
    const dirty = rows.filter(r => r.isDirty && r.projectId);
    if (!dirty.length) return;

    setSaveStatus('saving');
    try {
      for (const row of dirty) {
        const newIds: Record<string, string> = { ...row.serverEntryIds };

        for (const date of weekDates) {
          const { value: hours, error } = parseHour(row.hours[date] ?? '');
          if (error) continue; // skip invalid cells

          const existId = row.serverEntryIds[date];

          if (hours > 0 && !existId) {
            const created = await timeEntriesApi.create({
              project_id:  row.projectId,
              task_id:     row.taskId  || undefined,
              entry_date:  date,
              hours,
              is_billable: row.isBillable,
              description: row.notes   || '',
            }) as any;
            const newId = String(created?.ROWID ?? created?.id ?? '');
            if (newId) newIds[date] = newId;

          } else if (hours > 0 && existId) {
            await timeEntriesApi.update(existId, {
              hours,
              is_billable: row.isBillable,
              description: row.notes || '',
            });

          } else if (hours === 0 && existId) {
            await timeEntriesApi.remove(existId);
            delete newIds[date];
          }
        }

        setRows(prev => prev.map(r =>
          r.id === row.id ? { ...r, serverEntryIds: newIds, isDirty: false } : r
        ));
      }

      setSaveStatus('saved');
      setLastSaved(new Date());
      setTimeout(() => setSaveStatus('idle'), 4_000);
    } catch (e: any) {
      setSaveStatus('error');
      toast.error(e.message || 'Failed to save draft');
    }
  }, [rows, weekDates, toast]);

  // Always expose latest saveDraft to the auto-save interval
  useEffect(() => { saveDraftRef.current = saveDraft; }, [saveDraft]);

  // ── Auto-save every 30 s ──────────────────────────────────────────────────
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    const id = setInterval(() => {
      const hasDirty = rowsRef.current.some(r => r.isDirty && r.projectId);
      if (hasDirty) saveDraftRef.current?.();
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Full validation before submit ─────────────────────────────────────────
  const runFullValidation = useCallback((): string[] => {
    const errs: string[] = [];

    rows.forEach((row, i) => {
      const label = `Row ${i + 1}${row.projectName ? ` (${row.projectName})` : ''}`;
      if (!row.projectId) { errs.push(`${label}: Project is required.`); return; }

      for (const date of weekDates) {
        const val = row.hours[date];
        if (!val) continue;
        const { error } = parseHour(val);
        if (error) errs.push(`${label} — ${format(parseISO(date), 'EEE d')}: ${error}`);
      }

      const nr = notesRequired(row, weekDates);
      if (nr && !row.notes.trim())        errs.push(`${label}: Notes required for weekend/overtime entries.`);
      if (row.notes.trim().length > 0 && row.notes.trim().length < 10)
                                          errs.push(`${label}: Notes must be at least 10 characters.`);
      if (row.notes.length > 1000)        errs.push(`${label}: Notes cannot exceed 1000 characters.`);
    });

    weekDates.forEach(d => {
      const total = colHours(rows, d);
      if (total > 24)
        errs.push(`${format(parseISO(d), 'EEEE d MMM')}: Daily total (${total}h) exceeds 24 hours.`);
    });

    const dups = duplicateRowIds(rows);
    if (dups.size > 0)
      errs.push(`${dups.size / 2} duplicate project + task combination(s) detected.`);

    if (grandTotal > 168)
      errs.push(`Weekly total (${grandTotal}h) exceeds the 168h maximum.`);

    const hasHours = grandTotal > 0;
    if (!hasHours) errs.push('No hours entered. Add at least one time entry.');

    return errs;
  }, [rows, weekDates, grandTotal]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const errs = runFullValidation();
    if (errs.length) { setSubmitErrors(errs); return; }

    const ok = await confirm({
      title:       'Submit Timesheet',
      message:     `Submit ${grandTotal}h for Week ${weekNum}? This will send your entries for approval.`,
      confirmText: 'Submit',
      variant:     'info',
    });
    if (!ok) return;

    setIsSubmitting(true);
    const loadId = toast.loading('Saving and submitting timesheet…');
    try {
      await saveDraft();
      // Refresh to get latest server IDs after save
      const allEntryIds = rows.flatMap(r => Object.values(r.serverEntryIds));
      for (const id of allEntryIds) {
        if (id) await timeEntriesApi.submit(id);
      }
      toast.dismiss(loadId);
      toast.success(`Timesheet for Week ${weekNum} submitted for approval!`);
      refetch();
    } catch (e: any) {
      toast.dismiss(loadId);
      toast.error(e.message || 'Failed to submit timesheet');
    } finally {
      setIsSubmitting(false);
    }
  }, [runFullValidation, confirm, grandTotal, weekNum, saveDraft, rows, toast, refetch]);

  // ── Copy Previous Week ────────────────────────────────────────────────────
  const handleCopy = useCallback(async (mode: CopyMode) => {
    setCopyLoading(true);
    const prevStart = format(subDays(weekStart, 7), 'yyyy-MM-dd');
    const prevEnd   = format(subDays(weekStart, 1), 'yyyy-MM-dd');
    const prevParams: Record<string, string> = { date_from: prevStart, date_to: prevEnd };
    if (user?.id) prevParams.user_id = String(user.id);

    try {
      const res  = await timeEntriesApi.list(prevParams) as any;
      const prev = (Array.isArray(res) ? res : (res?.entries ?? res?.data ?? [])) as Array<Record<string, any>>;

      if (!prev.length) {
        toast.info('No entries found in the previous week.');
        setCopyLoading(false);
        setShowCopy(false);
        return;
      }

      // Group previous entries by project + task
      const prevMap = new Map<string, { projectId: string; projectName: string; taskId: string; taskName: string; hours: Record<string, string> }>();
      for (const e of prev) {
        const pId = e.project_id ?? e.projectId ?? '';
        const tId = e.task_id    ?? e.taskId    ?? '';
        const key = `${pId}::${tId}`;
        if (!prevMap.has(key)) {
          prevMap.set(key, {
            projectId:   pId,
            projectName: e.project_name ?? e.projectName ?? '',
            taskId:      tId,
            taskName:    e.task_name    ?? e.taskName    ?? '',
            hours:       {},
          });
        }
        const h = parseFloat(String(e.hours)) || 0;
        const d = ((e.entry_date ?? e.date ?? '') as string).split('T')[0];
        if (h > 0 && d) prevMap.get(key)!.hours[d] = String(h);
      }

      // Shift prev-week dates to current-week dates (same day-of-week offset)
      const dayOffset = 7;
      const shiftDate = (prevDate: string) => {
        try {
          const shifted = format(addDays(parseISO(prevDate), dayOffset), 'yyyy-MM-dd');
          return weekDates.includes(shifted) ? shifted : null;
        } catch { return null; }
      };

      const newRows: TimesheetRow[] = [];
      for (const p of Array.from(prevMap.values())) {
        const shiftedHours: Record<string, string> = {};
        if (mode !== 'tasks') {
          for (const [d, h] of Object.entries(p.hours)) {
            const shifted = shiftDate(d);
            if (shifted) shiftedHours[shifted] = h;
          }
        }
        newRows.push({
          ...mkRow(),
          projectId:   p.projectId,
          projectName: p.projectName,
          taskId:      p.taskId,
          taskName:    p.taskName,
          hours:       mode === 'hours' ? shiftedHours : (mode === 'all' ? shiftedHours : {}),
          isDirty:     true,
        });
      }

      setRows(prev => {
        // For 'hours' mode: try to match existing rows and fill in hours
        if (mode === 'hours') {
          return prev.map(row => {
            const match = newRows.find(
              nr => nr.projectId === row.projectId && nr.taskId === row.taskId
            );
            return match ? { ...row, hours: match.hours, isDirty: true } : row;
          });
        }
        // For 'tasks' or 'all': append new rows (skip if project+task already exists)
        const existing = new Set(prev.map(r => `${r.projectId}::${r.taskId}`));
        const toAdd    = newRows.filter(nr => !existing.has(`${nr.projectId}::${nr.taskId}`));
        return [...prev, ...toAdd];
      });

      toast.success(`Copied ${prevMap.size} row${prevMap.size !== 1 ? 's' : ''} from last week.`);
      setShowCopy(false);
    } catch (e: any) {
      toast.error(e.message || 'Failed to copy previous week');
    } finally {
      setCopyLoading(false);
    }
  }, [weekStart, weekDates, user?.id, toast]);

  // ── Save status label ─────────────────────────────────────────────────────
  const saveLabel = saveStatus === 'saving'
    ? 'Saving…'
    : saveStatus === 'saved' && lastSaved
      ? `Saved ${format(lastSaved, 'h:mm a')}`
      : saveStatus === 'error'
        ? 'Save failed'
        : rows.some(r => r.isDirty)
          ? 'Unsaved changes'
          : '';

  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">

      {/* ── Top bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Week navigation */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekStart(d => subDays(d, 7))}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            title="Previous week"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white min-w-[230px] text-center">
            <p className="text-sm font-semibold text-gray-900">
              {format(weekStart, 'dd MMM')} – {format(addDays(weekStart, 6), 'dd MMM yyyy')}
            </p>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest">Week {weekNum}</p>
          </div>
          <button
            onClick={() => setWeekStart(d => addDays(d, 7))}
            disabled={!canGoNext}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next week"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Status + Actions */}
        <div className="flex items-center gap-2.5">
          {/* Auto-save status */}
          {saveLabel && (
            <span className={`flex items-center gap-1.5 text-xs font-medium ${
              saveStatus === 'error'  ? 'text-red-500'    :
              saveStatus === 'saved'  ? 'text-green-600'  :
              saveStatus === 'saving' ? 'text-indigo-500' : 'text-amber-600'
            }`}>
              {saveStatus === 'saving' && <Loader2 size={11} className="animate-spin" />}
              {saveStatus === 'saved'  && <CheckCircle2 size={11} />}
              {saveLabel}
            </span>
          )}

          <button
            onClick={() => setShowCopy(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
            title="Copy from previous week"
          >
            <RotateCcw size={13} /> Copy Prev Week
          </button>

          <Button
            size="sm"
            variant="outline"
            icon={<Save size={14} />}
            loading={saveStatus === 'saving'}
            onClick={saveDraft}
          >
            Save Draft
          </Button>

          <Button
            size="sm"
            icon={<Send size={14} />}
            loading={isSubmitting}
            onClick={handleSubmit}
          >
            Submit
          </Button>
        </div>
      </div>

      {/* ── Warnings / submit errors ── */}
      {submitErrors.length > 0 && (
        <ValidationSummary errors={submitErrors} onDismiss={() => setSubmitErrors([])} />
      )}

      {wkWarning && (
        <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm ${
          grandTotal > 168
            ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-amber-50 border-amber-200 text-amber-700'
        }`}>
          <AlertTriangle size={14} className="shrink-0" />
          {wkWarning}
          <span className="ml-auto font-bold tabular-nums">{grandTotal.toFixed(grandTotal % 1 === 0 ? 0 : 2)}h</span>
        </div>
      )}

      {/* ── Main grid ── */}
      <Card padding={false} className="overflow-hidden shadow-sm">
        <div
          className="overflow-auto"
          style={{ maxHeight: 'calc(100vh - 340px)' }}
        >
          <table className="min-w-full border-collapse text-sm" style={{ minWidth: 1080 }}>

            {/* ── Sticky column header ── */}
            <thead className="sticky top-0 z-20">
              <tr className="bg-gray-50 border-b border-gray-200 shadow-sm">
                <th className="w-8 border-r border-gray-200 px-1.5 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide text-center">#</th>
                <th className="border-r border-gray-200 px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide min-w-[190px]">Project</th>
                <th className="border-r border-gray-200 px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide min-w-[160px]">Task / Issue</th>
                {weekDates.map((date, i) => {
                  const isToday   = date === todayStr;
                  const dayOver24 = dayErrors[i];
                  return (
                    <th
                      key={date}
                      className={`border-r border-gray-200 px-1 py-2 text-center w-[72px] ${
                        isToday   ? 'bg-blue-100'   :
                        dayOver24 ? 'bg-red-50'     : ''
                      }`}
                    >
                      <p className={`text-[11px] font-bold uppercase ${
                        isToday   ? 'text-blue-600' :
                        dayOver24 ? 'text-red-500'  : 'text-gray-500'
                      }`}>
                        {DAY_LABELS[i]}
                      </p>
                      <p className={`text-[10px] font-normal mt-0.5 ${
                        isToday ? 'text-blue-500' : 'text-gray-400'
                      }`}>
                        {format(parseISO(date), 'd')}
                      </p>
                      {dayOver24 && (
                        <p className="text-[9px] text-red-500 font-medium mt-px leading-tight">&gt;24h</p>
                      )}
                    </th>
                  );
                })}
                <th className="border-r border-gray-200 px-3 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-[80px]">Total</th>
                <th className="border-r border-gray-200 px-2 py-3 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-[60px]">Bill.</th>
                <th className="px-2 py-3 w-[96px]" />
              </tr>
            </thead>

            {/* ── Body ── */}
            <tbody className="divide-y divide-transparent">
              {isLoading ? (
                <tr>
                  <td colSpan={13} className="py-20 text-center">
                    <Loader2 size={28} className="animate-spin text-indigo-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-400">Loading timesheet…</p>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-20 text-center">
                    <Clock size={36} className="mx-auto mb-3 text-gray-200" />
                    <p className="text-sm font-semibold text-gray-400 mb-1">No entries for this week</p>
                    <p className="text-xs text-gray-300 mb-5">Add a row to start logging time, or copy from last week</p>
                    <div className="flex items-center justify-center gap-2.5">
                      <button
                        onClick={addRow}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
                      >
                        <Plus size={14} /> Add Row
                      </button>
                      <button
                        onClick={() => setShowCopy(true)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <RotateCcw size={14} /> Copy Prev Week
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row, ri) => (
                  <TimesheetRowComp
                    key={row.id}
                    row={row}
                    rowIndex={ri}
                    weekDates={weekDates}
                    todayStr={todayStr}
                    projects={projects}
                    isDuplicate={dupes.has(row.id)}
                    cellErrors={cellErrors[row.id] ?? {}}
                    total={rowHours(row, weekDates)}
                    notesReq={notesRequired(row, weekDates)}
                    onUpdate={updateRow}
                    onCellChange={onCellChange}
                    onCellBlur={onCellBlur}
                    onDelete={deleteRow}
                    onDuplicate={duplicateRow}
                  />
                ))
              )}
            </tbody>

            {/* ── Sticky footer totals ── */}
            {!isLoading && (
              <tfoot className="sticky bottom-0 z-20">
                <tr className="border-t-2 border-gray-200 bg-gray-50/95 backdrop-blur-sm">
                  <td className="border-r border-gray-200 px-1.5 py-3" />
                  <td className="border-r border-gray-200 px-3 py-2.5" colSpan={2}>
                    <button
                      onClick={addRow}
                      className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                    >
                      <Plus size={14} /> Add Row
                    </button>
                  </td>
                  {dayColTotals.map((total, i) => {
                    const isToday   = weekDates[i] === todayStr;
                    const over24    = dayErrors[i];
                    return (
                      <td key={i} className={`border-r border-gray-200 px-1 py-2.5 text-center ${
                        isToday ? 'bg-blue-50/60' : over24 ? 'bg-red-50' : ''
                      }`}>
                        <span className={`text-sm font-bold tabular-nums ${
                          over24    ? 'text-red-600'    :
                          total > 0 ? (isToday ? 'text-blue-700' : 'text-gray-800') : 'text-gray-300'
                        }`}>
                          {total > 0 ? (total % 1 === 0 ? total : total.toFixed(2)) : '—'}
                        </span>
                        {over24 && (
                          <p className="text-[9px] text-red-500 font-semibold mt-px">Exceeds 24h</p>
                        )}
                      </td>
                    );
                  })}
                  <td className="border-r border-gray-200 px-3 py-2.5 text-right">
                    <span className={`text-sm font-black tabular-nums ${
                      grandTotal > 168 ? 'text-red-600' :
                      grandTotal > 0   ? 'text-indigo-700' : 'text-gray-300'
                    }`}>
                      {grandTotal > 0
                        ? (grandTotal % 1 === 0 ? grandTotal : grandTotal.toFixed(2))
                        : '—'
                      }h
                    </span>
                  </td>
                  <td className="border-r border-gray-200" />
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* ── Info footer ── */}
      <div className="flex items-center gap-4 px-1 text-xs text-gray-400">
        <span className="flex items-center gap-1"><Info size={11} /> Tab to move between cells · Hours in 0.25 increments · Max 24h/day</span>
        <span className="ml-auto">Auto-saves every 30 seconds</span>
      </div>

      {/* ── Modals ── */}
      <CopyModal
        open={showCopy}
        onClose={() => setShowCopy(false)}
        onCopy={handleCopy}
        loading={copyLoading}
      />
    </div>
  );
};
