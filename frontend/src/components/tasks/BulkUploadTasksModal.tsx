import React, { useMemo, useRef, useState } from 'react';
import { Upload, Download, AlertCircle, CheckCircle2, FileText } from 'lucide-react';
import Modal, { ModalActions } from '../ui/Modal';
import Button from '../ui/Button';
import { useBulkCreateTasks } from '../../hooks/useTaskSprint';
import {
  parseTaskRows,
  rowToPayload,
  buildTemplateCsv,
  TEMPLATE_HEADERS,
  BulkUser,
  ParsedTaskRow,
} from '../../lib/bulkTasks';

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  sprintId: string | null;
  /** Default due date for rows that omit one (the sprint's end date). */
  fallbackDueDate: string;
  /** Status to create tasks in — the board's first column key (custom statuses). */
  defaultStatus: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  users: any[];
}

const TYPE_PILL: Record<string, string> = {
  TASK: 'bg-blue-100 text-blue-700', STORY: 'bg-purple-100 text-purple-700',
  BUG: 'bg-red-100 text-red-700', EPIC: 'bg-indigo-100 text-indigo-700', SUBTASK: 'bg-gray-100 text-gray-700',
};

const BulkUploadTasksModal = ({ open, onClose, projectId, sprintId, fallbackDueDate, defaultStatus, users }: Props) => {
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const bulkCreate = useBulkCreateTasks();

  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const effectiveDueDate = /^\d{4}-\d{2}-\d{2}$/.test(fallbackDueDate) ? fallbackDueDate : todayISO();

  const bulkUsers: BulkUser[] = useMemo(
    () => (users ?? []).map((u) => ({ id: String(u.id ?? u.ROWID ?? ''), name: u.name, email: u.email })),
    [users],
  );
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    bulkUsers.forEach((u) => m.set(u.id, u.name || u.email || u.id));
    return m;
  }, [bulkUsers]);

  const { rows, headerError } = useMemo(
    () => (text.trim() ? parseTaskRows(text, bulkUsers) : { rows: [] as ParsedTaskRow[], headerError: undefined }),
    [text, bulkUsers],
  );

  const validRows = rows.filter((r) => r.errors.length === 0);
  const errorRows = rows.filter((r) => r.errors.length > 0);

  const downloadTemplate = () => {
    const blob = new Blob([buildTemplateCsv()], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sprint-tasks-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ''));
    reader.readAsText(file);
    e.target.value = '';
  };

  const reset = () => { setText(''); };
  const close = () => { reset(); onClose(); };

  const handleImport = async () => {
    if (validRows.length === 0) return;
    await bulkCreate.mutateAsync({
      project_id: projectId,
      sprint_id: sprintId ?? 0,
      tasks: validRows.map((r) => ({ ...rowToPayload(r, effectiveDueDate), status: defaultStatus || 'TODO' })),
    });
    close();
  };

  return (
    <Modal open={open} onClose={close} title="Bulk Upload Tasks" size="3xl" closeOnBackdropClick={false}>
      <div className="space-y-4">
        {/* Instructions + template */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ds-border bg-ds-surface-hover px-4 py-3">
          <div className="text-xs text-ds-text-muted">
            Upload a CSV or paste rows (incl. straight from a spreadsheet). Required column: <b className="text-ds-text">Title</b>.
            Blank due dates default to the sprint end date. Assignees are matched by email.
          </div>
          <Button size="sm" variant="outline" icon={<Download size={14} />} onClick={downloadTemplate}>
            Download template
          </Button>
        </div>

        {/* Input */}
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={handleFile} />
          <Button size="sm" variant="secondary" icon={<Upload size={14} />} onClick={() => fileRef.current?.click()}>
            Choose CSV file
          </Button>
          {text && <Button size="sm" variant="ghost" onClick={reset}>Clear</Button>}
        </div>
        <textarea
          className="form-textarea w-full font-mono text-xs"
          rows={6}
          placeholder={`Paste rows here, e.g.\n${TEMPLATE_HEADERS.join(',')}\nSet up CI,Build pipeline,TASK,HIGH,2026-07-10,5,8,alice@acme.com,devops; urgent`}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        {/* Header error */}
        {headerError && (
          <p className="flex items-center gap-1.5 text-xs text-red-600"><AlertCircle size={13} /> {headerError}</p>
        )}

        {/* Preview */}
        {rows.length > 0 && (
          <>
            <div className="flex items-center gap-4 text-xs">
              <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 size={13} /> {validRows.length} ready</span>
              {errorRows.length > 0 && <span className="inline-flex items-center gap-1 text-red-600"><AlertCircle size={13} /> {errorRows.length} skipped</span>}
            </div>
            <div className="max-h-72 overflow-auto rounded-lg border border-ds-border">
              <table className="w-full text-xs">
                <thead className="bg-ds-surface-hover text-ds-text-muted sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-semibold w-8">#</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Title</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Type</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Priority</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Due</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Assignees</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Labels</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ds-border">
                  {rows.map((r) => (
                    <tr key={r.rowNumber} className={r.errors.length ? 'bg-red-50/60' : ''}>
                      <td className="px-2 py-1.5 text-ds-text-muted">{r.rowNumber}</td>
                      <td className="px-2 py-1.5 text-ds-text">
                        {r.title || <span className="italic text-red-500">—</span>}
                        {r.errors.length > 0 && (
                          <span className="ml-1.5 text-[10px] text-red-600">({r.errors.join('; ')})</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${TYPE_PILL[r.type] ?? ''}`}>{r.type}</span>
                      </td>
                      <td className="px-2 py-1.5 text-ds-text-muted">{r.priority}</td>
                      <td className="px-2 py-1.5 text-ds-text-muted">{r.dueDate || <span className="italic">sprint end</span>}</td>
                      <td className="px-2 py-1.5 text-ds-text-muted">
                        {r.assigneeIds.map((id) => nameById.get(id) ?? id).join(', ') || '—'}
                        {r.unmatchedAssignees.length > 0 && (
                          <span className="ml-1 text-[10px] text-amber-600">⚠ no match: {r.unmatchedAssignees.join(', ')}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-ds-text-muted">{r.labels.join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {rows.length === 0 && !headerError && (
          <div className="flex flex-col items-center gap-1 py-6 text-ds-text-muted">
            <FileText size={22} className="opacity-50" />
            <p className="text-xs">No rows yet — choose a file or paste above.</p>
          </div>
        )}
      </div>

      <ModalActions>
        <Button variant="secondary" onClick={close}>Cancel</Button>
        <Button
          variant="primary"
          onClick={handleImport}
          loading={bulkCreate.isPending}
          disabled={validRows.length === 0}
        >
          Import {validRows.length > 0 ? validRows.length : ''} task{validRows.length === 1 ? '' : 's'}
        </Button>
      </ModalActions>
    </Modal>
  );
};

export default BulkUploadTasksModal;
