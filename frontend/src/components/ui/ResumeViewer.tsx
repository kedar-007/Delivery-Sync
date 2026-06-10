import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { FileText, X, ExternalLink, Loader2, AlertCircle, Download } from 'lucide-react';

interface ResumeViewerProps {
  /** API proxy URL — e.g. /server/badge_profile_service/api/bp/profiles/me/resume */
  proxyUrl: string;
  className?: string;
}

const ResumeViewer = ({ proxyUrl, className = '' }: ResumeViewerProps) => {
  const [open, setOpen]           = useState(false);
  const [blobUrl, setBlobUrl]     = useState<string | null>(null);
  const [filename, setFilename]   = useState('resume');
  const [contentType, setContentType] = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const blobRef = useRef<string | null>(null);

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => { if (blobRef.current) URL.revokeObjectURL(blobRef.current); };
  }, []);

  const loadFile = async () => {
    if (blobUrl) return; // already loaded
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(proxyUrl, { credentials: 'include' });
      if (!resp.ok) throw new Error(`Server returned ${resp.status}`);

      const ct = resp.headers.get('content-type') || '';
      const cd = resp.headers.get('content-disposition') || '';
      setContentType(ct);

      // Extract filename from Content-Disposition header
      const match = cd.match(/filename="?([^";]+)"?/i);
      if (match?.[1]) setFilename(match[1]);

      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      blobRef.current = url;
      setBlobUrl(url);
    } catch (e: unknown) {
      setError((e as Error).message || 'Could not load resume');
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setOpen(true);
    loadFile();
  };

  const isPdf = contentType.includes('pdf') || filename.toLowerCase().endsWith('.pdf');

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
      >
        <FileText size={12} />
        View resume
      </button>

      <Transition show={open}>
        <Dialog onClose={() => setOpen(false)} className="relative z-50">
          <TransitionChild
            enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100"
            leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/60" />
          </TransitionChild>

          <div className="fixed inset-0 flex items-center justify-center p-4">
            <TransitionChild
              enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100"
              leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95"
            >
              <DialogPanel
                className="w-full max-w-5xl bg-white dark:bg-gray-900 rounded-xl shadow-2xl flex flex-col overflow-hidden"
                style={{ height: '88vh' }}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
                  <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100 truncate max-w-[60%]">
                    <FileText size={15} className="text-blue-500 shrink-0" />
                    {filename}
                  </DialogTitle>
                  <div className="flex items-center gap-3 shrink-0">
                    {blobUrl && (
                      <a
                        href={blobUrl}
                        download={filename}
                        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        <Download size={13} /> Download
                      </a>
                    )}
                    <button
                      onClick={() => setOpen(false)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                {/* Body */}
                <div className="relative flex-1 bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  {/* Loading */}
                  {loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-50 dark:bg-gray-900 z-10">
                      <Loader2 size={28} className="text-blue-500 animate-spin" />
                      <p className="text-sm text-gray-500">Loading document…</p>
                    </div>
                  )}

                  {/* Error */}
                  {!loading && error && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-50 dark:bg-gray-900 z-10">
                      <AlertCircle size={28} className="text-amber-500" />
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Could not load resume</p>
                      <p className="text-xs text-gray-400">{error}</p>
                    </div>
                  )}

                  {/* Non-PDF: offer download */}
                  {!loading && !error && blobUrl && !isPdf && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gray-50 dark:bg-gray-900 z-10">
                      <FileText size={48} className="text-gray-300" />
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                        Word document — browser can't preview this format inline
                      </p>
                      <a
                        href={blobUrl}
                        download={filename}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <Download size={15} /> Download to view
                      </a>
                    </div>
                  )}

                  {/* PDF iframe */}
                  {!loading && !error && blobUrl && isPdf && (
                    <iframe
                      src={blobUrl}
                      title="Resume preview"
                      className="w-full h-full border-0"
                    />
                  )}
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
};

export default ResumeViewer;
