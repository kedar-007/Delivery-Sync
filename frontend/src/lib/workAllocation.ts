// ── Task Work Hour Distribution — pure logic ──────────────────────────────────
// Calculation + validation for allocating estimated effort across multiple
// assignees, à la Zoho Projects. Duration is driven by a start/end date range
// with non-working days excluded (the caller supplies the working-day list,
// computed from the company weekend policy + holidays via useWorkingDays).
//
//   STANDARD — each assignee works a fixed hrs/day on every working day:
//              total = workingDays × hoursPerDay
//   FLEXIBLE — each assignee logs day-wise hours (Mon 4, Tue 6, …):
//              total = sum of that assignee's per-day hours
//
// This module is framework-agnostic and unit-tested; the backend validator
// (functions/task_sprint_service/src/utils/workAllocation.js) mirrors it.

export type AllocationType = 'STANDARD' | 'FLEXIBLE';

export interface WorkAllocationEntry {
  userId: string;
  businessHoursLabel: string;
  /** STANDARD: hours worked each working day. */
  hoursPerDay: number;
  /** FLEXIBLE: 'YYYY-MM-DD' → hours for that day. */
  dayHours: Record<string, number>;
  /** Computed: number of working days this assignee contributes. */
  durationDays: number;
  /** Computed total hours for this assignee. */
  totalHours: number;
}

export interface WorkAllocation {
  type: AllocationType;
  startDate: string | null;
  endDate: string | null;
  /** Computed: number of working days in the range. */
  durationDays: number;
  /** Computed grand total hours (mirrored into estimated_hours on save). */
  totalHours: number;
  entries: WorkAllocationEntry[];
}

// ── Constants ─────────────────────────────────────────────────────────────────
export const DEFAULT_HOURS_PER_DAY = 8;
export const DEFAULT_BUSINESS_HOURS_LABEL = 'Standard Business Hours';
export const MAX_DURATION_DAYS = 3650;
export const MIN_HOURS_PER_DAY = 0;
export const MAX_HOURS_PER_DAY = 24;

// ── Numeric helpers ─────────────────────────────────────────────────────────────
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Non-negative, ≤2 decimal places. Empty string is a valid transient state. */
export const isValidNumericInput = (raw: string): boolean => {
  if (raw === '' || raw == null) return true;
  return /^\d+(\.\d{1,2})?$/.test(String(raw).trim());
};

/** Looser gate for a controlled input mid-edit (allows "1." and ""). */
export const isPartialNumericInput = (raw: string): boolean => {
  if (raw === '' || raw == null) return true;
  return /^\d*(\.\d{0,2})?$/.test(String(raw).trim());
};

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

// ── Factories ────────────────────────────────────────────────────────────────
export const emptyAllocation = (type: AllocationType = 'STANDARD'): WorkAllocation => ({
  type,
  startDate: null,
  endDate: null,
  durationDays: 0,
  totalHours: 0,
  entries: [],
});

export interface AssigneeDefaults {
  hoursPerDay?: number;
  businessHoursLabel?: string;
}

export const createEntry = (
  userId: string,
  defaults: AssigneeDefaults = {},
): WorkAllocationEntry => ({
  userId: String(userId),
  businessHoursLabel: defaults.businessHoursLabel ?? DEFAULT_BUSINESS_HOURS_LABEL,
  hoursPerDay: defaults.hoursPerDay ?? DEFAULT_HOURS_PER_DAY,
  dayHours: {},
  durationDays: 0,
  totalHours: 0,
});

// ── Calculation ────────────────────────────────────────────────────────────────
/**
 * Recompute derived fields for the given working-day list.
 * STANDARD: total = workingDays × hrs/day.
 * FLEXIBLE: total = Σ per-day hours (only days within workingDates count).
 */
