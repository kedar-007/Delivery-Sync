import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Bell, BellOff, CheckCheck, Trash2, X } from 'lucide-react';
import { useNotifications, useMarkRead, useMarkAllRead, useDeleteNotification } from '../../hooks/useNotifications';
import type { Notification } from '../../hooks/useNotifications';

// ─── Notification chime (Web Audio API) ──────────────────────────────────────
// Keep a single AudioContext alive for the lifetime of the page.
// Browsers suspend it until a user gesture — we resume it on first bell click.
let _audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  try {
    if (!_audioCtx) {
      _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return _audioCtx;
  } catch {
    return null;
  }
}

// Call this inside any click handler to satisfy the browser gesture requirement
function ensureAudioUnlocked() {
  const ctx = getAudioCtx();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume();
  }
}

function playChime() {
  const ctx = getAudioCtx();
  if (!ctx) return;

  const doPlay = () => {
    try {
      // Two-tone ding: 880 Hz then a fifth (1320 Hz), staggered
      const notes = [880, 1320];
      notes.forEach((freq, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.13);

        gain.gain.setValueAtTime(0,    ctx.currentTime + i * 0.13);
        gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + i * 0.13 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.13 + 0.55);

        osc.start(ctx.currentTime + i * 0.13);
        osc.stop(ctx.currentTime  + i * 0.13 + 0.6);
      });
    } catch {
      // fail silently
    }
  };

  if (ctx.state === 'suspended') {
    ctx.resume().then(doPlay);
  } else {
    doPlay();
  }
}

// ─── Notification type → colour ───────────────────────────────────────────────
const typeColor: Record<string, string> = {
  TASK_ASSIGNMENT:   'bg-blue-100 text-blue-700',
  BLOCKER_ADDED:     'bg-red-100 text-red-700',
  BLOCKER_ESCALATION:'bg-purple-100 text-purple-700',
  MEMBER_ADDED:      'bg-green-100 text-green-700',
  STANDUP_REMINDER:  'bg-yellow-100 text-yellow-700',
  EOD_REMINDER:      'bg-orange-100 text-orange-700',
  ACTION_OVERDUE:    'bg-red-100 text-red-700',
  TEAM_UPDATED:      'bg-indigo-100 text-indigo-700',
  DAILY_SUMMARY:     'bg-cyan-100 text-cyan-700',
  GENERAL:           'bg-gray-100 text-gray-700',
};

function typeLabel(type: string) {
  return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Single notification row ──────────────────────────────────────────────────

const NotifRow = ({ n, onRead, onDelete }: {
  n: Notification;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
}) => (
  <div
    className={`flex gap-3 px-4 py-3 border-b last:border-0 transition-colors ${
      n.isRead ? 'opacity-60' : 'bg-blue-50/40'
    }`}
  >
    {/* Unread dot */}
    <div className="mt-1.5 shrink-0">
      {!n.isRead && <span className="block w-2 h-2 rounded-full bg-blue-500" />}
      {n.isRead  && <span className="block w-2 h-2 rounded-full bg-transparent" />}
    </div>

    {/* Content */}
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-gray-900 leading-tight">{n.title}</p>
      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
      <div className="flex items-center gap-2 mt-1">
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${typeColor[n.type] ?? typeColor.GENERAL}`}>
          {typeLabel(n.type)}
        </span>
        <span className="text-[10px] text-gray-400">{timeAgo(n.createdAt)}</span>
      </div>
    </div>

    {/* Actions */}
    <div className="flex flex-col gap-1 shrink-0">
      {!n.isRead && (
        <button
          onClick={() => onRead(n.id)}
          title="Mark as read"
          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
        >
          <CheckCheck size={13} />
        </button>
      )}
      <button
        onClick={() => onDelete(n.id)}
        title="Delete"
        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
      >
        <Trash2 size={13} />
      </button>
    </div>
  </div>
);

// ─── Bell ─────────────────────────────────────────────────────────────────────

const MUTE_KEY = 'ds_notif_muted';

const NotificationBell = () => {
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTE_KEY) === 'true');
  const ref = useRef<HTMLDivElement>(null);
  const prevUnread = useRef<number | null>(null);

  const { data } = useNotifications();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const del = useDeleteNotification();

  const notifications = data?.notifications ?? [];
  const unread = data?.unreadCount ?? 0;

  // Play chime when unread count increases (new notification arrived)
  useEffect(() => {
    if (prevUnread.current === null) {
      // First load — just record baseline, don't play
      prevUnread.current = unread;
      return;
    }
    if (unread > prevUnread.current && !muted) {
      playChime();
    }
    prevUnread.current = unread;
  }, [unread, muted]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      localStorage.setItem(MUTE_KEY, String(next));
      return next;
    });
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        onClick={() => {
          ensureAudioUnlocked();
          setOpen((o) => {
            // Play chime when opening if there are unread notifications
            if (!o && unread > 0 && !muted) playChime();
            return !o;
          });
        }}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
        className="relative p-2 rounded-lg transition-colors"
        style={{ color: `rgb(var(--ds-text-muted))` }}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="text-sm font-semibold text-gray-900">
              Notifications {unread > 0 && <span className="text-blue-600">({unread} new)</span>}
            </span>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  onClick={() => markAll.mutate()}
                  title="Mark all read"
                  className="text-xs text-blue-600 hover:underline"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={toggleMute}
                title={muted ? 'Unmute notification sound' : 'Mute notification sound'}
                className="p-1 rounded text-gray-400 hover:text-gray-700 transition-colors"
              >
                {muted ? <BellOff size={13} /> : <Bell size={13} />}
              </button>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">
                <Bell size={24} className="mx-auto mb-2 opacity-30" />
                No notifications yet
              </div>
            ) : (
              notifications.map((n) => (
                <NotifRow
                  key={n.id}
                  n={n}
                  onRead={(id) => markRead.mutate(id)}
                  onDelete={(id) => del.mutate(id)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
