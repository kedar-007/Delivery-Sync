import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Bell, BellOff, CheckCheck, Trash2, X } from 'lucide-react';
import { useNotifications, useMarkRead, useMarkAllRead, useDeleteNotification } from '../../hooks/useNotifications';
import type { Notification } from '../../hooks/useNotifications';

// ─── Notification chime (Web Audio API) ──────────────────────────────────────
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

function ensureAudioUnlocked() {
  const ctx = getAudioCtx();
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function playChime() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const doPlay = () => {
    try {
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
    } catch { /* fail silently */ }
  };
  if (ctx.state === 'suspended') { ctx.resume().then(doPlay); } else { doPlay(); }
}

// ─── Notification type → colour ───────────────────────────────────────────────
const typeColor: Record<string, string> = {
  TASK_ASSIGNMENT:    'bg-blue-100 text-blue-700',
  TASK_ASSIGNED:      'bg-blue-100 text-blue-700',
  BLOCKER_ADDED:      'bg-red-100 text-red-700',
  BLOCKER_ESCALATION: 'bg-purple-100 text-purple-700',
  MEMBER_ADDED:       'bg-green-100 text-green-700',
  STANDUP_REMINDER:   'bg-yellow-100 text-yellow-700',
  EOD_REMINDER:       'bg-orange-100 text-orange-700',
  ACTION_OVERDUE:     'bg-red-100 text-red-700',
  TEAM_UPDATED:       'bg-indigo-100 text-indigo-700',
  DAILY_SUMMARY:      'bg-cyan-100 text-cyan-700',
  GENERAL:            'bg-ds-surface-hover text-ds-text-muted',
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

// ─── Notification → destination URL ───────────────────────────────────────────
//
// Builds the tenant-scoped path the user should land on when they click a
// notification. Backend uses an inconsistent mix of upper-case and lower-case
// entityType values so we normalise before matching. When we don't know how
// to handle a given type we fall back to the dashboard rather than blocking
// the click — the user still ends up somewhere useful.
function notificationLink(n: Notification, tenantSlug: string | undefined): string | null {
  if (!tenantSlug) return null;
  const base   = `/${tenantSlug}`;
  const type   = String(n.entityType || '').toUpperCase();
  const id     = String(n.entityId || '');
  // Some notifications carry a projectId in metadata (e.g. action assignments)
  // — useful for deep-linking into a sprint board or project view.
  const projectId = typeof n.metadata?.projectId === 'string'
    ? n.metadata.projectId
    : (typeof (n.metadata as Record<string, unknown>)?.project_id === 'string'
        ? (n.metadata as Record<string, string>).project_id
        : '');

  switch (type) {
    case 'TASK':
      // The task detail modal opens via the ?taskId= query on My Tasks; works
      // whether the user owns the task or just got assigned to it.
      return id ? `${base}/my-tasks?taskId=${id}` : `${base}/my-tasks`;
    case 'SPRINT':
      return projectId ? `${base}/projects/${projectId}/sprints` : `${base}/sprints`;
    case 'PROJECT':
      return id ? `${base}/projects/${id}` : `${base}/projects`;
    case 'MILESTONE':
      return `${base}/milestones`;
    case 'ACTION':
      return `${base}/actions`;
    case 'BLOCKER':
      return `${base}/blockers`;
    case 'LEAVE':
      // Land on the My Leaves tab (default) and let the page scroll to /
      // highlight the specific request via the requestId param.
      return id ? `${base}/leave?requestId=${id}` : `${base}/leave`;
    case 'WFH_REQUEST':
      // WFH lives under Attendance → WFH Requests tab, not Leave.
      return id
        ? `${base}/attendance?tab=wfh&requestId=${id}`
        : `${base}/attendance?tab=wfh`;
    case 'ATTENDANCE':
      return `${base}/attendance`;
    case 'TIME_ENTRY':
    case 'TIME_APPROVAL':
      return `${base}/time-tracking`;
    case 'ANNOUNCEMENT':
      return `${base}/announcements`;
    case 'BADGE':
    case 'USER_BADGE':
      return `${base}/profile`;
    case 'ASSET':
    case 'ASSET_REQUEST':
    case 'ASSET_ASSIGNMENT':
    case 'ASSET_MAINTENANCE':
      return `${base}/assets`;
    case 'TEAM':
      return `${base}/teams`;
    default:
      // Unknown type — fall back to the dashboard so the click does something
      // visible. Better than a dead button.
      return `${base}/dashboard`;
  }
}

// ─── Single notification row ──────────────────────────────────────────────────
const NotifRow = ({ n, onRead, onDelete, onOpen }: {
  n: Notification;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
  onOpen: (n: Notification) => void;
}) => {
  // Click on the body navigates to the entity; clicks on the trash / check
  // icons are kept separate via stopPropagation so users can still mark/delete
  // without triggering the redirect.
  return (
    <div className={`flex gap-3 px-4 py-3 border-b last:border-0 transition-colors ${n.isRead ? 'opacity-60' : 'bg-blue-50/40'} hover:bg-ds-surface-hover/60 cursor-pointer`}
         role="button"
         tabIndex={0}
         onClick={() => onOpen(n)}
         onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(n); } }}>
      <div className="mt-1.5 shrink-0">
        {!n.isRead && <span className="block w-2 h-2 rounded-full bg-blue-500" />}
        {n.isRead  && <span className="block w-2 h-2 rounded-full bg-transparent" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ds-text leading-tight">{n.title}</p>
        <p className="text-xs text-ds-text-muted mt-0.5 line-clamp-2">{n.message}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${typeColor[n.type] ?? typeColor.GENERAL}`}>
            {typeLabel(n.type)}
          </span>
          <span className="text-[10px] text-ds-text-muted opacity-70">{timeAgo(n.createdAt)}</span>
        </div>
      </div>
      <div className="flex flex-col gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        {!n.isRead && (
          <button onClick={() => onRead(n.id)} title="Mark as read" className="p-1 text-ds-text-muted hover:text-blue-600 transition-colors">
            <CheckCheck size={13} />
          </button>
        )}
        <button onClick={() => onDelete(n.id)} title="Delete" className="p-1 text-ds-text-muted hover:text-red-500 transition-colors">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
};

// ─── Catalyst push — module-level singleton so enableNotification() is called once ──
let _catalystPushRegistered = false;

function initCatalystPush(onMessage: () => void) {
  try {
    const w = window as any;
    if (!w.catalyst?.notification?.enableNotification) return;
    if (_catalystPushRegistered) {
      w.catalyst.notification.messageHandler = onMessage;
      return;
    }
    _catalystPushRegistered = true;
    w.catalyst.notification.enableNotification().then(() => {
      w.catalyst.notification.messageHandler = onMessage;
    }).catch((err: unknown) => {
      console.warn('[Push] enableNotification failed:', err);
      _catalystPushRegistered = false;
    });
  } catch (err) {
    console.warn('[Push] initCatalystPush error:', err);
  }
}

// ─── Bell ─────────────────────────────────────────────────────────────────────
const MUTE_KEY = 'ds_notif_muted';

const NotificationBell = () => {
  const navigate = useNavigate();
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(() => {
    try { return localStorage.getItem(MUTE_KEY) === 'true'; } catch { return false; }
  });
  const ref        = useRef<HTMLDivElement>(null);
  const prevUnread = useRef<number | null>(null);
  const refetchRef = useRef<() => void>(() => {});

  const { data, refetch } = useNotifications();
  const markRead = useMarkRead();
  const markAll  = useMarkAllRead();
  const del      = useDeleteNotification();

  // Click handler: navigate to the entity AND mark read (if not already) AND
  // close the panel. The mark-read fires unconditionally on unread items so
  // the bell counter doesn't stay stale after the user has actioned the item.
  const handleOpenNotification = useCallback((n: Notification) => {
    if (!n.isRead) markRead.mutate(n.id);
    const url = notificationLink(n, tenantSlug);
    setOpen(false);
    if (url) navigate(url);
  }, [navigate, tenantSlug, markRead]);

  // Keep refetchRef current so effects with [] deps always call the latest refetch
  useEffect(() => { refetchRef.current = refetch; }, [refetch]);

  // Refetch when tab becomes visible again
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refetchRef.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Register for Catalyst web push (no-op if SDK not available)
  useEffect(() => {
    const handler = () => refetchRef.current();
    initCatalystPush(handler);
    const t = setTimeout(() => initCatalystPush(handler), 2000);
    return () => clearTimeout(t);
  }, []);

  const notifications = data?.notifications ?? [];
  const unread        = data?.unreadCount ?? 0;

  // Chime when new notifications arrive — skip until initial data loads
  // to avoid chiming on page reload when unread transitions from 0 (default) to actual count.
  useEffect(() => {
    if (data === undefined) return;
    if (prevUnread.current === null) { prevUnread.current = unread; return; }
    if (unread > prevUnread.current && !muted) playChime();
    prevUnread.current = unread;
  }, [data, unread, muted]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      try { localStorage.setItem(MUTE_KEY, String(next)); } catch { /* ignore */ }
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
      <button
        onClick={() => {
          ensureAudioUnlocked();
          if (!open && unread > 0 && !muted) playChime();
          setOpen((o) => !o);
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

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-ds-surface rounded-xl shadow-xl border border-ds-border z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-ds-border">
            <span className="text-sm font-semibold text-ds-text">
              Notifications {unread > 0 && <span className="text-blue-600">({unread} new)</span>}
            </span>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button onClick={() => markAll.mutate()} title="Mark all read" className="text-xs text-blue-600 hover:underline">
                  Mark all read
                </button>
              )}
              <button onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'} className="p-1 rounded text-ds-text-muted hover:text-ds-text transition-colors">
                {muted ? <BellOff size={13} /> : <Bell size={13} />}
              </button>
              <button onClick={() => setOpen(false)} className="text-ds-text-muted hover:text-ds-text">
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-sm text-ds-text-muted opacity-70">
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
                  onOpen={handleOpenNotification}
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
