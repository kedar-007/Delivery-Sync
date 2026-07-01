import React, { useEffect, useState } from 'react';
import { X, Download, ExternalLink, FileText, Loader2, FileWarning } from 'lucide-react';

export interface AttachmentPreview {
  /** Direct URL — used for the Download / Open-in-new-tab actions. */
  url: string;
  name: string;
  /**
   * Optional same-origin fetcher for the file bytes. When provided, the inline
   * preview loads from a blob: URL instead of `url`, which sidesteps the
   * storage host's X-Frame-Options / CORS restrictions. Falls back to `url`
   * (and a download card) if the fetch fails.
   */
  fetchBlob?: () => Promise<Blob>;
}

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'];
const VIDEO_EXT = ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v'];
const AUDIO_EXT = ['mp3', 'wav', 'oga', 'm4a', 'aac', 'flac'];
const TEXT_EXT  = ['txt', 'csv', 'json', 'md', 'log', 'xml', 'yml', 'yaml', 'html'];

type Kind = 'image' | 'pdf' | 'video' | 'audio' | 'text' | 'other';

function kindFor(ext: string): Kind {
  if (IMAGE_EXT.includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (VIDEO_EXT.includes(ext)) return 'video';
  if (AUDIO_EXT.includes(ext)) return 'audio';
  if (TEXT_EXT.includes(ext)) return 'text';
  return 'other';
}

/**
 * Full-screen viewer for a single task attachment. Previews images, PDFs,
 * video, audio and text inline; anything else falls back to a download /
 * open-in-new-tab card. Shows a spinner until the media finishes loading.
 * Reused by both the Sprint Board and My Tasks detail panels.
 */
export default function AttachmentViewer({
  attachment,
  onClose,
}: {
  attachment: AttachmentPreview | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);

  // When a fetcher is supplied, pull the bytes and expose them as a blob: URL
  // (same-origin → embeddable). Reset on every new attachment.
  useEffect(() => {
    setLoading(true);
    setBlobUrl(null);
    setFetchFailed(false);
    if (!attachment?.fetchBlob) return;

    let cancelled = false;
    let objUrl: string | null = null;
    attachment.fetchBlob()
      .then((blob) => {
        if (cancelled) return;
        objUrl = URL.createObjectURL(blob);
        setBlobUrl(objUrl);
      })
      .catch(() => {
        if (!cancelled) { setFetchFailed(true); setLoading(false); }
      });

    return () => {
      cancelled = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachment?.url]);

  // Close on Escape for a native-feeling lightbox.
  useEffect(() => {
    if (!attachment) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [attachment, onClose]);

  if (!attachment) return null;

  const { url, name, fetchBlob } = attachment;
  const ext  = name.split('.').pop()?.toLowerCase() ?? '';
  const kind = kindFor(ext);
  // Preview source: the proxied blob when a fetcher is supplied, else the raw url.
  const src = fetchBlob ? blobUrl : url;
  // If the proxy fetch failed, or the type is unpreviewable, show the fallback card.
  const showFallback = kind === 'other' || fetchFailed;
  // Still waiting on the blob fetch (fetcher supplied but blob not ready yet)?
  const awaitingBlob = !!fetchBlob && !blobUrl && !fetchFailed;
  const selfLoading = !showFallback && (kind === 'image' || kind === 'pdf' || kind === 'text' || kind === 'video');

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="ds-card-enter relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-ds-surface border-b border-ds-border shrink-0">
          <FileText size={15} className="text-indigo-500 shrink-0" />
          <p className="flex-1 text-sm font-medium text-ds-text truncate" title={name}>{name}</p>
          <span className="text-[10px] font-mono uppercase text-ds-text-muted px-1.5 py-0.5 rounded bg-ds-surface-hover shrink-0">{ext || 'file'}</span>
          <a
            href={url} download={name} target="_blank" rel="noopener noreferrer"
            className="p-1.5 rounded-lg text-ds-text-muted hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            title="Download"
          >
            <Download size={15} />
          </a>
          <a
            href={url} target="_blank" rel="noopener noreferrer"
            className="p-1.5 rounded-lg text-ds-text-muted hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            title="Open in new tab"
          >
            <ExternalLink size={15} />
          </a>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white bg-red-500 hover:bg-red-600 transition-colors shrink-0"
            title="Close"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="relative flex-1 min-h-0 bg-ds-bg flex items-center justify-center overflow-auto">
          {/* Loading spinner overlay — while media loads or the blob is fetching */}
          {!showFallback && (awaitingBlob || (selfLoading && loading)) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ds-text-muted z-10 bg-ds-bg">
              <Loader2 size={28} className="animate-spin text-indigo-500" />
              <span className="text-xs">Loading preview…</span>
            </div>
          )}

          {!showFallback && src && kind === 'image' && (
            <img
              src={src}
              alt={name}
              onLoad={() => setLoading(false)}
              onError={() => setLoading(false)}
              className="max-w-full max-h-[85vh] object-contain"
            />
          )}

          {!showFallback && src && (kind === 'pdf' || kind === 'text') && (
            <iframe
              src={src}
              title={name}
              onLoad={() => setLoading(false)}
              className="w-full h-[85vh] bg-white"
            />
          )}

          {!showFallback && src && kind === 'video' && (
            <video
              src={src}
              controls
              autoPlay
              onLoadedData={() => setLoading(false)}
              onError={() => setLoading(false)}
              className="max-w-full max-h-[85vh]"
            />
          )}

          {!showFallback && src && kind === 'audio' && (
            <div className="p-10 w-full flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-indigo-50 flex items-center justify-center">
                <FileText size={32} className="text-indigo-400" />
              </div>
              <audio src={src} controls autoPlay className="w-full max-w-md" />
            </div>
          )}

          {showFallback && (
            <div className="p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-ds-surface-hover flex items-center justify-center mx-auto mb-4">
                <FileWarning size={30} className="text-ds-text-muted" />
              </div>
              <p className="text-sm font-medium text-ds-text">
                {fetchFailed ? 'Couldn’t load an inline preview' : `Preview not available for .${ext || 'this'} files`}
              </p>
              <p className="text-xs text-ds-text-muted mt-1 mb-5">Download the file or open it in a new tab to view it.</p>
              <div className="flex items-center justify-center gap-2">
                <a
                  href={url} download={name} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
                >
                  <Download size={14} /> Download
                </a>
                <a
                  href={url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border border-ds-border text-ds-text hover:bg-ds-surface-hover transition-colors"
                >
                  <ExternalLink size={14} /> Open in new tab
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
