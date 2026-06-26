import {
  parseDelimited,
  mapHeaders,
  parseTaskRows,
  rowToPayload,
  buildTemplateCsv,
  BulkUser,
} from '../lib/bulkTasks';

const USERS: BulkUser[] = [
  { id: '1', name: 'Alice Smith', email: 'alice@acme.com' },
  { id: '2', name: 'Bob Jones', email: 'bob@acme.com' },
];

const HEADER = 'Title,Description,Type,Priority,Due Date,Story Points,Estimated Hours,Assignees,Labels';

describe('parseDelimited', () => {
  it('parses simple CSV', () => {
    const g = parseDelimited('a,b,c\n1,2,3');
    expect(g).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });
  it('honors quoted fields with commas and escaped quotes', () => {
    const g = parseDelimited('title,desc\n"Hello, world","She said ""hi"""');
    expect(g[1]).toEqual(['Hello, world', 'She said "hi"']);
  });
  it('handles embedded newlines inside quotes', () => {
    const g = parseDelimited('a,b\n"line1\nline2",x');
    expect(g[1]).toEqual(['line1\nline2', 'x']);
  });
  it('auto-detects tab delimiter (spreadsheet paste)', () => {
    const g = parseDelimited('a\tb\n1\t2');
    expect(g).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('returns [] for empty input', () => {
    expect(parseDelimited('   ')).toEqual([]);
  });
});

describe('mapHeaders', () => {
  it('maps synonyms case-insensitively', () => {
    const m = mapHeaders(['Summary', 'Owner', 'Tags', 'Due']);
    expect(m).not.toBeNull();
    expect(m!.title).toBe(0);
    expect(m!.assignees).toBe(1);
    expect(m!.labels).toBe(2);
    expect(m!.dueDate).toBe(3);
  });
  it('returns null without a title column', () => {
    expect(mapHeaders(['Foo', 'Bar'])).toBeNull();
  });
});

describe('parseTaskRows', () => {
  it('parses a valid row and resolves assignees by email', () => {
    const text = `${HEADER}\nBuild API,Do the thing,STORY,HIGH,2026-07-10,5,8,alice@acme.com; bob@acme.com,backend; urgent`;
    const { rows, headerError } = parseTaskRows(text, USERS);
    expect(headerError).toBeUndefined();
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.title).toBe('Build API');
    expect(r.type).toBe('STORY');
    expect(r.priority).toBe('HIGH');
    expect(r.dueDate).toBe('2026-07-10');
    expect(r.storyPoints).toBe(5);
    expect(r.estimatedHours).toBe(8);
    expect(r.labels).toEqual(['backend', 'urgent']);
    expect(r.assigneeIds).toEqual(['1', '2']);
    expect(r.errors).toEqual([]);
  });

  it('defaults unknown type/priority and flags unmatched assignees', () => {
    const text = `${HEADER}\nThing,,FOO,WHATEVER,,,,ghost@nope.com,`;
    const r = parseTaskRows(text, USERS).rows[0];
    expect(r.type).toBe('TASK');
    expect(r.priority).toBe('MEDIUM');
    expect(r.unmatchedAssignees).toEqual(['ghost@nope.com']);
    expect(r.errors).toEqual([]); // unmatched is a warning, not fatal
  });

  it('flags missing title and bad due date as errors', () => {
    const text = `${HEADER}\n,no title here,TASK,LOW,07/10/2026,,,,`;
    const r = parseTaskRows(text, USERS).rows[0];
    expect(r.errors).toContain('Title is required');
    expect(r.errors).toContain('Due date must be YYYY-MM-DD');
  });

  it('skips blank lines and reports a header error when no Title', () => {
    expect(parseTaskRows('Foo,Bar\n1,2', USERS).headerError).toMatch(/Title/);
    const text = `${HEADER}\nReal task,,,,,,,,\n\n  \n`;
    expect(parseTaskRows(text, USERS).rows).toHaveLength(1);
  });
});

describe('rowToPayload', () => {
  it('fills the fallback due date when blank and stringifies arrays', () => {
    const r = parseTaskRows(`${HEADER}\nT,,TASK,MEDIUM,,,,alice@acme.com,x; y`, USERS).rows[0];
    const p = rowToPayload(r, '2026-08-01');
    expect(p.due_date).toBe('2026-08-01');
    expect(p.assignee_ids).toBe('["1"]');
    expect(p.labels).toBe('["x","y"]');
  });
});

describe('buildTemplateCsv', () => {
  it('produces a header + sample row, round-trippable', () => {
    const csv = buildTemplateCsv();
    const grid = parseDelimited(csv);
    expect(grid).toHaveLength(2);
    expect(mapHeaders(grid[0])).not.toBeNull();
  });
});
