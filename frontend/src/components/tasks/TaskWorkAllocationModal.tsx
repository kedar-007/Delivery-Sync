import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarDays } from 'lucide-react';
import Modal, { ModalActions } from '../ui/Modal';
import Button from '../ui/Button';
import UserAvatar from '../ui/UserAvatar';
import { useWorkingDays } from '../../hooks/useWorkingDays';
import { formatDayLabel } from '../../lib/workingDays';
import {
  WorkAllocation,
  AllocationType,
  AssigneeDefaults,
  emptyAllocation,
  reconcileEntries,
  recalc,
  validateAllocation,
  isPartialNumericInput,
  round2,
} from '../../lib/workAllocation';

export interface AssigneeInfo {
  id: string;
  name: string;
  avatarUrl?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  assignees: AssigneeInfo[];
  value: WorkAllocation | null;
  getDefaults?: (userId: string) => AssigneeDefaults;
  defaultStartDate?: string | null;
  defaultEndDate?: string | null;
  onSave: (alloc: WorkAllocation) => void;
}

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const TaskWorkAllocationModal = ({
  open, onClose, assignees, value, getDefaults, defaultStartDate, defaultEndDate, onSave,
}: Props) => {
  const [draft, setDraft] = useState<WorkAllocation>(() => emptyAllocation());

  const { getWorkingDates } = useWorkingDays(draft.startDate, draft.endDate);
  const workingDates = useMemo(
    () => getWorkingDates(draft.startDate, draft.endDate),
    [getWorkingDates, draft.startDate, draft.endDate],
  );

  // (Re)seed when the modal opens: dates from the existing value or the
  // supplied defaults (today → due date), entries from the assignee selection.
  useEffect(() => {
    if (!open) return;
    const base = value ?? {
      ...emptyAllocation('STANDARD'),
      startDate: defaultStartDate || todayISO(),
      endDate: defaultEndDate || defaultStartDate || todayISO(),
    };
    const seededDates = getWorkingDates(base.startDate, base.endDate);
    setDraft(reconcileEntries(base, assignees.map((a) => a.id), getDefaults, seededDates));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const nameFor = useMemo(() => {
    const m = new Map(assignees.map((a) => [a.id, a]));
    return (id: string) => m.get(id);
  }, [assignees]);

  const errors = useMemo(() => validateAllocation(draft, workingDates), [draft, workingDates]);
  const isFlexible = draft.type === 'FLEXIBLE';

  // Re-reconcile (and recompute) against the current dates whenever they change,
  // so the working-day count and per-day grid stay in sync.
  const applyDates = (next: Partial<Pick<WorkAllocation, 'startDate' | 'endDate'>>) => {
    setDraft((d) => {
      const merged = { ...d, ...next };
      const wd = getWorkingDates(merged.startDate, merged.endDate);
      return reconcileEntries(merged, merged.entries.map((e) => e.userId), getDefaults, wd);
    });
  };

  const setType = (type: AllocationType) => {
    if (type === draft.type) return;
    setDraft((d) => reconcileEntries({ ...d, type }, d.entries.map((e) => e.userId), getDefaults, workingDates));
  };

  const setHoursPerDay = (idx: number, raw: string) => {
    if (!isPartialNumericInput(raw)) return;
    setDraft((d) => recalc(
      { ...d, entries: d.entries.map((e, i) => (i === idx ? { ...e, hoursPerDay: raw === '' ? 0 : parseFloat(raw) } : e)) },
      workingDates,
    ));
  };

  const setDayHour = (idx: number, date: string, raw: string) => {
    if (!isPartialNumericInput(raw)) return;
    setDraft((d) => recalc(
      {
        ...d,
        entries: d.entries.map((e, i) =>
          i === idx ? { ...e, dayHours: { ...e.dayHours, [date]: raw === '' ? 0 : parseFloat(raw) } } : e),
      },
      workingDates,
    ));
  };

  const handleDone = () => {
    if (errors.length) return;
    onSave(recalc(draft, workingDates));
    onClose();
  };

  const cell = (n: number) => (n || n === 0 ? String(round2(n)) : '');

  return (
    <Modal open={open} onClose={onClose} title="Work Allocation" size="3xl" closeOnBackdropClick={false}>
      {/* Allocation type */}
      <div className="flex flex-wrap items-center gap-6 mb-4">
        {(['STANDARD', 'FLEXIBLE'] as AllocationType[]).map((t) => (
          <label key={t} className="inline-flex items-center gap-2 cursor-pointer text-sm">
            <input type="radio" name="allocationType" checked={draft.type === t} onChange={() => setType(t)} className="accent-blue-600" />
            <span className={draft.type === t ? 'font-semibold text-ds-text' : 'text-ds-text-muted'}>
              {t === 'STANDARD' ? 'Standard' : 'Flexible'}
            </span>
          </label>
        ))}
        <span className="text-xs text-ds-text-muted">
          {isFlexible
            ? 'Enter hours per working day for each assignee.'
            : 'Same hours every working day; total = working days × hrs/day.'}
        </span>
      </div>

      {/* Date range */}
      <div className="mb-3 flex flex-wrap items-end gap-4">
        <div>
          <label className="form-label mb-0.5">Start Date</label>
          <input type="date" className="form-input" value={draft.startDate ?? ''} onChange={(e) => applyDates({ startDate: e.target.value })} />
        </div>
        <div>
          <label className="form-label mb-0.5">End Date</label>
          <input type="date" className="form-input" value={draft.endDate ?? ''} min={draft.startDate ?? undefined} onChange={(e) => applyDates({ endDate: e.target.value })} />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-ds-text-muted pb-2.5">
          <CalendarDays size={13} />
          {workingDates.length > 0
            ? <span><b className="text-ds-text">{workingDates.length}</b> working day{workingDates.length === 1 ? '' : 's'} · weekends &amp; holidays excluded</span>
            : <span>No working days in range</span>}
        </div>
      </div>

      {/* Table / grid */}
      {draft.entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ds-border p-8 text-center text-sm text-ds-text-muted">
          No assignees selected. Add assignees to the task first.
        </div>
      ) : isFlexible ? (
        <div className="overflow-x-auto rounded-lg border border-ds-border">
          <table className="text-sm">
            <thead className="bg-ds-surface-hover text-ds-text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-semibold sticky left-0 bg-ds-surface-hover z-10 min-w-[160px]">Assignee</th>
                {workingDates.map((d) => {
                  const { dow, date } = formatDayLabel(d);
                  return (
                    <th key={d} className="px-2 py-2 text-center font-semibold whitespace-nowrap">
                      <div className="text-[10px] text-ds-text-muted">{dow}</div>
                      <div className="text-[11px]">{date}</div>
                    </th>
                  );
                })}
                <th className="px-3 py-2 text-right font-semibold sticky right-0 bg-ds-surface-hover">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-border">
              {draft.entries.map((e, idx) => {
                const info = nameFor(e.userId);
                return (
                  <tr key={e.userId}>
                    <td className="px-3 py-2 sticky left-0 bg-ds-surface z-10">
                      <div className="flex items-center gap-2 min-w-0">
                        <UserAvatar name={info?.name} avatarUrl={info?.avatarUrl} size="sm" />
                        <span className="truncate text-ds-text">{info?.name ?? e.userId}</span>
                      </div>
                    </td>
                    {workingDates.map((d) => (
                      <td key={d} className="px-1 py-1 text-center">
                        <input
                          className="form-input w-14 text-center px-1"
                          inputMode="decimal"
                          value={cell(e.dayHours?.[d])}
                          onChange={(ev) => setDayHour(idx, d, ev.target.value)}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-medium text-ds-text whitespace-nowrap sticky right-0 bg-ds-surface">{round2(e.totalHours)} hrs</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-ds-surface-hover">
                <td className="px-3 py-2 font-semibold text-ds-text sticky left-0 bg-ds-surface-hover" colSpan={workingDates.length + 1}>Grand Total</td>
                <td className="px-3 py-2 text-right font-bold text-ds-text whitespace-nowrap sticky right-0 bg-ds-surface-hover">{round2(draft.totalHours)} hrs</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ds-border">
          <table className="w-full text-sm">
            <thead className="bg-ds-surface-hover text-ds-text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Assignee</th>
                <th className="px-3 py-2 text-left font-semibold">Business Hours</th>
                <th className="px-3 py-2 text-left font-semibold">Work Hours / Day</th>
                <th className="px-3 py-2 text-right font-semibold">Working Days</th>
                <th className="px-3 py-2 text-right font-semibold">Total Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-border">
              {draft.entries.map((e, idx) => {
                const info = nameFor(e.userId);
                return (
                  <tr key={e.userId}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <UserAvatar name={info?.name} avatarUrl={info?.avatarUrl} size="sm" />
                        <span className="truncate text-ds-text">{info?.name ?? e.userId}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-ds-text-muted">{e.businessHoursLabel}</td>
                    <td className="px-3 py-2">
                      <input
                        className="form-input w-24"
                        inputMode="decimal"
                        value={cell(e.hoursPerDay)}
                        onChange={(ev) => setHoursPerDay(idx, ev.target.value)}
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-ds-text-muted">{workingDates.length} d</td>
                    <td className="px-3 py-2 text-right font-medium text-ds-text">{round2(e.totalHours)} hrs</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-ds-surface-hover">
                <td className="px-3 py-2 font-semibold text-ds-text" colSpan={4}>Grand Total</td>
                <td className="px-3 py-2 text-right font-bold text-ds-text">{round2(draft.totalHours)} hrs</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {errors.length > 0 && (
        <div className="mt-3 space-y-1">
          {errors.map((msg) => (
            <p key={msg} className="flex items-center gap-1.5 text-xs text-red-600">
              <AlertCircle size={13} /> {msg}
            </p>
          ))}
        </div>
      )}

      <ModalActions>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleDone} disabled={errors.length > 0}>Done</Button>
      </ModalActions>
    </Modal>
  );
};

export default TaskWorkAllocationModal;
