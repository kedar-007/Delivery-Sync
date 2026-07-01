// ── Bulk task import — pure parsing + validation ──────────────────────────────
// Parses pasted/CSV rows into task-create payloads for a sprint. No external
// parser dependency; handles quoted fields, embedded commas/newlines, and both
// comma (CSV) and tab (spreadsheet paste) delimiters. Framework-agnostic and
// unit-tested.

import { TASK_DESCRIPTION_MAX_LENGTH } from './taskLimits';

export type TaskType = 'TASK' | 'STORY' | 'BUG' | 'EPIC' | 'SUBTASK';
export type TaskPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface BulkUser { id: string; name?: string; email?: string }
export interface BulkStatus { key: string; label: string }

export interface ParsedTaskRow {
  rowNumber: number;            // 1-based, excludes header
  title: string;
  description: string;
  type: TaskType;
  priority: TaskPriority;
  dueDate: string;              // '' if not supplied (optional — no default injected)
  storyPoints: number | null;
  estimatedHours: number | null;
  labels: string[];
  assigneeIds: string[];
  unmatchedAssignees: string[]; // tokens that matched no user (warning, not fatal)
  status: string;               // resolved status key (falls back to the board default)
  statusLabel: string;          // human label for display
  unmatchedStatus?: string;     // raw value that matched no status (warning, not fatal)
  errors: string[];             // fatal — row excluded from import
}

export const TEMPLATE_HEADERS = [
  'Title', 'Description', 'Type', 'Priority', 'Due Date (YYYY-MM-DD, optional)',
  'Story Points', 'Estimated Hours', 'Assignees (emails, ; separated)', 'Labels (; separated)', 'Status',
];

export const TEMPLATE_SAMPLE_ROW = [
  'Set up CI pipeline', 'GitHub Actions for build + test', 'TASK', 'HIGH',
  '2026-07-10', '5', '8', 'alice@acme.com; bob@acme.com', 'devops; urgent', 'To Do',
];

const TYPES: TaskType[] = ['TASK', 'STORY', 'BUG', 'EPIC', 'SUBTASK'];
const PRIORITIES: TaskPriority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

// ── CSV / TSV parsing ──────────────────────────────────────────────────────────
/**
 * Parse delimited text into rows of cells. Auto-detects tab vs comma from the
 * first line (spreadsheet paste is tab-delimited). Honors double-quoted fields
 * with escaped quotes ("") and embedded delimiters/newlines.
 */
export const parseDelimited = (text: string): string[][] => {
  const src = String(text ?? '').replace(/\r\n?/g, '\n');
  if (src.trim() === '') return [];
  const firstLine = src.slice(0, src.indexOf('\n') === -1 ? src.length : src.indexOf('\n'));
  const delim = firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  // flush trailing field/row
  row.push(field);
  if (row.length > 1 || row[0].trim() !== '') rows.push(row);
  return rows;
};

// ── Header mapping ──────────────────────────────────────────────────────────────
// Map a flexible set of header labels onto our canonical fields.
type Field = 'title' | 'description' | 'type' | 'priority' | 'dueDate' | 'storyPoints' | 'estimatedHours' | 'assignees' | 'labels' | 'status';

const HEADER_SYNONYMS: Record<Field, string[]> = {
  title: ['title', 'task', 'name', 'summary'],
  description: ['description', 'desc', 'details'],
  type: ['type', 'task type', 'issue type'],
  priority: ['priority'],
  dueDate: ['due date', 'due', 'duedate', 'due date (yyyy-mm-dd)', 'due date (yyyy-mm-dd, optional)', 'deadline'],
  storyPoints: ['story points', 'points', 'storypoints', 'sp'],
  estimatedHours: ['estimated hours', 'est hours', 'est. hours', 'estimate', 'hours'],
  assignees: ['assignees', 'assignee', 'assigned to', 'owner', 'owners', 'assignees (emails, ; separated)'],
  labels: ['labels', 'label', 'tags', 'labels (; separated)'],
  status: ['status', 'state', 'column', 'stage'],
};

