import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Download, FileText, File, Image, FileCode, FileSpreadsheet,
  Folder, AlertCircle, Clock, Eye, Lock, X, ZoomIn, ZoomOut,
  RotateCw, ChevronLeft, Shield, Plus, Check, Trash2, Edit2,
  Search, Globe, Users, LogIn,
} from 'lucide-react';
import { docsApi } from '../lib/api';

// ── helpers ───────────────────────────────────────────────────────────────────

const fmtSize = (kb: number) => {
  if (!kb || kb === 0) return '';
  if (kb < 1024) return `${Number(kb).toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};
const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const PROXY_BASE      = '/server/doc_service/api/docs/public';
const fileProxyUrl    = (t: string, id: string) => `${PROXY_BASE}/${t}/file/${id}`;
const fileDownloadUrl = (t: string, id: string) => `${PROXY_BASE}/${t}/file/${id}?download=1`;
const appendRowsUrl   = (t: string, id: string) => `${PROXY_BASE}/${t}/file/${id}/append-rows`;
const updateRowUrl    = (t: string, id: string) => `${PROXY_BASE}/${t}/file/${id}/update-row`;
const deleteRowUrl    = (t: string, id: string, ri: number) => `${PROXY_BASE}/${t}/file/${id}/delete-row?rowIndex=${ri}`;

const VIEWABLE_IMAGES = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
const VIEWABLE_PDFS   = ['pdf'];
const VIEWABLE_CSV    = ['csv'];
const VIEWABLE_TEXT   = ['txt', 'md', 'json', 'js', 'ts', 'html', 'css', 'xml', 'yaml', 'yml', 'log', 'py', 'sql'];

const fileIcon = (ext: string, size = 20) => {
  const e = ext.toLowerCase();
  if (VIEWABLE_IMAGES.includes(e))              return <Image size={size} />;
  if (VIEWABLE_PDFS.includes(e))                return <FileText size={size} />;
  if (['xls', 'xlsx', 'csv'].includes(e))       return <FileSpreadsheet size={size} />;
  if (['js','ts','tsx','jsx','html','css','json','py','sql'].includes(e)) return <FileCode size={size} />;
  return <File size={size} />;
};

const extColor = (ext: string) => {
  const e = ext.toLowerCase();
  if (VIEWABLE_IMAGES.includes(e))              return 'from-purple-500 to-pink-500';
  if (VIEWABLE_PDFS.includes(e))                return 'from-red-500 to-rose-600';
  if (['xls', 'xlsx', 'csv'].includes(e))       return 'from-green-500 to-emerald-600';
  if (['doc', 'docx'].includes(e))              return 'from-blue-500 to-blue-600';
  if (['js','ts','tsx','jsx','html','css'].includes(e)) return 'from-yellow-500 to-amber-500';
  return 'from-gray-400 to-gray-500';
};

// ── CSV parser ────────────────────────────────────────────────────────────────

const parseCSV = (raw: string): string[][] => {
  const rows: string[][] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cols: string[] = [];
    let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur); cur = ''; }
      else cur += ch;
    }
    cols.push(cur);
    rows.push(cols);
  }
  return rows;
};

// ── types ─────────────────────────────────────────────────────────────────────

interface ShareDoc {
  ROWID: string; name?: string; file_name: string; file_url: string;
  file_size_kb: string; file_extension: string; mime_type: string;
  current_version: string; CREATEDTIME: string;
}
interface ShareData {
  type: 'DOCUMENT' | 'FOLDER';
  accessLevel: 'VIEW' | 'DOWNLOAD' | 'EDIT';
  linkType: 'PUBLIC' | 'MEMBERS';
  document?: ShareDoc;
  folder?: { ROWID: string; name: string; CREATEDTIME: string };
  documents?: ShareDoc[];
}

// ── CSV Viewer + Editor ───────────────────────────────────────────────────────

const csvEscape = (v: string) =>
  v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;

const rebuildCsv = (allRows: string[][]): string =>
  allRows.map((r) => r.map((c) => csvEscape(String(c ?? ''))).join(',')).join('\n') + '\n';

const CsvViewer = ({ doc, shareToken, accessLevel, onClose }: {
  doc: ShareDoc; shareToken: string; accessLevel: 'VIEW' | 'DOWNLOAD' | 'EDIT'; onClose: () => void;
}) => {
  const [csvText, setCsvText]       = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [search, setSearch]         = useState('');
  const [toast, setToast]           = useState('');
  const [toastType, setToastType]   = useState<'ok' | 'err'>('ok');

  // add-row panel
  const [showAdd, setShowAdd]   = useState(false);
  const [newRow, setNewRow]     = useState<string[]>([]);
  const [addSaving, setAddSaving] = useState(false);

  // inline row editing
  const [editIdx, setEditIdx]     = useState<number | null>(null); // 0-based data row index
  const [editVals, setEditVals]   = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError]   = useState('');

  // delete confirmation
  const [deleteIdx, setDeleteIdx]   = useState<number | null>(null);
  const [deleting, setDeleting]     = useState(false);

  const canEdit     = accessLevel === 'EDIT';
  const canDownload = accessLevel === 'DOWNLOAD' || accessLevel === 'EDIT';

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast(msg); setToastType(type);
    setTimeout(() => setToast(''), 3000);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editIdx !== null) { setEditIdx(null); return; }
        if (deleteIdx !== null) { setDeleteIdx(null); return; }
        if (showAdd) { setShowAdd(false); return; }
        onClose();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, showAdd, editIdx, deleteIdx]);

  useEffect(() => {
    setLoading(true);
    fetch(fileProxyUrl(shareToken, String(doc.ROWID)))
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
      .then((t) => { setCsvText(t); setLoading(false); })
      .catch(() => { setFetchError('Could not load file.'); setLoading(false); });
  }, [doc.ROWID, shareToken]);

  const allRows = csvText ? parseCSV(csvText) : [];
  const headers = allRows[0] ?? [];
  const data    = allRows.slice(1);

  const lo = search.toLowerCase();
  const filteredWithIdx = lo
    ? data.map((row, i) => [row, i] as const).filter(([row]) => row.some((c) => c.toLowerCase().includes(lo)))
    : data.map((row, i) => [row, i] as const);

  useEffect(() => {
    if (headers.length > 0) setNewRow(Array(headers.length).fill(''));
  }, [headers.length]);

  // Clear edit state when search changes
  useEffect(() => { setEditIdx(null); setDeleteIdx(null); }, [search]);

  // ── add row ──
  const handleAddRow = useCallback(async () => {
    if (newRow.every((v) => !v.trim())) return;
    setAddSaving(true);
    try {
      const r = await fetch(appendRowsUrl(shareToken, String(doc.ROWID)), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [newRow] }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message || 'Save failed');
      setCsvText((prev) => {
        if (prev === null) return prev;
        const rows = parseCSV(prev);
        rows.push(newRow);
        return rebuildCsv(rows);
      });
      setNewRow(Array(headers.length).fill(''));
      setShowAdd(false);
      showToast('Row added!');
    } catch (e) { showToast((e as Error).message, 'err'); }
    finally { setAddSaving(false); }
  }, [newRow, shareToken, doc.ROWID, headers.length]);

  // ── update row ──
  const startEdit = (actualIdx: number, row: string[]) => {
    setEditIdx(actualIdx); setEditVals([...row]); setEditError('');
  };

  const handleUpdateRow = useCallback(async () => {
    if (editIdx === null) return;
    setEditSaving(true); setEditError('');
    try {
      const r = await fetch(updateRowUrl(shareToken, String(doc.ROWID)), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIndex: editIdx, values: editVals }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message || 'Update failed');
      setCsvText((prev) => {
        if (prev === null) return prev;
        const rows = parseCSV(prev);
        rows[editIdx + 1] = editVals; // +1 to skip header
        return rebuildCsv(rows);
      });
      setEditIdx(null);
      showToast('Row updated!');
    } catch (e) { setEditError((e as Error).message); }
    finally { setEditSaving(false); }
  }, [editIdx, editVals, shareToken, doc.ROWID]);

  // ── delete row ──
  const handleDeleteRow = useCallback(async () => {
    if (deleteIdx === null) return;
    setDeleting(true);
    try {
      const r = await fetch(deleteRowUrl(shareToken, String(doc.ROWID), deleteIdx), { method: 'DELETE' });
      const j = await r.json();
      if (!j.success) throw new Error(j.message || 'Delete failed');
      setCsvText((prev) => {
        if (prev === null) return prev;
        const rows = parseCSV(prev);
        rows.splice(deleteIdx + 1, 1); // +1 to skip header
        return rebuildCsv(rows);
      });
      setDeleteIdx(null);
      showToast('Row deleted!');
    } catch (e) { showToast((e as Error).message, 'err'); }
    finally { setDeleting(false); }
  }, [deleteIdx, shareToken, doc.ROWID]);

  const name = doc.name || doc.file_name;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-100 shrink-0 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors shrink-0">
            <ChevronLeft size={16} />
          </button>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 text-white flex items-center justify-center shrink-0">
            <FileSpreadsheet size={15} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">{name}</p>
            <p className="text-xs text-gray-400">{filteredWithIdx.length} rows · {headers.length} cols</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative hidden sm:block">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter rows…"
              className="text-xs border border-gray-200 rounded-lg pl-7 pr-3 py-1.5 w-40 focus:outline-none focus:border-blue-400 text-gray-700 placeholder-gray-400" />
          </div>
          {canEdit && (
            <button onClick={() => { setShowAdd((v) => !v); setEditIdx(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${showAdd ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}>
              <Plus size={13} /> Add Row
            </button>
          )}
          {canDownload && (
            <a href={fileDownloadUrl(shareToken, String(doc.ROWID))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold transition-colors">
              <Download size={13} /> Download
            </a>
          )}
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <X size={15} />
          </button>
        </div>
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div className={`px-5 py-2 text-xs font-medium flex items-center gap-2 shrink-0 ${toastType === 'ok' ? 'bg-green-50 text-green-700 border-b border-green-100' : 'bg-red-50 text-red-700 border-b border-red-100'}`}>
          {toastType === 'ok' ? <Check size={13} /> : <AlertCircle size={13} />}
          {toast}
        </div>
      )}

      {/* ── Add Row panel ── */}
      {showAdd && headers.length > 0 && (
        <div className="bg-blue-50 border-b border-blue-100 px-5 py-3 shrink-0">
          <p className="text-xs font-semibold text-blue-700 mb-2">New Row</p>
          <div className="flex items-end gap-2 flex-wrap">
            {headers.map((h, i) => (
              <div key={i} className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide truncate max-w-[140px]">{h || `Col ${i + 1}`}</label>
                <input value={newRow[i] ?? ''}
                  onChange={(e) => setNewRow((p) => { const n = [...p]; n[i] = e.target.value; return n; })}
                  placeholder={h || `Col ${i + 1}`}
                  className="text-xs border border-blue-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:border-blue-500 w-[140px] text-gray-800 placeholder-gray-400"
                />
              </div>
            ))}
            <div className="flex gap-2 pb-0.5">
              <button onClick={handleAddRow} disabled={addSaving || newRow.every((v) => !v.trim())}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors">
                {addSaving ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Check size={13} />}
                Save
              </button>
              <button onClick={() => setShowAdd(false)}
                className="px-3 py-1.5 rounded-lg bg-white border border-blue-200 text-blue-600 text-xs font-semibold hover:bg-blue-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm bar ── */}
      {deleteIdx !== null && (
        <div className="bg-red-50 border-b border-red-100 px-5 py-3 flex items-center gap-3 shrink-0">
          <AlertCircle size={14} className="text-red-500 shrink-0" />
          <p className="text-xs text-red-700 flex-1">Delete row {deleteIdx + 1}? This cannot be undone.</p>
          <button onClick={handleDeleteRow} disabled={deleting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors">
            {deleting ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Trash2 size={12} />}
            Delete
          </button>
          <button onClick={() => setDeleteIdx(null)} className="px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50 transition-colors">
            Cancel
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        )}
        {fetchError && (
          <div className="flex items-center justify-center h-full">
            <p className="text-red-500 text-sm">{fetchError}</p>
          </div>
        )}
        {!loading && !fetchError && (
          <table className="text-xs text-left border-collapse w-full" style={{ minWidth: `${(headers.length * 140) + (canEdit ? 80 : 0)}px` }}>
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="bg-gray-50 border-b border-r border-gray-200 px-3 py-2.5 text-gray-400 font-medium text-right select-none w-10">#</th>
                {headers.map((h, i) => (
                  <th key={i} className="bg-gray-50 border-b border-r border-gray-200 px-3 py-2.5 text-gray-700 font-semibold whitespace-nowrap">
                    {h.trim() || `Col ${i + 1}`}
                  </th>
                ))}
                {canEdit && <th className="bg-gray-50 border-b border-gray-200 px-3 py-2.5 w-20" />}
              </tr>
            </thead>
            <tbody>
              {filteredWithIdx.map(([row, actualIdx], ri) => {
                const isEditing = editIdx === actualIdx;
                const rowBg = isEditing
                  ? 'bg-blue-50'
                  : deleteIdx === actualIdx
                  ? 'bg-red-50'
                  : ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/50';

                return (
                  <tr key={actualIdx} className={`group ${rowBg} transition-colors`}>
                    {/* Row number */}
                    <td className="border-b border-r border-gray-100 px-3 py-2 text-gray-400 text-right select-none tabular-nums">
                      {actualIdx + 1}
                    </td>

                    {/* Data cells */}
                    {headers.map((_, ci) => (
                      <td key={ci} className="border-b border-r border-gray-100 px-2 py-1.5">
                        {isEditing ? (
                          <input
                            value={editVals[ci] ?? ''}
                            onChange={(e) => setEditVals((p) => { const n = [...p]; n[ci] = e.target.value; return n; })}
                            className="w-full text-xs px-2 py-1 border border-blue-300 rounded focus:outline-none focus:border-blue-500 bg-white text-gray-800"
                            style={{ minWidth: 80 }}
                          />
                        ) : (
                          <span className="block max-w-[220px] truncate text-gray-700" title={row[ci] ?? ''}>
                            {row[ci] ?? ''}
                          </span>
                        )}
                      </td>
                    ))}

                    {/* Action column (EDIT only) */}
                    {canEdit && (
                      <td className="border-b border-gray-100 px-2 py-1.5">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            {editError && <span className="text-red-500 text-[10px] mr-1 truncate max-w-[80px]" title={editError}>!</span>}
                            <button onClick={handleUpdateRow} disabled={editSaving}
                              title="Save"
                              className="p-1.5 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors">
                              {editSaving ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Check size={11} />}
                            </button>
                            <button onClick={() => setEditIdx(null)} title="Cancel"
                              className="p-1.5 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors">
                              <X size={11} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { startEdit(actualIdx, row); setDeleteIdx(null); setShowAdd(false); }}
                              title="Edit row"
                              className="p-1.5 rounded-md hover:bg-blue-100 text-blue-500 hover:text-blue-700 transition-colors">
                              <Edit2 size={11} />
                            </button>
                            <button onClick={() => { setDeleteIdx(actualIdx); setEditIdx(null); }}
                              title="Delete row"
                              className="p-1.5 rounded-md hover:bg-red-100 text-red-400 hover:text-red-600 transition-colors">
                              <Trash2 size={11} />
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {filteredWithIdx.length === 0 && (
                <tr>
                  <td colSpan={headers.length + (canEdit ? 2 : 1)} className="text-center text-gray-400 py-10">
                    {search ? `No rows match "${search}"` : 'No data rows'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ── text / code file viewer ───────────────────────────────────────────────────

const TextFileContent = ({ url }: { url: string }) => {
  const [text, setText]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const [wrap, setWrap]     = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
      .then((t) => { setText(t); setLoading(false); })
      .catch(() => { setError('Could not load file.'); setLoading(false); });
  }, [url]);

  const lines = text ? text.split('\n') : [];

  const handleCopy = () => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-2 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );
  if (error) return (
    <div className="flex items-center justify-center h-full">
      <p className="text-red-400 text-sm">{error}</p>
    </div>
  );

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <span className="text-xs text-gray-500 tabular-nums">{lines.length.toLocaleString()} lines</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setWrap((w) => !w)}
            className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${wrap ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
            Wrap
          </button>
          <button onClick={handleCopy}
            className="text-xs px-2.5 py-1 rounded-md bg-gray-800 text-gray-400 hover:text-white font-medium transition-colors min-w-[52px] text-center">
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-gray-950">
        <table className="border-collapse w-full" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="hover:bg-white/[0.03]">
                <td className="select-none text-right text-gray-600 px-3 py-[1px] text-xs w-12 border-r border-gray-800/60 tabular-nums align-top sticky left-0 bg-gray-950">
                  {i + 1}
                </td>
                <td className={`px-4 py-[1px] text-gray-200 text-xs align-top leading-5 ${wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'}`}>
                  {line || ' '}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── full-screen viewer (image / pdf / text / code) ────────────────────────────

const DocViewer = ({ doc, shareToken, accessLevel, onClose }: {
  doc: ShareDoc; shareToken: string; accessLevel: 'VIEW' | 'DOWNLOAD' | 'EDIT'; onClose: () => void;
}) => {
  const ext  = (doc.file_extension || doc.file_name?.split('.').pop() || '').toLowerCase().replace('.', '');
  const name = doc.name || doc.file_name;
  const proxyUrl = fileProxyUrl(shareToken, String(doc.ROWID));
  const [zoom, setZoom]     = useState(1);
  const [rotate, setRotate] = useState(0);
  const isImage = VIEWABLE_IMAGES.includes(ext);
  const isPdf   = VIEWABLE_PDFS.includes(ext);
  const isText  = VIEWABLE_TEXT.includes(ext);
  const canDownload = accessLevel !== 'VIEW';

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950">
      <div className="flex items-center justify-between px-5 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onClose}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors shrink-0">
            <ChevronLeft size={15} />
          </button>
          <div className={`p-1.5 rounded-lg bg-gradient-to-br ${extColor(ext)} text-white shrink-0`}>
            {fileIcon(ext, 14)}
          </div>
          <p className="text-sm font-semibold text-white truncate">{name}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isImage && (
            <>
              <button onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"><ZoomOut size={14} /></button>
              <span className="text-xs text-gray-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(4, z + 0.25))} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"><ZoomIn size={14} /></button>
              <button onClick={() => setRotate(r => (r + 90) % 360)} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"><RotateCw size={14} /></button>
              <div className="w-px h-5 bg-gray-700 mx-1" />
            </>
          )}
          {canDownload && (
            <a href={fileDownloadUrl(shareToken, String(doc.ROWID))}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors">
              <Download size={13} /> Download
            </a>
          )}
          <button onClick={onClose} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"><X size={15} /></button>
        </div>
      </div>

      {/* Content area — text/code fills full height; image/pdf centred */}
      <div className={`flex-1 min-h-0 ${isText ? 'overflow-hidden flex flex-col' : 'overflow-auto flex items-center justify-center p-4'}`}>
        {isImage && (
          <img src={proxyUrl} alt={name}
            style={{ transform: `scale(${zoom}) rotate(${rotate}deg)`, transformOrigin: 'center', transition: 'transform 0.2s' }}
            className="max-w-none shadow-2xl rounded-lg" />
        )}
        {isPdf && (
          <iframe src={proxyUrl} title={name}
            className="w-full h-full rounded-lg shadow-2xl bg-white"
            style={{ minHeight: 'calc(100vh - 72px)' }} />
        )}
        {isText && <TextFileContent url={proxyUrl} />}
        {!isImage && !isPdf && !isText && (
          <div className="text-center">
            <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${extColor(ext)} text-white flex items-center justify-center mx-auto mb-5 shadow-xl`}>
              {fileIcon(ext, 36)}
            </div>
            <p className="text-white font-semibold mb-2">{name}</p>
            <p className="text-gray-400 text-sm mb-6">This file type cannot be previewed.</p>
            {canDownload && (
              <a href={fileDownloadUrl(shareToken, String(doc.ROWID))}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors">
                <Download size={15} /> Download File
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ── status screens ────────────────────────────────────────────────────────────

type PageState = 'loading' | 'loaded' | 'expired' | 'revoked' | 'not_found' | 'error' | 'members_only';

const Navbar = () => (
  <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-2 shrink-0">
    <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
      <Shield size={14} className="text-white" />
    </div>
    <span className="text-sm font-bold text-gray-800">Delivery Sync</span>
  </div>
);

const Footer = () => (
  <div className="flex items-center justify-center gap-1.5 py-6">
    <div className="w-4 h-4 rounded bg-blue-600 flex items-center justify-center">
      <Shield size={9} className="text-white" />
    </div>
    <p className="text-xs text-gray-400">Shared securely via <span className="font-semibold text-gray-600">Delivery Sync</span></p>
  </div>
);

const AccessBadge = ({ level }: { level: 'VIEW' | 'DOWNLOAD' | 'EDIT' }) => {
  const cfg = {
    VIEW:     { icon: <Eye size={11} />,      label: 'View only',       cls: 'bg-blue-50 text-blue-700' },
    DOWNLOAD: { icon: <Download size={11} />, label: 'Download allowed', cls: 'bg-green-50 text-green-700' },
    EDIT:     { icon: <Edit2 size={11} />,    label: 'Can add records',  cls: 'bg-violet-50 text-violet-700' },
  }[level];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.cls}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
};

const LinkBadge = ({ type }: { type: 'PUBLIC' | 'MEMBERS' }) => (
  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${type === 'PUBLIC' ? 'bg-teal-50 text-teal-700' : 'bg-indigo-50 text-indigo-700'}`}>
    {type === 'PUBLIC' ? <Globe size={11} /> : <Users size={11} />}
    {type === 'PUBLIC' ? 'Public link' : 'Members only'}
  </span>
);

// ── main page ─────────────────────────────────────────────────────────────────

const PublicSharePage = () => {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [state, setState]       = useState<PageState>('loading');
  const [data, setData]         = useState<ShareData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [viewingDoc, setViewingDoc] = useState<ShareDoc | null>(null);

  useEffect(() => {
    if (!shareToken) { setState('not_found'); return; }

    const handleErr = (err: unknown, fallback?: string) => {
      const e = err as any;
      const code: string  = e?.code ?? '';
      const msg:  string  = e?.message ?? fallback ?? '';
      const status: number = e?.status ?? 0;
      if (code === 'MEMBERS_ONLY' || msg.toLowerCase().includes('members only')) setState('members_only');
      else if (msg.toLowerCase().includes('expired'))      setState('expired');
      else if (msg.toLowerCase().includes('revoked'))      setState('revoked');
      else if (status === 404 || msg.toLowerCase().includes('not found')) setState('not_found');
      else { setErrorMsg(msg); setState('error'); }
    };

    // Try without credentials first (works for PUBLIC links and avoids /auth/me).
    // If the backend returns MEMBERS_ONLY, retry with credentials — this handles
    // logged-in users visiting MEMBERS links without needing to check auth state.
    docsApi.publicAccess(shareToken)
      .then((res) => { setData(res as ShareData); setState('loaded'); })
      .catch((err: any) => {
        const code: string = err?.code ?? '';
        const msg:  string = err?.message ?? '';
        if (code === 'MEMBERS_ONLY' || msg.toLowerCase().includes('members only')) {
          docsApi.publicAccessAuthed(shareToken)
            .then((res) => { setData(res as ShareData); setState('loaded'); })
            .catch((err2) => handleErr(err2, msg));
        } else {
          handleErr(err);
        }
      });
  }, [shareToken]);

  const accessLevel = data?.accessLevel ?? 'VIEW';

  // CSV viewer / editor
  if (viewingDoc && shareToken) {
    const ext = (viewingDoc.file_extension || viewingDoc.file_name?.split('.').pop() || '').toLowerCase().replace('.', '');
    if (VIEWABLE_CSV.includes(ext)) {
      return <CsvViewer doc={viewingDoc} shareToken={shareToken} accessLevel={accessLevel} onClose={() => setViewingDoc(null)} />;
    }
    return <DocViewer doc={viewingDoc} shareToken={shareToken} accessLevel={accessLevel} onClose={() => setViewingDoc(null)} />;
  }

  // Status screens
  if (state !== 'loaded') {
    // Special screen for members-only links
    if (state === 'members_only') {
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
          <Navbar />
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 w-full max-w-sm overflow-hidden text-center">
              <div className="h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
              <div className="px-8 py-8">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center mx-auto mb-5 shadow-md">
                  <Users size={24} />
                </div>
                <h2 className="text-lg font-bold text-gray-900 mb-2">Members Only</h2>
                <p className="text-gray-500 text-sm leading-relaxed mb-6">
                  This link is restricted to app members. Please log in to access it.
                </p>
                <Link to="/login"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors shadow-sm">
                  <LogIn size={15} /> Log In to Continue
                </Link>
              </div>
              <div className="px-8 py-3.5 bg-gray-50 border-t border-gray-100 flex items-center justify-center gap-1.5">
                <div className="w-4 h-4 rounded bg-blue-600 flex items-center justify-center"><Shield size={9} className="text-white" /></div>
                <p className="text-xs text-gray-400">Shared securely via <span className="font-semibold text-gray-600">Delivery Sync</span></p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    type SK = Exclude<PageState, 'loaded' | 'members_only'>;
    const screens: Record<SK, { icon: React.ReactNode; title: string; sub: string }> = {
      loading:   { icon: <div className="w-10 h-10 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />, title: 'Loading…',            sub: 'Fetching shared content.' },
      expired:   { icon: <Clock size={36} className="text-amber-400" />,    title: 'Link Expired',          sub: 'This share link has passed its expiry date.' },
      revoked:   { icon: <Lock size={36} className="text-red-400" />,       title: 'Link Revoked',          sub: 'This share link has been deactivated.' },
      not_found: { icon: <AlertCircle size={36} className="text-gray-400" />, title: 'Link Not Found',      sub: "This share link doesn't exist or has been removed." },
      error:     { icon: <AlertCircle size={36} className="text-red-400" />, title: 'Something Went Wrong', sub: errorMsg || 'Unable to load the shared content.' },
    };
    const s = screens[state as SK];
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-xs">
            <div className="flex justify-center mb-5">{s.icon}</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">{s.title}</h2>
            <p className="text-gray-500 text-sm leading-relaxed">{s.sub}</p>
          </div>
        </div>
      </div>
    );
  }

  const canDownload = accessLevel === 'DOWNLOAD' || accessLevel === 'EDIT';

  // ── document share ──────────────────────────────────────────────────────────

  if (data?.type === 'DOCUMENT' && data.document) {
    const doc  = data.document;
    const ext  = (doc.file_extension || doc.file_name?.split('.').pop() || '').toLowerCase().replace('.', '');
    const name = doc.name || doc.file_name;
    const kb   = parseFloat(doc.file_size_kb || '0');
    const canPreview = VIEWABLE_IMAGES.includes(ext) || VIEWABLE_PDFS.includes(ext) || VIEWABLE_CSV.includes(ext) || VIEWABLE_TEXT.includes(ext);

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 w-full max-w-sm overflow-hidden">
            <div className={`h-1 bg-gradient-to-r ${extColor(ext)}`} />
            <div className="px-8 py-8 text-center border-b border-gray-100">
              <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${extColor(ext)} text-white flex items-center justify-center mx-auto mb-4 shadow-md`}>
                {fileIcon(ext, 28)}
              </div>
              <h1 className="text-base font-bold text-gray-900 break-all leading-snug">{name}</h1>
              <div className="flex items-center justify-center gap-2 mt-2 text-xs text-gray-400">
                <span className="uppercase font-semibold tracking-wide">{ext || 'FILE'}</span>
                {kb > 0 && <><span>·</span><span>{fmtSize(kb)}</span></>}
                {doc.CREATEDTIME && <><span>·</span><span>{fmtDate(doc.CREATEDTIME)}</span></>}
              </div>
            </div>
            <div className="px-8 py-6 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <AccessBadge level={accessLevel} />
                <LinkBadge type={data.linkType ?? 'PUBLIC'} />
              </div>
              {canPreview && (
                <button onClick={() => setViewingDoc(doc)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors shadow-sm">
                  {accessLevel === 'EDIT' && VIEWABLE_CSV.includes(ext) ? <><Edit2 size={14} /> View &amp; Edit</> : <><Eye size={14} /> Open &amp; View</>}
                </button>
              )}
              {canDownload && (
                <a href={fileDownloadUrl(shareToken!, String(doc.ROWID))}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors border ${canPreview ? 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50' : 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700 shadow-sm'}`}>
                  <Download size={14} /> Download
                </a>
              )}
              {!canPreview && !canDownload && (
                <p className="text-sm text-gray-400 text-center py-1">This file type cannot be previewed in the browser.</p>
              )}
            </div>
            <div className="px-8 py-3.5 bg-gray-50 border-t border-gray-100 flex items-center justify-center gap-1.5">
              <div className="w-4 h-4 rounded bg-blue-600 flex items-center justify-center"><Shield size={9} className="text-white" /></div>
              <p className="text-xs text-gray-400">Shared securely via <span className="font-semibold text-gray-600">Delivery Sync</span></p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── folder share ────────────────────────────────────────────────────────────

  const folder = data?.folder;
  const docs   = data?.documents ?? [];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 py-8 space-y-4">
        {/* Folder header */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-green-500 to-emerald-500" />
          <div className="px-6 py-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <Folder size={22} strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-gray-900 truncate">{folder?.name ?? 'Shared Folder'}</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {docs.length} {docs.length === 1 ? 'file' : 'files'}
                {folder?.CREATEDTIME && <span className="text-gray-400"> · Created {fmtDate(folder.CREATEDTIME)}</span>}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
              <AccessBadge level={accessLevel} />
              <LinkBadge type={data?.linkType ?? 'PUBLIC'} />
            </div>
          </div>
        </div>

        {/* Files */}
        {docs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
            <FileText size={28} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">This folder has no files.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-4 px-5 py-2.5 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              <div className="w-9 shrink-0" />
              <span className="flex-1">Name</span>
              <span className="hidden sm:block w-20 text-right">Size</span>
              <span className="hidden md:block w-28 text-right">Date</span>
              <span className="w-28 text-right">Action</span>
            </div>
            {docs.map((doc, idx) => {
              const ext  = (doc.file_extension || doc.file_name?.split('.').pop() || '').toLowerCase().replace('.', '');
              const name = doc.name || doc.file_name;
              const kb   = parseFloat(doc.file_size_kb || '0');
              const canPreview = VIEWABLE_IMAGES.includes(ext) || VIEWABLE_PDFS.includes(ext) || VIEWABLE_CSV.includes(ext) || VIEWABLE_TEXT.includes(ext);
              const isCsv = VIEWABLE_CSV.includes(ext);

              return (
                <div key={doc.ROWID}
                  className={`flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors ${idx !== docs.length - 1 ? 'border-b border-gray-100' : ''}`}>
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${extColor(ext)} text-white flex items-center justify-center shrink-0 shadow-sm`}>
                    {fileIcon(ext, 16)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
                    <p className="text-xs text-gray-400 uppercase mt-0.5">{ext || 'file'}</p>
                  </div>
                  <span className="hidden sm:block w-20 text-right text-xs text-gray-400 tabular-nums">{fmtSize(kb)}</span>
                  <span className="hidden md:block w-28 text-right text-xs text-gray-400">{fmtDate(doc.CREATEDTIME)}</span>
                  <div className="w-28 flex items-center justify-end gap-1.5 shrink-0">
                    {canPreview && (
                      <button onClick={() => setViewingDoc(doc)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${accessLevel === 'EDIT' && isCsv ? 'bg-violet-50 hover:bg-violet-100 text-violet-700' : 'bg-blue-50 hover:bg-blue-100 text-blue-700'}`}>
                        {accessLevel === 'EDIT' && isCsv ? <><Edit2 size={11} /> Edit</> : <><Eye size={11} /> View</>}
                      </button>
                    )}
                    {canDownload && (
                      <a href={fileDownloadUrl(shareToken!, String(doc.ROWID))} title="Download"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                        <Download size={13} />
                      </a>
                    )}
                    {!canPreview && !canDownload && <span className="text-xs text-gray-400">View only</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <Footer />
      </div>
    </div>
  );
};

export default PublicSharePage;
