import {
  emptyAllocation,
  createEntry,
  recalc,
  reconcileEntries,
  validateAllocation,
  isValidAllocation,
  isValidNumericInput,
  isPartialNumericInput,
  summarize,
  parseAllocation,
  serializeAllocation,
  ERRORS,
  WorkAllocation,
} from '../lib/workAllocation';
import { workingDatesBetween, isWeekendOff } from '../lib/workingDays';

const DAYS5 = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-06', '2026-07-07']; // skips a weekend

const standard = (rows: Array<{ userId: string; hoursPerDay: number }>, working = DAYS5): WorkAllocation =>
  recalc(
    {
      ...emptyAllocation('STANDARD'),
      startDate: '2026-07-01',
      endDate: '2026-07-07',
      entries: rows.map((r) => ({ ...createEntry(r.userId), hoursPerDay: r.hoursPerDay })),
    },
    working,
  );

const flexible = (rows: Array<{ userId: string; dayHours: Record<string, number> }>, working = DAYS5): WorkAllocation =>
  recalc(
    {
      ...emptyAllocation('FLEXIBLE'),
      startDate: '2026-07-01',
      endDate: '2026-07-07',
      entries: rows.map((r) => ({ ...createEntry(r.userId), dayHours: r.dayHours })),
    },
    working,
  );

describe('numeric input gates', () => {
  it('isValidNumericInput accepts allowed, rejects bad', () => {
    ['', '0', '0.5', '1.25', '8.5'].forEach((v) => expect(isValidNumericInput(v)).toBe(true));
    ['2.45353454', '-5', 'abc', '1.234'].forEach((v) => expect(isValidNumericInput(v)).toBe(false));
  });
  it('isPartialNumericInput allows mid-edit states', () => {
    ['', '1', '1.', '1.2', '0.5'].forEach((v) => expect(isPartialNumericInput(v)).toBe(true));
    ['1.234', '-1', 'x'].forEach((v) => expect(isPartialNumericInput(v)).toBe(false));
  });
});

describe('workingDatesBetween', () => {
  it('excludes Sat/Sun under all_off', () => {
    // 2026-07-01 is a Wed; range to Tue 07-07 → skip Sat 4th & Sun 5th = 5 working days
    const days = workingDatesBetween('2026-07-01', '2026-07-07', 'all_off');
    expect(days).toEqual(DAYS5);
  });
  it('honors a holiday set', () => {
    const days = workingDatesBetween('2026-07-01', '2026-07-07', 'all_off', new Set(['2026-07-02']));
    expect(days).not.toContain('2026-07-02');
    expect(days.length).toBe(4);
  });
  it('all_on keeps weekends; Sunday off otherwise', () => {
    expect(isWeekendOff(0, 2026, 6, 5, 'all_off')).toBe(true);  // Sunday
    expect(isWeekendOff(0, 2026, 6, 5, 'all_on')).toBe(false);
    expect(isWeekendOff(3, 2026, 6, 1, 'all_off')).toBe(false); // Wednesday
  });
  it('returns [] for inverted or missing range', () => {
    expect(workingDatesBetween('2026-07-07', '2026-07-01')).toEqual([]);
    expect(workingDatesBetween(null, '2026-07-07')).toEqual([]);
  });
});

describe('Standard: workingDays × hrs/day', () => {
  it('5 working days × 8 and × 2', () => {
    const a = standard([
      { userId: 'A', hoursPerDay: 8 },
      { userId: 'B', hoursPerDay: 2 },
    ]);
    expect(a.durationDays).toBe(5);
    expect(a.entries[0].totalHours).toBe(40);
    expect(a.entries[1].totalHours).toBe(10);
    expect(a.totalHours).toBe(50);
  });

  it('recalculates when the working-day list shrinks (a holiday is added)', () => {
    const base = standard([{ userId: 'A', hoursPerDay: 8 }]);
    const fewer = recalc(base, DAYS5.slice(0, 4)); // 4 working days
    expect(fewer.entries[0].totalHours).toBe(32);
  });
});

describe('Flexible: day-wise hours per assignee', () => {
  it('sums each assignee’s per-day hours, skipping non-working days', () => {
    const a = flexible([
      { userId: 'A', dayHours: { '2026-07-01': 4, '2026-07-02': 6, '2026-07-03': 8, '2026-07-06': 8, '2026-07-07': 4 } },
      { userId: 'B', dayHours: { '2026-07-01': 8, '2026-07-02': 8, '2026-07-06': 4, '2026-07-07': 4, '2026-07-04': 9 } }, // 07-04 is a weekend → ignored
    ]);
    expect(a.entries[0].totalHours).toBe(30);
    expect(a.entries[0].durationDays).toBe(5);
    expect(a.entries[1].totalHours).toBe(24); // weekend 07-04 excluded
    expect(a.entries[1].durationDays).toBe(4);
    expect(a.totalHours).toBe(54);
  });
});

