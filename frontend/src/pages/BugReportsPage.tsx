import React, { useState, useMemo, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bug, Plus, Search, CheckCircle2, Clock, AlertCircle,
  ChevronRight, X, Send, RotateCcw, Settings,
  Paperclip, Tag, User, Calendar, MessageSquare,
  ToggleLeft, ToggleRight, Circle, Layers, Zap, Eye, Reply, Upload, Trash2, Loader2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Modal, { ModalActions } from '../components/ui/Modal';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/Spinner';
import { useAuth } from '../contexts/AuthContext';
import {
  useBugReports, useAllBugReports, useSubmitBugReport,
  useUpdateBugReport, useResolveBugReport, useReplyBugReport,
  useReporterReplyBugReport, useBugConfig, useSaveBugConfig,
} from '../hooks/useBugReports';
import { BugReport, bugApi } from '../lib/api';
import { useI18n } from '../contexts/I18nContext';
import ReportBugWidget from '../components/bugs/ReportBugWidget';

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  BUG:             { label: 'Bug',             color: 'bg-red-100 text-red-700 border-red-200',         icon: <Bug size={11} /> },
  ISSUE:           { label: 'Issue',           color: 'bg-orange-100 text-orange-700 border-orange-200', icon: <AlertCircle size={11} /> },
  FEEDBACK:        { label: 'Feedback',        color: 'bg-blue-100 text-blue-700 border-blue-200',       icon: <MessageSquare size={11} /> },
  FEATURE_REQUEST: { label: 'Feature Request', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: <Zap size={11} /> },
};