const norm = (s: string) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Build field→columnIndex map from a header row. Returns null if no Title column. */
export const mapHeaders = (header: string[]): Record<Field, number> | null => {
  const idx: Partial<Record<Field, number>> = {};
  header.forEach((h, i) => {
    const n = norm(h);
    (Object.keys(HEADER_SYNONYMS) as Field[]).forEach((f) => {
      if (idx[f] === undefined && HEADER_SYNONYMS[f].includes(n)) idx[f] = i;
    });
  });
  if (idx.title === undefined) return null;
  return idx as Record<Field, number>;
};

// ── Value coercion ───────────────────────────────────────────────────────────────
const coerceType = (v: string): TaskType => {
  const u = String(v ?? '').trim().toUpperCase();
  return (TYPES as string[]).includes(u) ? (u as TaskType) : 'TASK';
};
const coercePriority = (v: string): TaskPriority => {
  const u = String(v ?? '').trim().toUpperCase();
  return (PRIORITIES as string[]).includes(u) ? (u as TaskPriority) : 'MEDIUM';
};
const splitMulti = (v: string): string[] =>
  String(v ?? '').split(/[;|]/).map((s) => s.trim()).filter(Boolean);

const toNum = (v: string): number | null => {
  const s = String(v ?? '').trim();
  if (s === '') return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

const isISODate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '').trim());

// Loose status matching: ignore case, spaces, underscores and hyphens so
// "In Progress", "in_progress" and "IN-PROGRESS" all resolve to the same column.
const snorm = (s: string) => String(s ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');

const coerceStatus = (
  v: string,
  statuses: BulkStatus[],
  defaultKey: string,
): { key: string; label: string; unmatched?: string } => {
  const fallback = () => {
    const d = statuses.find((s) => s.key === defaultKey);
    return { key: defaultKey, label: d?.label ?? defaultKey };
  };
  const raw = String(v ?? '').trim();
  if (!raw) return fallback();
  const n = snorm(raw);
  const match = statuses.find((s) => snorm(s.label) === n || snorm(s.key) === n);
  if (match) return { key: match.key, label: match.label };
  return { ...fallback(), unmatched: raw };
};

// ── Row → ParsedTaskRow ─────────────────────────────────────────────────────────
const resolveAssignees = (tokens: string[], users: BulkUser[]) => {
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string>();
  users.forEach((u) => {
    if (u.email) byEmail.set(u.email.toLowerCase(), String(u.id));
    if (u.name) byName.set(u.name.toLowerCase(), String(u.id));
  });
  const ids: string[] = [];
  const unmatched: string[] = [];
  tokens.forEach((t) => {
    const id = byEmail.get(t.toLowerCase()) ?? byName.get(t.toLowerCase());
    if (id) { if (!ids.includes(id)) ids.push(id); }
    else unmatched.push(t);
  });
  return { ids, unmatched };
};

/**
 * Parse delimited text into validated task rows. `users` resolves assignee
 * emails/names → ids. Rows with a fatal error are still returned (with `errors`)
 * so the UI can show why they'll be skipped.
 */
/** Raw (unvalidated) cell values for one task row — the editable grid's shape. */
export interface RawTaskCells {
  title: string;
  description: string;
  type: string;
  priority: string;
  dueDate: string;
  storyPoints: string;
  estimatedHours: string;
  assignees: string;
  labels: string;
  status: string;
}

export const EMPTY_TASK_CELLS: RawTaskCells = {
  title: '', description: '', type: 'TASK', priority: 'MEDIUM', dueDate: '',
  storyPoints: '', estimatedHours: '', assignees: '', labels: '', status: '',
};

/** Validate + normalise one raw row. Used by both the CSV parser and the editable grid. */
export const validateRow = (
  c: RawTaskCells,
  rowNumber: number,
  users: BulkUser[],
  statuses: BulkStatus[] = [],
  defaultStatusKey = '',
): ParsedTaskRow => {
  const title = String(c.title ?? '').trim();
  const dueRaw = String(c.dueDate ?? '').trim();
  const description = String(c.description ?? '').trim();
  const { ids, unmatched } = resolveAssignees(splitMulti(c.assignees), users);
  const st = coerceStatus(c.status, statuses, defaultStatusKey);
  const errors: string[] = [];
  if (!title) errors.push('Title is required');
  if (dueRaw && !isISODate(dueRaw)) errors.push('Due date must be YYYY-MM-DD');
  if (description.length > TASK_DESCRIPTION_MAX_LENGTH) errors.push(`Description exceeds ${TASK_DESCRIPTION_MAX_LENGTH} characters`);

  return {
    rowNumber,
    title,
    description,
    type: coerceType(c.type),
    priority: coercePriority(c.priority),
    dueDate: isISODate(dueRaw) ? dueRaw : '',
    storyPoints: toNum(c.storyPoints),
    estimatedHours: toNum(c.estimatedHours),
    labels: splitMulti(c.labels),
    assigneeIds: ids,
    unmatchedAssignees: unmatched,
    status: st.key,
    statusLabel: st.label,
    unmatchedStatus: st.unmatched,
    errors,
  };
};

/** Parse pasted/CSV text into raw editable cells (no validation, blanks skipped). */
export const parseTaskCells = (text: string): { cells: RawTaskCells[]; headerError?: string } => {
  const grid = parseDelimited(text);
  if (grid.length === 0) return { cells: [], headerError: 'Nothing to import.' };
  const map = mapHeaders(grid[0]);
  if (!map) return { cells: [], headerError: 'Could not find a "Title" column in the header row.' };

  const cells: RawTaskCells[] = [];
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    if (row.every((c) => String(c ?? '').trim() === '')) continue; // skip blank lines
    const get = (f: Field) => (map[f] !== undefined ? String(row[map[f]] ?? '').trim() : '');
    cells.push({
      title: get('title'),
      description: get('description'),
      type: get('type') || 'TASK',
      priority: get('priority') || 'MEDIUM',
      dueDate: get('dueDate'),
      storyPoints: get('storyPoints'),
      estimatedHours: get('estimatedHours'),
      assignees: get('assignees'),
      labels: get('labels'),
      status: get('status'),
    });
  }
  return { cells };
};

