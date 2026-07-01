import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Sparkles, ArrowRight, Rocket, X } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { MarkdownView } from '../ui/MarkdownEditor';
import { FeatureRelease } from '../../hooks/useFeatureReleases';
import { resolveMedia } from './presetGifs';

interface Props {
  open: boolean;
  onClose: () => void;
  releases: FeatureRelease[];
}

const CATEGORY_STYLE: Record<string, string> = {
  NEW:          'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  IMPROVEMENT:  'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  FIX:          'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  BETA:         'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
};

const fmtDate = (s?: string) => {
  if (!s) return '';
  const d = new Date(String(s).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const WhatsNewModal = ({ open, onClose, releases }: Props) => {
  const navigate = useNavigate();
  const { tenantSlug } = useParams<{ tenantSlug: string }>();

  const tryIt = (route?: string) => {
    if (!route) return;
    const path = route.startsWith('/') ? route : `/${route}`;
    navigate(`/${tenantSlug}${path}`);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} size="xl" closeOnBackdropClick>
      {/* Hero — spans the padded panel via negative margins */}
      <div className="-m-6 mb-0 relative overflow-hidden rounded-t-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 px-6 py-6 text-white">
        <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -left-10 bottom-[-3rem] h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
        >
          <X size={18} />
        </button>
        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 shadow-inner backdrop-blur">
            <Sparkles size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold leading-tight">What's New</h2>
            <p className="text-sm text-white/80">The latest features &amp; improvements</p>
          </div>
        </div>
      </div>

      {/* Body */}
      {releases.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ds-surface-hover">
            <Rocket size={26} className="text-ds-text-muted opacity-60" />
          </div>
          <p className="text-sm text-ds-text-muted">No release notes yet — check back soon.</p>
        </div>
      ) : (
        <div className="-mx-6 max-h-[60vh] space-y-4 overflow-y-auto px-6 py-5">
          {releases.map((r) => {
            const cat = (r.category || 'NEW').toUpperCase();
            const media = resolveMedia(r.media_url);
            const meta = [r.version && `v${r.version}`, fmtDate(r.published_at)].filter(Boolean).join('  ·  ');
            return (
              <article
                key={r.ROWID}
                className="group overflow-hidden rounded-2xl border border-ds-border bg-ds-surface shadow-sm ring-1 ring-black/[0.03] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
              >
                {media && (
                  <div className="relative">
                    <img
                      src={media}
                      alt={r.title}
                      loading="lazy"
                      className="h-36 w-full object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                    {r.is_new && (
                      <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700 shadow-sm">
                        ● New
                      </span>
                    )}
                  </div>
                )}

                <div className="p-5">
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CATEGORY_STYLE[cat] ?? CATEGORY_STYLE.NEW}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                      {cat}
                    </span>
                    {meta && <span className="text-[11px] font-medium text-ds-text-muted">{meta}</span>}
                    {!media && r.is_new && (
                      <span className="ml-auto rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">New</span>
                    )}
                  </div>

                  <h3 className="text-[17px] font-bold leading-snug tracking-tight text-ds-text">{r.title}</h3>

                  {r.description && (
                    <div className="mt-1.5 text-sm leading-relaxed text-ds-text-muted [&_p]:my-1.5 [&_ul]:my-1.5 [&_li]:my-0.5">
                      <MarkdownView source={r.description} maxHeight={300} />
                    </div>
                  )}

                  {r.cta_route && (
                    <div className="mt-4">
                      <Button variant="primary" size="sm" onClick={() => tryIt(r.cta_route)} icon={<ArrowRight size={14} />}>
                        {r.cta_label || 'Try it'}
                      </Button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="-mx-6 -mb-6 flex items-center justify-between rounded-b-xl border-t border-ds-border bg-ds-surface px-6 py-3">
        <span className="text-xs text-ds-text-muted">
          {releases.length > 0 ? "You're all caught up 🎉" : ''}
        </span>
        <Button variant="secondary" onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
};

export default WhatsNewModal;
