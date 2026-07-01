import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Folder, FolderOpen, FileText, File, Image, FileCode, FileSpreadsheet,
  Upload, FolderPlus, ChevronRight, Home, MoreVertical, Edit2, Trash2,
  Share2, Copy, Check, Eye, Download, Clock, Search, Grid, List,
  Link2, X, Plus, ZoomIn, ZoomOut, RotateCw, Maximize2,
  Lock, Users, Globe, Sun, Moon, ArrowLeft, AlertCircle,
} from 'lucide-react';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Modal, { ModalActions } from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import Alert from '../components/ui/Alert';
import { PageSkeleton } from '../components/ui/Skeleton';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { hasPermission, PERMISSIONS } from '../utils/permissions';
import { useProject } from '../hooks/useProjects';
import {
  useDocFolderContents, useAllProjectDocuments, useProjectDocShares,
  useCreateDocFolder, useRenameDocFolder, useDeleteDocFolder,
  useUploadDocument, useDeleteDocument,
  useCreateDocShare, useRevokeDocShare,
  useProjectMembers, useTenantUsers, useUpdateFolderAccess,
} from '../hooks/useProjectDocs';
import type { ProjectDocFolder, ProjectDocument, ProjectDocShare, ProjectMember, TenantUser } from '../types';

// ── Tab type ──────────────────────────────────────────────────────────────────

type Tab = 'files' | 'all' | 'shares';

// ── File icon helper ──────────────────────────────────────────────────────────

const fileIcon = (ext: string, size = 20) => {
  const e = (ext || '').toLowerCase().replace('.', '');
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(e))
    return <Image size={size} />;
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'java', 'cs', 'php', 'html', 'css', 'json'].includes(e))
    return <FileCode size={size} />;
  if (['xls', 'xlsx', 'csv'].includes(e))
    return <FileSpreadsheet size={size} />;
  if (['pdf'].includes(e))
    return <FileText size={size} />;
  return <File size={size} />;
};

const extColor = (ext: string): string => {
  const e = (ext || '').toLowerCase().replace('.', '');
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(e)) return 'from-pink-500 to-rose-600';
  if (['pdf'].includes(e)) return 'from-red-500 to-red-700';
  if (['xls', 'xlsx', 'csv'].includes(e)) return 'from-green-500 to-emerald-600';
  if (['js', 'ts', 'tsx', 'jsx'].includes(e)) return 'from-yellow-400 to-amber-500';
  if (['py'].includes(e)) return 'from-blue-400 to-blue-600';
  if (['json'].includes(e)) return 'from-orange-400 to-orange-600';
  return 'from-slate-500 to-slate-700';
};

const folderGradients = [
  'from-blue-500 to-indigo-600',
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-amber-400 to-orange-500',
  'from-rose-500 to-pink-600',
  'from-cyan-500 to-sky-600',
];

const folderColor = (name: string) =>
  folderGradients[(name.charCodeAt(0) || 0) % folderGradients.length];

const fmtSize = (kb: number) => {
  if (!kb) return '';
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

const fmtDate = (s?: string) => {
  if (!s) return '';
  try { return new Date(s).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return ''; }
};

// ── Context menu ──────────────────────────────────────────────────────────────

interface MenuProps {
  items: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }[];
  onClose: () => void;
}

const ContextMenu = ({ items, onClose }: MenuProps) => (
  <>
    <div className="fixed inset-0 z-40" onClick={onClose} />
    <div className="absolute right-0 top-8 z-50 min-w-[160px] bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden py-1">
      {items.map((item) => (
        <button key={item.label} onClick={() => { item.onClick(); onClose(); }}
          className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors ${item.danger ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
          {item.icon} {item.label}
        </button>
      ))}
    </div>
  </>
);

// ── Breadcrumb ────────────────────────────────────────────────────────────────

interface BreadcrumbItem { id: string | null; name: string }

const Breadcrumbs = ({ trail, onNavigate }: { trail: BreadcrumbItem[]; onNavigate: (id: string | null) => void }) => (
  <nav className="flex items-center gap-1 text-sm flex-wrap">
    {trail.map((crumb, i) => (
      <React.Fragment key={crumb.id ?? 'root'}>
        {i > 0 && <ChevronRight size={14} className="text-gray-400 shrink-0" />}
        {i === trail.length - 1 ? (
          <span className="font-medium text-gray-900 dark:text-white">{crumb.name}</span>
        ) : (
          <button onClick={() => onNavigate(crumb.id)}
            className="text-blue-600 hover:text-blue-800 hover:underline">
            {crumb.id === null ? <Home size={14} /> : crumb.name}
          </button>
        )}
      </React.Fragment>
    ))}
  </nav>
);

// ── Copy button ───────────────────────────────────────────────────────────────

const CopyBtn = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy} title="Copy link"
      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 hover:text-gray-700">
      {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
    </button>
  );
};

// ── Upload File Modal ─────────────────────────────────────────────────────────

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  folderId: string | null;
  canWrite: boolean;
}

// ── Document Viewer Modal ─────────────────────────────────────────────────────

const VIEWABLE_IMAGES = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'];
const VIEWABLE_PDFS   = ['pdf'];
const VIEWABLE_TEXT   = ['txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'html', 'css', 'xml', 'yaml', 'yml', 'csv', 'log', 'sh', 'py', 'rb', 'go', 'java', 'cs', 'php', 'sql'];
const VIEWABLE_VIDEO  = ['mp4', 'webm', 'ogg', 'mov'];

// Separate component so the fetch runs once when blobUrl is ready
// Parses a CSV string into rows (array of string arrays), handles quoted fields
const parseCSV = (raw: string): string[][] => {
  const rows: string[][] = [];
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        cols.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    cols.push(cur);
    rows.push(cols);
  }
  return rows;
};

