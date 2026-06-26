import { useQuery } from '@tanstack/react-query';
import { profilesApi } from '../lib/api';
import {
  DEFAULT_HOURS_PER_DAY,
  DEFAULT_BUSINESS_HOURS_LABEL,
  type AssigneeDefaults,
} from '../lib/workAllocation';

export interface BusinessHours {
  hoursPerDay: number;
  label: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toBusinessHours = (p: any): BusinessHours => {
  const hpd = parseFloat(p?.work_hours_per_day);
  return {
    hoursPerDay: Number.isFinite(hpd) && hpd > 0 ? hpd : DEFAULT_HOURS_PER_DAY,
    label: p?.business_hours_label || DEFAULT_BUSINESS_HOURS_LABEL,
  };
};

/**
 * Fetches the tenant profile directory once (cached) and exposes a helper that
 * resolves each user's business-hours schedule, used to seed the default
 * hrs/day for an assignee row in the work-allocation modal. Falls back to the
 * standard 8 hrs/day when a user has no schedule configured.
 */
export const useBusinessHours = () => {
  const query = useQuery({
    queryKey: ['profiles', 'directory', 'business-hours'],
    queryFn: () => profilesApi.directory(),
    staleTime: 5 * 60_000,
  });

  const map = new Map<string, BusinessHours>();
  if (Array.isArray(query.data)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (query.data as any[]).forEach((p) => {
      const id = String(p?.user_id ?? p?.user?.ROWID ?? '');
      if (id) map.set(id, toBusinessHours(p));
    });
  }

  const getDefaults = (userId: string): AssigneeDefaults => {
    const bh = map.get(String(userId));
    return {
      hoursPerDay: bh?.hoursPerDay ?? DEFAULT_HOURS_PER_DAY,
      businessHoursLabel: bh?.label ?? DEFAULT_BUSINESS_HOURS_LABEL,
    };
  };

  return { getDefaults, businessHoursMap: map, isLoading: query.isLoading };
};