const SEV_META: Record<string, { label: string; dot: string; badge: string }> = {
  CRITICAL: { label: 'Critical', dot: 'bg-red-500',    badge: 'bg-red-100 text-red-700 border-red-200' },
  HIGH:     { label: 'High',     dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700 border-orange-200' },
  MEDIUM:   { label: 'Medium',   dot: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-700 border-amber-200' },
  LOW:      { label: 'Low',      dot: 'bg-green-500',  badge: 'bg-green-100 text-green-700 border-green-200' },
};

const STATUS_META: Record<string, { label: string; icon: React.ReactNode; badge: string }> = {
  OPEN:      { label: 'Open',       icon: <Circle size={12} />,        badge: 'bg-gray-100 text-gray-600 border-gray-200' },
  IN_REVIEW: { label: 'In Review',  icon: <Eye size={12} />,           badge: 'bg-blue-100 text-blue-700 border-blue-200' },
  RESOLVED:  { label: 'Resolved',   icon: <CheckCircle2 size={12} />,  badge: 'bg-green-100 text-green-700 border-green-200' },
  CLOSED:    { label: 'Closed',     icon: <X size={12} />,             badge: 'bg-gray-100 text-gray-500 border-gray-200' },
  DUPLICATE: { label: 'Duplicate',  icon: <Layers size={12} />,        badge: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
};

const fmtDate = (d?: string) => {
  if (!d) return '';
  try { return format(parseISO(d), 'dd MMM yyyy'); } catch { return d; }
};

// ─── Status / Severity badge ──────────────────────────────────────────────────

const StatusBadge = ({ status }: { status?: string }) => {
  const m = STATUS_META[status ?? ''] ?? STATUS_META.OPEN;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${m.badge}`}>
      {m.icon}{m.label}
    </span>
  );
};

const SevBadge = ({ sev }: { sev?: string }) => {
  const m = SEV_META[sev ?? 'MEDIUM'];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${m.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />{m.label}
    </span>
  );
};

const TypeBadge = ({ type }: { type?: string }) => {
  const m = TYPE_META[type ?? 'BUG'];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${m.color}`}>
      {m.icon}{m.label}
    </span>
  );
};

// ─── Stat card ────────────────────────────────────────────────────────────────

const StatCard = ({ label, value, icon, accent }: {
  label: string; value: number; icon: React.ReactNode; accent: string;
}) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${accent}`}>
      {icon}
    </div>
    <div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400 font-medium mt-0.5">{label}</p>
    </div>
  </div>
);

// ─── Attachment helpers ───────────────────────────────────────────────────────

interface ReplyAttachment {
  id:        string;
  file:      File;
  preview:   string | null;
  base64?:   string;
  fileType:  'IMAGE' | 'VIDEO' | 'FILE';
  uploading: boolean;
  error?:    string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function detectType(file: File): 'IMAGE' | 'VIDEO' | 'FILE' {
  if (file.type.startsWith('image/')) return 'IMAGE';
  if (file.type.startsWith('video/')) return 'VIDEO';
  return 'FILE';
}

// ─── Bug Report Attachments — gallery shown inside the detail modal ──────────
// Fetches the full report via bugApi.get (which returns `attachments`) and
// renders images inline, videos with a player, and other files as download
// chips. Mirrors the pattern used by the super-admin slider.
const BugReportAttachments: React.FC<{ reportId: string; replyAt?: string | null }> = ({ reportId, replyAt }) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['bug-detail', reportId],
    queryFn:  () => bugApi.get(reportId).then((d: any) => d),
    enabled:  !!reportId,
    staleTime: 30_000,
  });

  const allAttachments: any[] = (data as any)?.attachments ?? [];

  // Split into "original" (uploaded with the report) vs "reply" (uploaded
  // when the reporter posted their follow-up reply) so the user can tell
  // which set belongs to which conversation step.
  const replyMs = replyAt ? new Date(replyAt).getTime() : 0;
  const originals = replyMs
    ? allAttachments.filter((a: any) => {
        const t = a.CREATEDTIME ? new Date(a.CREATEDTIME).getTime() : 0;
        // Allow a 30-second grace so attachments uploaded right after the
        // reply still count as reply attachments, not original.
        return !t || t < replyMs - 30_000;
      })
    : allAttachments;
  const replyAttachments = replyMs
    ? allAttachments.filter((a: any) => {
        const t = a.CREATEDTIME ? new Date(a.CREATEDTIME).getTime() : 0;
        return t >= replyMs - 30_000;
      })
    : [];

  if (isLoading) return <p className="text-xs text-gray-400">Loading attachments…</p>;
  if (isError)   return <p className="text-xs text-red-400">Could not load attachments.</p>;
  if (allAttachments.length === 0) return null;

  const renderOne = (att: any) => {
    const url     = att.file_url ?? '';
    const name    = att.file_name ?? 'file';
    const mime    = String(att.mime_type ?? '').toLowerCase();
    const ftype   = String(att.file_type ?? '').toLowerCase();
    const isImage = mime.startsWith('image/') || ftype === 'image';
    const isVideo = mime.startsWith('video/') || ftype === 'video';
    const sizeKb  = att.file_size ? Math.round(Number(att.file_size) / 1024) : null;

    if (isImage) {
      return (
        <a key={att.ROWID ?? url} href={url} target="_blank" rel="noopener noreferrer"
          className="block rounded-xl overflow-hidden border border-gray-200 hover:border-indigo-400 transition-colors shrink-0"
          title={`${name} — click to open full size`}>
          <img src={url} alt={name} loading="lazy" className="h-32 w-auto object-cover bg-gray-50" />
          <p className="px-2 py-1 text-[10px] text-gray-500 truncate max-w-[160px]">{name}</p>
        </a>
      );
    }
    if (isVideo) {
      return (
        <div key={att.ROWID ?? url} className="rounded-xl overflow-hidden border border-gray-200 shrink-0">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={url} controls className="h-32 max-w-[240px] object-contain bg-black" />
          <p className="px-2 py-1 text-[10px] text-gray-500 truncate max-w-[240px]">{name}</p>
        </div>
      );
    }
    return (
      <a key={att.ROWID ?? url} href={url} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 transition-colors text-xs text-gray-700 max-w-[240px]"
        title={name}>
        <Paperclip size={14} className="text-gray-400 shrink-0" />
        <div className="min-w-0">
          <p className="font-medium truncate">{name}</p>
          {sizeKb !== null && <p className="text-[10px] text-gray-400">{sizeKb} KB</p>}
        </div>
      </a>
    );
  };

  return (
    <div className="space-y-3">
      {originals.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Paperclip size={12} className="text-gray-400" />
            Attachments ({originals.length})
          </p>
          <div className="flex flex-wrap gap-2.5">
            {originals.map(renderOne)}
          </div>
        </div>
      )}
      {replyAttachments.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-indigo-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Reply size={12} />
            Reply attachments ({replyAttachments.length})
          </p>
          <div className="flex flex-wrap gap-2.5">
            {replyAttachments.map(renderOne)}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Detail / management modal ────────────────────────────────────────────────

const DetailModal = ({ report, isAdmin, open, onClose }: {
  report: BugReport | null; isAdmin: boolean; open: boolean; onClose: () => void;
}) => {
  const update        = useUpdateBugReport();
  const resolve       = useResolveBugReport();
  const reply         = useReplyBugReport();
  const reporterReply = useReporterReplyBugReport();

  const [notes, setNotes]           = useState('');
  const [status, setStatus]         = useState('');
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');
  const [replyText, setReplyText]   = useState('');
  const [replyError, setReplyError] = useState('');
  const [replySuccess, setReplySuccess] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<ReplyAttachment[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const replyFileRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open && report) {
      setStatus(report.status ?? 'OPEN');
      setNotes(report.resolution_notes ?? '');
      setReplyText(report.reporter_reply ?? '');
      setReplyAttachments([]);
      setUploadingFiles(false);
      setError(''); setSuccess('');
      setReplyError(''); setReplySuccess('');
    }
  }, [open, report]);

  const handleStatusUpdate = async () => {
    if (!report?.ROWID) return;
    setError(''); setSuccess('');
    try {
      await update.mutateAsync({ id: report.ROWID, data: { status: status as BugReport['status'] } });
      setSuccess('Status updated');
    } catch (err: unknown) { setError((err as Error).message); }
  };

  const handleReply = async () => {
    if (!report?.ROWID || !notes.trim()) { setError('Note is required'); return; }
    setError(''); setSuccess('');
    try {
      await reply.mutateAsync({ id: report.ROWID, resolution_notes: notes });
      setSuccess('Note saved and visible to the reporter');
    } catch (err: unknown) { setError((err as Error).message); }
  };

  const handleResolve = async () => {
    if (!report?.ROWID) return;
    setError(''); setSuccess('');
    try {
      await resolve.mutateAsync({ id: report.ROWID, resolution_notes: notes });
      setSuccess('Report marked as resolved — reporter notified');
      setStatus('RESOLVED');
    } catch (err: unknown) { setError((err as Error).message); }
  };

  const handleReplyFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (replyAttachments.length + arr.length > 5) {
      setReplyError('Maximum 5 attachments allowed.');
      return;
    }
    setReplyError('');
    for (const file of arr) {
      if (file.size > 50 * 1024 * 1024) { setReplyError(`${file.name} exceeds 50 MB.`); continue; }
      const id      = `${Date.now()}-${Math.random()}`;
      const ft      = detectType(file);
      const preview = ft !== 'FILE' ? URL.createObjectURL(file) : null;
      setReplyAttachments((prev) => [...prev, { id, file, preview, fileType: ft, uploading: false }]);
      try {
        const b64 = await fileToBase64(file);
        setReplyAttachments((prev) => prev.map((a) => a.id === id ? { ...a, base64: b64 } : a));
      } catch (_) {}
    }
  }, [replyAttachments.length]);

  const removeReplyAttachment = (id: string) => {
    setReplyAttachments((prev) => {
      const a = prev.find((x) => x.id === id);
      if (a?.preview) URL.revokeObjectURL(a.preview);
      return prev.filter((x) => x.id !== id);
    });
  };

  const handleReporterReply = async () => {
    if (!report?.ROWID || !replyText.trim()) { setReplyError('Reply cannot be empty'); return; }
    setReplyError(''); setReplySuccess('');
    try {
      await reporterReply.mutateAsync({ id: report.ROWID, reply: replyText });

      // Upload any attached files
      if (replyAttachments.length > 0) {
        setUploadingFiles(true);
        for (const att of replyAttachments) {
          if (!att.base64) continue;
          setReplyAttachments((prev) => prev.map((a) => a.id === att.id ? { ...a, uploading: true } : a));
          try {
            await bugApi.uploadAttachment(report.ROWID!, {
              base64: att.base64, file_name: att.file.name,
              file_type: att.fileType, mime_type: att.file.type, file_size: att.file.size,
            });
            setReplyAttachments((prev) => prev.map((a) => a.id === att.id ? { ...a, uploading: false } : a));
          } catch (_) {
            setReplyAttachments((prev) => prev.map((a) => a.id === att.id ? { ...a, uploading: false, error: 'Upload failed' } : a));
          }
        }
        setUploadingFiles(false);
      }

      setReplySuccess('Your reply has been submitted — the admin team can see it');
      setReplyAttachments([]);
    } catch (err: unknown) { setReplyError((err as Error).message); }
  };

  if (!report) return null;

  return (
    <Modal open={open} onClose={onClose} size="lg">
      {/* Header */}
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center shrink-0 mt-0.5">
          <Bug size={17} className="text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-900 leading-snug">{report.title}</h2>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <TypeBadge type={report.report_type} />
            <SevBadge sev={report.severity} />
            <StatusBadge status={report.status} />
          </div>
        </div>
      </div>

      {error   && <Alert type="error"   message={error}   className="mb-4" />}
      {success && <Alert type="success" message={success} className="mb-4" />}

      <div className="space-y-4">
        {/* Description */}
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Description</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{report.description}</p>
        </div>

        {/* Meta row */}
        <div className="grid grid-cols-2 gap-3 text-xs text-gray-500">
          {report.reporter_name && (
            <div className="flex items-center gap-1.5">
              <User size={12} className="text-gray-400" />
              <span>{report.reporter_name}</span>
            </div>
          )}
          {report.CREATEDTIME && (
            <div className="flex items-center gap-1.5">
              <Calendar size={12} className="text-gray-400" />
              <span>{fmtDate(report.CREATEDTIME)}</span>
            </div>
          )}
          {report.page_url && (
            <div className="flex items-center gap-1.5 col-span-2">
              <Tag size={12} className="text-gray-400" />
              <span className="truncate">{report.page_url}</span>
            </div>
          )}
          {Number(report.attachment_count) > 0 && (
            <div className="flex items-center gap-1.5">
              <Paperclip size={12} className="text-gray-400" />
              <span>{report.attachment_count} attachment{Number(report.attachment_count) > 1 ? 's' : ''}</span>
            </div>
          )}
        </div>

        {/* ── Attachment gallery — visible to both reporter and admin ── */}
        {Number(report.attachment_count) > 0 && report.ROWID && (
          <div className="border-t border-gray-100 pt-4">
            <BugReportAttachments
              reportId={report.ROWID}
              replyAt={report.reporter_reply_at ?? null}
            />
          </div>
        )}

        {/* ── REPORTER VIEW ─────────────────────────────────────── */}
        {!isAdmin && (
          <>
            {/* Admin note (if any) */}
            {report.resolution_notes && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare size={13} className="text-green-600" />
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wider">Admin Note</p>
                </div>
                <p className="text-sm text-green-800 whitespace-pre-wrap leading-relaxed">{report.resolution_notes}</p>
                {report.resolved_by && (
                  <p className="text-xs text-green-600 mt-2">— {report.resolved_by}{report.resolved_at ? `, ${fmtDate(report.resolved_at)}` : ''}</p>
                )}
              </div>
            )}

            {/* Existing reporter reply (read-only preview) */}
            {report.reporter_reply && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Reply size={13} className="text-indigo-600" />
                  <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wider">Your Reply</p>
                  {report.reporter_reply_at && (
                    <span className="ml-auto text-[11px] text-indigo-400">{fmtDate(report.reporter_reply_at)}</span>
                  )}
                </div>
                <p className="text-sm text-indigo-900 whitespace-pre-wrap leading-relaxed">{report.reporter_reply}</p>
              </div>
            )}

            {/* Reply form — always available so reporter can add/update their note */}
            <div className="border border-indigo-100 bg-indigo-50/40 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Reply size={14} className="text-indigo-500" />
                <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wider">
                  {report.reporter_reply ? 'Update Your Reply' : 'Add a Reply'}
                </p>
              </div>
              <p className="text-xs text-gray-500">
                {report.resolution_notes
                  ? 'Respond to the admin note or add more information about your report.'
                  : 'Add extra context or follow-up information to help the team investigate.'}
              </p>
              {replyError   && <Alert type="error"   message={replyError}   />}
              {replySuccess && <Alert type="success" message={replySuccess} />}
              <textarea
                className="form-input min-h-[90px] resize-y text-sm w-full"
                placeholder="Type your reply or additional info here…"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
              />

              {/* Attachment previews */}
              {replyAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {replyAttachments.map((att) => (
                    <div key={att.id} className="relative group rounded-lg border border-gray-200 overflow-hidden bg-white">
                      {att.fileType === 'IMAGE' && att.preview ? (
                        <img src={att.preview} alt={att.file.name} className="h-16 w-20 object-cover" />
                      ) : (
                        <div className="h-16 w-20 flex flex-col items-center justify-center gap-1 bg-gray-50 px-2">
                          <Paperclip size={14} className="text-gray-400" />
                          <p className="text-[10px] text-gray-500 truncate w-full text-center">{att.file.name}</p>
                        </div>
                      )}
                      {att.uploading && (
                        <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                          <Loader2 size={14} className="animate-spin text-indigo-500" />
                        </div>
                      )}
                      {att.error && (
                        <div className="absolute inset-0 bg-red-50/80 flex items-center justify-center">
                          <p className="text-[9px] text-red-600 font-semibold text-center px-1">{att.error}</p>
                        </div>
                      )}
                      {!att.uploading && (
                        <button
                          type="button"
                          onClick={() => removeReplyAttachment(att.id)}
                          className="absolute top-0.5 right-0.5 bg-white/90 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Action row */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  onClick={handleReporterReply}
                  loading={reporterReply.isPending || uploadingFiles}
                  icon={<Send size={13} />}
                >
                  {report.reporter_reply ? 'Update Reply' : 'Submit Reply'}
                </Button>
                <button
                  type="button"
                  onClick={() => replyFileRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Upload size={13} /> Attach files
                </button>
                {replyAttachments.length > 0 && (
                  <span className="text-xs text-gray-400">{replyAttachments.length} file{replyAttachments.length > 1 ? 's' : ''} selected</span>
                )}
              </div>
              <input
                ref={replyFileRef}
                type="file"
                multiple
                accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip"
                className="hidden"
                onChange={(e) => e.target.files && handleReplyFiles(e.target.files)}
              />
            </div>
          </>
        )}

        {/* ── ADMIN VIEW ────────────────────────────────────────── */}
        {isAdmin && (
          <>
            {/* Reporter reply — prominently shown to admin */}
            {report.reporter_reply && (
              <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Reply size={14} className="text-indigo-600" />
                  <p className="text-sm font-bold text-indigo-700">Reporter's Reply</p>
                  {report.reporter_reply_at && (
                    <span className="ml-auto text-xs text-indigo-400 font-medium">{fmtDate(report.reporter_reply_at)}</span>
                  )}
                </div>
                <p className="text-sm text-indigo-900 whitespace-pre-wrap leading-relaxed">{report.reporter_reply}</p>
                <p className="text-xs text-indigo-500 mt-2 font-medium">
                  From: {report.reporter_name ?? report.reporter_email ?? 'Reporter'}
                </p>
              </div>
            )}

            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Admin Actions</p>

              {/* Status changer */}
              <div className="flex items-center gap-2">
                <select className="form-select flex-1" value={status}
                  onChange={(e) => setStatus(e.target.value)}>
                  <option value="OPEN">Open</option>
                  <option value="IN_REVIEW">In Review</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="CLOSED">Closed</option>
                  <option value="DUPLICATE">Duplicate</option>
                </select>
                <Button variant="outline" size="sm" onClick={handleStatusUpdate}
                  loading={update.isPending} icon={<RotateCcw size={13} />}>
                  Update Status
                </Button>
              </div>

              {/* Resolution note */}
              <div>
                <label className="form-label">
                  Resolution Note <span className="text-gray-400 font-normal">(visible to reporter)</span>
                </label>
                <textarea className="form-input min-h-[80px] resize-y text-sm"
                  placeholder="Describe what was done or what the reporter should try…"
                  value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleReply}
                  loading={reply.isPending} icon={<MessageSquare size={13} />}>
                  Save Note
                </Button>
                {report.status !== 'RESOLVED' && report.status !== 'CLOSED' && (
                  <Button size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={handleResolve}
                    loading={resolve.isPending}
                    icon={<CheckCircle2 size={13} />}>
                    Mark Resolved
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <ModalActions>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </ModalActions>
    </Modal>
  );
};

// ─── Report card ──────────────────────────────────────────────────────────────

const STATUS_SELECT_CLASS: Record<string, string> = {
  OPEN:      'bg-gray-100 text-gray-600 border-gray-300',
  IN_REVIEW: 'bg-blue-100 text-blue-700 border-blue-300',
  RESOLVED:  'bg-green-100 text-green-700 border-green-300',
  CLOSED:    'bg-gray-100 text-gray-500 border-gray-300',
  DUPLICATE: 'bg-yellow-100 text-yellow-700 border-yellow-300',
};

const ReportCard = ({ report, isAdmin, onClick }: {
  report: BugReport; isAdmin: boolean; onClick: () => void;
}) => {
  const update = useUpdateBugReport();

  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value;
    if (newStatus === report.status || !report.ROWID) return;
    try {
      await update.mutateAsync({ id: report.ROWID, data: { status: newStatus as BugReport['status'] } });
    } catch (_) {}
  };

  return (
    <div
      role="button" tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      className="w-full text-left bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md hover:border-indigo-200 transition-all p-4 flex gap-4 group cursor-pointer"
    >
      {/* Left accent */}
      <div className={`w-1 rounded-full shrink-0 self-stretch ${
        report.severity === 'CRITICAL' ? 'bg-red-500' :
        report.severity === 'HIGH'     ? 'bg-orange-500' :
        report.severity === 'MEDIUM'   ? 'bg-amber-400' : 'bg-green-400'
      }`} />

      <div className="flex-1 min-w-0">
        {/* Top row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <TypeBadge type={report.report_type} />
            <SevBadge sev={report.severity} />
          </div>

          {isAdmin ? (
            <div onClick={(e) => e.stopPropagation()}>
              <select
                value={report.status ?? 'OPEN'}
                onChange={handleStatusChange}
                disabled={update.isPending}
                className={`text-xs font-semibold rounded-full border px-2.5 py-0.5 cursor-pointer outline-none transition-colors appearance-none disabled:opacity-60 ${STATUS_SELECT_CLASS[report.status ?? 'OPEN'] ?? STATUS_SELECT_CLASS.OPEN}`}
              >
                <option value="OPEN">Open</option>
                <option value="IN_REVIEW">In Review</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
                <option value="DUPLICATE">Duplicate</option>
              </select>
            </div>
          ) : (
            <StatusBadge status={report.status} />
          )}
        </div>

        <p className="text-sm font-semibold text-gray-900 truncate leading-snug">{report.title}</p>
        <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">{report.description}</p>

        {/* Bottom meta */}
        <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-gray-400">
          {isAdmin && report.reporter_name && (
            <span className="flex items-center gap-1">
              <User size={11} />{report.reporter_name}
            </span>
          )}
          {report.CREATEDTIME && (
            <span className="flex items-center gap-1">
              <Calendar size={11} />{fmtDate(report.CREATEDTIME)}
            </span>
          )}
          {Number(report.attachment_count) > 0 && (
            <span className="flex items-center gap-1">
              <Paperclip size={11} />{report.attachment_count}
            </span>
          )}
          {report.resolution_notes && (
            <span className="flex items-center gap-1 text-green-600">
              <MessageSquare size={11} />Has note
            </span>
          )}
          {report.reporter_reply && (
            <span className="flex items-center gap-1 text-indigo-600 font-semibold">
              <Reply size={11} />Reporter replied
            </span>
          )}
        </div>
      </div>

      <ChevronRight size={16} className="text-gray-300 group-hover:text-indigo-400 transition-colors shrink-0 self-center" />
    </div>
  );
};

// ─── Config panel ─────────────────────────────────────────────────────────────

const ConfigPanel = ({ onClose }: { onClose: () => void }) => {
  const { data: rawConfig } = useBugConfig();
  const saveConfig = useSaveBugConfig();
  const [enabled, setEnabled] = useState<boolean>(true);
  const [error, setError]     = useState('');
  const [saved, setSaved]     = useState(false);

  React.useEffect(() => {
    if (rawConfig) {
      const cfg = rawConfig as any;
      setEnabled(cfg.enabled === true || String(cfg.enabled) !== 'false');
    }
  }, [rawConfig]);

  const handleToggle = async (val: boolean) => {
    setEnabled(val);
    setError(''); setSaved(false);
    try {
      await saveConfig.mutateAsync({ enabled: val });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) { setError((err as Error).message); setEnabled(!val); }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Settings size={16} className="text-gray-500" />
          <span className="text-sm font-bold text-gray-700">Bug Reporting Settings</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100">
          <X size={15} />
        </button>
      </div>

      {error && <Alert type="error" message={error} className="mb-3" />}
      {saved && <Alert type="success" message="Settings saved" className="mb-3" />}

      <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-gray-50">
        <div>
          <p className="text-sm font-semibold text-gray-800">Enable Bug Reporting</p>
          <p className="text-xs text-gray-400 mt-0.5">Allow all team members to submit bug reports and feedback</p>
        </div>
        <button onClick={() => handleToggle(!enabled)} className="shrink-0 ml-4">
          {enabled
            ? <ToggleRight size={36} className="text-indigo-600" />
            : <ToggleLeft  size={36} className="text-gray-400" />}
        </button>
      </div>

      <p className="text-xs text-gray-400 mt-3">
        When disabled, team members see a "not available" message. Their existing reports are preserved.
      </p>
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BugReportsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN';

  const [tab, setTab]           = useState<'mine' | 'all'>('mine');
  const [search, setSearch]     = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType,   setFilterType]   = useState('');
  const [filterSev,    setFilterSev]    = useState('');
  const [showSubmit,   setShowSubmit]   = useState(false);
  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [showConfig,   setShowConfig]   = useState(false);
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  React.useEffect(() => { setPage(1); }, [tab, search, filterStatus, filterType, filterSev]);

  // Queries — pass `all=true` so super admin sees the full result set
  // (paginated internally on the backend past ZCQL's 200-row per-query cap).
  // Gate /reports/all on isAdmin — non-admins hit a 403 otherwise.
  const { data: rawMine = [], isLoading: loadingMine } = useBugReports();
  const { data: rawAll  = [], isLoading: loadingAll  } = useAllBugReports(
    { all: 'true' },
    { enabled: isAdmin }
  );
  const { data: rawConfig } = useBugConfig();

  const cfg         = rawConfig as any;
  const isEnabled   = !cfg || cfg.enabled === true || String(cfg.enabled) !== 'false';
  const myReports   = ((rawMine as any)?.reports ?? (Array.isArray(rawMine) ? rawMine : [])) as BugReport[];
  const allReports  = ((rawAll  as any)?.reports ?? (Array.isArray(rawAll)  ? rawAll  : [])) as BugReport[];
  const activeList  = tab === 'all' && isAdmin ? allReports : myReports;
  const selected    = selectedId ? [...myReports, ...allReports].find((r) => r.ROWID === selectedId) ?? null : null;
  const isLoading   = tab === 'all' ? loadingAll : loadingMine;

  // Stats
  const statSource = isAdmin ? allReports : myReports;
  const stats = useMemo(() => ({
    total:     statSource.length,
    open:      statSource.filter((r) => r.status === 'OPEN').length,
    inReview:  statSource.filter((r) => r.status === 'IN_REVIEW').length,
    resolved:  statSource.filter((r) => r.status === 'RESOLVED' || r.status === 'CLOSED').length,
  }), [statSource]);

  // Filter
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return activeList.filter((r) => {
      if (filterStatus && r.status !== filterStatus) return false;
      if (filterType   && r.report_type !== filterType) return false;
      if (filterSev    && r.severity !== filterSev) return false;
      if (q && !r.title?.toLowerCase().includes(q) && !r.description?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [activeList, search, filterStatus, filterType, filterSev]);

  // Client-side pagination — slice the filtered list into pages
  const totalPages    = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage      = Math.min(page, totalPages);
  const pageStart     = (safePage - 1) * PAGE_SIZE;
  const paginatedList = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  if (isLoading && myReports.length === 0) return <Layout><PageLoader /></Layout>;

  return (
    <Layout>
      <Header
        title={t('nav.bugReports')}
        subtitle={isAdmin ? `${stats.total} total reports across your organisation` : "Track issues you've reported"}
        actions={
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button variant="outline" size="sm" icon={<Settings size={14} />}
                onClick={() => setShowConfig((v) => !v)}>
                Settings
              </Button>
            )}
            {isEnabled && (
              <Button size="sm" icon={<Plus size={14} />} onClick={() => setShowSubmit(true)}>
                Report Issue
              </Button>
            )}
          </div>
        }
      />

      <div className="px-6 pt-6 pb-8 space-y-5">

        {/* Feature disabled banner */}
        {!isEnabled && (
          <Alert
            type="warning"
            message={isAdmin
              ? 'Bug reporting is currently disabled. Enable it in Settings to let your team submit reports.'
              : 'Bug reporting is not available for your organisation at the moment.'}
          />
        )}

        {/* Config panel (admin) */}
        {showConfig && isAdmin && <ConfigPanel onClose={() => setShowConfig(false)} />}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total"     value={stats.total}    accent="bg-indigo-50"  icon={<Bug size={18} className="text-indigo-500" />} />
          <StatCard label="Open"      value={stats.open}     accent="bg-gray-100"   icon={<Circle size={18} className="text-gray-500" />} />
          <StatCard label="In Review" value={stats.inReview} accent="bg-blue-50"    icon={<Clock size={18} className="text-blue-500" />} />
          <StatCard label="Resolved"  value={stats.resolved} accent="bg-green-50"   icon={<CheckCircle2 size={18} className="text-green-500" />} />
        </div>

        {/* Tabs (admin only) */}
        {isAdmin && (
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
            {(['mine', 'all'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {t === 'mine' ? 'My Reports' : `All Reports${allReports.length ? ` (${allReports.length})` : ''}`}
              </button>
            ))}
          </div>
        )}

        {/* Filter bar */}
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text" placeholder="Search reports…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white w-52"
            />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="py-2 pl-3 pr-8 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white text-gray-600">
            <option value="">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="IN_REVIEW">In Review</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
            <option value="DUPLICATE">Duplicate</option>
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
            className="py-2 pl-3 pr-8 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white text-gray-600">
            <option value="">All Types</option>
            <option value="BUG">Bug</option>
            <option value="ISSUE">Issue</option>
            <option value="FEEDBACK">Feedback</option>
            <option value="FEATURE_REQUEST">Feature Request</option>
          </select>
          <select value={filterSev} onChange={(e) => setFilterSev(e.target.value)}
            className="py-2 pl-3 pr-8 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white text-gray-600">
            <option value="">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          {(filterStatus || filterType || filterSev || search) && (
            <button onClick={() => { setSearch(''); setFilterStatus(''); setFilterType(''); setFilterSev(''); }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-500 hover:text-red-600 border border-gray-200 rounded-lg bg-white transition-colors">
              <X size={12} />Clear
            </button>
          )}
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Bug size={40} className="text-gray-300" />}
            title={search || filterStatus || filterType || filterSev ? 'No reports match your filters' : 'No reports yet'}
            description={isEnabled
              ? (search || filterStatus || filterType || filterSev
                  ? 'Try adjusting your filters'
                  : 'When you report a bug or issue, it will appear here')
              : 'Bug reporting is currently disabled'}
            action={isEnabled && !search && !filterStatus && !filterType && !filterSev ? (
              <Button icon={<Plus size={14} />} onClick={() => setShowSubmit(true)}>Report your first issue</Button>
            ) : undefined}
          />
        ) : (
          <>
            <div className="space-y-3">
              {paginatedList.map((r) => (
                <ReportCard
                  key={r.ROWID}
                  report={r}
                  isAdmin={isAdmin}
                  onClick={() => setSelectedId(r.ROWID ?? null)}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Showing <span className="font-semibold text-gray-700">{pageStart + 1}</span>–
                  <span className="font-semibold text-gray-700">{Math.min(pageStart + PAGE_SIZE, filtered.length)}</span>{' '}
                  of <span className="font-semibold text-gray-700">{filtered.length}</span> reports
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-gray-600 px-2">
                    Page <span className="font-semibold text-gray-900">{safePage}</span> of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals — use ReportBugWidget (same component as the floating bug icon)
          so this form has attachment support and matches the bug-icon flow.
          The widget renders in controlled mode (no floating trigger) when given
          `open` / `onOpenChange`. */}
      <ReportBugWidget open={showSubmit} onOpenChange={setShowSubmit} />
      <DetailModal
        report={selected}
        isAdmin={isAdmin}
        open={!!selected}
        onClose={() => setSelectedId(null)}
      />
    </Layout>
  );
}
