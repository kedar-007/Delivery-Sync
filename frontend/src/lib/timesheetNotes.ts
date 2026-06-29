// ── Weekly timesheet — per-day description rules ──────────────────────────────
// Pure logic for which days need / show a description box. Framework-agnostic
// and unit-tested; the WeeklyTimesheetTab imports these directly.

export interface NoteRow {
  hours: Record<string, string>;  // 'yyyy-MM-dd' → raw hours input
  notes: Record<string, string>;  // 'yyyy-MM-dd' → that day's description
}

export interface NoteDay { date: string; required: boolean; note: string }

const hrsOf = (row: NoteRow, date: string) => parseFloat(row.hours[date] ?? '') || 0;

// A single day needs an explanatory note when it's a weekend day with hours, or
// any day logging more than 8h (overtime). Evaluated per-day so each day owns
// its own description.
export function dayNoteRequired(hours: number, isWeekend: boolean): boolean {
  return hours > 0 && (isWeekend || hours > 8);
}

// Does any day in the row require a note? (weekday index 5 = Sat, 6 = Sun)
export function notesRequired(row: NoteRow, dates: string[]): boolean {
  return dates.some((d, i) => dayNoteRequired(hrsOf(row, d), i >= 5));
}

// The days that get a description box in the editor: EVERY day with hours (so a
// box appears for whichever day you log time on — not just weekend/overtime),
// plus any day that already has a note or requires one.
export function daysNeedingNote(row: NoteRow, dates: string[]): NoteDay[] {
  return dates
    .map((date, i) => ({
      date,
      required: dayNoteRequired(hrsOf(row, date), i >= 5),
      note: row.notes[date] ?? '',
      hrs: hrsOf(row, date),
    }))
    .filter((d) => d.required || d.note.trim() !== '' || d.hrs > 0)
    .map(({ date, required, note }) => ({ date, required, note }));
}

// A per-day note must be non-empty when required, and 10–1000 chars when present.
export function dayNoteError(note: string, required: boolean): string {
  const n = (note ?? '').trim();
  if (required && !n) return 'Note required for weekend/overtime hours.';
  if (n.length > 0 && n.length < 10) return 'Minimum 10 characters.';
  if ((note ?? '').length > 1000) return 'Maximum 1000 characters.';
  return '';
}
