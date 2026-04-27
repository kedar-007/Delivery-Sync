import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Settings, X, Send, ChevronDown, Pin, Check, Loader2, Cpu, Mic, MicOff } from 'lucide-react';
import {
  botApi,
  BotProfile, BotScanResult, BotTodoItem, QuickAction,
} from '../../lib/api';

// ─── CSS injection ─────────────────────────────────────────────────────────────

const BOT_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');

:root {
  --bot-cyan:    #00F5FF;
  --bot-violet:  #9B59FF;
  --bot-bg:      #080B14;
  --bot-glass:   rgba(8, 11, 20, 0.88);
  --bot-border:  rgba(0, 245, 255, 0.12);
  --bot-border2: rgba(155, 89, 255, 0.15);
  --bot-text:    #E2E8F0;
  --bot-muted:   #64748B;
}

@keyframes bot-pulse-ring {
  0%   { transform: scale(1);    opacity: 0.6; }
  70%  { transform: scale(1.55); opacity: 0;   }
  100% { transform: scale(1.55); opacity: 0;   }
}
@keyframes bot-pulse-ring2 {
  0%   { transform: scale(1);    opacity: 0.35; }
  70%  { transform: scale(1.85); opacity: 0;    }
  100% { transform: scale(1.85); opacity: 0;    }
}
@keyframes bot-breathe {
  0%,100% { transform: scale(1);    }
  50%     { transform: scale(1.05); }
}
@keyframes bot-glow {
  0%,100% { box-shadow: 0 0 24px rgba(0,245,255,.35), 0 0 48px rgba(0,245,255,.15), 0 0 4px rgba(155,89,255,.3); }
  50%     { box-shadow: 0 0 36px rgba(0,245,255,.55), 0 0 72px rgba(0,245,255,.25), 0 0 8px rgba(155,89,255,.5); }
}
@keyframes bot-slide-up {
  from { opacity:0; transform: translateY(24px) scale(0.96); }
  to   { opacity:1; transform: translateY(0)    scale(1);    }
}
@keyframes bot-msg-in {
  from { opacity:0; transform: translateY(10px); }
  to   { opacity:1; transform: translateY(0);    }
}
@keyframes bot-scan-fill {
  from { width: 0%; }
}
@keyframes bot-blink {
  0%,100% { opacity:1; }
  50%     { opacity:0; }
}
@keyframes bot-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes bot-badge-pop {
  0%   { transform: scale(0); }
  60%  { transform: scale(1.25); }
  100% { transform: scale(1); }
}
@keyframes bot-scan-card-in {
  from { opacity:0; transform:translateX(-16px); }
  to   { opacity:1; transform:translateX(0); }
}
@keyframes bot-todo-in {
  from { opacity:0; transform:translateY(8px); }
  to   { opacity:1; transform:translateY(0); }
}
@keyframes bot-complete-flash {
  0%   { background:rgba(16,185,129,.35); }
  100% { background:transparent; }
}
@keyframes bot-pin-glow {
  0%,100% { filter: drop-shadow(0 0 0px #FFD700); }
  50%     { filter: drop-shadow(0 0 8px #FFD700); }
}
@keyframes bot-orb-rotate {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes bot-particles {
  0%   { opacity:0.8; transform:scale(1) translate(0,0); }
  100% { opacity:0;   transform:scale(0.4) translate(var(--tx),var(--ty)); }
}
@keyframes bot-step-in {
  from { opacity:0; transform:translateX(-10px); }
  to   { opacity:1; transform:translateX(0); }
}
@keyframes bot-check-pop {
  0%   { transform:scale(0) rotate(-45deg); opacity:0; }
  60%  { transform:scale(1.4) rotate(5deg);  opacity:1; }
  100% { transform:scale(1)   rotate(0deg);  opacity:1; }
}
@keyframes bot-phrase-fade {
  0%,10%   { opacity:0; transform:translateY(4px); }
  20%,80%  { opacity:1; transform:translateY(0);   }
  90%,100% { opacity:0; transform:translateY(-4px); }
}
@keyframes bot-scan-beam {
  0%   { left:-40%; }
  100% { left:120%; }
}
@keyframes bot-ring-conic {
  from { transform:rotate(0deg); }
  to   { transform:rotate(360deg); }
}
@keyframes bot-mic-pulse {
  0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,.6); }
  50%     { box-shadow: 0 0 0 10px rgba(239,68,68,0); }
}
@keyframes bot-wave-bar {
  0%,100% { transform: scaleY(0.35); }
  50%     { transform: scaleY(1); }
}
@keyframes bot-time-entry-in {
  from { opacity:0; transform:scale(0.92) translateY(8px); }
  to   { opacity:1; transform:scale(1) translateY(0); }
}
@keyframes bot-form-in {
  from { opacity:0; transform:translateY(12px); }
  to   { opacity:1; transform:translateY(0); }
}
@keyframes bot-data-card-in {
  from { opacity:0; transform:translateY(8px) scale(0.98); }
  to   { opacity:1; transform:translateY(0) scale(1); }
}
@keyframes bot-shimmer {
  0%   { background-position: -200% center; }
  100% { background-position: 200% center; }
}
@keyframes bot-number-pop {
  0%   { transform: scale(0.7); opacity:0; }
  60%  { transform: scale(1.1); }
  100% { transform: scale(1); opacity:1; }
}
.bot-form-input {
  width:100%; box-sizing:border-box;
  padding:8px 12px; border-radius:10px;
  background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.1);
  color:#E2E8F0; font-size:12px;
  font-family:'Syne',sans-serif;
  outline:none; transition:border 0.2s;
  resize:none;
}
.bot-form-input:focus { border-color: var(--bot-cyan); }
.bot-form-input::placeholder { color:#475569; }
.bot-form-select option { background:#0F1623; color:#E2E8F0; }
.bot-data-card { animation: bot-data-card-in 0.4s cubic-bezier(0.34,1.56,0.64,1) both; }
.bot-stat-num  { animation: bot-number-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) both; animation-delay: 0.1s; }
.bot-qa-chip:hover { transform: translateY(-1px); filter: brightness(1.15); }
.bot-bubble-text { white-space: pre-wrap; word-break: break-word; line-height: 1.65; }
.bot-bubble-text b { color: var(--bot-cyan); font-weight: 700; }
.bot-bubble-text .bot-num { color: var(--bot-cyan); font-weight: 700; font-family: 'JetBrains Mono', monospace; }
.bot-bubble-text .bot-bullet { display:block; padding-left:12px; position:relative; margin-bottom:2px; }
.bot-bubble-text .bot-bullet::before { content:'›'; position:absolute; left:0; color:var(--bot-cyan); font-weight:700; }

.bot-widget-panel {
  font-family: 'Syne', sans-serif;
  animation: bot-slide-up 0.45s cubic-bezier(0.34,1.56,0.64,1) both;
  background: var(--bot-glass);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--bot-border);
  border-radius: 20px;
  box-shadow: 0 24px 80px rgba(0,0,0,.7), 0 0 0 1px var(--bot-border), inset 0 1px 0 rgba(0,245,255,.06);
  color: var(--bot-text);
  overflow: hidden;
}
.bot-msg { animation: bot-msg-in 0.3s cubic-bezier(0.34,1.56,0.64,1) both; }
.bot-scan-card { animation: bot-scan-card-in 0.35s cubic-bezier(0.34,1.56,0.64,1) both; }
.bot-todo-item { animation: bot-todo-in 0.3s ease both; }
.bot-cursor::after {
  content:'▋';
  animation: bot-blink 0.7s step-end infinite;
  color: var(--bot-cyan);
}
.bot-progress-fill {
  animation: bot-scan-fill 0.9s cubic-bezier(0.4,0,0.2,1) both;
  animation-delay: var(--delay, 0ms);
}
.bot-thinking-dot {
  display:inline-block;
  width:6px; height:6px;
  border-radius:50%;
  background: var(--bot-cyan);
  animation: bot-blink 1.2s ease-in-out infinite;
}
.bot-thinking-dot:nth-child(2) { animation-delay:0.2s; background: var(--bot-violet); }
.bot-thinking-dot:nth-child(3) { animation-delay:0.4s; }
.bot-complete-flash { animation: bot-complete-flash 0.6s ease both; }
.bot-pin-glow       { animation: bot-pin-glow 1s ease; }
.bot-orb-ring {
  position:absolute; inset:0; border-radius:50%;
  background: conic-gradient(from 180deg, rgba(0,245,255,.25) 0deg, rgba(155,89,255,.25) 180deg, rgba(0,245,255,.25) 360deg);
  animation: bot-orb-rotate 8s linear infinite;
}
`;

// ─── Types ────────────────────────────────────────────────────────────────────

type MessageType = 'text' | 'daily_plan' | 'data_response' | 'scanning' | 'quick_action' | 'time_entry_created' | 'action_form' | 'action_executed' | 'leave_balance';

interface ActionFieldOption { value: string; label: string; }
interface ActionField {
  key:          string;
  label:        string;
  type:         'text' | 'date' | 'select' | 'number' | 'textarea' | 'toggle';
  options?:     ActionFieldOption[];
  required?:    boolean;
  placeholder?: string;
  default?:     string;
}

interface ChatMessage {
  id:           string;
  role:         'user' | 'assistant';
  type:         MessageType;
  content:      string;
  scanResults?: BotScanResult[];
  todoItems?:   BotTodoItem[];
  data?:        Record<string, unknown> | null;
  formFields?:  ActionField[];
  actionType?:  string;
  isTyping?:    boolean;
  typedLen?:    number;
}

const DEFAULT_PROFILE: BotProfile = {
  bot_name:        'ARIA',
  bot_avatar_url:  '',
  bot_accent_color: '#00F5FF',
  bot_personality: 'FRIENDLY',
};

const DEFAULT_QUICK_ACTIONS: QuickAction[] = [
  { icon: '📋', label: 'Create my daily plan',            prompt_template: 'daily_plan',                                sort_order: 1 },
  { icon: '⏱',  label: "What's my billable time this week?", prompt_template: "What's my billable time this week?",    sort_order: 2 },
  { icon: '🚫', label: 'Non-billable time this week',     prompt_template: 'How much non-billable time did I log this week?', sort_order: 3 },
  { icon: '📌', label: 'What tasks are pending?',         prompt_template: 'Show me all my pending tasks.',             sort_order: 4 },
  { icon: '⚠️',  label: 'Any overdue milestones?',        prompt_template: 'Are there any overdue milestones on my projects?', sort_order: 5 },
  { icon: '🕐', label: 'Did I submit my standup today?',  prompt_template: 'Did I submit my standup today?',            sort_order: 6 },
  { icon: '✅', label: "What check-ins did I miss?",     prompt_template: 'Which days did I miss check-in this week?', sort_order: 7 },
  { icon: '⏰', label: 'How much time did I log today?', prompt_template: 'How much time did I log today?',            sort_order: 8 },
  { icon: '🌴', label: 'My leave balance',              prompt_template: "What's my leave balance?",                   sort_order: 9 },
  { icon: '📝', label: 'Apply for leave',               prompt_template: 'I want to apply for leave.',                 sort_order: 10 },
  { icon: '🗣', label: 'Submit my standup',             prompt_template: 'Submit my daily standup for today.',         sort_order: 11 },
  { icon: '🐛', label: 'Create a task',                 prompt_template: 'I want to create a new task.',               sort_order: 12 },
];

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function getOrCreateSessionId() {
  const KEY = 'bot_session_id';
  let id = sessionStorage.getItem(KEY);
  if (!id) { id = genId(); sessionStorage.setItem(KEY, id); }
  return id;
}

// ─── Scan status helpers ───────────────────────────────────────────────────────

const SCAN_COLORS = {
  all_good:        { bg: 'rgba(16,185,129,.12)', border: 'rgba(16,185,129,.3)', text: '#10b981', label: 'All Good' },
  needs_attention: { bg: 'rgba(245,158,11,.12)', border: 'rgba(245,158,11,.3)', text: '#f59e0b', label: 'Needs Attention' },
  overdue:         { bg: 'rgba(239,68,68,.12)',  border: 'rgba(239,68,68,.3)',  text: '#ef4444', label: 'Overdue' },
};

const PRIORITY_COLORS = {
  high:   { bg: 'rgba(239,68,68,.15)',   text: '#ef4444',  label: 'High' },
  medium: { bg: 'rgba(245,158,11,.15)',  text: '#f59e0b',  label: 'Medium' },
  low:    { bg: 'rgba(100,116,139,.15)', text: '#94a3b8',  label: 'Low' },
};

const MODULE_ICONS: Record<string, string> = {
  timelogs: '⏱', standup: '🗣', tasks: '📌', milestones: '🏁', checkin: '✅',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function BotOrb({ profile, size = 48, onClick, unread = 0, isOpen }: {
  profile:  BotProfile;
  size?:    number;
  onClick?: () => void;
  unread?:  number;
  isOpen:   boolean;
}) {
  const accent = profile.bot_accent_color || '#00F5FF';
  const hasAvatar = Boolean(profile.bot_avatar_url);

  return (
    <div style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}
      onClick={onClick}
    >
      {/* Outer pulse rings */}
      {!isOpen && (
        <>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: `${accent}22`,
            animation: 'bot-pulse-ring 2.4s cubic-bezier(0.215,0.61,0.355,1) infinite',
          }} />
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: `${accent}15`,
            animation: 'bot-pulse-ring2 2.4s cubic-bezier(0.215,0.61,0.355,1) infinite',
            animationDelay: '0.4s',
          }} />
        </>
      )}
      {/* Main orb */}
      <div style={{
        width: size, height: size,
        borderRadius: '50%',
        background: hasAvatar
          ? `url(${profile.bot_avatar_url}) center/cover no-repeat`
          : `radial-gradient(circle at 35% 35%, ${accent}CC, #9B59FFCC)`,
        animation: 'bot-breathe 4s ease-in-out infinite, bot-glow 4s ease-in-out infinite',
        position: 'relative', overflow: 'hidden',
        border: `2px solid ${accent}44`,
        flexShrink: 0,
      }}>
        {!hasAvatar && (
          <>
            <div className="bot-orb-ring" />
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'Syne', sans-serif",
              fontWeight: 800, fontSize: size * 0.38,
              color: '#fff', zIndex: 2, letterSpacing: '-0.5px',
            }}>
              {profile.bot_name?.[0] || 'A'}
            </div>
          </>
        )}
      </div>

      {/* Unread badge */}
      {unread > 0 && !isOpen && (
        <div style={{
          position: 'absolute', top: -4, right: -4,
          width: 18, height: 18,
          borderRadius: '50%',
          background: '#ef4444',
          border: '2px solid #080B14',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9, fontWeight: 700, color: '#fff',
          animation: 'bot-badge-pop 0.35s cubic-bezier(0.34,1.56,0.64,1) both',
          zIndex: 10,
        }}>{unread > 9 ? '9+' : unread}</div>
      )}
    </div>
  );
}

