import { useMemo } from 'react';
import { useCalendarConfig, useCompanyCalendar } from './usePeople';
import {
  workingDatesBetween,
  DEFAULT_WEEKEND_POLICY,
  type WeekendPolicy,
} from '../lib/workingDays';

const yearOf = (iso: string | null | undefined): string =>
  iso && /^\d{4}/.test(iso) ? iso.slice(0, 4) : String(new Date().getFullYear());

/**
 * Resolves the company weekend policy (org default) + holiday calendar and
 * returns a helper that lists the working-day dates between two dates — so task
 * durations skip the same non-working days as attendance/leave.
 *
 * Holidays are fetched for the start and end years of the given range (covers
 * year-spanning tasks). Pass the current draft start/end so the right years are
 * loaded; defaults to the current year when omitted.
 */
export const useWorkingDays = (rangeStart?: string | null, rangeEnd?: string | null) => {
  const { data: calConfig } = useCalendarConfig();

  const startYear = yearOf(rangeStart);
  const endYear = yearOf(rangeEnd);

  const { data: startHolidays } = useCompanyCalendar({ year: startYear });
  const { data: endHolidays } = useCompanyCalendar({ year: endYear });

  const policy: WeekendPolicy =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((calConfig as any)?.weekendPolicy?.default as WeekendPolicy) ?? DEFAULT_WEEKEND_POLICY;

  const holidaySet = useMemo(() => {
    const s = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all: any[] = [
      ...(((startHolidays as unknown[]) ?? [])),
      ...((endYear !== startYear ? ((endHolidays as unknown[]) ?? []) : [])),
    ];
    all.forEach((h) => {
      if (h?.holiday_date && h.is_optional !== true && h.is_optional !== 'true') s.add(h.holiday_date);
    });
    return s;
  }, [startHolidays, endHolidays, startYear, endYear]);

  const getWorkingDates = useMemo(
    () => (start?: string | null, end?: string | null) =>
      workingDatesBetween(start, end, policy, holidaySet),
    [policy, holidaySet],
  );

  return { getWorkingDates, policy, holidaySet };
};
