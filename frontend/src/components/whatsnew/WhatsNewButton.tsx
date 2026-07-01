import React, { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFeatureReleases, useMarkReleasesSeen, FeatureRelease } from '../../hooks/useFeatureReleases';
import WhatsNewModal from './WhatsNewModal';

// Header "What's New" button: shows an unread badge, opens the release modal,
// and auto-pops once per session when there are unseen releases.
const WhatsNewButton = () => {
  const { user } = useAuth();
  const { data } = useFeatureReleases(!!user);
  const markSeen = useMarkReleasesSeen();

  const releases = data?.releases ?? [];
  const unread = data?.unreadCount ?? 0;

  const [open, setOpen] = useState(false);
  // Snapshot the list shown in the modal so the "New" pills persist while the
  // user reads, even though opening clears the unread badge.
  const [snapshot, setSnapshot] = useState<FeatureRelease[]>([]);

  const releasesRef = useRef(releases);
  releasesRef.current = releases;

  const openModal = () => {
    setSnapshot(releasesRef.current);
    setOpen(true);
    if (unread > 0) markSeen.mutate();
  };

  // Auto-open once per session when unseen releases exist.
  useEffect(() => {
    if (!user?.id || unread <= 0) return;
    const key = `whatsnew_autoshown_${user.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    const t = setTimeout(() => openModal(), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, unread]);

  if (!user) return null;

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        title="What's New"
        aria-label="What's New"
        className="relative p-2 rounded-lg hover:bg-ds-surface-hover transition-colors"
        style={{ color: 'rgb(var(--ds-text-muted))' }}
      >
        <Sparkles size={18} />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      <WhatsNewModal open={open} onClose={() => setOpen(false)} releases={snapshot} />
    </>
  );
};

export default WhatsNewButton;