// ─── Scan Card ─────────────────────────────────────────────────────────────────

function ScanCard({ scan, delay = 0 }: { scan: BotScanResult; delay?: number }) {
  const [visible, setVisible]   = useState(false);
  const [pctDone, setPctDone]   = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true),  delay);
    const t2 = setTimeout(() => setPctDone(true),   delay + 100);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [delay]);

  if (!visible) return null;

  const c = SCAN_COLORS[scan.status] || SCAN_COLORS.all_good;
  const pct = Math.max(0, Math.min(100, scan.completion_pct));

  return (
    <div className="bot-scan-card" style={{
      marginBottom: 8,
      borderRadius: 12,
      border: `1px solid ${c.border}`,
      background: c.bg,
      padding: '10px 14px',
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 6 }}>
        <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>{scan.icon || MODULE_ICONS[scan.module] || '⚙️'}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#E2E8F0', letterSpacing: '0.05em' }}>
            {scan.label.toUpperCase()}
          </span>
        </div>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
          background: `${c.text}22`, color: c.text, letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          {c.label}
        </span>
      </div>
      {/* Progress bar */}
      <div style={{ height: 3, background: 'rgba(255,255,255,.08)', borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
        <div
          className="bot-progress-fill"
          style={{
            height: '100%',
            width: pctDone ? `${pct}%` : '0%',
            background: `linear-gradient(90deg, ${c.text}, ${c.text}88)`,
            borderRadius: 4,
            transition: 'width 0.9s cubic-bezier(0.4,0,0.2,1)',
          }}
        />
      </div>
      <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>{scan.found}</p>
    </div>
  );
}

// ─── Todo Item ─────────────────────────────────────────────────────────────────

function TodoItemRow({ item, onPin, onComplete, delay = 0, accent }: {
  item:       BotTodoItem & { _localPinned?: boolean; _localDone?: boolean };
  onPin:      (id: string, pinned: boolean) => void;
  onComplete: (id: string, done: boolean) => void;
  delay?:     number;
  accent:     string;
}) {
  const isPinned   = item._localPinned   ?? String(item.is_pinned)   === 'true';
  const isDone     = item._localDone     ?? String(item.is_completed) === 'true';
  const prio       = PRIORITY_COLORS[item.todo_priority as keyof typeof PRIORITY_COLORS] || PRIORITY_COLORS.medium;
  const moduleIcon = MODULE_ICONS[item.module] || '📎';

  return (
    <div
      className="bot-todo-item"
      style={{
        animationDelay: `${delay}ms`,
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '8px 10px', borderRadius: 10,
        marginBottom: 4,
        background: isPinned
          ? 'rgba(255,215,0,.06)'
          : isDone
          ? 'rgba(255,255,255,.02)'
          : 'rgba(255,255,255,.03)',
        border: `1px solid ${isPinned ? 'rgba(255,215,0,.18)' : 'rgba(255,255,255,.05)'}`,
        transition: 'all 0.3s ease',
        opacity: isDone ? 0.45 : 1,
      }}
    >
      {/* Complete checkbox */}
      <button type="button"
        onClick={() => onComplete(String(item.ROWID), !isDone)}
        style={{
          width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1,
          border: `1.5px solid ${isDone ? '#10b981' : 'rgba(255,255,255,.2)'}`,
          background: isDone ? '#10b981' : 'transparent',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s ease',
        }}
      >
        {isDone && <Check size={10} color="#fff" strokeWidth={3} />}
      </button>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12 }}>{moduleIcon}</span>
          <span style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 600, fontSize: 12, color: '#E2E8F0',
            textDecoration: isDone ? 'line-through' : 'none',
            flex: 1, minWidth: 0,
          }}>{item.title}</span>
          {/* Priority badge */}
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 100,
            background: prio.bg, color: prio.text, letterSpacing: '0.06em',
            textTransform: 'uppercase', flexShrink: 0,
            fontFamily: "'JetBrains Mono', monospace",
          }}>{prio.label}</span>
        </div>
        {item.description && (
          <p style={{ fontSize: 10, color: '#64748B', margin: '3px 0 0', lineHeight: 1.5, fontFamily: "'JetBrains Mono', monospace" }}>
            {item.description.slice(0, 120)}{item.description.length > 120 ? '…' : ''}
          </p>
        )}
        {item.due_date && (
          <span style={{ fontSize: 9, color: '#475569', fontFamily: "'JetBrains Mono', monospace" }}>
            Due: {String(item.due_date).split('T')[0].split(' ')[0]}
          </span>
        )}
      </div>

      {/* Pin button */}
      <button type="button"
        onClick={() => onPin(String(item.ROWID), !isPinned)}
        className={isPinned ? 'bot-pin-glow' : ''}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 2, flexShrink: 0, marginTop: 1,
          opacity: isPinned ? 1 : 0.35,
          color: isPinned ? '#FFD700' : '#94a3b8',
          transition: 'all 0.2s ease',
        }}
        title={isPinned ? 'Unpin' : 'Pin to top'}
      >
        <Pin size={12} fill={isPinned ? '#FFD700' : 'none'} />
      </button>
    </div>
  );
}

// ─── Todo Plan View ────────────────────────────────────────────────────────────

function TodoPlanView({ items: initialItems, onSaved, accent }: {
  items:   BotTodoItem[];
  onSaved: (items: BotTodoItem[]) => void;
  accent:  string;
}) {
  const [items, setItems] = useState<(BotTodoItem & { _localPinned?: boolean; _localDone?: boolean })[]>(
    [...initialItems].sort((a, b) => {
      const pa = String(a.is_pinned) === 'true' ? 1 : 0;
      const pb = String(b.is_pinned) === 'true' ? 1 : 0;
      return pb - pa;
    })
  );
  const [saving, setSaving] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const today = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  const handlePin = useCallback(async (id: string, pinned: boolean) => {
    setItems((prev) =>
      [...prev]
        .map((i) => String(i.ROWID) === id ? { ...i, _localPinned: pinned } : i)
        .sort((a, b) => {
          const pa = (a._localPinned ?? String(a.is_pinned) === 'true') ? 1 : 0;
          const pb = (b._localPinned ?? String(b.is_pinned) === 'true') ? 1 : 0;
          return pb - pa;
        })
    );
    try { await botApi.updateTodo(id, { is_pinned: pinned }); } catch (_) {}
  }, []);

  const handleComplete = useCallback(async (id: string, done: boolean) => {
    setItems((prev) => prev.map((i) => String(i.ROWID) === id ? { ...i, _localDone: done } : i));
    try { await botApi.updateTodo(id, { is_completed: done }); } catch (_) {}
  }, []);

  const pending = items.filter((i) => !(i._localDone ?? String(i.is_completed) === 'true'));
  const done    = items.filter((i) =>  (i._localDone ?? String(i.is_completed) === 'true'));

  // Group pending by module
  const byModule: Record<string, typeof pending> = {};
  pending.forEach((i) => { (byModule[i.module] = byModule[i.module] || []).push(i); });

  const handleSave = async () => {
    setSaving(true);
    // Todos are already saved by the backend — this just triggers callback
    onSaved(items);
    setSaving(false);
  };

  return (
    <div style={{ fontFamily: "'Syne', sans-serif" }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px 8px',
        borderBottom: '1px solid rgba(0,245,255,.08)',
        marginBottom: 10,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>📋</span>
          <div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 13, color: accent, letterSpacing: '-0.3px' }}>
              Your Daily Plan
            </p>
            <p style={{ margin: 0, fontSize: 10, color: '#64748B', fontFamily: "'JetBrains Mono', monospace" }}>{today}</p>
          </div>
        </div>
      </div>

      {/* Pending grouped by module */}
      {Object.entries(byModule).map(([mod, modItems]) => (
        <div key={mod} style={{ marginBottom: 8 }}>
          <div style={{
            display:'flex', alignItems:'center', gap: 6, padding: '2px 10px 4px',
          }}>
            <span style={{ fontSize: 11 }}>{MODULE_ICONS[mod] || '📎'}</span>
            <span style={{
              fontSize: 9, fontWeight: 700, color: '#475569', letterSpacing: '0.1em',
              textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace",
            }}>{mod}</span>
          </div>
          {modItems.map((item, i) => (
            <TodoItemRow
              key={String(item.ROWID)}
              item={item}
              onPin={handlePin}
              onComplete={handleComplete}
              delay={i * 60}
              accent={accent}
            />
          ))}
        </div>
      ))}

      {pending.length === 0 && (
        <p style={{ textAlign:'center', color:'#10b981', fontSize:12, padding: '8px 0', fontFamily:"'JetBrains Mono',monospace" }}>
          🎉 All done — great work!
        </p>
      )}

      {/* Done section */}
      {done.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <button type="button"
            onClick={() => setShowDone((s) => !s)}
            style={{
              background:'none', border:'none', cursor:'pointer',
              display:'flex', alignItems:'center', gap: 6, padding: '2px 10px 4px',
            }}
          >
            <ChevronDown
              size={12}
              style={{ color:'#475569', transition:'transform 0.2s', transform: showDone?'rotate(0)':'rotate(-90deg)' }}
            />
            <span style={{ fontSize:9, fontWeight:700, color:'#475569', letterSpacing:'0.1em', textTransform:'uppercase', fontFamily:"'JetBrains Mono',monospace" }}>
              Done · {done.length}
            </span>
          </button>
          {showDone && done.map((item, i) => (
            <TodoItemRow key={String(item.ROWID)} item={item} onPin={handlePin} onComplete={handleComplete} delay={i*40} accent={accent} />
          ))}
        </div>
      )}

      {/* Save button */}
      <button type="button"
        onClick={handleSave}
        disabled={saving}
        style={{
          width: '100%', marginTop: 10, padding: '8px 0',
          borderRadius: 10, border: `1px solid ${accent}44`,
          background: `${accent}15`,
          color: accent, fontFamily: "'Syne', sans-serif",
          fontWeight: 700, fontSize: 12, cursor: 'pointer',
          transition: 'all 0.2s ease', letterSpacing: '0.04em',
        }}
      >
        {saving ? '⏳ Saving…' : '💾 Plan Saved'}
      </button>
    </div>
  );
}