export const recalc = (alloc: WorkAllocation, workingDates: string[] = []): WorkAllocation => {
  const durationDays = workingDates.length;
  if (alloc.type === 'FLEXIBLE') {
    const entries = alloc.entries.map((e) => {
      let total = 0;
      let days = 0;
      for (const d of workingDates) {
        const h = num(e.dayHours?.[d]);
        if (h > 0) { total += h; days++; }
      }
      return { ...e, totalHours: round2(total), durationDays: days };
    });
    return { ...alloc, durationDays, entries, totalHours: round2(entries.reduce((s, e) => s + e.totalHours, 0)) };
  }
  const entries = alloc.entries.map((e) => ({
    ...e,
    durationDays,
    totalHours: round2(durationDays * num(e.hoursPerDay)),
  }));
  return { ...alloc, durationDays, entries, totalHours: round2(entries.reduce((s, e) => s + e.totalHours, 0)) };
};

/**
 * Reconcile entries against the assignee selection and working-day list: drop
 * de-selected users, add new ones with per-user defaults, prefill FLEXIBLE
 * day-hours for newly-covered working days, drop stale (non-working) day keys,
 * then recompute.
 */
export const reconcileEntries = (
  alloc: WorkAllocation,
  assigneeIds: string[],
  getDefaults: (userId: string) => AssigneeDefaults = () => ({}),
  workingDates: string[] = [],
): WorkAllocation => {
  const ids = assigneeIds.map(String);
  const byId = new Map(alloc.entries.map((e) => [String(e.userId), e]));
  const workingSet = new Set(workingDates);

  const entries = ids.map((id) => {
    const defaults = getDefaults(id);
    const existing = byId.get(id) ?? createEntry(id, defaults);
    const perDay = defaults.hoursPerDay ?? existing.hoursPerDay ?? DEFAULT_HOURS_PER_DAY;
    if (alloc.type === 'FLEXIBLE') {
      const dayHours: Record<string, number> = {};
      for (const d of workingDates) {
        dayHours[d] = existing.dayHours?.[d] != null ? num(existing.dayHours[d]) : round2(perDay);
      }
      return { ...existing, dayHours };
    }
    // STANDARD: keep only working-day keys (harmless) and the hrs/day value.
    const dayHours: Record<string, number> = {};
    Object.keys(existing.dayHours ?? {}).forEach((d) => { if (workingSet.has(d)) dayHours[d] = num(existing.dayHours[d]); });
    return { ...existing, dayHours };
  });

  return recalc({ ...alloc, entries }, workingDates);
};

/**
 * Recover the working-day list implied by an already-computed allocation, so a
 * caller (e.g. form submit) can reconcile/serialize without re-fetching the
 * weekend policy. FLEXIBLE → the union of per-day keys; STANDARD → a list whose
 * length equals durationDays (only the count drives STANDARD totals).
 */
export const deriveWorkingDates = (alloc: WorkAllocation): string[] => {
  if (alloc.type === 'FLEXIBLE') {
    const set = new Set<string>();
    alloc.entries.forEach((e) => Object.keys(e.dayHours ?? {}).forEach((k) => set.add(k)));
    return Array.from(set).sort();
  }
  return Array.from({ length: Math.max(0, Math.round(num(alloc.durationDays))) }, (_, i) => `d${i}`);
};

// ── Summary ──────────────────────────────────────────────────────────────────
export const summarize = (alloc: WorkAllocation | null | undefined) => {
  if (!alloc || !alloc.entries?.length) return { assigneeCount: 0, totalHours: 0 };
  return { assigneeCount: alloc.entries.length, totalHours: round2(num(alloc.totalHours)) };
};

// ── Validation ───────────────────────────────────────────────────────────────
export const ERRORS = {
  noAssignee: 'Please assign at least one user.',
  duplicate: 'User already added.',
  hoursRange: 'Work hours per day must be between 0 and 24.',
  precision: 'Use a number with at most 2 decimal places.',
  dates: 'Select a valid start and end date.',
  noWorkingDays: 'The selected date range has no working days.',
  durationRange: `Duration must not exceed ${MAX_DURATION_DAYS} days.`,
  totalHours: 'Total task hours must be greater than 0.',
} as const;

