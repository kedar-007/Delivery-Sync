import React from 'react';
import { Clock, CalendarDays } from 'lucide-react';
import UserAvatar from '../ui/UserAvatar';
import { WorkAllocation, round2 } from '../../lib/workAllocation';
import { formatDayLabel } from '../../lib/workingDays';
import { resolveAssignees } from './WorkAllocationField';

const fmtRange = (start: string | null, end: string | null): string => {
  if (!start || !end) return '';
  const s = formatDayLabel(start);
  const e = formatDayLabel(end);
  return `${s.date} → ${e.date}`;
};

interface Props {
  value: WorkAllocation | null;
  assigneeIds: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  users: any[];
  /** userId → logged hours (from time entries). Optional. */
  loggedByUser?: Record<string, number>;
}

/** Read-only allocated-vs-logged breakdown shown on the task detail view. */
const WorkAllocationDisplay = ({ value, assigneeIds, users, loggedByUser = {} }: Props) => {
  if (!value || !value.entries?.length) return null;

  const infoFor = (() => {
    const m = new Map(resolveAssignees(assigneeIds, users).map((a) => [a.id, a]));
    return (id: string) => m.get(id);
  })();

  const totals = value.entries.reduce(
    (acc, e) => {
      const logged = round2(loggedByUser[String(e.userId)] ?? 0);
      acc.allocated = round2(acc.allocated + e.totalHours);
      acc.logged = round2(acc.logged + logged);
      return acc;
    },
    { allocated: 0, logged: 0 },
  );

  return (
    <div className="rounded-xl border border-ds-border bg-ds-surface">
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-ds-border">
        <Clock size={13} className="text-ds-text-muted" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-ds-text-muted">Work Allocation</span>
        <span className="ml-auto text-[11px] text-ds-text-muted">
          {value.type === 'FLEXIBLE' ? 'Flexible' : 'Standard'}
        </span>
      </div>
      {(value.startDate && value.endDate) && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-ds-border text-[11px] text-ds-text-muted">
          <CalendarDays size={11} />
          {fmtRange(value.startDate, value.endDate)} · {value.durationDays} working day{value.durationDays === 1 ? '' : 's'}
        </div>
      )}
      <div className="divide-y divide-ds-border">
        {value.entries.map((e) => {
          const info = infoFor(e.userId);
          const logged = round2(loggedByUser[String(e.userId)] ?? 0);
          const remaining = round2(e.totalHours - logged);
          return (
            <div key={e.userId} className="flex items-center gap-3 px-4 py-2.5">
              <UserAvatar name={info?.name} avatarUrl={info?.avatarUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ds-text">{info?.name ?? e.userId}</p>
                <p className="text-[11px] text-ds-text-muted">
                  {value.type === 'FLEXIBLE'
                    ? `${round2(e.durationDays)} day${e.durationDays === 1 ? '' : 's'} scheduled`
                    : `${round2(e.hoursPerDay)} hrs/day · ${round2(e.durationDays)} day${e.durationDays === 1 ? '' : 's'}`}
                </p>
              </div>
              <div className="text-right text-xs">
                <p className="text-ds-text">
                  <span className="font-semibold">{round2(e.totalHours)}</span> hrs allocated
                </p>
                <p className="text-ds-text-muted">
                  {logged} logged · {remaining} remaining
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-ds-border bg-ds-surface-hover">
        <span className="text-xs font-semibold text-ds-text">Total</span>
        <span className="text-xs text-ds-text">
          <span className="font-bold">{totals.allocated}</span> hrs allocated
          {totals.logged > 0 && <span className="text-ds-text-muted"> · {totals.logged} logged</span>}
        </span>
      </div>
    </div>
  );
};

export default WorkAllocationDisplay;
