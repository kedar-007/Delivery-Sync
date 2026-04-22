import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { AlertTriangle, Trash2, ShieldOff, LogOut, Info, X } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type Variant = 'danger' | 'warning' | 'info';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: Variant;
}

interface ConfirmContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const ConfirmContext = createContext<ConfirmContextValue>({
  confirm: async () => false,
});

export const useConfirm = () => useContext(ConfirmContext);

// ── Variant config ────────────────────────────────────────────────────────────

const VARIANT_CONFIG: Record<Variant, {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  bar: string;
  btnClass: string;
}> = {
  danger: {
    icon: <Trash2 size={22} />,
    iconBg: 'bg-red-50 border-red-100',
    iconColor: 'text-red-500',
    bar: 'from-red-500 to-rose-600',
    btnClass: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
  },
  warning: {
    icon: <AlertTriangle size={22} />,
    iconBg: 'bg-amber-50 border-amber-100',
    iconColor: 'text-amber-500',
    bar: 'from-amber-400 to-orange-500',
    btnClass: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
  },
  info: {
    icon: <Info size={22} />,
    iconBg: 'bg-blue-50 border-blue-100',
    iconColor: 'text-blue-500',
    bar: 'from-blue-500 to-indigo-600',
    btnClass: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
  },
};

// ── Dialog component ──────────────────────────────────────────────────────────

interface DialogState extends ConfirmOptions {
  resolve: (v: boolean) => void;
}

const Dialog = ({ state, onClose }: { state: DialogState; onClose: (v: boolean) => void }) => {
  const cfg = VARIANT_CONFIG[state.variant ?? 'danger'];
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(false);
      if (e.key === 'Enter') onClose(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={() => onClose(false)}
      />

      {/* Card */}
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-2 duration-200">
        {/* Coloured top bar */}
        <div className={`h-1 w-full bg-gradient-to-r ${cfg.bar}`} />

        {/* Close button */}
        <button
          onClick={() => onClose(false)}
          className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <X size={14} />
        </button>

        <div className="p-6">
          {/* Icon */}
          <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center mx-auto mb-4 ${cfg.iconBg} ${cfg.iconColor}`}>
            {cfg.icon}
          </div>

          {/* Text */}
          <h2 className="text-base font-bold text-gray-900 text-center mb-2">{state.title}</h2>
          <p className="text-sm text-gray-500 text-center leading-relaxed">{state.message}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={() => onClose(false)}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
          >
            {state.cancelText ?? 'Cancel'}
          </button>
          <button
            ref={confirmRef}
            onClick={() => onClose(true)}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${cfg.btnClass}`}
          >
            {state.confirmText ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Provider ──────────────────────────────────────────────────────────────────

export const ConfirmProvider = ({ children }: { children: React.ReactNode }) => {
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> =>
    new Promise((resolve) => {
      setDialog({ ...opts, resolve });
    }),
  []);

  const handleClose = useCallback((value: boolean) => {
    dialog?.resolve(value);
    setDialog(null);
  }, [dialog]);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {dialog && <Dialog state={dialog} onClose={handleClose} />}
    </ConfirmContext.Provider>
  );
};
