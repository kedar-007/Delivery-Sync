import React, { useMemo, useState } from 'react';
import { Clock, Users } from 'lucide-react';
import TaskWorkAllocationModal, { AssigneeInfo } from './TaskWorkAllocationModal';
import {
  WorkAllocation,
  AssigneeDefaults,
  summarize,
  formatHoursMinutes,
} from '../../lib/workAllocation';

interface Props {
  assigneeIds: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  users: any[];
  value: WorkAllocation | null;
  onChange: (alloc: WorkAllocation) => void;
  getDefaults?: (userId: string) => AssigneeDefaults;
  /** Seed the modal's date range when no allocation exists yet (e.g. today → due date). */
  defaultStartDate?: string | null;
  defaultEndDate?: string | null;
  disabled?: boolean;
}

// Resolve assignee display info from a heterogeneous users array (some sources
// use `id`, others `ROWID`; name may fall back to email).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const resolveAssignees = (ids: string[], users: any[]): AssigneeInfo[] => {
  const byId = new Map<string, AssigneeInfo>();
  (users ?? []).forEach((u) => {
    const id = String(u?.id ?? u?.ROWID ?? '');
    if (!id) return;
    byId.set(id, { id, name: u?.name ?? u?.email ?? id, avatarUrl: u?.avatarUrl ?? u?.avatar_url });
  });
  return ids.map((id) => byId.get(String(id)) ?? { id: String(id), name: String(id) });
};

const WorkAllocationField = ({ assigneeIds, users, value, onChange, getDefaults, defaultStartDate, defaultEndDate, disabled }: Props) => {
  const [open, setOpen] = useState(false);
  const assignees = useMemo(() => resolveAssignees(assigneeIds, users), [assigneeIds, users]);
  const { assigneeCount, totalHours } = summarize(value);

  return (
    <div>
      <label className="form-label flex items-center gap-1.5">
        <Clock size={13} className="text-gray-400" /> Work Allocation
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={disabled || assigneeIds.length === 0}
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-ds-border text-sm text-ds-text hover:bg-ds-surface-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Users size={14} className="text-ds-text-muted" />
          Manage Work Allocation
        </button>
        {assigneeCount > 0 ? (
          <span className="text-xs text-ds-text-muted">
            {assigneeCount} {assigneeCount === 1 ? 'assignee' : 'assignees'} · {formatHoursMinutes(totalHours)}
          </span>
        ) : (
          <span className="text-xs text-ds-text-muted">
            {assigneeIds.length === 0 ? 'Add assignees to allocate hours' : 'Not allocated'}
          </span>
        )}
      </div>

      <TaskWorkAllocationModal
        open={open}
        onClose={() => setOpen(false)}
        assignees={assignees}
        value={value}
        getDefaults={getDefaults}
        defaultStartDate={defaultStartDate}
        defaultEndDate={defaultEndDate}
        onSave={onChange}
      />
    </div>
  );
};

export default WorkAllocationField;
