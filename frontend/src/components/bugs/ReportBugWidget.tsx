import React, { useState, useRef, useCallback } from 'react';
import {
  Bug, X, Upload, AlertTriangle, MessageSquare,
  Lightbulb, AlertCircle, Send, Loader2, CheckCircle2, Trash2,
} from 'lucide-react';
import { useSubmitBugReport } from '../../hooks/useBugReports';
import { bugApi } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────────

type ReportType = 'BUG' | 'FEEDBACK' | 'ISSUE' | 'FEATURE_REQUEST';
type Severity   = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

interface AttachmentPreview {
  id:        string;
  file:      File;
  preview:   string | null;  // object URL for images/videos
  base64?:   string;
  fileType:  'IMAGE' | 'VIDEO' | 'FILE';
  uploading: boolean;
  uploaded:  boolean;
  error?:    string;
}

const TYPE_OPTIONS: { value: ReportType; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'BUG',             label: 'Bug',            icon: <Bug size={14} />,            color: 'text-red-600 bg-red-50 border-red-200' },
  { value: 'ISSUE',           label: 'Issue',          icon: <AlertTriangle size={14} />,  color: 'text-orange-600 bg-orange-50 border-orange-200' },
  { value: 'FEEDBACK',        label: 'Feedback',       icon: <MessageSquare size={14} />,  color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { value: 'FEATURE_REQUEST', label: 'Feature Request',icon: <Lightbulb size={14} />,      color: 'text-violet-600 bg-violet-50 border-violet-200' },
];

