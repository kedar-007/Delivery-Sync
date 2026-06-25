// ── Working-day calculation ──────────────────────────────────────────────────
// Mirrors the weekend-policy + holiday logic used across attendance/leave
// (see LeavePage.tsx isWeekendOff / calcWorkingDays) so task durations exclude
// the same non-working days as the rest of the app. Keep in sync.

export type WeekendPolicy =
  | 'all_off' | 'all_on' | '1st_3rd_off' | '2nd_4th_off'
  | '2nd_4th_5th_off' | 'alternate_off' | '5th_sat_working';

export const DEFAULT_WEEKEND_POLICY: WeekendPolicy = 'all_off';

/** Which Nth Saturday (1–5) the given date is within its month. */
export const getNthSaturday = (year: number, month: number, date: number): number => {
  let count = 0;
  for (let d = 1; d <= date; d++) {
    if (new Date(year, month, d).getDay() === 6) count++;
  }
  return count;
};

/** True if the given day is a non-working day per the weekend policy. */
export const isWeekendOff = (
  dayOfWeek: number, year: number, month: number, date: number, policy: string,
): boolean => {
  if (policy === 'all_on') return false;
  if (dayOfWeek === 0) return true;        // Sunday always off (except all_on)
  if (dayOfWeek !== 6) return false;       // weekdays are working days
  // Saturday logic
  if (policy === 'all_off') return true;
  const nth = getNthSaturday(year, month, date);
  if (policy === '1st_3rd_off')     return nth === 1 || nth === 3;
  if (policy === '2nd_4th_off')     return nth === 2 || nth === 4;
  if (policy === '2nd_4th_5th_off') return nth === 2 || nth === 4 || nth === 5;
  if (policy === 'alternate_off')   return nth % 2 === 1;
  if (policy === '5th_sat_working') return nth !== 5;  // 5th Sat works; 1st–4th off
  return true;
};

const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * The list of working-day dates (YYYY-MM-DD) in [start, end] inclusive,
 * excluding weekends (per policy) and any dates in holidaySet. Returns [] if
 * the range is empty or inverted.
 */
export const workingDatesBetween = (
  start: string | null | undefined,
  end: string | null | undefined,
  policy: string = DEFAULT_WEEKEND_POLICY,
  holidaySet: Set<string> = new Set(),
): string[] => {
  if (!start || !end) return [];
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || s > e) return [];
  const out: string[] = [];
  const cur = new Date(s);
  // Hard cap to keep a pathological range from looping forever (10 years).
  let guard = 0;
  while (cur <= e && guard < 3660) {
    const ds = toISO(cur);
    if (!isWeekendOff(cur.getDay(), cur.getFullYear(), cur.getMonth(), cur.getDate(), policy) && !holidaySet.has(ds)) {
      out.push(ds);
    }
    cur.setDate(cur.getDate() + 1);
    guard++;
  }
  return out;
};

/** Short label for a working-day column, e.g. "Mon 1 Jul". */
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const formatDayLabel = (iso: string): { dow: string; date: string } => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { dow: '', date: iso };
  return { dow: WD[d.getDay()], date: `${d.getDate()} ${MO[d.getMonth()]}` };
};