describe('reconcileEntries', () => {
  it('adds/removes assignees and prefills flexible day-hours with defaults', () => {
    let a = emptyAllocation('FLEXIBLE');
    a = { ...a, startDate: '2026-07-01', endDate: '2026-07-07' };
    a = reconcileEntries(a, ['A'], () => ({ hoursPerDay: 6 }), DAYS5);
    expect(a.entries[0].dayHours['2026-07-01']).toBe(6);
    expect(a.entries[0].totalHours).toBe(30); // 6 × 5 days
    a = reconcileEntries(a, ['A', 'B'], () => ({ hoursPerDay: 8 }), DAYS5);
    expect(a.entries.map((e) => e.userId)).toEqual(['A', 'B']);
    a = reconcileEntries(a, ['B'], () => ({}), DAYS5);
    expect(a.entries.map((e) => e.userId)).toEqual(['B']);
  });

  it('preserves edited standard hrs/day for retained assignees', () => {
    let a = standard([{ userId: 'A', hoursPerDay: 3 }]);
    a = reconcileEntries(a, ['A', 'B'], () => ({}), DAYS5);
    expect(a.entries[0].hoursPerDay).toBe(3);
  });
});

describe('validateAllocation', () => {
  it('passes a clean standard allocation', () => {
    expect(validateAllocation(standard([{ userId: 'A', hoursPerDay: 8 }]), DAYS5)).toEqual([]);
  });
  it('requires at least one assignee', () => {
    expect(validateAllocation(emptyAllocation(), DAYS5)).toContain(ERRORS.noAssignee);
  });
  it('rejects duplicate users', () => {
    const a = standard([{ userId: 'A', hoursPerDay: 8 }, { userId: 'A', hoursPerDay: 8 }]);
    expect(validateAllocation(a, DAYS5)).toContain(ERRORS.duplicate);
  });
  it('rejects missing/inverted dates', () => {
    const a = { ...standard([{ userId: 'A', hoursPerDay: 8 }]), startDate: null };
    expect(validateAllocation(a, DAYS5)).toContain(ERRORS.dates);
  });
  it('flags a range with no working days', () => {
    const a = standard([{ userId: 'A', hoursPerDay: 8 }], []);
    expect(validateAllocation(a, [])).toContain(ERRORS.noWorkingDays);
  });
  it('rejects hrs/day outside 0–24 (standard)', () => {
    expect(validateAllocation(standard([{ userId: 'A', hoursPerDay: 25 }]), DAYS5)).toContain(ERRORS.hoursRange);
  });
  it('rejects a per-day value outside 0–24 (flexible)', () => {
    const a = flexible([{ userId: 'A', dayHours: { '2026-07-01': 30 } }]);
    expect(validateAllocation(a, DAYS5)).toContain(ERRORS.hoursRange);
  });
});

describe('summary + serialize round-trip', () => {
  it('summarizes count and total', () => {
    const a = standard([{ userId: 'A', hoursPerDay: 8 }, { userId: 'B', hoursPerDay: 2 }]);
    expect(summarize(a)).toEqual({ assigneeCount: 2, totalHours: 50 });
    expect(summarize(null)).toEqual({ assigneeCount: 0, totalHours: 0 });
  });
  it('serializes and parses back', () => {
    const a = standard([{ userId: 'A', hoursPerDay: 8 }]);
    const parsed = parseAllocation(serializeAllocation(a, DAYS5));
    expect(parsed).not.toBeNull();
    expect(parsed!.entries[0].totalHours).toBe(40);
    expect(parsed!.durationDays).toBe(5);
    expect(parsed!.type).toBe('STANDARD');
  });
  it('returns null for absent/malformed data', () => {
    expect(parseAllocation(null)).toBeNull();
    expect(parseAllocation('not json')).toBeNull();
    expect(parseAllocation('{"foo":1}')).toBeNull();
  });
  it('isValidAllocation reflects validation', () => {
    expect(isValidAllocation(standard([{ userId: 'A', hoursPerDay: 8 }]), DAYS5)).toBe(true);
  });
});