const SEVERITY_OPTIONS: { value: Severity; label: string; color: string }[] = [
  { value: 'CRITICAL', label: 'Critical', color: 'text-red-700   bg-red-100   border-red-300' },
  { value: 'HIGH',     label: 'High',     color: 'text-orange-700 bg-orange-100 border-orange-300' },
  { value: 'MEDIUM',   label: 'Medium',   color: 'text-yellow-700 bg-yellow-100 border-yellow-300' },
  { value: 'LOW',      label: 'Low',      color: 'text-green-700  bg-green-100  border-green-300' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function detectFileType(file: File): 'IMAGE' | 'VIDEO' | 'FILE' {
  if (file.type.startsWith('video/')) return 'VIDEO';
  if (file.type.startsWith('image/')) return 'IMAGE';
  return 'FILE';
}

// ── Main widget ────────────────────────────────────────────────────────────────

interface ReportBugWidgetProps {
  open?:          boolean;
  onOpenChange?:  (v: boolean) => void;
}

export default function ReportBugWidget({ open: openProp, onOpenChange }: ReportBugWidgetProps = {}) {
  const { user } = useAuth();
  const [isOpenInternal, setIsOpenInternal] = useState(false);
  const controlled = openProp !== undefined;
  const isOpen     = controlled ? openProp! : isOpenInternal;
  const [submitted, setSubmitted] = useState(false);

  const [reportType, setReportType] = useState<ReportType>('BUG');
  const [severity,   setSeverity]   = useState<Severity>('MEDIUM');
  const [title,      setTitle]      = useState('');
  const [description,setDescription]= useState('');
  const [attachments,setAttachments]= useState<AttachmentPreview[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { mutateAsync: submitReport } = useSubmitBugReport();

  const handleOpen = () => {
    if (controlled) onOpenChange?.(true);
    else setIsOpenInternal(true);
    setSubmitted(false);
    setError('');
  };

  const handleClose = () => {
    if (controlled) onOpenChange?.(false);
    else setIsOpenInternal(false);
    setTimeout(() => {
      setTitle(''); setDescription(''); setReportType('BUG'); setSeverity('MEDIUM');
      setAttachments([]); setSubmitted(false); setError('');
    }, 300);
  };

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    const MAX = 5;
    if (attachments.length + arr.length > MAX) {
      setError(`Maximum ${MAX} attachments allowed.`);
      return;
    }
    setError('');
    for (const file of arr) {
      const maxMB = 50;
      if (file.size > maxMB * 1024 * 1024) {
        setError(`${file.name} exceeds ${maxMB}MB limit.`);
        continue;
      }
      const id       = `${Date.now()}-${Math.random()}`;
      const fileType = detectFileType(file);
      const preview  = (fileType === 'IMAGE' || fileType === 'VIDEO') ? URL.createObjectURL(file) : null;
      setAttachments((prev) => [...prev, { id, file, preview, fileType, uploading: false, uploaded: false }]);
      try {
        const b64 = await fileToBase64(file);
        setAttachments((prev) => prev.map((a) => a.id === id ? { ...a, base64: b64 } : a));
      } catch (_) {}
    }
  }, [attachments.length]);

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const a = prev.find((x) => x.id === id);
      if (a?.preview) URL.revokeObjectURL(a.preview);
      return prev.filter((x) => x.id !== id);
    });
  };

  const handleSubmit = async () => {
    if (!title.trim()) { setError('Please enter a title.'); return; }
    if (!description.trim()) { setError('Please describe the issue.'); return; }
    setError('');
    setSubmitting(true);

    try {
      // Capture browser info automatically
      const browser_info = JSON.stringify({
        userAgent: navigator.userAgent,
        platform:  navigator.platform,
        viewport:  `${window.innerWidth}x${window.innerHeight}`,
        url:       window.location.href,
      });

      // Submit report
      const result = await submitReport({
        report_type:    reportType,
        title:          title.trim(),
        description:    description.trim(),
        severity,
        page_url:       window.location.href,
        browser_info,
        human_verified: true,
        captcha_score:  1.0,
      } as any);

      const reportId = result?.report?.ROWID || result?.ROWID;

      // Upload attachments sequentially
      if (reportId && attachments.length > 0) {
        for (const att of attachments) {
          if (!att.base64) continue;
          setAttachments((prev) => prev.map((a) => a.id === att.id ? { ...a, uploading: true } : a));
          try {
            await bugApi.uploadAttachment(reportId, {
              base64:    att.base64,
              file_name: att.file.name,
              file_type: att.fileType,
              mime_type: att.file.type,
              file_size: att.file.size,
            });
            setAttachments((prev) => prev.map((a) => a.id === att.id ? { ...a, uploading: false, uploaded: true } : a));
          } catch (_) {
            setAttachments((prev) => prev.map((a) => a.id === att.id ? { ...a, uploading: false, error: 'Upload failed' } : a));
          }
        }
      }

      // Fire notification email after all uploads complete (so images are included)
      if (reportId) {
        try { await bugApi.notify(reportId); } catch (_) {}
      }

      setSubmitted(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Don't render if user doesn't have a session
  if (!user) return null;

  const selectedType = TYPE_OPTIONS.find((t) => t.value === reportType)!;

  return (
    <>
      {/* ── Floating trigger button (standalone/uncontrolled mode only) ── */}
      {!controlled && (
        <button
          onClick={handleOpen}
          title="Report a bug or give feedback"
          className="fixed bottom-6 left-6 z-[99990] flex items-center gap-2 px-3.5 py-2.5 rounded-xl
            bg-gray-900 dark:bg-gray-800 text-white text-xs font-semibold shadow-lg
            border border-gray-700 hover:bg-gray-800 dark:hover:bg-gray-700
            transition-all hover:scale-105 active:scale-95 select-none"
          style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.35)' }}
        >
          <Bug size={14} className="text-red-400" />
          <span className="hidden sm:inline">Report Bug</span>
        </button>
      )}

      {/* ── Modal backdrop ── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[99991] flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl
              border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col"
            style={{ maxHeight: '90vh' }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/30 flex items-center justify-center">
                <Bug size={16} className="text-red-500" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm text-gray-900 dark:text-white">Report an Issue</p>
                <p className="text-xs text-gray-500">Help us improve by sharing what you found</p>
              </div>
              <button onClick={handleClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <X size={16} className="text-gray-500" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {submitted ? (
                /* Success state */
                <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
                  <div className="w-16 h-16 rounded-full bg-green-50 dark:bg-green-900/30 flex items-center justify-center">
                    <CheckCircle2 size={32} className="text-green-500" />
                  </div>
                  <div>
                    <p className="font-bold text-lg text-gray-900 dark:text-white">Report Submitted!</p>
                    <p className="text-sm text-gray-500 mt-1">Thank you for your feedback. We'll look into it shortly.</p>
                  </div>
                  <button
                    onClick={handleClose}
                    className="mt-2 px-6 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <>
                  {/* Report type */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                      Type
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {TYPE_OPTIONS.map((t) => (
                        <button
                          key={t.value}
                          onClick={() => setReportType(t.value)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${
                            reportType === t.value ? t.color : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'
                          }`}
                        >
                          {t.icon} {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Severity (only for BUG/ISSUE) */}
                  {(reportType === 'BUG' || reportType === 'ISSUE') && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                        Severity
                      </label>
                      <div className="flex gap-2 flex-wrap">
                        {SEVERITY_OPTIONS.map((s) => (
                          <button
                            key={s.value}
                            onClick={() => setSeverity(s.value)}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                              severity === s.value ? s.color : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Title */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                      Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={`Short summary of the ${selectedType.label.toLowerCase()}…`}
                      maxLength={200}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700
                        bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white
                        placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400/40 focus:border-red-400
                        transition-colors"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                      Description <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Steps to reproduce, what you expected vs what happened…"
                      rows={4}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700
                        bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white
                        placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400/40 focus:border-red-400
                        transition-colors resize-none"
                    />
                  </div>

                  {/* Attachments */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                      Attachments <span className="text-gray-400 font-normal normal-case">(images or videos, max 5)</span>
                    </label>

                    {/* Drop zone */}
                    <div
                      className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-4
                        flex flex-col items-center gap-2 cursor-pointer hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
                    >
                      <Upload size={18} className="text-gray-400" />
                      <p className="text-xs text-gray-500">Click to upload or drag & drop</p>
                      <p className="text-[10px] text-gray-400">Images, videos, PDFs or any file up to 50MB</p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*,video/*,.pdf,.doc,.docx,.txt,.csv,.xlsx,.zip,.log"
                      className="hidden"
                      onChange={(e) => e.target.files && handleFiles(e.target.files)}
                    />

                    {/* Previews */}
                    {attachments.length > 0 && (
                      <div className="mt-3 flex flex-col gap-2">
                        {attachments.map((att) => (
                          <div key={att.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                            {/* Thumbnail / icon */}
                            <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-700 shrink-0 flex items-center justify-center">
                              {att.fileType === 'IMAGE' && att.preview ? (
                                <img src={att.preview} alt={att.file.name} className="w-full h-full object-cover" />
                              ) : att.fileType === 'VIDEO' && att.preview ? (
                                <video src={att.preview} className="w-full h-full object-cover" muted />
                              ) : (
                                <span className="text-xl">📎</span>
                              )}
                            </div>
                            {/* Name + size */}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{att.file.name}</p>
                              <p className="text-[10px] text-gray-400 mt-0.5">{Math.round(att.file.size / 1024)} KB</p>
                            </div>
                            {/* Status */}
                            <div className="shrink-0">
                              {att.uploading ? (
                                <Loader2 size={16} className="text-indigo-500 animate-spin" />
                              ) : att.uploaded ? (
                                <CheckCircle2 size={16} className="text-green-500" />
                              ) : att.error ? (
                                <span className="text-[10px] text-red-500 font-medium">Failed</span>
                              ) : (
                                <button
                                  onClick={() => removeAttachment(att.id)}
                                  className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                      <AlertTriangle size={14} className="text-red-500 shrink-0" />
                      <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            {!submitted && (
              <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 shrink-0 flex items-center justify-between gap-3">
                <p className="text-[11px] text-gray-400">
                  Page: <span className="font-mono">{window.location.pathname}</span>
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleClose}
                    className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400
                      hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !title.trim() || !description.trim()}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gray-900 dark:bg-white
                      text-white dark:text-gray-900 text-sm font-semibold
                      disabled:opacity-40 disabled:cursor-not-allowed
                      hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
                  >
                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    {submitting ? 'Submitting…' : 'Submit Report'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
