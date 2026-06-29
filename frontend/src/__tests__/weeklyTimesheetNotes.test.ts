import { dayNoteRequired, daysNeedingNote, notesRequired } from '../lib/timesheetNotes';

// Mon-first week: index 5 = Sat, 6 = Sun
const WEEK = ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10', '2026-07-11', '2026-07-12'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const row = (hours: Record<string, string>, notes: Record<string, string> = {}): any => ({
  id: 'r1', hours, notes,
});

describe('dayNoteRequired', () => {
  it('requires a note only for weekend or overtime days with hours', () => {
    expect(dayNoteRequired(4, false)).toBe(false);  // weekday, normal
    expect(dayNoteRequired(9, false)).toBe(true);   // weekday overtime
    expect(dayNoteRequired(4, true)).toBe(true);    // weekend
    expect(dayNoteRequired(0, true)).toBe(false);   // weekend, no hours
  });
});

describe('daysNeedingNote', () => {
  it('shows a description box for a WEEKDAY with hours (the reported bug)', () => {
    const days = daysNeedingNote(row({ '2026-07-06': '4' }), WEEK); // Monday 4h
    expect(days.map((d) => d.date)).toEqual(['2026-07-06']);
    expect(days[0].required).toBe(false); // optional, but the box still appears
  });

  it('shows a box for every day that has hours, not just Saturday', () => {
    const days = daysNeedingNote(
      row({ '2026-07-06': '4', '2026-07-08': '6', '2026-07-11': '5' }), // Mon, Wed, Sat
      WEEK,
    );
    expect(days.map((d) => d.date)).toEqual(['2026-07-06', '2026-07-08', '2026-07-11']);
    expect(days.find((d) => d.date === '2026-07-11')!.required).toBe(true); // Saturday required
  });

  it('includes a day that has a note even with no hours, and skips empty days', () => {
    const days = daysNeedingNote(row({ '2026-07-06': '4' }, { '2026-07-09': 'left early' }), WEEK);
    expect(days.map((d) => d.date).sort()).toEqual(['2026-07-06', '2026-07-09']);
  });

  it('returns nothing for an empty row', () => {
    expect(daysNeedingNote(row({}), WEEK)).toEqual([]);
  });
});

describe('notesRequired', () => {
  it('is true when any weekend/overtime day has hours', () => {
    expect(notesRequired(row({ '2026-07-11': '3' }), WEEK)).toBe(true);   // Saturday
    expect(notesRequired(row({ '2026-07-06': '4' }), WEEK)).toBe(false);  // weekday normal
  });
});