export const parseTaskRows = (
  text: string,
  users: BulkUser[],
  statuses: BulkStatus[] = [],
  defaultStatusKey = '',
): { rows: ParsedTaskRow[]; headerError?: string } => {
  const { cells, headerError } = parseTaskCells(text);
  if (headerError) return { rows: [], headerError };
  return { rows: cells.map((c, i) => validateRow(c, i + 1, users, statuses, defaultStatusKey)) };
};

/** Map a valid row → the create payload. Due date is optional — left blank when
 *  the CSV row doesn't supply one (no default is injected). Status is the row's
 *  resolved column key (falls back to the board default during parsing). */
export const rowToPayload = (row: ParsedTaskRow) => ({
  title: row.title,
  description: row.description,
  type: row.type,
  priority: row.priority,
  due_date: row.dueDate || '',
  story_points: row.storyPoints,
  estimated_hours: row.estimatedHours,
  labels: JSON.stringify(row.labels),
  assignee_ids: JSON.stringify(row.assigneeIds),
  status: row.status || '',
});

/**
 * Build CSV template text. When the sprint's statuses are supplied, the template
 * includes a Status column and one example row per status — so the downloaded
 * file shows every valid status value the user can choose from.
 */
export const buildTemplateCsv = (statuses: BulkStatus[] = []): string => {
  const esc = (c: string) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  const lines: string[] = [TEMPLATE_HEADERS.map(esc).join(',')];

  if (statuses.length === 0) {
    lines.push(TEMPLATE_SAMPLE_ROW.map(esc).join(','));
  } else {
    statuses.forEach((s, i) => {
      const row = i === 0
        ? ['Set up CI pipeline', 'GitHub Actions for build + test', 'TASK', 'HIGH', '2026-07-10', '5', '8', 'alice@acme.com', 'devops; urgent', s.label]
        : [`Example task ${i + 1}`, '', 'TASK', 'MEDIUM', '', '', '', '', '', s.label];
      lines.push(row.map(esc).join(','));
    });
  }
  return `${lines.join('\n')}\n`;
};