const CsvViewer = ({ text, fileName, dark }: { text: string; fileName: string; dark: boolean }) => {
  const rows = parseCSV(text);
  const [search, setSearch] = useState('');
  const d = dark;
  if (!rows.length) return <p className={`text-sm p-6 ${d ? 'text-gray-400' : 'text-gray-500'}`}>Empty file</p>;
  const headers = rows[0];
  const dataRows = rows.slice(1);
  const lo = search.toLowerCase();
  const filtered = lo ? dataRows.filter((r) => r.some((c) => c.toLowerCase().includes(lo))) : dataRows;
  return (
    <div className={`flex flex-col w-full h-full ${d ? 'bg-gray-900' : 'bg-white'}`}>
      {/* CSV toolbar */}
      <div className={`flex items-center justify-between px-4 py-2.5 border-b shrink-0 ${d ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-mono truncate max-w-xs ${d ? 'text-gray-400' : 'text-gray-500'}`}>{fileName}</span>
          <span className="text-xs bg-emerald-600 text-white px-2 py-0.5 rounded font-mono uppercase">CSV</span>
          <span className={`text-xs ${d ? 'text-gray-500' : 'text-gray-400'}`}>{filtered.length} rows · {headers.length} cols</span>
        </div>
        <div className="relative">
          <Search size={12} className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${d ? 'text-gray-500' : 'text-gray-400'}`} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter rows…"
            className={`text-xs border rounded-lg pl-7 pr-3 py-1.5 focus:outline-none focus:border-blue-500 w-44 ${d ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-500' : 'bg-white border-gray-300 text-gray-700 placeholder-gray-400'}`}
          />
        </div>
      </div>
      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="text-xs text-left border-collapse w-full" style={{ minWidth: `${headers.length * 130}px` }}>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={`font-medium px-3 py-2 border-b border-r text-right select-none w-10 ${d ? 'bg-gray-800 border-gray-700 text-gray-500' : 'bg-gray-100 border-gray-200 text-gray-400'}`}>#</th>
              {headers.map((h, i) => (
                <th key={i} className={`font-semibold px-3 py-2 border-b border-r whitespace-nowrap ${d ? 'bg-gray-800 border-gray-700 text-gray-200' : 'bg-gray-100 border-gray-200 text-gray-700'}`}>
                  {h.trim() || `Col ${i + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, ri) => (
              <tr key={ri} className={d ? (ri % 2 === 0 ? 'bg-gray-900' : 'bg-gray-900/60') : (ri % 2 === 0 ? 'bg-white' : 'bg-gray-50')}>
                <td className={`px-3 py-1.5 border-b border-r text-right select-none tabular-nums ${d ? 'border-gray-800 text-gray-600' : 'border-gray-100 text-gray-400'}`}>{ri + 1}</td>
                {headers.map((_, ci) => (
                  <td key={ci} className={`px-3 py-1.5 border-b border-r max-w-xs truncate ${d ? 'border-gray-800 text-gray-200' : 'border-gray-100 text-gray-700'}`} title={row[ci] ?? ''}>
                    {row[ci] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={headers.length + 1} className={`text-center py-8 ${d ? 'text-gray-500' : 'text-gray-400'}`}>No rows match "{search}"</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const TextViewer = ({ blobUrl, fileName, ext, dark }: { blobUrl: string; fileName: string; ext: string; dark: boolean }) => {
  const [text, setText] = useState<string>('');
  const isCsv = ext === 'csv';
  useEffect(() => {
    fetch(blobUrl).then((r) => r.text()).then(setText).catch(() => setText('Could not load content.'));
  }, [blobUrl]);
  if (isCsv) {
    return (
      <div className={`w-full h-full flex flex-col overflow-hidden ${dark ? 'bg-gray-900' : 'bg-white'}`}>
        {text ? <CsvViewer text={text} fileName={fileName} dark={dark} /> : (
          <div className={`flex-1 flex items-center justify-center text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Loading…</div>
        )}
      </div>
    );
  }
  return (
    <div className={`w-full h-full flex flex-col overflow-hidden ${dark ? 'bg-gray-900' : 'bg-white'}`}>
      <div className={`flex items-center justify-between px-4 py-2.5 border-b shrink-0 ${dark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
        <span className={`text-xs font-mono ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{fileName}</span>
        <span className={`text-xs px-2 py-0.5 rounded font-mono uppercase ${dark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-600'}`}>{ext}</span>
      </div>
      <div className="flex-1 overflow-auto">
        <pre className={`p-5 text-xs font-mono leading-relaxed whitespace-pre-wrap break-words ${dark ? 'text-gray-200' : 'text-gray-800'}`}>{text || 'Loading…'}</pre>
      </div>
    </div>
  );
};

const DocumentViewerModal = ({ doc, onClose }: { doc: ProjectDocument | null; onClose: () => void }) => {
  const [zoom, setZoom]         = useState(1);
  const [rotate, setRotate]     = useState(0);
  const [viewerDark, setViewerDark] = useState(true);
  // blobUrl is created from a fetch so we bypass Stratus X-Frame-Options / CORS restrictions
  const [blobUrl, setBlobUrl]     = useState<string | null>(null);
  const [blobLoading, setBlobLoading] = useState(false);
  const [blobError, setBlobError]   = useState(false);

  const ext = ((doc?.fileExtension || doc?.fileName?.split('.').pop()) ?? '').toLowerCase().replace('.', '');

  const isImage = VIEWABLE_IMAGES.includes(ext);
  const isPdf   = VIEWABLE_PDFS.includes(ext);
  const isText  = VIEWABLE_TEXT.includes(ext);
  const isVideo = VIEWABLE_VIDEO.includes(ext);
  // Everything we can show needs a blob URL (images use it too for CORS-safe display)
  const needsBlob = isImage || isPdf || isText || isVideo;

  // Fetch file → blob URL every time the doc changes.
  // This converts Stratus cross-origin URLs into a same-origin blob:// URL so
  // iframes and img tags render without X-Frame-Options / CORS issues.
  useEffect(() => {
    setZoom(1); setRotate(0);
    setBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setBlobError(false);
    if (!doc || !needsBlob) return;

    let revoked = false;
    setBlobLoading(true);
    fetch(doc.fileUrl, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.blob();
      })
      .then((blob) => {
        if (revoked) return;
        // For text files preserve as text; for everything else keep original mime
        const mime = isText ? 'text/plain' : (blob.type || doc.mimeType || 'application/octet-stream');
        const url  = URL.createObjectURL(new Blob([blob], { type: mime }));
        setBlobUrl(url);
      })
      .catch((err) => {
        console.warn('[DocViewer] blob fetch failed:', err.message);
        if (!revoked) setBlobError(true);
      })
      .finally(() => { if (!revoked) setBlobLoading(false); });

    return () => {
      revoked = true;
      setBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    };
  }, [doc?.id]);

  // Esc to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  if (!doc) return null;

  const handleDownload = () => {
    if (blobUrl) {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = doc.fileName;
      a.click();
    } else {
      window.open(doc.fileUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const showLoading = needsBlob && blobLoading;
  const showError   = needsBlob && blobError && !blobLoading;

  const vd = viewerDark;
  const btnBase = vd ? 'bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-900';

  // Portal renders directly in document.body — bypasses Layout stacking context
  return createPortal(
    <div className={`fixed inset-0 z-[9999] flex flex-col ${vd ? 'bg-gray-950' : 'bg-gray-100'}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0 ${vd ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2 rounded-lg bg-gradient-to-br ${extColor(ext)} text-white shrink-0`}>
            {fileIcon(ext, 16)}
          </div>
          <div className="min-w-0">
            <p className={`text-sm font-semibold truncate ${vd ? 'text-white' : 'text-gray-900'}`}>{doc.name || doc.fileName}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-xs uppercase font-medium ${vd ? 'text-gray-400' : 'text-gray-500'}`}>{ext || 'file'}</span>
              {doc.fileSizeKb > 0 && <span className={`text-xs ${vd ? 'text-gray-500' : 'text-gray-400'}`}>· {fmtSize(doc.fileSizeKb)}</span>}
              <span className={`text-xs ${vd ? 'text-gray-500' : 'text-gray-400'}`}>· v{doc.currentVersion}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isImage && blobUrl && (
            <>
              <button onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))} title="Zoom out"
                className={`p-2 rounded-lg transition-colors ${btnBase}`}>
                <ZoomOut size={15} />
              </button>
              <span className={`text-xs w-12 text-center ${vd ? 'text-gray-400' : 'text-gray-600'}`}>{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(4, z + 0.25))} title="Zoom in"
                className={`p-2 rounded-lg transition-colors ${btnBase}`}>
                <ZoomIn size={15} />
              </button>
              <button onClick={() => setRotate((r) => (r + 90) % 360)} title="Rotate"
                className={`p-2 rounded-lg transition-colors ${btnBase}`}>
                <RotateCw size={15} />
              </button>
              <div className={`w-px h-5 mx-1 ${vd ? 'bg-gray-700' : 'bg-gray-300'}`} />
            </>
          )}
          <button onClick={() => setViewerDark((v) => !v)} title={vd ? 'Switch to light mode' : 'Switch to dark mode'}
            className={`p-2 rounded-lg transition-colors ${btnBase}`}>
            {vd ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button onClick={handleDownload} title="Download"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors">
            <Download size={13} /> Download
          </button>
          <button onClick={onClose} title="Close (Esc)"
            className={`p-2 rounded-lg transition-colors ${btnBase}`}>
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className={`flex-1 flex min-h-0 ${isText ? 'overflow-hidden' : 'overflow-auto items-center justify-center p-4'}`}>

        {/* Loading spinner */}
        {showLoading && (
          <div className={`flex flex-col items-center gap-4 ${vd ? 'text-gray-400' : 'text-gray-500'}`}>
            <div className={`w-10 h-10 border-2 rounded-full animate-spin ${vd ? 'border-gray-600 border-t-blue-500' : 'border-gray-300 border-t-blue-500'}`} />
            <span className="text-sm">Loading preview…</span>
          </div>
        )}

        {/* Fetch failed — offer download */}
        {showError && (
          <div className="text-center">
            <div className={`w-24 h-24 rounded-3xl bg-gradient-to-br ${extColor(ext)} text-white flex items-center justify-center mx-auto mb-6 shadow-2xl`}>
              {fileIcon(ext, 40)}
            </div>
            <p className={`font-semibold text-lg mb-1 ${vd ? 'text-white' : 'text-gray-900'}`}>{doc.name || doc.fileName}</p>
            <p className={`text-sm mb-6 ${vd ? 'text-gray-400' : 'text-gray-500'}`}>Preview could not be loaded.</p>
            <button onClick={handleDownload}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors mx-auto">
              <Download size={16} /> Download File
            </button>
          </div>
        )}

        {/* Image viewer */}
        {isImage && blobUrl && (
          <div className={`overflow-auto flex items-center justify-center w-full h-full rounded-xl ${vd ? '' : 'bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#f9fafb_0%_50%)] bg-[length:20px_20px]'}`}>
            <img
              src={blobUrl}
              alt={doc.name || doc.fileName}
              style={{ transform: `scale(${zoom}) rotate(${rotate}deg)`, transformOrigin: 'center', transition: 'transform 0.2s' }}
              className="max-w-none shadow-2xl rounded-lg"
            />
          </div>
        )}

        {/* PDF viewer — blob URL bypasses Stratus X-Frame-Options */}
        {isPdf && blobUrl && (
          <iframe
            src={blobUrl}
            title={doc.name || doc.fileName}
            className="w-full h-full rounded-lg shadow-2xl bg-white"
            style={{ minHeight: 'calc(100vh - 120px)' }}
          />
        )}

        {/* Video player */}
        {isVideo && blobUrl && (
          <video controls className="max-w-full max-h-full rounded-xl shadow-2xl" style={{ maxHeight: 'calc(100vh - 120px)' }}>
            <source src={blobUrl} type={doc.mimeType || `video/${ext}`} />
            Your browser does not support the video tag.
          </video>
        )}

        {/* Text / code viewer */}
        {isText && blobUrl && (
          <TextViewer blobUrl={blobUrl} fileName={doc.fileName} ext={ext} dark={vd} />
        )}

        {/* Unsupported type */}
        {!needsBlob && (
          <div className="text-center">
            <div className={`w-24 h-24 rounded-3xl bg-gradient-to-br ${extColor(ext)} text-white flex items-center justify-center mx-auto mb-6 shadow-2xl`}>
              {fileIcon(ext, 40)}
            </div>
            <p className={`font-semibold text-lg mb-1 ${vd ? 'text-white' : 'text-gray-900'}`}>{doc.name || doc.fileName}</p>
            <p className={`text-sm mb-2 ${vd ? 'text-gray-400' : 'text-gray-500'}`}>{ext.toUpperCase()} · {fmtSize(doc.fileSizeKb)}</p>
            <p className={`text-sm mb-8 ${vd ? 'text-gray-500' : 'text-gray-400'}`}>This file type cannot be previewed in the browser.</p>
            <button onClick={handleDownload}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors mx-auto">
              <Download size={16} /> Download File
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

// ── Upload File Modal ─────────────────────────────────────────────────────────

type FileStatus = 'pending' | 'uploading' | 'done' | 'error';
interface FileItem { file: File; name: string; status: FileStatus; errorMsg?: string; progress: number }

const UploadModal = ({ open, onClose, projectId, folderId, canWrite }: UploadModalProps) => {
  const uploadDoc = useUploadDocument(projectId);
  const [items, setItems] = useState<FileItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles);
    setItems((prev) => {
      const existing = new Set(prev.map((i) => i.file.name + i.file.size));
      const fresh = arr
        .filter((f) => !existing.has(f.name + f.size))
        .map((f): FileItem => ({
          file: f,
          name: f.name.replace(/\.[^/.]+$/, ''),
          status: 'pending',
          progress: 0,
        }));
      return [...prev, ...fresh];
    });
  };

  const removeItem = (idx: number) =>
    setItems((prev) => prev.filter((_, i) => i !== idx));

  const updateItem = (idx: number, patch: Partial<FileItem>) =>
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, []);

  const toBase64 = (file: File): Promise<string> =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res((r.result as string).split(',')[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });

  const handleUpload = async () => {
    if (items.length === 0) { setGlobalError('Add at least one file.'); return; }
    setGlobalError('');
    setIsUploading(true);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.status === 'done') continue;
      updateItem(i, { status: 'uploading', progress: 10 });
      try {
        const b64 = await toBase64(item.file);
        updateItem(i, { progress: 40 });
        await uploadDoc.mutateAsync({
          name:        item.name.trim() || item.file.name,
          fileName:    item.file.name,
          contentType: item.file.type || 'application/octet-stream',
          base64:      b64,
          folderId:    folderId ?? undefined,
        });
        updateItem(i, { status: 'done', progress: 100 });
      } catch (e) {
        updateItem(i, { status: 'error', progress: 0, errorMsg: (e as Error).message });
      }
    }

    setIsUploading(false);
    const allDone = items.every((_, i) => items[i]?.status !== 'error');
    if (allDone) setTimeout(() => { setItems([]); onClose(); }, 600);
  };

  const reset = () => { setItems([]); setGlobalError(''); setIsUploading(false); };
  const doneCount  = items.filter((i) => i.status === 'done').length;
  const errorCount = items.filter((i) => i.status === 'error').length;

  return (
    <Modal open={open} onClose={() => { if (!isUploading) { reset(); onClose(); } }} title="Upload Files" size="lg" closeOnBackdropClick={false}>
      {globalError && <Alert type="error" message={globalError} />}

      <div className="space-y-4 mt-2">
        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => !isUploading && inputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl transition-all ${
            isUploading ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
          } ${dragging
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 scale-[1.01]'
              : 'border-gray-200 dark:border-gray-600 hover:border-blue-400 hover:bg-blue-50/40 dark:hover:bg-blue-900/10'
          }`}>
          <input ref={inputRef} type="file" multiple className="hidden"
            accept="*/*"
            onChange={(e) => { if (e.target.files) { addFiles(e.target.files); e.target.value = ''; } }} />
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mb-3">
              <Upload size={22} className="text-blue-500" />
            </div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Drop files here or <span className="text-blue-600">click to browse</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">Supports all file types including ZIP · Max 20 MB per file</p>
          </div>
        </div>

        {/* File list */}
        {items.length > 0 && (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {/* Summary row while uploading */}
            {isUploading && (
              <p className="text-xs text-gray-500 dark:text-gray-400 pb-1">
                Uploading {doneCount} of {items.length} file{items.length !== 1 ? 's' : ''}…
              </p>
            )}
            {items.map((item, idx) => {
              const ext = item.file.name.split('.').pop() || '';
              return (
                <div key={idx} className={`rounded-xl border transition-all ${
                  item.status === 'done'      ? 'border-green-200 bg-green-50 dark:bg-green-900/10 dark:border-green-800' :
                  item.status === 'error'     ? 'border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800' :
                  item.status === 'uploading' ? 'border-blue-200 bg-blue-50/60 dark:bg-blue-900/10 dark:border-blue-800' :
                  'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                }`}>
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    {/* File icon */}
                    <div className={`p-1.5 rounded-lg bg-gradient-to-br ${extColor(ext)} text-white shrink-0`}>
                      {fileIcon(ext, 14)}
                    </div>
                    {/* Name + size */}
                    <div className="min-w-0 flex-1">
                      {item.status === 'pending' ? (
                        <input
                          value={item.name}
                          onChange={(e) => updateItem(idx, { name: e.target.value })}
                          className="w-full text-sm font-medium bg-transparent border-0 outline-none text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-400 rounded px-1 -mx-1"
                          placeholder="Document name" />
                      ) : (
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.name || item.file.name}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {item.file.name} · {fmtSize(item.file.size / 1024)}
                        {item.status === 'error' && <span className="text-red-500 ml-1">· {item.errorMsg}</span>}
                      </p>
                    </div>
                    {/* Status icon */}
                    <div className="shrink-0">
                      {item.status === 'pending' && !isUploading && (
                        <button onClick={() => removeItem(idx)}
                          className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 transition-colors">
                          <X size={14} />
                        </button>
                      )}
                      {item.status === 'uploading' && (
                        <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                      )}
                      {item.status === 'done' && (
                        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                          <Check size={11} className="text-white" />
                        </div>
                      )}
                      {item.status === 'error' && (
                        <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                          <X size={11} className="text-white" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress bar — shown while uploading or done */}
                  {(item.status === 'uploading' || item.status === 'done') && (
                    <div className="px-3 pb-2.5">
                      <div className="h-1 w-full rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            item.status === 'done' ? 'bg-green-500' : 'bg-blue-500'
                          } ${item.status === 'uploading' ? 'animate-pulse' : ''}`}
                          style={{ width: `${item.progress}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Summary after upload completes */}
        {!isUploading && doneCount > 0 && (
          <div className={`flex items-center gap-2 text-sm rounded-xl px-3 py-2.5 ${
            errorCount === 0
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
              : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
          }`}>
            <Check size={14} />
            {doneCount} file{doneCount !== 1 ? 's' : ''} uploaded{errorCount > 0 ? `, ${errorCount} failed` : ' successfully'}
          </div>
        )}
      </div>

      <ModalActions>
        <Button variant="ghost" onClick={() => { reset(); onClose(); }} disabled={isUploading}>
          {isUploading ? 'Uploading…' : 'Cancel'}
        </Button>
        <Button
          onClick={handleUpload}
          loading={isUploading}
          disabled={!canWrite || items.length === 0 || isUploading || items.every((i) => i.status === 'done')}>
          {isUploading
            ? `Uploading ${doneCount}/${items.length}…`
            : errorCount > 0
            ? `Retry ${errorCount} Failed`
            : `Upload ${items.length > 0 ? `${items.length} File${items.length !== 1 ? 's' : ''}` : ''}`}
        </Button>
      </ModalActions>
    </Modal>
  );
};

// ── New Folder Modal ──────────────────────────────────────────────────────────

interface NewFolderModalProps { open: boolean; onClose: () => void; projectId: string; parentFolderId: string | null }

const NewFolderModal = ({ open, onClose, projectId, parentFolderId }: NewFolderModalProps) => {
  const createFolder = useCreateDocFolder(projectId);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Folder name is required.'); return; }
    try {
      setError('');
      await createFolder.mutateAsync({ name: name.trim(), parentFolderId: parentFolderId ?? undefined });
      setName('');
      onClose();
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <Modal open={open} onClose={() => { setName(''); setError(''); onClose(); }} title="New Folder" size="sm">
      {error && <Alert type="error" message={error} />}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">Folder Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="e.g. Design Assets" autoFocus
          className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white" />
      </div>
      <ModalActions>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} loading={createFolder.isPending}>Create</Button>
      </ModalActions>
    </Modal>
  );
};

// ── Rename Folder Modal ───────────────────────────────────────────────────────

interface RenameFolderModalProps { open: boolean; onClose: () => void; projectId: string; folder: ProjectDocFolder | null }

const RenameFolderModal = ({ open, onClose, projectId, folder }: RenameFolderModalProps) => {
  const renameFolder = useRenameDocFolder(projectId);
  const [name, setName] = useState(folder?.name || '');
  const [error, setError] = useState('');

  React.useEffect(() => { setName(folder?.name || ''); }, [folder]);

  const handleSubmit = async () => {
    if (!name.trim() || !folder) return;
    try {
      setError('');
      await renameFolder.mutateAsync({ folderId: folder.id, name: name.trim() });
      onClose();
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Rename Folder" size="sm">
      {error && <Alert type="error" message={error} />}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">Folder Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          autoFocus
          className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white" />
      </div>
      <ModalActions>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} loading={renameFolder.isPending}>Rename</Button>
      </ModalActions>
    </Modal>
  );
};

// ── Share Modal ───────────────────────────────────────────────────────────────

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  target: { type: 'DOCUMENT' | 'FOLDER'; id: string; name: string } | null;
  onCreated: (share: ProjectDocShare) => void;
}

const ShareModal = ({ open, onClose, projectId, target, onCreated }: ShareModalProps) => {
  const createShare = useCreateDocShare(projectId);
  const [accessLevel, setAccessLevel] = useState<'VIEW' | 'DOWNLOAD' | 'EDIT'>('VIEW');
  const [linkType, setLinkType]       = useState<'PUBLIC' | 'MEMBERS'>('PUBLIC');
  const [expiresAt, setExpiresAt]     = useState('');
  const [error, setError]             = useState('');

  const handleSubmit = async () => {
    if (!target) return;
    try {
      setError('');
      const share = await createShare.mutateAsync({
        shareType:  target.type,
        documentId: target.type === 'DOCUMENT' ? target.id : undefined,
        folderId:   target.type === 'FOLDER'   ? target.id : undefined,
        accessLevel,
        linkType,
        expiresAt:  expiresAt || undefined,
      });
      setExpiresAt('');
      onCreated(share);
      onClose();
    } catch (e) { setError((e as Error).message); }
  };

  const levels: { key: 'VIEW' | 'DOWNLOAD' | 'EDIT'; label: string; desc: string; icon: React.ReactNode }[] = [
    { key: 'VIEW',     label: 'View Only',  desc: 'Can view, cannot download or edit',       icon: <Eye size={15} /> },
    { key: 'DOWNLOAD', label: 'Download',   desc: 'Can view and download files',              icon: <Download size={15} /> },
    { key: 'EDIT',     label: 'Edit',       desc: 'Can view, download and add records (CSV)', icon: <Edit2 size={15} /> },
  ];

  const linkTypes: { key: 'PUBLIC' | 'MEMBERS'; label: string; desc: string; icon: React.ReactNode }[] = [
    { key: 'PUBLIC',  label: 'Public',       desc: 'Anyone with the link can access',        icon: <Globe size={15} /> },
    { key: 'MEMBERS', label: 'Members Only', desc: 'Only signed-in app members can access',  icon: <Lock size={15} /> },
  ];

  return (
    <Modal open={open} onClose={onClose} title={`Share "${target?.name ?? ''}"`} size="sm">
      {error && <Alert type="error" message={error} />}
      <div className="space-y-4">
        {/* Link visibility */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">Who can access</label>
          <div className="grid grid-cols-2 gap-2">
            {linkTypes.map(({ key, label, desc, icon }) => (
              <button key={key} onClick={() => setLinkType(key)}
                className={`flex flex-col items-start gap-1 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all text-left ${linkType === key ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-300'}`}>
                <span className={`${linkType === key ? 'text-blue-600' : 'text-gray-400'}`}>{icon}</span>
                <p className="font-semibold text-xs">{label}</p>
                <p className={`text-[11px] font-normal leading-tight ${linkType === key ? 'text-blue-500' : 'text-gray-400'}`}>{desc}</p>
              </button>
            ))}
          </div>
        </div>
        {/* Access level */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">Access Level</label>
          <div className="flex flex-col gap-2">
            {levels.map(({ key, label, desc, icon }) => (
              <button key={key} onClick={() => setAccessLevel(key)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all text-left ${accessLevel === key ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-300'}`}>
                <span className={`shrink-0 ${accessLevel === key ? 'text-blue-600' : 'text-gray-400'}`}>{icon}</span>
                <div>
                  <p className="font-semibold">{label}</p>
                  <p className={`text-xs font-normal mt-0.5 ${accessLevel === key ? 'text-blue-500' : 'text-gray-400'}`}>{desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">
            Expires At <span className="text-gray-400">(optional)</span>
          </label>
          <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white" />
        </div>
      </div>
      <ModalActions>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} loading={createShare.isPending} icon={<Share2 size={14} />}>
          Generate Link
        </Button>
      </ModalActions>
    </Modal>
  );
};

// ── Share Success Modal ───────────────────────────────────────────────────────

const ShareSuccessModal = ({ share, onClose }: { share: ProjectDocShare | null; onClose: () => void }) => {
  const [copied, setCopied] = useState(false);
  const url = share?.shareUrl ?? '';
  const copy = () => {
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 3000); });
  };
  return (
    <Modal open={!!share} onClose={onClose} title="Share Link Created" size="sm">
      <div className="text-center py-2">
        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check size={28} className="text-green-600" />
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          Your share link is ready. Anyone with this link can access the {share?.shareType === 'DOCUMENT' ? 'document' : 'folder'}.
        </p>
        <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl p-3">
          <Link2 size={14} className="text-gray-400 shrink-0" />
          <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1 font-mono">{url}</span>
          <button onClick={copy}
            className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${copied ? 'bg-green-100 text-green-700' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
            {copied ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
          </button>
        </div>
      </div>
      <ModalActions>
        <Button onClick={onClose}>Done</Button>
      </ModalActions>
    </Modal>
  );
};

// QuickActionCard removed — replaced with inline toolbar in FilesTab

// ── Document thumbnail (paper-style preview) ──────────────────────────────────

const DocThumbnail = ({ ext }: { ext: string }) => (
  <div className="w-16 h-20 bg-white dark:bg-gray-700 rounded shadow border border-gray-100 dark:border-gray-600 overflow-hidden flex flex-col">
    <div className={`h-1.5 w-full bg-gradient-to-r ${extColor(ext)} shrink-0`} />
    <div className="flex-1 px-1.5 py-1.5 flex flex-col gap-1">
      {[100, 70, 90, 60, 80, 55].map((w, i) => (
        <div key={i} className="h-0.5 rounded-full bg-gray-200 dark:bg-gray-500"
          style={{ width: `${w}%` }} />
      ))}
    </div>
    <div className={`px-1 py-1 bg-gradient-to-r ${extColor(ext)} flex items-center justify-center shrink-0`}>
      <span className="text-[8px] font-bold text-white uppercase tracking-widest">{ext || 'file'}</span>
    </div>
  </div>
);

// ── Folder Access Modal ───────────────────────────────────────────────────────

interface FolderAccessModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  folder: ProjectDocFolder | null;
}

const FolderAccessModal = ({ open, onClose, projectId, folder }: FolderAccessModalProps) => {
  const { data: projectMembers = [], isLoading: loadingMembers }   = useProjectMembers(projectId);
  const { data: tenantUsers    = [], isLoading: loadingTenantUsers } = useTenantUsers();
  const updateAccess = useUpdateFolderAccess(projectId);
  const [visibility, setVisibility] = useState<'ALL' | 'RESTRICTED'>('ALL');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (folder) {
      setVisibility(folder.visibility ?? 'ALL');
      setSelectedIds(folder.allowedUserIds ?? []);
      setSearch('');
      setError('');
    }
  }, [folder]);

  const toggle = (userId: string) => {
    setSelectedIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSave = async () => {
    if (!folder) return;
    try {
      setError('');
      await updateAccess.mutateAsync({
        folderId: folder.id,
        visibility,
        allowedUserIds: visibility === 'RESTRICTED' ? selectedIds : [],
      });
      onClose();
    } catch (e) { setError((e as Error).message); }
  };

  // Merge tenant users with project membership info.
  // projectMemberIds is the set of user IDs who are in this project.
  const projectMemberIds = new Set((projectMembers as ProjectMember[]).map((m) => m.userId));

  // Build a unified list: tenant users enriched with project role if applicable.
  const allUsers: Array<TenantUser & { projectRole?: string; isProjectMember: boolean }> =
    (tenantUsers as TenantUser[]).map((u) => {
      const pm = (projectMembers as ProjectMember[]).find((m) => m.userId === u.userId);
      return { ...u, projectRole: pm?.role, isProjectMember: !!pm };
    });

  // Sort: project members first, then alphabetically.
  allUsers.sort((a, b) => {
    if (a.isProjectMember !== b.isProjectMember) return a.isProjectMember ? -1 : 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  const q = search.toLowerCase().trim();
  const filtered = q
    ? allUsers.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    : allUsers;

  const isLoading = loadingMembers || loadingTenantUsers;
  const creatorIsInList = allUsers.some((u) => u.userId === folder?.createdBy);

  return (
    <Modal open={open} onClose={onClose} title={`Folder Access — "${folder?.name ?? ''}"`} size="xl" closeOnBackdropClick={false}>
      {error && <Alert type="error" message={error} />}
      <div className="space-y-5">
        {/* Visibility toggle */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2 uppercase tracking-wide">Who can see this folder?</label>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setVisibility('ALL')}
              className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${visibility === 'ALL' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-300'}`}>
              <Globe size={16} />
              <div className="text-left">
                <p className="font-semibold">All Members</p>
                <p className="text-xs opacity-70">Everyone in the project</p>
              </div>
            </button>
            <button onClick={() => setVisibility('RESTRICTED')}
              className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${visibility === 'RESTRICTED' ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-violet-300'}`}>
              <Lock size={16} />
              <div className="text-left">
                <p className="font-semibold">Restricted</p>
                <p className="text-xs opacity-70">Only selected people</p>
              </div>
            </button>
          </div>
        </div>

        {/* User picker — only shown when Restricted */}
        {visibility === 'RESTRICTED' && (
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2 uppercase tracking-wide">
              <Users size={12} className="inline mr-1" />Select who has access
            </label>

            {/* Search */}
            <div className="relative mb-2">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>

            {isLoading ? (
              <div className="text-xs text-gray-400 py-6 text-center">Loading users…</div>
            ) : filtered.length === 0 ? (
              <div className="text-xs text-gray-400 py-6 text-center">
                {q ? `No users matching "${search}"` : 'No users found in your organisation'}
              </div>
            ) : (
              <div className="space-y-0.5 max-h-56 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-600 p-1">
                {/* Section header when both project members and non-members exist */}
                {filtered.some((u) => u.isProjectMember) && filtered.some((u) => !u.isProjectMember) && (
                  <>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 pt-1.5 pb-1">Project members</p>
                    {filtered.filter((u) => u.isProjectMember).map((u) => {
                      const isCreator = u.userId === folder?.createdBy;
                      const checked   = isCreator || selectedIds.includes(u.userId);
                      return (
                        <UserRow key={u.userId} u={u} isCreator={isCreator} checked={checked}
                          onToggle={() => !isCreator && toggle(u.userId)} />
                      );
                    })}
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 pt-2 pb-1 border-t border-gray-100 dark:border-gray-700 mt-1">Other org members</p>
                    {filtered.filter((u) => !u.isProjectMember).map((u) => {
                      const checked = selectedIds.includes(u.userId);
                      return (
                        <UserRow key={u.userId} u={u} isCreator={false} checked={checked}
                          onToggle={() => toggle(u.userId)} />
                      );
                    })}
                  </>
                )}
                {/* Single-group rendering when filtering or only one group exists */}
                {!(filtered.some((u) => u.isProjectMember) && filtered.some((u) => !u.isProjectMember)) &&
                  filtered.map((u) => {
                    const isCreator = u.userId === folder?.createdBy;
                    const checked   = isCreator || selectedIds.includes(u.userId);
                    return (
                      <UserRow key={u.userId} u={u} isCreator={isCreator} checked={checked}
                        onToggle={() => !isCreator && toggle(u.userId)} />
                    );
                  })
                }
              </div>
            )}

            {selectedIds.length === 0 && !creatorIsInList && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                <Lock size={11} /> No users selected — only you can see this folder
              </p>
            )}
            {selectedIds.length > 0 && (
              <p className="text-xs text-violet-600 dark:text-violet-400 mt-2">
                {selectedIds.length} user{selectedIds.length !== 1 ? 's' : ''} selected
              </p>
            )}
          </div>
        )}
      </div>
      <ModalActions>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} loading={updateAccess.isPending} icon={<Lock size={14} />}>
          Save Access
        </Button>
      </ModalActions>
    </Modal>
  );
};

// Row sub-component used inside FolderAccessModal to keep JSX clean
const UserRow = ({
  u, isCreator, checked, onToggle,
}: {
  u: TenantUser & { projectRole?: string; isProjectMember: boolean };
  isCreator: boolean;
  checked: boolean;
  onToggle: () => void;
}) => (
  <label
    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
      isCreator ? 'opacity-75 cursor-not-allowed' : 'cursor-pointer'
    } ${checked ? 'bg-violet-50 dark:bg-violet-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
    <input type="checkbox" checked={checked} disabled={isCreator}
      onChange={onToggle}
      className="rounded accent-violet-600 shrink-0" />
    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
      {u.name?.charAt(0)?.toUpperCase() || '?'}
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{u.name}</p>
      <p className="text-xs text-gray-400 truncate">{u.email}</p>
    </div>
    <div className="shrink-0 flex items-center gap-1">
      {isCreator && (
        <span className="text-xs text-violet-600 bg-violet-100 dark:bg-violet-900/30 px-1.5 py-0.5 rounded-md font-medium">Owner</span>
      )}
      {u.isProjectMember && !isCreator && (
        <span className="text-xs text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-md font-medium">Member</span>
      )}
      {!u.isProjectMember && (
        <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-md">Org</span>
      )}
    </div>
  </label>
);

// ── Folder card ───────────────────────────────────────────────────────────────

interface FolderCardProps {
  folder: ProjectDocFolder;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onShare: () => void;
  onManageAccess: () => void;
  canWrite: boolean;
  canAdmin: boolean;
  canDelete: boolean;
  currentUserId?: string;
}

const FolderCard = ({ folder, onOpen, onRename, onDelete, onShare, onManageAccess, canWrite, canAdmin, canDelete, currentUserId }: FolderCardProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const isRestricted = folder.visibility === 'RESTRICTED';
  const isOwner = !!currentUserId && folder.createdBy === currentUserId;
  // Folder owner can also manage access (matches backend _canAccessFolder logic)
  const canManageAccess = canAdmin || isOwner;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-xl transition-all cursor-pointer group relative">
      {/* Preview area — overflow-hidden here so the dropdown can escape the card */}
      <div className="h-28 bg-gray-50 dark:bg-gray-900/40 flex items-center justify-center relative overflow-hidden rounded-t-2xl" onClick={onOpen}>
        <Folder size={52} className="text-green-500" strokeWidth={1.2} />
        {isRestricted && (
          <div className="absolute top-2.5 right-2.5 bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-300 rounded-full p-1.5" title="Restricted access">
            <Lock size={12} />
          </div>
        )}
      </div>
      {/* Info strip */}
      <div className="px-3 py-2.5 border-t border-gray-100 dark:border-gray-700 flex items-center gap-2">
        <Folder size={15} className="text-green-500 shrink-0" />
        <div className="min-w-0 flex-1" onClick={onOpen}>
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{folder.name}</p>
          <p className="text-xs text-gray-400">Folder · {fmtDate(folder.createdAt)}</p>
        </div>
        {/* Always-visible manage-access button so users can find it without hovering */}
        {canManageAccess && (
          <button
            onClick={(e) => { e.stopPropagation(); onManageAccess(); }}
            title="Manage folder access"
            className={`p-1.5 rounded-lg transition-colors shrink-0 ${
              isRestricted
                ? 'text-violet-500 bg-violet-50 dark:bg-violet-900/30 hover:bg-violet-100'
                : 'text-gray-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20'
            }`}>
            <Lock size={14} />
          </button>
        )}
        <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setMenuOpen((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition-colors">
            <MoreVertical size={16} />
          </button>
          {menuOpen && (
            <ContextMenu onClose={() => setMenuOpen(false)} items={[
              { label: 'Open', icon: <FolderOpen size={14} />, onClick: onOpen },
              ...(isOwner || canWrite ? [{ label: 'Rename', icon: <Edit2 size={14} />, onClick: onRename }] : []),
              { label: 'Share', icon: <Share2 size={14} />, onClick: onShare },
              ...(canManageAccess ? [{ label: 'Manage Access', icon: <Lock size={14} />, onClick: onManageAccess }] : []),
              ...(canAdmin || canDelete || isOwner ? [{ label: 'Delete', icon: <Trash2 size={14} />, onClick: onDelete, danger: true }] : []),
            ]} />
          )}
        </div>
      </div>
    </div>
  );
};

// ── Document card ─────────────────────────────────────────────────────────────

interface DocCardProps {
  doc: ProjectDocument;
  onOpen: () => void;
  onShare: () => void;
  onDelete: () => void;
  canAdmin: boolean;
  canDelete: boolean;
  isOwner: boolean;
}

const DocCard = ({ doc, onOpen, onShare, onDelete, canAdmin, canDelete, isOwner }: DocCardProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const ext = doc.fileExtension || doc.fileName?.split('.').pop() || '';
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-xl transition-all cursor-pointer group relative">
      {/* Preview area — overflow-hidden here so the dropdown can escape the card */}
      <div className="h-28 bg-gray-50 dark:bg-gray-900/40 flex items-center justify-center relative overflow-hidden rounded-t-2xl" onClick={onOpen}>
        <DocThumbnail ext={ext} />
      </div>
      {/* Info strip */}
      <div className="px-3 py-2.5 border-t border-gray-100 dark:border-gray-700 flex items-center gap-2.5">
        <div className={`p-1 rounded-md bg-gradient-to-br ${extColor(ext)} text-white shrink-0 flex items-center justify-center`}>
          {fileIcon(ext, 12)}
        </div>
        <div className="min-w-0 flex-1" onClick={onOpen}>
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{doc.name || doc.fileName}</p>
          <p className="text-xs text-gray-400">{ext?.toUpperCase() || 'File'} · {fmtDate(doc.createdAt)}</p>
        </div>
        <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setMenuOpen((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition-colors">
            <MoreVertical size={16} />
          </button>
          {menuOpen && (
            <ContextMenu onClose={() => setMenuOpen(false)} items={[
              { label: 'Open / View', icon: <Eye size={14} />, onClick: onOpen },
              { label: 'Download',    icon: <Download size={14} />, onClick: () => { const a = document.createElement('a'); a.href = doc.fileUrl; a.download = doc.fileName; a.click(); } },
              { label: 'Share',       icon: <Share2 size={14} />, onClick: onShare },
              ...(canAdmin || canDelete || isOwner ? [{ label: 'Delete', icon: <Trash2 size={14} />, onClick: onDelete, danger: true }] : []),
            ]} />
          )}
        </div>
      </div>
    </div>
  );
};

// ── All Docs tab ──────────────────────────────────────────────────────────────

interface AllDocsTabProps { projectId: string; canAdmin: boolean; canDelete: boolean; canShare: boolean }

const AllDocsTab = ({ projectId, canAdmin, canDelete, canShare }: AllDocsTabProps) => {
  const { data: docs = [], isLoading } = useAllProjectDocuments(projectId);
  const deleteDoc = useDeleteDocument(projectId);
  const { confirm } = useConfirm();
  const [search, setSearch] = useState('');
  const [shareTarget, setShareTarget] = useState<{ type: 'DOCUMENT' | 'FOLDER'; id: string; name: string } | null>(null);
  const [createdShare, setCreatedShare] = useState<ProjectDocShare | null>(null);
  const [viewingDoc, setViewingDoc] = useState<ProjectDocument | null>(null);

  const filtered = docs.filter((d) =>
    (d.name || d.fileName || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (doc: ProjectDocument) => {
    const ok = await confirm({ title: 'Delete Document', message: `Delete "${doc.name || doc.fileName}"? This cannot be undone.`, confirmText: 'Delete', variant: 'danger' });
    if (!ok) return;
    deleteDoc.mutate(doc.id);
  };

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents..."
          className="w-full pl-9 pr-4 py-2.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<FileText size={32} />} title="No documents yet" description="Upload files to any folder and they'll appear here." />
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
          {filtered.map((doc) => {
            const ext = doc.fileExtension || doc.fileName?.split('.').pop() || '';
            return (
              <div key={doc.id} className="flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-750 group cursor-pointer transition-colors" onClick={() => setViewingDoc(doc)}>
                <div className={`p-1.5 rounded-md bg-gradient-to-br ${extColor(ext)} text-white shrink-0 flex items-center justify-center`}>
                  {fileIcon(ext, 14)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{doc.name || doc.fileName}</p>
                  <p className="text-xs text-gray-400">
                    {ext?.toUpperCase() || 'File'}
                    {doc.fileSizeKb > 0 && ` · ${fmtSize(doc.fileSizeKb)}`}
                    {doc.description && ` · ${doc.description}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-gray-400 hidden sm:block">{fmtDate(doc.createdAt)}</span>
                  <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 px-2 py-0.5 rounded-full font-medium">v{doc.currentVersion}</span>
                  <button onClick={() => setViewingDoc(doc)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 hover:bg-blue-100 text-xs font-semibold transition-colors">
                    <Eye size={13} /> Open
                  </button>
                  {canShare && (
                    <button onClick={() => setShareTarget({ type: 'DOCUMENT', id: doc.id, name: doc.name || doc.fileName })} title="Share"
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-600 transition-colors">
                      <Share2 size={14} />
                    </button>
                  )}
                  {(canAdmin || canDelete) && (
                    <button onClick={() => handleDelete(doc)} title="Delete"
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-600 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ShareModal open={!!shareTarget} onClose={() => setShareTarget(null)} projectId={projectId}
        target={shareTarget} onCreated={setCreatedShare} />
      <ShareSuccessModal share={createdShare} onClose={() => setCreatedShare(null)} />
      {viewingDoc && <DocumentViewerModal doc={viewingDoc} onClose={() => setViewingDoc(null)} />}
    </div>
  );
};

// ── Shares tab ────────────────────────────────────────────────────────────────

const SharesTab = ({ projectId }: { projectId: string }) => {
  const { data: shares = [], isLoading, isError } = useProjectDocShares(projectId);
  const revokeShare = useRevokeDocShare(projectId);
  const { confirm } = useConfirm();

  const handleRevoke = async (share: ProjectDocShare) => {
    const ok = await confirm({ title: 'Revoke Link', message: 'Revoke this share link? Anyone using it will lose access.', confirmText: 'Revoke', variant: 'danger' });
    if (ok) revokeShare.mutate(share.shareToken);
  };

  const isExpired = (s: ProjectDocShare) => {
    if (!s.expiresAt) return false;
    try { return new Date(s.expiresAt) < new Date(); } catch { return false; }
  };

  if (isLoading) return <PageSkeleton />;

  if (isError) {
    return (
      <EmptyState icon={<AlertCircle size={32} />} title="Could not load share links"
        description="There was an error fetching your share links. Please refresh the page and try again." />
    );
  }

  if (shares.length === 0) {
    return (
      <EmptyState icon={<Link2 size={32} />} title="No active share links"
        description="Right-click any folder or document and choose Share to generate a public link." />
    );
  }

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {shares.length} share link{shares.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* List */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        {shares.map((share, idx) => {
          const expired = isExpired(share);
          const name = share.targetName || (share.shareType === 'FOLDER' ? 'Folder' : 'Document');
          return (
            <div key={share.id}
              className={`flex items-center gap-4 px-5 py-4 transition-colors ${idx !== shares.length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''} ${expired ? 'opacity-60' : 'hover:bg-gray-50 dark:hover:bg-gray-750'}`}>

              {/* Icon */}
              <div className={`p-2.5 rounded-xl shrink-0 ${expired ? 'bg-red-50 dark:bg-red-900/20 text-red-400' : share.shareType === 'FOLDER' ? 'bg-green-50 dark:bg-green-900/20 text-green-600' : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600'}`}>
                {share.shareType === 'FOLDER' ? <Folder size={18} /> : <FileText size={18} />}
              </div>

              {/* Name + meta */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{name}</p>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${expired ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 'bg-green-100 dark:bg-green-900/30 text-green-600'}`}>
                    {expired ? 'Expired' : 'Active'}
                  </span>
                  <span className="text-xs text-gray-400">
                    {share.accessLevel === 'DOWNLOAD' ? '↓ Download' : '👁 View only'}
                  </span>
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Eye size={11} /> {share.viewCount} views
                  </span>
                  {share.expiresAt ? (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock size={11} /> Expires {fmtDate(share.expiresAt)}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">No expiry</span>
                  )}
                </div>
              </div>

              {/* URL preview + copy */}
              {share.shareUrl && (
                <div className="hidden sm:flex items-center gap-2 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-3 py-2 max-w-[200px]">
                  <Link2 size={11} className="text-gray-400 shrink-0" />
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate flex-1">
                    {share.shareToken.slice(0, 12)}…
                  </span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {share.shareUrl && <CopyBtn text={share.shareUrl} />}
                <button onClick={() => handleRevoke(share)} title="Revoke link"
                  className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Files tab (main browser) ──────────────────────────────────────────────────

interface FilesTabProps { projectId: string; canWrite: boolean; canAdmin: boolean; canDelete: boolean; canShare: boolean; currentUserId?: string; onSwitchToShares?: () => void }

const FilesTab = ({ projectId, canWrite, canAdmin, canDelete, canShare, currentUserId, onSwitchToShares }: FilesTabProps) => {
  const { confirm } = useConfirm();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [trail, setTrail] = useState<{ id: string | null; name: string }[]>([{ id: null, name: 'Root' }]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [renameFolder, setRenameFolder] = useState<ProjectDocFolder | null>(null);
  const [accessFolder, setAccessFolder] = useState<ProjectDocFolder | null>(null);
  const [shareTarget, setShareTarget] = useState<{ type: 'DOCUMENT' | 'FOLDER'; id: string; name: string } | null>(null);
  const [createdShare, setCreatedShare] = useState<ProjectDocShare | null>(null);
  const [viewingDoc, setViewingDoc] = useState<ProjectDocument | null>(null);

  const { data, isLoading, error } = useDocFolderContents(projectId, currentFolderId);
  const deleteFolder = useDeleteDocFolder(projectId);
  const deleteDoc = useDeleteDocument(projectId);

  const navigateInto = (folder: ProjectDocFolder) => {
    setCurrentFolderId(folder.id);
    setTrail((prev) => [...prev, { id: folder.id, name: folder.name }]);
  };

  const navigateTo = (id: string | null) => {
    const idx = trail.findIndex((c) => c.id === id);
    if (idx >= 0) {
      setTrail((prev) => prev.slice(0, idx + 1));
      setCurrentFolderId(id);
    }
  };

  const handleDeleteFolder = async (folder: ProjectDocFolder) => {
    const ok = await confirm({ title: 'Delete Folder', message: `Delete "${folder.name}" and all its contents? This cannot be undone.`, confirmText: 'Delete', variant: 'danger' });
    if (ok) deleteFolder.mutate(folder.id);
  };

  const handleDeleteDoc = async (doc: ProjectDocument) => {
    const ok = await confirm({ title: 'Delete Document', message: `Delete "${doc.name || doc.fileName}"? This cannot be undone.`, confirmText: 'Delete', variant: 'danger' });
    if (ok) deleteDoc.mutate(doc.id);
  };

  const folders  = data?.subFolders ?? [];
  const docs     = data?.documents  ?? [];
  const isEmpty  = folders.length === 0 && docs.length === 0;

  return (
    <div className="space-y-6">
      {/* ── Toolbar: actions left, view toggle right ── */}
      <div className="flex items-center justify-between gap-3">
        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {canWrite && (
            <>
              <button onClick={() => setShowUpload(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors shadow-sm">
                <Upload size={15} /> Upload File
              </button>
              <button onClick={() => setShowNewFolder(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:border-blue-300 dark:hover:border-blue-600 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                <FolderPlus size={15} /> New Folder
              </button>
            </>
          )}
          {canShare && (
            <button onClick={() => onSwitchToShares?.()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:border-blue-300 dark:hover:border-blue-600 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
              <Share2 size={15} /> Share Links
            </button>
          )}
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg border border-gray-200 dark:border-gray-700 shrink-0">
          <button onClick={() => setViewMode('list')} title="List view"
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-white shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>
            <List size={15} />
          </button>
          <button onClick={() => setViewMode('grid')} title="Grid view"
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-white shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>
            <Grid size={15} />
          </button>
        </div>
      </div>

      {/* ── Breadcrumbs ── */}
      {trail.length > 1 && (
        <Breadcrumbs trail={trail} onNavigate={navigateTo} />
      )}

      {/* Error */}
      {error && <Alert type="error" message={(error as Error).message} />}

      {/* Loading */}
      {isLoading && <PageSkeleton />}

      {/* Empty state */}
      {!isLoading && isEmpty && (
        <EmptyState
          icon={<Folder size={36} />}
          title="This folder is empty"
          description={canWrite ? 'Create a folder or upload a file to get started.' : 'No files here yet.'}
          action={canWrite ? <Button icon={<Plus size={14} />} onClick={() => setShowUpload(true)}>Upload File</Button> : undefined}
        />
      )}

      {/* ── Folders Section ── */}
      {!isLoading && folders.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Folders
              <span className="ml-2 text-xs font-normal text-gray-400">({folders.length})</span>
            </h2>
          </div>
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {(folders as ProjectDocFolder[]).map((f) => (
                <FolderCard key={f.id} folder={f}
                  onOpen={() => navigateInto(f)}
                  onRename={() => setRenameFolder(f)}
                  onDelete={() => handleDeleteFolder(f)}
                  onShare={() => setShareTarget({ type: 'FOLDER', id: f.id, name: f.name })}
                  onManageAccess={() => setAccessFolder(f)}
                  canWrite={canWrite} canAdmin={canAdmin} canDelete={canDelete} currentUserId={currentUserId}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden shadow-sm">
              {(folders as ProjectDocFolder[]).map((f) => (
                <div key={f.id} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-750 group cursor-pointer transition-colors" onClick={() => navigateInto(f)}>
                  <Folder size={18} className="text-green-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{f.name}</p>
                      {f.visibility === 'RESTRICTED' && <Lock size={11} className="text-violet-500" />}
                    </div>
                    <p className="text-xs text-gray-400">Folder · {fmtDate(f.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {canShare && <button onClick={(e) => { e.stopPropagation(); setShareTarget({ type: 'FOLDER', id: f.id, name: f.name }); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-600 transition-colors" title="Share"><Share2 size={14} /></button>}
                    {(canWrite || f.createdBy === currentUserId) && <button onClick={(e) => { e.stopPropagation(); setRenameFolder(f); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition-colors" title="Rename"><Edit2 size={14} /></button>}
                    {(canAdmin || f.createdBy === currentUserId) && <button onClick={(e) => { e.stopPropagation(); setAccessFolder(f); }} className={`p-1.5 rounded-lg transition-colors ${f.visibility === 'RESTRICTED' ? 'text-violet-500 bg-violet-50 dark:bg-violet-900/30' : 'text-gray-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20'}`} title="Manage access"><Lock size={14} /></button>}
                    {(canAdmin || canDelete || f.createdBy === currentUserId) && <button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(f); }} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-600 transition-colors" title="Delete"><Trash2 size={14} /></button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Files Section ── */}
      {!isLoading && docs.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Files
              <span className="ml-2 text-xs font-normal text-gray-400">({docs.length})</span>
            </h2>
          </div>
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {(docs as ProjectDocument[]).map((d) => (
                <DocCard key={d.id} doc={d}
                  onOpen={() => setViewingDoc(d)}
                  onShare={() => setShareTarget({ type: 'DOCUMENT', id: d.id, name: d.name || d.fileName })}
                  onDelete={() => handleDeleteDoc(d)}
                  canAdmin={canAdmin} canDelete={canDelete} isOwner={d.createdBy === currentUserId}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden shadow-sm">
              {(docs as ProjectDocument[]).map((d) => {
                const ext = d.fileExtension || d.fileName?.split('.').pop() || '';
                return (
                  <div key={d.id} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-750 group cursor-pointer transition-colors" onClick={() => setViewingDoc(d)}>
                    <div className={`p-1.5 rounded-md bg-gradient-to-br ${extColor(ext)} text-white shrink-0`}>{fileIcon(ext, 14)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{d.name || d.fileName}</p>
                      <p className="text-xs text-gray-400">{ext?.toUpperCase()} · {d.fileSizeKb > 0 ? fmtSize(d.fileSizeKb) : fmtDate(d.createdAt)}</p>
                    </div>
                    <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 px-2 py-0.5 rounded-full font-medium shrink-0">v{d.currentVersion}</span>
                    <div className="flex items-center gap-1.5">
                      {canShare && <button onClick={(e) => { e.stopPropagation(); setShareTarget({ type: 'DOCUMENT', id: d.id, name: d.name || d.fileName }); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-600 transition-colors" title="Share"><Share2 size={14} /></button>}
                      {(canAdmin || canDelete || d.createdBy === currentUserId) && <button onClick={(e) => { e.stopPropagation(); handleDeleteDoc(d); }} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-600 transition-colors" title="Delete"><Trash2 size={14} /></button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <NewFolderModal open={showNewFolder} onClose={() => setShowNewFolder(false)} projectId={projectId} parentFolderId={currentFolderId} />
      <UploadModal open={showUpload} onClose={() => setShowUpload(false)} projectId={projectId} folderId={currentFolderId} canWrite={canWrite} />
      <RenameFolderModal open={!!renameFolder} onClose={() => setRenameFolder(null)} projectId={projectId} folder={renameFolder} />
      <FolderAccessModal open={!!accessFolder} onClose={() => setAccessFolder(null)} projectId={projectId} folder={accessFolder} />
      <ShareModal open={!!shareTarget} onClose={() => setShareTarget(null)} projectId={projectId} target={shareTarget} onCreated={setCreatedShare} />
      <ShareSuccessModal share={createdShare} onClose={() => setCreatedShare(null)} />
      {viewingDoc && <DocumentViewerModal doc={viewingDoc} onClose={() => setViewingDoc(null)} />}
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────

const ProjectDocsPage = () => {
  const { projectId, tenantSlug } = useParams<{ projectId: string; tenantSlug: string }>();
  const { user } = useAuth();
  const { isDark, toggleDark } = useTheme();
  const navigate = useNavigate();
  const { data: project } = useProject(projectId ?? '');
  const [activeTab, setActiveTab] = useState<Tab>('files');

  if (!projectId) return null;

  const isAdmin   = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN';
  const canWrite  = hasPermission(user, PERMISSIONS.DOC_WRITE)  || isAdmin;
  const canDelete = hasPermission(user, PERMISSIONS.DOC_DELETE) || isAdmin;
  const canAdmin  = hasPermission(user, PERMISSIONS.DOC_ADMIN)  || isAdmin;
  const canShare  = hasPermission(user, PERMISSIONS.DOC_SHARE)  || isAdmin;

  const projectName = (project as { name?: string } | undefined)?.name ?? 'Project';
  const backUrl = tenantSlug ? `/${tenantSlug}/projects/${projectId}` : `/projects/${projectId}`;

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'files',  label: 'Files',          icon: <FolderOpen size={15} /> },
    { key: 'all',    label: 'All Documents',   icon: <FileText size={15} /> },
    { key: 'shares', label: 'Share Links',     icon: <Link2 size={15} /> },
  ];

  return (
    <Layout>
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-screen-2xl mx-auto space-y-5">

        {/* ── Project context bar ── */}
        <div className="flex items-center justify-between gap-3">
          {/* Left: back + breadcrumb */}
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => navigate(backUrl)}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors shrink-0"
              title="Back to project">
              <ArrowLeft size={16} />
            </button>
            <nav className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 min-w-0">
              <span className="hidden sm:inline truncate max-w-[120px]">Projects</span>
              <ChevronRight size={13} className="hidden sm:block shrink-0 text-gray-300 dark:text-gray-600" />
              <span className="font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[180px]"
                title={projectName}>{projectName}</span>
              <ChevronRight size={13} className="shrink-0 text-gray-300 dark:text-gray-600" />
              <span className="font-medium text-blue-600 dark:text-blue-400 truncate">Docs</span>
            </nav>
          </div>

          {/* Right: theme toggle + tab bar */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Theme toggle */}
            <button onClick={toggleDark}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors">
              {isDark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            {/* Tab bar */}
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
              {tabs.map((tab) => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.key
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}>
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Page title ── */}
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Documentation Hub</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {projectName} · Manage files, folders and share links
          </p>
        </div>

        {/* Tab content */}
        {activeTab === 'files'  && <FilesTab  projectId={projectId} canWrite={canWrite} canAdmin={canAdmin} canDelete={canDelete} canShare={canShare} currentUserId={user?.id} onSwitchToShares={() => setActiveTab('shares')} />}
        {activeTab === 'all'    && <AllDocsTab projectId={projectId} canAdmin={canAdmin} canDelete={canDelete} canShare={canShare} />}
        {activeTab === 'shares' && <SharesTab  projectId={projectId} />}
      </div>
    </Layout>
  );
};

export default ProjectDocsPage;