const has2OrFewerDecimals = (n: number) => isValidNumericInput(String(n));

/** Validate an allocation against its working-day list. Empty array = valid. */
export const validateAllocation = (alloc: WorkAllocation, workingDates: string[] = []): string[] => {
  const errors: string[] = [];
  const entries = alloc?.entries ?? [];

  if (entries.length === 0) { errors.push(ERRORS.noAssignee); return errors; }

  const seen = new Set<string>();
  for (const e of entries) {
    const id = String(e.userId);
    if (seen.has(id)) { errors.push(ERRORS.duplicate); break; }
    seen.add(id);
  }

  if (!alloc.startDate || !alloc.endDate || new Date(alloc.startDate) > new Date(alloc.endDate)) {
    errors.push(ERRORS.dates);
  } else if (workingDates.length === 0) {
    errors.push(ERRORS.noWorkingDays);
  } else if (workingDates.length > MAX_DURATION_DAYS) {
    errors.push(ERRORS.durationRange);
  }

  if (alloc.type === 'STANDARD') {
    for (const e of entries) {
      const hpd = num(e.hoursPerDay);
      if (hpd < MIN_HOURS_PER_DAY || hpd > MAX_HOURS_PER_DAY) { errors.push(ERRORS.hoursRange); break; }
      if (!has2OrFewerDecimals(hpd)) { errors.push(ERRORS.precision); break; }
    }
  } else {
    let bad = false;
    for (const e of entries) {
      for (const d of workingDates) {
        const h = num(e.dayHours?.[d]);
        if (h < MIN_HOURS_PER_DAY || h > MAX_HOURS_PER_DAY) { errors.push(ERRORS.hoursRange); bad = true; break; }
        if (!has2OrFewerDecimals(h)) { errors.push(ERRORS.precision); bad = true; break; }
      }
      if (bad) break;
    }
    if (!bad && workingDates.length > 0 && num(alloc.totalHours) <= 0) errors.push(ERRORS.totalHours);
  }

  return errors;
};

export const isValidAllocation = (alloc: WorkAllocation, workingDates: string[] = []): boolean =>
  validateAllocation(alloc, workingDates).length === 0;

// ── (De)serialization ──────────────────────────────────────────────────────────
/**
 * Parse a stored JSON string (or object). Trusts the stored computed fields
 * (totals/durations) — recomputation requires the working-day list, which is
 * not available at read time. Returns null if absent/malformed.
 */
export const parseAllocation = (raw: unknown): WorkAllocation | null => {
  if (!raw) return null;
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!obj || !Array.isArray(obj.entries)) return null;
    const type: AllocationType = obj.type === 'FLEXIBLE' ? 'FLEXIBLE' : 'STANDARD';
    return {
      type,
      startDate: obj.startDate ?? null,
      endDate: obj.endDate ?? null,
      durationDays: num(obj.durationDays),
      totalHours: num(obj.totalHours),
      entries: obj.entries.map((e: Record<string, unknown>) => {
        const dayHoursRaw = (e.dayHours ?? {}) as Record<string, unknown>;
        const dayHours: Record<string, number> = {};
        Object.keys(dayHoursRaw).forEach((k) => { dayHours[k] = num(dayHoursRaw[k]); });
        return {
          userId: String(e.userId ?? ''),
          businessHoursLabel: String(e.businessHoursLabel ?? DEFAULT_BUSINESS_HOURS_LABEL),
          hoursPerDay: num(e.hoursPerDay),
          dayHours,
          durationDays: num(e.durationDays),
          totalHours: num(e.totalHours),
        };
      }),
    };
  } catch {
    return null;
  }
};

/** Serialize for persistence (recomputes derived fields against workingDates first). */
export const serializeAllocation = (alloc: WorkAllocation, workingDates: string[] = []): string =>
  JSON.stringify(recalc(alloc, workingDates));
