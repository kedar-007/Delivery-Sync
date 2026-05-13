import React, { ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
}

// Secondary / ghost / outline variants now resolve through the theme tokens
// so the buttons stay visible on dark surfaces (Midnight / Aurora) — the
// previous bg-gray-100 / text-gray-700 combo was invisible there.
const variantClasses: Record<Variant, string> = {
  primary:   'bg-blue-600 hover:bg-blue-700 text-white shadow-sm',
  secondary: 'bg-ds-surface-hover hover:bg-ds-surface-hover/80 text-ds-text border border-ds-border',
  danger:    'bg-red-600 hover:bg-red-700 text-white',
  ghost:     'hover:bg-ds-surface-hover text-ds-text-muted',
  outline:   'border border-ds-border hover:bg-ds-surface-hover text-ds-text',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, icon, children, className, disabled, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={clsx(
          'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...rest}
      >
        {loading ? (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : icon ? (
          <span className="shrink-0">{icon}</span>
        ) : null}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;
