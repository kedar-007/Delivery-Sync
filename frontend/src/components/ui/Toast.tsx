import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, AlertCircle, Info, X, Loader2 } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info' | 'warning' | 'loading';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  toast: {
    success: (msg: string, duration?: number) => string;
    error:   (msg: string, duration?: number) => string;
    info:    (msg: string, duration?: number) => string;
    warning: (msg: string, duration?: number) => string;
    loading: (msg: string) => string;
    dismiss: (id: string) => void;
    update:  (id: string, type: ToastType, msg: string) => void;
  };
}

const ToastContext = createContext<ToastContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const add = useCallback((type: ToastType, message: string, duration = 3500): string => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev.slice(-4), { id, type, message, duration }]);
    if (type !== 'loading') {
      const t = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, t);
    }
    return id;
  }, [dismiss]);

  const update = useCallback((id: string, type: ToastType, message: string) => {
    const old = timers.current.get(id);
    if (old) { clearTimeout(old); timers.current.delete(id); }
    setToasts((prev) => prev.map((x) => x.id === id ? { ...x, type, message } : x));
    const t = setTimeout(() => dismiss(id), 3500);
    timers.current.set(id, t);
  }, [dismiss]);

  useEffect(() => {
    const ref = timers.current;
    return () => { ref.forEach((t) => clearTimeout(t)); };
  }, []);

  const toast = {
    success: (msg: string, d?: number) => add('success', msg, d),
    error:   (msg: string, d?: number) => add('error',   msg, d ?? 5000),
    info:    (msg: string, d?: number) => add('info',    msg, d),
    warning: (msg: string, d?: number) => add('warning', msg, d),
    loading: (msg: string)             => add('loading', msg),
    dismiss,
    update,
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <ToastList toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx.toast;
};

// ── Individual Toast ──────────────────────────────────────────────────────────

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={15} className="text-green-500 shrink-0" />,
  error:   <XCircle     size={15} className="text-red-500   shrink-0" />,
  warning: <AlertCircle size={15} className="text-amber-500 shrink-0" />,
  info:    <Info        size={15} className="text-blue-500  shrink-0" />,
  loading: <Loader2     size={15} className="text-indigo-500 shrink-0 animate-spin" />,
};

const BAR_COLOR: Record<ToastType, string> = {
  success: 'bg-green-500',
  error:   'bg-red-500',
  warning: 'bg-amber-500',
  info:    'bg-blue-500',
  loading: 'bg-indigo-500',
};

const ToastItem: React.FC<{ toast: Toast; onDismiss: (id: string) => void }> = ({ toast, onDismiss }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      role="alert"
      className={`relative flex items-start gap-3 w-80 bg-ds-surface border border-ds-border rounded-xl shadow-lg px-4 py-3 overflow-hidden transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      {/* Colored left accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${BAR_COLOR[toast.type]}`} />
      <div className="pl-1">{ICONS[toast.type]}</div>
      <p className="flex-1 text-sm text-ds-text leading-snug pt-0.5">{toast.message}</p>
      {toast.type !== 'loading' && (
        <button
          onClick={() => onDismiss(toast.id)}
          className="shrink-0 text-ds-text-muted hover:text-ds-text transition-colors mt-0.5"
          aria-label="Dismiss"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
};

// ── Toast List (portal-like, fixed position) ──────────────────────────────────

const ToastList: React.FC<{ toasts: Toast[]; onDismiss: (id: string) => void }> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
};
