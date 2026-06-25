'use strict';
// Server-side mirror of frontend/src/lib/workAllocation.ts validation + calc.
// Duration is driven by a start/end date range; the client supplies the
// per-day breakdown. The server can't recompute working days (that needs the
// weekend policy + holidays), so it trusts the client's durationDays / per-day
// keys but re-derives every total and re-checks the value ranges, so a crafted
// request can't inject bogus totals. Keep in sync with the frontend module.

const MAX_DURATION_DAYS = 3650;
const MAX_HOURS_PER_DAY = 24;

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v));
  return Number.isFinite(n) ? n : 0;
};
const has2OrFewerDecimals = (n) => /^\d+(\.\d{1,2})?$/.test(String(n));

const ERRORS = {
  noAssignee: 'Please assign at least one user.',
  duplicate: 'User already added.',
  hoursRange: 'Work hours per day must be between 0 and 24.',
  precision: 'Use a number with at most 2 decimal places.',
  dates: 'Select a valid start and end date.',
  noWorkingDays: 'The selected date range has no working days.',
  durationRange: `Duration must not exceed ${MAX_DURATION_DAYS} days.`,
  totalHours: 'Total task hours must be greater than 0.',
  malformed: 'work_allocations is malformed.',
};

/** Recompute totals from the stored per-day / hrs-per-day values (no policy needed). */
function recalc(alloc) {
  if (alloc.type === 'FLEXIBLE') {
    const keys = new Set();
    alloc.entries.forEach((e) => Object.keys(e.dayHours || {}).forEach((k) => keys.add(k)));
    const entries = alloc.entries.map((e) => {
      let total = 0; let days = 0;
      Object.keys(e.dayHours || {}).forEach((k) => {
        const h = num(e.dayHours[k]);
        if (h > 0) { total += h; days++; }
      });
      return { ...e, totalHours: round2(total), durationDays: days };
    });
    return { ...alloc, durationDays: keys.size, entries, totalHours: round2(entries.reduce((s, e) => s + e.totalHours, 0)) };
  }
  const duration = num(alloc.durationDays);
  const entries = alloc.entries.map((e) => ({
    ...e,
    durationDays: duration,
    totalHours: round2(duration * num(e.hoursPerDay)),
  }));
  return { ...alloc, durationDays: duration, entries, totalHours: round2(entries.reduce((s, e) => s + e.totalHours, 0)) };
}

function parseAllocation(raw) {
  if (!raw) return null;
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!obj || !Array.isArray(obj.entries)) return null;
    const alloc = {
      type: obj.type === 'FLEXIBLE' ? 'FLEXIBLE' : 'STANDARD',
      startDate: obj.startDate || null,
      endDate: obj.endDate || null,
      durationDays: num(obj.durationDays),
      totalHours: num(obj.totalHours),
      entries: obj.entries.map((e) => {
        const dayHoursRaw = e.dayHours || {};
        const dayHours = {};
        Object.keys(dayHoursRaw).forEach((k) => { dayHours[k] = num(dayHoursRaw[k]); });
        return {
          userId: String(e.userId == null ? '' : e.userId),
          businessHoursLabel: String(e.businessHoursLabel || 'Standard Business Hours'),
          hoursPerDay: num(e.hoursPerDay),
          dayHours,
          durationDays: num(e.durationDays),
          totalHours: num(e.totalHours),
        };
      }),
    };
    return recalc(alloc);
  } catch (_) {
    return null;
  }
}

function validateAllocation(alloc) {
  const errors = [];
  const entries = (alloc && alloc.entries) || [];
  if (entries.length === 0) { errors.push(ERRORS.noAssignee); return errors; }

  const seen = new Set();
  for (const e of entries) {
    const id = String(e.userId);
    if (seen.has(id)) { errors.push(ERRORS.duplicate); break; }
    seen.add(id);
  }

  if (!alloc.startDate || !alloc.endDate || new Date(alloc.startDate) > new Date(alloc.endDate)) {
    errors.push(ERRORS.dates);
  } else if (num(alloc.durationDays) <= 0) {
    errors.push(ERRORS.noWorkingDays);
  } else if (num(alloc.durationDays) > MAX_DURATION_DAYS) {
    errors.push(ERRORS.durationRange);
  }

  if (alloc.type === 'STANDARD') {
    for (const e of entries) {
      const hpd = num(e.hoursPerDay);
      if (hpd < 0 || hpd > MAX_HOURS_PER_DAY) { errors.push(ERRORS.hoursRange); break; }
      if (!has2OrFewerDecimals(hpd)) { errors.push(ERRORS.precision); break; }
    }
  } else {
    let bad = false;
    for (const e of entries) {
      for (const k of Object.keys(e.dayHours || {})) {
        const h = num(e.dayHours[k]);
        if (h < 0 || h > MAX_HOURS_PER_DAY) { errors.push(ERRORS.hoursRange); bad = true; break; }
        if (!has2OrFewerDecimals(h)) { errors.push(ERRORS.precision); bad = true; break; }
      }
      if (bad) break;
    }
    if (!bad && num(alloc.totalHours) <= 0) errors.push(ERRORS.totalHours);
  }

  return errors;
}

/**
 * Validate + normalise a raw work_allocations value from a request body.
 * Returns { error } or { value, totalHours }. null/undefined → { value: null }.
 */
function normaliseForStorage(raw) {
  if (raw === undefined || raw === null || raw === '') return { value: null };
  const alloc = parseAllocation(raw);
  if (!alloc) return { error: ERRORS.malformed };
  const errors = validateAllocation(alloc);
  if (errors.length) return { error: errors[0] };
  return { value: JSON.stringify(alloc), totalHours: round2(num(alloc.totalHours)) };
}

module.exports = { parseAllocation, validateAllocation, normaliseForStorage, recalc, round2, ERRORS };
