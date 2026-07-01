import React from 'react';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
  /**
   * When false, the modal will NOT close from backdrop clicks or Esc — only
   * the X button (or the consumer's own Cancel buttons) can dismiss it. Use
   * this for forms with unsaved input where an accidental click outside
   * would lose the user's work.
   */
  closeOnBackdropClick?: boolean;
  closeButtonVariant?: 'default' | 'danger';
}

const sizeMap = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  '2xl': 'max-w-4xl',
  '3xl': 'max-w-5xl',
  '4xl': 'max-w-7xl',
};

const Modal = ({ open, onClose, title, children, size = 'md', closeOnBackdropClick = true, closeButtonVariant = 'default' }: ModalProps) => (
  <Transition show={open}>
    <Dialog onClose={closeOnBackdropClick ? onClose : () => { /* dismiss disabled — use X button or explicit Cancel */ }} className="relative z-50">
      {/* Backdrop */}
      <TransitionChild
        enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100"
        leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0"
      >
        <div className="fixed inset-0 bg-black/40" />
      </TransitionChild>

      <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          {/* Panel */}
          <TransitionChild
            enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100"
            leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95"
          >
            <DialogPanel
              className={clsx(
                'w-full bg-ds-surface text-ds-text rounded-xl shadow-xl p-6',
                sizeMap[size]
              )}
            >
              {title && (
                <div className="flex items-center justify-between mb-5">
                  <DialogTitle className="text-base font-semibold text-ds-text">{title}</DialogTitle>
                  <button
                    onClick={onClose}
                    className={clsx(
                      'p-1.5 rounded-lg transition-colors',
                      closeButtonVariant === 'danger'
                        ? 'text-red-400 hover:text-red-600 hover:bg-red-50'
                        : 'text-ds-text-muted hover:text-ds-text hover:bg-ds-surface-hover'
                    )}
                  >
                    <X size={18} />
                  </button>
                </div>
              )}
              {children}
            </DialogPanel>
          </TransitionChild>
        </div>
      </div>
    </Dialog>
  </Transition>
);

export const ModalActions = ({ children }: { children: React.ReactNode }) => (
  <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-ds-border">{children}</div>
);

export default Modal;
