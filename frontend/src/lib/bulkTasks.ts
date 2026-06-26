// ── Bulk task import — pure parsing + validation ──────────────────────────────
// Parses pasted/CSV rows into task-create payloads for a sprint. No external
// parser dependency; handles quoted fields, embedded commas/newlines, and both
// comma (CSV) and tab (spreadsheet paste) delimiters. Framework-agnostic and
// unit-tested.

export type TaskType = 'TASK' | 'STORY' | 'BUG' | 'EPIC' | 'SUBTASK';
export type TaskPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface BulkUser { id: string; name?: string; email?: string }

export interface ParsedTaskRow {
  rowNumber: number;            // 1-based, excludes header
  title: string;
  description: string;
  type: TaskType;
  priority: TaskPriority;
  dueDate: string;              // '' if not supplied (caller fills default)
  storyPoints: number | null;
  estimatedHours: number | null;
  labels: string[];
  assigneeIds: string[];
  unmatchedAssignees: string[]; // tokens that matched no user (warning, not fatal)
  errors: string[];             // fatal — row excluded from import
}

export const TEMPLATE_HEADERS = [
  'Title', 'Description', 'Type', 'Priority', 'Due Date (YYYY-MM-DD)',
  'Story Points', 'Estimated Hours', 'Assignees (emails, ; separated)', 'Labels (; separated)',
];

export const TEMPLATE_SAMPLE_ROW = [
  'Set up CI pipeline', 'GitHub Actions for build + test', 'TASK', 'HIGH',
  '2026-07-10', '5', '8', 'alice@acme.com; bob@acme.com', 'devops; urgent',
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
type Field = 'title' | 'description' | 'type' | 'priority' | 'dueDate' | 'storyPoints' | 'estimatedHours' | 'assignees' | 'labels';

const HEADER_SYNONYMS: Record<Field, string[]> = {
  title: ['title', 'task', 'name', 'summary'],
  description: ['description', 'desc', 'details'],
  type: ['type', 'task type', 'issue type'],
  priority: ['priority'],
  dueDate: ['due date', 'due', 'duedate', 'due date (yyyy-mm-dd)', 'deadline'],
  storyPoints: ['story points', 'points', 'storypoints', 'sp'],
  estimatedHours: ['estimated hours', 'est hours', 'est. hours', 'estimate', 'hours'],
  assignees: ['assignees', 'assignee', 'assigned to', 'owner', 'owners', 'assignees (emails, ; separated)'],
  labels: ['labels', 'label', 'tags', 'labels (; separated)'],
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
export const parseTaskRows = (text: string, users: BulkUser[]): { rows: ParsedTaskRow[]; headerError?: string } => {
  const grid = parseDelimited(text);
  if (grid.length === 0) return { rows: [], headerError: 'Nothing to import.' };

  const map = mapHeaders(grid[0]);
  if (!map) return { rows: [], headerError: 'Could not find a "Title" column in the header row.' };

  const rows: ParsedTaskRow[] = [];
  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r];
    if (cells.every((c) => String(c ?? '').trim() === '')) continue; // skip blank lines
    const get = (f: Field) => (map[f] !== undefined ? String(cells[map[f]] ?? '').trim() : '');

    const title = get('title');
    const dueRaw = get('dueDate');
    const { ids, unmatched } = resolveAssignees(splitMulti(get('assignees')), users);
    const errors: string[] = [];
    if (!title) errors.push('Title is required');
    if (dueRaw && !isISODate(dueRaw)) errors.push('Due date must be YYYY-MM-DD');

    rows.push({
      rowNumber: r,
      title,
      description: get('description'),
      type: coerceType(get('type')),
      priority: coercePriority(get('priority')),
      dueDate: isISODate(dueRaw) ? dueRaw : '',
      storyPoints: toNum(get('storyPoints')),
      estimatedHours: toNum(get('estimatedHours')),
      labels: splitMulti(get('labels')),
      assigneeIds: ids,
      unmatchedAssignees: unmatched,
      errors,
    });
  }
  return { rows };
};

/** Map a valid row → the create payload, filling a default due date when blank. */
export const rowToPayload = (row: ParsedTaskRow, fallbackDueDate: string) => ({
  title: row.title,
  description: row.description,
  type: row.type,
  priority: row.priority,
  due_date: row.dueDate || fallbackDueDate,
  story_points: row.storyPoints,
  estimated_hours: row.estimatedHours,
  labels: JSON.stringify(row.labels),
  assignee_ids: JSON.stringify(row.assigneeIds),
});

/** Build CSV template text (header + one sample row). */
export const buildTemplateCsv = (): string => {
  const esc = (c: string) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  return `${TEMPLATE_HEADERS.map(esc).join(',')}\n${TEMPLATE_SAMPLE_ROW.map(esc).join(',')}\n`;
};