// ─── Todos Tab ────────────────────────────────────────────────────────────────

function TodosTab({ todos, loading, accent, onRefresh }: {
  todos:     BotTodoItem[];
  loading:   boolean;
  accent:    string;
  onRefresh: () => void;
}) {
  const [items, setItems] = useState<(BotTodoItem & { _localPinned?: boolean; _localDone?: boolean })[]>([]);
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    setItems(
      [...todos].sort((a, b) => {
        const pa = String(a.is_pinned) === 'true' ? 1 : 0;
        const pb = String(b.is_pinned) === 'true' ? 1 : 0;
        return pb - pa;
      })
    );
  }, [todos]);

  const handlePin = useCallback(async (id: string, pinned: boolean) => {
    setItems((prev) =>
      [...prev]
        .map((i) => String(i.ROWID) === id ? { ...i, _localPinned: pinned } : i)
        .sort((a, b) => {
          const pa = (a._localPinned ?? String(a.is_pinned) === 'true') ? 1 : 0;
          const pb = (b._localPinned ?? String(b.is_pinned) === 'true') ? 1 : 0;
          return pb - pa;
        })
    );
    try { await botApi.updateTodo(id, { is_pinned: pinned }); } catch (_) {}
  }, []);

  const handleComplete = useCallback(async (id: string, done: boolean) => {
    setItems((prev) => prev.map((i) => String(i.ROWID) === id ? { ...i, _localDone: done } : i));
    try { await botApi.updateTodo(id, { is_completed: done }); } catch (_) {}
  }, []);

  const pending = items.filter((i) => !(i._localDone ?? String(i.is_completed) === 'true'));
  const done    = items.filter((i) =>  (i._localDone ?? String(i.is_completed) === 'true'));

  const byModule: Record<string, typeof pending> = {};
  pending.forEach((i) => { (byModule[i.module] = byModule[i.module] || []).push(i); });

  if (loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:1, flexDirection:'column', gap:10 }}>
        <div style={{
          width:28, height:28, borderRadius:'50%',
          border:`2px solid ${accent}33`, borderTopColor: accent,
          animation:'bot-spin 1s linear infinite',
        }} />
        <span style={{ fontSize:10, color:'#475569', fontFamily:"'JetBrains Mono',monospace" }}>Loading todos…</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:1, flexDirection:'column', gap:10, padding:24 }}>
        <span style={{ fontSize:36 }}>📋</span>
        <p style={{ margin:0, fontWeight:700, fontSize:13, color:'#64748B', fontFamily:"'Syne',sans-serif", textAlign:'center' }}>
          No todos yet
        </p>
        <p style={{ margin:0, fontSize:11, color:'#475569', fontFamily:"'JetBrains Mono',monospace", textAlign:'center', lineHeight:1.5 }}>
          Ask me to "create my daily plan"<br/>to get started
        </p>
      </div>
    );
  }

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'10px 12px 8px', scrollbarWidth:'thin', scrollbarColor:`${accent}22 transparent` }}>
      {/* Stats + refresh row */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, padding:'0 2px' }}>
        <span style={{ fontSize:10, color:'#475569', fontFamily:"'JetBrains Mono',monospace" }}>
          {pending.length} pending · {done.length} done
        </span>
        <button type="button" onClick={onRefresh} style={{
          background:'none', border:`1px solid ${accent}22`, borderRadius:8,
          padding:'3px 10px', cursor:'pointer',
          fontSize:10, color:'#64748B', fontFamily:"'JetBrains Mono',monospace",
          transition:'all 0.2s',
        }}>↻ Refresh</button>
      </div>

      {/* Grouped by module */}
      {Object.entries(byModule).map(([mod, modItems]) => (
        <div key={mod} style={{ marginBottom:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'2px 4px 4px' }}>
            <span style={{ fontSize:11 }}>{MODULE_ICONS[mod] || '📎'}</span>
            <span style={{
              fontSize:9, fontWeight:700, color:'#475569',
              letterSpacing:'0.1em', textTransform:'uppercase',
              fontFamily:"'JetBrains Mono',monospace",
            }}>{mod}</span>
          </div>
          {modItems.map((item, i) => (
            <TodoItemRow key={String(item.ROWID)} item={item} onPin={handlePin} onComplete={handleComplete} delay={i*40} accent={accent} />
          ))}
        </div>
      ))}

      {pending.length === 0 && (
        <p style={{ textAlign:'center', color:'#10b981', fontSize:12, padding:'8px 0', fontFamily:"'JetBrains Mono',monospace" }}>
          🎉 All done — great work!
        </p>
      )}

      {/* Done section */}
      {done.length > 0 && (
        <div style={{ marginTop:6 }}>
          <button type="button" onClick={() => setShowDone((s) => !s)} style={{
            background:'none', border:'none', cursor:'pointer',
            display:'flex', alignItems:'center', gap:6, padding:'2px 4px 4px',
          }}>
            <ChevronDown size={12} style={{ color:'#475569', transition:'transform 0.2s', transform: showDone ? 'rotate(0)' : 'rotate(-90deg)' }} />
            <span style={{ fontSize:9, fontWeight:700, color:'#475569', letterSpacing:'0.1em', textTransform:'uppercase', fontFamily:"'JetBrains Mono',monospace" }}>
              Done · {done.length}
            </span>
          </button>
          {showDone && done.map((item, i) => (
            <TodoItemRow key={String(item.ROWID)} item={item} onPin={handlePin} onComplete={handleComplete} delay={i*40} accent={accent} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Leave Balance Card ────────────────────────────────────────────────────────

function LeaveBalanceCard({ data, accent }: { data: Record<string, unknown>; accent: string }) {
  const balances = (data.balances as any[]) || [];
  if (balances.length === 0) {
    return (
      <div style={{ background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', borderRadius:'4px 14px 14px 14px', padding:'12px 14px' }}>
        <p style={{ margin:0, fontSize:12, color:'#64748B', fontFamily:"'JetBrains Mono',monospace" }}>No leave balance data found.</p>
      </div>
    );
  }
  return (
    <div style={{ background:'linear-gradient(135deg,rgba(59,130,246,.1),rgba(59,130,246,.04))', border:'1px solid rgba(59,130,246,.25)', borderRadius:'4px 14px 14px 14px', padding:'12px 14px', animation:'bot-form-in 0.4s cubic-bezier(0.34,1.56,0.64,1) both' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
        <span style={{ fontSize:18 }}>🌴</span>
        <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:13, color:'#60a5fa' }}>Leave Balance</span>
      </div>
      {balances.map((b: any, i: number) => {
        const pct = b.allocated_days > 0 ? Math.min(100, (b.used_days / b.allocated_days) * 100) : 0;
        const rem = b.remaining_days ?? (b.allocated_days - b.used_days - b.pending_days);
        return (
          <div key={i} style={{ marginBottom: i < balances.length - 1 ? 10 : 0 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:4 }}>
              <span style={{ fontSize:12, fontWeight:700, color:'#E2E8F0', fontFamily:"'Syne',sans-serif" }}>{b.type_name}</span>
              <span style={{ fontSize:11, fontWeight:700, color:'#60a5fa', fontFamily:"'JetBrains Mono',monospace" }}>
                {rem} <span style={{ color:'#475569', fontWeight:400 }}>/ {b.allocated_days} days</span>
              </span>
            </div>
            <div style={{ height:5, background:'rgba(255,255,255,.08)', borderRadius:4, overflow:'hidden', marginBottom:3 }}>
              <div style={{ height:'100%', width:`${pct}%`, background:'linear-gradient(90deg,#3b82f6,#8b5cf6)', borderRadius:4, transition:'width 0.6s ease' }} />
            </div>
            <div style={{ display:'flex', gap:12, fontSize:9, color:'#475569', fontFamily:"'JetBrains Mono',monospace" }}>
              <span>{b.used_days} used</span>
              {b.pending_days > 0 && <span style={{ color:'#f59e0b' }}>{b.pending_days} pending</span>}
              <span style={{ color:'#10b981', marginLeft:'auto' }}>{rem} available</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Action Form Card ──────────────────────────────────────────────────────────

const ACTION_TITLES: Record<string, string> = {
  create_leave:   '🌴 Apply for Leave',
  submit_standup: '🗣 Submit Standup',
  create_task:    '📌 Create Task',
};

function buildFormSummary(action: string, fields: ActionField[], values: Record<string, string>): string {
  if (action === 'create_leave') {
    const typeField = fields.find((f) => f.key === 'leave_type_id');
    const typeName  = typeField?.options?.find((o) => o.value === values.leave_type_id)?.label ?? 'Leave';
    const range     = values.start_date && values.end_date ? ` ${values.start_date} → ${values.end_date}` : '';
    return `Applied for ${typeName}${range}`;
  }
  if (action === 'submit_standup') {
    const projField = fields.find((f) => f.key === 'project_id');
    const projName  = projField?.options?.find((o) => o.value === values.project_id)?.label ?? 'project';
    return `Submitted standup for ${projName}`;
  }
  if (action === 'create_task') return `Creating task: "${values.title || 'untitled'}"`;
  return `Submitted ${action} form`;
}

function ActionFormCard({ action, fields, accent, onSubmit }: {
  action:   string;
  fields:   ActionField[];
  accent:   string;
  onSubmit: (action: string, data: Record<string, string>, summary: string) => void;
}) {
  const [values,    setValues]    = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    fields.forEach((f) => { if (f.default) init[f.key] = f.default; });
    return init;
  });
  const [error,     setError]     = useState('');
  const [submitted, setSubmitted] = useState(false);

  const set = (key: string, val: string) => setValues((prev) => ({ ...prev, [key]: val }));

  const handleSubmit = () => {
    const missing = fields.filter((f) => f.required && !values[f.key]?.trim());
    if (missing.length > 0) { setError(`Please fill in: ${missing.map((f) => f.label).join(', ')}`); return; }
    setSubmitted(true);
    setError('');
    onSubmit(action, values, buildFormSummary(action, fields, values));
  };

  if (submitted) {
    return (
      <div style={{ padding:'8px 12px', fontSize:11, color:'#475569', fontFamily:"'JetBrains Mono',monospace", display:'flex', alignItems:'center', gap:6 }}>
        <div style={{ width:14, height:14, borderRadius:'50%', border:`2px solid ${accent}44`, borderTopColor:accent, animation:'bot-spin 1s linear infinite' }} />
        Processing…
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width:'100%', boxSizing:'border-box', padding:'8px 12px', borderRadius:10,
    background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)',
    color:'#E2E8F0', fontSize:12, fontFamily:"'Syne',sans-serif", outline:'none',
  };

  return (
    <div style={{ background:'rgba(255,255,255,.03)', border:`1px solid ${accent}18`, borderRadius:'4px 14px 14px 14px', padding:'12px 14px', animation:'bot-form-in 0.4s cubic-bezier(0.34,1.56,0.64,1) both' }}>
      {/* Title */}
      <p style={{ margin:'0 0 12px', fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:13, color:accent }}>
        {ACTION_TITLES[action] || action}
      </p>

      {/* Fields */}
      {fields.map((field) => (
        <div key={field.key} style={{ marginBottom:10 }}>
          <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#475569', letterSpacing:'0.08em', textTransform:'uppercase', fontFamily:"'JetBrains Mono',monospace", marginBottom:4 }}>
            {field.label}{field.required && <span style={{ color:accent }}>*</span>}
          </label>

          {field.type === 'select' && (
            <select
              value={values[field.key] ?? ''}
              onChange={(e) => set(field.key, e.target.value)}
              style={{ ...inputStyle, appearance:'none', cursor:'pointer' }}
            >
              <option value="">Select…</option>
              {(field.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}

          {field.type === 'textarea' && (
            <textarea
              value={values[field.key] ?? ''}
              onChange={(e) => set(field.key, e.target.value)}
              placeholder={field.placeholder}
              rows={3}
              style={{ ...inputStyle, resize:'vertical' }}
            />
          )}

          {(field.type === 'text' || field.type === 'date' || field.type === 'number') && (
            <input
              type={field.type}
              value={values[field.key] ?? ''}
              onChange={(e) => set(field.key, e.target.value)}
              placeholder={field.placeholder}
              style={{ ...inputStyle }}
            />
          )}

          {field.type === 'toggle' && (
            <button
              type="button"
              onClick={() => set(field.key, values[field.key] === 'true' ? 'false' : 'true')}
              style={{
                display:'flex', alignItems:'center', gap:8, background:'none', border:'none', cursor:'pointer', padding:0,
              }}
            >
              <div style={{
                width:36, height:20, borderRadius:10, position:'relative', transition:'background 0.2s',
                background: values[field.key] === 'true' ? accent : 'rgba(255,255,255,.1)',
              }}>
                <div style={{
                  position:'absolute', top:2, left: values[field.key] === 'true' ? 18 : 2,
                  width:16, height:16, borderRadius:'50%', background:'#fff',
                  transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,.3)',
                }} />
              </div>
              <span style={{ fontSize:11, color:'#94a3b8', fontFamily:"'Syne',sans-serif" }}>
                {values[field.key] === 'true' ? 'Yes' : 'No'}
              </span>
            </button>
          )}
        </div>
      ))}

      {error && <p style={{ margin:'4px 0 8px', fontSize:11, color:'#ef4444', fontFamily:"'JetBrains Mono',monospace" }}>⚠ {error}</p>}

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        style={{
          width:'100%', marginTop:4, padding:'9px 0', borderRadius:10,
          background:`linear-gradient(135deg,${accent}33,#9B59FF33)`,
          border:`1px solid ${accent}55`,
          color:accent, fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:12,
          cursor:'pointer', letterSpacing:'0.04em', transition:'all 0.2s',
        }}
      >
        Submit →
      </button>
    </div>
  );
}

// ─── Action Executed Card ──────────────────────────────────────────────────────

function ActionExecutedCard({ data, content }: { data: Record<string, unknown> | null; content: string }) {
  const success = data?.success !== false;
  const action  = String(data?.action ?? '');

  return (
    <div style={{
      background: success ? 'linear-gradient(135deg,rgba(16,185,129,.12),rgba(16,185,129,.04))' : 'linear-gradient(135deg,rgba(239,68,68,.1),rgba(239,68,68,.04))',
      border: `1px solid ${success ? 'rgba(16,185,129,.3)' : 'rgba(239,68,68,.3)'}`,
      borderRadius:'4px 14px 14px 14px', padding:'12px 14px',
      animation:'bot-form-in 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: success && data ? 10 : 0 }}>
        <span style={{ fontSize:18 }}>{success ? '✅' : '❌'}</span>
        <p style={{ margin:0, fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:13, color: success ? '#10b981' : '#ef4444', flex:1 }}>
          {content}
        </p>
      </div>

      {success && action === 'create_leave' && data && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>
          {[
            { label:'From',   val: String(data.start_date ?? '') },
            { label:'To',     val: String(data.end_date ?? '') },
            { label:'Days',   val: String(data.days_count ?? '') },
          ].map((item) => (
            <div key={item.label} style={{ background:'rgba(16,185,129,.08)', borderRadius:8, padding:'6px 10px' }}>
              <p style={{ margin:0, fontSize:9, color:'#64748B', fontFamily:"'JetBrains Mono',monospace", textTransform:'uppercase', letterSpacing:'0.06em' }}>{item.label}</p>
              <p style={{ margin:'2px 0 0', fontSize:12, fontWeight:700, color:'#E2E8F0', fontFamily:"'Syne',sans-serif" }}>{item.val}</p>
            </div>
          ))}
        </div>
      )}

      {success && action === 'create_task' && data && (
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <span style={{ fontSize:10, padding:'3px 10px', borderRadius:100, background:'rgba(16,185,129,.15)', color:'#10b981', fontFamily:"'JetBrains Mono',monospace" }}>TODO</span>
          <span style={{ fontSize:10, padding:'3px 10px', borderRadius:100, background:'rgba(255,255,255,.06)', color:'#94a3b8', fontFamily:"'JetBrains Mono',monospace" }}>
            {String(data.task_priority ?? 'MEDIUM')}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Time Entry Card ──────────────────────────────────────────────────────────

function TimeEntryCard({ data, accent }: { data: Record<string, unknown>; accent: string }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(16,185,129,.12), rgba(16,185,129,.06))',
      border: '1px solid rgba(16,185,129,.3)',
      borderRadius: '4px 14px 14px 14px',
      padding: '12px 14px',
      animation: 'bot-time-entry-in 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
      marginTop: 6,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
        <span style={{ fontSize:18 }}>⏱</span>
        <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:13, color:'#10b981' }}>
          Time Entry Logged
        </span>
        <span style={{
          marginLeft:'auto', fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:100,
          background:'rgba(16,185,129,.2)', color:'#10b981',
          fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.06em',
        }}>DRAFT</span>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:6 }}>
        <div style={{ background:'rgba(16,185,129,.08)', borderRadius:8, padding:'6px 10px' }}>
          <p style={{ margin:0, fontSize:9, color:'#64748B', fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.06em', textTransform:'uppercase' }}>Hours</p>
          <p style={{ margin:'2px 0 0', fontSize:20, fontWeight:800, color:'#10b981', fontFamily:"'Syne',sans-serif", lineHeight:1 }}>
            {typeof data.hours === 'number' ? (data.hours as number).toFixed(1) : String(data.hours)}h
          </p>
        </div>
        <div style={{ background:'rgba(16,185,129,.08)', borderRadius:8, padding:'6px 10px' }}>
          <p style={{ margin:0, fontSize:9, color:'#64748B', fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.06em', textTransform:'uppercase' }}>Billable</p>
          <p style={{ margin:'2px 0 0', fontSize:13, fontWeight:700, color: data.is_billable ? '#10b981' : '#f59e0b', fontFamily:"'Syne',sans-serif" }}>
            {data.is_billable ? '✓ Yes' : '✗ No'}
          </p>
        </div>
      </div>

      {!!data.project_name && (
        <div style={{ padding:'6px 10px', background:'rgba(16,185,129,.08)', borderRadius:8, marginBottom:6 }}>
          <p style={{ margin:0, fontSize:9, color:'#64748B', fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.06em', textTransform:'uppercase' }}>Project</p>
          <p style={{ margin:'2px 0 0', fontSize:12, fontWeight:700, color:'#E2E8F0', fontFamily:"'Syne',sans-serif" }}>{String(data.project_name)}</p>
        </div>
      )}

      {!!data.description && (
        <div style={{ padding:'6px 10px', background:'rgba(255,255,255,.04)', borderRadius:8 }}>
          <p style={{ margin:0, fontSize:9, color:'#64748B', fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.06em', textTransform:'uppercase' }}>Description</p>
          <p style={{ margin:'2px 0 0', fontSize:11, color:'#94a3b8', fontFamily:"'JetBrains Mono',monospace", lineHeight:1.4 }}>{String(data.description)}</p>
        </div>
      )}
    </div>
  );
}

// ─── Formatted Text Renderer ─────────────────────────────────────────────────

function FormattedText({ text, accent }: { text: string; accent: string }) {
  const lines = text.split('\n');
  return (
    <span className="bot-bubble-text">
      {lines.map((line, li) => {
        const isBullet = /^[\s]*[-•*]\s/.test(line) || /^[\s]*\d+\.\s/.test(line);
        const cleanLine = isBullet ? line.replace(/^[\s]*[-•*\d.]+\s/, '') : line;

        // Parse inline bold (**text** or __text__) and highlight numbers
        const parseInline = (raw: string): React.ReactNode[] => {
          const parts: React.ReactNode[] = [];
          const re = /\*\*([^*]+)\*\*|__([^_]+)__|(\b\d+\.?\d*\s*(?:h|hours?|days?|%|hrs?)?\b)/gi;
          let last = 0;
          let m: RegExpExecArray | null;
          while ((m = re.exec(raw)) !== null) {
            if (m.index > last) parts.push(raw.slice(last, m.index));
            if (m[1] || m[2]) {
              parts.push(<b key={m.index}>{m[1] || m[2]}</b>);
            } else if (m[3]) {
              parts.push(<span key={m.index} className="bot-num">{m[3]}</span>);
            }
            last = m.index + m[0].length;
          }
          if (last < raw.length) parts.push(raw.slice(last));
          return parts;
        };

        const content = parseInline(cleanLine);

        return (
          <React.Fragment key={li}>
            {isBullet
              ? <span className="bot-bullet">{content}</span>
              : <>{content}</>
            }
            {li < lines.length - 1 && !isBullet && <br />}
          </React.Fragment>
        );
      })}
    </span>
  );
}

// ─── Data Response Card ───────────────────────────────────────────────────────

function DataResponseCard({ content, data, accent }: { content: string; data: Record<string, unknown> | null; accent: string }) {
  const entries = data ? Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== '') : [];

  const formatKey = (k: string) =>
    k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const formatVal = (v: unknown): string => {
    if (typeof v === 'number') return v % 1 === 0 ? String(v) : v.toFixed(1);
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (Array.isArray(v)) return v.join(', ');
    return String(v);
  };

  return (
    <div className="bot-data-card" style={{ borderRadius: '4px 14px 14px 14px', overflow: 'hidden' }}>
      {/* Content summary */}
      <div style={{
        padding: '10px 14px',
        background: `linear-gradient(135deg, ${accent}0E, rgba(155,89,255,.06))`,
        borderBottom: entries.length > 0 ? `1px solid ${accent}12` : 'none',
        border: `1px solid ${accent}1A`,
        borderRadius: entries.length > 0 ? '4px 14px 0 0' : '4px 14px 14px 14px',
      }}>
        <FormattedText text={content} accent={accent} />
      </div>

      {/* Data grid */}
      {entries.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: entries.length === 1 ? '1fr' : entries.length === 2 ? '1fr 1fr' : 'repeat(auto-fit, minmax(100px, 1fr))',
          gap: 1,
          background: `${accent}08`,
          border: `1px solid ${accent}1A`,
          borderTop: 'none',
          borderRadius: '0 0 14px 14px',
          overflow: 'hidden',
        }}>
          {entries.map(([k, v], i) => (
            <div key={k} className="bot-stat-num" style={{
              padding: '8px 12px',
              background: 'rgba(8,11,20,.6)',
              borderRight: i % 2 === 0 && entries.length > 1 ? `1px solid ${accent}10` : 'none',
              animationDelay: `${i * 0.07}s`,
            }}>
              <p style={{ margin:0, fontSize:9, color:'#475569', fontFamily:"'JetBrains Mono',monospace", textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:3 }}>{formatKey(k)}</p>
              <p style={{ margin:0, fontSize:14, fontWeight:800, color: accent, fontFamily:"'Syne',sans-serif", lineHeight:1 }}>{formatVal(v)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Thinking / Scanning animation ───────────────────────────────────────────

const SCAN_STEPS = [
  { icon: '⏱', label: 'Time Logs',  key: 'timelogs' },
  { icon: '🗣', label: 'Standups',   key: 'standup' },
  { icon: '📌', label: 'Tasks',      key: 'tasks' },
  { icon: '🏁', label: 'Milestones', key: 'milestones' },
  { icon: '✅', label: 'Check-ins',  key: 'checkin' },
];

const THINKING_PHRASES = [
  'Thinking…',
  'Analyzing your work data…',
  'Checking context…',
  'Almost ready…',
];

const ORB_SIZE  = 56;
const PANEL_W   = 420;
const PANEL_H   = 600;

function ThinkingBubble({ isDailyPlan, accent }: { isDailyPlan: boolean; accent: string }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [doneSteps,   setDoneSteps]   = useState<Set<number>>(new Set());
  const [phraseIdx,   setPhraseIdx]   = useState(0);
  const [phraseKey,   setPhraseKey]   = useState(0);

  useEffect(() => {
    if (isDailyPlan) {
      const t = setInterval(() => {
        setCurrentStep((s) => {
          setDoneSteps((prev) => new Set(Array.from(prev).concat(s)));
          return Math.min(s + 1, SCAN_STEPS.length);
        });
      }, 750);
      return () => clearInterval(t);
    } else {
      const t = setInterval(() => {
        setPhraseIdx((i) => (i + 1) % THINKING_PHRASES.length);
        setPhraseKey((k) => k + 1);
      }, 1600);
      return () => clearInterval(t);
    }
  }, [isDailyPlan]);

  if (isDailyPlan) {
    const allDone = doneSteps.size >= SCAN_STEPS.length;
    return (
      <div style={{
        background: 'rgba(255,255,255,.04)', border: `1px solid ${accent}18`,
        borderRadius: '4px 14px 14px 14px', padding: '12px 14px', minWidth: 230,
      }}>
        {/* Header row */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
          <div style={{ position:'relative', width:24, height:24, flexShrink:0 }}>
            <div style={{
              position:'absolute', inset:-3, borderRadius:'50%',
              background: `conic-gradient(from 0deg, ${accent}66 0deg, transparent 180deg, ${accent}66 360deg)`,
              animation: 'bot-ring-conic 1.2s linear infinite',
            }} />
            <div style={{
              width:24, height:24, borderRadius:'50%', position:'relative', zIndex:1,
              background:`radial-gradient(circle at 35% 35%, ${accent}AA, #9B59FFAA)`,
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <span style={{ fontSize:11 }}>📋</span>
            </div>
          </div>
          <span style={{ fontSize:12, fontWeight:700, color:'#E2E8F0', fontFamily:"'Syne',sans-serif" }}>
            {allDone ? 'Generating your plan…' : 'Scanning workspace'}
          </span>
          {allDone && (
            <div style={{ display:'flex', gap:3, marginLeft:'auto' }}>
              {[0,1,2].map((i) => (
                <div key={i} style={{
                  width:4, height:4, borderRadius:'50%', background: accent,
                  animation:`bot-blink 0.9s ease-in-out infinite`, animationDelay:`${i*0.2}s`,
                }} />
              ))}
            </div>
          )}
        </div>

        {/* Step rows */}
        {SCAN_STEPS.map((step, i) => {
          if (i > currentStep) return null;
          const isDone   = doneSteps.has(i);
          const isActive = i === currentStep && !isDone;
          return (
            <div key={step.key} style={{
              display:'flex', alignItems:'center', gap:8,
              padding:'5px 8px', borderRadius:8, marginBottom:3,
              background: isDone ? `${accent}08` : isActive ? `${accent}14` : 'transparent',
              animation: 'bot-step-in 0.3s cubic-bezier(0.34,1.56,0.64,1) both',
              transition: 'background 0.3s ease',
            }}>
              <span style={{ fontSize:14, width:18, textAlign:'center', lineHeight:1 }}>{step.icon}</span>
              <span style={{
                flex:1, fontSize:11, fontFamily:"'JetBrains Mono',monospace",
                color: isDone ? '#64748B' : isActive ? accent : '#475569',
                transition: 'color 0.3s',
              }}>{step.label}</span>
              {isDone && (
                <span style={{
                  fontSize:11, color:'#10b981', fontWeight:700,
                  animation: 'bot-check-pop 0.3s cubic-bezier(0.34,1.56,0.64,1) both',
                }}>✓</span>
              )}
              {isActive && (
                <div style={{ display:'flex', gap:2 }}>
                  {[0,1,2].map((j) => (
                    <div key={j} style={{
                      width:3, height:3, borderRadius:'50%', background: accent,
                      animation:`bot-blink 0.8s ease-in-out infinite`, animationDelay:`${j*0.15}s`,
                    }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Progress bar */}
        <div style={{ marginTop:8, height:2, background:'rgba(255,255,255,.06)', borderRadius:4, overflow:'hidden' }}>
          <div style={{
            height:'100%',
            width:`${Math.min(100, (doneSteps.size / SCAN_STEPS.length) * 100)}%`,
            background:`linear-gradient(90deg, ${accent}, #9B59FF)`,
            borderRadius:4,
            transition:'width 0.5s cubic-bezier(0.4,0,0.2,1)',
          }} />
        </div>
      </div>
    );
  }

  // ── Regular question thinking animation ──
  return (
    <div style={{
      background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)',
      borderRadius: '4px 14px 14px 14px', padding: '10px 14px',
      display:'flex', flexDirection:'column', gap:8, minWidth: 200,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        {/* Mini orb with spinning ring */}
        <div style={{ position:'relative', width:26, height:26, flexShrink:0 }}>
          <div style={{
            position:'absolute', inset:-4, borderRadius:'50%',
            background:`conic-gradient(from 0deg, ${accent}55 0deg, transparent 150deg, #9B59FF55 260deg, transparent 360deg)`,
            animation:'bot-ring-conic 1.6s linear infinite',
          }} />
          <div style={{
            width:26, height:26, borderRadius:'50%', position:'relative', zIndex:1,
            background:`radial-gradient(circle at 35% 35%, ${accent}88, #9B59FF88)`,
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <Cpu size={12} color="#fff" />
          </div>
        </div>
        {/* Dots */}
        <div style={{ display:'flex', gap:4 }}>
          {[0,1,2].map((i) => (
            <div key={i} style={{
              width:5, height:5, borderRadius:'50%',
              background: i === 1 ? '#9B59FF' : accent,
              animation:`bot-blink 1.2s ease-in-out infinite`, animationDelay:`${i*0.2}s`,
            }} />
          ))}
        </div>
        {/* Cycling phrase */}
        <span key={phraseKey} style={{
          fontSize:10, color:'#64748B', fontFamily:"'JetBrains Mono',monospace",
          animation:'bot-phrase-fade 1.6s ease both',
        }}>
          {THINKING_PHRASES[phraseIdx]}
        </span>
      </div>
      {/* Scanning shimmer line */}
      <div style={{ height:1, background:'rgba(255,255,255,.04)', borderRadius:4, overflow:'hidden', position:'relative' }}>
        <div style={{
          position:'absolute', top:0, height:'100%', width:'40%',
          background:`linear-gradient(90deg, transparent, ${accent}55, transparent)`,
          animation:'bot-scan-beam 1.6s ease-in-out infinite',
        }} />
      </div>
    </div>
  );
}

// ─── Chat Bubble ─────────────────────────────────────────────────────────────

function ChatBubble({ msg, isLast, accent, onSaveTodos, onSubmitForm }: {
  msg:            ChatMessage;
  isLast:         boolean;
  accent:         string;
  onSaveTodos:    (items: BotTodoItem[]) => void;
  onSubmitForm?:  (action: string, data: Record<string, string>, summary: string) => void;
}) {
  const isUser = msg.role === 'user';

  // Typing animation: reveal content word by word
  const [displayed, setDisplayed] = useState(msg.isTyping ? '' : msg.content);
  useEffect(() => {
    if (!msg.isTyping || !isLast) {
      setDisplayed(msg.content);
      return;
    }
    if (typeof msg.typedLen === 'number') {
      const chars = msg.content.slice(0, msg.typedLen);
      setDisplayed(chars);
    }
  }, [msg.content, msg.typedLen, msg.isTyping, isLast]);

  return (
    <div
      className="bot-msg"
      style={{
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        gap: 8, marginBottom: 12, alignItems: 'flex-start',
      }}
    >
      {/* Avatar */}
      {!isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: `radial-gradient(circle at 35% 35%, ${accent}CC, #9B59FFCC)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 800, color: '#fff',
          fontFamily: "'Syne',sans-serif", border: `1.5px solid ${accent}44`,
        }}>
          <Cpu size={14} color={accent} />
        </div>
      )}

      <div style={{ maxWidth: '82%', minWidth: 0 }}>
        {/* Thinking / scanning animation */}
        {msg.type === 'scanning' && msg.isTyping && (
          <ThinkingBubble isDailyPlan={msg.content === 'daily_plan'} accent={accent} />
        )}

        {/* Scan results (injected for daily_plan) */}
        {msg.scanResults && msg.scanResults.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            {msg.scanResults.map((s, i) => (
              <ScanCard key={s.module} scan={s} delay={i * 500} />
            ))}
          </div>
        )}

        {/* Action form — render instead of text bubble */}
        {msg.type === 'action_form' && msg.formFields && msg.formFields.length > 0 && (
          <>
            {msg.content && (
              <div style={{ marginBottom:8, padding:'8px 12px', background:'rgba(255,255,255,.03)', border:`1px solid ${accent}12`, borderRadius:'4px 14px 4px 14px' }}>
                <p style={{ margin:0, fontSize:12, color:'#94a3b8', fontFamily:"'Syne',sans-serif" }}>{msg.content}</p>
              </div>
            )}
            <ActionFormCard
              action={msg.actionType ?? ''}
              fields={msg.formFields}
              accent={accent}
              onSubmit={onSubmitForm ?? (() => {})}
            />
          </>
        )}

        {/* Leave balance card */}
        {msg.type === 'leave_balance' && msg.data && (
          <>
            {msg.content && (
              <div style={{ marginBottom:8, padding:'8px 12px', background:'rgba(255,255,255,.03)', border:`1px solid ${accent}12`, borderRadius:'4px 14px 4px 14px' }}>
                <p style={{ margin:0, fontSize:12, color:'#94a3b8', fontFamily:"'Syne',sans-serif" }}>{msg.content}</p>
              </div>
            )}
            <LeaveBalanceCard data={msg.data} accent={accent} />
          </>
        )}

        {/* Action executed card */}
        {msg.type === 'action_executed' && (
          <ActionExecutedCard data={msg.data ?? null} content={msg.content} />
        )}

        {/* Data response card */}
        {msg.type === 'data_response' && msg.content && (
          <div className={msg.isTyping && isLast ? 'bot-cursor' : ''}>
            <DataResponseCard content={displayed} data={msg.data ?? null} accent={accent} />
          </div>
        )}

        {/* Main text bubble */}
        {msg.type !== 'scanning' && msg.type !== 'action_form' && msg.type !== 'leave_balance' && msg.type !== 'action_executed' && msg.type !== 'data_response' && msg.content && (
          <div style={{
            background: isUser
              ? `linear-gradient(135deg, ${accent}30, #9B59FF28)`
              : 'rgba(255,255,255,.05)',
            border: `1px solid ${isUser ? `${accent}35` : `${accent}10`}`,
            borderRadius: isUser ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
            padding: '10px 14px',
            marginBottom: msg.todoItems && msg.todoItems.length > 0 ? 8 : 0,
          }}>
            {isUser ? (
              <p style={{
                margin: 0, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                color: '#E2E8F0', fontFamily: "'Syne', sans-serif", wordBreak: 'break-word',
              }}>
                {displayed}
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: '#D1D9E6', fontFamily: "'Syne', sans-serif" }}
                className={msg.isTyping && isLast ? 'bot-cursor' : ''}>
                <FormattedText text={displayed} accent={accent} />
              </p>
            )}
          </div>
        )}

        {/* Daily plan todo list */}
        {msg.todoItems && msg.todoItems.length > 0 && (
          <div style={{
            background: 'rgba(255,255,255,.03)',
            border: `1px solid ${accent}18`,
            borderRadius: '4px 14px 14px 14px',
            padding: '10px 10px 12px',
            marginTop: 4,
          }}>
            <TodoPlanView items={msg.todoItems} onSaved={onSaveTodos} accent={accent} />
          </div>
        )}

        {/* Time entry confirmation card */}
        {msg.type === 'time_entry_created' && msg.data && (
          <TimeEntryCard data={msg.data} accent={accent} />
        )}
      </div>
    </div>
  );
}

// ─── Customize Modal ──────────────────────────────────────────────────────────

function CustomizeModal({ profile, onSave, onLiveChange, onClose }: {
  profile:      BotProfile;
  onSave:       (p: BotProfile) => void;
  onLiveChange: (p: Partial<BotProfile>) => void;
  onClose:      () => void;
}) {
  const [form, setForm] = useState<BotProfile>({ ...profile });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const openFilePicker = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fileRef.current?.click();
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      // Resize to 400×400 via canvas, then upload to Stratus
      const img = new window.Image();
      img.onload = async () => {
        try {
          const SIZE   = 400;
          const canvas = document.createElement('canvas');
          canvas.width  = SIZE;
          canvas.height = SIZE;
          const ctx  = canvas.getContext('2d');
          if (!ctx) throw new Error('canvas unavailable');
          const side = Math.min(img.width, img.height);
          const sx   = (img.width  - side) / 2;
          const sy   = (img.height - side) / 2;
          ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
          // Get base64 without the data-URI prefix
          const dataUrlResized = canvas.toDataURL('image/jpeg', 0.85);
          const base64 = dataUrlResized.split(',')[1];

          // Upload to Stratus via bot_service
          const result = await botApi.uploadAvatar({
            base64,
            content_type: 'image/jpeg',
            file_name:    `bot_avatar_${Date.now()}.jpg`,
          });
          setForm((f) => ({ ...f, bot_avatar_url: result.url }));
        } catch (err) {
          console.error('[BotWidget] avatar upload failed:', err);
          setSaveError('Avatar upload failed — please try again');
        } finally {
          setUploading(false);
        }
      };
      img.onerror = () => setUploading(false);
      img.src = dataUrl;
    };
    reader.onerror = () => setUploading(false);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const updated = await botApi.updateProfile(form);
      onSave(updated || form);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } }; message?: string })
        ?.response?.data?.message || (err as Error)?.message || 'Save failed';
      setSaveError(msg);
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 10, boxSizing: 'border-box',
    background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
    color: '#E2E8F0', fontSize: 13, fontFamily: "'Syne', sans-serif",
    outline: 'none', transition: 'border 0.2s',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={(e) => e.stopPropagation()}>
      <div
        className="bot-widget-panel"
        style={{ width: 340, padding: 24, fontFamily: "'Syne', sans-serif" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <h2 style={{ margin:0, fontSize:16, fontWeight:800, color: form.bot_accent_color || '#00F5FF', letterSpacing:'-0.5px' }}>
            Customize Assistant
          </h2>
          <button type="button" onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#64748B' }}>
            <X size={16} />
          </button>
        </div>

        {/* Avatar */}
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20 }}>
          <div
            onClick={openFilePicker}
            style={{
              width:56, height:56, borderRadius:'50%', cursor:'pointer', flexShrink:0,
              background: form.bot_avatar_url
                ? `url(${form.bot_avatar_url}) center/cover no-repeat`
                : `radial-gradient(circle at 35% 35%, ${form.bot_accent_color}CC, #9B59FFCC)`,
              border: `2px solid ${form.bot_accent_color}44`,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:22, fontWeight:800, color:'#fff',
              position:'relative',
            }}
          >
            {!form.bot_avatar_url && (form.bot_name?.[0] || 'A')}
            {uploading && (
              <div style={{ position:'absolute', inset:0, borderRadius:'50%', background:'rgba(0,0,0,.6)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Loader2 size={18} color="#fff" style={{ animation:'bot-spin 1s linear infinite' }} />
              </div>
            )}
          </div>
          <div>
            <p style={{ margin:'0 0 4px', fontSize:12, color:'#64748B', fontFamily:"'JetBrains Mono',monospace" }}>Bot Avatar</p>
            <button type="button"
              onClick={openFilePicker}
              style={{
                padding:'5px 12px', borderRadius:8, background:'rgba(255,255,255,.07)',
                border:'1px solid rgba(255,255,255,.12)', color:'#E2E8F0',
                fontSize:11, cursor:'pointer', fontFamily:"'Syne',sans-serif", fontWeight:600,
              }}
            >
              Upload Image
            </button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleFile} />
          </div>
        </div>

        {/* Name */}
        <div style={{ marginBottom:14 }}>
          <label style={{ display:'block', fontSize:10, color:'#64748B', fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:6 }}>
            Bot Name
          </label>
          <input
            style={inputStyle}
            value={form.bot_name}
            onChange={(e) => setForm((f) => ({ ...f, bot_name: e.target.value }))}
            placeholder="ARIA"
            maxLength={50}
          />
        </div>

        {/* Accent color */}
        <div style={{ marginBottom:14 }}>
          <label style={{ display:'block', fontSize:10, color:'#64748B', fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:6 }}>
            Accent Color
          </label>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <input
              type="color"
              value={form.bot_accent_color || '#00F5FF'}
              onChange={(e) => {
                setForm((f) => ({ ...f, bot_accent_color: e.target.value }));
                onLiveChange({ bot_accent_color: e.target.value });
              }}
              style={{ width:40, height:34, borderRadius:8, border:'none', cursor:'pointer', background:'none', padding:2 }}
            />
            <input
              style={{ ...inputStyle, flex:1 }}
              value={form.bot_accent_color || '#00F5FF'}
              onChange={(e) => {
                setForm((f) => ({ ...f, bot_accent_color: e.target.value }));
                onLiveChange({ bot_accent_color: e.target.value });
              }}
              placeholder="#00F5FF"
              maxLength={20}
            />
          </div>
        </div>

        {/* Personality */}
        <div style={{ marginBottom:20 }}>
          <label style={{ display:'block', fontSize:10, color:'#64748B', fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:8 }}>
            Personality
          </label>
          <div style={{ display:'flex', gap:8 }}>
            {(['FRIENDLY','PROFESSIONAL','CONCISE'] as const).map((p) => (
              <button type="button"
                key={p}
                onClick={() => setForm((f) => ({ ...f, bot_personality: p }))}
                style={{
                  flex:1, padding:'7px 4px', borderRadius:10, cursor:'pointer',
                  fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:11,
                  border: form.bot_personality === p
                    ? `1.5px solid ${form.bot_accent_color || '#00F5FF'}`
                    : '1.5px solid rgba(255,255,255,.1)',
                  background: form.bot_personality === p
                    ? `${form.bot_accent_color || '#00F5FF'}18`
                    : 'rgba(255,255,255,.04)',
                  color: form.bot_personality === p
                    ? (form.bot_accent_color || '#00F5FF')
                    : '#64748B',
                  transition:'all 0.2s ease',
                }}
              >
                {p === 'FRIENDLY' ? '😊' : p === 'PROFESSIONAL' ? '💼' : '⚡'} {p.slice(0,3)}
              </button>
            ))}
          </div>
        </div>

        {/* Save error */}
        {saveError && (
          <p style={{ margin:'0 0 10px', fontSize:11, color:'#ef4444', textAlign:'center', fontFamily:"'JetBrains Mono',monospace" }}>
            ⚠ {saveError}
          </p>
        )}

        {/* Save */}
        <button type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            width:'100%', padding:'10px 0', borderRadius:12,
            background: `linear-gradient(135deg, ${form.bot_accent_color || '#00F5FF'}33, #9B59FF33)`,
            border: `1px solid ${form.bot_accent_color || '#00F5FF'}55`,
            color: form.bot_accent_color || '#00F5FF',
            fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:13,
            cursor:'pointer', letterSpacing:'0.06em', transition:'all 0.2s ease',
          }}
        >
          {saving ? '⏳ Saving…' : '✨ Save Changes'}
        </button>
      </div>
    </div>
  );
}

// ─── Main BotWidget ───────────────────────────────────────────────────────────

export default function BotWidget() {
  const [isOpen,          setIsOpen]          = useState(false);
  const [messages,        setMessages]        = useState<ChatMessage[]>([]);
  const [input,           setInput]           = useState('');
  const [isThinking,      setIsThinking]      = useState(false);
  const [showCustomize,   setShowCustomize]   = useState(false);
  const [profile,         setProfile]         = useState<BotProfile>(DEFAULT_PROFILE);
  const [quickActions,    setQuickActions]    = useState<QuickAction[]>(DEFAULT_QUICK_ACTIONS);
  const [pendingTodos,    setPendingTodos]    = useState(0);
  const [stylesInjected,  setStylesInjected]  = useState(false);
  const [activeTab,       setActiveTab]       = useState<'chat' | 'todos'>('chat');
  const [allTodos,        setAllTodos]        = useState<BotTodoItem[]>([]);
  const [todosLoading,    setTodosLoading]    = useState(false);
  const [isRecording,     setIsRecording]     = useState(false);
  const [recordingText,   setRecordingText]   = useState('');
  const recognitionRef   = useRef<any>(null);
  const recordingTextRef = useRef('');
  const sessionId   = useRef(getOrCreateSessionId());
  const chatRef     = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Draggable orb
  const [orbPos, setOrbPos] = useState<{x:number;y:number}>(() => {
    try {
      const s = localStorage.getItem('bot-orb-pos');
      if (s) {
        const p = JSON.parse(s) as {x:number;y:number};
        const vw = window.innerWidth, vh = window.innerHeight;
        return {x:Math.max(8,Math.min(vw-56-8,p.x)), y:Math.max(8,Math.min(vh-56-8,p.y))};
      }
    } catch(_) {}
    return {x: window.innerWidth-56-24, y: window.innerHeight-56-24};
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef   = useRef<{mx:number;my:number;px:number;py:number;moved:boolean}|null>(null);
  const didDrag   = useRef(false);
  const isOpenRef = useRef(false);

  // Inject CSS once
  useEffect(() => {
    if (stylesInjected) return;
    const el = document.createElement('style');
    el.setAttribute('data-bot-styles', '1');
    el.textContent = BOT_STYLES;
    document.head.appendChild(el);
    setStylesInjected(true);
    return () => { el.remove(); };
  }, []);

  // Load profile + quick actions on mount
  useEffect(() => {
    (async () => {
      try {
        const [p, qa] = await Promise.allSettled([botApi.getProfile(), botApi.getQuickActions()]);
        if (p.status === 'fulfilled' && p.value?.bot_name) setProfile(p.value);
        if (qa.status === 'fulfilled' && qa.value?.actions?.length) setQuickActions(qa.value.actions);
      } catch (_) {}
    })();
  }, []);

  // Keep isOpen readable inside drag closure
  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);

  // Drag-to-move + edge-snap
  useEffect(() => {
    const getPos = (e: MouseEvent | TouchEvent) =>
      'touches' in e
        ? { x: (e as TouchEvent).touches[0].clientX, y: (e as TouchEvent).touches[0].clientY }
        : { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };

    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragRef.current || isOpenRef.current) return;
      const { x, y } = getPos(e);
      const dx = x - dragRef.current.mx;
      const dy = y - dragRef.current.my;
      if (!dragRef.current.moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      dragRef.current.moved = true;
      if ('touches' in e) (e as TouchEvent).preventDefault();
      setOrbPos({
        x: Math.max(8, Math.min(window.innerWidth  - ORB_SIZE - 8, dragRef.current.px + dx)),
        y: Math.max(8, Math.min(window.innerHeight - ORB_SIZE - 8, dragRef.current.py + dy)),
      });
    };

    const onUp = () => {
      if (!dragRef.current) return;
      const moved = dragRef.current.moved;
      dragRef.current = null;
      setIsDragging(false);
      if (moved) {
        didDrag.current = true;
        setTimeout(() => { didDrag.current = false; }, 80);
        setOrbPos((prev) => {
          const snapX = (prev.x + ORB_SIZE / 2) < window.innerWidth / 2
            ? 8 : window.innerWidth - ORB_SIZE - 8;
          const snapped = { x: snapX, y: Math.max(8, Math.min(window.innerHeight - ORB_SIZE - 8, prev.y)) };
          localStorage.setItem('bot-orb-pos', JSON.stringify(snapped));
          return snapped;
        });
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend',  onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend',  onUp);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onOrbPointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (isOpen) return;
    const src = 'touches' in e ? (e as React.TouchEvent).touches[0] : (e as React.MouseEvent);
    dragRef.current = { mx: src.clientX, my: src.clientY, px: orbPos.x, py: orbPos.y, moved: false };
    setIsDragging(true);
  };

  // Load todos whenever the panel opens
  const loadTodos = useCallback(async () => {
    setTodosLoading(true);
    try {
      const data = await botApi.getTodos();
      if (data?.todos) setAllTodos(data.todos);
    } catch (_) {
    } finally {
      setTodosLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) loadTodos();
  }, [isOpen, loadTodos]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  const accent = profile.bot_accent_color || '#00F5FF';
  const pendingCount = allTodos.filter((t) => String(t.is_completed) !== 'true').length;

  // Keep recordingTextRef in sync so the onend closure reads the latest transcript
  useEffect(() => { recordingTextRef.current = recordingText; }, [recordingText]);

  // Animate assistant message word by word
  const animateTyping = useCallback((id: string, fullText: string) => {
    let pos = 0;
    const step = () => {
      pos = Math.min(pos + 4, fullText.length); // reveal 4 chars per tick
      setMessages((prev) =>
        prev.map((m) => m.id === id ? { ...m, typedLen: pos } : m)
      );
      if (pos < fullText.length) {
        typingTimer.current = setTimeout(step, 20);
      } else {
        setMessages((prev) => prev.map((m) => m.id === id ? { ...m, isTyping: false } : m));
      }
    };
    step();
  }, []);

  // Send a message
  const sendMessage = useCallback(async (text: string, messageType: string = 'text', displayMessage?: string) => {
    if (!text.trim() || isThinking) return;

    const isDailyPlan = messageType === 'daily_plan' || text.toLowerCase().includes('daily plan');

    // Add user message (show displayMessage in chat for action_submit, raw text otherwise)
    const userMsgId = genId();
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', type: 'text', content: displayMessage || text },
    ]);
    setInput('');
    setIsThinking(true);

    // Add scanning placeholder — content flags the animation type
    const thinkingId = genId();
    setMessages((prev) => [
      ...prev,
      { id: thinkingId, role: 'assistant', type: 'scanning', content: isDailyPlan ? 'daily_plan' : '', isTyping: true },
    ]);

    try {
      const resp = await botApi.sendMessage({
        session_id:   sessionId.current,
        message:      text,
        message_type: messageType,
      });

      // Remove scanning placeholder, add real response
      const replyId  = genId();
      const respType = (resp.message_type || 'text') as MessageType;
      // For structural cards skip the typing animation
      const skipTyping = ['action_form', 'action_executed', 'leave_balance', 'time_entry_created'].includes(respType);
      const formFields = respType === 'action_form' ? (resp.data as any)?.fields as ActionField[] : undefined;
      const actionType = respType === 'action_form' ? (resp.data as any)?.action as string : undefined;

      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== thinkingId);
        return [
          ...filtered,
          {
            id:          replyId,
            role:        'assistant' as const,
            type:        respType,
            content:     resp.reply || '',
            scanResults: resp.scan_results?.length ? resp.scan_results : undefined,
            todoItems:   resp.items?.length ? resp.items : undefined,
            data:        resp.data,
            formFields,
            actionType,
            isTyping:    !skipTyping,
            typedLen:    skipTyping ? undefined : 0,
          },
        ];
      });

      // After a daily plan: reload the todos list and jump to Todos tab
      if (resp.items?.length) {
        setPendingTodos((n) => n + resp.items.length);
        try {
          const td = await botApi.getTodos();
          if (td?.todos) setAllTodos(td.todos);
        } catch (_) {}
        setActiveTab('todos');
      }

      if (!skipTyping) animateTyping(replyId, resp.reply || '');
    } catch (err) {
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== thinkingId);
        return [
          ...filtered,
          {
            id:      genId(),
            role:    'assistant',
            type:    'text',
            content: "Oops — I couldn't connect to the server. Please check that the bot service is running and try again.",
          },
        ];
      });
    } finally {
      setIsThinking(false);
    }
  }, [isThinking, animateTyping]);

  // Voice recording via Web Speech API
  const startRecording = useCallback(() => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;
    const rec = new SpeechRec();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    rec.onresult = (event: any) => {
      const transcript = Array.from(event.results as any[])
        .map((r: any) => r[0].transcript)
        .join('');
      setRecordingText(transcript);
    };
    rec.onend = () => {
      setIsRecording(false);
      const text = recordingTextRef.current.trim();
      setRecordingText('');
      if (text) sendMessage(text, 'text'); // plain text so LLM uses full conversation context
    };
    rec.onerror = () => { setIsRecording(false); setRecordingText(''); };
    recognitionRef.current = rec;
    rec.start();
    setIsRecording(true);
  }, [sendMessage]);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const handleQuickAction = (qa: QuickAction) => {
    const isDP = qa.prompt_template === 'daily_plan';
    sendMessage(qa.label, isDP ? 'daily_plan' : 'text');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const handleOpen = () => {
    setIsOpen(true);
    setPendingTodos(0);
    setTimeout(() => inputRef.current?.focus(), 300);
  };

  // Panel anchors relative to current orb position
  const openRight = (orbPos.x + ORB_SIZE / 2) < window.innerWidth / 2;
  const panelLeft = openRight
    ? Math.min(orbPos.x + ORB_SIZE + 8, window.innerWidth  - PANEL_W - 8)
    : Math.max(8, orbPos.x - PANEL_W - 8);
  const panelTop  = Math.max(8, Math.min(
    window.innerHeight - PANEL_H - 8,
    orbPos.y + ORB_SIZE / 2 - PANEL_H / 2,
  ));

  return (
    <>
      {/* ── Expanded Panel (positioned independently of orb) ── */}
      {isOpen && (
        <div
          className="bot-widget-panel"
          style={{
            position: 'fixed', left: panelLeft, top: panelTop,
            width: PANEL_W, height: PANEL_H,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            zIndex: 99999,
          }}
        >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '13px 16px',
              borderBottom: `1px solid ${accent}18`,
              flexShrink: 0,
              background: `linear-gradient(135deg, ${accent}10, rgba(155,89,255,.08), ${accent}06)`,
              backgroundSize: '200% 100%',
            }}>
              <BotOrb profile={profile} size={34} isOpen={true} />
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{
                  margin:0, fontWeight:800, fontSize:15, color: accent,
                  fontFamily:"'Syne',sans-serif", letterSpacing:'-0.4px', lineHeight:1.2,
                }}>{profile.bot_name || 'ARIA'}</p>
                <p style={{ margin:'2px 0 0', fontSize:9, fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.07em', display:'flex', alignItems:'center', gap:4 }}>
                  {isThinking ? (
                    <>
                      <span style={{ width:5, height:5, borderRadius:'50%', background:accent, display:'inline-block', animation:'bot-blink 0.7s ease-in-out infinite' }} />
                      <span style={{ color: accent }}>THINKING…</span>
                    </>
                  ) : (
                    <>
                      <span style={{ width:5, height:5, borderRadius:'50%', background:'#10b981', display:'inline-block' }} />
                      <span style={{ color:'#10b981' }}>ONLINE</span>
                    </>
                  )}
                </p>
              </div>
              <button type="button"
                onClick={() => setShowCustomize(true)}
                title="Customize"
                style={{ background:'none', border:'none', cursor:'pointer', color:'#475569', padding:4,
                  transition:'color 0.2s' }}
              >
                <Settings size={15} />
              </button>
              <button type="button"
                onClick={() => setIsOpen(false)}
                style={{ background:'none', border:'none', cursor:'pointer', color:'#475569', padding:4 }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Tab bar */}
            <div style={{
              display: 'flex', flexShrink: 0,
              borderBottom: `1px solid ${accent}14`,
              background: 'rgba(0,0,0,.1)',
            }}>
              {(['chat', 'todos'] as const).map((tab) => {
                const isActive = activeTab === tab;
                const label    = tab === 'chat' ? '💬 Chat' : `📌 Todos${pendingCount > 0 ? ` · ${pendingCount}` : ''}`;
                return (
                  <button type="button" key={tab} onClick={() => setActiveTab(tab)} style={{
                    flex: 1, padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer',
                    borderBottom: isActive ? `2px solid ${accent}` : '2px solid transparent',
                    color: isActive ? accent : '#64748B',
                    fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 11,
                    letterSpacing: '0.04em', transition: 'all 0.2s',
                  }}>{label}</button>
                );
              })}
            </div>

            {/* Chat area (shown when activeTab === 'chat') */}
            {activeTab === 'chat' && (
              <>
                <div
                  ref={chatRef}
                  style={{
                    flex: 1, overflowY: 'auto', padding: '16px 14px 8px',
                    scrollbarWidth: 'thin',
                    scrollbarColor: `${accent}22 transparent`,
                  }}
                >
                  {messages.length === 0 && (
                    <div style={{ textAlign:'center', paddingTop:28 }}>
                      <BotOrb profile={profile} size={60} isOpen={true} />
                      <p style={{ marginTop:14, fontSize:16, fontWeight:800, color: accent, fontFamily:"'Syne',sans-serif", letterSpacing:'-0.3px' }}>
                        Hey! I'm {profile.bot_name || 'ARIA'} ✨
                      </p>
                      <p style={{ fontSize:11, color:'#64748B', fontFamily:"'JetBrains Mono',monospace", margin:'4px 0 20px' }}>
                        Your AI work assistant — ask me anything about your work.
                      </p>
                      {/* Suggested topic pills */}
                      <div style={{ display:'flex', flexWrap:'wrap', gap:6, justifyContent:'center', padding:'0 16px' }}>
                        {[
                          { icon:'⏱', label:'Time logged today', q:'How much time did I log today?' },
                          { icon:'🌴', label:'Leave balance',     q:"What's my leave balance?" },
                          { icon:'📌', label:'Pending tasks',    q:'Show me my pending tasks.' },
                          { icon:'✅', label:'Attendance',        q:'What is my attendance this week?' },
                          { icon:'📊', label:'Sprint status',    q:'What is my current sprint status?' },
                          { icon:'🗣', label:'Submit standup',   q:'I want to submit my standup.' },
                        ].map((s) => (
                          <button key={s.label} type="button"
                            onClick={() => sendMessage(s.q)}
                            style={{
                              padding:'5px 11px', borderRadius:100, cursor:'pointer',
                              background:`${accent}10`, border:`1px solid ${accent}25`,
                              color:'#94a3b8', fontSize:11, fontFamily:"'Syne',sans-serif", fontWeight:600,
                              transition:'all 0.2s ease', whiteSpace:'nowrap',
                            }}
                          >
                            {s.icon} {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {messages.map((msg, i) => (
                    <ChatBubble
                      key={msg.id}
                      msg={msg}
                      isLast={i === messages.length - 1}
                      accent={accent}
                      onSaveTodos={() => setPendingTodos(0)}
                      onSubmitForm={(action, data, summary) =>
                        sendMessage(JSON.stringify({ action, ...data }), 'action_submit', summary)
                      }
                    />
                  ))}
                </div>

                {/* Quick action pills */}
                <div style={{
                  padding: '7px 10px',
                  borderTop: `1px solid ${accent}10`,
                  overflowX: 'auto',
                  display: 'flex', gap: 6, flexShrink: 0,
                  background: 'rgba(0,0,0,.2)',
                  scrollbarWidth: 'none',
                }}>
                  <style>{`.bot-qa-scroll::-webkit-scrollbar{display:none}`}</style>
                  {quickActions.slice(0, 8).map((qa) => (
                    <button type="button"
                      key={qa.label}
                      className="bot-qa-chip"
                      onClick={() => handleQuickAction(qa)}
                      disabled={isThinking}
                      style={{
                        flexShrink: 0, padding: '5px 11px', borderRadius: 100,
                        background: `${accent}12`, border: `1px solid ${accent}28`,
                        color: '#94a3b8', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
                        fontFamily: "'Syne', sans-serif", fontWeight: 600,
                        transition: 'all 0.2s ease',
                        opacity: isThinking ? 0.35 : 1,
                        pointerEvents: isThinking ? 'none' : 'auto',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <span style={{ fontSize: 13 }}>{qa.icon}</span>
                      <span>{qa.label}</span>
                    </button>
                  ))}
                </div>

                {/* Voice recording overlay */}
                {isRecording && (
                  <div style={{
                    padding: '7px 14px',
                    borderTop: '1px solid rgba(239,68,68,.2)',
                    flexShrink: 0,
                    background: 'rgba(239,68,68,.05)',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <div style={{ display:'flex', gap:2, alignItems:'center', height:16 }}>
                      {[0,1,2,3,4].map((i) => (
                        <div key={i} style={{
                          width: 3, height: 14, borderRadius: 2,
                          background: '#ef4444', transformOrigin:'center',
                          animation: `bot-wave-bar 0.55s ease-in-out infinite`,
                          animationDelay: `${i * 0.1}s`,
                        }} />
                      ))}
                    </div>
                    <span style={{ flex:1, fontSize:11, color: recordingText ? '#E2E8F0' : '#ef4444', fontFamily:"'Syne',monospace", overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontStyle: recordingText ? 'normal' : 'italic' }}>
                      {recordingText || 'Listening…'}
                    </span>
                    <span style={{ fontSize:9, color:'rgba(239,68,68,.5)', fontFamily:"'JetBrains Mono',monospace", flexShrink:0 }}>tap mic to finish</span>
                  </div>
                )}

                {/* Input row */}
                <div style={{
                  display: 'flex', gap: 7, padding: '10px 12px',
                  borderTop: `1px solid ${accent}12`,
                  flexShrink: 0,
                  background: `linear-gradient(to top, rgba(0,0,0,.35), rgba(0,0,0,.15))`,
                }}>
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isRecording ? 'Listening for voice input…' : 'Ask anything about your work…'}
                    disabled={isThinking || isRecording}
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: 12,
                      border: `1px solid ${isRecording ? 'rgba(239,68,68,.4)' : input.trim() ? `${accent}35` : `${accent}18`}`,
                      background: 'rgba(255,255,255,.05)', color: '#E2E8F0',
                      fontSize: 13, outline: 'none',
                      fontFamily: "'Syne', sans-serif",
                      transition: 'border 0.2s, box-shadow 0.2s',
                      opacity: isThinking ? 0.5 : 1,
                      boxShadow: input.trim() && !isThinking ? `0 0 0 3px ${accent}10` : 'none',
                    }}
                  />
                  <button type="button"
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim() || isThinking || isRecording}
                    style={{
                      width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                      background: input.trim() && !isThinking && !isRecording
                        ? `linear-gradient(135deg, ${accent}AA, #9B59FFAA)`
                        : 'rgba(255,255,255,.06)',
                      border: `1px solid ${input.trim() && !isThinking && !isRecording ? `${accent}44` : 'rgba(255,255,255,.08)'}`,
                      cursor: input.trim() && !isThinking && !isRecording ? 'pointer' : 'not-allowed',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {isThinking
                      ? <Loader2 size={16} color={accent} style={{ animation:'bot-spin 1s linear infinite' }} />
                      : <Send size={15} color={input.trim() && !isRecording ? '#fff' : '#475569'} />
                    }
                  </button>
                  <button type="button"
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isThinking}
                    title={isRecording ? 'Stop recording' : 'Record voice time entry'}
                    style={{
                      width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                      background: isRecording ? 'rgba(239,68,68,.2)' : 'rgba(255,255,255,.06)',
                      border: `1px solid ${isRecording ? 'rgba(239,68,68,.5)' : 'rgba(255,255,255,.08)'}`,
                      cursor: isThinking ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.2s ease',
                      animation: isRecording ? 'bot-mic-pulse 1.5s ease-in-out infinite' : 'none',
                      opacity: isThinking ? 0.4 : 1,
                    }}
                  >
                    {isRecording
                      ? <MicOff size={15} color="#ef4444" />
                      : <Mic size={15} color="#64748B" />
                    }
                  </button>
                </div>
              </>
            )}

            {/* Todos tab (shown when activeTab === 'todos') */}
            {activeTab === 'todos' && (
              <TodosTab
                todos={allTodos}
                loading={todosLoading}
                accent={accent}
                onRefresh={loadTodos}
              />
            )}
          </div>
        )}

      {/* ── Draggable Orb ── */}
      <div
        onMouseDown={onOrbPointerDown}
        onTouchStart={onOrbPointerDown as React.TouchEventHandler}
        style={{
          position: 'fixed', left: orbPos.x, top: orbPos.y,
          zIndex: 99998,
          cursor: isDragging ? 'grabbing' : (isOpen ? 'default' : 'grab'),
          transition: isDragging ? 'none' : 'left 0.35s cubic-bezier(0.34,1.56,0.64,1), top 0.2s ease',
          userSelect: 'none', touchAction: 'none',
        }}
      >
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
          <BotOrb
            profile={profile}
            size={ORB_SIZE}
            onClick={() => { if (!didDrag.current) { isOpen ? setIsOpen(false) : handleOpen(); } }}
            unread={pendingTodos}
            isOpen={isOpen}
          />
          {!isOpen && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: '#64748B',
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>
              {profile.bot_name || 'ARIA'}
            </span>
          )}
        </div>
      </div>

      {/* Customize Modal */}
      {showCustomize && (
        <CustomizeModal
          profile={profile}
          onSave={(p) => { setProfile(p); setShowCustomize(false); }}
          onLiveChange={(p) => setProfile((prev) => ({ ...prev, ...p }))}
          onClose={() => { setProfile((p) => ({ ...p })); setShowCustomize(false); }}
        />
      )}
    </>
  );
}
